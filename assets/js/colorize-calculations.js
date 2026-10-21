// ---------------------------------------------------------------------------
// Cálculos do Colorir 3MF (colorize-3mf.js), sem Three.js nem DOM: geometria,
// adjacência, flood fill por tolerância de normal e preparação das cores pra
// exportação.
// ---------------------------------------------------------------------------

window.Wisky3D = window.Wisky3D || {};

(function () {
  // -------------------------------------------------------------------------
  // Geometria: triângulos brutos -> posições não indexadas (base da
  // BufferGeometry do viewer, com cor sólida por triângulo) + adjacência de
  // triângulos + lista de vértices únicos pra exportação (independente da
  // geometria não indexada usada no viewer).
  // -------------------------------------------------------------------------

  function buildGeometryData(triangles) {
    const triCount = triangles.length;
    const positions = new Float32Array(triCount * 9);
    for (let t = 0; t < triCount; t++) {
      const tri = triangles[t];
      for (let c = 0; c < 3; c++) {
        const base = t * 9 + c * 3;
        positions[base] = tri[c][0];
        positions[base + 1] = tri[c][1];
        positions[base + 2] = tri[c][2];
      }
    }
    return { triCount, positions };
  }

  function computeFaceNormals(positions, triCount) {
    const normals = new Float32Array(triCount * 3);
    for (let t = 0; t < triCount; t++) {
      const b = t * 9;
      const p0x = positions[b],
        p0y = positions[b + 1],
        p0z = positions[b + 2];
      const p1x = positions[b + 3],
        p1y = positions[b + 4],
        p1z = positions[b + 5];
      const p2x = positions[b + 6],
        p2y = positions[b + 7],
        p2z = positions[b + 8];
      const ux = p1x - p0x,
        uy = p1y - p0y,
        uz = p1z - p0z;
      const vx = p2x - p0x,
        vy = p2y - p0y,
        vz = p2z - p0z;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      normals[t * 3] = nx;
      normals[t * 3 + 1] = ny;
      normals[t * 3 + 2] = nz;
    }
    return normals;
  }

  function expandFaceNormalsToCorners(faceNormals, triCount) {
    const out = new Float32Array(triCount * 9);
    for (let t = 0; t < triCount; t++) {
      const nx = faceNormals[t * 3],
        ny = faceNormals[t * 3 + 1],
        nz = faceNormals[t * 3 + 2];
      for (let c = 0; c < 3; c++) {
        const base = t * 9 + c * 3;
        out[base] = nx;
        out[base + 1] = ny;
        out[base + 2] = nz;
      }
    }
    return out;
  }

  // Dá pra ter até 3 vizinhos por triângulo (um por aresta). Vértices são
  // "soldados" por posição quantizada pra achar arestas compartilhadas, já
  // que a geometria do viewer não compartilha vértices entre triângulos.
  function buildAdjacencyAndExportIndex(positions, triCount) {
    const QUANTIZATION_FACTOR = 1e4; // ~0.0001mm de tolerância pra "mesmo ponto"
    const keyToIndex = new Map();
    const exportVertices = [];
    const cornerExportIndex = new Int32Array(triCount * 3);

    for (let i = 0; i < triCount * 3; i++) {
      const base = i * 3;
      const x = positions[base],
        y = positions[base + 1],
        z = positions[base + 2];
      const key =
        Math.round(x * QUANTIZATION_FACTOR) +
        "," +
        Math.round(y * QUANTIZATION_FACTOR) +
        "," +
        Math.round(z * QUANTIZATION_FACTOR);
      let idx = keyToIndex.get(key);
      if (idx === undefined) {
        idx = exportVertices.length;
        exportVertices.push([x, y, z]);
        keyToIndex.set(key, idx);
      }
      cornerExportIndex[i] = idx;
    }

    const adjacencySets = new Array(triCount);
    for (let t = 0; t < triCount; t++) adjacencySets[t] = new Set();

    const edgeMap = new Map();
    function edgeKey(a, b) {
      return a < b ? a + "_" + b : b + "_" + a;
    }

    for (let t = 0; t < triCount; t++) {
      const i0 = cornerExportIndex[t * 3];
      const i1 = cornerExportIndex[t * 3 + 1];
      const i2 = cornerExportIndex[t * 3 + 2];
      const edges = [
        [i0, i1],
        [i1, i2],
        [i2, i0]
      ];
      for (let e = 0; e < edges.length; e++) {
        const key = edgeKey(edges[e][0], edges[e][1]);
        let list = edgeMap.get(key);
        if (!list) {
          list = [];
          edgeMap.set(key, list);
        }
        for (let j = 0; j < list.length; j++) {
          const other = list[j];
          adjacencySets[t].add(other);
          adjacencySets[other].add(t);
        }
        list.push(t);
      }
    }

    const adjacency = adjacencySets.map((s) => Array.from(s));
    return { adjacency, exportVertices, cornerExportIndex };
  }

  // Compartilhada por balde e seleção mágica: BFS a partir do triângulo
  // clicado. `compareWithOrigin` decide contra qual normal cada vizinho é
  // comparado:
  //  - false (seleção mágica): compara com o vizinho imediato que o
  //    descobriu, não com a origem. Segue curvaturas suaves ao longo de
  //    vários cliques, mesmo que a normal final esteja bem longe da do clique.
  //  - true (balde): compara sempre com a normal do triângulo clicado. A
  //    região fica presa a uma vizinhança realmente próxima do clique, sem a
  //    deriva acumulada de passo a passo que faria a mesma tolerância
  //    "vazar" por uma superfície curva inteira.
  function floodFillByNormalTolerance(
    startTri,
    toleranceDeg,
    adjacency,
    faceNormals,
    triCount,
    compareWithOrigin,
    visibleFilter
  ) {
    // Pequena margem: normais de triângulos coplanares raramente são
    // bit-idênticas (erro de ponto flutuante do produto vetorial), então com
    // tolerância 0° o "dot >= 1" exato quase nunca passava mesmo entre
    // triângulos da mesma face plana.
    const toleranceCos = Math.cos((toleranceDeg * Math.PI) / 180) - 1e-6;
    const visited = new Uint8Array(triCount);
    visited[startTri] = 1;
    const stack = [startTri];
    const result = [startTri];
    const origX = faceNormals[startTri * 3],
      origY = faceNormals[startTri * 3 + 1],
      origZ = faceNormals[startTri * 3 + 2];

    while (stack.length) {
      const cur = stack.pop();
      const cx = compareWithOrigin ? origX : faceNormals[cur * 3];
      const cy = compareWithOrigin ? origY : faceNormals[cur * 3 + 1];
      const cz = compareWithOrigin ? origZ : faceNormals[cur * 3 + 2];
      const neighbors = adjacency[cur];
      for (let i = 0; i < neighbors.length; i++) {
        const n = neighbors[i];
        if (visited[n]) continue;
        if (visibleFilter && !visibleFilter.has(n)) continue;
        const nx = faceNormals[n * 3],
          ny = faceNormals[n * 3 + 1],
          nz = faceNormals[n * 3 + 2];
        const dot = cx * nx + cy * ny + cz * nz;
        if (dot >= toleranceCos) {
          visited[n] = 1;
          result.push(n);
          stack.push(n);
        }
      }
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Cores: conversão e preparação da paleta/cores por triângulo pra exportação
  // -------------------------------------------------------------------------

  function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function rgbKey(r, g, b) {
    return r + "," + g + "," + b;
  }

  // Monta a paleta final de filamentos. Se sobrar alguma área ainda não
  // pintada (triângulo com a cor default), o slot 1 fica reservado pra
  // ela: é nele que caem os triângulos sem paint_color, que usam o
  // extrusor/filamento padrão do objeto, e as cores pintadas ocupam os
  // slots seguintes. Mas se o modelo inteiro já foi pintado (nenhum
  // triângulo com a cor default sobrando, por exemplo depois de trocar a
  // cor do próprio slot 1 pela paleta), a cor default não teria nenhum uso
  // real no arquivo final, então ela é omitida e as cores pintadas ocupam
  // os slots a partir do 1.
  function exportPalette(baseColors, triCount, defaultColor) {
    const colors = [];
    const globalColorIndex = new Map();
    let hasUnpainted = false;
    for (let t = 0; t < triCount; t++) {
      const r = baseColors[t * 3],
        g = baseColors[t * 3 + 1],
        b = baseColors[t * 3 + 2];
      if (r === defaultColor[0] && g === defaultColor[1] && b === defaultColor[2]) {
        hasUnpainted = true;
        continue;
      }
      const key = rgbKey(r, g, b);
      if (!globalColorIndex.has(key)) {
        globalColorIndex.set(key, colors.length);
        colors.push([r, g, b]);
      }
    }

    const palette = hasUnpainted ? [defaultColor, ...colors] : colors.length ? colors : [defaultColor];
    const offset = hasUnpainted ? 2 : 1;
    const slotByColor = new Map();
    colors.forEach((c, i) => slotByColor.set(rgbKey(c[0], c[1], c[2]), i + offset));

    return { palette, slotByColor };
  }

  // Agrupa a cor de cada triângulo pelo arquivo e objeto do pacote 3MF de
  // onde ele veio: path -> objectId -> [{ localIndex, r, g, b }].
  function groupColorsByFile(triangleOrigins, baseColors, triCount) {
    const byFile = new Map();
    for (let t = 0; t < triCount; t++) {
      const origin = triangleOrigins[t];
      if (!origin) continue;
      let byObject = byFile.get(origin.path);
      if (!byObject) {
        byObject = new Map();
        byFile.set(origin.path, byObject);
      }
      let list = byObject.get(origin.objectId);
      if (!list) {
        list = [];
        byObject.set(origin.objectId, list);
      }
      list.push({
        localIndex: origin.localIndex,
        r: baseColors[t * 3],
        g: baseColors[t * 3 + 1],
        b: baseColors[t * 3 + 2]
      });
    }
    return byFile;
  }

  // Formato esperado por ThreeMFWriter.buildModelFromScratch.
  function trianglesForExport(cornerExportIndex, baseColors, triCount) {
    const triangles = new Array(triCount);
    for (let t = 0; t < triCount; t++) {
      triangles[t] = {
        v1: cornerExportIndex[t * 3],
        v2: cornerExportIndex[t * 3 + 1],
        v3: cornerExportIndex[t * 3 + 2],
        color: [baseColors[t * 3], baseColors[t * 3 + 1], baseColors[t * 3 + 2]]
      };
    }
    return triangles;
  }

  window.Wisky3D.ColorizeCalculations = {
    buildGeometryData,
    computeFaceNormals,
    expandFaceNormalsToCorners,
    buildAdjacencyAndExportIndex,
    floodFillByNormalTolerance,
    hexToRgb,
    exportPalette,
    groupColorsByFile,
    trianglesForExport
  };
})();
