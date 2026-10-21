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

const { repositionByPlate } = window.Wisky3D.ModelParser;

const PLATE_256 = ["0x0", "256x0", "256x256", "0x256"];
const PLATE_220 = ["0x0", "220x0", "220x220", "0x220"];

function buildModel(items) {
  return `<model unit="millimeter">
 <resources>
  <object id="1" type="model"><components><component objectid="9" transform="1 0 0 0 1 0 0 0 1 5 6 7"/></components></object>
 </resources>
 <build>
${items.map(([id, t]) => `  <item objectid="${id}" transform="${t}" printable="1"/>`).join("\n")}
 </build>
</model>`;
}

function translation(xml, objectId) {
  const t = xml.match(new RegExp(`<item objectid="${objectId}" transform="([^"]*)"`))[1].split(" ");
  return [Number(t[9]), Number(t[10]), Number(t[11])];
}

test("repositionByPlate com uma mesa leva a peça ao centro da mesa de destino mantendo o afastamento", () => {
  const xml = buildModel([["1", "1 0 0 0 1 0 0 0 1 149.1 105.4 12"]]);

  const adjusted = repositionByPlate(xml, PLATE_256, PLATE_220);

  const [x, y, z] = translation(adjusted, "1");
  assert.ok(Math.abs(x - 131.1) < 1e-6, `x=${x}`);
  assert.ok(Math.abs(y - 87.4) < 1e-6, `y=${y}`);
  assert.equal(z, 12, "altura não muda");
});

test("repositionByPlate mantém cada peça na mesma célula da grade de mesas", () => {
  // Monitor Grinch (X1 Carbon, 4 mesas): mesa 2 na coluna 1, mesa 3 na linha -1, mesa 4 nas duas
  const xml = buildModel([
    ["4", "1 0 0 0 1 0 0 0 1 149.1 105.4 0"],
    ["2", "1 0 0 0 1 0 0 0 1 443.9 65.2 0"],
    ["8", "1 0 0 0 1 0 0 0 1 114.7 -212.4 0"],
    ["10", "1 0 0 0 1 0 0 0 1 426.6 -207.1 0"]
  ]);

  const adjusted = repositionByPlate(xml, PLATE_256, PLATE_220);

  // passo da grade no destino: 1,2 × 220 = 264
  const expected = {
    "4": [110 + 21.1, 110 - 22.6],
    "2": [110 + 264 + 8.7, 110 - 62.8],
    "8": [110 - 13.3, 110 - 264 - 33.2],
    "10": [110 + 264 - 8.6, 110 - 264 - 27.9]
  };
  Object.keys(expected).forEach((id) => {
    const [x, y] = translation(adjusted, id);
    assert.ok(Math.abs(x - expected[id][0]) < 1e-6, `objeto ${id}: x=${x}, esperado ${expected[id][0]}`);
    assert.ok(Math.abs(y - expected[id][1]) < 1e-6, `objeto ${id}: y=${y}, esperado ${expected[id][1]}`);
  });
});

test("repositionByPlate preserva rotação/escala do item e não mexe em components", () => {
  const xml = buildModel([["1", "0.707107 -0.707107 0 0.707107 0.707107 0 0 0 1.5 128 128 3.25"]]);

  const adjusted = repositionByPlate(xml, PLATE_256, PLATE_220);

  assert.match(adjusted, /<item objectid="1" transform="0\.707107 -0\.707107 0 0\.707107 0\.707107 0 0 0 1\.5 110 110 3\.25"/);
  assert.match(adjusted, /<component objectid="9" transform="1 0 0 0 1 0 0 0 1 5 6 7"\/>/);
});

test("repositionByPlate considera mesas com origem fora do canto (área centrada em 0,0)", () => {
  const centered = ["-110x-110", "110x-110", "110x110", "-110x110"];
  const xml = buildModel([["1", "1 0 0 0 1 0 0 0 1 138 118 0"]]);

  const adjusted = repositionByPlate(xml, PLATE_256, centered);

  const [x, y] = translation(adjusted, "1");
  assert.ok(Math.abs(x - 10) < 1e-6, `x=${x}`);
  assert.ok(Math.abs(y + 10) < 1e-6, `y=${y}`);
});

test("repositionByPlate devolve null quando falta a área de uma das mesas", () => {
  const xml = buildModel([["1", "1 0 0 0 1 0 0 0 1 128 128 0"]]);

  assert.equal(repositionByPlate(xml, null, PLATE_220), null);
  assert.equal(repositionByPlate(xml, PLATE_256, ["0x0"]), null);
});

test("repositionByPlate deixa intacto item com transform fora do formato de 12 números", () => {
  const xml = buildModel([["1", "1 0 0 0 1 0 0 0 1 128 128"]]);

  assert.equal(repositionByPlate(xml, PLATE_256, PLATE_220), xml);
});

const { repositionTowers } = window.Wisky3D.ModelParser;

test("repositionTowers desloca a torre de cada mesa junto com as peças", () => {
  const config = {
    wipe_tower_x: ["81.1551", "149.919"],
    wipe_tower_y: ["160.819", "174.995"],
    prime_tower_width: "35"
  };

  const towers = repositionTowers(config, PLATE_256, PLATE_220);

  assert.deepEqual(towers, { wipe_tower_x: ["63.1551", "131.919"], wipe_tower_y: ["142.819", "156.995"] });
});

test("repositionTowers mantém a torre inteira dentro da mesa de destino", () => {
  const config = { wipe_tower_x: ["240"], wipe_tower_y: ["-30"], prime_tower_width: "35" };

  const towers = repositionTowers(config, PLATE_256, PLATE_220);

  assert.deepEqual(towers, { wipe_tower_x: ["185"], wipe_tower_y: ["0"] });
});

test("repositionTowers aceita valor único (não lista) e devolve no mesmo formato", () => {
  const config = { wipe_tower_x: "100", wipe_tower_y: "100" };

  const towers = repositionTowers(config, PLATE_256, PLATE_220);

  assert.deepEqual(towers, { wipe_tower_x: "82", wipe_tower_y: "82" });
});

test("repositionTowers devolve null sem torre ou sem área de mesa", () => {
  assert.equal(repositionTowers({}, PLATE_256, PLATE_220), null);
  assert.equal(repositionTowers({ wipe_tower_x: ["1"], wipe_tower_y: ["1"] }, null, PLATE_220), null);
});
