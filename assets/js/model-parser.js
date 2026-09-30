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

  function findObjectElement(doc, objectId) {
    var objects = doc.getElementsByTagName("object");
    for (var i = 0; i < objects.length; i++) {
      if (objects[i].getAttribute("id") === String(objectId)) return objects[i];
    }
    return null;
  }

  // Compara pelo nome local (ignorando prefixo de namespace, ex.: "m:color"),
  // necessário pra achar elementos de extensões do 3MF (m:colorgroup,
  // m:color) cujo prefixo pode variar (ou nem existir, se o pacote declarou a
  // extensão com outro prefixo/namespace default). Compartilhado com
  // threemf-writer.js (limpeza de colorgroups órfãos) e com
  // lerCorPorTriangulo abaixo, pra não duplicar essa busca.
  function filhosDiretosPorNomeLocal(el, nomeLocal) {
    var out = [];
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 1 && n.localName && n.localName.toLowerCase() === nomeLocal) out.push(n);
    }
    return out;
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
  // chama `onMesh(leafTriangles, localIndices, meshBbox, path, objectId)` com
  // os triângulos já com transform acumulado aplicado; quem chamou decide o
  // que fazer com eles (somar agregados ou empilhar num array de saída).
  // `path` é o arquivo (dentro do zip) de onde o object desse nível veio,
  // repassado como está pra components locais e trocado pelo p:path
  // resolvido pra components externos.
  // `topObjectId` é o objectid do <item> de build de nível topo que originou
  // esta cadeia de resolução (permanece o mesmo em toda a recursão); difere
  // de `objectId` sempre que o object de nível topo é uma "montagem" sem
  // <mesh> própria, só <components> apontando pra outro object com a malha
  // de fato (comum em 3MF do Bambu Studio/OrcaSlicer) — nesse caso `objectId`
  // vira o id do object-folha (com a malha) enquanto `topObjectId` continua
  // sendo o id que aparece em <model_settings.config>/<plate> e no <item> do
  // <build>, usado por mapearTriangulosParaChapas pra casar triângulo -> chapa.
  function resolveObjectRecursivo(zip, docCache, doc, objectId, accumTransform, path, onMesh, topObjectId) {
    if (topObjectId === undefined) topObjectId = objectId;
    var objectEl = findObjectElement(doc, objectId);
    if (!objectEl) return Promise.resolve();

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
      if (vertexEls.length) onMesh(leafTriangles, localIndices, meshBbox, path, objectId, topObjectId);
    }

    var componentsEl = directChild(objectEl, "components");
    if (!componentsEl) return Promise.resolve();

    var promises = directChildren(componentsEl, "component").map(function (comp) {
      var childObjectId = comp.getAttribute("objectid");
      var childTransform = parseTransformAttr(comp.getAttribute("transform"));
      var combined = composeTransform(accumTransform, childTransform);
      var compPath = comp.getAttribute("p:path");

      if (compPath) {
        var normalizedPath = compPath.replace(/^\//, "");
        var docPromise = docCache[normalizedPath];
        if (!docPromise) {
          var zipEntry = zip.file(normalizedPath);
          if (!zipEntry) return Promise.resolve();
          docPromise = zipEntry.async("text").then(parseXmlDoc);
          docCache[normalizedPath] = docPromise;
        }
        return docPromise.then(function (extDoc) {
          return resolveObjectRecursivo(zip, docCache, extDoc, childObjectId, combined, normalizedPath, onMesh, topObjectId);
        });
      }
      return resolveObjectRecursivo(zip, docCache, doc, childObjectId, combined, path, onMesh, topObjectId);
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
  function resolveObjectGeometry(zip, docCache, doc, objectId, accumTransform) {
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

    return resolveObjectRecursivo(zip, docCache, doc, objectId, accumTransform, null, onMesh).then(function () {
      return { triangleCount: triangleCount, volumeMm3: volumeMm3, areaMm2: areaMm2, bbox: bbox };
    });
  }

  function parse3MFPackage(zip, rootXmlText) {
    var doc = parseXmlDoc(rootXmlText);
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
    var promises = items.map(function (item) {
      var transform = parseTransformAttr(item.getAttribute("transform"));
      return resolveObjectGeometry(zip, docCache, doc, item.getAttribute("objectid"), transform);
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
        itens: results.map(function (r, i) {
          return { objectId: objectIds[i], bbox: escalarBBox(r.bbox) };
        })
      };
    });
  }

  // Mesma travessia de <object>/<components> do resolveObjectGeometry acima
  // (resolveObjectRecursivo), mas guardando os triângulos (com transform já
  // aplicado) em vez de só agregados. Usado pela ferramenta de colorir, que
  // precisa da malha de verdade pra pintar, não só volume/bbox.
  // `outOrigins` acompanha `outTriangulos` índice a índice com {path,
  // objectId, localIndex}. localIndex é a posição do triângulo dentro do
  // <triangles> original daquele object/arquivo. Isso permite, na exportação,
  // reabrir o pacote 3MF original e escrever a cor de volta nos <triangle>
  // exatos de onde vieram, em vez de reconstruir o pacote do zero.
  function resolveObjectTriangles(zip, docCache, doc, objectId, accumTransform, outTriangulos, path, outOrigins) {
    function onMesh(leafTriangles, localIndices, meshBbox, meshPath, meshObjectId, topObjectId) {
      leafTriangles.forEach(function (tri, i) {
        outTriangulos.push(tri);
        outOrigins.push({ path: meshPath, objectId: meshObjectId, topObjectId: topObjectId, localIndex: localIndices[i] });
      });
    }

    return resolveObjectRecursivo(zip, docCache, doc, objectId, accumTransform, path, onMesh);
  }

  // Extrai a malha de um pacote 3MF já aberto (JSZip) como array de
  // triângulos no mesmo formato de parseSTL. Resolve build items,
  // components aninhados e arquivos externos (p:path), e converte pra mm de
  // acordo com o <model unit="...">. `rootPath` é o caminho do próprio
  // 3dmodel.model dentro do zip, usado como origem de quem não vem de
  // component externo. Retorna também `origins` (ver resolveObjectTriangles),
  // usado na exportação pra editar o pacote original em vez de recriá-lo.
  function extractTriangles3MF(zip, rootXmlText, rootPath) {
    var doc = parseXmlDoc(rootXmlText);
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
      return resolveObjectTriangles(zip, docCache, doc, item.getAttribute("objectid"), transform, triangulos, rootPath, origins);
    });

    return Promise.all(promises).then(function () {
      if (escala !== 1) {
        triangulos.forEach(function (tri) {
          tri.forEach(function (p) {
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
  // metadados de chapa, caso de projetos com uma chapa só).
  function parsePlateAssignments(modelSettingsText) {
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
        if (ids.length) chapas.push(ids);
      }
      return chapas.length > 1 ? chapas : null;
    } catch (e) {
      return null;
    }
  }

  // Junta o bbox dos itens (retornados por parse3MFPackage) de acordo com a
  // lista de object_id de cada chapa, gerando um bbox por chapa em vez de um
  // bbox único pra todo o arquivo. Cada chapa retornada também traz a lista
  // de object_id que a compõe (`objectIds`), pra quem precisar filtrar itens
  // por chapa depois (ex.: Split 3MF), além do bbox mesclado.
  //
  // `opcoes.manterUnica` (default false, comportamento pré-existente
  // preservado): normalmente, se sobrar 1 chapa só com bbox válido depois do
  // filtro, o resultado inteiro vira `null` (uso histórico: telas que só
  // mostram cards de chapa quando há mais de uma chapa "de verdade").
  // Passando `{ manterUnica: true }`, esse colapso é pulado e a chapa única
  // (ou array vazio, se nenhuma tiver bbox) é retornada normalmente — usado
  // pelo Split 3MF, que trata "1 unidade só" como caso válido, não erro.
  function calcularChapas(itens, plateAssignments, opcoes) {
    if (!plateAssignments || !itens) return null;
    var manterUnica = opcoes && opcoes.manterUnica;
    var chapas = plateAssignments.map(function (ids, indice) {
      var bbox = null;
      itens.forEach(function (item) {
        if (ids.indexOf(item.objectId) !== -1) {
          // Mescla o bbox do item com o bbox acumulado da chapa
          if (!bbox) bbox = item.bbox;
          else if (item.bbox) bbox = mergeBBox(bbox, item.bbox);
        }
      });
      return { indice: indice + 1, objectIds: ids, bbox: bbox };
    }).filter(function (chapa) { return chapa.bbox; });
    if (manterUnica) return chapas;
    return chapas.length > 1 ? chapas : null;
  }

  // Agrupa índices de triângulo por chapa, numa única varredura de
  // `triangleOrigins` (formato `{path, objectId, topObjectId, localIndex}`
  // por triângulo, ver resolveObjectTriangles/extractTriangles3MF). Pra cada
  // triângulo, compara `topObjectId` (o objectid do <item> de build de nível
  // topo, não o objectId do object-folha que carrega a malha — eles diferem
  // sempre que o item de build referencia uma "montagem" via <components>,
  // caso comum em 3MF do Bambu Studio/OrcaSlicer) contra o `objectIds` (Set)
  // de cada chapa em `chapas` (formato `{indice, objectIds}`, ver
  // detectarChapas em colorir-3mf.js, que também usa os ids de nível topo do
  // model_settings.config) e empilha o índice do triângulo na chapa
  // correspondente. Um triângulo cujo topObjectId não bate com nenhuma chapa
  // simplesmente não entra em nenhum grupo (não deveria acontecer na
  // prática, já que toda peça pertence a alguma chapa, mas não lança erro se
  // acontecer).
  function mapearTriangulosParaChapas(triangleOrigins, chapas) {
    var porChapa = new Map();
    chapas.forEach(function (chapa) { porChapa.set(chapa.indice, []); });

    for (var t = 0; t < triangleOrigins.length; t++) {
      var origin = triangleOrigins[t];
      if (!origin) continue;
      var topId = origin.topObjectId !== undefined ? origin.topObjectId : origin.objectId;
      for (var i = 0; i < chapas.length; i++) {
        if (chapas[i].objectIds.has(topId)) {
          porChapa.get(chapas[i].indice).push(t);
          break;
        }
      }
    }

    return porChapa;
  }

  // Dá pra ter até 3 vizinhos por triângulo (um por aresta). Vértices são
  // "soldados" por posição quantizada pra achar arestas compartilhadas, já
  // que a geometria não-indexada usada pelo viewer não compartilha vértices
  // entre triângulos. Geometria pura (sem THREE.js/DOM), por isso mora aqui e
  // não em colorir-3mf.js, que só chama esta função.
  function buildAdjacencyAndExportIndex(positions, triCount) {
    var FATOR_QUANTIZACAO = 1e4; // ~0.0001mm de tolerância pra "mesmo ponto"
    var keyToIndex = new Map();
    var exportVertices = [];
    var cornerExportIndex = new Int32Array(triCount * 3);

    for (var i = 0; i < triCount * 3; i++) {
      var base = i * 3;
      var x = positions[base], y = positions[base + 1], z = positions[base + 2];
      var chave = Math.round(x * FATOR_QUANTIZACAO) + "," + Math.round(y * FATOR_QUANTIZACAO) + "," + Math.round(z * FATOR_QUANTIZACAO);
      var idx = keyToIndex.get(chave);
      if (idx === undefined) {
        idx = exportVertices.length;
        exportVertices.push([x, y, z]);
        keyToIndex.set(chave, idx);
      }
      cornerExportIndex[i] = idx;
    }

    var adjacencySets = new Array(triCount);
    for (var t = 0; t < triCount; t++) adjacencySets[t] = new Set();

    var edgeMap = new Map();
    function edgeKey(a, b) {
      return a < b ? a + "_" + b : b + "_" + a;
    }

    for (var t2 = 0; t2 < triCount; t2++) {
      var i0 = cornerExportIndex[t2 * 3];
      var i1 = cornerExportIndex[t2 * 3 + 1];
      var i2 = cornerExportIndex[t2 * 3 + 2];
      var arestas = [[i0, i1], [i1, i2], [i2, i0]];
      for (var e = 0; e < arestas.length; e++) {
        var chave2 = edgeKey(arestas[e][0], arestas[e][1]);
        var lista = edgeMap.get(chave2);
        if (!lista) {
          lista = [];
          edgeMap.set(chave2, lista);
        }
        for (var j = 0; j < lista.length; j++) {
          var outro = lista[j];
          adjacencySets[t2].add(outro);
          adjacencySets[outro].add(t2);
        }
        lista.push(t2);
      }
    }

    var adjacency = adjacencySets.map(function (s) { return Array.from(s); });
    return { adjacency: adjacency, exportVertices: exportVertices, cornerExportIndex: cornerExportIndex };
  }

  // Cor default (cinza) de área sem pintura/atribuição de cor explícita.
  // Mesmo valor de ThreeMFWriter.DEFAULT_COLOR (fonte histórica dessa
  // constante, ver comentário lá), duplicado aqui como literal porque
  // model-parser.js carrega antes de threemf-writer.js na ordem de <script>
  // das páginas que usam os dois módulos, então não dá pra referenciar
  // ThreeMFWriter.DEFAULT_COLOR na hora que este módulo é avaliado.
  var DEFAULT_COLOR = [176, 176, 190];

  function hexColorParaRgb(hex) {
    if (!hex) return null;
    var h = hex.replace("#", "");
    if (h.length < 6) return null;
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }

  // Acha <m:colorgroup id="pid"> dentro de <resources> do doc informado,
  // comparando por nome local (ver filhosDiretosPorNomeLocal) porque o
  // prefixo do namespace de materiais pode variar entre pacotes.
  function acharColorGroupPorId(doc, pid) {
    var resourcesEl = directChild(doc.documentElement, "resources");
    if (!resourcesEl) return null;
    var grupos = filhosDiretosPorNomeLocal(resourcesEl, "colorgroup");
    for (var i = 0; i < grupos.length; i++) {
      if (grupos[i].getAttribute("id") === String(pid)) return grupos[i];
    }
    return null;
  }

  // Lê a cor "de verdade" de cada triângulo originado de extractTriangles3MF
  // (via `origins`, ver resolveObjectTriangles), reabrindo o(s) arquivo(s)
  // .model de onde eles vieram quando necessário (mesmo padrão de resolução
  // de p:path que resolveObjectRecursivo usa pra components externos: cache
  // de doc por path, reaberto do zip só na primeira vez) e olhando o
  // <triangle> exato (índice `origin.localIndex` dentro de
  // <mesh><triangles>) pra decidir a cor:
  //  - pid/p1: resolve contra <m:colorgroup id="pid"> em <resources>,
  //    decodificando o hex "#RRGGBBAA" do <m:color> de índice p1.
  //  - sem pid mas com paint_color (extensão proprietária Bambu/OrcaSlicer):
  //    decodifica o índice de filamento (ThreeMFWriter.paintColorParaFilamentIndex,
  //    inverso de filamentIndexParaPaintColor) e mapeia pra cor via
  //    `projectSettingsConfig.filament_colour[indice-1]` ("#RRGGBB" do Bambu
  //    Studio). Sem projectSettingsConfig (ou sem entrada nesse índice), cai
  //    na cor default (fallback neutro).
  //  - nenhum dos dois: cor default (`corDefault` ou DEFAULT_COLOR) — área
  //    não pintada, herda o extrusor/filamento padrão do objeto.
  // Retorna Promise<Uint8ClampedArray(origins.length*3)>, mesmo formato/ordem
  // de state.baseColors em colorir-3mf.js (triângulo i -> [i*3, i*3+1, i*3+2]).
  function lerCorPorTriangulo(zip, modelDoc, origins, projectSettingsConfig, corDefault) {
    var DEFAULT = corDefault || DEFAULT_COLOR;
    var out = new Uint8ClampedArray(origins.length * 3);

    function setColor(i, rgb) {
      var c = rgb || DEFAULT;
      out[i * 3] = c[0];
      out[i * 3 + 1] = c[1];
      out[i * 3 + 2] = c[2];
    }

    var rootFile = localizarModeloRaiz(zip);
    var rootPath = rootFile ? rootFile.name : null;
    var docCache = {};

    function getDoc(path) {
      if (path === rootPath || path === null || path === undefined) return Promise.resolve(modelDoc);
      if (docCache[path]) return docCache[path];
      var entry = zip.file(path);
      if (!entry) return Promise.resolve(null);
      var promessa = entry.async("text").then(parseXmlDoc);
      docCache[path] = promessa;
      return promessa;
    }

    var promises = origins.map(function (origin, i) {
      if (!origin) {
        setColor(i, DEFAULT);
        return Promise.resolve();
      }
      return getDoc(origin.path).then(function (doc) {
        if (!doc) {
          setColor(i, DEFAULT);
          return;
        }
        var objectEl = findObjectElement(doc, origin.objectId);
        var meshEl = objectEl && directChild(objectEl, "mesh");
        var trianglesEl = meshEl && directChild(meshEl, "triangles");
        var triEls = trianglesEl ? directChildren(trianglesEl, "triangle") : [];
        var triEl = triEls[origin.localIndex];
        if (!triEl) {
          setColor(i, DEFAULT);
          return;
        }

        var pid = triEl.getAttribute("pid");
        var p1 = triEl.getAttribute("p1");
        if (pid && p1 !== null && p1 !== "") {
          var colorGroupEl = acharColorGroupPorId(doc, pid);
          var colorEls = colorGroupEl ? filhosDiretosPorNomeLocal(colorGroupEl, "color") : [];
          var colorEl = colorEls[parseInt(p1, 10)];
          setColor(i, colorEl ? hexColorParaRgb(colorEl.getAttribute("color")) : null);
          return;
        }

        var paintColor = triEl.getAttribute("paint_color");
        if (paintColor) {
          var ThreeMFWriter = window.Wisky3D && window.Wisky3D.ThreeMFWriter;
          var indice = ThreeMFWriter && ThreeMFWriter.paintColorParaFilamentIndex(paintColor);
          var hexBambu = indice && projectSettingsConfig && Array.isArray(projectSettingsConfig.filament_colour)
            ? projectSettingsConfig.filament_colour[indice - 1]
            : null;
          setColor(i, hexBambu ? hexColorParaRgb(hexBambu) : null);
          return;
        }

        setColor(i, DEFAULT);
      });
    });

    return Promise.all(promises).then(function () { return out; });
  }

  window.Wisky3D.ModelParser = {
    parseSTL: parseSTL,
    computeBoundingBox: computeBoundingBox,
    computeMeshVolumeMm3: computeMeshVolumeMm3,
    computeMeshAreaMm2: computeMeshAreaMm2,
    bboxVazio: bboxVazio,
    mergeBBox: mergeBBox,
    directChild: directChild,
    directChildren: directChildren,
    findObjectElement: findObjectElement,
    filhosDiretosPorNomeLocal: filhosDiretosPorNomeLocal,
    localizarModeloRaiz: localizarModeloRaiz,
    localizarArquivoUnico: localizarArquivoUnico,
    baixarBlob: baixarBlob,
    parse3MFPackage: parse3MFPackage,
    extractTriangles3MF: extractTriangles3MF,
    parse3MFPerfil: parse3MFPerfil,
    parsePlateAssignments: parsePlateAssignments,
    calcularChapas: calcularChapas,
    mapearTriangulosParaChapas: mapearTriangulosParaChapas,
    buildAdjacencyAndExportIndex: buildAdjacencyAndExportIndex,
    DEFAULT_COLOR: DEFAULT_COLOR,
    lerCorPorTriangulo: lerCorPorTriangulo
  };
})();
