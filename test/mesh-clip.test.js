const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

global.window = global;

const modelParserSource = fs.readFileSync(
  path.join(__dirname, "..", "assets", "js", "model-parser.js"),
  "utf8"
);
new Function(modelParserSource)();

const meshClipSource = fs.readFileSync(
  path.join(__dirname, "..", "assets", "js", "mesh-clip.js"),
  "utf8"
);
new Function(meshClipSource)();

// earcut é ESM-only (v3); require() de ESM no Node devolve o namespace, com a
// função em `.default`. mesh-clip.js não importa earcut: é injetado (ver
// estratégia de módulo no bloco de tampa de mesh-clip.js).
const earcut = require("earcut").default;
window.Wisky3D.earcut = earcut;

const MeshClip = window.Wisky3D.MeshClip;
const ModelParser = window.Wisky3D.ModelParser;

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

// Cubo unitário [0,1]^3: 8 vértices, 12 triângulos (2 por face).
function criarCuboUnitario() {
  const v = {
    "000": [0, 0, 0], "100": [1, 0, 0], "110": [1, 1, 0], "010": [0, 1, 0],
    "001": [0, 0, 1], "101": [1, 0, 1], "111": [1, 1, 1], "011": [0, 1, 1]
  };

  return [
    // -Z
    [v["000"], v["110"], v["100"]],
    [v["000"], v["010"], v["110"]],
    // +Z
    [v["001"], v["101"], v["111"]],
    [v["001"], v["111"], v["011"]],
    // -Y
    [v["000"], v["100"], v["101"]],
    [v["000"], v["101"], v["001"]],
    // +Y
    [v["010"], v["111"], v["110"]],
    [v["010"], v["011"], v["111"]],
    // -X
    [v["000"], v["001"], v["011"]],
    [v["000"], v["011"], v["010"]],
    // +X
    [v["100"], v["110"], v["111"]],
    [v["100"], v["111"], v["101"]]
  ];
}

const CUBO_BBOX = { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 };

function somarAreaTriangulos(triangulos) {
  return ModelParser.computeMeshAreaMm2(triangulos);
}

// -----------------------------------------------------------------------
// definirPlanoDeCorte
// -----------------------------------------------------------------------

test("definirPlanoDeCorte com inclinacao 0 no eixo x posiciona o plano por interpolacao no bbox", () => {
  const plano = MeshClip.definirPlanoDeCorte("x", 50, 0, CUBO_BBOX);
  assert.deepEqual(plano.normal, [1, 0, 0]);
  assert.equal(plano.ponto[0], 0.5);
});

test("definirPlanoDeCorte com inclinacao 90 no eixo x roda a normal em torno de y", () => {
  const plano = MeshClip.definirPlanoDeCorte("x", 50, 90, CUBO_BBOX);
  assert.ok(Math.abs(plano.normal[0]) < 1e-9, "componente x deve zerar");
  assert.ok(Math.abs(plano.normal[1]) < 1e-9, "componente y não muda (rotação em torno de y)");
  assert.ok(Math.abs(plano.normal[2] - (-1)) < 1e-9 || Math.abs(plano.normal[2] - 1) < 1e-9);
});

// -----------------------------------------------------------------------
// distanciaAoPlano / interpolarNaAresta
// -----------------------------------------------------------------------

test("distanciaAoPlano retorna 0 para ponto sobre o plano e sinal correto dos dois lados", () => {
  const plano = { normal: [1, 0, 0], ponto: [0.5, 0, 0] };
  assert.equal(MeshClip.distanciaAoPlano([0.5, 3, 7], plano), 0);
  assert.ok(MeshClip.distanciaAoPlano([1, 0, 0], plano) > 0);
  assert.ok(MeshClip.distanciaAoPlano([0, 0, 0], plano) < 0);
});

test("interpolarNaAresta encontra o ponto médio quando distâncias são simétricas", () => {
  const pA = [0, 0, 0];
  const pB = [2, 0, 0];
  const ponto = MeshClip.interpolarNaAresta(pA, pB, 1, -1);
  assert.deepEqual(ponto, [1, 0, 0]);
});

// -----------------------------------------------------------------------
// clipTriangulo — casos degenerados
// -----------------------------------------------------------------------

