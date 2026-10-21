const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const source = fs.readFileSync(
  path.join(__dirname, "..", "assets", "js", "price-formula.js"),
  "utf8"
);
global.window = global;
new Function(source)();

test("calculateBaseSubtotal soma filamento + energia + desgaste", () => {
  const result = window.Wisky3D.calculateBaseSubtotal({
    weightG: 100,
    hours: 4,
    filamentPricePerKg: 90,
    powerW: 150,
    kwhRate: 0.8,
    wear: 5
  });

  assert.equal(result.filamentCost, 9);
  assert.equal(result.energy, 0.48);
  assert.equal(result.wear, 5);
  assert.ok(Math.abs(result.subtotal - 14.48) < 1e-9);
});

test("calculateBaseSubtotal com peso, tempo ou desgaste zero", () => {
  const result = window.Wisky3D.calculateBaseSubtotal({
    weightG: 0,
    hours: 0,
    filamentPricePerKg: 90,
    powerW: 150,
    kwhRate: 0.8,
    wear: 0
  });

  assert.equal(result.filamentCost, 0);
  assert.equal(result.energy, 0);
  assert.equal(result.subtotal, 0);
});

test("parsePtBrNumber converte vírgula decimal", () => {
  assert.equal(window.Wisky3D.parsePtBrNumber("12,5"), 12.5);
  assert.equal(window.Wisky3D.parsePtBrNumber("100"), 100);
});

test("parsePtBrNumber remove separador de milhar antes da vírgula decimal", () => {
  assert.equal(window.Wisky3D.parsePtBrNumber("3.000"), 3000);
  assert.equal(window.Wisky3D.parsePtBrNumber("3.000,50"), 3000.5);
  assert.equal(window.Wisky3D.parsePtBrNumber("1.250"), 1250);
});

test("parsePtBrNumber trata ponto sem vírgula como decimal quando não é grupo de milhar", () => {
  // Bug real: peso "174.9" (auto-preenchido via toFixed, ou digitado em
  // formato internacional) era lido como 1749 (10x maior), inflando o orçamento.
  assert.equal(window.Wisky3D.parsePtBrNumber("174.9"), 174.9);
  assert.equal(window.Wisky3D.parsePtBrNumber("80.5"), 80.5);
  assert.equal(window.Wisky3D.parsePtBrNumber("0.2"), 0.2);
});

test("parsePtBrNumber ainda trata ponto seguido de 3 dígitos como milhar", () => {
  assert.equal(window.Wisky3D.parsePtBrNumber("3.000.000"), 3000000);
});

test("parsePtBrMeasure trata ponto sempre como decimal (sem heurística de milhar)", () => {
  // Campos de medida (densidade g/cm³, altura de camada mm) nunca têm
  // milhar, então "1.250" g/cm³ deve continuar 1.25, não virar 1250.
  assert.equal(window.Wisky3D.parsePtBrMeasure("1.250"), 1.25);
  assert.equal(window.Wisky3D.parsePtBrMeasure("0.200"), 0.2);
  assert.equal(window.Wisky3D.parsePtBrMeasure("174.9"), 174.9);
  assert.equal(window.Wisky3D.parsePtBrMeasure("100"), 100);
});

test("parsePtBrMeasure converte vírgula decimal", () => {
  assert.equal(window.Wisky3D.parsePtBrMeasure("1,25"), 1.25);
});
