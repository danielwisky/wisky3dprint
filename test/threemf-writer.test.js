const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");

global.window = global;
global.DOMParser = DOMParser;
global.XMLSerializer = XMLSerializer;

const modelParserSource = fs.readFileSync(
  path.join(__dirname, "..", "assets", "js", "model-parser.js"),
  "utf8"
);
new Function(modelParserSource)();

const writerSource = fs.readFileSync(
  path.join(__dirname, "..", "assets", "js", "threemf-writer.js"),
  "utf8"
);
new Function(writerSource)();

const ThreeMFWriter = window.Wisky3D.ThreeMFWriter;

test("filamentIndexParaPaintColor: índice 1 (cabe em 2 bits, sem escape)", () => {
  // 1 << 2 = 4 -> "4"
  assert.equal(ThreeMFWriter.filamentIndexParaPaintColor(1), "4");
});

test("filamentIndexParaPaintColor: índice 2 (cabe em 2 bits, sem escape)", () => {
  // 2 << 2 = 8 -> "8"
  assert.equal(ThreeMFWriter.filamentIndexParaPaintColor(2), "8");
});

test("filamentIndexParaPaintColor: índice 3 (primeiro a usar o escape 11)", () => {
  // nibbles = [3<<2=12, resto=0] -> reverse -> [0, 12] -> "0" + "C" = "0C"
  assert.equal(ThreeMFWriter.filamentIndexParaPaintColor(3), "0C");
});

test("filamentIndexParaPaintColor: índice 18 (escape com nibble de extensão maior)", () => {
  // resto = 18 - 3 = 15 -> nibbles = [12, 15, 0] -> reverse -> [0, 15, 12] -> "0" + "F" + "C" = "0FC"
  assert.equal(ThreeMFWriter.filamentIndexParaPaintColor(18), "0FC");
});

test("criarIndexadorDeCores: cores repetidas recebem o mesmo índice", () => {
  const { indiceDaCor } = ThreeMFWriter.criarIndexadorDeCores();
  const i1 = indiceDaCor(10, 20, 30);
  const i2 = indiceDaCor(10, 20, 30);
  assert.equal(i1, i2, "mesma cor deve gerar o mesmo índice");
});

test("criarIndexadorDeCores: cores novas incrementam o índice", () => {
  const { cores, indiceDaCor } = ThreeMFWriter.criarIndexadorDeCores();
  const i1 = indiceDaCor(10, 20, 30);
  const i2 = indiceDaCor(40, 50, 60);
  const i3 = indiceDaCor(10, 20, 30);
  assert.equal(i1, 0, "primeira cor recebe índice 0");
  assert.equal(i2, 1, "segunda cor distinta recebe índice 1");
  assert.equal(i3, 0, "cor repetida reusa o índice 0");
  assert.equal(cores.length, 2, "só 2 cores distintas foram registradas");
});

test("montarModeloDoZero: 1 object gera 1 <object>, 1 <item> e triângulos com pid/p1 corretos", () => {
  const objetos = [
    {
      objectId: 2,
      vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
      triangulos: [
        { v1: 0, v2: 1, v3: 2, color: [255, 0, 0] },
        { v1: 0, v2: 1, v3: 3, color: [0, 255, 0] },
        { v1: 1, v2: 2, v3: 3, color: [255, 0, 0] }
      ]
    }
  ];

  const { modelXml, contentTypesXml, relsXml } = ThreeMFWriter.montarModeloDoZero(objetos);

  assert.match(contentTypesXml, /Types xmlns/, "contentTypesXml deve conter o elemento Types");
  assert.match(relsXml, /Relationships xmlns/, "relsXml deve conter o elemento Relationships");

  const doc = new DOMParser().parseFromString(modelXml, "application/xml");
  const objectEls = doc.getElementsByTagName("object");
  const itemEls = doc.getElementsByTagName("item");
  const triangleEls = doc.getElementsByTagName("triangle");
  const colorGroupEls = doc.getElementsByTagName("m:colorgroup");
  const colorEls = doc.getElementsByTagName("m:color");

  assert.equal(objectEls.length, 1, "deve ter 1 <object>");
  assert.equal(objectEls[0].getAttribute("id"), "2", "object id deve ser 2");
  assert.equal(itemEls.length, 1, "deve ter 1 <item>");
  assert.equal(itemEls[0].getAttribute("objectid"), "2", "item objectid deve ser 2");
  assert.equal(triangleEls.length, 3, "deve ter 3 <triangle>");
  assert.equal(colorGroupEls.length, 1, "deve ter 1 <m:colorgroup> compartilhado");
  assert.equal(colorEls.length, 2, "deve ter 2 cores distintas no colorgroup (vermelho e verde)");

  assert.equal(triangleEls[0].getAttribute("pid"), "1");
  assert.equal(triangleEls[0].getAttribute("p1"), "0", "primeira cor distinta (vermelho) recebe índice 0");
  assert.equal(triangleEls[1].getAttribute("p1"), "1", "segunda cor distinta (verde) recebe índice 1");
  assert.equal(triangleEls[2].getAttribute("p1"), "0", "vermelho repetido reusa índice 0");
});

test("montarModeloDoZero: 2 objects geram 2 <object>, 2 <item> e colorgroup único compartilhado", () => {
  const objetos = [
    {
      objectId: 2,
      vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      triangulos: [{ v1: 0, v2: 1, v3: 2, color: [255, 0, 0] }]
    },
    {
      objectId: 3,
      vertices: [[2, 0, 0], [3, 0, 0], [2, 1, 0]],
      triangulos: [
        { v1: 0, v2: 1, v3: 2, color: [0, 0, 255] },
        { v1: 0, v2: 1, v3: 2, color: [255, 0, 0] }
      ]
    }
  ];

  const { modelXml } = ThreeMFWriter.montarModeloDoZero(objetos);
  const doc = new DOMParser().parseFromString(modelXml, "application/xml");

  const objectEls = doc.getElementsByTagName("object");
  const itemEls = doc.getElementsByTagName("item");
  const triangleEls = doc.getElementsByTagName("triangle");
  const colorGroupEls = doc.getElementsByTagName("m:colorgroup");
  const colorEls = doc.getElementsByTagName("m:color");

  assert.equal(objectEls.length, 2, "deve ter 2 <object>");
  assert.equal(objectEls[0].getAttribute("id"), "2");
  assert.equal(objectEls[1].getAttribute("id"), "3");
  assert.equal(itemEls.length, 2, "deve ter 2 <item>, um por object");
  assert.deepEqual(
    [itemEls[0].getAttribute("objectid"), itemEls[1].getAttribute("objectid")],
    ["2", "3"],
    "items devem referenciar os objectIds na mesma ordem"
  );
  assert.equal(triangleEls.length, 3, "total de triângulos dos 2 objects");
  assert.equal(colorGroupEls.length, 1, "colorgroup único compartilhado entre os objects");
  assert.equal(colorEls.length, 2, "2 cores distintas no total (vermelho e azul)");

  // Triângulo do primeiro object: vermelho -> índice 0 (primeira cor a aparecer)
  assert.equal(triangleEls[0].getAttribute("p1"), "0");
  // Triângulos do segundo object: azul (nova, índice 1) e vermelho (reusa índice 0)
  assert.equal(triangleEls[1].getAttribute("p1"), "1");
  assert.equal(triangleEls[2].getAttribute("p1"), "0");
});