test("clipTriangulo com vertice exatamente no plano e demais do mesmo lado nao corta", () => {
  const plano = { normal: [1, 0, 0], ponto: [0, 0, 0] };
  // Todos com x >= 0, um deles com x exatamente 0 (dentro do epsilon).
  const tri = [[0, 0, 0], [1, 0, 0], [1, 1, 0]];
  const resultado = MeshClip.clipTriangulo(tri, plano);

  assert.equal(resultado.ladoPositivo.length, 1, "triângulo inteiro fica do lado positivo");
  assert.equal(resultado.ladoNegativo.length, 0, "nada do lado negativo");
  assert.equal(resultado.arestasDeCorte.length, 0, "nenhuma aresta de corte gerada");
});

test("clipTriangulo com um vertice no plano e os outros dois em lados opostos nao gera triangulo de area quase zero", () => {
  // v0 exatamente no plano (d=0), v1 do lado positivo, v2 do lado negativo.
  const plano = { normal: [1, 0, 0], ponto: [0, 0, 0] };
  const tri = [[0, 0.5, 0], [1, 0, 0], [-1, -1, 0]];
  const resultado = MeshClip.clipTriangulo(tri, plano);

  const todosTriangulos = resultado.ladoPositivo.concat(resultado.ladoNegativo);
  // Nenhum triângulo resultante deve ter área desprezível.
  for (const t of todosTriangulos) {
    assert.ok(somarAreaTriangulos([t]) > 1e-6, "triângulo resultante não deve ter área quase zero");
  }
  // Área total (positivo + negativo) deve ser igual à área do triângulo original.
  const areaOriginal = somarAreaTriangulos([tri]);
  const areaResultante = somarAreaTriangulos(todosTriangulos);
  assert.ok(Math.abs(areaOriginal - areaResultante) < 1e-9, "área deve ser preservada no corte");
});

test("clipTriangulo com o vertice do meio no plano e os outros em lados opostos corta o triangulo (regressao Task 13)", () => {
  // v1 exatamente no plano: antes da correção, o vértice no plano era
  // escolhido como "isolado" e o triângulo inteiro ia para um lado só.
  const plano = { normal: [1, 0, 0], ponto: [0, 0, 0] };
  const tri = [[-1, 0, 0], [0, 1, 0], [1, 0, 0]];
  const resultado = MeshClip.clipTriangulo(tri, plano);

  assert.equal(resultado.ladoPositivo.length, 1);
  assert.equal(resultado.ladoNegativo.length, 1);
  for (const t of resultado.ladoPositivo) {
    for (const p of t) assert.ok(MeshClip.distanciaAoPlano(p, plano) >= -1e-9, "lado positivo só com x >= 0");
  }
  for (const t of resultado.ladoNegativo) {
    for (const p of t) assert.ok(MeshClip.distanciaAoPlano(p, plano) <= 1e-9, "lado negativo só com x <= 0");
  }
  assert.ok(Math.abs(somarAreaTriangulos(resultado.ladoPositivo) - 0.5) < 1e-9);
  assert.ok(Math.abs(somarAreaTriangulos(resultado.ladoNegativo) - 0.5) < 1e-9);
});

test("clipTriangulo caso 2 de um lado + 1 do outro gera 1 triangulo na minoria e 2 na maioria sem perder area", () => {
  const plano = { normal: [1, 0, 0], ponto: [0.5, 0, 0] };
  const tri = [[0, 0, 0], [1, 0, 0], [1, 1, 0]]; // v0 negativo, v1 e v2 positivos
  const resultado = MeshClip.clipTriangulo(tri, plano);

  assert.equal(resultado.ladoNegativo.length, 1, "minoria (1 vértice) gera 1 triângulo");
  assert.equal(resultado.ladoPositivo.length, 2, "maioria (2 vértices) gera 2 triângulos (quad dividido)");
  assert.equal(resultado.arestasDeCorte.length, 1);

  const areaOriginal = somarAreaTriangulos([tri]);
  const areaResultante = somarAreaTriangulos(resultado.ladoNegativo.concat(resultado.ladoPositivo));
  assert.ok(Math.abs(areaOriginal - areaResultante) < 1e-9, "área deve ser preservada no corte 2+1");

  for (const t of resultado.ladoPositivo.concat(resultado.ladoNegativo)) {
    assert.ok(somarAreaTriangulos([t]) > 1e-6, "nenhum triângulo do corte deve ter área quase zero");
  }
});

