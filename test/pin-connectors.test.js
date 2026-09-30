const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");
const earcut = require("earcut").default;

global.window = global;
global.DOMParser = DOMParser;
global.XMLSerializer = XMLSerializer;

// Mesmo truque de test/split-3mf-corte.test.js: split-3mf.js só roda com
// #split3mf no DOM.
function criarElementoFalso() {
  return {
    addEventListener: function () {},
    classList: { add: function () {}, remove: function () {}, toggle: function () {} },
    dataset: {},
    style: {},
    hidden: false,
    textContent: "",
    innerHTML: "",
    appendChild: function () {},
    files: null
  };
}
global.document = { getElementById: function () { return criarElementoFalso(); } };

const JS = path.join(__dirname, "..", "assets", "js");
function carregar(arquivo) {
  new Function(fs.readFileSync(path.join(JS, arquivo), "utf8"))();
}
// Mesma ordem de <script> de split-3mf.html.
carregar("model-parser.js");
carregar("threemf-writer.js");
carregar("mesh-clip.js");
carregar("split-3mf.js");

const { ModelParser } = window.Wisky3D;
const { criarPeca, cortarPeca, aplicarConectorNasPecas, triangulosDaPeca } = window.Wisky3D.Split3MF;

// pin-connectors.js é ES module num pacote "type": "commonjs": importa o
// fonte como data: URL (ele não tem import estático, então nada precisa ser
// resolvido a partir da URL). Three.js/three-bvh-csg entram por injeção
// (opcoes.libs): o "main" do three-bvh-csg é um UMD CommonJS que puxaria o
// build CJS do Three.js (outra instância), então importa o src/ ESM direto.
let PC, THREE, CSG;
const carregado = (async function () {
  PC = await import("data:text/javascript;charset=utf-8," + encodeURIComponent(fs.readFileSync(path.join(JS, "pin-connectors.js"), "utf8")));
  THREE = await import("three");
  CSG = await import(require("node:url").pathToFileURL(path.join(__dirname, "..", "node_modules", "three-bvh-csg", "src", "index.js")).href);
})();

// three-mesh-bvh 0.9 avisa que o three-bvh-csg 0.0.16 usa uma opção
// depreciada; só ruído.
const warnOriginal = console.warn;
console.warn = function (msg) {
  if (typeof msg === "string" && msg.indexOf("maxLeafTris") >= 0) return;
  warnOriginal.apply(console, arguments);
};

function cubo(l, origem) {
  const o = origem || [0, 0, 0];
  const v = [
    [0, 0, 0], [l, 0, 0], [l, l, 0], [0, l, 0],
    [0, 0, l], [l, 0, l], [l, l, l], [0, l, l]
  ].map(function (p) { return [p[0] + o[0], p[1] + o[1], p[2] + o[2]]; });
  const faces = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]
  ];
  return faces.map(function (f) { return [v[f[0]], v[f[1]], v[f[2]]]; });
}

// Cilindro fechado de n lados, eixo Z, raio r, altura h.
function cilindro(n, r, h, origem) {
  const o = origem || [0, 0, 0];
  const tris = [];
  const base = [o[0], o[1], o[2]], topo = [o[0], o[1], o[2] + h];
  for (let i = 0; i < n; i++) {
    const a0 = 2 * Math.PI * i / n, a1 = 2 * Math.PI * (i + 1) / n;
    const b0 = [o[0] + r * Math.cos(a0), o[1] + r * Math.sin(a0), o[2]];
    const b1 = [o[0] + r * Math.cos(a1), o[1] + r * Math.sin(a1), o[2]];
    const t0 = [b0[0], b0[1], o[2] + h], t1 = [b1[0], b1[1], o[2] + h];
    tris.push([b0, b1, t1], [b0, t1, t0], [topo, t0, t1], [base, b1, b0]);
  }
  return tris;
}

