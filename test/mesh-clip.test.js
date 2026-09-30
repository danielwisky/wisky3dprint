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

  // Nenhum triângulo foi perdido: a soma das áreas de ambos os lados deve
  // ser igual à área total da malha original (o corte apenas subdivide).
  const areaOriginal = somarAreaTriangulos(triangulosCubo);
  const areaResultante =
    somarAreaTriangulos(resultado.ladoPositivo.triangulos) +
    somarAreaTriangulos(resultado.ladoNegativo.triangulos);

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
// Sanidade extra: ModelParser.computeMeshVolumeMm3 aplicado aos dois lados
// (sem tampa, não deve bater exatamente com metade do cubo, mas não deve
// gerar erro nem NaN).
// -----------------------------------------------------------------------

test("computeMeshVolumeMm3 aplicado aos dois lados do corte nao gera NaN nem erro", () => {
  const triangulosCubo = criarCuboUnitario();
  const cores = triangulosCubo.map((_, i) => "cor" + i);
  const plano = MeshClip.definirPlanoDeCorte("x", 50, 0, CUBO_BBOX);
  const resultado = MeshClip.clipMalha(triangulosCubo, cores, plano);

  const volumePositivo = ModelParser.computeMeshVolumeMm3(resultado.ladoPositivo.triangulos);
  const volumeNegativo = ModelParser.computeMeshVolumeMm3(resultado.ladoNegativo.triangulos);

  assert.ok(!Number.isNaN(volumePositivo));
  assert.ok(!Number.isNaN(volumeNegativo));
  assert.ok(volumePositivo >= 0);
  assert.ok(volumeNegativo >= 0);
});
