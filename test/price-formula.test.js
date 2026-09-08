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
