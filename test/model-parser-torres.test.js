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

const { pegadasPorMesa, posicionarTorres } = window.Wisky3D.ModelParser;

const MESA_256 = ["0x0", "256x0", "256x256", "0x256"];
const MESA_220 = ["0x0", "220x0", "220x220", "0x220"];

function bbox(x0, y0, x1, y1) {
  return { minX: x0, minY: y0, minZ: 0, maxX: x1, maxY: y1, maxZ: 10 };
}

// Projeto de origem numa mesa de 256 com 2 filamentos e torre ligada.
function origem(torresX, torresY) {
  return {
    printable_area: MESA_256,
    wipe_tower_x: torresX,
    wipe_tower_y: torresY,
    enable_prime_tower: "1",
    filament_colour: ["#FFFFFF", "#000000"]
  };
}

// Config já convertida para a mesa de 220 (hardware do destino, processo da origem).
function destino(extra) {
  return Object.assign({
    printable_area: MESA_220,
    prime_tower_width: "35",
    wipe_tower_rotation_angle: "0",
    enable_prime_tower: "1",
    filament_colour: ["#FFFFFF", "#000000"]
  }, extra || {});
}

const FABRICA = { wipe_tower_x: ["15"], wipe_tower_y: ["170"] };

function sobrepoe(torre, pegada, lado) {
  const [x, y] = torre.map(Number);
  return x < pegada[2] && x + lado > pegada[0] && y < pegada[3] && y + lado > pegada[1];
}

test("pegadasPorMesa leva cada item para as coordenadas da própria mesa no destino", () => {
  // mesa 1 na célula (0,0), mesa 2 na coluna 1 (passo 1,2 × 256 = 307,2)
  const itens = [
    { objectId: "1", bbox: bbox(100, 100, 150, 150) },
    { objectId: "2", bbox: bbox(307.2 + 20, 30, 307.2 + 60, 70) }
  ];

  const pegadas = pegadasPorMesa(itens, [["1"], ["2"]], MESA_256, MESA_220, 2);

  // centro 128 → 110: tudo anda -18 em cada eixo, já na coordenada da mesa
  assert.deepEqual(pegadas, [[[82, 82, 132, 132]], [[2, 12, 42, 52]]]);
});

test("pegadasPorMesa sem atribuição de mesas põe todos os itens na mesa 1", () => {
  const pegadas = pegadasPorMesa([{ objectId: "1", bbox: bbox(100, 100, 150, 150) }], null, MESA_256, MESA_220, 1);

  assert.deepEqual(pegadas, [[[82, 82, 132, 132]]]);
});

test("posicionarTorres mantém a torre onde o autor deixou (com o deslocamento das peças) se estiver livre", () => {
  const torres = posicionarTorres(origem(["40"], ["40"]), destino(), FABRICA, [[[100, 100, 150, 150]]]);

  assert.deepEqual(torres, { wipe_tower_x: ["22"], wipe_tower_y: ["22"] });
});

test("posicionarTorres usa a posição de fábrica quando a do autor cai em cima de uma peça", () => {
  const pecas = [[0, 0, 100, 100]];
  const torres = posicionarTorres(origem(["40"], ["40"]), destino(), FABRICA, [pecas]);

  assert.deepEqual(torres, { wipe_tower_x: ["15"], wipe_tower_y: ["170"] });
});

test("posicionarTorres procura o ponto livre mais perto quando autor e fábrica estão ocupados", () => {
  const pecas = [[0, 0, 100, 100], [0, 120, 220, 220]];
  const torres = posicionarTorres(origem(["40"], ["40"]), destino(), FABRICA, [pecas]);

  const lado = 40;
  pecas.forEach((p) => assert.ok(!sobrepoe([torres.wipe_tower_x[0], torres.wipe_tower_y[0]], p, lado), `torre em ${torres.wipe_tower_x[0]},${torres.wipe_tower_y[0]} encosta em ${p}`));
  const [x, y] = [Number(torres.wipe_tower_x[0]), Number(torres.wipe_tower_y[0])];
  assert.ok(x >= 6 && x + lado <= 214 && y >= 6 && y + lado <= 214, `torre fora da mesa: ${x},${y}`);
});

test("posicionarTorres respeita bed_exclude_area do destino", () => {
  // canto onde o autor deixou a torre proibido no destino, e fábrica também
  const torres = posicionarTorres(
    origem(["40"], ["40"]),
    destino({ bed_exclude_area: ["0x0", "80x0", "80x80", "0x80", "0x150", "80x150", "80x220", "0x220"] }),
    FABRICA,
    [[]]
  );

  const [x, y] = [Number(torres.wipe_tower_x[0]), Number(torres.wipe_tower_y[0])];
  assert.ok(!(x < 86 && y < 86) && !(x < 86 && y + 40 > 144), `torre na área proibida: ${x},${y}`);
});

test("posicionarTorres calcula uma posição por mesa", () => {
  const torres = posicionarTorres(origem(["40", "150"], ["40", "150"]), destino(), FABRICA, [[[0, 0, 100, 100]], []]);

  assert.deepEqual(torres.wipe_tower_x, ["15", "132"]);
  assert.deepEqual(torres.wipe_tower_y, ["170", "132"]);
});

test("posicionarTorres devolve null com torre desligada ou um filamento só", () => {
  assert.equal(posicionarTorres(origem(["40"], ["40"]), destino({ enable_prime_tower: "0" }), FABRICA, [[]]), null);
  assert.equal(posicionarTorres(origem(["40"], ["40"]), destino({ filament_colour: ["#FFFFFF"] }), FABRICA, [[]]), null);
});
