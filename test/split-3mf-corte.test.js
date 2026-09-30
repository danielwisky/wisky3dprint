const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");
const earcut = require("earcut").default;

global.window = global;
global.DOMParser = DOMParser;
global.XMLSerializer = XMLSerializer;

// Mesmo truque dos outros testes de split-3mf.js: o corpo do módulo só roda
// com #split3mf no DOM, então document.getElementById devolve um elemento
// falso pra qualquer id.
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

global.document = {
  getElementById: function () {
    return criarElementoFalso();
  }
};

function carregar(arquivo) {
  const source = fs.readFileSync(path.join(__dirname, "..", "assets", "js", arquivo), "utf8");
  new Function(source)();
}

// Mesma ordem de <script> de split-3mf.html.
carregar("model-parser.js");
carregar("threemf-writer.js");
carregar("mesh-clip.js");
carregar("split-3mf.js");

const {
  soldarTriangulos,
  triangulosDaPeca,
  criarPeca,
  extrairTriangulosDaUnidade,
  cortarPeca,
  substituirPecaPorCorte,
  montarModeloDasPecas,
  montarCenaDeCorte
} = window.Wisky3D.Split3MF;
const { ModelParser } = window.Wisky3D;

const VERMELHO = [255, 0, 0];

// Cubo fechado [x0,x0+l]x[y0,y0+l]x[z0,z0+l], normais pra fora.
function cubo(l, origem) {
  const o = origem || [0, 0, 0];
  const v = [
    [0, 0, 0], [l, 0, 0], [l, l, 0], [0, l, 0],
    [0, 0, l], [l, 0, l], [l, l, l], [0, l, l]
  ].map(function (p) { return [p[0] + o[0], p[1] + o[1], p[2] + o[2]]; });
  const faces = [
    [0, 2, 1], [0, 3, 2], // z-
    [4, 5, 6], [4, 6, 7], // z+
    [0, 1, 5], [0, 5, 4], // y-
    [3, 7, 6], [3, 6, 2], // y+
    [0, 4, 7], [0, 7, 3], // x-
    [1, 2, 6], [1, 6, 5]  // x+
  ];
  return faces.map(function (f) { return [v[f[0]], v[f[1]], v[f[2]]]; });
}

function coresUniformes(n, cor) {
  return new Array(n).fill(cor);
}

function contadorDeIdentidades() {
  let n = 1;
  return function () {
    const id = 100 + n;
    return { id: id, rotulo: "Peça " + n++ };
  };
}

// Toda aresta (par de vértices soldados) usada por exatamente 2 triângulos,
// uma vez em cada sentido: malha fechada e com orientação consistente.
function assertManifoldFechada(peca) {
  const uso = new Map();
  peca.triangulos.forEach(function (t) {
    [[t.v1, t.v2], [t.v2, t.v3], [t.v3, t.v1]].forEach(function (a) {
      const chave = a[0] + ">" + a[1];
      uso.set(chave, (uso.get(chave) || 0) + 1);
    });
  });
  uso.forEach(function (n, chave) {
    assert.equal(n, 1, "aresta dirigida repetida " + chave + " em " + peca.rotulo);
    const partes = chave.split(">");
    assert.equal(uso.get(partes[1] + ">" + partes[0]), 1, "aresta sem par " + chave + " em " + peca.rotulo);
  });
}