// Tubo de seção quadrada (anel): externo [0,L]², furo [f, L-f]², altura h.
function tuboQuadrado(L, f, h) {
  const tris = [];
  function quad(a, b, c, d) { tris.push([a, b, c], [a, c, d]); }
  const ext = [[0, 0], [L, 0], [L, L], [0, L]];
  const inn = [[f, f], [L - f, f], [L - f, L - f], [f, L - f]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const e0 = ext[i], e1 = ext[j], i0 = inn[i], i1 = inn[j];
    quad([e0[0], e0[1], 0], [e1[0], e1[1], 0], [e1[0], e1[1], h], [e0[0], e0[1], h]); // parede externa
    quad([i1[0], i1[1], 0], [i0[0], i0[1], 0], [i0[0], i0[1], h], [i1[0], i1[1], h]); // parede interna
    quad([e0[0], e0[1], h], [e1[0], e1[1], h], [i1[0], i1[1], h], [i0[0], i0[1], h]); // topo
    quad([e1[0], e1[1], 0], [e0[0], e0[1], 0], [i0[0], i0[1], 0], [i1[0], i1[1], 0]); // fundo
  }
  return tris;
}

let proximoId = 1;
function novaIdentidade() {
  const id = proximoId++;
  return { id: id, rotulo: "Peça " + id };
}
function pecaDe(tris) {
  return criarPeca({ id: proximoId++, rotulo: "Objeto", unidadeId: 0, origemPecaId: null }, tris, tris.map(function () { return [200, 30, 30]; }));
}
function cortar(peca, eixo, pos, incl) {
  return cortarPeca(peca, eixo, pos, incl, { earcutFn: earcut, novaIdentidade: novaIdentidade });
}

function volumeAssinado(peca) {
  let v = 0;
  peca.triangulos.forEach(function (t) {
    const a = peca.vertices[t.v1], b = peca.vertices[t.v2], c = peca.vertices[t.v3];
    v += (a[0] * (b[1] * c[2] - c[1] * b[2]) - a[1] * (b[0] * c[2] - c[0] * b[2]) + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
  });
  return v;
}

// Área de um polígono regular de 32 lados inscrito no círculo de raio r
// (o cilindro do conector é um prisma de 32 lados).
function areaPrisma32(r) {
  return 0.5 * 32 * r * r * Math.sin(2 * Math.PI / 32);
}

// ---------------------------------------------------------------------------
// buildAdjacencyAndExportIndex (extensão aditiva) + validarManifold
// ---------------------------------------------------------------------------

function positionsDe(tris) {
  const p = new Float64Array(tris.length * 9);
  tris.forEach(function (t, i) {
    for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) p[i * 9 + c * 3 + k] = t[c][k];
  });
  return p;
}

test("buildAdjacencyAndExportIndex sem opções continua devolvendo só adjacency/exportVertices/cornerExportIndex", () => {
  const tris = cubo(1);
  const r = ModelParser.buildAdjacencyAndExportIndex(positionsDe(tris), tris.length);
  assert.deepEqual(Object.keys(r).sort(), ["adjacency", "cornerExportIndex", "exportVertices"]);
  assert.equal(r.exportVertices.length, 8);
  r.adjacency.forEach(function (viz) { assert.equal(viz.length, 3); });
});

test("buildAdjacencyAndExportIndex com contarArestas conta 2 triângulos por aresta num cubo fechado", () => {
  const tris = cubo(1);
  const r = ModelParser.buildAdjacencyAndExportIndex(positionsDe(tris), tris.length, { contarArestas: true });
  assert.equal(r.triangulosPorAresta.size, 18);
  r.triangulosPorAresta.forEach(function (n) { assert.equal(n, 2); });
  assert.equal(r.triangulosDegenerados, 0);
});

test("buildAdjacencyAndExportIndex com contarArestas deixa triângulo colapsado fora da contagem", () => {
  const tris = cubo(1).concat([[[0, 0, 0], [0, 0, 0], [1, 0, 0]]]);
  const r = ModelParser.buildAdjacencyAndExportIndex(positionsDe(tris), tris.length, { contarArestas: true });
  assert.equal(r.triangulosDegenerados, 1);
  r.triangulosPorAresta.forEach(function (n) { assert.equal(n, 2); });
});

test("buildAdjacencyAndExportIndex respeita fatorQuantizacao", () => {
  const tris = [[[0, 0, 0], [1, 0, 0], [0, 1, 0]], [[0.00002, 0, 0], [0, 1, 0], [1, 0, 0]]];
  const grosso = ModelParser.buildAdjacencyAndExportIndex(positionsDe(tris), 2);
  const fino = ModelParser.buildAdjacencyAndExportIndex(positionsDe(tris), 2, { fatorQuantizacao: 1e5 });
  assert.equal(grosso.exportVertices.length, 3);
  assert.equal(fino.exportVertices.length, 4);
});

