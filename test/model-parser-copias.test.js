const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { DOMParser } = require("@xmldom/xmldom");

const source = fs.readFileSync(
  path.join(__dirname, "..", "assets", "js", "model-parser.js"),
  "utf8"
);
global.window = global;
global.DOMParser = DOMParser;
new Function(source)();

const { mapearCopiasDeMalha, copiasDoTriangulo } = window.Wisky3D.ModelParser;

function malha(path, objectId, n) {
  return Array.from({ length: n }, (_, localIndex) => ({ path, objectId, rootObjectId: objectId, localIndex }));
}

test("mapearCopiasDeMalha devolve null quando nenhuma malha aparece duas vezes", () => {
  const origins = [...malha("3D/3dmodel.model", "1", 3), ...malha("3D/3dmodel.model", "2", 2)];

  assert.equal(mapearCopiasDeMalha(origins), null);
});

test("copiasDoTriangulo liga o mesmo triângulo de origem em cada cópia da malha", () => {
  // objeto 1 com 3 triângulos instanciado duas vezes, com o objeto 2 no meio
  const origins = [...malha("a", "1", 3), ...malha("a", "2", 2), ...malha("a", "1", 3)];

  const mapa = mapearCopiasDeMalha(origins);

  assert.deepEqual(copiasDoTriangulo(mapa, 0), [5]);
  assert.deepEqual(copiasDoTriangulo(mapa, 2), [7]);
  assert.deepEqual(copiasDoTriangulo(mapa, 6), [1]);
  assert.deepEqual(copiasDoTriangulo(mapa, 3), [], "objeto 2 só aparece uma vez");
});

test("copiasDoTriangulo funciona com três cópias seguidas da mesma malha", () => {
  const origins = [...malha("a", "1", 2), ...malha("a", "1", 2), ...malha("a", "1", 2)];

  const mapa = mapearCopiasDeMalha(origins);

  assert.deepEqual(copiasDoTriangulo(mapa, 1), [3, 5]);
  assert.deepEqual(copiasDoTriangulo(mapa, 4), [0, 2]);
});

test("mesmo objectId em arquivos diferentes não é cópia", () => {
  const origins = [...malha("3D/Objects/a.model", "1", 2), ...malha("3D/Objects/b.model", "1", 2)];

  assert.equal(mapearCopiasDeMalha(origins), null);
});

test("copiasDoTriangulo devolve vazio sem mapa", () => {
  assert.deepEqual(copiasDoTriangulo(null, 0), []);
});
