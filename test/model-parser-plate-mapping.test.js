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

function origin(objectId, localIndex, rootObjectId) {
  return {
    path: "3D/3dmodel.model",
    objectId: objectId,
    rootObjectId: rootObjectId === undefined ? objectId : rootObjectId,
    localIndex: localIndex
  };
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

test("mapearTriangulosParaChapas usa rootObjectId (build item de topo), não objectId do object-folha", () => {
  // Simula uma peça montada via <components>: o build item de topo é "10",
  // mas a mesh de verdade vive num object aninhado "10-a" (objectId do
  // leaf). model_settings.config só conhece o id de topo ("10"), então o
  // agrupamento por chapa precisa comparar contra rootObjectId, não objectId.
  const triangleOrigins = [
    origin("10-a", 0, "10"),
    origin("10-a", 1, "10"),
    origin("20", 0, "20")
  ];
  const chapas = [
    { indice: 1, objectIds: new Set(["10"]) },
    { indice: 2, objectIds: new Set(["20"]) }
  ];

  const resultado = ModelParser.mapearTriangulosParaChapas(triangleOrigins, chapas);

  assert.deepEqual(resultado.get(1), [0, 1], "chapa 1 agrupa os triangulos do component aninhado pelo rootObjectId");
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

test("mapearTriangulosParaChapas não atribui a nenhuma chapa quando o rootObjectId é ambíguo (aparece em mais de uma)", () => {
  // objectId "1" aparece tanto na chapa 1 quanto na chapa 2 (ex.: arquivos
  // externos de p:path diferentes reaproveitando o mesmo número de build
  // item) — não dá pra saber de qual chapa é o triângulo, então nenhuma das
  // duas deve ficar com ele (em vez do antigo comportamento de "primeiro
  // match vence", que silenciosamente roubava triângulos de uma chapa pra
  // outra).
  const triangleOrigins = [origin("1", 0), origin("2", 0), origin("1", 1)];
  const chapas = [
    { indice: 1, objectIds: new Set(["1"]) },
    { indice: 2, objectIds: new Set(["1", "2"]) }
  ];

  const resultado = ModelParser.mapearTriangulosParaChapas(triangleOrigins, chapas);

  assert.deepEqual(resultado.get(1), [], "chapa 1 não recebe o id ambíguo");
  assert.deepEqual(resultado.get(2), [1], "chapa 2 só recebe o triângulo do id não ambíguo (\"2\")");
});
