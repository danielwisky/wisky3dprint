const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { DOMParser } = require("@xmldom/xmldom");

const source = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "model-parser.js"), "utf8");
global.window = global;
global.DOMParser = DOMParser;
new Function(source)();

const { fillMissingFromProfile } = window.Wisky3D.ModelParser;

// Perfil de 4 cabeças com opções que um projeto da Bambu não tem.
const PROFILE = {
  filament_colour: ["#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF"],
  nozzle_diameter: ["0.4", "0.4", "0.4", "0.4"],
  wipe_tower_cone_angle: "12",
  prime_volume: "30",
  prime_tower_width: "35",
  chamber_temperature: ["0", "0", "0", "0"],
  small_area_infill_flow_compensation_model: ["0,0", "0.2,0.4", "0.4,0.61"]
};

function bambuProject() {
  return {
    filament_colour: ["#FFFFFF", "#000000", "#61C680", "#DE4343", "#F7D959", "#E8AFCF", "#8000FF"],
    prime_tower_width: "50",
    wipe_tower_x: ["165"]
  };
}

test("fillMissingFromProfile traz do perfil as opções que o projeto não tem", () => {
  const filled = fillMissingFromProfile(bambuProject(), PROFILE);
  assert.equal(filled.wipe_tower_cone_angle, "12");
  assert.equal(filled.prime_volume, "30");
});

test("fillMissingFromProfile não sobrescreve o que o projeto já tem", () => {
  const filled = fillMissingFromProfile(bambuProject(), PROFILE);
  assert.equal(filled.prime_tower_width, "50");
  assert.deepEqual(filled.wipe_tower_x, ["165"]);
  assert.equal(filled.filament_colour.length, 7);
});

test("fillMissingFromProfile repete listas por filamento até a quantidade do projeto", () => {
  const filled = fillMissingFromProfile(bambuProject(), PROFILE);
  assert.deepEqual(filled.chamber_temperature, ["0", "0", "0", "0", "0", "0", "0"]);
});

test("fillMissingFromProfile copia como estão as listas que não são por filamento", () => {
  const filled = fillMissingFromProfile(bambuProject(), PROFILE);
  assert.deepEqual(filled.small_area_infill_flow_compensation_model, ["0,0", "0.2,0.4", "0.4,0.61"]);
  assert.notEqual(filled.small_area_infill_flow_compensation_model, PROFILE.small_area_infill_flow_compensation_model);
});

test("fillMissingFromProfile sem filament_colour no projeto mantém o tamanho do perfil", () => {
  const filled = fillMissingFromProfile({ prime_tower_width: "50" }, PROFILE);
  assert.deepEqual(filled.chamber_temperature, ["0", "0", "0", "0"]);
});

test("fillMissingFromProfile não altera o projeto original", () => {
  const project = bambuProject();
  fillMissingFromProfile(project, PROFILE);
  assert.equal(project.prime_volume, undefined);
});
