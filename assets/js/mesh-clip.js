window.Wisky3D = window.Wisky3D || {};

(function () {
// ---------------------------------------------------------------------------
// BLOCO: Corte de malha por plano (clipping) — puro, sem DOM/Three.js/JSZip
// ---------------------------------------------------------------------------

  var EPS = 1e-7;

  var EIXOS = {
    x: { normal: [1, 0, 0], indice: 0 },
    y: { normal: [0, 1, 0], indice: 1 },
    z: { normal: [0, 0, 1], indice: 2 }
  };

  // Convenção de inclinação: a normal do plano é rotacionada em torno de um
  // eixo perpendicular fixo, escolhido de forma cíclica (X->Y->Z->X):
  //   eixo "x" -> rotaciona a normal em torno de Y
  //   eixo "y" -> rotaciona a normal em torno de Z
  //   eixo "z" -> rotaciona a normal em torno de X
  var EIXO_ROTACAO = { x: "y", y: "z", z: "x" };

  function rotacionarVetorEmTornoDoEixo(vetor, eixoRotacao, angRad) {
    // Rotação de Rodrigues especializada para eixos cartesianos (0/1).
    var cos = Math.cos(angRad);
    var sin = Math.sin(angRad);
    var x = vetor[0], y = vetor[1], z = vetor[2];

    if (eixoRotacao === "x") {
      return [x, y * cos - z * sin, y * sin + z * cos];
    }
    if (eixoRotacao === "y") {
      return [x * cos + z * sin, y, -x * sin + z * cos];
    }
    // "z"
    return [x * cos - y * sin, x * sin + y * cos, z];
  }

  function definirPlanoDeCorte(eixo, posicaoPct, inclinacaoGraus, bbox) {
    var info = EIXOS[eixo];
    if (!info) {
      throw new Error("Eixo inválido: " + eixo);
    }

    var minChaves = { x: "minX", y: "minY", z: "minZ" };
    var maxChaves = { x: "maxX", y: "maxY", z: "maxZ" };
    var min = bbox[minChaves[eixo]];
    var max = bbox[maxChaves[eixo]];
    var t = posicaoPct / 100;
    var coordNoEixo = min + (max - min) * t;

    var ponto = [
      bbox.minX + (bbox.maxX - bbox.minX) / 2,
      bbox.minY + (bbox.maxY - bbox.minY) / 2,
      bbox.minZ + (bbox.maxZ - bbox.minZ) / 2
    ];
    ponto[info.indice] = coordNoEixo;

    var anguloRad = (inclinacaoGraus || 0) * Math.PI / 180;
    var normal = rotacionarVetorEmTornoDoEixo(info.normal, EIXO_ROTACAO[eixo], anguloRad);

    return { normal: normal, ponto: ponto };
  }

  function distanciaAoPlano(ponto, plano) {
    var dx = ponto[0] - plano.ponto[0];
    var dy = ponto[1] - plano.ponto[1];
    var dz = ponto[2] - plano.ponto[2];
    return dx * plano.normal[0] + dy * plano.normal[1] + dz * plano.normal[2];
  }

  function interpolarNaAresta(pA, pB, dA, dB) {
    var t = dA / (dA - dB);
    return [
      pA[0] + (pB[0] - pA[0]) * t,
      pA[1] + (pB[1] - pA[1]) * t,
      pA[2] + (pB[2] - pA[2]) * t
    ];
  }

  function areaTriangulo(p1, p2, p3) {
    var ux = p2[0] - p1[0], uy = p2[1] - p1[1], uz = p2[2] - p1[2];
    var vx = p3[0] - p1[0], vy = p3[1] - p1[1], vz = p3[2] - p1[2];
    var cx = uy * vz - uz * vy;
    var cy = uz * vx - ux * vz;
    var cz = ux * vy - uy * vx;
    return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
  }

  function triAreaDesprezivel(p1, p2, p3) {
    return areaTriangulo(p1, p2, p3) < EPS;
  }

  function empurrarTriSeValido(lista, p1, p2, p3) {
    if (!triAreaDesprezivel(p1, p2, p3)) {
      lista.push([p1, p2, p3]);
    }
  }

  function clipTriangulo(tri, plano) {
    var ladoPositivo = [];
    var ladoNegativo = [];
    var arestasDeCorte = [];

    var p = tri;
    var d = [
      distanciaAoPlano(p[0], plano),
      distanciaAoPlano(p[1], plano),
      distanciaAoPlano(p[2], plano)
    ];

    var sinais = d.map(function (v) {
      if (v > EPS) return 1;
      if (v < -EPS) return -1;
      return 0;
    });

    var todosNaoNegativos = sinais.every(function (s) { return s >= 0; });
    var todosNaoPositivos = sinais.every(function (s) { return s <= 0; });

    if (todosNaoNegativos || todosNaoPositivos) {
      // Triângulo inteiro de um lado (inclui casos com vértices no plano).
      var listaDestino = todosNaoNegativos ? ladoPositivo : ladoNegativo;
      empurrarTriSeValido(listaDestino, p[0], p[1], p[2]);
      return { ladoPositivo: ladoPositivo, ladoNegativo: ladoNegativo, arestasDeCorte: arestasDeCorte };
    }

    // Caso 2 de um lado + 1 do outro (nenhum vértice exatamente no plano,
    // pois esse caso já foi tratado acima como "todos do mesmo lado").
    // Identifica o vértice isolado (minoria): aquele cujo sinal difere dos
    // outros dois.
    var idxIsolado;
    if (sinais[0] === sinais[1]) {
      idxIsolado = 2;
    } else if (sinais[1] === sinais[2]) {
      idxIsolado = 0;
    } else {
      idxIsolado = 1;
    }

    var iA = idxIsolado;
    var iB = (idxIsolado + 1) % 3;
    var iC = (idxIsolado + 2) % 3;

    var pA = p[iA], pB = p[iB], pC = p[iC];
    var dA = d[iA], dB = d[iB], dC = d[iC];

    var pInt1 = interpolarNaAresta(pA, pB, dA, dB); // interseção na aresta A-B
    var pInt2 = interpolarNaAresta(pA, pC, dA, dC); // interseção na aresta A-C

    arestasDeCorte.push([pInt1, pInt2]);

    var listaIsolado = sinais[iA] > 0 ? ladoPositivo : ladoNegativo;
    var listaMaioria = sinais[iA] > 0 ? ladoNegativo : ladoPositivo;

    // Triângulo da minoria: vértice isolado + os dois pontos de interseção.
    empurrarTriSeValido(listaIsolado, pA, pInt1, pInt2);

    // Quad da maioria (pB, pC, pInt2, pInt1) dividido em 2 triângulos.
    // A área TOTAL do quad é a mesma para qualquer diagonal escolhida (é uma
    // propriedade geométrica do quad, não depende da triangulação); o que
    // varia é a área de CADA triângulo individual. Escolhe a diagonal que
    // maximiza a menor das duas áreas resultantes, evitando por acaso gerar
    // uma "lasca" (triângulo de área ~0) quando a outra diagonal não teria
    // esse problema.
    var opcaoA = [[pB, pC, pInt2], [pB, pInt2, pInt1]];
    var opcaoB = [[pB, pC, pInt1], [pC, pInt2, pInt1]];

    var menorAreaOpcaoA = Math.min(areaTriangulo.apply(null, opcaoA[0]), areaTriangulo.apply(null, opcaoA[1]));
    var menorAreaOpcaoB = Math.min(areaTriangulo.apply(null, opcaoB[0]), areaTriangulo.apply(null, opcaoB[1]));

    var opcaoEscolhida = menorAreaOpcaoA >= menorAreaOpcaoB ? opcaoA : opcaoB;

    empurrarTriSeValido(listaMaioria, opcaoEscolhida[0][0], opcaoEscolhida[0][1], opcaoEscolhida[0][2]);
    empurrarTriSeValido(listaMaioria, opcaoEscolhida[1][0], opcaoEscolhida[1][1], opcaoEscolhida[1][2]);

    return { ladoPositivo: ladoPositivo, ladoNegativo: ladoNegativo, arestasDeCorte: arestasDeCorte };
  }

  function clipMalha(triangulos, cores, plano) {
    var ladoPositivoTriangulos = [];
    var ladoPositivoCores = [];
    var ladoNegativoTriangulos = [];
    var ladoNegativoCores = [];
    var arestasDeCorteLadoPositivo = [];
    var arestasDeCorteLadoNegativo = [];

    for (var i = 0; i < triangulos.length; i++) {
      var cor = cores ? cores[i] : undefined;
      var resultado = clipTriangulo(triangulos[i], plano);

      for (var a = 0; a < resultado.ladoPositivo.length; a++) {
        ladoPositivoTriangulos.push(resultado.ladoPositivo[a]);
        ladoPositivoCores.push(cor);
      }
      for (var b = 0; b < resultado.ladoNegativo.length; b++) {
        ladoNegativoTriangulos.push(resultado.ladoNegativo[b]);
        ladoNegativoCores.push(cor);
      }
      for (var e = 0; e < resultado.arestasDeCorte.length; e++) {
        arestasDeCorteLadoPositivo.push(resultado.arestasDeCorte[e]);
        arestasDeCorteLadoNegativo.push(resultado.arestasDeCorte[e]);
      }
    }

    return {
      ladoPositivo: { triangulos: ladoPositivoTriangulos, cores: ladoPositivoCores },
      ladoNegativo: { triangulos: ladoNegativoTriangulos, cores: ladoNegativoCores },
      arestasDeCorteLadoPositivo: arestasDeCorteLadoPositivo,
      arestasDeCorteLadoNegativo: arestasDeCorteLadoNegativo
    };
  }

  window.Wisky3D.MeshClip = {
    definirPlanoDeCorte: definirPlanoDeCorte,
    distanciaAoPlano: distanciaAoPlano,
    interpolarNaAresta: interpolarNaAresta,
    clipTriangulo: clipTriangulo,
    clipMalha: clipMalha
  };
})();