test("validarManifold: cubo fechado 0/0, sem um triângulo acusa 3 furos, aleta extra acusa não-manifold", async () => {
  await carregado;
  function diag(tris) {
    const r = ModelParser.buildAdjacencyAndExportIndex(positionsDe(tris), tris.length, { contarArestas: true });
    return PC.validarManifold(r, r.exportVertices);
  }
  assert.deepEqual(diag(cubo(10)), { furos: 0, naoManifold: 0 });
  assert.deepEqual(diag(cubo(10).slice(1)), { furos: 3, naoManifold: 0 });
  const comAleta = cubo(10).concat([[[0, 0, 0], [10, 10, 0], [5, 5, -5]]]); // usa a diagonal da base
  const d = diag(comAleta);
  assert.equal(d.naoManifold, 1);
  assert.equal(d.furos, 2);
});

test("validarManifold aceita o Map direto e recusa entrada sem contagem por aresta", async () => {
  await carregado;
  const tris = cubo(1);
  const r = ModelParser.buildAdjacencyAndExportIndex(positionsDe(tris), tris.length, { contarArestas: true });
  assert.deepEqual(PC.validarManifold(r.triangulosPorAresta, r.exportVertices), { furos: 0, naoManifold: 0 });
  const semContagem = ModelParser.buildAdjacencyAndExportIndex(positionsDe(tris), tris.length);
  assert.throws(function () { PC.validarManifold(semContagem, semContagem.exportVertices); });
});

test("diagnosticarManifoldDaPeca: peças do corte (Task 14) saem fechadas", async () => {
  await carregado;
  const r = cortar(pecaDe(cilindro(48, 10, 30)), "x", 37, 20);
  assert.deepEqual(PC.diagnosticarManifoldDaPeca(r.negativo), { furos: 0, naoManifold: 0 });
  assert.deepEqual(PC.diagnosticarManifoldDaPeca(r.positivo), { furos: 0, naoManifold: 0 });
});

// ---------------------------------------------------------------------------
// Ponto de ancoragem e planejamento (puro, sem Three.js)
// ---------------------------------------------------------------------------

test("calcularPontoDeAncoragem usa o centro da seção de corte de um cubo", async () => {
  await carregado;
  const r = cortar(pecaDe(cubo(20)), "z", 50, 0);
  const anc = PC.calcularPontoDeAncoragem(r.negativo, r.plano);
  [10, 10, 10].forEach(function (v, i) { assert.ok(Math.abs(anc.ponto[i] - v) < 1e-9); });
  assert.ok(Math.abs(anc.distanciaAteBorda - 10) < 1e-9);
});

test("calcularPontoDeAncoragem em seção em anel (tubo) cai no material, não no furo do meio", async () => {
  await carregado;
  const r = cortar(pecaDe(tuboQuadrado(30, 8, 20)), "z", 50, 0);
  const anc = PC.calcularPontoDeAncoragem(r.negativo, r.plano);
  const [x, y] = anc.ponto;
  const noFuro = x > 8 && x < 22 && y > 8 && y < 22;
  assert.ok(!noFuro, "ponto " + anc.ponto + " caiu no vazio do tubo");
  assert.ok(anc.distanciaAteBorda > 0);
});

test("calcularPontoDeAncoragem devolve null se a peça não tem seção no plano", async () => {
  await carregado;
  const peca = pecaDe(cubo(10));
  assert.equal(PC.calcularPontoDeAncoragem(peca, { ponto: [0, 0, 50], normal: [0, 0, 1] }), null);
});

test("planejarConector recusa pino que não cabe na seção e peça fina demais", async () => {
  await carregado;
  const r = cortar(pecaDe(cubo(20)), "z", 50, 0);
  const anc = PC.calcularPontoDeAncoragem(r.negativo, r.plano);
  const grande = PC.planejarConector(r.negativo, r.positivo, r.plano, anc.ponto, 19, 0.2);
  assert.equal(grande.ok, false);
  assert.match(grande.motivo, /não cabe/);

  const fino = cortar(pecaDe(cubo(20)), "z", 5, 0); // lado negativo com 1 mm de espessura
  const ancFino = PC.calcularPontoDeAncoragem(fino.negativo, fino.plano);
  const recusa = PC.planejarConector(fino.negativo, fino.positivo, fino.plano, ancFino.ponto, 5, 0.2);
  assert.equal(recusa.ok, false);
  assert.match(recusa.motivo, /finas demais/);
});