test("clipTriangulo caso 2+1 com quad assimetrico escolhe a diagonal que maximiza a menor area (evita lasca fina)", () => {
  // Triângulo bem assimétrico: v0 isolado do lado negativo, v1/v2 do lado
  // positivo com alturas bem diferentes em relação ao plano. O quad da
  // maioria resultante tem duas triangulações possíveis com áreas mínimas
  // bem diferentes (~13.89 vs ~11.11) — este caso pressiona o código a de
  // fato escolher a diagonal certa, não apenas evitar área zero.
  const plano = { normal: [1, 0, 0], ponto: [5, 0, 0] };
  const tri = [[0, 0, 0], [10, 0, 0], [9, 10, 0]];
  const resultado = MeshClip.clipTriangulo(tri, plano);

  assert.equal(resultado.ladoNegativo.length, 1, "minoria gera 1 triângulo");
  assert.equal(resultado.ladoPositivo.length, 2, "maioria gera 2 triângulos");

  const areasMaioria = resultado.ladoPositivo.map((t) => somarAreaTriangulos([t]));
  const menorAreaMaioria = Math.min(...areasMaioria);

  // A diagonal "boa" (opção A) dá área mínima ~13.89; a diagonal "ruim"
  // (opção B) dá área mínima ~11.11. Afirma que a escolhida é a boa.
  assert.ok(
    menorAreaMaioria > 13,
    `deveria escolher a diagonal que maximiza a menor área (obtido ${menorAreaMaioria}, esperado >13, a diagonal ruim daria ~11.11)`
  );

  const areaOriginal = somarAreaTriangulos([tri]);
  const areaResultante = somarAreaTriangulos(resultado.ladoNegativo.concat(resultado.ladoPositivo));
  assert.ok(Math.abs(areaOriginal - areaResultante) < 1e-6, "área deve ser preservada");
});

// -----------------------------------------------------------------------
// clipMalha — cubo unitário
// -----------------------------------------------------------------------

function testarCorteDoCuboPreservaArea(inclinacaoGraus) {
  const triangulosCubo = criarCuboUnitario();
  const cores = triangulosCubo.map((_, i) => "cor" + i);
  const plano = MeshClip.definirPlanoDeCorte("x", 50, inclinacaoGraus, CUBO_BBOX);

  const resultado = MeshClip.clipMalha(triangulosCubo, cores, plano);

  assert.ok(resultado.ladoPositivo.triangulos.length > 0, "lado positivo deve ter triângulos");
  assert.ok(resultado.ladoNegativo.triangulos.length > 0, "lado negativo deve ter triângulos");

  assert.equal(
    resultado.ladoPositivo.triangulos.length,
    resultado.ladoPositivo.cores.length,
    "cores devem acompanhar triângulos no lado positivo"
  );
  assert.equal(
    resultado.ladoNegativo.triangulos.length,
    resultado.ladoNegativo.cores.length,
    "cores devem acompanhar triângulos no lado negativo"
  );

  // Nenhum triângulo foi perdido: a soma das áreas de ambos os lados (sem as
  // tampas, que são área nova) deve ser igual à área total da malha
  // original (o corte apenas subdivide).
  const areaOriginal = somarAreaTriangulos(triangulosCubo);
  const areaResultante =
    somarAreaTriangulos(resultado.ladoPositivo.triangulos) - somarAreaTriangulos(resultado.tampaLadoPositivo) +
    somarAreaTriangulos(resultado.ladoNegativo.triangulos) - somarAreaTriangulos(resultado.tampaLadoNegativo);

  assert.ok(
    Math.abs(areaOriginal - areaResultante) < 1e-6,
    `área deve ser preservada (original=${areaOriginal}, resultante=${areaResultante})`
  );
}

test("clipMalha corta cubo unitario ao meio no eixo x com inclinacao 0 sem perder area", () => {
  testarCorteDoCuboPreservaArea(0);
});

test("clipMalha corta cubo unitario no eixo x com inclinacao 30 sem perder area", () => {
  testarCorteDoCuboPreservaArea(30);
});

test("clipMalha corta cubo unitario no eixo x com inclinacao 45 sem perder area", () => {
  testarCorteDoCuboPreservaArea(45);
});