function volumeAssinado(peca) {
  let total = 0;
  triangulosDaPeca(peca).triangulos.forEach(function (t) {
    const a = t[0], b = t[1], c = t[2];
    total += (a[0] * (b[1] * c[2] - c[1] * b[2]) - a[1] * (b[0] * c[2] - c[0] * b[2]) + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
  });
  return total;
}

function pecaCubo(l, origem) {
  const tris = cubo(l, origem);
  return criarPeca({ id: 1, rotulo: "Objeto 1", unidadeId: 0, origemPecaId: null }, tris, coresUniformes(tris.length, VERMELHO));
}

test("soldarTriangulos: une vértices a ~1e-16 de distância e descarta triângulo degenerado", () => {
  const tris = [
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
    [[1 + 1e-16, 0, 0], [1, 1, 0], [0, 1 - 1e-16, 0]],
    [[0, 0, 0], [1e-9, 0, 0], [0, 0, 1]] // degenera: dois cantos no mesmo vértice
  ];
  const r = soldarTriangulos(tris, [VERMELHO, VERMELHO, VERMELHO]);
  assert.equal(r.vertices.length, 4);
  assert.equal(r.triangulos.length, 2);
  assert.equal(r.triangulos[1].v1, r.triangulos[0].v2);
  assert.equal(r.triangulos[1].v3, r.triangulos[0].v3);
  assert.deepEqual(r.triangulos[0].color, VERMELHO);
});

test("soldarTriangulos: sem cor usa o cinza default", () => {
  const r = soldarTriangulos([[[0, 0, 0], [1, 0, 0], [0, 1, 0]]], undefined);
  assert.deepEqual(r.triangulos[0].color, window.Wisky3D.ThreeMFWriter.DEFAULT_COLOR);
});

test("criarPeca: cubo vira malha indexada de 8 vértices, bbox e volume", () => {
  const peca = pecaCubo(10, [5, 5, 5]);
  assert.equal(peca.vertices.length, 8);
  assert.equal(peca.triangulos.length, 12);
  assert.deepEqual(peca.bbox, { minX: 5, minY: 5, minZ: 5, maxX: 15, maxY: 15, maxZ: 15 });
  assert.ok(Math.abs(peca.volumeMm3 - 1000) < 1e-9);
  assertManifoldFechada(peca);
});

test("cortarPeca: corte axial em Z a 50% gera duas metades fechadas, com tampa na cor default", () => {
  const peca = pecaCubo(10, [5, 5, 5]);
  const r = cortarPeca(peca, "z", 50, 0, { earcutFn: earcut, novaIdentidade: contadorDeIdentidades() });

  assert.equal(r.negativo.rotulo, "Peça 1");
  assert.equal(r.positivo.rotulo, "Peça 2");
  assert.equal(r.negativo.origemPecaId, 1);
  assert.equal(r.positivo.unidadeId, 0);
  assert.ok(Math.abs(r.negativo.volumeMm3 - 500) < 1e-6);
  assert.ok(Math.abs(r.positivo.volumeMm3 - 500) < 1e-6);
  assert.ok(volumeAssinado(r.negativo) > 0, "normais pra fora (volume assinado positivo)");
  assert.ok(volumeAssinado(r.positivo) > 0);
  assert.equal(r.negativo.bbox.maxZ, 10);
  assert.equal(r.positivo.bbox.minZ, 10);
  assertManifoldFechada(r.negativo);
  assertManifoldFechada(r.positivo);

  const temTampaCinza = r.negativo.triangulos.some(function (t) {
    return t.color === window.Wisky3D.MeshClip.COR_TAMPA_PADRAO;
  });
  assert.ok(temTampaCinza);
  assert.ok(r.negativo.triangulos.some(function (t) { return t.color === VERMELHO; }));
});

test("cortarPeca: corte inclinado (30°) conserva o volume e fecha as duas peças", () => {
  const peca = pecaCubo(10, [5, 5, 5]);
  const r = cortarPeca(peca, "x", 40, 30, { earcutFn: earcut, novaIdentidade: contadorDeIdentidades() });
  assert.ok(Math.abs(r.negativo.volumeMm3 + r.positivo.volumeMm3 - 1000) < 1e-6);
  assert.ok(r.negativo.volumeMm3 > 1 && r.positivo.volumeMm3 > 1);
  assertManifoldFechada(r.negativo);
  assertManifoldFechada(r.positivo);
});

test("cortarPeca: plano que não atravessa a peça lança PLANO_NAO_CORTA sem consumir numeração", () => {
  const peca = pecaCubo(10);
  let chamadas = 0;
  const opcoes = { earcutFn: earcut, novaIdentidade: function () { chamadas++; return { id: 9, rotulo: "x" }; } };
  assert.throws(() => cortarPeca(peca, "z", 100, 0, opcoes), (err) => err.codigo === "PLANO_NAO_CORTA");
  assert.throws(() => cortarPeca(peca, "z", 0, 0, opcoes), (err) => err.codigo === "PLANO_NAO_CORTA");
  assert.equal(chamadas, 0);
});

test("substituirPecaPorCorte: cortes sucessivos substituem a peça na mesma posição e conservam o volume", () => {
  const novaIdentidade = contadorDeIdentidades();
  const opcoes = { earcutFn: earcut, novaIdentidade: novaIdentidade };
  const outra = criarPeca({ id: 2, rotulo: "Objeto 2", unidadeId: 1, origemPecaId: null }, cubo(4, [50, 0, 0]), null);
  let pecas = [pecaCubo(10), outra];

  const r1 = substituirPecaPorCorte(pecas, 1, "z", 50, 0, opcoes);
  assert.deepEqual(r1.pecas.map((p) => p.rotulo), ["Peça 1", "Peça 2", "Objeto 2"]);
  assert.equal(pecas.length, 2, "lista de entrada não é alterada");
  pecas = r1.pecas;

  // Corta de novo a metade de cima (Peça 2), agora por um plano inclinado.
  const idPeca2 = pecas[1].id;
  const r2 = substituirPecaPorCorte(pecas, idPeca2, "y", 50, 20, opcoes);
  pecas = r2.pecas;
  assert.deepEqual(pecas.map((p) => p.rotulo), ["Peça 1", "Peça 3", "Peça 4", "Objeto 2"]);
  assert.equal(pecas[1].origemPecaId, idPeca2);
  assert.equal(pecas[2].unidadeId, 0, "unidade de origem é herdada pelos cortes sucessivos");

  // E uma terceira vez, uma peça que já é resultado de corte com tampa.
  const r3 = substituirPecaPorCorte(pecas, pecas[1].id, "x", 50, -45, opcoes);
  pecas = r3.pecas;
  assert.equal(pecas.length, 5);

  const volumeUnidade0 = pecas.filter((p) => p.unidadeId === 0).reduce((s, p) => s + p.volumeMm3, 0);
  assert.ok(Math.abs(volumeUnidade0 - 1000) < 1e-6, "volume total conservado: " + volumeUnidade0);
  pecas.filter((p) => p.unidadeId === 0).forEach(assertManifoldFechada);
});

test("substituirPecaPorCorte: peça inexistente lança erro", () => {
  assert.throws(() => substituirPecaPorCorte([pecaCubo(1)], 42, "z", 50, 0, { earcutFn: earcut, novaIdentidade: contadorDeIdentidades() }));
});

test("extrairTriangulosDaUnidade: filtra por topObjectId e lê a cor de cada triângulo", () => {
  const arquivo = {
    triangulos: [cubo(1)[0], cubo(1)[1], cubo(1)[2]],
    origins: [{ objectId: 7, topObjectId: 3 }, { objectId: 8, topObjectId: 4 }, { objectId: 3 }]
  };
  const cores = new Uint8ClampedArray([10, 20, 30, 1, 2, 3, 10, 20, 30]);
  const r = extrairTriangulosDaUnidade(arquivo, { id: 0, objectIds: [3] }, cores);
  assert.equal(r.triangulos.length, 2);
  assert.deepEqual(r.cores[0], [10, 20, 30]);
  assert.equal(r.cores[0], r.cores[1], "cores iguais compartilham o mesmo array");
});

test("montarModeloDasPecas: um <object> por peça, cores da parede e da tampa no colorgroup", () => {
  const r = cortarPeca(pecaCubo(10), "z", 50, 0, { earcutFn: earcut, novaIdentidade: contadorDeIdentidades() });
  const partes = montarModeloDasPecas([r.negativo, r.positivo]);
  const doc = new DOMParser().parseFromString(partes.modelXml, "application/xml");
  const objects = doc.getElementsByTagName("object");
  assert.equal(objects.length, 2);
  assert.equal(doc.getElementsByTagName("item").length, 2);
  assert.equal(objects[0].getElementsByTagName("vertex").length, r.negativo.vertices.length);
  assert.equal(objects[0].getElementsByTagName("triangle").length, r.negativo.triangulos.length);
  const coresHex = Array.from(doc.getElementsByTagName("m:color")).map((c) => c.getAttribute("color"));
  assert.ok(coresHex.indexOf("#FF0000FF") >= 0 || coresHex.indexOf("#ff0000ff") >= 0, coresHex.join(","));
  assert.equal(coresHex.length, 2);

  const unica = montarModeloDasPecas([r.positivo]);
  assert.equal(new DOMParser().parseFromString(unica.modelXml, "application/xml").getElementsByTagName("object").length, 1);
});

test("montarCenaDeCorte: sem peças mostra as unidades; com peças troca a unidade cortada pelas peças, afastadas", () => {
  const trisA = cubo(10);
  const trisB = cubo(2, [50, 0, 0]);
  const arquivo = {
    triangulos: trisA.concat(trisB, [[[0, 0, 100], [1, 0, 100], [0, 1, 100]]]),
    origins: trisA.map(() => ({ objectId: 1, topObjectId: 1 }))
      .concat(trisB.map(() => ({ objectId: 2, topObjectId: 2 })), [{ objectId: 99 }])
  };
  const unidades = [{ id: 0, objectIds: [1] }, { id: 1, objectIds: [2] }];

  const semCortes = montarCenaDeCorte(arquivo, unidades, [], 0.3);
  assert.equal(semCortes.triCount, 25);
  assert.deepEqual(semCortes.alvos, ["u:0", "u:1"]);
  assert.equal(semCortes.alvoPorTriangulo[0], 0);
  assert.equal(semCortes.alvoPorTriangulo[12], 1);
  assert.equal(semCortes.alvoPorTriangulo[24], -1, "triângulo fora de unidade não é selecionável");
  assert.deepEqual(semCortes.bboxPorAlvo.get("u:0"), { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 10 });

  const base = criarPeca({ id: 1, rotulo: "Objeto 1", unidadeId: 0, origemPecaId: null }, trisA, null);
  const corte = cortarPeca(base, "z", 50, 0, { earcutFn: earcut, novaIdentidade: contadorDeIdentidades() });
  const pecas = [corte.negativo, corte.positivo];
  const cena = montarCenaDeCorte(arquivo, unidades, pecas, 0.3);

  assert.deepEqual(cena.alvos, ["u:1", "p:" + corte.negativo.id, "p:" + corte.positivo.id]);
  assert.equal(cena.triCount, 12 + 1 + corte.negativo.triangulos.length + corte.positivo.triangulos.length);
  // Metade de baixo desce, metade de cima sobe: (centro peça - centro unidade) * 0.3 em Z.
  assert.deepEqual(cena.offsetPorAlvo.get("p:" + corte.negativo.id), [0, 0, -2.5 * 0.3]);
  assert.deepEqual(cena.offsetPorAlvo.get("p:" + corte.positivo.id), [0, 0, 2.5 * 0.3]);
  const ultimo = cena.triCount - 1;
  assert.equal(cena.alvoPorTriangulo[ultimo], 2);
  const zUltimo = [cena.positions[ultimo * 9 + 2], cena.positions[ultimo * 9 + 5], cena.positions[ultimo * 9 + 8]];
  assert.ok(Math.min.apply(null, zUltimo) >= 5 + 0.75 - 1e-5, "peça de cima deslocada pra cima: " + zUltimo);

  const semAfastar = montarCenaDeCorte(arquivo, unidades, pecas, 0);
  assert.deepEqual(semAfastar.offsetPorAlvo.get("p:" + corte.positivo.id), [0, 0, 0]);
});

test("exportação: o XML das peças cortadas, relido, conserva o volume da peça original", () => {
  const peca = pecaCubo(20, [0, 0, 0]);
  const r = cortarPeca(peca, "z", 30, 15, { earcutFn: earcut, novaIdentidade: contadorDeIdentidades() });
  const saida = montarModeloDasPecas([r.negativo, r.positivo]);
  const docSaida = new DOMParser().parseFromString(saida.modelXml, "application/xml");
  let volumeTotal = 0;
  Array.from(docSaida.getElementsByTagName("object")).forEach(function (obj) {
    const verts = Array.from(obj.getElementsByTagName("vertex")).map((v) => [
      Number(v.getAttribute("x")), Number(v.getAttribute("y")), Number(v.getAttribute("z"))
    ]);
    const tris = Array.from(obj.getElementsByTagName("triangle")).map((t) => [
      verts[Number(t.getAttribute("v1"))], verts[Number(t.getAttribute("v2"))], verts[Number(t.getAttribute("v3"))]
    ]);
    volumeTotal += ModelParser.computeMeshVolumeMm3(tris);
  });
  assert.ok(Math.abs(volumeTotal - 8000) < 1e-6, "volume relido: " + volumeTotal);
});

// ---------------------------------------------------------------------------
// Regressões de manifold (fix da Task 14): tampa com pontos colineares,
// lascas de parede, solda perto de meia-célula da grade e solda do contorno
// da tampa em cortes sucessivos.
// ---------------------------------------------------------------------------

// Cilindro fechado de n lados, raio r, altura h, base em `origem`.
function cilindro(n, r, h, origem) {
  const o = origem || [0, 0, 0];
  const v = [[0, 0, 0], [0, 0, h]];
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * i / n;
    v.push([r * Math.cos(a), r * Math.sin(a), 0], [r * Math.cos(a), r * Math.sin(a), h]);
  }
  const faces = [];
  for (let i = 0; i < n; i++) {
    const a = 2 + 2 * i, b = 2 + 2 * ((i + 1) % n);
    faces.push([0, b, a], [1, a + 1, b + 1], [a, b, b + 1], [a, b + 1, a + 1]);
  }
  return faces.map((f) => f.map((k) => [v[k][0] + o[0], v[k][1] + o[1], v[k][2] + o[2]]));
}

