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
    // Caso especial: um vértice exatamente sobre o plano (sinal 0) e os
    // outros dois em lados opostos (os 3 sinais diferentes entre si). O
    // isolado precisa ser um vértice FORA do plano (escolhe o positivo): um
    // dos pontos de interseção coincide com o vértice no plano, o triângulo
    // da minoria fica correto e o "quad" da maioria degenera num triângulo
    // válido + um de área ~0 (descartado por empurrarTriSeValido). Se o
    // isolado fosse o próprio vértice no plano (sinal 0), as duas
    // interseções cairiam nele e o triângulo inteiro iria para um lado só
    // sem ser cortado (bug corrigido na Task 13: a área total batia, mas o
    // lado errado recebia a parte oposta e a tampa não fechava).
    var idxIsolado;
    if (sinais.indexOf(0) >= 0) {
      idxIsolado = sinais.indexOf(1);
    } else if (sinais[0] === sinais[1]) {
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

// ---------------------------------------------------------------------------
// BLOCO: Tampa (cap) do corte — triangulação via earcut (Task 13)
// ---------------------------------------------------------------------------
//
// Estratégia de módulo: este arquivo continua sendo um script clássico
// (IIFE + window.Wisky3D.MeshClip), carregável com `new Function(source)()`
// nos testes em Node. O earcut (npm, ESM-only desde a v3) NÃO é importado
// aqui: quem chama injeta a função — parâmetro `earcutFn` de
// triangularPoligonoPlanar/clipMalha — ou define `window.Wisky3D.earcut`
// antes do uso. No browser, split-3mf.js (ES module) faz
// `import("earcut")` (entrada "earcut" do importmap de split-3mf.html) e
// repassa a função; nos testes, `require("earcut").default`. Aceita tanto a
// função quanto o namespace do módulo (`{ default: fn }`).

  var COR_TAMPA_PADRAO = [176, 176, 190];

  // Distância máxima (mesma unidade da malha, mm) para considerar dois pontos
  // de interseção "o mesmo vértice". Pontos calculados por interpolação em
  // triângulos vizinhos podem diferir por ~1e-15 sem serem bit-a-bit iguais.
  var EPS_SOLDA = 1e-5;

  function resolverEarcut(earcutFn) {
    var fn = earcutFn || (window.Wisky3D && window.Wisky3D.earcut);
    if (fn && typeof fn !== "function" && typeof fn.default === "function") {
      fn = fn.default;
    }
    if (typeof fn !== "function") {
      throw new Error("earcut não disponível: passe a função como parâmetro ou defina window.Wisky3D.earcut");
    }
    return fn;
  }

  function subtrair(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function produtoEscalar(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function produtoVetorial(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function normalizar(v) {
    var len = Math.sqrt(produtoEscalar(v, v));
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  // Base ortonormal (u, v) do plano, com u x v = n: um polígono anti-horário
  // no 2D (u, v) tem normal +n no 3D.
  function baseOrtonormalDoPlano(normal) {
    var n = normalizar(normal);
    var auxiliar = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    var u = normalizar(produtoVetorial(n, auxiliar));
    var v = produtoVetorial(n, u);
    return { n: n, u: u, v: v };
  }

  function projetarLoop(loop3D, base) {
    return loop3D.map(function (p) {
      return [produtoEscalar(p, base.u), produtoEscalar(p, base.v)];
    });
  }

  function areaAssinada2D(loop2D) {
    var soma = 0;
    for (var i = 0, j = loop2D.length - 1; i < loop2D.length; j = i++) {
      soma += loop2D[j][0] * loop2D[i][1] - loop2D[i][0] * loop2D[j][1];
    }
    return soma / 2;
  }

  function pontoNoPoligono2D(ponto, loop2D) {
    var dentro = false;
    for (var i = 0, j = loop2D.length - 1; i < loop2D.length; j = i++) {
      var xi = loop2D[i][0], yi = loop2D[i][1];
      var xj = loop2D[j][0], yj = loop2D[j][1];
      if ((yi > ponto[1]) !== (yj > ponto[1]) &&
          ponto[0] < (xj - xi) * (ponto[1] - yi) / (yj - yi) + xi) {
        dentro = !dentro;
      }
    }
    return dentro;
  }

  // Solda pontos quase coincidentes: grade de células de tamanho `eps`,
  // procurando nas 27 células vizinhas (evita que dois pontos a 1e-16 de
  // distância caiam em células diferentes por arredondamento e não casem).
  function criarSoldadorDeVertices(eps) {
    var celulas = {};
    var pontos = [];

    function indice(p) {
      var ci = Math.round(p[0] / eps);
      var cj = Math.round(p[1] / eps);
      var ck = Math.round(p[2] / eps);
      for (var di = -1; di <= 1; di++) {
        for (var dj = -1; dj <= 1; dj++) {
          for (var dk = -1; dk <= 1; dk++) {
            var lista = celulas[(ci + di) + "," + (cj + dj) + "," + (ck + dk)];
            if (!lista) continue;
            for (var m = 0; m < lista.length; m++) {
              var q = pontos[lista[m]];
              if (Math.abs(q[0] - p[0]) <= eps && Math.abs(q[1] - p[1]) <= eps && Math.abs(q[2] - p[2]) <= eps) {
                return lista[m];
              }
            }
          }
        }
      }
      var novo = pontos.length;
      pontos.push(p);
      var chave = ci + "," + cj + "," + ck;
      (celulas[chave] = celulas[chave] || []).push(novo);
      return novo;
    }

    return { indice: indice, pontos: pontos };
  }

  // arestasDeCorte: lista de segmentos [pontoA, pontoB]. Retorna lista de
  // loops fechados, cada um uma lista ordenada de vértices [x,y,z] (sem
  // repetir o primeiro no final). Loops que não fecham (arestas soltas) são
  // descartados em silêncio: melhor uma tampa incompleta que travar a
  // exportação.
  function coletarLoopDeContorno(arestasDeCorte) {
    var soldador = criarSoldadorDeVertices(EPS_SOLDA);
    var arestas = [];
    var arestasPorVertice = {};
    var vistas = {};

    for (var i = 0; i < arestasDeCorte.length; i++) {
      var ia = soldador.indice(arestasDeCorte[i][0]);
      var ib = soldador.indice(arestasDeCorte[i][1]);
      if (ia === ib) continue; // aresta degenerada (comprimento ~0)
      var chave = ia < ib ? ia + "|" + ib : ib + "|" + ia;
      if (vistas[chave]) continue; // segmento repetido
      vistas[chave] = true;
      var id = arestas.length;
      arestas.push([ia, ib]);
      (arestasPorVertice[ia] = arestasPorVertice[ia] || []).push(id);
      (arestasPorVertice[ib] = arestasPorVertice[ib] || []).push(id);
    }

    var usada = new Array(arestas.length);
    var loops = [];

    for (var inicio = 0; inicio < arestas.length; inicio++) {
      if (usada[inicio]) continue;
      usada[inicio] = true;

      var v0 = arestas[inicio][0];
      var atual = arestas[inicio][1];
      var loop = [v0];
      var fechou = false;

      while (true) {
        if (atual === v0) {
          fechou = true;
          break;
        }
        loop.push(atual);
        var candidatas = arestasPorVertice[atual];
        var proxima = -1;
        for (var c = 0; c < candidatas.length; c++) {
          if (!usada[candidatas[c]]) {
            proxima = candidatas[c];
            break;
          }
        }
        if (proxima < 0) break; // aresta solta: loop não fecha
        usada[proxima] = true;
        var aresta = arestas[proxima];
        atual = aresta[0] === atual ? aresta[1] : aresta[0];
      }

      if (fechou && loop.length >= 3) {
        loops.push(loop.map(function (idx) { return soldador.pontos[idx]; }));
      }
    }

    return loops;
  }

  // Dado loops planares (sobre o mesmo plano), retorna lista de polígonos
  // { externo, furos } no formato que triangularPoligonoPlanar/earcut
  // esperam. Loops ordenados por área absoluta projetada (maior primeiro);
  // o "pai" de cada loop é o menor loop maior que o contém. Profundidade par
  // = contorno externo (novo polígono), ímpar = furo do pai. Isso cobre o
  // caso de um externo + furos e também cortes que atravessam partes
  // separadas (vários externos) ou ilhas dentro de furos.
  function classificarLoopsExternoEFuros(loops, normalDoPlano) {
    var base = baseOrtonormalDoPlano(normalDoPlano);

    var itens = loops.map(function (loop) {
      var loop2D = projetarLoop(loop, base);
      return { loop: loop, loop2D: loop2D, area: Math.abs(areaAssinada2D(loop2D)) };
    }).filter(function (item) {
      return item.area > EPS;
    });

    itens.sort(function (a, b) { return b.area - a.area; });

    var poligonos = [];
    for (var i = 0; i < itens.length; i++) {
      var item = itens[i];
      var pai = -1;
      for (var j = i - 1; j >= 0; j--) {
        if (pontoNoPoligono2D(item.loop2D[0], itens[j].loop2D)) {
          pai = j;
          break;
        }
      }
      item.profundidade = pai < 0 ? 0 : itens[pai].profundidade + 1;

      if (item.profundidade % 2 === 0) {
        item.poligono = { externo: item.loop, furos: [] };
        poligonos.push(item.poligono);
      } else {
        itens[pai].poligono.furos.push(item.loop);
      }
    }

    return poligonos;
  }

  // Triangula um polígono planar 3D (contorno externo + furos) com earcut.
  // Retorna triângulos [[x,y,z] x3] orientados de modo que a normal de cada
  // um (regra da mão direita) aponte para `normalDoPlano`.
  function triangularPoligonoPlanar(loopExterno3D, furos3D, normalDoPlano, earcutFn) {
    var earcut = resolverEarcut(earcutFn);
    var base = baseOrtonormalDoPlano(normalDoPlano);

    var vertices = [];
    var coords = [];
    var holeIndices = [];

    function adicionarLoop(loop) {
      for (var i = 0; i < loop.length; i++) {
        vertices.push(loop[i]);
        coords.push(produtoEscalar(loop[i], base.u), produtoEscalar(loop[i], base.v));
      }
    }

    adicionarLoop(loopExterno3D);
    var furos = furos3D || [];
    for (var f = 0; f < furos.length; f++) {
      holeIndices.push(vertices.length);
      adicionarLoop(furos[f]);
    }

    var indices = earcut(coords, holeIndices, 2);
    var triangulos = [];

    for (var t = 0; t + 2 < indices.length; t += 3) {
      var a = vertices[indices[t]];
      var b = vertices[indices[t + 1]];
      var c = vertices[indices[t + 2]];
      // earcut só garante orientação consistente no 2D; confere no 3D pelo
      // produto misto contra a normal pedida e inverte o winding se preciso.
      var normalTri = produtoVetorial(subtrair(b, a), subtrair(c, a));
      if (produtoEscalar(normalTri, base.n) < 0) {
        var tmp = b;
        b = c;
        c = tmp;
      }
      empurrarTriSeValido(triangulos, a, b, c);
    }

    return triangulos;
  }

  // Arestas de borda de um lado do corte que estão sobre o plano: arestas de
  // triângulos com os dois vértices no plano (|d| <= EPS), contadas por par
  // de vértices soldados; só as que aparecem um número ímpar de vezes são
  // borda (uma aresta compartilhada por dois triângulos do mesmo lado é
  // interna). Cobre as arestas novas do corte (clipTriangulo) e também
  // arestas originais da malha que já estavam exatamente no plano (ex. corte
  // a 45° passando por arestas do cubo), que clipTriangulo não reporta.
  function arestasDeBordaNoPlano(triangulos, plano) {
    var soldador = criarSoldadorDeVertices(EPS_SOLDA);
    var contagem = {};
    var ordem = [];

    for (var i = 0; i < triangulos.length; i++) {
      var tri = triangulos[i];
      var noPlano = [
        Math.abs(distanciaAoPlano(tri[0], plano)) <= EPS,
        Math.abs(distanciaAoPlano(tri[1], plano)) <= EPS,
        Math.abs(distanciaAoPlano(tri[2], plano)) <= EPS
      ];
      for (var k = 0; k < 3; k++) {
        var k2 = (k + 1) % 3;
        if (!noPlano[k] || !noPlano[k2]) continue;
        var ia = soldador.indice(tri[k]);
        var ib = soldador.indice(tri[k2]);
        if (ia === ib) continue;
        var chave = ia < ib ? ia + "|" + ib : ib + "|" + ia;
        if (!(chave in contagem)) {
          contagem[chave] = 0;
          ordem.push({ chave: chave, segmento: [soldador.pontos[ia], soldador.pontos[ib]] });
        }
        contagem[chave]++;
      }
    }

    return ordem.filter(function (item) {
      return contagem[item.chave] % 2 === 1;
    }).map(function (item) {
      return item.segmento;
    });
  }

  function gerarTampa(arestasDeCorte, normalExterna, earcutFn) {
    var loops = coletarLoopDeContorno(arestasDeCorte);
    if (loops.length === 0) return [];
    var poligonos = classificarLoopsExternoEFuros(loops, normalExterna);
    var tampa = [];
    for (var i = 0; i < poligonos.length; i++) {
      var tris = triangularPoligonoPlanar(poligonos[i].externo, poligonos[i].furos, normalExterna, earcutFn);
      for (var t = 0; t < tris.length; t++) tampa.push(tris[t]);
    }
    return tampa;
  }

  // corDaTampa (opcional): cor dos triângulos da tampa, default
  // [176,176,190] (mesmo cinza default do Colorir 3MF). earcutFn (opcional):
  // ver estratégia de módulo no topo deste bloco.
  function clipMalha(triangulos, cores, plano, corDaTampa, earcutFn) {
    var ladoPositivoTriangulos = [];
    var ladoPositivoCores = [];
    var ladoNegativoTriangulos = [];
    var ladoNegativoCores = [];

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
    }

    var arestasDeCorteLadoPositivo = arestasDeBordaNoPlano(ladoPositivoTriangulos, plano);
    var arestasDeCorteLadoNegativo = arestasDeBordaNoPlano(ladoNegativoTriangulos, plano);

    // Normal externa da tampa: o lado positivo (d > 0) fica "na frente" da
    // normal do plano, então sua tampa olha para -normal; o lado negativo,
    // para +normal.
    var normal = plano.normal;
    var normalInvertida = [-normal[0], -normal[1], -normal[2]];
    var tampaLadoPositivo = gerarTampa(arestasDeCorteLadoPositivo, normalInvertida, earcutFn);
    var tampaLadoNegativo = gerarTampa(arestasDeCorteLadoNegativo, normal, earcutFn);

    var corTampa = corDaTampa === undefined ? COR_TAMPA_PADRAO : corDaTampa;
    for (var p = 0; p < tampaLadoPositivo.length; p++) {
      ladoPositivoTriangulos.push(tampaLadoPositivo[p]);
      ladoPositivoCores.push(corTampa);
    }
    for (var n = 0; n < tampaLadoNegativo.length; n++) {
      ladoNegativoTriangulos.push(tampaLadoNegativo[n]);
      ladoNegativoCores.push(corTampa);
    }

    return {
      ladoPositivo: { triangulos: ladoPositivoTriangulos, cores: ladoPositivoCores },
      ladoNegativo: { triangulos: ladoNegativoTriangulos, cores: ladoNegativoCores },
      arestasDeCorteLadoPositivo: arestasDeCorteLadoPositivo,
      arestasDeCorteLadoNegativo: arestasDeCorteLadoNegativo,
      tampaLadoPositivo: tampaLadoPositivo,
      tampaLadoNegativo: tampaLadoNegativo
    };
  }

  window.Wisky3D.MeshClip = {
    definirPlanoDeCorte: definirPlanoDeCorte,
    distanciaAoPlano: distanciaAoPlano,
    interpolarNaAresta: interpolarNaAresta,
    clipTriangulo: clipTriangulo,
    clipMalha: clipMalha,
    coletarLoopDeContorno: coletarLoopDeContorno,
    classificarLoopsExternoEFuros: classificarLoopsExternoEFuros,
    triangularPoligonoPlanar: triangularPoligonoPlanar,
    COR_TAMPA_PADRAO: COR_TAMPA_PADRAO
  };
})();