test("clipMalha com plano totalmente fora do bbox mantem tudo em um lado sem erro", () => {
  const triangulosCubo = criarCuboUnitario();
  const cores = triangulosCubo.map((_, i) => "cor" + i);
  // Plano bem à esquerda do cubo: todo ponto do cubo fica do lado positivo.
  const plano = { normal: [1, 0, 0], ponto: [-10, 0, 0] };

  const resultado = MeshClip.clipMalha(triangulosCubo, cores, plano);

  assert.equal(resultado.ladoNegativo.triangulos.length, 0, "nada deve ficar do lado negativo");
  assert.equal(resultado.ladoPositivo.triangulos.length, triangulosCubo.length, "todos os triângulos ficam do lado positivo, sem cortes");
  assert.equal(resultado.arestasDeCorteLadoPositivo.length, 0);
  assert.equal(resultado.arestasDeCorteLadoNegativo.length, 0);

  const areaOriginal = somarAreaTriangulos(triangulosCubo);
  const areaResultante = somarAreaTriangulos(resultado.ladoPositivo.triangulos);
  assert.ok(Math.abs(areaOriginal - areaResultante) < 1e-9);
});

// -----------------------------------------------------------------------
// Tampa (Task 13): coletarLoopDeContorno / classificarLoopsExternoEFuros /
// triangularPoligonoPlanar
// -----------------------------------------------------------------------

// Loop 2D (no plano z = 0) -> 3D.
function loopZ0(pontos2D) {
  return pontos2D.map(([x, y]) => [x, y, 0]);
}

// Segmentos [a, b] ligando os pontos consecutivos de um loop (fechado).
function segmentosDoLoop(loop) {
  return loop.map((p, i) => [p, loop[(i + 1) % loop.length]]);
}

