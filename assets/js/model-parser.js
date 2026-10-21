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
      (p1[0] * (p2[1] * p3[2] - p3[1] * p2[2]) -
        p1[1] * (p2[0] * p3[2] - p3[0] * p2[2]) +
        p1[2] * (p2[0] * p3[1] - p3[0] * p2[1])) /
      6.0
    );
  }

  function computeMeshVolumeMm3(triangles) {
    let total = 0;
    for (let i = 0; i < triangles.length; i++) {
      const t = triangles[i];
      total += signedVolumeOfTriangle(t[0], t[1], t[2]);
    }
    return Math.abs(total);
  }

  function triangleAreaMm2(p1, p2, p3) {
    const ux = p2[0] - p1[0],
      uy = p2[1] - p1[1],
      uz = p2[2] - p1[2];
    const vx = p3[0] - p1[0],
      vy = p3[1] - p1[1],
      vz = p3[2] - p1[2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
  }

  // Área de superfície da malha (soma das áreas dos triângulos), usada pra
  // estimar o volume das paredes (casca), já que o volume total sozinho não
  // diferencia "parede sólida" de "miolo em infill".
  function computeMeshAreaMm2(triangles) {
    let total = 0;
    for (let i = 0; i < triangles.length; i++) {
      const t = triangles[i];
      total += triangleAreaMm2(t[0], t[1], t[2]);
    }
    return total;
  }

  function computeBoundingBox(triangles) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < triangles.length; i++) {
      for (let v = 0; v < 3; v++) {
        const p = triangles[i][v];
        for (let axis = 0; axis < 3; axis++) {
          if (p[axis] < min[axis]) min[axis] = p[axis];
          if (p[axis] > max[axis]) max[axis] = p[axis];
        }
      }
    }
    return {
      minX: min[0],
      minY: min[1],
      minZ: min[2],
      maxX: max[0],
      maxY: max[1],
      maxZ: max[2]
    };
  }

  function detectBinarySTL(buffer) {
    if (buffer.byteLength < 84) return false;
    const dv = new DataView(buffer);
    const triCount = dv.getUint32(80, true);
    const expectedSize = 84 + triCount * 50;
    return buffer.byteLength === expectedSize;
  }

  function parseBinarySTL(buffer) {
    const dv = new DataView(buffer);
    const triCount = dv.getUint32(80, true);
    const triangles = [];
    let offset = 84;
    for (let i = 0; i < triCount; i++) {
      offset += 12; // normal
      const v1 = [dv.getFloat32(offset, true), dv.getFloat32(offset + 4, true), dv.getFloat32(offset + 8, true)];
      offset += 12;
      const v2 = [dv.getFloat32(offset, true), dv.getFloat32(offset + 4, true), dv.getFloat32(offset + 8, true)];
      offset += 12;
      const v3 = [dv.getFloat32(offset, true), dv.getFloat32(offset + 4, true), dv.getFloat32(offset + 8, true)];
      offset += 12;
      offset += 2; // attribute byte count
      triangles.push([v1, v2, v3]);
    }
    return triangles;
  }

  function parseAsciiSTL(text) {
    const triangles = [];
    const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
    let m,
      verts = [];
    while ((m = re.exec(text)) !== null) {
      verts.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
      if (verts.length === 3) {
        triangles.push(verts);
        verts = [];
      }
    }
    return triangles;
  }

  function parseSTL(buffer) {
    if (detectBinarySTL(buffer)) return parseBinarySTL(buffer);
    return parseAsciiSTL(new TextDecoder("utf-8").decode(buffer));
  }

  function countOccurrences(text, segment) {
    let n = 0;
    for (let i = text.indexOf(segment); i !== -1; i = text.indexOf(segment, i + segment.length)) n++;
    return n;
  }

  // Quantos triângulos o STL tem, sem montar a malha: no binário vem no
  // cabeçalho; no ASCII, um por "endfacet".
  function countTrianglesSTL(buffer) {
    if (detectBinarySTL(buffer)) return new DataView(buffer).getUint32(80, true);
    // Direto nos bytes: decodificar para texto aqui e de novo no parseSTL
    // dobraria a memória de um STL ASCII grande.
    const bytes = new Uint8Array(buffer);
    const target = [101, 110, 100, 102, 97, 99, 101, 116]; // "endfacet"
    let n = 0;
    for (let i = 0; i + target.length <= bytes.length; i++) {
      if (bytes[i] !== 101) continue;
      let k = 1;
      while (k < target.length && bytes[i + k] === target[k]) k++;
      if (k === target.length) {
        n++;
        i += target.length - 1;
      }
    }
    return n;
  }

  // Quantos <triangle> há nos .model do pacote, sem interpretar o XML nem
  // montar a malha, para recusar modelos grandes demais antes de alocar
  // milhões de arrays. É uma estimativa: um objeto usado por dois <item>
  // conta uma vez só. Lê um arquivo por vez para não manter todos os textos
  // em memória ao mesmo tempo. `rootXmlText`/`rootPath` (opcionais): o
  // 3dmodel.model raiz já lido, contado sem descompactar de novo.
  function countTriangles3MF(zip, rootXmlText, rootPath) {
    function count(text) {
      return countOccurrences(text, "<triangle ") + countOccurrences(text, "<triangle/");
    }
    const files = zip.file(/\.model$/i).filter(function (file) {
      return rootXmlText == null || file.name !== rootPath;
    });
    return files.reduce(
      function (promise, file) {
        return promise.then(function (total) {
          return file.async("text").then(function (text) {
            return total + count(text);
          });
        });
      },
      Promise.resolve(rootXmlText == null ? 0 : count(rootXmlText))
    );
  }

  const IDENTITY_TRANSFORM = {
    M: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ],
    t: [0, 0, 0]
  };

  // Fator pra converter a unidade declarada no <model unit="..."> pra mm.
  // Fatiadores (Bambu/Orca) sempre gravam em mm, mas o padrão 3MF permite
  // outras unidades. Sem isso, um arquivo em "centimeter" sairia com
  // volume/peso 1000x menor que o real.
  const UNIT_TO_MM = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };

  function parseTransformAttr(str) {
    if (!str) return IDENTITY_TRANSFORM;
    const n = str.trim().split(/\s+/).map(Number);
    if (n.length < 12 || n.some(isNaN)) return IDENTITY_TRANSFORM;
    return {
      M: [
        [n[0], n[3], n[6]],
        [n[1], n[4], n[7]],
        [n[2], n[5], n[8]]
      ],
      t: [n[9], n[10], n[11]]
    };
  }

  function matMul3(A, B) {
    const R = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
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
    const M = matMul3(parent.M, child.M);
    const pmt = matVec3(parent.M, child.t);
    return { M: M, t: [pmt[0] + parent.t[0], pmt[1] + parent.t[1], pmt[2] + parent.t[2]] };
  }

  function applyTransform(p, tr) {
    const v = matVec3(tr.M, p);
    return [v[0] + tr.t[0], v[1] + tr.t[1], v[2] + tr.t[2]];
  }

  function parseXmlDoc(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("xml inválido");
    return doc;
  }

  function directChild(el, tag) {
    for (let i = 0; i < el.childNodes.length; i++) {
      const n = el.childNodes[i];
      if (n.nodeType === 1 && n.nodeName.toLowerCase() === tag) return n;
    }
    return null;
  }

  function directChildren(el, tag) {
    const out = [];
    for (let i = 0; i < el.childNodes.length; i++) {
      const n = el.childNodes[i];
      if (n.nodeType === 1 && n.nodeName.toLowerCase() === tag) out.push(n);
    }
    return out;
  }

  // Carrega (com cache por path) o XML de um arquivo externo do pacote 3MF
  // referenciado por um atributo p:path (de <component> ou, no root model, do
  // próprio <item> de <build> — usado por fatiadores como Bambu Studio/Orca
  // quando cada object/chapa vive no seu próprio arquivo sob 3D/Objects/).
  function loadExternalDoc(zip, docCache, path) {
    const normalizedPath = path.replace(/^\//, "");
    let docPromise = docCache[normalizedPath];
    if (!docPromise) {
      const zipEntry = zip.file(normalizedPath);
      if (!zipEntry) return null;
      docPromise = zipEntry.async("text").then(parseXmlDoc);
      docCache[normalizedPath] = docPromise;
    }
    return { normalizedPath: normalizedPath, docPromise: docPromise };
  }

  function findObjectElement(doc, objectId) {
    const objects = doc.getElementsByTagName("object");
    for (let i = 0; i < objects.length; i++) {
      if (objects[i].getAttribute("id") === String(objectId)) return objects[i];
    }
    return null;
  }

  function emptyBbox() {
    return { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
  }

  function mergeBBox(a, b) {
    return {
      minX: Math.min(a.minX, b.minX),
      minY: Math.min(a.minY, b.minY),
      minZ: Math.min(a.minZ, b.minZ),
      maxX: Math.max(a.maxX, b.maxX),
      maxY: Math.max(a.maxY, b.maxY),
      maxZ: Math.max(a.maxZ, b.maxZ)
    };
  }

  function extendBBox(bbox, p) {
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
  // <triangle> exato a recolorir. `ignoredComponents` (Set de objectid,
  // opcional) vale só para os <component> deste nível: ver
  // parseNonSolidParts.
  function resolveObjectRecursive(
    zip,
    docCache,
    doc,
    objectId,
    accumTransform,
    path,
    onMesh,
    rootObjectId,
    ignoredComponents
  ) {
    const objectEl = findObjectElement(doc, objectId);
    if (!objectEl) return Promise.resolve();
    if (rootObjectId === undefined) rootObjectId = objectId;

    const meshEl = directChild(objectEl, "mesh");
    if (meshEl) {
      const verticesEl = directChild(meshEl, "vertices");
      const trianglesEl = directChild(meshEl, "triangles");
      const vertexEls = verticesEl ? directChildren(verticesEl, "vertex") : [];
      const meshBbox = emptyBbox();
      const vertices = vertexEls.map(function (v) {
        const p = applyTransform(
          [parseFloat(v.getAttribute("x")), parseFloat(v.getAttribute("y")), parseFloat(v.getAttribute("z"))],
          accumTransform
        );
        extendBBox(meshBbox, p);
        return p;
      });
      const triEls = trianglesEl ? directChildren(trianglesEl, "triangle") : [];
      const leafTriangles = [];
      const localIndices = [];
      triEls.forEach(function (t, localIndex) {
        const i1 = parseInt(t.getAttribute("v1"), 10);
        const i2 = parseInt(t.getAttribute("v2"), 10);
        const i3 = parseInt(t.getAttribute("v3"), 10);
        if (vertices[i1] && vertices[i2] && vertices[i3]) {
          leafTriangles.push([vertices[i1], vertices[i2], vertices[i3]]);
          localIndices.push(localIndex);
        }
      });
      if (vertexEls.length) onMesh(leafTriangles, localIndices, meshBbox, path, objectId, rootObjectId);
    }

    const componentsEl = directChild(objectEl, "components");
    if (!componentsEl) return Promise.resolve();

    const components = directChildren(componentsEl, "component").filter(function (comp) {
      return !ignoredComponents || !ignoredComponents.has(comp.getAttribute("objectid"));
    });
    const promises = components.map(function (comp) {
      const childObjectId = comp.getAttribute("objectid");
      const childTransform = parseTransformAttr(comp.getAttribute("transform"));
      const combined = composeTransform(accumTransform, childTransform);
      const compPath = comp.getAttribute("p:path");

      if (compPath) {
        const external = loadExternalDoc(zip, docCache, compPath);
        if (!external) return Promise.resolve();
        return external.docPromise.then(function (extDoc) {
          return resolveObjectRecursive(
            zip,
            docCache,
            extDoc,
            childObjectId,
            combined,
            external.normalizedPath,
            onMesh,
            rootObjectId
          );
        });
      }
      return resolveObjectRecursive(zip, docCache, doc, childObjectId, combined, path, onMesh, rootObjectId);
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
  function resolveObjectGeometry(zip, docCache, doc, objectId, accumTransform, ignoredComponents) {
    let triangleCount = 0;
    let volumeMm3 = 0;
    let areaMm2 = 0;
    let bbox = emptyBbox();

    function onMesh(leafTriangles, localIndices, meshBbox) {
      bbox = mergeBBox(bbox, meshBbox);
      if (leafTriangles.length) {
        volumeMm3 += computeMeshVolumeMm3(leafTriangles);
        areaMm2 += computeMeshAreaMm2(leafTriangles);
        triangleCount += leafTriangles.length;
      }
    }

    return resolveObjectRecursive(
      zip,
      docCache,
      doc,
      objectId,
      accumTransform,
      null,
      onMesh,
      undefined,
      ignoredComponents
    ).then(function () {
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
  function parseNonSolidParts(modelSettingsText) {
    if (!modelSettingsText || typeof DOMParser === "undefined") return null;
    try {
      const doc = new DOMParser().parseFromString(modelSettingsText, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) return null;
      const byObject = new Map();
      const objects = doc.getElementsByTagName("object");
      for (let i = 0; i < objects.length; i++) {
        const parts = directChildren(objects[i], "part");
        for (let j = 0; j < parts.length; j++) {
          const subtype = parts[j].getAttribute("subtype");
          if (!subtype || subtype === "normal_part") continue;
          const objectId = objects[i].getAttribute("id");
          if (!byObject.has(objectId)) byObject.set(objectId, new Set());
          byObject.get(objectId).add(parts[j].getAttribute("id"));
        }
      }
      return byObject.size ? byObject : null;
    } catch (e) {
      return null;
    }
  }

  // `modelSettingsText` (opcional) é o Metadata/model_settings.config: ver
  // parseNonSolidParts.
  function parse3MFPackage(zip, rootXmlText, modelSettingsText) {
    const doc = parseXmlDoc(rootXmlText);
    const nonSolidParts = parseNonSolidParts(modelSettingsText);
    const unitAttr = doc.documentElement.getAttribute("unit");
    const scale = UNIT_TO_MM[unitAttr] || 1;
    const docCache = {};
    const buildEl = doc.getElementsByTagName("build")[0];
    const itemEls = buildEl ? directChildren(buildEl, "item") : [];

    // Sem <build>/<item> (raro): trata cada <object> de nível topo como se
    // fosse um item, sem transform.
    const items = itemEls.length
      ? itemEls
      : Array.prototype.map.call(doc.getElementsByTagName("object"), function (o) {
          return {
            getAttribute: function (name) {
              return name === "objectid" ? o.getAttribute("id") : null;
            }
          };
        });

    const objectIds = items.map(function (item) {
      return item.getAttribute("objectid");
    });
    const translations = items.map(function (item) {
      return parseTransformAttr(item.getAttribute("transform")).t;
    });
    const promises = items.map(function (item) {
      const transform = parseTransformAttr(item.getAttribute("transform"));
      const objectId = item.getAttribute("objectid");
      // 3MF Production Extension: <item> também pode apontar pra um arquivo
      // externo via p:path (padrão do Bambu Studio/Orca pra separar cada
      // object/chapa em 3D/Objects/*.model), não só <component> (ver
      // resolveObjectRecursive). Sem isso, o objectId do item era buscado só
      // no doc raiz e, se coincidisse por acaso com outro object definido
      // ali, a geometria errada (de outra chapa) era resolvida.
      const itemPath = item.getAttribute("p:path");
      // Os ids de model_settings.config são os do 3dmodel.model raiz: um item
      // com p:path aponta para um id de outro arquivo.
      const ignored = nonSolidParts && !itemPath ? nonSolidParts.get(objectId) : undefined;
      if (itemPath) {
        const external = loadExternalDoc(zip, docCache, itemPath);
        if (!external) return Promise.resolve({ triangleCount: 0, volumeMm3: 0, areaMm2: 0, bbox: emptyBbox() });
        return external.docPromise.then(function (extDoc) {
          return resolveObjectGeometry(zip, docCache, extDoc, objectId, transform, ignored);
        });
      }
      return resolveObjectGeometry(zip, docCache, doc, objectId, transform, ignored);
    });

    return Promise.all(promises).then(function (results) {
      let triangleCount = 0;
      let volumeMm3 = 0;
      let areaMm2 = 0;
      let bbox = emptyBbox();
      results.forEach(function (r) {
        triangleCount += r.triangleCount;
        areaMm2 += r.areaMm2;
        volumeMm3 += r.volumeMm3;
        bbox = mergeBBox(bbox, r.bbox);
      });
      function scaleBBox(b) {
        return {
          minX: b.minX * scale,
          minY: b.minY * scale,
          minZ: b.minZ * scale,
          maxX: b.maxX * scale,
          maxY: b.maxY * scale,
          maxZ: b.maxZ * scale
        };
      }
      return {
        triangleCount: triangleCount,
        volumeMm3: volumeMm3 * scale * scale * scale,
        areaMm2: areaMm2 * scale * scale,
        bbox: scaleBBox(bbox),
        // bbox de cada item de nível topo (build item), na ordem de `items`.
        // Usado pra separar por chapa/plate em arquivos multi-plate (ver
        // converter-3mf.js), já que o bbox combinado acima soma objetos que
        // na real impressora nunca ficam juntos na mesma mesa.
        // `position` é a translação do item: a mesma que repositionByPlate
        // usa para achar a célula da grade.
        items: results.map(function (r, i) {
          return {
            objectId: objectIds[i],
            bbox: scaleBBox(r.bbox),
            position: [translations[i][0] * scale, translations[i][1] * scale]
          };
        })
      };
    });
  }

  // Mesma travessia de <object>/<components> do resolveObjectGeometry acima
  // (resolveObjectRecursive), mas guardando os triângulos (com transform já
  // aplicado) em vez de só agregados. Usado pela ferramenta de colorir, que
  // precisa da malha de verdade pra pintar, não só volume/bbox.
  // `outOrigins` acompanha `outTriangles` índice a índice com {path,
  // objectId, rootObjectId, localIndex}. localIndex é a posição do triângulo
  // dentro do <triangles> original daquele object/arquivo; `objectId` é o
  // object-folha (usado na exportação pra reabrir o pacote 3MF original e
  // escrever a cor de volta no <triangle> exato de onde veio); `rootObjectId`
  // é o objectid do build item de nível topo (usado pra casar o triângulo com
  // a chapa/plate a que pertence, ver mapTrianglesToPlates) — os dois
  // divergem quando o object de topo é montado via <components> aninhados.
  function resolveObjectTriangles(
    zip,
    docCache,
    doc,
    objectId,
    accumTransform,
    outTriangles,
    path,
    outOrigins,
    ignoredComponents
  ) {
    function onMesh(leafTriangles, localIndices, meshBbox, meshPath, meshObjectId, rootObjectId) {
      leafTriangles.forEach(function (tri, i) {
        outTriangles.push(tri);
        outOrigins.push({
          path: meshPath,
          objectId: meshObjectId,
          rootObjectId: rootObjectId,
          localIndex: localIndices[i]
        });
      });
    }

    return resolveObjectRecursive(
      zip,
      docCache,
      doc,
      objectId,
      accumTransform,
      path,
      onMesh,
      undefined,
      ignoredComponents
    );
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
  // parseNonSolidParts).
  function extractTriangles3MF(zip, rootXmlText, rootPath, modelSettingsText) {
    const doc = parseXmlDoc(rootXmlText);
    const nonSolidParts = parseNonSolidParts(modelSettingsText);
    const unitAttr = doc.documentElement.getAttribute("unit");
    const scale = UNIT_TO_MM[unitAttr] || 1;
    const docCache = {};
    const buildEl = doc.getElementsByTagName("build")[0];
    const itemEls = buildEl ? directChildren(buildEl, "item") : [];
    const items = itemEls.length
      ? itemEls
      : Array.prototype.map.call(doc.getElementsByTagName("object"), function (o) {
          return {
            getAttribute: function (name) {
              return name === "objectid" ? o.getAttribute("id") : null;
            }
          };
        });

    const triangles = [];
    const origins = [];
    const promises = items.map(function (item) {
      const transform = parseTransformAttr(item.getAttribute("transform"));
      const objectId = item.getAttribute("objectid");
      // Mesmo caso de parse3MFPackage: <item> do build raiz também pode
      // apontar pra um arquivo externo via p:path (objeto/chapa que vive em
      // 3D/Objects/*.model em vez de dentro do 3dmodel.model raiz). Sem
      // tratar isso aqui, os triângulos (e o `path` guardado em origins, que
      // a exportação usa pra reabrir e repintar o arquivo certo) vinham do
      // doc/arquivo errado.
      const itemPath = item.getAttribute("p:path");
      if (itemPath) {
        const external = loadExternalDoc(zip, docCache, itemPath);
        if (!external) return Promise.resolve();
        return external.docPromise.then(function (extDoc) {
          return resolveObjectTriangles(
            zip,
            docCache,
            extDoc,
            objectId,
            transform,
            triangles,
            external.normalizedPath,
            origins
          );
        });
      }
      const ignored = nonSolidParts ? nonSolidParts.get(objectId) : undefined;
      return resolveObjectTriangles(zip, docCache, doc, objectId, transform, triangles, rootPath, origins, ignored);
    });

    return Promise.all(promises).then(function () {
      if (scale !== 1) {
        // Triângulos vizinhos compartilham o mesmo array de vértice: sem
        // marcar os já escalados, cada vértice seria multiplicado uma vez
        // por triângulo que o usa.
        const scaled = new Set();
        triangles.forEach(function (tri) {
          tri.forEach(function (p) {
            if (scaled.has(p)) return;
            scaled.add(p);
            p[0] *= scale;
            p[1] *= scale;
            p[2] *= scale;
          });
        });
      }
      return { triangles: triangles, origins: origins };
    });
  }

  // Acha o 3dmodel.model dentro de um pacote 3MF (JSZip já carregado). Tenta
  // primeiro o caminho padrão (3D/3dmodel.model); alguns pacotes de terceiros
  // usam outro caminho, daí o fallback por nome de arquivo em qualquer pasta.
  function findRootModel(zip) {
    let files = zip.file(/(^|\/)3D\/3dmodel\.model$/i);
    if (!files.length) files = zip.file(/3dmodel\.model$/i);
    return files.length ? files[0] : null;
  }

  // Acha um arquivo de Metadata/ pelo nome (ex.: "project_settings.config"),
  // em qualquer subpasta do pacote. Ancorado no início do nome do arquivo
  // (precedido só por "/" ou início da string) para não casar por engano com
  // um arquivo tipo "meuproject_settings.config".
  function findUniqueFile(zip, fileName) {
    const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const files = zip.file(new RegExp("(^|/)" + escaped + "$", "i"));
    return files.length ? files[0] : null;
  }

  // Baixa um blob como arquivo, revogando a URL temporária logo depois. O
  // setTimeout (em vez de revogar na hora) evita cortar o download em
  // navegadores que só começam a gravar o arquivo de fato um instante depois
  // do clique sintético.
  function downloadBlob(blob, fileName) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function parse3MFProfile(configText) {
    const densityMatch = configText.match(/"filament_density"\s*:\s*\[\s*"([\d.]+)"/);
    const diameterMatch = configText.match(/"filament_diameter"\s*:\s*\[\s*"([\d.]+)"/);
    const wallsMatch = configText.match(/"wall_loops"\s*:\s*"?(\d+)"?/);
    const infillMatch = configText.match(/"sparse_infill_density"\s*:\s*"?(\d+(?:\.\d+)?)%?"?/);
    if (!densityMatch) return null;
    return {
      walls: wallsMatch ? parseInt(wallsMatch[1], 10) : null,
      infillPct: infillMatch ? parseFloat(infillMatch[1]) : null,
      density: parseFloat(densityMatch[1]),
      diameter: diameterMatch ? parseFloat(diameterMatch[1]) : null
    };
  }

  // Um 3MF pode conter várias chapas independentes (plates), cada uma com seu
  // próprio arranjo de peças. Sem isso, o bbox combinado de todas as chapas
  // dava um "tamanho" maior que qualquer mesa real e gerava avisos de encaixe
  // falsos. Lê Metadata/model_settings.config e devolve, por chapa, a lista de
  // object_id das peças que pertencem a ela (ou null se o arquivo não tem
  // metadados de chapa, caso de projetos com uma chapa só). Com
  // `keepEmpty`, mesas sem peças continuam na lista (vazias), para o
  // índice ser o da mesa, e uma mesa só também volta.
  function parsePlateAssignments(modelSettingsText, keepEmpty) {
    if (!modelSettingsText || typeof DOMParser === "undefined") return null;
    try {
      const doc = new DOMParser().parseFromString(modelSettingsText, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) return null;
      const plateEls = doc.getElementsByTagName("plate");
      if (!plateEls.length) return null;

      const plates = [];
      for (let i = 0; i < plateEls.length; i++) {
        const instances = plateEls[i].getElementsByTagName("model_instance");
        const ids = [];
        for (let j = 0; j < instances.length; j++) {
          const metas = instances[j].getElementsByTagName("metadata");
          for (let k = 0; k < metas.length; k++) {
            if (metas[k].getAttribute("key") === "object_id") {
              ids.push(metas[k].getAttribute("value"));
            }
          }
        }
        if (ids.length || keepEmpty) plates.push(ids);
      }
      if (keepEmpty) return plates.length ? plates : null;
      return plates.length > 1 ? plates : null;
    } catch (e) {
      return null;
    }
  }

  // Junta o bbox dos itens (retornados por parse3MFPackage) de acordo com a
  // lista de object_id de cada chapa, gerando um bbox por chapa em vez de um
  // bbox único pra todo o arquivo.
  function calculatePlates(items, plateAssignments) {
    if (!plateAssignments || !items) return null;
    const plates = plateAssignments
      .map(function (ids, index) {
        let bbox = null;
        items.forEach(function (item) {
          if (ids.indexOf(item.objectId) !== -1) {
            // Mescla o bbox do item com o bbox acumulado da chapa
            if (!bbox) bbox = item.bbox;
            else if (item.bbox) bbox = mergeBBox(bbox, item.bbox);
          }
        });
        return { index: index + 1, bbox: bbox };
      })
      .filter(function (plate) {
        return plate.bbox;
      });
    return plates.length > 1 ? plates : null;
  }

  // Retângulo {x0, x1, y0, y1} que contém os pontos de uma lista de "XxY"
  // (cada item pode ter vários pontos separados por vírgula, como no
  // extruder_printable_area). null sem nenhum ponto válido.
  function pointBounds(points) {
    const xs = [];
    const ys = [];
    [].concat(points || []).forEach(function (segment) {
      String(segment)
        .split(",")
        .forEach(function (pair) {
          const xy = pair.split("x").map(Number);
          if (xy.length === 2 && !isNaN(xy[0]) && !isNaN(xy[1])) {
            xs.push(xy[0]);
            ys.push(xy[1]);
          }
        });
    });
    if (!xs.length) return null;
    return {
      x0: Math.min.apply(null, xs),
      x1: Math.max.apply(null, xs),
      y0: Math.min.apply(null, ys),
      y1: Math.max.apply(null, ys)
    };
  }

  // Centro e passo da grade de mesas a partir do printable_area do perfil
  // (lista de "XxY", ex.: ["0x0","256x0","256x256","0x256"]).
  function plateGrid(printableArea) {
    if (!Array.isArray(printableArea)) return null;
    const m = pointBounds(printableArea);
    if (!m || !(m.x1 > m.x0 && m.y1 > m.y0)) return null;
    return {
      x0: m.x0,
      x1: m.x1,
      y0: m.y0,
      y1: m.y1,
      cx: (m.x0 + m.x1) / 2,
      cy: (m.y0 + m.y1) / 2,
      stepX: 1.2 * (m.x1 - m.x0),
      stepY: 1.2 * (m.y1 - m.y0)
    };
  }

  // Célula (coluna, linha) da grade da origem em que está o ponto (x, y) e o
  // deslocamento [dx, dy] que o leva para a mesma célula no destino,
  // mantendo o afastamento do centro da mesa (ver repositionByPlate).
  function targetCell(x, y, a, b) {
    const column = Math.round((x - a.cx) / a.stepX);
    const row = Math.round((y - a.cy) / a.stepY);
    return {
      column: column,
      row: row,
      dx: b.cx - a.cx + column * (b.stepX - a.stepX),
      dy: b.cy - a.cy + row * (b.stepY - a.stepY)
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
  function repositionByPlate(modelText, sourcePrintableArea, targetPrintableArea) {
    const a = plateGrid(sourcePrintableArea);
    const b = plateGrid(targetPrintableArea);
    if (!a || !b) return null;
    return modelText.replace(/(<item\b[^>]*\btransform=")([^"]*)(")/g, function (whole, start, transform, end) {
      const parts = transform.trim().split(/\s+/);
      const x = Number(parts[9]);
      const y = Number(parts[10]);
      if (parts.length !== 12 || isNaN(x) || isNaN(y)) return whole;
      const cell = targetCell(x, y, a, b);
      parts[9] = String(+(x + cell.dx).toFixed(6));
      parts[10] = String(+(y + cell.dy).toFixed(6));
      return start + parts.join(" ") + end;
    });
  }

  // Pegada [x0, y0, x1, y1] de cada item no destino, em coordenadas da mesa
  // dele, agrupada por mesa. `items` são os de parse3MFPackage (bbox global e
  // posição na origem), `plates` a lista de object_id por mesa de
  // parsePlateAssignments com keepEmpty (null: tudo na mesa 1). A pegada
  // anda o mesmo que repositionByPlate anda o item, e perde a célula da
  // grade do destino.
  function footprintsByPlate(items, plates, sourcePrintableArea, targetPrintableArea, plateCount) {
    const a = plateGrid(sourcePrintableArea);
    const b = plateGrid(targetPrintableArea);
    const byPlate = [];
    for (let i = 0; i < plateCount; i++) byPlate.push([]);
    if (!a || !b) return byPlate;
    (items || []).forEach(function (item) {
      const c = item.bbox;
      if (!c || !(c.maxX >= c.minX)) return;
      let index = 0;
      if (plates) {
        index = -1;
        for (let k = 0; k < plates.length; k++) {
          if (plates[k].indexOf(item.objectId) !== -1) {
            index = k;
            break;
          }
        }
      }
      if (index < 0 || index >= plateCount) return;
      const p = item.position || [(c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2];
      const cell = targetCell(p[0], p[1], a, b);
      const dx = cell.dx - cell.column * b.stepX;
      const dy = cell.dy - cell.row * b.stepY;
      byPlate[index].push([c.minX + dx, c.minY + dy, c.maxX + dx, c.maxY + dy]);
    });
    return byPlate;
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
  const TOWER = { side: 40, margin: 6, clearance: 6, step: 5 };

  function firstNumber(value) {
    return parseFloat([].concat(value == null ? [] : value)[0]);
  }

  function towerRegion(config) {
    let m = pointBounds(config.printable_area);
    if (!m) return null;
    [].concat(config.extruder_printable_area || []).forEach(function (area) {
      const e = pointBounds(area);
      if (e)
        m = { x0: Math.max(m.x0, e.x0), x1: Math.min(m.x1, e.x1), y0: Math.max(m.y0, e.y0), y1: Math.min(m.y1, e.y1) };
    });
    if (!(m.x1 > m.x0 && m.y1 > m.y0)) return null;
    // A lista pode trazer vários retângulos emendados num contorno só, de 4
    // em 4 pontos, com trechos de largura zero entre eles (Qidi X-Max 4: 4
    // cantos; Anycubic Kobra 3: 4 bordas). Retângulo com metade da mesa ou
    // mais é o contorno, não uma área proibida.
    const forbidden = [];
    const plateArea = (m.x1 - m.x0) * (m.y1 - m.y0);
    ["bed_exclude_area", "wrapping_exclude_area"].forEach(function (field) {
      let points = [];
      [].concat(config[field] || []).forEach(function (segment) {
        points = points.concat(String(segment).split(","));
      });
      for (let i = 0; i + 4 <= points.length; i += 4) {
        const e = pointBounds(points.slice(i, i + 4));
        if (e && e.x1 > e.x0 && e.y1 > e.y0 && (e.x1 - e.x0) * (e.y1 - e.y0) < plateArea / 2)
          forbidden.push([e.x0, e.y0, e.x1, e.y1]);
      }
    });
    return { lim: m, forbidden: forbidden };
  }

  // Retângulo que a torre ocupa em relação a (wipe_tower_x, wipe_tower_y),
  // girado no sentido anti-horário como no fatiador.
  function towerFootprint(config) {
    const width = Math.max(TOWER.side, firstNumber(config.prime_tower_width) || 0);
    const angle = ((firstNumber(config.wipe_tower_rotation_angle) || 0) * Math.PI) / 180;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const corners = [
      [0, 0],
      [width, 0],
      [0, TOWER.side],
      [width, TOWER.side]
    ].map(function (p) {
      return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
    });
    function round3(v) {
      return Math.round(v * 1000) / 1000;
    }
    const xs = corners.map(function (p) {
      return p[0];
    });
    const ys = corners.map(function (p) {
      return p[1];
    });
    return [
      round3(Math.min.apply(null, xs)),
      round3(Math.min.apply(null, ys)),
      round3(Math.max.apply(null, xs)),
      round3(Math.max.apply(null, ys))
    ];
  }

  function towerSpot(config, pieces, candidates) {
    const region = towerRegion(config);
    if (!region) return null;
    const lim = region.lim,
      M = TOWER.margin,
      F = TOWER.clearance,
      t = towerFootprint(config);
    const obstacles = pieces
      .map(function (c) {
        return [c[0] - F, c[1] - F, c[2] + F, c[3] + F];
      })
      .concat(region.forbidden);
    // posições (x, y) em que a torre inteira, com a margem, fica na mesa
    const xMin = lim.x0 - t[0] + M,
      xMax = lim.x1 - t[2] - M;
    const yMin = lim.y0 - t[1] + M,
      yMax = lim.y1 - t[3] - M;
    // área da torre (com a margem) em cima de peças ou de áreas proibidas
    function overlap(x, y) {
      let total = 0;
      for (let i = 0; i < obstacles.length; i++) {
        const c = obstacles[i];
        const w = Math.min(x + t[2] + M, c[2]) - Math.max(x + t[0] - M, c[0]);
        const h = Math.min(y + t[3] + M, c[3]) - Math.max(y + t[1] - M, c[1]);
        if (w > 0 && h > 0) total += w * h;
      }
      return total;
    }
    function isFree(x, y) {
      return x >= xMin && x <= xMax && y >= yMin && y <= yMax && overlap(x, y) === 0;
    }
    const valid = candidates.filter(Boolean);
    for (let k = 0; k < valid.length; k++) {
      if (isFree(valid[k][0], valid[k][1])) return valid[k];
    }
    // o ponto livre mais perto da referência; mesa cheia: o que menos cobre
    const ref = valid[0] || [xMin, yMax];
    let best = null,
      minOverlap = Infinity,
      minDist = Infinity;
    for (let x = xMin; x <= xMax; x += TOWER.step) {
      for (let y = yMin; y <= yMax; y += TOWER.step) {
        const covered = overlap(x, y);
        const dist = (x - ref[0]) * (x - ref[0]) + (y - ref[1]) * (y - ref[1]);
        if (covered < minOverlap || (covered === minOverlap && dist < minDist)) {
          best = [x, y];
          minOverlap = covered;
          minDist = dist;
        }
      }
    }
    if (best) return best;
    // mesa menor que a torre: fica na referência, só puxada para dentro
    if (!valid.length) return null;
    return [
      Math.min(Math.max(ref[0], xMin), Math.max(xMin, xMax)),
      Math.min(Math.max(ref[1], yMin), Math.max(yMin, yMax))
    ];
  }

  // `sourceConfig` é o project_settings.config original (torre do autor, mesa
  // de origem), `targetConfig` o já convertido (mesa, áreas e bicos do
  // destino, torre configurada no processo), `targetBase` o perfil de
  // destino (torre de fábrica) e `footprints` o de footprintsByPlate. Devolve null
  // sem torre: desligada ou com um filamento só, não há troca e o fatiador
  // não a imprime.
  function placeTowers(sourceConfig, targetConfig, targetBase, footprints) {
    const enabled =
      String([].concat(targetConfig.enable_prime_tower == null ? "1" : targetConfig.enable_prime_tower)[0]) !== "0";
    const filamentCount = [].concat(targetConfig.filament_colour || []).length;
    if (!enabled || filamentCount < 2 || sourceConfig.wipe_tower_x == null || sourceConfig.wipe_tower_y == null)
      return null;
    const a = plateGrid(sourceConfig.printable_area);
    const b = plateGrid(targetConfig.printable_area);
    if (!a || !b) return null;
    const xs = [].concat(sourceConfig.wipe_tower_x);
    const ys = [].concat(sourceConfig.wipe_tower_y);
    let factory = [firstNumber(targetBase.wipe_tower_x), firstNumber(targetBase.wipe_tower_y)];
    if (isNaN(factory[0]) || isNaN(factory[1])) factory = null;

    // Sem lugar calculado (região da torre inválida no perfil), a torre só
    // acompanha as peças, como em repositionTowers.
    const simple = repositionTowers(sourceConfig, sourceConfig.printable_area, targetConfig.printable_area);
    const simpleX = [].concat(simple.wipe_tower_x),
      simpleY = [].concat(simple.wipe_tower_y);
    const newX = [],
      newY = [];
    for (let i = 0; i < xs.length; i++) {
      let author = [parseFloat(xs[i]) + b.cx - a.cx, parseFloat(ys[Math.min(i, ys.length - 1)]) + b.cy - a.cy];
      if (isNaN(author[0]) || isNaN(author[1])) author = null;
      const spot = towerSpot(targetConfig, footprints[i] || [], [author, factory]);
      newX.push(spot ? String(+spot[0].toFixed(3)) : simpleX[i]);
      newY.push(spot ? String(+spot[1].toFixed(3)) : simpleY[Math.min(i, simpleY.length - 1)]);
    }
    return {
      wipe_tower_x: Array.isArray(sourceConfig.wipe_tower_x) ? newX : newX[0],
      wipe_tower_y: Array.isArray(sourceConfig.wipe_tower_y) ? newY : newY[0]
    };
  }

  // A posição da torre de purga (wipe_tower_x/y, uma por mesa, em
  // coordenadas da própria mesa) acompanha o deslocamento que
  // repositionByPlate dá às peças, para não cair em cima delas, e é
  // limitada à mesa de destino. Devolve null sem torre ou sem área de mesa.
  function repositionTowers(config, sourcePrintableArea, targetPrintableArea) {
    const a = plateGrid(sourcePrintableArea);
    const b = plateGrid(targetPrintableArea);
    if (!a || !b || config.wipe_tower_x == null || config.wipe_tower_y == null) return null;
    const width = parseFloat(config.prime_tower_width) || 35;

    function move(value, delta, minimum, maximum) {
      const n = parseFloat(value);
      if (isNaN(n)) return value;
      return String(+Math.min(Math.max(n + delta, minimum), Math.max(minimum, maximum - width)).toFixed(4));
    }
    function moveAll(values, delta, minimum, maximum) {
      if (!Array.isArray(values)) return move(values, delta, minimum, maximum);
      return values.map(function (v) {
        return move(v, delta, minimum, maximum);
      });
    }

    return {
      wipe_tower_x: moveAll(config.wipe_tower_x, b.cx - a.cx, b.x0, b.x1),
      wipe_tower_y: moveAll(config.wipe_tower_y, b.cy - a.cy, b.y0, b.y1)
    };
  }

  // Opções de processo que o Bambu Studio grava com um valor por variante de
  // bico (print_extruder_variant).
  const PROCESS_OPTIONS_PER_VARIANT = [
    "bridge_speed",
    "default_acceleration",
    "enable_height_slowdown",
    "enable_overhang_speed",
    "gap_infill_speed",
    "initial_layer_acceleration",
    "initial_layer_infill_speed",
    "initial_layer_speed",
    "initial_layer_travel_acceleration",
    "inner_wall_acceleration",
    "inner_wall_speed",
    "internal_solid_infill_speed",
    "outer_wall_acceleration",
    "outer_wall_speed",
    "overhang_1_4_speed",
    "overhang_2_4_speed",
    "overhang_3_4_speed",
    "overhang_4_4_speed",
    "overhang_totally_speed",
    "slowdown_end_acc",
    "slowdown_end_height",
    "slowdown_end_speed",
    "slowdown_start_acc",
    "slowdown_start_height",
    "slowdown_start_speed",
    "small_perimeter_speed",
    "small_perimeter_threshold",
    "sparse_infill_acceleration",
    "sparse_infill_speed",
    "support_interface_speed",
    "support_speed",
    "top_solid_infill_flow_ratio",
    "top_surface_acceleration",
    "top_surface_speed",
    "travel_acceleration",
    "travel_short_distance_acceleration",
    "travel_speed",
    "travel_speed_z",
    "vertical_shell_speed"
  ];

  // Opções de filamento por variante de bico sem o prefixo filament_.
  const FILAMENT_OPTIONS_PER_VARIANT = [
    "long_retractions_when_ec",
    "nozzle_temperature",
    "nozzle_temperature_initial_layer",
    "override_process_overhang_speed",
    "retraction_distances_when_ec",
    "slow_down_min_speed",
    "volumetric_speed_coefficients"
  ];

  // Mapa de filamento por bico do Bambu Studio (H2D, H2C), sem sentido numa
  // impressora que não os tem.
  const NOZZLE_MAPS = [
    "filament_nozzle_map",
    "filament_volume_map",
    "filament_extruder_compatibility",
    "enable_filament_dynamic_map"
  ];

  // O Bambu Studio grava um valor por variante de bico (Standard, High
  // Flow...) em parte das opções de filamento (filament_self_index diz de que
  // filamento é cada valor) e de processo (um por print_extruder_variant).
  // Com variantes que a impressora de destino não tem, o fatiador de destino
  // não casa os filamentos com os bicos e imprime tudo no primeiro. Ficam só
  // os valores das variantes do destino (ou o primeiro de cada filamento),
  // como o fatiador faz ao importar o projeto, no formato do perfil de
  // destino. Devolve uma cópia de `config`.
  function adjustNozzleVariants(config, targetBase) {
    const adjusted = {};
    Object.keys(config).forEach(function (k) {
      if (NOZZLE_MAPS.indexOf(k) !== -1 && !Object.prototype.hasOwnProperty.call(targetBase, k)) return;
      adjusted[k] = config[k];
    });
    clampFilamentMap(adjusted, targetBase);
    adjustProcessVariants(adjusted, config, targetBase);
    adjustFilamentVariants(adjusted, config, targetBase);
    return adjusted;
  }

  // filament_map aponta cada filamento para um extrusor (1, 2...); os que
  // o destino não tem vão para o primeiro.
  function clampFilamentMap(adjusted, targetBase) {
    const extruderCount = [].concat(targetBase.nozzle_diameter || []).length;
    if (Array.isArray(adjusted.filament_map) && extruderCount) {
      adjusted.filament_map = adjusted.filament_map.map(function (v) {
        return parseInt(v, 10) > extruderCount ? "1" : v;
      });
    }
  }

  // Um valor por print_extruder_variant: escolhe, para cada variante do
  // destino, o índice da origem com a mesma variante (e o mesmo extrusor,
  // quando os dois lados informam print_extruder_id).
  function adjustProcessVariants(adjusted, config, targetBase) {
    const pev = config.print_extruder_variant;
    const pid = config.print_extruder_id;
    if (Array.isArray(pev) && pev.length) {
      const dev = Array.isArray(targetBase.print_extruder_variant) ? targetBase.print_extruder_variant : [pev[0]];
      const did = Array.isArray(targetBase.print_extruder_id) ? targetBase.print_extruder_id : null;
      const chosen = dev.map(function (variant, j) {
        for (let i = 0; i < pev.length; i++) {
          if (pev[i] === variant && did && pid && pid[i] === did[j]) return i;
        }
        const same = pev.indexOf(variant);
        return same === -1 ? 0 : same;
      });
      const identical =
        chosen.length === pev.length &&
        chosen.every(function (i, j) {
          return i === j && (!did || !pid || pid[i] === did[j]);
        });
      if (!identical) {
        PROCESS_OPTIONS_PER_VARIANT.forEach(function (k) {
          const v = adjusted[k];
          if (!Array.isArray(v) || v.length !== pev.length) return;
          const singleValue = Object.prototype.hasOwnProperty.call(targetBase, k) && !Array.isArray(targetBase[k]);
          adjusted[k] = singleValue
            ? v[chosen[0]]
            : chosen.map(function (i) {
                return v[i];
              });
        });
        adjusted.print_extruder_variant = dev.slice();
        adjusted.print_extruder_id = did
          ? did.slice()
          : chosen.map(function (i) {
              return pid ? pid[i] : "1";
            });
      }
    }
  }

  // filament_self_index diz de que filamento é cada valor. Ficam os valores
  // das variantes do destino, ou o primeiro de cada filamento.
  function adjustFilamentVariants(adjusted, config, targetBase) {
    const targetVariants =
      targetBase.printer_extruder_variant ||
      targetBase.extruder_variant_list ||
      targetBase.print_extruder_variant ||
      [];
    const fev = config.filament_extruder_variant;
    const fsi = config.filament_self_index;
    if (Array.isArray(fev) && Array.isArray(fsi) && fev.length === fsi.length) {
      const byFilament = {};
      const order = [];
      fsi.forEach(function (s, i) {
        if (!byFilament[s]) {
          byFilament[s] = [];
          order.push(s);
        }
        byFilament[s].push(i);
      });
      const keep = [];
      const newVariants = [];
      const newIndexes = [];
      order.forEach(function (s, f) {
        const fromTarget = byFilament[s].filter(function (i) {
          return targetVariants.indexOf(fev[i]) !== -1;
        });
        if (!fromTarget.length) {
          keep.push(byFilament[s][0]);
          newVariants.push(targetVariants[0] || fev[byFilament[s][0]]);
          newIndexes.push(String(f + 1));
          return;
        }
        fromTarget.forEach(function (i) {
          keep.push(i);
          newVariants.push(fev[i]);
          newIndexes.push(String(f + 1));
        });
      });
      const changed =
        keep.length !== fev.length ||
        newVariants.some(function (v, i) {
          return v !== fev[i];
        });
      if (changed) {
        Object.keys(adjusted).forEach(function (k) {
          const v = adjusted[k];
          if (!Array.isArray(v) || v.length !== fev.length) return;
          if (k.indexOf("filament_") !== 0 && FILAMENT_OPTIONS_PER_VARIANT.indexOf(k) === -1) return;
          adjusted[k] = keep.map(function (i) {
            return v[i];
          });
        });
        adjusted.filament_extruder_variant = newVariants;
        adjusted.filament_self_index = newIndexes;
      }
    }
  }

  // Com mais de um bico, flush_volumes_matrix tem uma matriz de purga
  // (filamentos × filamentos) por bico e flush_multiplier um valor por bico.
  // O projeto vem com a quantidade de bicos da origem; o perfil de destino diz
  // a dele em flush_multiplier. Bicos a mais repetem a primeira matriz, como
  // o fatiador faz ao importar o projeto. Devolve uma cópia de `config`.
  function adjustFlushPerNozzle(config, targetBase) {
    const adjusted = {};
    Object.keys(config).forEach(function (k) {
      adjusted[k] = config[k];
    });
    if (!Array.isArray(targetBase.flush_multiplier)) return adjusted;
    const nozzleCount = targetBase.flush_multiplier.length;

    function perNozzle(values, size) {
      const blockCount = values.length / size;
      let result = [];
      for (let b = 0; b < nozzleCount; b++) {
        const start = (b < blockCount ? b : 0) * size;
        result = result.concat(values.slice(start, start + size));
      }
      return result;
    }

    const filamentCount = [].concat(config.filament_colour || []).length;
    const matrix = config.flush_volumes_matrix;
    const block = filamentCount * filamentCount;
    if (Array.isArray(matrix) && block && matrix.length && matrix.length % block === 0) {
      adjusted.flush_volumes_matrix = perNozzle(matrix, block);
    }
    if (config.flush_multiplier != null) adjusted.flush_multiplier = perNozzle([].concat(config.flush_multiplier), 1);
    return adjusted;
  }

  // Agrupa índices de triângulo por chapa, numa única varredura de
  // `triangleOrigins` (formato `{path, objectId, rootObjectId, localIndex}`
  // por triângulo, ver resolveObjectTriangles/extractTriangles3MF). Pra cada
  // triângulo, compara o `rootObjectId` da origem (o objectid do build item
  // de nível topo, não o do object-folha que contém a mesh) contra o
  // `objectIds` (Set) de cada chapa em `plates` (formato `{index,
  // objectIds}`, ver detectarChapas em colorize-3mf.js) e empilha o índice do
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
  function mapTrianglesToPlates(triangleOrigins, plates) {
    const byPlate = new Map();
    plates.forEach(function (plate) {
      byPlate.set(plate.index, []);
    });

    const countById = new Map();
    plates.forEach(function (plate) {
      plate.objectIds.forEach(function (id) {
        countById.set(id, (countById.get(id) || 0) + 1);
      });
    });

    for (let t = 0; t < triangleOrigins.length; t++) {
      const origin = triangleOrigins[t];
      if (!origin) continue;
      if (countById.get(origin.rootObjectId) !== 1) continue;
      for (let i = 0; i < plates.length; i++) {
        if (plates[i].objectIds.has(origin.rootObjectId)) {
          byPlate.get(plates[i].index).push(t);
          break;
        }
      }
    }

    return byPlate;
  }

  // Um mesmo object referenciado por dois <item>/<component> vira, em
  // extractTriangles3MF, duas cópias da malha com os mesmos triângulos de
  // origem (path, objectId, localIndex). No 3MF exportado só existe uma cor
  // por triângulo de origem, então as cópias precisam ser pintadas juntas.
  // Cada cópia é um trecho contínuo de `triangleOrigins` (onMesh empilha a
  // malha inteira de uma vez, com localIndex crescente): o mapa guarda o
  // início de cada trecho e, para trechos repetidos, o início de todas as
  // cópias, em vez de um registro por triângulo. Devolve null sem cópias.
  function mapMeshCopies(triangleOrigins) {
    const starts = [];
    const keys = [];
    for (let t = 0; t < triangleOrigins.length; t++) {
      const o = triangleOrigins[t];
      const previous = t > 0 ? triangleOrigins[t - 1] : null;
      const continues =
        o &&
        previous &&
        o.path === previous.path &&
        o.objectId === previous.objectId &&
        o.localIndex > previous.localIndex;
      if (!continues) {
        starts.push(t);
        keys.push(o ? o.path + "|" + o.objectId : null);
      }
    }

    const byKey = new Map();
    keys.forEach(function (key, i) {
      if (key === null) return;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(starts[i]);
    });

    let hasCopies = false;
    const copies = keys.map(function (key) {
      const group = key === null ? null : byKey.get(key);
      if (!group || group.length < 2) return null;
      hasCopies = true;
      return group;
    });
    return hasCopies ? { starts: starts, copies: copies } : null;
  }

  // Chama `fn(index)` para cada triângulo que é o mesmo triângulo de origem
  // que `t` nas outras cópias da malha (ver mapMeshCopies). Sem criar
  // arrays: roda para cada triângulo de um balde que pode ter milhões.
  function forEachCopy(copyMap, t, fn) {
    if (!copyMap) return;
    let low = 0;
    let high = copyMap.starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (copyMap.starts[mid] <= t) low = mid;
      else high = mid - 1;
    }
    const group = copyMap.copies[low];
    if (!group) return;
    const start = copyMap.starts[low];
    for (let i = 0; i < group.length; i++) {
      if (group[i] !== start) fn(group[i] + t - start);
    }
  }

  function triangleCopies(copyMap, t) {
    const indices = [];
    forEachCopy(copyMap, t, function (index) {
      indices.push(index);
    });
    return indices;
  }

  window.Wisky3D.ModelParser = {
    parseSTL: parseSTL,
    computeBoundingBox: computeBoundingBox,
    computeMeshVolumeMm3: computeMeshVolumeMm3,
    computeMeshAreaMm2: computeMeshAreaMm2,
    emptyBbox: emptyBbox,
    directChild: directChild,
    directChildren: directChildren,
    findObjectElement: findObjectElement,
    findRootModel: findRootModel,
    findUniqueFile: findUniqueFile,
    downloadBlob: downloadBlob,
    parse3MFPackage: parse3MFPackage,
    extractTriangles3MF: extractTriangles3MF,
    parse3MFProfile: parse3MFProfile,
    parsePlateAssignments: parsePlateAssignments,
    calculatePlates: calculatePlates,
    countTriangles3MF: countTriangles3MF,
    countTrianglesSTL: countTrianglesSTL,
    hasNonSolidParts: function (modelSettingsText) {
      return !!parseNonSolidParts(modelSettingsText);
    },
    repositionByPlate: repositionByPlate,
    repositionTowers: repositionTowers,
    adjustNozzleVariants: adjustNozzleVariants,
    adjustFlushPerNozzle: adjustFlushPerNozzle,
    footprintsByPlate: footprintsByPlate,
    placeTowers: placeTowers,
    mapMeshCopies: mapMeshCopies,
    forEachCopy: forEachCopy,
    triangleCopies: triangleCopies,
    mapTrianglesToPlates: mapTrianglesToPlates
  };
})();
