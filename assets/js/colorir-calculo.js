// ---------------------------------------------------------------------------
// Cálculos do Colorir 3MF (colorir-3mf.js), sem Three.js nem DOM: geometria,
// adjacência, flood fill por tolerância de normal e preparação das cores pra
// exportação.
// ---------------------------------------------------------------------------

window.Wisky3D = window.Wisky3D || {};

(function () {
  // -------------------------------------------------------------------------
  // Geometria: STL bruto -> BufferGeometry não indexada (cor sólida por
  // triângulo) + adjacência de triângulos + lista de vértices únicos pra
  // exportação (independente da geometria não-indexada usada no viewer).
  // -------------------------------------------------------------------------

  function buildGeometryData(triangulos) {
    const triCount = triangulos.length;
    const positions = new Float32Array(triCount * 9);
    for (let t = 0; t < triCount; t++) {
      const tri = triangulos[t];
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
      const p0x = positions[b], p0y = positions[b + 1], p0z = positions[b + 2];
      const p1x = positions[b + 3], p1y = positions[b + 4], p1z = positions[b + 5];
      const p2x = positions[b + 6], p2y = positions[b + 7], p2z = positions[b + 8];
      const ux = p1x - p0x, uy = p1y - p0y, uz = p1z - p0z;
      const vx = p2x - p0x, vy = p2y - p0y, vz = p2z - p0z;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      normals[t * 3] = nx;
      normals[t * 3 + 1] = ny;
      normals[t * 3 + 2] = nz;
    }
    return normals;
  }

  function expandFaceNormalsToCorners(faceNormals, triCount) {
    const out = new Float32Array(triCount * 9);
    for (let t = 0; t < triCount; t++) {
      const nx = faceNormals[t * 3], ny = faceNormals[t * 3 + 1], nz = faceNormals[t * 3 + 2];
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
    const FATOR_QUANTIZACAO = 1e4; // ~0.0001mm de tolerância pra "mesmo ponto"
    const keyToIndex = new Map();
    const exportVertices = [];
    const cornerExportIndex = new Int32Array(triCount * 3);

    for (let i = 0; i < triCount * 3; i++) {
      const base = i * 3;
      const x = positions[base], y = positions[base + 1], z = positions[base + 2];
      const chave = Math.round(x * FATOR_QUANTIZACAO) + "," + Math.round(y * FATOR_QUANTIZACAO) + "," + Math.round(z * FATOR_QUANTIZACAO);
      let idx = keyToIndex.get(chave);
      if (idx === undefined) {
        idx = exportVertices.length;
        exportVertices.push([x, y, z]);
        keyToIndex.set(chave, idx);
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
      const arestas = [[i0, i1], [i1, i2], [i2, i0]];
      for (let e = 0; e < arestas.length; e++) {
        const chave = edgeKey(arestas[e][0], arestas[e][1]);
        let lista = edgeMap.get(chave);
        if (!lista) {
          lista = [];
          edgeMap.set(chave, lista);
        }
        for (let j = 0; j < lista.length; j++) {
          const outro = lista[j];
          adjacencySets[t].add(outro);
          adjacencySets[outro].add(t);
        }
        lista.push(t);
      }
    }

    const adjacency = adjacencySets.map((s) => Array.from(s));
    return { adjacency, exportVertices, cornerExportIndex };
  }

  // Compartilhada por balde e seleção mágica: BFS a partir do triângulo
  // clicado. `compararComOrigem` decide contra qual normal cada vizinho é
  // comparado:
  //  - false (seleção mágica): compara com o vizinho imediato que o
  //    descobriu, não com a origem. Segue curvaturas suaves ao longo de
  //    vários cliques, mesmo que a normal final esteja bem longe da do clique.
  //  - true (balde): compara sempre com a normal do triângulo clicado. A
  //    região fica presa a uma vizinhança realmente próxima do clique, sem a
  //    deriva acumulada de passo a passo que faria a mesma tolerância
  //    "vazar" por uma superfície curva inteira.
  function floodFillByNormalTolerance(startTri, toleranceDeg, adjacency, faceNormals, triCount, compararComOrigem, filtroVisivel) {
    // Pequena margem: normais de triângulos coplanares raramente são
    // bit-idênticas (erro de ponto flutuante do produto vetorial), então com
    // tolerância 0° o "dot >= 1" exato quase nunca passava mesmo entre
    // triângulos da mesma face plana.
    const toleranceCos = Math.cos((toleranceDeg * Math.PI) / 180) - 1e-6;
    const visited = new Uint8Array(triCount);
    visited[startTri] = 1;
    const stack = [startTri];
    const result = [startTri];
    const origX = faceNormals[startTri * 3], origY = faceNormals[startTri * 3 + 1], origZ = faceNormals[startTri * 3 + 2];

    while (stack.length) {
      const cur = stack.pop();
      const cx = compararComOrigem ? origX : faceNormals[cur * 3];
      const cy = compararComOrigem ? origY : faceNormals[cur * 3 + 1];
      const cz = compararComOrigem ? origZ : faceNormals[cur * 3 + 2];
      const vizinhos = adjacency[cur];
      for (let i = 0; i < vizinhos.length; i++) {
        const n = vizinhos[i];
        if (visited[n]) continue;
        if (filtroVisivel && !filtroVisivel.has(n)) continue;
        const nx = faceNormals[n * 3], ny = faceNormals[n * 3 + 1], nz = faceNormals[n * 3 + 2];
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

  function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function chaveRgb(r, g, b) {
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
  function paletaDeExportacao(baseColors, triCount, corPadrao) {
    const cores = [];
    const indiceDaCorGlobal = new Map();
    let temNaoPintado = false;
    for (let t = 0; t < triCount; t++) {
      const r = baseColors[t * 3], g = baseColors[t * 3 + 1], b = baseColors[t * 3 + 2];
      if (r === corPadrao[0] && g === corPadrao[1] && b === corPadrao[2]) {
        temNaoPintado = true;
        continue;
      }
      const chave = chaveRgb(r, g, b);
      if (!indiceDaCorGlobal.has(chave)) {
        indiceDaCorGlobal.set(chave, cores.length);
        cores.push([r, g, b]);
      }
    }

    const paleta = temNaoPintado ? [corPadrao, ...cores] : cores.length ? cores : [corPadrao];
    const offset = temNaoPintado ? 2 : 1;
    const slotPorCor = new Map();
    cores.forEach((c, i) => slotPorCor.set(chaveRgb(c[0], c[1], c[2]), i + offset));

    return { paleta, slotPorCor };
  }

  // Agrupa a cor de cada triângulo pelo arquivo e objeto do pacote 3MF de
  // onde ele veio: path -> objectId -> [{ localIndex, r, g, b }].
  function agruparCoresPorArquivo(triangleOrigins, baseColors, triCount) {
    const porArquivo = new Map();
    for (let t = 0; t < triCount; t++) {
      const origem = triangleOrigins[t];
      if (!origem) continue;
      let porObjeto = porArquivo.get(origem.path);
      if (!porObjeto) {
        porObjeto = new Map();
        porArquivo.set(origem.path, porObjeto);
      }
      let lista = porObjeto.get(origem.objectId);
      if (!lista) {
        lista = [];
        porObjeto.set(origem.objectId, lista);
      }
      lista.push({
        localIndex: origem.localIndex,
        r: baseColors[t * 3],
        g: baseColors[t * 3 + 1],
        b: baseColors[t * 3 + 2]
      });
    }
    return porArquivo;
  }

  // Formato esperado por ThreeMFWriter.montarModeloDoZero.
  function triangulosParaExportacao(cornerExportIndex, baseColors, triCount) {
    const triangulos = new Array(triCount);
    for (let t = 0; t < triCount; t++) {
      triangulos[t] = {
        v1: cornerExportIndex[t * 3],
        v2: cornerExportIndex[t * 3 + 1],
        v3: cornerExportIndex[t * 3 + 2],
        color: [baseColors[t * 3], baseColors[t * 3 + 1], baseColors[t * 3 + 2]]
      };
    }
    return triangulos;
  }

  window.Wisky3D.ColorirCalculo = {
    buildGeometryData,
    computeFaceNormals,
    expandFaceNormalsToCorners,
    buildAdjacencyAndExportIndex,
    floodFillByNormalTolerance,
    hexToRgb,
    paletaDeExportacao,
    agruparCoresPorArquivo,
    triangulosParaExportacao
  };
})();
