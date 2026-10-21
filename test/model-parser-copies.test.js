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

const { mapMeshCopies, triangleCopies } = window.Wisky3D.ModelParser;

function malha(path, objectId, n) {
  return Array.from({ length: n }, (_, localIndex) => ({ path, objectId, rootObjectId: objectId, localIndex }));
}

test("mapMeshCopies devolve null quando nenhuma malha aparece duas vezes", () => {
  const origins = [...malha("3D/3dmodel.model", "1", 3), ...malha("3D/3dmodel.model", "2", 2)];

  assert.equal(mapMeshCopies(origins), null);
});

test("triangleCopies liga o mesmo triângulo de origem em cada cópia da malha", () => {
  // objeto 1 com 3 triângulos instanciado duas vezes, com o objeto 2 no meio
  const origins = [...malha("a", "1", 3), ...malha("a", "2", 2), ...malha("a", "1", 3)];

  const mapa = mapMeshCopies(origins);

  assert.deepEqual(triangleCopies(mapa, 0), [5]);
  assert.deepEqual(triangleCopies(mapa, 2), [7]);
  assert.deepEqual(triangleCopies(mapa, 6), [1]);
  assert.deepEqual(triangleCopies(mapa, 3), [], "objeto 2 só aparece uma vez");
});

test("triangleCopies funciona com três cópias seguidas da mesma malha", () => {
  const origins = [...malha("a", "1", 2), ...malha("a", "1", 2), ...malha("a", "1", 2)];

  const mapa = mapMeshCopies(origins);

  assert.deepEqual(triangleCopies(mapa, 1), [3, 5]);
  assert.deepEqual(triangleCopies(mapa, 4), [0, 2]);
});

test("mesmo objectId em arquivos diferentes não é cópia", () => {
  const origins = [...malha("3D/Objects/a.model", "1", 2), ...malha("3D/Objects/b.model", "1", 2)];

  assert.equal(mapMeshCopies(origins), null);
});

test("triangleCopies devolve vazio sem mapa", () => {
  assert.deepEqual(triangleCopies(null, 0), []);
});