// Esfera UV (nu segmentos x nv anéis), com os polos duplicados em nu
// vértices (a solda de criarPeca junta).
function esfera(nu, nv, r, origem) {
  const o = origem || [0, 0, 0];
  const v = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i < nu; i++) {
      const th = Math.PI * j / nv, ph = 2 * Math.PI * i / nu;
      v.push([r * Math.sin(th) * Math.cos(ph) + o[0], r * Math.sin(th) * Math.sin(ph) + o[1], r * Math.cos(th) + o[2]]);
    }
  }
  const id = (i, j) => j * nu + (i % nu);
  const faces = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
      if (j > 0) faces.push([a, d, b]);
      if (j < nv - 1) faces.push([b, d, c]);
    }
  }
  return faces.map((f) => f.map((k) => v[k]));
}

function pecaDe(tris) {
  return criarPeca({ id: 1, rotulo: "Objeto 1", unidadeId: 0, origemPecaId: null }, tris, null);
}

// Relê o XML exportado e confere, por object, que toda aresta dirigida
// aparece uma vez e tem o par oposto (o que um fatiador vê).
function assertExportacaoManifold(pecas) {
  const doc = new DOMParser().parseFromString(montarModeloDasPecas(pecas).modelXml, "application/xml");
  Array.from(doc.getElementsByTagName("object")).forEach(function (obj, i) {
    const triangulos = Array.from(obj.getElementsByTagName("triangle")).map((t) => ({
      v1: Number(t.getAttribute("v1")), v2: Number(t.getAttribute("v2")), v3: Number(t.getAttribute("v3"))
    }));
    assertManifoldFechada({ rotulo: "object " + (i + 1) + " do XML", triangulos: triangulos });
  });
}