function embaralhar(lista, semente) {
  const copia = lista.slice();
  let s = semente;
  for (let i = copia.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function areaPoligono2D(pontos2D) {
  let soma = 0;
  for (let i = 0, j = pontos2D.length - 1; i < pontos2D.length; j = i++) {
    soma += pontos2D[j][0] * pontos2D[i][1] - pontos2D[i][0] * pontos2D[j][1];
  }
  return Math.abs(soma / 2);
}

function pontoDentro2D(ponto, pontos2D) {
  let dentro = false;
  for (let i = 0, j = pontos2D.length - 1; i < pontos2D.length; j = i++) {
    const [xi, yi] = pontos2D[i];
    const [xj, yj] = pontos2D[j];
    if ((yi > ponto[1]) !== (yj > ponto[1]) && ponto[0] < ((xj - xi) * (ponto[1] - yi)) / (yj - yi) + xi) {
      dentro = !dentro;
    }
  }
  return dentro;
}

function centroide(tri) {
  return [0, 1, 2].map((k) => (tri[0][k] + tri[1][k] + tri[2][k]) / 3);
}

function normalDoTriangulo(tri) {
  const u = [0, 1, 2].map((k) => tri[1][k] - tri[0][k]);
  const v = [0, 1, 2].map((k) => tri[2][k] - tri[0][k]);
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

function volumeAssinado(triangulos) {
  let total = 0;
  for (const [a, b, c] of triangulos) {
    total += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return total;
}

// "L" côncavo: quadrado 2x2 sem o quadrante superior direito. Área 3.
const CONTORNO_L = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]];
// Quadrado 4x4 com furo quadrado 2x2 no meio. Área 16 - 4 = 12.
const QUADRADO_EXTERNO = [[0, 0], [4, 0], [4, 4], [0, 4]];
const QUADRADO_FURO = [[1, 1], [3, 1], [3, 3], [1, 3]];

test("coletarLoopDeContorno remonta um loop a partir de segmentos fora de ordem e com pontos quase coincidentes", () => {
  const loop = loopZ0(CONTORNO_L);
  // Perturba o ponto final de cada segmento em ~1e-12 (como sai de
  // interseções de ponto flutuante em triângulos vizinhos).
  const segmentos = segmentosDoLoop(loop).map(([a, b]) => [a, [b[0] + 1e-12, b[1] - 1e-12, b[2]]]);
  const loops = MeshClip.coletarLoopDeContorno(embaralhar(segmentos, 7));

  assert.equal(loops.length, 1, "deve formar exatamente 1 loop");
  assert.equal(loops[0].length, CONTORNO_L.length, "cada vértice aparece uma vez no loop");
  const area = areaPoligono2D(loops[0].map(([x, y]) => [x, y]));
  assert.ok(Math.abs(area - 3) < 1e-9, `loop deve ser o L original em ordem (área ${area})`);
});

test("coletarLoopDeContorno separa multiplos loops e descarta loop aberto sem lancar erro", () => {
  const externo = segmentosDoLoop(loopZ0(QUADRADO_EXTERNO));
  const furo = segmentosDoLoop(loopZ0(QUADRADO_FURO));
  // Cadeia aberta (não fecha): deve ser descartada em silêncio.
  const aberta = [[[10, 10, 0], [11, 10, 0]], [[11, 10, 0], [11, 11, 0]]];
  const loops = MeshClip.coletarLoopDeContorno(embaralhar(externo.concat(furo, aberta), 3));

  assert.equal(loops.length, 2, "externo e furo, sem o loop aberto");
  const areas = loops.map((l) => areaPoligono2D(l.map(([x, y]) => [x, y]))).sort((a, b) => a - b);
  assert.ok(Math.abs(areas[0] - 4) < 1e-9);
  assert.ok(Math.abs(areas[1] - 16) < 1e-9);
});

test("classificarLoopsExternoEFuros identifica o maior loop como externo e o contido como furo", () => {
  // Passa o furo primeiro para garantir que a ordem de entrada não importa.
  const poligonos = MeshClip.classificarLoopsExternoEFuros(
    [loopZ0(QUADRADO_FURO), loopZ0(QUADRADO_EXTERNO)],
    [0, 0, 1]
  );
  assert.equal(poligonos.length, 1);
  assert.equal(areaPoligono2D(poligonos[0].externo.map(([x, y]) => [x, y])), 16);
  assert.equal(poligonos[0].furos.length, 1);
  assert.equal(areaPoligono2D(poligonos[0].furos[0].map(([x, y]) => [x, y])), 4);
});

test("classificarLoopsExternoEFuros trata loops disjuntos como externos separados", () => {
  const outro = QUADRADO_EXTERNO.map(([x, y]) => [x + 10, y]);
  const poligonos = MeshClip.classificarLoopsExternoEFuros(
    [loopZ0(QUADRADO_EXTERNO), loopZ0(outro), loopZ0(QUADRADO_FURO)],
    [0, 0, 1]
  );
  assert.equal(poligonos.length, 2, "dois contornos externos independentes");
  const totalFuros = poligonos.reduce((n, p) => n + p.furos.length, 0);
  assert.equal(totalFuros, 1, "o furo pertence só ao quadrado que o contém");
});

test("classificarLoopsExternoEFuros projeta no plano da normal (loops num plano inclinado)", () => {
  // Mesmos loops, num plano vertical x = 5 (normal +X): projetar em XY
  // daria área zero; a projeção precisa usar a base do plano.
  const paraPlanoX = (pts) => pts.map(([a, b]) => [5, a, b]);
  const poligonos = MeshClip.classificarLoopsExternoEFuros(
    [paraPlanoX(QUADRADO_FURO), paraPlanoX(QUADRADO_EXTERNO)],
    [1, 0, 0]
  );
  assert.equal(poligonos.length, 1);
  assert.equal(poligonos[0].furos.length, 1);
});

function verificarTampa(triangulos, contorno2D, furos2D, areaEsperada, normal) {
  const area = somarAreaTriangulos(triangulos);
  assert.ok(Math.abs(area - areaEsperada) < 1e-9, `área da tampa ${area} deve bater com ${areaEsperada}`);

  for (const tri of triangulos) {
    const c = centroide(tri);
    assert.ok(pontoDentro2D(c, contorno2D), "triângulo não pode sair do contorno");
    for (const furo of furos2D) {
      assert.ok(!pontoDentro2D(c, furo), "triângulo não pode cair dentro do furo");
    }
    const n = normalDoTriangulo(tri);
    const dot = n[0] * normal[0] + n[1] * normal[1] + n[2] * normal[2];
    assert.ok(dot > 0, "normal de cada triângulo deve apontar para a normal pedida");
  }
}

test("triangularPoligonoPlanar triangula contorno concavo em L sem sair do poligono", () => {
  const tris = MeshClip.triangularPoligonoPlanar(loopZ0(CONTORNO_L), [], [0, 0, 1]);
  verificarTampa(tris, CONTORNO_L, [], 3, [0, 0, 1]);
});

test("triangularPoligonoPlanar triangula quadrado com furo descontando a area do furo", () => {
  const tris = MeshClip.triangularPoligonoPlanar(loopZ0(QUADRADO_EXTERNO), [loopZ0(QUADRADO_FURO)], [0, 0, 1]);
  verificarTampa(tris, QUADRADO_EXTERNO, [QUADRADO_FURO], 12, [0, 0, 1]);
});

test("triangularPoligonoPlanar inverte o winding conforme a normal pedida, independente da orientacao do loop", () => {
  const loopHorario = loopZ0(CONTORNO_L.slice().reverse());
  verificarTampa(MeshClip.triangularPoligonoPlanar(loopHorario, [], [0, 0, -1]), CONTORNO_L, [], 3, [0, 0, -1]);
  verificarTampa(MeshClip.triangularPoligonoPlanar(loopHorario, [], [0, 0, 1]), CONTORNO_L, [], 3, [0, 0, 1]);
});

test("triangularPoligonoPlanar aceita earcut injetado por parametro (namespace ou funcao)", () => {
  const anterior = window.Wisky3D.earcut;
  delete window.Wisky3D.earcut;
  try {
    assert.throws(() => MeshClip.triangularPoligonoPlanar(loopZ0(CONTORNO_L), [], [0, 0, 1]), /earcut/);
    const viaFuncao = MeshClip.triangularPoligonoPlanar(loopZ0(CONTORNO_L), [], [0, 0, 1], earcut);
    const viaNamespace = MeshClip.triangularPoligonoPlanar(loopZ0(CONTORNO_L), [], [0, 0, 1], require("earcut"));
    assert.ok(Math.abs(somarAreaTriangulos(viaFuncao) - 3) < 1e-9);
    assert.ok(Math.abs(somarAreaTriangulos(viaNamespace) - 3) < 1e-9);
  } finally {
    window.Wisky3D.earcut = anterior;
  }
});

// -----------------------------------------------------------------------
// clipMalha com tampa: conservação de volume (malha fechada em cada lado)
// -----------------------------------------------------------------------

function transladar(triangulos, d) {
  return triangulos.map((t) => t.map((p) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]]));
}

