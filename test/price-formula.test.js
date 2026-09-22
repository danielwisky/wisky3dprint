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

test("calcularSubtotalBase soma filamento + energia + desgaste", () => {
  const resultado = window.Wisky3D.calcularSubtotalBase({
    pesoG: 100,
    horas: 4,
    filamentoKg: 90,
    potenciaW: 150,
    tarifaKwh: 0.8,
    desgaste: 5
  });

  assert.equal(resultado.custoFilamento, 9);
  assert.equal(resultado.energia, 0.48);
  assert.equal(resultado.desgaste, 5);
  assert.ok(Math.abs(resultado.subtotal - 14.48) < 1e-9);
});

test("calcularSubtotalBase com peso, tempo ou desgaste zero", () => {
  const resultado = window.Wisky3D.calcularSubtotalBase({
    pesoG: 0,
    horas: 0,
    filamentoKg: 90,
    potenciaW: 150,
    tarifaKwh: 0.8,
    desgaste: 0
  });

  assert.equal(resultado.custoFilamento, 0);
  assert.equal(resultado.energia, 0);
  assert.equal(resultado.subtotal, 0);
});

test("parseNumeroPtBr converte vírgula decimal", () => {
  assert.equal(window.Wisky3D.parseNumeroPtBr("12,5"), 12.5);
  assert.equal(window.Wisky3D.parseNumeroPtBr("100"), 100);
});

test("parseNumeroPtBr remove separador de milhar antes da vírgula decimal", () => {
  assert.equal(window.Wisky3D.parseNumeroPtBr("3.000"), 3000);
  assert.equal(window.Wisky3D.parseNumeroPtBr("3.000,50"), 3000.5);
  assert.equal(window.Wisky3D.parseNumeroPtBr("1.250"), 1250);
});

test("parseNumeroPtBr trata ponto sem vírgula como decimal quando não é grupo de milhar", () => {
  // Bug real: peso "174.9" (auto-preenchido via toFixed, ou digitado em
  // formato internacional) era lido como 1749 (10x maior), inflando o orçamento.
  assert.equal(window.Wisky3D.parseNumeroPtBr("174.9"), 174.9);
  assert.equal(window.Wisky3D.parseNumeroPtBr("80.5"), 80.5);
  assert.equal(window.Wisky3D.parseNumeroPtBr("0.2"), 0.2);
});

test("parseNumeroPtBr ainda trata ponto seguido de 3 dígitos como milhar", () => {
  assert.equal(window.Wisky3D.parseNumeroPtBr("3.000.000"), 3000000);
});
