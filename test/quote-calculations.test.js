const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

global.window = global;
for (const arquivo of ["price-formula.js", "quote-calculations.js"]) {
  new Function(fs.readFileSync(path.join(__dirname, "..", "assets", "js", arquivo), "utf8"))();
}
const Calculo = window.Wisky3D.QuoteCalculations;

function perto(atual, esperado) {
  assert.ok(Math.abs(atual - esperado) < 1e-9, `${atual} != ${esperado}`);
}

const ENTRADA = {
  nome: "Vaso",
  qtd: 2,
  pesoG: 100,
  horas: 4,
  filamentoKg: 90,
  potenciaW: 150,
  tarifaKwh: 0.8,
  desgaste: 5,
  hardware: 2,
  perdaPct: 10,
  margemPct: 50,
  horasManuais: 0.5,
  valorHora: 40,
  embalagem: 3,
  frete: 7
};

test("calculateItem aplica perda e margem só sobre o subtotal, sem embalagem e frete", () => {
  const item = Calculo.calculateItem(ENTRADA);

  perto(item.subtotal, 16.48);
  perto(item.perda, 1.648);
  perto(item.subtotalComPerda, 18.128);
  perto(item.margem, 9.064);
  assert.equal(item.maoDeObra, 20);
  perto(item.unitTotal, 18.128 + 9.064 + 20 + 3 + 7);
  perto(item.itemTotal, item.unitTotal * 2);
  assert.equal(item.tempoH, 4);
  assert.equal(item.nome, "Vaso");
});

test("calculateItem retorna null com entrada inválida", () => {
  const invalidas = [
    { pesoG: NaN },
    { pesoG: 0 },
    { horas: 0 },
    { filamentoKg: NaN },
    { filamentoKg: 0 },
    { valorHora: -1 },
    { margemPct: -1 },
    { perdaPct: -1 }
  ];
  for (const ajuste of invalidas) {
    assert.equal(Calculo.calculateItem({ ...ENTRADA, ...ajuste }), null, JSON.stringify(ajuste));
  }
});

test("calculateWear proporcional ao tempo quando há valor da máquina e vida útil", () => {
  const desgaste = Calculo.calculateWear({
    valorMaquina: 5000, vidaUtilH: 5000, desgasteFixo: 3, desgastePadrao: 1, horas: 4
  });
  assert.equal(desgaste, 4);
});

test("calculateWear cai no valor fixo e depois no padrão", () => {
  const base = { valorMaquina: NaN, vidaUtilH: 5000, desgastePadrao: 1, horas: 4 };
  assert.equal(Calculo.calculateWear({ ...base, desgasteFixo: 3 }), 3);
  assert.equal(Calculo.calculateWear({ ...base, desgasteFixo: NaN }), 1);
  assert.equal(Calculo.calculateWear({ ...base, valorMaquina: 5000, vidaUtilH: 0, desgasteFixo: 3 }), 3);
});

test("calculateDiscount em percentual, em reais e limitado ao subtotal", () => {
  assert.equal(Calculo.calculateDiscount(200, 10, "pct"), 20);
  assert.equal(Calculo.calculateDiscount(200, 15, "valor"), 15);
  assert.equal(Calculo.calculateDiscount(200, 500, "valor"), 200);
  assert.equal(Calculo.calculateDiscount(200, 0, "pct"), 0);
  assert.equal(Calculo.calculateDiscount(200, NaN, "pct"), 0);
});

const MALHA = {
  volumeMm3: 10000,
  areaMm2: 2000,
  alturaModeloMm: 20,
  densidade: 1.24,
  infillPct: 20,
  paredes: 2,
  larguraExtrusao: 0.4,
  alturaCamada: 0.2,
  velocidade: 50,
  overheadPorCamada: 2
};

test("estimateWeightAndTime soma casca sólida e miolo com infill", () => {
  // casca 2000 × 0,8 = 1600 mm³; miolo 8400 × 20% = 1680 mm³; total 3280 mm³
  // tempo: 3280 / (50 × 0,2 × 0,4) = 820 s + 100 camadas × 2 s = 1020 s = 17 min
  const r = Calculo.estimateWeightAndTime(MALHA);
  perto(r.pesoG, 3.28 * 1.24);
  assert.equal(r.horas, 0);
  assert.equal(r.minutos, 17);
});

test("estimateWeightAndTime limita a casca ao volume da peça", () => {
  const r = Calculo.estimateWeightAndTime({ ...MALHA, areaMm2: 1e6 });
  perto(r.pesoG, 10 * 1.24);
});

test("estimateWeightAndTime arredonda o total antes de separar horas e minutos", () => {
  // 43104 mm³ / 4 mm³/s = 10776 s = 179,6 min → 3h 0min, nunca 2h 60min
  const r = Calculo.estimateWeightAndTime({
    ...MALHA, volumeMm3: 43104, areaMm2: 0, infillPct: 100, alturaModeloMm: 0
  });
  assert.equal(r.horas, 3);
  assert.equal(r.minutos, 0);
});

test("generateCsv tem cabeçalho, uma linha por item com vírgula decimal e total geral", () => {
  const item = Calculo.calculateItem(ENTRADA);
  const semNome = Calculo.calculateItem({ ...ENTRADA, nome: "", qtd: 1 });
  const linhas = Calculo.generateCsv([item, semNome]).split("\r\n");

  assert.equal(linhas.length, 4);
  assert.ok(linhas[0].startsWith("Peça;Quantidade;Filamento;"));
  assert.ok(linhas[1].startsWith("Vaso;2;9,00;0,48;5,00;2,00;16,48;10,00;"));
  assert.ok(linhas[2].startsWith("Peça 2;1;"));
  assert.equal(linhas[3].split(";").length, 18);
  assert.ok(linhas[3].startsWith("Total geral;"));
  assert.ok(linhas[3].endsWith(";" + (item.itemTotal + semNome.itemTotal).toFixed(2).replace(".", ",")));
});

test("generateCsv escapa campos com ponto e vírgula ou aspas", () => {
  const item = Calculo.calculateItem({ ...ENTRADA, nome: 'Peça "A"; v2' });
  const linha = Calculo.generateCsv([item]).split("\r\n")[1];
  assert.ok(linha.startsWith('"Peça ""A""; v2";2;'));
});