function testarConservacaoDeVolume(triangulosCubo, plano) {
  const volumeOriginal = ModelParser.computeMeshVolumeMm3(triangulosCubo);
  const cores = triangulosCubo.map((_, i) => "cor" + i);
  const resultado = MeshClip.clipMalha(triangulosCubo, cores, plano);

  assert.ok(resultado.tampaLadoPositivo.length > 0, "lado positivo deve ganhar tampa");
  assert.ok(resultado.tampaLadoNegativo.length > 0, "lado negativo deve ganhar tampa");

  const volPos = ModelParser.computeMeshVolumeMm3(resultado.ladoPositivo.triangulos);
  const volNeg = ModelParser.computeMeshVolumeMm3(resultado.ladoNegativo.triangulos);
  const soma = volPos + volNeg;
  assert.ok(
    Math.abs(soma - volumeOriginal) / volumeOriginal < 0.01,
    `soma dos volumes (${volPos} + ${volNeg} = ${soma}) deve bater com o original (${volumeOriginal})`
  );

  // computeMeshVolumeMm3 devolve |volume|. Confere também o volume assinado
  // de cada lado: só dá positivo e igual ao absoluto se a tampa está com a
  // normal para fora (tampa invertida mudaria o volume, dependente da origem).
  assert.ok(Math.abs(volumeAssinado(resultado.ladoPositivo.triangulos) - volPos) < 1e-9, "tampa do lado positivo com normal para fora");
  assert.ok(Math.abs(volumeAssinado(resultado.ladoNegativo.triangulos) - volNeg) < 1e-9, "tampa do lado negativo com normal para fora");

  // Área da tampa de cada lado é a mesma seção transversal.
  const areaTampaPos = somarAreaTriangulos(resultado.tampaLadoPositivo);
  const areaTampaNeg = somarAreaTriangulos(resultado.tampaLadoNegativo);
  assert.ok(Math.abs(areaTampaPos - areaTampaNeg) < 1e-9, "as duas tampas cobrem a mesma seção");

  // Tampas levam a cor neutra default.
  const coresTampaPos = resultado.ladoPositivo.cores.slice(-resultado.tampaLadoPositivo.length);
  assert.ok(coresTampaPos.every((c) => c === MeshClip.COR_TAMPA_PADRAO));
  assert.deepEqual(MeshClip.COR_TAMPA_PADRAO, [176, 176, 190]);

  return resultado;
}

