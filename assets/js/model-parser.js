window.Wisky3D = window.Wisky3D || {};

// Suporte a Node.js: carrega DOMParser do @xmldom se disponível (testes)
if (typeof window.DOMParser === "undefined" && typeof require !== "undefined") {
  try {
    window.DOMParser = require("@xmldom/xmldom").DOMParser;
  } catch (e) {
    // Ignorar se @xmldom não estiver instalado
  }
}

(function () {
// ---------------------------------------------------------------------------
// BLOCO: Parsing de modelos 3D (STL/3MF): volume, bounding box e densidade
// ---------------------------------------------------------------------------

  function signedVolumeOfTriangle(p1, p2, p3) {
    return (
      p1[0] * (p2[1] * p3[2] - p3[1] * p2[2]) -
      p1[1] * (p2[0] * p3[2] - p3[0] * p2[2]) +
      p1[2] * (p2[0] * p3[1] - p3[0] * p2[1])
    ) / 6.0;
  }

  function computeMeshVolumeMm3(triangulos) {
    var total = 0;
    for (var i = 0; i < triangulos.length; i++) {
      var t = triangulos[i];
      total += signedVolumeOfTriangle(t[0], t[1], t[2]);
    }
    return Math.abs(total);
  }

  function triangleAreaMm2(p1, p2, p3) {
    var ux = p2[0] - p1[0], uy = p2[1] - p1[1], uz = p2[2] - p1[2];
    var vx = p3[0] - p1[0], vy = p3[1] - p1[1], vz = p3[2] - p1[2];
    var cx = uy * vz - uz * vy;
    var cy = uz * vx - ux * vz;
    var cz = ux * vy - uy * vx;
    return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
  }

  // Área de superfície da malha (soma das áreas dos triângulos), usada pra
  // estimar o volume das paredes (casca), já que o volume total sozinho não
  // diferencia "parede sólida" de "miolo em infill".
  function computeMeshAreaMm2(triangulos) {
    var total = 0;
    for (var i = 0; i < triangulos.length; i++) {
      var t = triangulos[i];
      total += triangleAreaMm2(t[0], t[1], t[2]);
    }
    return total;
  }

  function computeBoundingBox(triangulos) {
    var min = [Infinity, Infinity, Infinity];
    var max = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < triangulos.length; i++) {
      for (var v = 0; v < 3; v++) {
        var p = triangulos[i][v];
        for (var eixo = 0; eixo < 3; eixo++) {
          if (p[eixo] < min[eixo]) min[eixo] = p[eixo];
          if (p[eixo] > max[eixo]) max[eixo] = p[eixo];
        }
      }
    }
    return {
      minX: min[0], minY: min[1], minZ: min[2],
      maxX: max[0], maxY: max[1], maxZ: max[2]
    };
  }

  function detectBinarySTL(buffer) {
    if (buffer.byteLength < 84) return false;
    var dv = new DataView(buffer);
    var triCount = dv.getUint32(80, true);
    var expectedSize = 84 + triCount * 50;
    return buffer.byteLength === expectedSize;
  }

  function parseBinarySTL(buffer) {
    var dv = new DataView(buffer);
    var triCount = dv.getUint32(80, true);
    var triangulos = [];
    var offset = 84;
    for (var i = 0; i < triCount; i++) {
      offset += 12; // normal
      var v1 = [dv.getFloat32(offset, true), dv.getFloat32(offset + 4, true), dv.getFloat32(offset + 8, true)];
      offset += 12;
      var v2 = [dv.getFloat32(offset, true), dv.getFloat32(offset + 4, true), dv.getFloat32(offset + 8, true)];
      offset += 12;
      var v3 = [dv.getFloat32(offset, true), dv.getFloat32(offset + 4, true), dv.getFloat32(offset + 8, true)];
      offset += 12;
      offset += 2; // attribute byte count
      triangulos.push([v1, v2, v3]);
    }
    return triangulos;
  }

  function parseAsciiSTL(text) {
    var triangulos = [];
    var re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
    var m, verts = [];
    while ((m = re.exec(text)) !== null) {
      verts.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
      if (verts.length === 3) { triangulos.push(verts); verts = []; }
    }
    return triangulos;
  }

  function parseSTL(buffer) {
    if (detectBinarySTL(buffer)) return parseBinarySTL(buffer);
    return parseAsciiSTL(new TextDecoder("utf-8").decode(buffer));
  }

  function contarOcorrencias(texto, trecho) {
    var n = 0;
    for (var i = texto.indexOf(trecho); i !== -1; i = texto.indexOf(trecho, i + trecho.length)) n++;
    return n;
  }

  // Quantos triângulos o STL tem, sem montar a malha: no binário vem no
  // cabeçalho; no ASCII, um por "endfacet".
  function contarTriangulosSTL(buffer) {
    if (detectBinarySTL(buffer)) return new DataView(buffer).getUint32(80, true);
    // Direto nos bytes: decodificar para texto aqui e de novo no parseSTL
    // dobraria a memória de um STL ASCII grande.
    var bytes = new Uint8Array(buffer);
    var alvo = [101, 110, 100, 102, 97, 99, 101, 116]; // "endfacet"
    var n = 0;
    for (var i = 0; i + alvo.length <= bytes.length; i++) {
      if (bytes[i] !== 101) continue;
      var k = 1;
      while (k < alvo.length && bytes[i + k] === alvo[k]) k++;
      if (k === alvo.length) { n++; i += alvo.length - 1; }
    }
    return n;
  }

  // Quantos <triangle> há nos .model do pacote, sem interpretar o XML nem
  // montar a malha, para recusar modelos grandes demais antes de alocar
  // milhões de arrays. É uma estimativa: um objeto usado por dois <item>
  // conta uma vez só. Lê um arquivo por vez para não manter todos os textos
  // em memória ao mesmo tempo. `rootXmlText`/`rootPath` (opcionais): o
  // 3dmodel.model raiz já lido, contado sem descompactar de novo.
  function contarTriangulos3MF(zip, rootXmlText, rootPath) {
    function contar(texto) {
      return contarOcorrencias(texto, "<triangle ") + contarOcorrencias(texto, "<triangle/");
    }
    var arquivos = zip.file(/\.model$/i).filter(function (arquivo) {
      return rootXmlText == null || arquivo.name !== rootPath;
    });
    return arquivos.reduce(function (promessa, arquivo) {
      return promessa.then(function (total) {
        return arquivo.async("text").then(function (texto) {
          return total + contar(texto);
        });
      });
    }, Promise.resolve(rootXmlText == null ? 0 : contar(rootXmlText)));
  }

  var TRANSFORM_IDENTIDADE = { M: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] };

  // Fator pra converter a unidade declarada no <model unit="..."> pra mm.
  // Fatiadores (Bambu/Orca) sempre gravam em mm, mas o padrão 3MF permite
  // outras unidades. Sem isso, um arquivo em "centimeter" sairia com
  // volume/peso 1000x menor que o real.
  var UNIDADE_PARA_MM = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };

  function parseTransformAttr(str) {
    if (!str) return TRANSFORM_IDENTIDADE;
    var n = str.trim().split(/\s+/).map(Number);
    if (n.length < 12 || n.some(isNaN)) return TRANSFORM_IDENTIDADE;
    return {
      M: [[n[0], n[3], n[6]], [n[1], n[4], n[7]], [n[2], n[5], n[8]]],
      t: [n[9], n[10], n[11]]
    };
  }

  function matMul3(A, B) {
    var R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) {
        R[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
      }
    }
    return R;
  }

  function matVec3(A, v) {
    return [
      A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2],
      A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2],
      A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]
    ];
  }

  // Compõe transform pai + filho: aplica o filho primeiro (espaço local do
  // componente), depois o pai (acumulado até aqui). É como o 3MF encadeia
  // transforms de <item> e <component> aninhados.
  function composeTransform(parent, child) {
    var M = matMul3(parent.M, child.M);
    var pmt = matVec3(parent.M, child.t);
    return { M: M, t: [pmt[0] + parent.t[0], pmt[1] + parent.t[1], pmt[2] + parent.t[2]] };
  }

  function applyTransform(p, tr) {
    var v = matVec3(tr.M, p);
    return [v[0] + tr.t[0], v[1] + tr.t[1], v[2] + tr.t[2]];
  }

  function parseXmlDoc(xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("xml inválido");
    return doc;
  }

  function directChild(el, tag) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 1 && n.nodeName.toLowerCase() === tag) return n;
    }
    return null;
  }

  function directChildren(el, tag) {
    var out = [];
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 1 && n.nodeName.toLowerCase() === tag) out.push(n);
    }
    return out;
  }

  // Carrega (com cache por path) o XML de um arquivo externo do pacote 3MF
  // referenciado por um atributo p:path (de <component> ou, no root model, do
  // próprio <item> de <build> — usado por fatiadores como Bambu Studio/Orca
  // quando cada object/chapa vive no seu próprio arquivo sob 3D/Objects/).
  function carregarDocExterno(zip, docCache, path) {
    var normalizedPath = path.replace(/^\//, "");
    var docPromise = docCache[normalizedPath];
    if (!docPromise) {
      var zipEntry = zip.file(normalizedPath);
      if (!zipEntry) return null;
      docPromise = zipEntry.async("text").then(parseXmlDoc);
      docCache[normalizedPath] = docPromise;
    }
    return { normalizedPath: normalizedPath, docPromise: docPromise };
  }

  function findObjectElement(doc, objectId) {
    var objects = doc.getElementsByTagName("object");
    for (var i = 0; i < objects.length; i++) {
      if (objects[i].getAttribute("id") === String(objectId)) return objects[i];
    }
    return null;
  }

  function bboxVazio() {
    return { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
  }

  function mergeBBox(a, b) {
    return {
      minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), minZ: Math.min(a.minZ, b.minZ),
      maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY), maxZ: Math.max(a.maxZ, b.maxZ)
    };
  }

  function estenderBBox(bbox, p) {
    if (p[0] < bbox.minX) bbox.minX = p[0];
    if (p[1] < bbox.minY) bbox.minY = p[1];
    if (p[2] < bbox.minZ) bbox.minZ = p[2];
    if (p[0] > bbox.maxX) bbox.maxX = p[0];
    if (p[1] > bbox.maxY) bbox.maxY = p[1];
    if (p[2] > bbox.maxZ) bbox.maxZ = p[2];
    return bbox;
  }

  // Travessia recursiva de um <object> do 3MF (mesh direta e/ou <components>
  // apontando pra outros objects, no mesmo arquivo ou em arquivos externos via
  // p:path, padrão usado por fatiadores como Bambu Studio/Orca em modelos
  // multi-peça), compartilhada entre resolveObjectGeometry (só agrega
  // volume/área/bbox) e resolveObjectTriangles (retém os triângulos de
  // verdade, pra ferramenta de colorir). Pra cada mesh-folha encontrada,
  // chama `onMesh(leafTriangles, localIndices, meshBbox, path, objectId,
  // rootObjectId)` com os triângulos já com transform acumulado aplicado;
  // quem chamou decide o que fazer com eles (somar agregados ou empilhar num
  // array de saída). `path` é o arquivo (dentro do zip) de onde o object
  // desse nível veio, repassado como está pra components locais e trocado
  // pelo p:path resolvido pra components externos. `rootObjectId` é o
  // objectid do build item de nível topo (o que aparece em <build><item>),
  // constante ao longo de toda a recursão por <components> — diferente de
  // `objectId`, que muda a cada nível e no leaf é o do object que de fato
  // contém a <mesh>. Precisamos dos dois porque model_settings.config
  // (chapas) referencia o build item de topo, enquanto a exportação
  // (ThreeMFWriter) precisa do objectId do object-folha pra achar o
  // <triangle> exato a recolorir. `componentesIgnorados` (Set de objectid,
  // opcional) vale só para os <component> deste nível: ver
  // parsePartesNaoSolidas.
  function resolveObjectRecursivo(zip, docCache, doc, objectId, accumTransform, path, onMesh, rootObjectId, componentesIgnorados) {
    var objectEl = findObjectElement(doc, objectId);
    if (!objectEl) return Promise.resolve();
    if (rootObjectId === undefined) rootObjectId = objectId;

    var meshEl = directChild(objectEl, "mesh");
    if (meshEl) {
      var verticesEl = directChild(meshEl, "vertices");
      var trianglesEl = directChild(meshEl, "triangles");
      var vertexEls = verticesEl ? directChildren(verticesEl, "vertex") : [];
      var meshBbox = bboxVazio();
      var vertices = vertexEls.map(function (v) {
        var p = applyTransform([
          parseFloat(v.getAttribute("x")),
          parseFloat(v.getAttribute("y")),
          parseFloat(v.getAttribute("z"))
        ], accumTransform);
        estenderBBox(meshBbox, p);
        return p;
      });
      var triEls = trianglesEl ? directChildren(trianglesEl, "triangle") : [];
      var leafTriangles = [];
      var localIndices = [];
      triEls.forEach(function (t, localIndex) {
        var i1 = parseInt(t.getAttribute("v1"), 10);
        var i2 = parseInt(t.getAttribute("v2"), 10);
        var i3 = parseInt(t.getAttribute("v3"), 10);
        if (vertices[i1] && vertices[i2] && vertices[i3]) {
          leafTriangles.push([vertices[i1], vertices[i2], vertices[i3]]);
          localIndices.push(localIndex);
        }
      });
      if (vertexEls.length) onMesh(leafTriangles, localIndices, meshBbox, path, objectId, rootObjectId);
    }

    var componentsEl = directChild(objectEl, "components");
    if (!componentsEl) return Promise.resolve();

    var componentes = directChildren(componentsEl, "component").filter(function (comp) {
      return !componentesIgnorados || !componentesIgnorados.has(comp.getAttribute("objectid"));
    });
    var promises = componentes.map(function (comp) {
      var childObjectId = comp.getAttribute("objectid");
      var childTransform = parseTransformAttr(comp.getAttribute("transform"));
      var combined = composeTransform(accumTransform, childTransform);
      var compPath = comp.getAttribute("p:path");

      if (compPath) {
        var externo = carregarDocExterno(zip, docCache, compPath);
        if (!externo) return Promise.resolve();
        return externo.docPromise.then(function (extDoc) {
          return resolveObjectRecursivo(zip, docCache, extDoc, childObjectId, combined, externo.normalizedPath, onMesh, rootObjectId);
        });
      }
      return resolveObjectRecursivo(zip, docCache, doc, childObjectId, combined, path, onMesh, rootObjectId);
    });

    return Promise.all(promises);
  }

  // Só agrega volume/área/bbox (soma o volume de cada mesh-folha em módulo,
  // pra não zerar o total quando um componente vem espelhado, transform com
  // determinante negativo, comum em peças simétricas). Não retém os
  // triângulos resolvidos em memória, porque modelos reais multi-peça (ex:
  // miniaturas Bambu Studio) podem passar de 3-4 milhões de triângulos e
  // manter tudo em arrays de arrays estouraria memória no navegador sem
  // necessidade (só usamos os agregados).
  function resolveObjectGeometry(zip, docCache, doc, objectId, accumTransform, componentesIgnorados) {
    var triangleCount = 0;
    var volumeMm3 = 0;
    var areaMm2 = 0;
    var bbox = bboxVazio();

    function onMesh(leafTriangles, localIndices, meshBbox) {
      bbox = mergeBBox(bbox, meshBbox);
      if (leafTriangles.length) {
        volumeMm3 += computeMeshVolumeMm3(leafTriangles);
        areaMm2 += computeMeshAreaMm2(leafTriangles);
        triangleCount += leafTriangles.length;
      }
    }

    return resolveObjectRecursivo(zip, docCache, doc, objectId, accumTransform, null, onMesh, undefined, componentesIgnorados).then(function () {
      return { triangleCount: triangleCount, volumeMm3: volumeMm3, areaMm2: areaMm2, bbox: bbox };
    });
  }

  // Bambu Studio e derivados guardam em model_settings.config o tipo de cada
  // parte de um objeto (<object id> com <part id subtype>, em que part id é o
  // objectid do <component> do objeto no 3dmodel.model). Modificadores,
  // partes negativas e bloqueadores/reforçadores de suporte não são
  // impressos: somados como peça, inflavam peso, tempo e tamanho (um cubo
  // modificador de 50 mm sobre uma peça pequena dava "não cabe na mesa").
  // Ignorar a parte negativa em vez de subtrair o volume dela é uma
  // aproximação. Devolve Map de objectid do objeto → Set de objectid dos
  // componentes a ignorar, ou null.
  function parsePartesNaoSolidas(modelSettingsText) {
    if (!modelSettingsText || typeof DOMParser === "undefined") return null;
    try {
      var doc = new DOMParser().parseFromString(modelSettingsText, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) return null;
      var porObjeto = new Map();
      var objetos = doc.getElementsByTagName("object");
      for (var i = 0; i < objetos.length; i++) {
        var partes = directChildren(objetos[i], "part");
        for (var j = 0; j < partes.length; j++) {
          var subtype = partes[j].getAttribute("subtype");
          if (!subtype || subtype === "normal_part") continue;
          var objectId = objetos[i].getAttribute("id");
          if (!porObjeto.has(objectId)) porObjeto.set(objectId, new Set());
          porObjeto.get(objectId).add(partes[j].getAttribute("id"));
        }
      }
      return porObjeto.size ? porObjeto : null;
    } catch (e) {
      return null;
    }
  }

  // `modelSettingsText` (opcional) é o Metadata/model_settings.config: ver
  // parsePartesNaoSolidas.
  function parse3MFPackage(zip, rootXmlText, modelSettingsText) {
    var doc = parseXmlDoc(rootXmlText);
    var partesNaoSolidas = parsePartesNaoSolidas(modelSettingsText);
    var unidadeAttr = doc.documentElement.getAttribute("unit");
    var escala = UNIDADE_PARA_MM[unidadeAttr] || 1;
    var docCache = {};
    var buildEl = doc.getElementsByTagName("build")[0];
    var itemEls = buildEl ? directChildren(buildEl, "item") : [];

    // Sem <build>/<item> (raro): trata cada <object> de nível topo como se
    // fosse um item, sem transform.
    var items = itemEls.length ? itemEls : Array.prototype.map.call(
      doc.getElementsByTagName("object"),
      function (o) {
        return { getAttribute: function (name) { return name === "objectid" ? o.getAttribute("id") : null; } };
      }
    );

    var objectIds = items.map(function (item) { return item.getAttribute("objectid"); });
    var translacoes = items.map(function (item) { return parseTransformAttr(item.getAttribute("transform")).t; });
    var promises = items.map(function (item) {
      var transform = parseTransformAttr(item.getAttribute("transform"));
      var objectId = item.getAttribute("objectid");
      // 3MF Production Extension: <item> também pode apontar pra um arquivo
      // externo via p:path (padrão do Bambu Studio/Orca pra separar cada
      // object/chapa em 3D/Objects/*.model), não só <component> (ver
      // resolveObjectRecursivo). Sem isso, o objectId do item era buscado só
      // no doc raiz e, se coincidisse por acaso com outro object definido
      // ali, a geometria errada (de outra chapa) era resolvida.
      var itemPath = item.getAttribute("p:path");
      // Os ids de model_settings.config são os do 3dmodel.model raiz: um item
      // com p:path aponta para um id de outro arquivo.
      var ignorados = partesNaoSolidas && !itemPath ? partesNaoSolidas.get(objectId) : undefined;
      if (itemPath) {
        var externo = carregarDocExterno(zip, docCache, itemPath);
        if (!externo) return Promise.resolve({ triangleCount: 0, volumeMm3: 0, areaMm2: 0, bbox: bboxVazio() });
        return externo.docPromise.then(function (extDoc) {
          return resolveObjectGeometry(zip, docCache, extDoc, objectId, transform, ignorados);
        });
      }
      return resolveObjectGeometry(zip, docCache, doc, objectId, transform, ignorados);
    });

    return Promise.all(promises).then(function (results) {
      var triangleCount = 0;
      var volumeMm3 = 0;
      var areaMm2 = 0;
      var bbox = bboxVazio();
      results.forEach(function (r) {
        triangleCount += r.triangleCount;
        areaMm2 += r.areaMm2;
        volumeMm3 += r.volumeMm3;
        bbox = mergeBBox(bbox, r.bbox);
      });
      function escalarBBox(b) {
        return {
          minX: b.minX * escala, minY: b.minY * escala, minZ: b.minZ * escala,
          maxX: b.maxX * escala, maxY: b.maxY * escala, maxZ: b.maxZ * escala
        };
      }
      return {
        triangleCount: triangleCount,
        volumeMm3: volumeMm3 * escala * escala * escala,
        areaMm2: areaMm2 * escala * escala,
        bbox: escalarBBox(bbox),
        // bbox de cada item de nível topo (build item), na ordem de `items`.
        // Usado pra separar por chapa/plate em arquivos multi-plate (ver
        // conversor-3mf.js), já que o bbox combinado acima soma objetos que
        // na real impressora nunca ficam juntos na mesma mesa.
        // `posicao` é a translação do item: a mesma que reposicionarPorMesa
        // usa para achar a célula da grade.
        itens: results.map(function (r, i) {
          return { objectId: objectIds[i], bbox: escalarBBox(r.bbox), posicao: [translacoes[i][0] * escala, translacoes[i][1] * escala] };
        })
      };
    });
  }

  // Mesma travessia de <object>/<components> do resolveObjectGeometry acima
  // (resolveObjectRecursivo), mas guardando os triângulos (com transform já
  // aplicado) em vez de só agregados. Usado pela ferramenta de colorir, que
  // precisa da malha de verdade pra pintar, não só volume/bbox.
  // `outOrigins` acompanha `outTriangulos` índice a índice com {path,
  // objectId, rootObjectId, localIndex}. localIndex é a posição do triângulo
  // dentro do <triangles> original daquele object/arquivo; `objectId` é o
  // object-folha (usado na exportação pra reabrir o pacote 3MF original e
  // escrever a cor de volta no <triangle> exato de onde veio); `rootObjectId`
  // é o objectid do build item de nível topo (usado pra casar o triângulo com
  // a chapa/plate a que pertence, ver mapearTriangulosParaChapas) — os dois
  // divergem quando o object de topo é montado via <components> aninhados.
  function resolveObjectTriangles(zip, docCache, doc, objectId, accumTransform, outTriangulos, path, outOrigins, componentesIgnorados) {
    function onMesh(leafTriangles, localIndices, meshBbox, meshPath, meshObjectId, rootObjectId) {
      leafTriangles.forEach(function (tri, i) {
        outTriangulos.push(tri);
        outOrigins.push({ path: meshPath, objectId: meshObjectId, rootObjectId: rootObjectId, localIndex: localIndices[i] });
      });
    }

    return resolveObjectRecursivo(zip, docCache, doc, objectId, accumTransform, path, onMesh, undefined, componentesIgnorados);
  }

  // Extrai a malha de um pacote 3MF já aberto (JSZip) como array de
  // triângulos no mesmo formato de parseSTL. Resolve build items,
  // components aninhados e arquivos externos (p:path), e converte pra mm de
  // acordo com o <model unit="...">. `rootPath` é o caminho do próprio
  // 3dmodel.model dentro do zip, usado como origem de quem não vem de
  // component externo. Retorna também `origins` (ver resolveObjectTriangles),
  // usado na exportação pra editar o pacote original em vez de recriá-lo.
  // Com `modelSettingsText`, modificadores e bloqueadores de suporte ficam de
  // fora: não são impressos, então não há o que pintar (ver
  // parsePartesNaoSolidas).
  function extractTriangles3MF(zip, rootXmlText, rootPath, modelSettingsText) {
    var doc = parseXmlDoc(rootXmlText);
    var partesNaoSolidas = parsePartesNaoSolidas(modelSettingsText);
    var unidadeAttr = doc.documentElement.getAttribute("unit");
    var escala = UNIDADE_PARA_MM[unidadeAttr] || 1;
    var docCache = {};
    var buildEl = doc.getElementsByTagName("build")[0];
    var itemEls = buildEl ? directChildren(buildEl, "item") : [];
    var items = itemEls.length ? itemEls : Array.prototype.map.call(
      doc.getElementsByTagName("object"),
      function (o) {
        return { getAttribute: function (name) { return name === "objectid" ? o.getAttribute("id") : null; } };
      }
    );

    var triangulos = [];
    var origins = [];
    var promises = items.map(function (item) {
      var transform = parseTransformAttr(item.getAttribute("transform"));
      var objectId = item.getAttribute("objectid");
      // Mesmo caso de parse3MFPackage: <item> do build raiz também pode
      // apontar pra um arquivo externo via p:path (objeto/chapa que vive em
      // 3D/Objects/*.model em vez de dentro do 3dmodel.model raiz). Sem
      // tratar isso aqui, os triângulos (e o `path` guardado em origins, que
      // a exportação usa pra reabrir e repintar o arquivo certo) vinham do
      // doc/arquivo errado.
      var itemPath = item.getAttribute("p:path");
      if (itemPath) {
        var externo = carregarDocExterno(zip, docCache, itemPath);
        if (!externo) return Promise.resolve();
        return externo.docPromise.then(function (extDoc) {
          return resolveObjectTriangles(zip, docCache, extDoc, objectId, transform, triangulos, externo.normalizedPath, origins);
        });
      }
      var ignorados = partesNaoSolidas ? partesNaoSolidas.get(objectId) : undefined;
      return resolveObjectTriangles(zip, docCache, doc, objectId, transform, triangulos, rootPath, origins, ignorados);
    });

    return Promise.all(promises).then(function () {
      if (escala !== 1) {
        // Triângulos vizinhos compartilham o mesmo array de vértice: sem
        // marcar os já escalados, cada vértice seria multiplicado uma vez
        // por triângulo que o usa.
        var escalados = new Set();
        triangulos.forEach(function (tri) {
          tri.forEach(function (p) {
            if (escalados.has(p)) return;
            escalados.add(p);
            p[0] *= escala; p[1] *= escala; p[2] *= escala;
          });
        });
      }
      return { triangulos: triangulos, origins: origins };
    });
  }

  // Acha o 3dmodel.model dentro de um pacote 3MF (JSZip já carregado). Tenta
  // primeiro o caminho padrão (3D/3dmodel.model); alguns pacotes de terceiros
  // usam outro caminho, daí o fallback por nome de arquivo em qualquer pasta.
  function localizarModeloRaiz(zip) {
    var arquivos = zip.file(/(^|\/)3D\/3dmodel\.model$/i);
    if (!arquivos.length) arquivos = zip.file(/3dmodel\.model$/i);
    return arquivos.length ? arquivos[0] : null;
  }

  // Acha um arquivo de Metadata/ pelo nome (ex.: "project_settings.config"),
  // em qualquer subpasta do pacote. Ancorado no início do nome do arquivo
  // (precedido só por "/" ou início da string) para não casar por engano com
  // um arquivo tipo "meuproject_settings.config".
  function localizarArquivoUnico(zip, nomeArquivo) {
    var escapado = nomeArquivo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var arquivos = zip.file(new RegExp("(^|/)" + escapado + "$", "i"));
    return arquivos.length ? arquivos[0] : null;
  }

  // Baixa um blob como arquivo, revogando a URL temporária logo depois. O
  // setTimeout (em vez de revogar na hora) evita cortar o download em
  // navegadores que só começam a gravar o arquivo de fato um instante depois
  // do clique sintético.
  function baixarBlob(blob, nomeArquivo) {
    var a = document.createElement("a");
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function parse3MFPerfil(configText) {
    var densidadeMatch = configText.match(/"filament_density"\s*:\s*\[\s*"([\d.]+)"/);
    var diametroMatch = configText.match(/"filament_diameter"\s*:\s*\[\s*"([\d.]+)"/);
    var paredesMatch = configText.match(/"wall_loops"\s*:\s*"?(\d+)"?/);
    var infillMatch = configText.match(/"sparse_infill_density"\s*:\s*"?(\d+(?:\.\d+)?)%?"?/);
    if (!densidadeMatch) return null;
    return {
      paredes: paredesMatch ? parseInt(paredesMatch[1], 10) : null,
      infillPct: infillMatch ? parseFloat(infillMatch[1]) : null,
      densidade: parseFloat(densidadeMatch[1]),
      diametro: diametroMatch ? parseFloat(diametroMatch[1]) : null
    };
  }

  // Um 3MF pode conter várias chapas independentes (plates), cada uma com seu
  // próprio arranjo de peças. Sem isso, o bbox combinado de todas as chapas
  // dava um "tamanho" maior que qualquer mesa real e gerava avisos de encaixe
  // falsos. Lê Metadata/model_settings.config e devolve, por chapa, a lista de
  // object_id das peças que pertencem a ela (ou null se o arquivo não tem
  // metadados de chapa, caso de projetos com uma chapa só). Com
  // `manterVazias`, mesas sem peças continuam na lista (vazias), para o
  // índice ser o da mesa, e uma mesa só também volta.
  function parsePlateAssignments(modelSettingsText, manterVazias) {
    if (!modelSettingsText || typeof DOMParser === "undefined") return null;
    try {
      var doc = new DOMParser().parseFromString(modelSettingsText, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) return null;
      var plateEls = doc.getElementsByTagName("plate");
      if (!plateEls.length) return null;

      var chapas = [];
      for (var i = 0; i < plateEls.length; i++) {
        var instancias = plateEls[i].getElementsByTagName("model_instance");
        var ids = [];
        for (var j = 0; j < instancias.length; j++) {
          var metas = instancias[j].getElementsByTagName("metadata");
          for (var k = 0; k < metas.length; k++) {
            if (metas[k].getAttribute("key") === "object_id") {
              ids.push(metas[k].getAttribute("value"));
            }
          }
        }
        if (ids.length || manterVazias) chapas.push(ids);
      }
      if (manterVazias) return chapas.length ? chapas : null;
      return chapas.length > 1 ? chapas : null;
    } catch (e) {
      return null;
    }
  }

  // Junta o bbox dos itens (retornados por parse3MFPackage) de acordo com a
  // lista de object_id de cada chapa, gerando um bbox por chapa em vez de um
  // bbox único pra todo o arquivo.
  function calcularChapas(itens, plateAssignments) {
    if (!plateAssignments || !itens) return null;
    var chapas = plateAssignments.map(function (ids, indice) {
      var bbox = null;
      itens.forEach(function (item) {
        if (ids.indexOf(item.objectId) !== -1) {
          // Mescla o bbox do item com o bbox acumulado da chapa
          if (!bbox) bbox = item.bbox;
          else if (item.bbox) bbox = mergeBBox(bbox, item.bbox);
        }
      });
      return { indice: indice + 1, bbox: bbox };
    }).filter(function (chapa) { return chapa.bbox; });
    return chapas.length > 1 ? chapas : null;
  }

  // Retângulo {x0, x1, y0, y1} que contém os pontos de uma lista de "XxY"
  // (cada item pode ter vários pontos separados por vírgula, como no
  // extruder_printable_area). null sem nenhum ponto válido.
  function limitesDePontos(pontos) {
    var xs = [];
    var ys = [];
    [].concat(pontos || []).forEach(function (trecho) {
      String(trecho).split(",").forEach(function (par) {
        var xy = par.split("x").map(Number);
        if (xy.length === 2 && !isNaN(xy[0]) && !isNaN(xy[1])) {
          xs.push(xy[0]);
          ys.push(xy[1]);
        }
      });
    });
    if (!xs.length) return null;
    return {
      x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs),
      y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys)
    };
  }

  // Centro e passo da grade de mesas a partir do printable_area do perfil
  // (lista de "XxY", ex.: ["0x0","256x0","256x256","0x256"]).
  function gradeDaMesa(printableArea) {
    if (!Array.isArray(printableArea)) return null;
    var m = limitesDePontos(printableArea);
    if (!m || !(m.x1 > m.x0 && m.y1 > m.y0)) return null;
    return {
      x0: m.x0, x1: m.x1, y0: m.y0, y1: m.y1,
      cx: (m.x0 + m.x1) / 2, cy: (m.y0 + m.y1) / 2,
      passoX: 1.2 * (m.x1 - m.x0), passoY: 1.2 * (m.y1 - m.y0)
    };
  }

  // Célula (coluna, linha) da grade da origem em que está o ponto (x, y) e o
  // deslocamento [dx, dy] que o leva para a mesma célula no destino,
  // mantendo o afastamento do centro da mesa (ver reposicionarPorMesa).
  function celulaNoDestino(x, y, a, b) {
    var coluna = Math.round((x - a.cx) / a.passoX);
    var linha = Math.round((y - a.cy) / a.passoY);
    return {
      coluna: coluna,
      linha: linha,
      dx: b.cx - a.cx + coluna * (b.passoX - a.passoX),
      dy: b.cy - a.cy + linha * (b.passoY - a.passoY)
    };
  }

  // Bambu Studio e os fatiadores derivados (QIDI, Orca, Creality Print...)
  // guardam a mesa k de um projeto numa célula de uma grade com passo de 1,2 ×
  // a largura e 1,2 × a profundidade da mesa da impressora (as linhas crescem
  // para Y negativo). Com mesas de tamanhos diferentes, manter as coordenadas
  // da origem tira as peças das mesas 2+ da célula delas e o fatiador de
  // destino junta tudo na mesa 1 ou recusa o arquivo. Cada <item> do <build>
  // vai para a mesma célula no destino, mantendo o afastamento do centro da
  // mesa; com uma mesa só a peça fica centralizada como estava na origem.
  // Devolve null quando falta a área de uma das mesas.
  function reposicionarPorMesa(modelText, printableAreaOrigem, printableAreaDestino) {
    var a = gradeDaMesa(printableAreaOrigem);
    var b = gradeDaMesa(printableAreaDestino);
    if (!a || !b) return null;
    return modelText.replace(/(<item\b[^>]*\btransform=")([^"]*)(")/g, function (inteiro, inicio, transform, fim) {
      var partes = transform.trim().split(/\s+/);
      var x = Number(partes[9]);
      var y = Number(partes[10]);
      if (partes.length !== 12 || isNaN(x) || isNaN(y)) return inteiro;
      var celula = celulaNoDestino(x, y, a, b);
      partes[9] = String(+(x + celula.dx).toFixed(6));
      partes[10] = String(+(y + celula.dy).toFixed(6));
      return inicio + partes.join(" ") + fim;
    });
  }

  // Pegada [x0, y0, x1, y1] de cada item no destino, em coordenadas da mesa
  // dele, agrupada por mesa. `itens` são os de parse3MFPackage (bbox global e
  // posição na origem), `mesas` a lista de object_id por mesa de
  // parsePlateAssignments com manterVazias (null: tudo na mesa 1). A pegada
  // anda o mesmo que reposicionarPorMesa anda o item, e perde a célula da
  // grade do destino.
  function pegadasPorMesa(itens, mesas, printableAreaOrigem, printableAreaDestino, qtdMesas) {
    var a = gradeDaMesa(printableAreaOrigem);
    var b = gradeDaMesa(printableAreaDestino);
    var porMesa = [];
    for (var i = 0; i < qtdMesas; i++) porMesa.push([]);
    if (!a || !b) return porMesa;
    (itens || []).forEach(function (item) {
      var c = item.bbox;
      if (!c || !(c.maxX >= c.minX)) return;
      var indice = 0;
      if (mesas) {
        indice = -1;
        for (var k = 0; k < mesas.length; k++) {
          if (mesas[k].indexOf(item.objectId) !== -1) { indice = k; break; }
        }
      }
      if (indice < 0 || indice >= qtdMesas) return;
      var p = item.posicao || [(c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2];
      var celula = celulaNoDestino(p[0], p[1], a, b);
      var dx = celula.dx - celula.coluna * b.passoX;
      var dy = celula.dy - celula.linha * b.passoY;
      porMesa[indice].push([c.minX + dx, c.minY + dy, c.maxX + dx, c.maxY + dy]);
    });
    return porMesa;
  }

  // Torre de purga (wipe_tower_x/y, uma por mesa, em coordenadas da mesa).
  // Nem a posição em que o autor deixou a torre nem a de fábrica do destino
  // servem sempre: conferido no CLI dos fatiadores, a de fábrica cai fora da
  // mesa ou na faixa que só um bico alcança (H2D, P1S) e a do autor encosta
  // nas peças. Em cada mesa a torre vai para o primeiro lugar livre entre a
  // do autor (com o deslocamento das peças) e a de fábrica, ou, se nenhuma
  // servir, para o ponto livre mais perto da do autor. Livre = dentro da mesa
  // com margem, fora das áreas proibidas do perfil (bed_exclude_area,
  // wrapping_exclude_area) e da faixa que só um bico alcança
  // (extruder_printable_area), e longe das peças. A torre ocupa até 40 mm de
  // profundidade e a largura configurada, girada pelo
  // wipe_tower_rotation_angle (medido no G-code dos fatiadores).
  var TORRE = { lado: 40, margem: 6, folga: 6, passo: 5 };

  function primeiroNumero(valor) {
    return parseFloat([].concat(valor == null ? [] : valor)[0]);
  }

  function regiaoDaTorre(config) {
    var m = limitesDePontos(config.printable_area);
    if (!m) return null;
    [].concat(config.extruder_printable_area || []).forEach(function (area) {
      var e = limitesDePontos(area);
      if (e) m = { x0: Math.max(m.x0, e.x0), x1: Math.min(m.x1, e.x1), y0: Math.max(m.y0, e.y0), y1: Math.min(m.y1, e.y1) };
    });
    if (!(m.x1 > m.x0 && m.y1 > m.y0)) return null;
    // A lista pode trazer vários retângulos emendados num contorno só, de 4
    // em 4 pontos, com trechos de largura zero entre eles (Qidi X-Max 4: 4
    // cantos; Anycubic Kobra 3: 4 bordas). Retângulo com metade da mesa ou
    // mais é o contorno, não uma área proibida.
    var proibidas = [];
    var areaMesa = (m.x1 - m.x0) * (m.y1 - m.y0);
    ["bed_exclude_area", "wrapping_exclude_area"].forEach(function (campo) {
      var pontos = [];
      [].concat(config[campo] || []).forEach(function (trecho) {
        pontos = pontos.concat(String(trecho).split(","));
      });
      for (var i = 0; i + 4 <= pontos.length; i += 4) {
        var e = limitesDePontos(pontos.slice(i, i + 4));
        if (e && e.x1 > e.x0 && e.y1 > e.y0 && (e.x1 - e.x0) * (e.y1 - e.y0) < areaMesa / 2) proibidas.push([e.x0, e.y0, e.x1, e.y1]);
      }
    });
    return { lim: m, proibidas: proibidas };
  }

  // Retângulo que a torre ocupa em relação a (wipe_tower_x, wipe_tower_y),
  // girado no sentido anti-horário como no fatiador.
  function pegadaDaTorre(config) {
    var largura = Math.max(TORRE.lado, primeiroNumero(config.prime_tower_width) || 0);
    var angulo = (primeiroNumero(config.wipe_tower_rotation_angle) || 0) * Math.PI / 180;
    var c = Math.cos(angulo), s = Math.sin(angulo);
    var cantos = [[0, 0], [largura, 0], [0, TORRE.lado], [largura, TORRE.lado]].map(function (p) {
      return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
    });
    function arred(v) { return Math.round(v * 1000) / 1000; }
    var xs = cantos.map(function (p) { return p[0]; });
    var ys = cantos.map(function (p) { return p[1]; });
    return [arred(Math.min.apply(null, xs)), arred(Math.min.apply(null, ys)), arred(Math.max.apply(null, xs)), arred(Math.max.apply(null, ys))];
  }

  function lugarDaTorre(config, pecas, candidatos) {
    var regiao = regiaoDaTorre(config);
    if (!regiao) return null;
    var lim = regiao.lim, M = TORRE.margem, F = TORRE.folga, t = pegadaDaTorre(config);
    var obstaculos = pecas.map(function (c) { return [c[0] - F, c[1] - F, c[2] + F, c[3] + F]; }).concat(regiao.proibidas);
    // posições (x, y) em que a torre inteira, com a margem, fica na mesa
    var xMin = lim.x0 - t[0] + M, xMax = lim.x1 - t[2] - M;
    var yMin = lim.y0 - t[1] + M, yMax = lim.y1 - t[3] - M;
    // área da torre (com a margem) em cima de peças ou de áreas proibidas
    function sobre(x, y) {
      var total = 0;
      for (var i = 0; i < obstaculos.length; i++) {
        var c = obstaculos[i];
        var w = Math.min(x + t[2] + M, c[2]) - Math.max(x + t[0] - M, c[0]);
        var h = Math.min(y + t[3] + M, c[3]) - Math.max(y + t[1] - M, c[1]);
        if (w > 0 && h > 0) total += w * h;
      }
      return total;
    }
    function livre(x, y) {
      return x >= xMin && x <= xMax && y >= yMin && y <= yMax && sobre(x, y) === 0;
    }
    var validos = candidatos.filter(Boolean);
    for (var k = 0; k < validos.length; k++) {
      if (livre(validos[k][0], validos[k][1])) return validos[k];
    }
    // o ponto livre mais perto da referência; mesa cheia: o que menos cobre
    var ref = validos[0] || [xMin, yMax];
    var melhor = null, menorSobre = Infinity, menorDist = Infinity;
    for (var x = xMin; x <= xMax; x += TORRE.passo) {
      for (var y = yMin; y <= yMax; y += TORRE.passo) {
        var cobre = sobre(x, y);
        var dist = (x - ref[0]) * (x - ref[0]) + (y - ref[1]) * (y - ref[1]);
        if (cobre < menorSobre || (cobre === menorSobre && dist < menorDist)) {
          melhor = [x, y]; menorSobre = cobre; menorDist = dist;
        }
      }
    }
    if (melhor) return melhor;
    // mesa menor que a torre: fica na referência, só puxada para dentro
    if (!validos.length) return null;
    return [Math.min(Math.max(ref[0], xMin), Math.max(xMin, xMax)), Math.min(Math.max(ref[1], yMin), Math.max(yMin, yMax))];
  }

  // `configOrigem` é o project_settings.config original (torre do autor, mesa
  // de origem), `configDestino` o já convertido (mesa, áreas e bicos do
  // destino, torre configurada no processo), `baseDestino` o perfil de
  // destino (torre de fábrica) e `pegadas` o de pegadasPorMesa. Devolve null
  // sem torre: desligada ou com um filamento só, não há troca e o fatiador
  // não a imprime.
  function posicionarTorres(configOrigem, configDestino, baseDestino, pegadas) {
    var ligada = String([].concat(configDestino.enable_prime_tower == null ? "1" : configDestino.enable_prime_tower)[0]) !== "0";
    var filamentos = [].concat(configDestino.filament_colour || []).length;
    if (!ligada || filamentos < 2 || configOrigem.wipe_tower_x == null || configOrigem.wipe_tower_y == null) return null;
    var a = gradeDaMesa(configOrigem.printable_area);
    var b = gradeDaMesa(configDestino.printable_area);
    if (!a || !b) return null;
    var xs = [].concat(configOrigem.wipe_tower_x);
    var ys = [].concat(configOrigem.wipe_tower_y);
    var fabrica = [primeiroNumero(baseDestino.wipe_tower_x), primeiroNumero(baseDestino.wipe_tower_y)];
    if (isNaN(fabrica[0]) || isNaN(fabrica[1])) fabrica = null;

    // Sem lugar calculado (região da torre inválida no perfil), a torre só
    // acompanha as peças, como em reposicionarTorres.
    var simples = reposicionarTorres(configOrigem, configOrigem.printable_area, configDestino.printable_area);
    var simplesX = [].concat(simples.wipe_tower_x), simplesY = [].concat(simples.wipe_tower_y);
    var novosX = [], novosY = [];
    for (var i = 0; i < xs.length; i++) {
      var autor = [parseFloat(xs[i]) + b.cx - a.cx, parseFloat(ys[Math.min(i, ys.length - 1)]) + b.cy - a.cy];
      if (isNaN(autor[0]) || isNaN(autor[1])) autor = null;
      var lugar = lugarDaTorre(configDestino, pegadas[i] || [], [autor, fabrica]);
      novosX.push(lugar ? String(+lugar[0].toFixed(3)) : simplesX[i]);
      novosY.push(lugar ? String(+lugar[1].toFixed(3)) : simplesY[Math.min(i, simplesY.length - 1)]);
    }
    return {
      wipe_tower_x: Array.isArray(configOrigem.wipe_tower_x) ? novosX : novosX[0],
      wipe_tower_y: Array.isArray(configOrigem.wipe_tower_y) ? novosY : novosY[0]
    };
  }

  // A posição da torre de purga (wipe_tower_x/y, uma por mesa, em
  // coordenadas da própria mesa) acompanha o deslocamento que
  // reposicionarPorMesa dá às peças, para não cair em cima delas, e é
  // limitada à mesa de destino. Devolve null sem torre ou sem área de mesa.
  function reposicionarTorres(config, printableAreaOrigem, printableAreaDestino) {
    var a = gradeDaMesa(printableAreaOrigem);
    var b = gradeDaMesa(printableAreaDestino);
    if (!a || !b || config.wipe_tower_x == null || config.wipe_tower_y == null) return null;
    var largura = parseFloat(config.prime_tower_width) || 35;

    function mover(valor, delta, minimo, maximo) {
      var n = parseFloat(valor);
      if (isNaN(n)) return valor;
      return String(+Math.min(Math.max(n + delta, minimo), Math.max(minimo, maximo - largura)).toFixed(4));
    }
    function moverTodos(valores, delta, minimo, maximo) {
      if (!Array.isArray(valores)) return mover(valores, delta, minimo, maximo);
      return valores.map(function (v) { return mover(v, delta, minimo, maximo); });
    }

    return {
      wipe_tower_x: moverTodos(config.wipe_tower_x, b.cx - a.cx, b.x0, b.x1),
      wipe_tower_y: moverTodos(config.wipe_tower_y, b.cy - a.cy, b.y0, b.y1)
    };
  }

  // Agrupa índices de triângulo por chapa, numa única varredura de
  // `triangleOrigins` (formato `{path, objectId, rootObjectId, localIndex}`
  // por triângulo, ver resolveObjectTriangles/extractTriangles3MF). Pra cada
  // triângulo, compara o `rootObjectId` da origem (o objectid do build item
  // de nível topo, não o do object-folha que contém a mesh) contra o
  // `objectIds` (Set) de cada chapa em `chapas` (formato `{indice,
  // objectIds}`, ver detectarChapas em colorir-3mf.js) e empilha o índice do
  // triângulo na chapa correspondente. Usar rootObjectId em vez de objectId é
  // necessário porque model_settings.config referencia o build item de topo,
  // enquanto peças montadas via <components> aninhados têm um objectId de
  // leaf-mesh diferente. Um triângulo cujo rootObjectId não bate com nenhuma
  // chapa simplesmente não entra em nenhum grupo (não deveria acontecer na
  // prática, já que todo build item pertence a alguma chapa, mas não lança
  // erro se acontecer).
  //
  // Um mesmo rootObjectId aparecendo em mais de uma chapa é ambíguo (não dá
  // pra saber qual delas é a dona de verdade do triângulo): em vez de atribuir
  // ao primeiro match como antes (podia silenciosamente "roubar" triângulos de
  // outra chapa), esses ids ambíguos ficam de fora de toda chapa, igual ao
  // caso de rootObjectId sem match nenhum.
  function mapearTriangulosParaChapas(triangleOrigins, chapas) {
    var porChapa = new Map();
    chapas.forEach(function (chapa) { porChapa.set(chapa.indice, []); });

    var contagemPorId = new Map();
    chapas.forEach(function (chapa) {
      chapa.objectIds.forEach(function (id) {
        contagemPorId.set(id, (contagemPorId.get(id) || 0) + 1);
      });
    });

    for (var t = 0; t < triangleOrigins.length; t++) {
      var origin = triangleOrigins[t];
      if (!origin) continue;
      if (contagemPorId.get(origin.rootObjectId) !== 1) continue;
      for (var i = 0; i < chapas.length; i++) {
        if (chapas[i].objectIds.has(origin.rootObjectId)) {
          porChapa.get(chapas[i].indice).push(t);
          break;
        }
      }
    }

    return porChapa;
  }

  // Um mesmo object referenciado por dois <item>/<component> vira, em
  // extractTriangles3MF, duas cópias da malha com os mesmos triângulos de
  // origem (path, objectId, localIndex). No 3MF exportado só existe uma cor
  // por triângulo de origem, então as cópias precisam ser pintadas juntas.
  // Cada cópia é um trecho contínuo de `triangleOrigins` (onMesh empilha a
  // malha inteira de uma vez, com localIndex crescente): o mapa guarda o
  // início de cada trecho e, para trechos repetidos, o início de todas as
  // cópias, em vez de um registro por triângulo. Devolve null sem cópias.
  function mapearCopiasDeMalha(triangleOrigins) {
    var inicios = [];
    var chaves = [];
    for (var t = 0; t < triangleOrigins.length; t++) {
      var o = triangleOrigins[t];
      var anterior = t > 0 ? triangleOrigins[t - 1] : null;
      var continua = o && anterior && o.path === anterior.path && o.objectId === anterior.objectId && o.localIndex > anterior.localIndex;
      if (!continua) {
        inicios.push(t);
        chaves.push(o ? o.path + "|" + o.objectId : null);
      }
    }

    var porChave = new Map();
    chaves.forEach(function (chave, i) {
      if (chave === null) return;
      if (!porChave.has(chave)) porChave.set(chave, []);
      porChave.get(chave).push(inicios[i]);
    });

    var temCopias = false;
    var copias = chaves.map(function (chave) {
      var grupo = chave === null ? null : porChave.get(chave);
      if (!grupo || grupo.length < 2) return null;
      temCopias = true;
      return grupo;
    });
    return temCopias ? { inicios: inicios, copias: copias } : null;
  }

  // Chama `fn(indice)` para cada triângulo que é o mesmo triângulo de origem
  // que `t` nas outras cópias da malha (ver mapearCopiasDeMalha). Sem criar
  // arrays: roda para cada triângulo de um balde que pode ter milhões.
  function paraCadaCopia(mapa, t, fn) {
    if (!mapa) return;
    var baixo = 0;
    var alto = mapa.inicios.length - 1;
    while (baixo < alto) {
      var meio = (baixo + alto + 1) >> 1;
      if (mapa.inicios[meio] <= t) baixo = meio;
      else alto = meio - 1;
    }
    var grupo = mapa.copias[baixo];
    if (!grupo) return;
    var inicio = mapa.inicios[baixo];
    for (var i = 0; i < grupo.length; i++) {
      if (grupo[i] !== inicio) fn(grupo[i] + t - inicio);
    }
  }

  function copiasDoTriangulo(mapa, t) {
    var indices = [];
    paraCadaCopia(mapa, t, function (indice) { indices.push(indice); });
    return indices;
  }

  window.Wisky3D.ModelParser = {
    parseSTL: parseSTL,
    computeBoundingBox: computeBoundingBox,
    computeMeshVolumeMm3: computeMeshVolumeMm3,
    computeMeshAreaMm2: computeMeshAreaMm2,
    bboxVazio: bboxVazio,
    directChild: directChild,
    directChildren: directChildren,
    findObjectElement: findObjectElement,
    localizarModeloRaiz: localizarModeloRaiz,
    localizarArquivoUnico: localizarArquivoUnico,
    baixarBlob: baixarBlob,
    parse3MFPackage: parse3MFPackage,
    extractTriangles3MF: extractTriangles3MF,
    parse3MFPerfil: parse3MFPerfil,
    parsePlateAssignments: parsePlateAssignments,
    calcularChapas: calcularChapas,
    contarTriangulos3MF: contarTriangulos3MF,
    contarTriangulosSTL: contarTriangulosSTL,
    temPartesNaoSolidas: function (modelSettingsText) { return !!parsePartesNaoSolidas(modelSettingsText); },
    reposicionarPorMesa: reposicionarPorMesa,
    reposicionarTorres: reposicionarTorres,
    pegadasPorMesa: pegadasPorMesa,
    posicionarTorres: posicionarTorres,
    mapearCopiasDeMalha: mapearCopiasDeMalha,
    paraCadaCopia: paraCadaCopia,
    copiasDoTriangulo: copiasDoTriangulo,
    mapearTriangulosParaChapas: mapearTriangulosParaChapas
  };
})();