test("planejarConector reduz a saliência pra caber na peça e mantém furo = pino + folga", async () => {
  await carregado;
  const r = cortar(pecaDe(cubo(20)), "z", 25, 0); // lado negativo com 5 mm
  const anc = PC.calcularPontoDeAncoragem(r.negativo, r.plano);
  const plano = PC.planejarConector(r.negativo, r.positivo, r.plano, anc.ponto, 8, 0.3);
  assert.equal(plano.ok, true);
  assert.ok(Math.abs(plano.saliencia - (5 - PC.PAREDE_MINIMA_MM)) < 1e-9);
  assert.ok(Math.abs(plano.raioFuro - plano.raioPino - 0.3) < 1e-12);
  assert.ok(Math.abs(plano.profundidadeFuro - plano.saliencia - 0.3) < 1e-12);
});

// ---------------------------------------------------------------------------
// adicionarConectorNoCorte: caminho de falha (sem CSG) e timeout
// ---------------------------------------------------------------------------

function libsQueNaoPodemSerUsadas() {
  const erro = function () { throw new Error("CSG não deveria ter sido chamado"); };
  return { THREE: new Proxy({}, { get: erro }), CSG: new Proxy({}, { get: erro }) };
}

test("adicionarConectorNoCorte recusa malha com furo sem tentar o CSG", async () => {
  await carregado;
  const r = cortar(pecaDe(cubo(20)), "z", 50, 0);
  const anc = PC.calcularPontoDeAncoragem(r.negativo, r.plano);
  const furada = Object.assign({}, r.positivo, { triangulos: r.positivo.triangulos.slice(1) });
  const res = await PC.adicionarConectorNoCorte(r.negativo.id, furada.id, r.plano, anc.ponto, 5, 0.2, {
    pecas: [r.negativo, furada],
    libs: libsQueNaoPodemSerUsadas()
  });
  assert.equal(res.ok, false);
  assert.equal(res.motivo, "malha não fechada o suficiente");
  assert.equal(res.diagnosticoB.furos, 3);
  assert.deepEqual(res.diagnosticoA, { furos: 0, naoManifold: 0 });
});

test("adicionarConectorNoCorte recusa peça inexistente ou repetida", async () => {
  await carregado;
  const r = cortar(pecaDe(cubo(20)), "z", 50, 0);
  const pecas = [r.negativo, r.positivo];
  const semPeca = await PC.adicionarConectorNoCorte(9999, r.positivo.id, r.plano, [10, 10, 10], 5, 0.2, { pecas: pecas });
  assert.equal(semPeca.ok, false);
  const mesma = await PC.adicionarConectorNoCorte(r.positivo.id, r.positivo.id, r.plano, [10, 10, 10], 5, 0.2, { pecas: pecas });
  assert.equal(mesma.ok, false);
});

function esperaOcupada(ms) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { /* CSG "travado" (síncrono) */ }
}

test("executarComTimeout: etapa síncrona lenta não é interrompida, mas as seguintes não rodam", async () => {
  await carregado;
  let rodouSegunda = false;
  const r = await PC.executarComTimeout([
    function () { esperaOcupada(60); return 1; },
    function () { rodouSegunda = true; return 2; }
  ], 20);
  assert.equal(r, PC.TEMPO_ESGOTADO);
  assert.equal(rodouSegunda, false);

  const ok = await PC.executarComTimeout([function () { return 1; }, function (ant) { return ant[0] + 1; }], 1000);
  assert.deepEqual(ok, [1, 2]);
});

test("adicionarConectorNoCorte devolve 'tempo esgotado' quando o CSG estoura o prazo", async () => {
  await carregado;
  const r = cortar(pecaDe(cubo(20)), "z", 50, 0);
  const anc = PC.calcularPontoDeAncoragem(r.negativo, r.plano);
  class EvaluatorLento {
    evaluate() { esperaOcupada(80); return { geometry: new THREE.BufferGeometry() }; }
  }
  const res = await PC.adicionarConectorNoCorte(r.negativo.id, r.positivo.id, r.plano, anc.ponto, 5, 0.2, {
    pecas: [r.negativo, r.positivo],
    libs: { THREE: THREE, CSG: { Evaluator: EvaluatorLento, Brush: CSG.Brush, ADDITION: CSG.ADDITION, SUBTRACTION: CSG.SUBTRACTION } },
    timeoutMs: 30
  });
  assert.deepEqual(res, { ok: false, motivo: "tempo esgotado" });
});