for (const inclinacao of [0, 30, 45]) {
  test(`clipMalha com tampa conserva o volume do cubo (eixo x, inclinacao ${inclinacao})`, () => {
    const plano = MeshClip.definirPlanoDeCorte("x", 50, inclinacao, CUBO_BBOX);
    testarConservacaoDeVolume(criarCuboUnitario(), plano);
  });
}

test("clipMalha com tampa conserva volume de cubo fora da origem e plano fora do centro", () => {
  // Deslocar a malha evidencia tampa invertida ou faltando (o volume
  // assinado de uma malha aberta depende da origem).
  const cubo = transladar(criarCuboUnitario(), [3, -2, 5]);
  const bbox = { minX: 3, maxX: 4, minY: -2, maxY: -1, minZ: 5, maxZ: 6 };
  const resultado = testarConservacaoDeVolume(cubo, MeshClip.definirPlanoDeCorte("z", 30, 20, bbox));
  assert.ok(Math.abs(ModelParser.computeMeshVolumeMm3(resultado.ladoNegativo.triangulos) - 0.3) < 0.02);
});

test("clipMalha com tampa conserva volume quando o plano passa por vertices e arestas do cubo", () => {
  // Plano diagonal x + y = 1: passa exatamente pelas arestas verticais
  // (1,0,z) e (0,1,z) do cubo — triângulos com vértices no plano.
  const plano = { normal: [Math.SQRT1_2, Math.SQRT1_2, 0], ponto: [0.5, 0.5, 0.5] };
  const resultado = testarConservacaoDeVolume(criarCuboUnitario(), plano);
  const area = somarAreaTriangulos(resultado.tampaLadoPositivo);
  assert.ok(Math.abs(area - Math.SQRT2) < 1e-9, `seção diagonal deve ter área sqrt(2) (obtido ${area})`);
});

test("clipMalha repassa corDaTampa explicita para os triangulos da tampa", () => {
  const plano = MeshClip.definirPlanoDeCorte("x", 50, 0, CUBO_BBOX);
  const cor = [255, 0, 0];
  const resultado = MeshClip.clipMalha(criarCuboUnitario(), null, plano, cor);
  const coresTampa = resultado.ladoNegativo.cores.slice(-resultado.tampaLadoNegativo.length);
  assert.ok(coresTampa.length > 0 && coresTampa.every((c) => c === cor));
});

test("clipMalha com tampa em peca com furo (anel quadrado) conserva volume e gera tampa com furo", () => {
  // Prisma quadrado 4x4x1 com furo passante 2x2 (anel), montado por faces.
  const tris = [];
  const quad = (a, b, c, d) => { tris.push([a, b, c], [a, c, d]); };
  const ext = QUADRADO_EXTERNO, inn = QUADRADO_FURO;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const e0 = ext[i], e1 = ext[j], i0 = inn[i], i1 = inn[j];
    // topo (z=1, normal +z) e base (z=0, normal -z): faixa entre externo e furo
    quad([e0[0], e0[1], 1], [e1[0], e1[1], 1], [i1[0], i1[1], 1], [i0[0], i0[1], 1]);
    quad([e0[0], e0[1], 0], [i0[0], i0[1], 0], [i1[0], i1[1], 0], [e1[0], e1[1], 0]);
    // parede externa (normal para fora) e parede do furo (normal para dentro do furo)
    quad([e0[0], e0[1], 0], [e1[0], e1[1], 0], [e1[0], e1[1], 1], [e0[0], e0[1], 1]);
    quad([i0[0], i0[1], 0], [i0[0], i0[1], 1], [i1[0], i1[1], 1], [i1[0], i1[1], 0]);
  }
  const volumeOriginal = ModelParser.computeMeshVolumeMm3(tris);
  assert.ok(Math.abs(volumeOriginal - 12) < 1e-9, "fixture: anel com volume 12");
  assert.ok(Math.abs(volumeAssinado(tris) - 12) < 1e-9, "fixture: normais para fora");

  // Corte horizontal a meia altura: seção é o anel (externo + furo).
  const plano = { normal: [0, 0, 1], ponto: [2, 2, 0.5] };
  testarConservacaoDeVolume(tris, plano);
  const resultado = MeshClip.clipMalha(tris, null, plano);
  const areaTampa = somarAreaTriangulos(resultado.tampaLadoPositivo);
  assert.ok(Math.abs(areaTampa - 12) < 1e-9, `tampa do anel deve ter área 16 - 4 = 12 (obtido ${areaTampa})`);
});