test("regressão: cubo com a triangulação do colorido.3mf, Z a 50% com 25° exporta manifold (T-junction na tampa)", () => {
  const peca = pecaCubo(20);
  const r = cortarPeca(peca, "z", 50, 25, { earcutFn: earcut, novaIdentidade: contadorDeIdentidades() });
  assertManifoldFechada(r.negativo);
  assertManifoldFechada(r.positivo);
  assertExportacaoManifold([r.negativo, r.positivo]);
  assert.ok(Math.abs(r.negativo.volumeMm3 + r.positivo.volumeMm3 - 8000) < 1e-6);
});

test("regressão: cilindro de altura 2,469 cortado em Z a 0,5% (plano em meia-célula da grade de solda) fecha o anel", () => {
  const peca = pecaDe(cilindro(64, 8, 2.469));
  [0.5, 1.5, 4.5, 50.5].forEach(function (pos) {
    const r = cortarPeca(peca, "z", pos, 0, { earcutFn: earcut, novaIdentidade: contadorDeIdentidades() });
    assertManifoldFechada(r.negativo);
    assertManifoldFechada(r.positivo);
    assertExportacaoManifold([r.negativo, r.positivo]);
  });
});

test("regressão: corte sucessivo em cilindro fino não funde na tampa vértices que a parede mantém separados", () => {
  const opcoes = { earcutFn: earcut, novaIdentidade: contadorDeIdentidades() };
  const peca = pecaDe(cilindro(64, 8, 2.469, [1.1, 2.2, 3.3]));
  const r1 = cortarPeca(peca, "x", 45, 30, opcoes);
  const r2 = cortarPeca(r1.negativo, "x", 50, -60, opcoes);
  assertManifoldFechada(r2.negativo);
  assertManifoldFechada(r2.positivo);
  assert.ok(Math.abs(r2.negativo.volumeMm3 + r2.positivo.volumeMm3 - r1.negativo.volumeMm3) < 1e-6);
});

