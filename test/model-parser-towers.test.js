const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { DOMParser } = require("@xmldom/xmldom");

const source = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "model-parser.js"), "utf8");
global.window = global;
global.DOMParser = DOMParser;
new Function(source)();

const { footprintsByPlate, placeTowers } = window.Wisky3D.ModelParser;

const PLATE_256 = ["0x0", "256x0", "256x256", "0x256"];
const PLATE_220 = ["0x0", "220x0", "220x220", "0x220"];

function bbox(x0, y0, x1, y1) {
  return { minX: x0, minY: y0, minZ: 0, maxX: x1, maxY: y1, maxZ: 10 };
}

// Projeto de origem numa mesa de 256 com 2 filamentos e torre ligada.
function sourceConfig(towersX, towersY) {
  return {
    printable_area: PLATE_256,
    wipe_tower_x: towersX,
    wipe_tower_y: towersY,
    enable_prime_tower: "1",
    filament_colour: ["#FFFFFF", "#000000"]
  };
}

// Config já convertida para a mesa de 220 (hardware do destino, processo da origem).
function targetConfig(extra) {
  return Object.assign(
    {
      printable_area: PLATE_220,
      prime_tower_width: "35",
      wipe_tower_rotation_angle: "0",
      enable_prime_tower: "1",
      filament_colour: ["#FFFFFF", "#000000"]
    },
    extra || {}
  );
}

const FACTORY = { wipe_tower_x: ["15"], wipe_tower_y: ["170"] };

function overlaps(tower, footprint, side) {
  const [x, y] = tower.map(Number);
  return x < footprint[2] && x + side > footprint[0] && y < footprint[3] && y + side > footprint[1];
}

test("footprintsByPlate leva cada item para as coordenadas da própria mesa no destino", () => {
  // mesa 1 na célula (0,0), mesa 2 na coluna 1 (passo 1,2 × 256 = 307,2)
  const items = [
    { objectId: "1", bbox: bbox(100, 100, 150, 150) },
    { objectId: "2", bbox: bbox(307.2 + 20, 30, 307.2 + 60, 70) }
  ];

  const footprints = footprintsByPlate(items, [["1"], ["2"]], PLATE_256, PLATE_220, 2);

  // centro 128 → 110: tudo anda -18 em cada eixo, já na coordenada da mesa
  assert.deepEqual(footprints, [[[82, 82, 132, 132]], [[2, 12, 42, 52]]]);
});

test("footprintsByPlate sem atribuição de mesas põe todos os itens na mesa 1", () => {
  const footprints = footprintsByPlate(
    [{ objectId: "1", bbox: bbox(100, 100, 150, 150) }],
    null,
    PLATE_256,
    PLATE_220,
    1
  );

  assert.deepEqual(footprints, [[[82, 82, 132, 132]]]);
});

test("placeTowers mantém a torre onde o autor deixou (com o deslocamento das peças) se estiver livre", () => {
  const towers = placeTowers(sourceConfig(["40"], ["40"]), targetConfig(), FACTORY, [[[100, 100, 150, 150]]]);

  assert.deepEqual(towers, { wipe_tower_x: ["22"], wipe_tower_y: ["22"] });
});

test("placeTowers usa a posição de fábrica quando a do autor cai em cima de uma peça", () => {
  const pieces = [[0, 0, 100, 100]];
  const towers = placeTowers(sourceConfig(["40"], ["40"]), targetConfig(), FACTORY, [pieces]);

  assert.deepEqual(towers, { wipe_tower_x: ["15"], wipe_tower_y: ["170"] });
});

test("placeTowers procura o ponto livre mais perto quando autor e fábrica estão ocupados", () => {
  const pieces = [
    [0, 0, 100, 100],
    [0, 120, 220, 220]
  ];
  const towers = placeTowers(sourceConfig(["40"], ["40"]), targetConfig(), FACTORY, [pieces]);

  const side = 40;
  pieces.forEach((p) =>
    assert.ok(
      !overlaps([towers.wipe_tower_x[0], towers.wipe_tower_y[0]], p, side),
      `torre em ${towers.wipe_tower_x[0]},${towers.wipe_tower_y[0]} encosta em ${p}`
    )
  );
  const [x, y] = [Number(towers.wipe_tower_x[0]), Number(towers.wipe_tower_y[0])];
  assert.ok(x >= 6 && x + side <= 214 && y >= 6 && y + side <= 214, `torre fora da mesa: ${x},${y}`);
});

test("placeTowers respeita bed_exclude_area do destino", () => {
  // canto onde o autor deixou a torre proibido no destino, e fábrica também
  const towers = placeTowers(
    sourceConfig(["40"], ["40"]),
    targetConfig({ bed_exclude_area: ["0x0", "80x0", "80x80", "0x80", "0x150", "80x150", "80x220", "0x220"] }),
    FACTORY,
    [[]]
  );

  const [x, y] = [Number(towers.wipe_tower_x[0]), Number(towers.wipe_tower_y[0])];
  assert.ok(!(x < 86 && y < 86) && !(x < 86 && y + 40 > 144), `torre na área proibida: ${x},${y}`);
});

test("placeTowers calcula uma posição por mesa", () => {
  const towers = placeTowers(sourceConfig(["40", "150"], ["40", "150"]), targetConfig(), FACTORY, [
    [[0, 0, 100, 100]],
    []
  ]);

  assert.deepEqual(towers.wipe_tower_x, ["15", "132"]);
  assert.deepEqual(towers.wipe_tower_y, ["170", "132"]);
});

test("placeTowers devolve null com torre desligada ou um filamento só", () => {
  assert.equal(
    placeTowers(sourceConfig(["40"], ["40"]), targetConfig({ enable_prime_tower: "0" }), FACTORY, [[]]),
    null
  );
  assert.equal(
    placeTowers(sourceConfig(["40"], ["40"]), targetConfig({ filament_colour: ["#FFFFFF"] }), FACTORY, [[]]),
    null
  );
});

test("footprintsByPlate usa a posição do item (como repositionByPlate), não o centro do bbox", () => {
  // peça comprida: posição na célula 0, mas o centro do bbox já passa de 0,5 × passo
  const item = { objectId: "1", position: [128, 128], bbox: bbox(100, 100, 400, 150) };

  const footprints = footprintsByPlate([item], null, PLATE_256, PLATE_220, 1);

  assert.deepEqual(footprints, [[[82, 82, 382, 132]]]);
});

test("placeTowers volta ao deslocamento simples quando o perfil não tem região válida para a torre", () => {
  // as áreas dos dois bicos não se cruzam
  const config = targetConfig({ extruder_printable_area: ["0x0,100x0,100x220,0x220", "120x0,220x0,220x220,120x220"] });

  const towers = placeTowers(sourceConfig(["40"], ["40"]), config, FACTORY, [[]]);

  assert.deepEqual(towers, { wipe_tower_x: ["22"], wipe_tower_y: ["22"] });
});

test("placeTowers aceita bed_exclude_area com os pontos num texto só", () => {
  const towers = placeTowers(
    sourceConfig(["40"], ["40"]),
    targetConfig({ bed_exclude_area: ["0x0,80x0,80x80,0x80"] }),
    { wipe_tower_x: ["22"], wipe_tower_y: ["22"] },
    [[]]
  );

  const [x, y] = [Number(towers.wipe_tower_x[0]), Number(towers.wipe_tower_y[0])];
  assert.ok(!(x < 86 && y < 86), `torre na área proibida: ${x},${y}`);
});
