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

const ModelParser = window.Wisky3D.ModelParser;

function origin(objectId, localIndex) {
  return { path: "3D/3dmodel.model", objectId: objectId, localIndex: localIndex };
}

test("mapearTriangulosParaChapas agrupa triangulos por chapa de acordo com objectId", () => {
  // 6 triangulos, 3 objectIds diferentes ("1", "2", "3"), 2 chapas:
  // chapa 1 = objectIds "1" e "2"; chapa 2 = objectId "3".
  const triangleOrigins = [
    origin("1", 0),
    origin("1", 1),
    origin("2", 0),
    origin("3", 0),
    origin("2", 1),
    origin("3", 1)
  ];
  const chapas = [
    { indice: 1, objectIds: new Set(["1", "2"]) },
    { indice: 2, objectIds: new Set(["3"]) }
  ];

  const resultado = ModelParser.mapearTriangulosParaChapas(triangleOrigins, chapas);

  assert.ok(resultado instanceof Map, "resultado deve ser um Map");
  assert.deepEqual(resultado.get(1), [0, 1, 2, 4], "chapa 1 agrupa os triangulos dos objectIds 1 e 2");
  assert.deepEqual(resultado.get(2), [3, 5], "chapa 2 agrupa os triangulos do objectId 3");
});

test("mapearTriangulosParaChapas ignora triangulos cujo objectId não bate com nenhuma chapa", () => {
  const triangleOrigins = [origin("1", 0), origin("99", 0), origin("2", 0)];
  const chapas = [
    { indice: 1, objectIds: new Set(["1"]) },
    { indice: 2, objectIds: new Set(["2"]) }
  ];

  const resultado = ModelParser.mapearTriangulosParaChapas(triangleOrigins, chapas);

  assert.deepEqual(resultado.get(1), [0]);
  assert.deepEqual(resultado.get(2), [2]);
});

test("mapearTriangulosParaChapas com lista de origins vazia retorna grupos vazios", () => {
  const chapas = [
    { indice: 1, objectIds: new Set(["1"]) },
    { indice: 2, objectIds: new Set(["2"]) }
  ];

  const resultado = ModelParser.mapearTriangulosParaChapas([], chapas);

  assert.deepEqual(resultado.get(1), []);
  assert.deepEqual(resultado.get(2), []);
});