test("regressão: cortes aleatórios (semente fixa, com cortes sucessivos) em cubo, cilindro e esfera saem sempre manifold", () => {
  let semente = 20260930;
  function aleatorio() {
    semente = (semente * 1103515245 + 12345) % 2147483648;
    return semente / 2147483648;
  }
  const formas = {
    cubo: cubo(20),
    "cubo transladado": cubo(24.6913, [123.456789, -45.678912, 7.891234]),
    cilindro: cilindro(48, 8, 30, [40, 10, 0]),
    "cilindro fino": cilindro(64, 8, 2.469, [1.1, 2.2, 3.3]),
    esfera: esfera(40, 20, 10, [3.3, 7.7, 11.1])
  };
  let cortes = 0;
  Object.keys(formas).forEach(function (nome) {
    const base = pecaDe(formas[nome]);
    assertManifoldFechada(base);
    for (let k = 0; k < 25; k++) {
      let pecas = [base];
      for (let s = 0; s < 2; s++) {
        const idx = Math.floor(aleatorio() * pecas.length);
        const eixo = "xyz"[Math.floor(aleatorio() * 3)];
        const pos = Math.round(aleatorio() * 198 + 1) / 2;
        const inc = Math.round(aleatorio() * 170 - 85);
        const alvo = pecas[idx];
        let r;
        try {
          r = cortarPeca(alvo, eixo, pos, inc, { earcutFn: earcut, novaIdentidade: contadorDeIdentidades() });
        } catch (err) {
          if (err.codigo === "PLANO_NAO_CORTA") continue;
          throw err;
        }
        cortes++;
        const contexto = nome + " #" + k + "." + s + " (" + eixo + " " + pos + "% " + inc + "°)";
        [r.negativo, r.positivo].forEach(function (p) {
          assertManifoldFechada(Object.assign({}, p, { rotulo: p.rotulo + " de " + contexto }));
        });
        const erroVolume = Math.abs(r.negativo.volumeMm3 + r.positivo.volumeMm3 - alvo.volumeMm3);
        assert.ok(erroVolume < 1e-6 * Math.max(1, alvo.volumeMm3), "volume conservado em " + contexto);
        pecas = pecas.slice(0, idx).concat([r.negativo, r.positivo], pecas.slice(idx + 1));
      }
    }
  });
  assert.ok(cortes > 200, "cortes efetivos: " + cortes);
});

