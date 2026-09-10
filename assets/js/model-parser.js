window.Wisky3D = window.Wisky3D || {};

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

  // Área de superfície da malha (soma das áreas dos triângulos) — usada pra
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
  // outras unidades — sem isso, um arquivo em "centimeter" sairia com
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
  // componente), depois o pai (acumulado até aqui) — é como o 3MF encadeia
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

  // Resolve um <object> do 3MF (mesh direta e/ou <components> apontando pra
  // outros objects, no mesmo arquivo ou em arquivos externos via p:path —
  // padrão usado por fatiadores como Bambu Studio/Orca em modelos multi-peça).
  // O volume de cada mesh-folha é somado em módulo (abs) individualmente,
  // pra não zerar o total quando um componente vem espelhado (transform com
  // determinante negativo, comum em peças simétricas). Não retém os
  // triângulos resolvidos em memória — só contagem/volume/bbox — porque
  // modelos reais multi-peça (ex: miniaturas Bambu Studio) podem passar de
  // 3-4 milhões de triângulos e manter tudo em arrays de arrays estouraria
  // memória no navegador sem necessidade (só usamos os agregados).
  function resolveObjectGeometry(zip, docCache, doc, objectId, accumTransform) {
    var objectEl = findObjectElement(doc, objectId);
    if (!objectEl) return Promise.resolve({ triangleCount: 0, volumeMm3: 0, areaMm2: 0, bbox: bboxVazio() });

    var meshEl = directChild(objectEl, "mesh");
    var triangleCount = 0;
    var volumeMm3 = 0;
    var areaMm2 = 0;
    var bbox = bboxVazio();

    if (meshEl) {
      var verticesEl = directChild(meshEl, "vertices");
      var trianglesEl = directChild(meshEl, "triangles");
      var vertexEls = verticesEl ? directChildren(verticesEl, "vertex") : [];
      var vertices = vertexEls.map(function (v) {
        var p = applyTransform([
          parseFloat(v.getAttribute("x")),
          parseFloat(v.getAttribute("y")),
          parseFloat(v.getAttribute("z"))
        ], accumTransform);
        estenderBBox(bbox, p);
        return p;
      });
      var triEls = trianglesEl ? directChildren(trianglesEl, "triangle") : [];
      var leafTriangles = [];
      triEls.forEach(function (t) {
        var i1 = parseInt(t.getAttribute("v1"), 10);
        var i2 = parseInt(t.getAttribute("v2"), 10);
        var i3 = parseInt(t.getAttribute("v3"), 10);
        if (vertices[i1] && vertices[i2] && vertices[i3]) {
          leafTriangles.push([vertices[i1], vertices[i2], vertices[i3]]);
        }
      });
      if (leafTriangles.length) {
        volumeMm3 += computeMeshVolumeMm3(leafTriangles);
        areaMm2 += computeMeshAreaMm2(leafTriangles);
        triangleCount += leafTriangles.length;
      }
    }

    var componentsEl = directChild(objectEl, "components");
    if (!componentsEl) return Promise.resolve({ triangleCount: triangleCount, volumeMm3: volumeMm3, areaMm2: areaMm2, bbox: bbox });

    var promises = directChildren(componentsEl, "component").map(function (comp) {
      var childObjectId = comp.getAttribute("objectid");
      var childTransform = parseTransformAttr(comp.getAttribute("transform"));
      var combined = composeTransform(accumTransform, childTransform);
      var path = comp.getAttribute("p:path");

      if (path) {
        var normalizedPath = path.replace(/^\//, "");
        var docPromise = docCache[normalizedPath];
        if (!docPromise) {
          var zipEntry = zip.file(normalizedPath);
          if (!zipEntry) return Promise.resolve({ triangleCount: 0, volumeMm3: 0, areaMm2: 0, bbox: bboxVazio() });
          docPromise = zipEntry.async("text").then(parseXmlDoc);
          docCache[normalizedPath] = docPromise;
        }
        return docPromise.then(function (extDoc) {
          return resolveObjectGeometry(zip, docCache, extDoc, childObjectId, combined);
        });
      }
      return resolveObjectGeometry(zip, docCache, doc, childObjectId, combined);
    });

    return Promise.all(promises).then(function (results) {
      results.forEach(function (r) {
        triangleCount += r.triangleCount;
        volumeMm3 += r.volumeMm3;
        areaMm2 += r.areaMm2;
        bbox = mergeBBox(bbox, r.bbox);
      });
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
        // bbox de cada item de nível topo (build item), na ordem de `items` —
        // usado pra separar por chapa/plate em arquivos multi-plate (ver
        // conversor-3mf.js), já que o bbox combinado acima soma objetos que
        // na real impressora nunca ficam juntos na mesma mesa.
        itens: results.map(function (r, i) {
          return { objectId: objectIds[i], bbox: escalarBBox(r.bbox) };
        })
      };
    });
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

  window.Wisky3D.ModelParser = {
    parseSTL: parseSTL,
    computeBoundingBox: computeBoundingBox,
    computeMeshVolumeMm3: computeMeshVolumeMm3,
    computeMeshAreaMm2: computeMeshAreaMm2,
    bboxVazio: bboxVazio,
    parse3MFPackage: parse3MFPackage,
    parse3MFPerfil: parse3MFPerfil
  };
})();