// ---------------------------------------------------------------------------
// CSG real (three-bvh-csg em Node, sem WebGL)
// ---------------------------------------------------------------------------

async function conectar(r, diametro, folga) {
  const anc = PC.calcularPontoDeAncoragem(r.negativo, r.plano);
  const res = await PC.adicionarConectorNoCorte(r.negativo.id, r.positivo.id, r.plano, anc.ponto, diametro, folga, {
    pecas: [r.negativo, r.positivo],
    libs: { THREE: THREE, CSG: CSG }
  });
  return res;
}

function assertConectorCorreto(r, res, folga) {
  assert.equal(res.ok, true, res.motivo);
  assert.ok(res.geometriaA.isBufferGeometry && res.geometriaB.isBufferGeometry);
  assert.deepEqual(res.diagnosticoA, { furos: 0, naoManifold: 0 });
  assert.deepEqual(res.diagnosticoB, { furos: 0, naoManifold: 0 });
  assert.ok(Math.abs(res.conector.raioFuro - res.conector.raioPino - folga) < 1e-12);

  const pecas = aplicarConectorNasPecas([r.negativo, r.positivo], r.negativo.id, r.positivo.id, res);
  const [pino, furo] = pecas;
  assert.equal(pino.id, r.negativo.id);
  assert.equal(pino.rotulo, r.negativo.rotulo);
  assert.deepEqual(PC.diagnosticarManifoldDaPeca(pino), { furos: 0, naoManifold: 0 });
  assert.deepEqual(PC.diagnosticarManifoldDaPeca(furo), { furos: 0, naoManifold: 0 });

  // Volume: pino saliente soma um prisma de 32 lados; furo tira um prisma
  // maior (raio + folga, profundidade saliência + folga). Volume assinado
  // positivo = winding pra fora preservado.
  const esperadoPino = volumeAssinado(r.negativo) + areaPrisma32(res.conector.raioPino) * res.conector.saliencia;
  const esperadoFuro = volumeAssinado(r.positivo) - areaPrisma32(res.conector.raioFuro) * res.conector.profundidadeFuro;
  assert.ok(Math.abs(volumeAssinado(pino) - esperadoPino) / esperadoPino < 1e-6, "volume do pino " + volumeAssinado(pino) + " vs " + esperadoPino);
  assert.ok(Math.abs(volumeAssinado(furo) - esperadoFuro) / esperadoFuro < 1e-6, "volume do furo " + volumeAssinado(furo) + " vs " + esperadoFuro);

  // O pino sai da seção de corte pro lado da peça do furo; o furo entra na
  // peça por essa mesma seção.
  const normal = r.plano.normal;
  const alcancePino = Math.max.apply(null, pino.vertices.map(function (v) { return window.Wisky3D.MeshClip.distanciaAoPlano(v, r.plano); }));
  assert.ok(Math.abs(alcancePino - res.conector.saliencia) < 1e-6, "pino sai " + alcancePino + " além do plano (normal " + normal + ")");

  // Cor: pino e parede do furo com o cinza da tampa; resto da pintura intacto.
  const coresFuro = new Set(furo.triangulos.map(function (t) { return t.color.join(","); }));
  assert.ok(coresFuro.has("200,30,30"));
  assert.ok(coresFuro.has("176,176,190"));
  return pecas;
}

test("CSG: cubo cortado em Z a 50% ganha pino fechado de um lado e furo com folga do outro", async () => {
  await carregado;
  const r = cortar(pecaDe(cubo(20)), "z", 50, 0);
  const res = await conectar(r, 5, 0.2);
  assertConectorCorreto(r, res, 0.2);
  assert.equal(res.conector.saliencia, 5);
});

test("CSG: cilindro fora da origem com corte inclinado", async () => {
  await carregado;
  const r = cortar(pecaDe(cilindro(48, 12, 40, [128, 128, 0])), "z", 37, 25);
  const res = await conectar(r, 6, 0.25);
  assertConectorCorreto(r, res, 0.25);
});

