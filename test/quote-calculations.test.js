const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

global.window = global;
for (const file of ["price-formula.js", "quote-calculations.js"]) {
  new Function(fs.readFileSync(path.join(__dirname, "..", "assets", "js", file), "utf8"))();
}
const Calculations = window.Wisky3D.QuoteCalculations;

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

const INPUT = {
  name: "Vaso",
  quantity: 2,
  weightG: 100,
  hours: 4,
  filamentPricePerKg: 90,
  powerW: 150,
  kwhRate: 0.8,
  wear: 5,
  hardware: 2,
  lossPct: 10,
  marginPct: 50,
  manualHours: 0.5,
  hourlyRate: 40,
  packaging: 3,
  shipping: 7
};

test("calculateItem aplica perda e margem só sobre o subtotal, sem embalagem e frete", () => {
  const item = Calculations.calculateItem(INPUT);

  near(item.subtotal, 16.48);
  near(item.loss, 1.648);
  near(item.subtotalWithLoss, 18.128);
  near(item.margin, 9.064);
  assert.equal(item.labor, 20);
  near(item.unitTotal, 18.128 + 9.064 + 20 + 3 + 7);
  near(item.itemTotal, item.unitTotal * 2);
  assert.equal(item.timeH, 4);
  assert.equal(item.name, "Vaso");
});

test("calculateItem retorna null com entrada inválida", () => {
  const invalid = [
    { weightG: NaN },
    { weightG: 0 },
    { hours: 0 },
    { filamentPricePerKg: NaN },
    { filamentPricePerKg: 0 },
    { hourlyRate: -1 },
    { marginPct: -1 },
    { lossPct: -1 }
  ];
  for (const override of invalid) {
    assert.equal(Calculations.calculateItem({ ...INPUT, ...override }), null, JSON.stringify(override));
  }
});

test("calculateWear proporcional ao tempo quando há valor da máquina e vida útil", () => {
  const wear = Calculations.calculateWear({
    machineValue: 5000,
    lifespanH: 5000,
    fixedWear: 3,
    defaultWear: 1,
    hours: 4
  });
  assert.equal(wear, 4);
});

test("calculateWear cai no valor fixo e depois no padrão", () => {
  const base = { machineValue: NaN, lifespanH: 5000, defaultWear: 1, hours: 4 };
  assert.equal(Calculations.calculateWear({ ...base, fixedWear: 3 }), 3);
  assert.equal(Calculations.calculateWear({ ...base, fixedWear: NaN }), 1);
  assert.equal(Calculations.calculateWear({ ...base, machineValue: 5000, lifespanH: 0, fixedWear: 3 }), 3);
});

test("calculateDiscount em percentual, em reais e limitado ao subtotal", () => {
  assert.equal(Calculations.calculateDiscount(200, 10, "pct"), 20);
  assert.equal(Calculations.calculateDiscount(200, 15, "amount"), 15);
  assert.equal(Calculations.calculateDiscount(200, 500, "amount"), 200);
  assert.equal(Calculations.calculateDiscount(200, 0, "pct"), 0);
  assert.equal(Calculations.calculateDiscount(200, NaN, "pct"), 0);
});

const MESH = {
  volumeMm3: 10000,
  areaMm2: 2000,
  modelHeightMm: 20,
  density: 1.24,
  infillPct: 20,
  walls: 2,
  extrusionWidth: 0.4,
  layerHeight: 0.2,
  speed: 50,
  overheadPerLayer: 2
};

test("estimateWeightAndTime soma casca sólida e miolo com infill", () => {
  // casca 2000 × 0,8 = 1600 mm³; miolo 8400 × 20% = 1680 mm³; total 3280 mm³
  // tempo: 3280 / (50 × 0,2 × 0,4) = 820 s + 100 camadas × 2 s = 1020 s = 17 min
  const r = Calculations.estimateWeightAndTime(MESH);
  near(r.weightG, 3.28 * 1.24);
  assert.equal(r.hours, 0);
  assert.equal(r.minutes, 17);
});

test("estimateWeightAndTime limita a casca ao volume da peça", () => {
  const r = Calculations.estimateWeightAndTime({ ...MESH, areaMm2: 1e6 });
  near(r.weightG, 10 * 1.24);
});

test("estimateWeightAndTime arredonda o total antes de separar horas e minutos", () => {
  // 43104 mm³ / 4 mm³/s = 10776 s = 179,6 min → 3h 0min, nunca 2h 60min
  const r = Calculations.estimateWeightAndTime({
    ...MESH,
    volumeMm3: 43104,
    areaMm2: 0,
    infillPct: 100,
    modelHeightMm: 0
  });
  assert.equal(r.hours, 3);
  assert.equal(r.minutes, 0);
});

test("generateCsv tem cabeçalho, uma linha por item com vírgula decimal e total geral", () => {
  const item = Calculations.calculateItem(INPUT);
  const unnamed = Calculations.calculateItem({ ...INPUT, name: "", quantity: 1 });
  const lines = Calculations.generateCsv([item, unnamed]).split("\r\n");

  assert.equal(lines.length, 4);
  assert.ok(lines[0].startsWith("Peça;Quantidade;Filamento;"));
  assert.ok(lines[1].startsWith("Vaso;2;9,00;0,48;5,00;2,00;16,48;10,00;"));
  assert.ok(lines[2].startsWith("Peça 2;1;"));
  assert.equal(lines[3].split(";").length, 18);
  assert.ok(lines[3].startsWith("Total geral;"));
  assert.ok(lines[3].endsWith(";" + (item.itemTotal + unnamed.itemTotal).toFixed(2).replace(".", ",")));
});

test("generateCsv escapa campos com ponto e vírgula ou aspas", () => {
  const item = Calculations.calculateItem({ ...INPUT, name: 'Peça "A"; v2' });
  const line = Calculations.generateCsv([item]).split("\r\n")[1];
  assert.ok(line.startsWith('"Peça ""A""; v2";2;'));
});

test("formatDuration arredonda o total antes de separar horas e minutos", () => {
  assert.equal(Calculations.formatDuration(4.5), "4h 30min");
  assert.equal(Calculations.formatDuration(2), "2h");
  assert.equal(Calculations.formatDuration(14 / 60), "0h 14min");
  // 1h 59,7min: arredondar só os minutos daria "1h 60min"
  assert.equal(Calculations.formatDuration(1 + 59.7 / 60), "2h");
});

test("calculateItem: unitTotal bate com a soma das linhas do detalhamento", () => {
  const item = Calculations.calculateItem(INPUT);
  near(item.unitTotal, item.subtotalWithLoss + item.margin + item.labor + item.packaging + item.shipping);
  near(
    item.unitTotal,
    Calculations.unitTotalWithMargin(item.subtotalWithLoss, item.marginPct, item.labor, item.packaging, item.shipping)
  );
});