// Cubo 10 com a face x+ dividida em leque a partir de um vértice central
// (10, 5, 5 + desvio): com o plano em z = 5, esse vértice fica a `desvio`
// do plano.
function cuboComVerticeQuaseNoPlano(desvio) {
  const tris = cubo(10).filter(function (t, i) { return i !== 10 && i !== 11; }); // tira a face x+
  const c = [10, 5, 5 + desvio], a = [10, 0, 0], b = [10, 10, 0], cc = [10, 10, 10], d = [10, 0, 10];
  tris.push([a, b, c], [b, cc, c], [cc, d, c], [d, a, c]);
  return tris;
}

test("regressão (Task 15): vértice a ~1e-8 do plano (dentro do EPS de classificação) não abre a tampa", () => {
  [1.4e-8, -1.4e-8, 5e-8, -9e-8, 0].forEach(function (desvio) {
    const peca = pecaDe(cuboComVerticeQuaseNoPlano(desvio));
    assertManifoldFechada(peca);
    const r = cortarPeca(peca, "z", 50, 0, { earcutFn: earcut, novaIdentidade: contadorDeIdentidades() });
    assertManifoldFechada(r.negativo);
    assertManifoldFechada(r.positivo);
    assertExportacaoManifold([r.negativo, r.positivo]);
    assert.ok(Math.abs(r.negativo.volumeMm3 + r.positivo.volumeMm3 - 1000) < 1e-5);
  });
});