test("CSG: peça com conector pode ser cortada de novo pelo eixo do pino e continua fechada", async () => {
  await carregado;
  const r = cortar(pecaDe(cubo(20)), "z", 50, 0);
  const res = await conectar(r, 5, 0.2);
  const [pino, furo] = assertConectorCorreto(r, res, 0.2);
  [pino, furo].forEach(function (peca) {
    ["x", "y"].forEach(function (eixo) {
      const r2 = cortar(peca, eixo, 50, 0);
      assert.deepEqual(PC.diagnosticarManifoldDaPeca(r2.negativo), { furos: 0, naoManifold: 0 });
      assert.deepEqual(PC.diagnosticarManifoldDaPeca(r2.positivo), { furos: 0, naoManifold: 0 });
      assert.ok(Math.abs(r2.negativo.volumeMm3 + r2.positivo.volumeMm3 - peca.volumeMm3) < 1e-6);
    });
  });
});

test("CSG: cortes e conectores aleatórios (semente fixa) saem sempre fechados e com o volume esperado", async () => {
  await carregado;
  let semente = 20260930;
  function aleatorio() {
    semente = (semente * 1103515245 + 12345) % 2147483648;
    return semente / 2147483648;
  }
  const formas = [cubo(20), cubo(30, [128, 128, 0]), cilindro(48, 10, 30)];
  let feitos = 0;
  for (let i = 0; i < 30; i++) {
    const forma = formas[i % formas.length];
    const eixo = "xyz"[Math.floor(aleatorio() * 3)];
    const pos = 25 + aleatorio() * 50;
    const incl = Math.round((aleatorio() * 2 - 1) * 40);
    const diametro = 2 + aleatorio() * 5;
    const folga = aleatorio() * 0.4;
    const r = cortar(pecaDe(forma), eixo, pos, incl);
    const res = await conectar(r, diametro, folga);
    if (!res.ok) {
      // Só recusas "de projeto" são aceitáveis aqui (peça fina/pino grande).
      assert.match(res.motivo, /não cabe|finas demais/);
      continue;
    }
    assertConectorCorreto(r, res, folga);
    feitos++;
  }
  assert.ok(feitos >= 25, "só " + feitos + " conectores feitos");
});

test("geometriaParaSoup lê position/color de BufferGeometry indexada e soma a origem", async () => {
  await carregado;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]), 3));
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1]), 3));
  g.setIndex([0, 1, 2, 1, 3, 2]);
  const soup = PC.geometriaParaSoup(g, [10, 0, 0]);
  assert.deepEqual(soup.triangulos[0], [[10, 0, 0], [11, 0, 0], [10, 1, 0]]);
  assert.deepEqual(soup.cores[0], [255, 0, 0]);
  assert.deepEqual(soup.cores[1], [255, 0, 0]);
});

test("costurarSoup fecha T-junction (aresta longa de um lado, duas curtas do outro)", async () => {
  await carregado;
  // Cubo 2 com a face y=0 dividida em 4 triângulos em volta de um vértice
  // no meio da aresta de baixo (1,0,0): a face z=0 continua com a aresta
  // longa (0,0,0)-(2,0,0) inteira.
  const v = (x, y, z) => [x, y, z];
  const tris = cubo(2).filter(function (t, i) { return i !== 4 && i !== 5; });
  const m = v(1, 0, 0);
  tris.push([v(0, 0, 0), m, v(0, 0, 2)], [m, v(2, 0, 0), v(2, 0, 2)], [m, v(2, 0, 2), v(0, 0, 2)]);
  const antes = pecaDe(tris);
  assert.ok(PC.diagnosticarManifoldDaPeca(antes).furos > 0);
  const costurado = PC.costurarSoup(tris, null);
  assert.equal(costurado.furos, 0);
  assert.equal(costurado.naoManifold, 0);
  const depois = pecaDe(costurado.triangulos);
  assert.ok(Math.abs(volumeAssinado(depois) - 8) < 1e-12);
});

test("aplicarConectorNasPecas não mexe nas outras peças nem na lista de entrada", async () => {
  await carregado;
  const outra = pecaDe(cubo(5, [100, 0, 0]));
  const r = cortar(pecaDe(cubo(20)), "z", 50, 0);
  const res = await conectar(r, 5, 0.2);
  const entrada = [outra, r.negativo, r.positivo];
  const saida = aplicarConectorNasPecas(entrada, r.negativo.id, r.positivo.id, res);
  assert.equal(saida[0], outra);
  assert.notEqual(saida[1], r.negativo);
  assert.equal(entrada[1], r.negativo);
  assert.ok(saida[1].volumeMm3 > r.negativo.volumeMm3);
  assert.ok(saida[2].volumeMm3 < r.positivo.volumeMm3);
  assert.deepEqual(triangulosDaPeca(saida[2]).triangulos.length, saida[2].triangulos.length);
});
