const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { DOMParser } = require("@xmldom/xmldom");

const source = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "model-parser.js"), "utf8");
global.window = global;
global.DOMParser = DOMParser;
new Function(source)();

const { adjustNozzleVariants } = window.Wisky3D.ModelParser;

const STD = "Direct Drive Standard";
const HF = "Direct Drive High Flow";

// Perfil de uma impressora de 4 cabeças só com a variante Standard, com as
// opções de processo em valor único (formato OrcaSlicer).
const CREATOR_5 = {
  printer_extruder_variant: [STD, STD, STD, STD],
  print_extruder_id: ["1"],
  print_extruder_variant: [STD],
  filament_colour: ["#FFFFFF", "#00C1AE", "#F4E2C1", "#ED1C24"],
  filament_extruder_variant: [STD, STD, STD, STD],
  filament_self_index: ["1", "2", "3", "4"],
  nozzle_temperature: ["210", "210", "210", "210"],
  bridge_speed: "25",
  start_end_points: ["30x-3", "54x245"]
};

// Projeto do Bambu Studio com 3 filamentos e as variantes Standard e High Flow.
function bambuProject() {
  return {
    filament_colour: ["#FFFFFF", "#000000", "#61C680"],
    filament_settings_id: ["A", "B", "C"],
    filament_self_index: ["1", "1", "2", "2", "3", "3"],
    filament_extruder_variant: [STD, HF, STD, HF, STD, HF],
    filament_max_volumetric_speed: ["21", "40", "22", "41", "23", "42"],
    nozzle_temperature: ["220", "230", "221", "231", "222", "232"],
    flush_volumes_vector: ["140", "140", "140", "140", "140", "140"],
    filament_nozzle_map: ["0", "0", "0"],
    filament_volume_map: ["0", "0", "0"],
    filament_extruder_compatibility: ["0", "0", "0"],
    enable_filament_dynamic_map: "0",
    print_extruder_id: ["1", "1"],
    print_extruder_variant: [STD, HF],
    bridge_speed: ["50", "60"],
    enable_height_slowdown: ["0", "1"],
    start_end_points: ["30x-3", "54x245"],
    sparse_infill_density: "15%"
  };
}

test("fica um valor por filamento, o da variante do destino", () => {
  const adjusted = adjustNozzleVariants(bambuProject(), CREATOR_5);
  assert.deepEqual(adjusted.filament_self_index, ["1", "2", "3"]);
  assert.deepEqual(adjusted.filament_extruder_variant, [STD, STD, STD]);
  assert.deepEqual(adjusted.filament_max_volumetric_speed, ["21", "22", "23"]);
  assert.deepEqual(adjusted.nozzle_temperature, ["220", "221", "222"]);
  assert.deepEqual(adjusted.filament_colour, ["#FFFFFF", "#000000", "#61C680"]);
});

test("opções de processo ficam com a variante do destino, no formato do perfil", () => {
  const adjusted = adjustNozzleVariants(bambuProject(), CREATOR_5);
  assert.deepEqual(adjusted.print_extruder_id, ["1"]);
  assert.deepEqual(adjusted.print_extruder_variant, [STD]);
  assert.equal(adjusted.bridge_speed, "50");
  assert.deepEqual(adjusted.enable_height_slowdown, ["0"]);
  assert.equal(adjusted.sparse_infill_density, "15%");
});

test("listas que não são por variante ficam como estão", () => {
  const adjusted = adjustNozzleVariants(bambuProject(), CREATOR_5);
  assert.deepEqual(adjusted.flush_volumes_vector, ["140", "140", "140", "140", "140", "140"]);
  assert.deepEqual(adjusted.start_end_points, ["30x-3", "54x245"]);
});

test("tira o mapa de filamento por bico que o destino não tem", () => {
  const adjusted = adjustNozzleVariants(bambuProject(), CREATOR_5);
  assert.ok(!("filament_nozzle_map" in adjusted));
  assert.ok(!("filament_volume_map" in adjusted));
  assert.ok(!("filament_extruder_compatibility" in adjusted));
  assert.ok(!("enable_filament_dynamic_map" in adjusted));
});

test("sem a variante do destino, fica a primeira de cada filamento", () => {
  const project = bambuProject();
  project.filament_extruder_variant = [HF, "Bowden Standard", HF, "Bowden Standard", HF, "Bowden Standard"];
  project.print_extruder_variant = [HF, "Bowden Standard"];
  const adjusted = adjustNozzleVariants(project, CREATOR_5);
  assert.deepEqual(adjusted.filament_max_volumetric_speed, ["21", "22", "23"]);
  assert.deepEqual(adjusted.filament_extruder_variant, [STD, STD, STD]);
  assert.equal(adjusted.bridge_speed, "50");
});

test("com 2 filamentos e 2 variantes, as opções de filamento não viram processo", () => {
  const project = bambuProject();
  project.filament_colour = ["#FFFFFF", "#000000"];
  project.filament_self_index = ["1", "1", "2", "2"];
  project.filament_extruder_variant = [STD, HF, STD, HF];
  project.filament_max_volumetric_speed = ["21", "40", "22", "41"];
  project.nozzle_temperature = ["220", "230", "221", "231"];
  project.filament_type = ["PLA", "PETG"];
  project.hot_plate_temp = ["55", "70"];
  const adjusted = adjustNozzleVariants(project, CREATOR_5);
  assert.deepEqual(adjusted.filament_type, ["PLA", "PETG"]);
  assert.deepEqual(adjusted.hot_plate_temp, ["55", "70"]);
  assert.deepEqual(adjusted.nozzle_temperature, ["220", "221"]);
  assert.equal(adjusted.bridge_speed, "50");
});

test("projeto já nas variantes do destino não muda", () => {
  const project = {
    filament_colour: ["#FFFFFF", "#000000"],
    filament_self_index: ["1", "2"],
    filament_extruder_variant: [STD, STD],
    nozzle_temperature: ["220", "221"],
    print_extruder_id: ["1"],
    print_extruder_variant: [STD],
    bridge_speed: ["50"]
  };
  assert.deepEqual(adjustNozzleVariants(project, CREATOR_5), project);
});

test("destino com duas variantes recebe um valor por variante", () => {
  const h2d = {
    printer_extruder_variant: [STD, HF],
    print_extruder_id: ["1", "2"],
    print_extruder_variant: [STD, HF],
    bridge_speed: ["50", "50"]
  };
  const adjusted = adjustNozzleVariants(bambuProject(), h2d);
  assert.deepEqual(adjusted.print_extruder_id, ["1", "2"]);
  assert.deepEqual(adjusted.bridge_speed, ["50", "60"]);
  assert.deepEqual(adjusted.filament_self_index, ["1", "1", "2", "2", "3", "3"]);
});

const { adjustFlushPerNozzle } = window.Wisky3D.ModelParser;

test("uma matriz de purga e um multiplicador por bico do destino", () => {
  const project = {
    filament_colour: ["#FFFFFF", "#000000"],
    flush_volumes_matrix: ["0", "100", "200", "0"],
    flush_multiplier: ["1.2"]
  };
  const adjusted = adjustFlushPerNozzle(project, { flush_multiplier: ["1", "1", "1"] });
  assert.deepEqual(adjusted.flush_volumes_matrix, [
    "0",
    "100",
    "200",
    "0",
    "0",
    "100",
    "200",
    "0",
    "0",
    "100",
    "200",
    "0"
  ]);
  assert.deepEqual(adjusted.flush_multiplier, ["1.2", "1.2", "1.2"]);
});

test("destino de um bico fica com a primeira matriz de purga", () => {
  const project = {
    filament_colour: ["#FFFFFF", "#000000"],
    flush_volumes_matrix: ["0", "100", "200", "0", "0", "300", "400", "0"],
    flush_multiplier: ["1", "1.5"]
  };
  const adjusted = adjustFlushPerNozzle(project, { flush_multiplier: ["1"] });
  assert.deepEqual(adjusted.flush_volumes_matrix, ["0", "100", "200", "0"]);
  assert.deepEqual(adjusted.flush_multiplier, ["1"]);
});

test("sem quantidade de bicos no perfil, a purga não muda", () => {
  const project = {
    filament_colour: ["#FFFFFF", "#000000"],
    flush_volumes_matrix: ["0", "100", "200", "0"],
    flush_multiplier: "1"
  };
  assert.deepEqual(adjustFlushPerNozzle(project, {}), project);
});

// Perfil de um bico, um filamento e uma variante (o formato mais comum).
const SINGLE_NOZZLE = {
  nozzle_diameter: ["0.4"],
  printer_extruder_variant: [STD],
  print_extruder_id: ["1"],
  print_extruder_variant: [STD],
  filament_colour: ["#FFFFFF"],
  hot_plate_temp: ["55"],
  bridge_speed: ["25"],
  printable_area: ["0x0", "256x0", "256x256", "0x256"]
};

function twoFilamentProject() {
  return {
    filament_colour: ["#FFFFFF", "#000000"],
    filament_self_index: ["1", "1", "2", "2"],
    filament_extruder_variant: [STD, HF, STD, HF],
    nozzle_temperature: ["220", "230", "221", "231"],
    hot_plate_temp: ["55", "70"],
    print_extruder_id: ["1", "1"],
    print_extruder_variant: [STD, HF],
    bridge_speed: ["50", "60"],
    enable_height_slowdown: ["0", "1"],
    printable_area: ["0x0", "256x0", "256x256", "0x256"],
    compatible_printers: ["X"]
  };
}

test("opções por filamento sem prefixo não são cortadas como opção de processo", () => {
  const adjusted = adjustNozzleVariants(twoFilamentProject(), SINGLE_NOZZLE);
  assert.deepEqual(adjusted.hot_plate_temp, ["55", "70"]);
  assert.deepEqual(adjusted.bridge_speed, ["50"]);
});

test("opção de processo que o destino não tem também fica com a variante dele", () => {
  const adjusted = adjustNozzleVariants(twoFilamentProject(), SINGLE_NOZZLE);
  assert.deepEqual(adjusted.enable_height_slowdown, ["0"]);
});

test("listas sem relação com variante não mudam, mesmo com o mesmo tamanho", () => {
  const adjusted = adjustNozzleVariants(twoFilamentProject(), SINGLE_NOZZLE);
  assert.deepEqual(adjusted.printable_area, ["0x0", "256x0", "256x256", "0x256"]);
});

test("destino com mais variantes não duplica listas sem relação com elas", () => {
  const project = {
    filament_colour: ["#FFFFFF", "#000000", "#61C680"],
    print_extruder_id: ["1"],
    print_extruder_variant: [STD],
    bridge_speed: ["50"],
    compatible_printers: ["X"]
  };
  const h2d = { print_extruder_id: ["1", "2"], print_extruder_variant: [STD, HF] };
  const adjusted = adjustNozzleVariants(project, h2d);
  assert.deepEqual(adjusted.compatible_printers, ["X"]);
  assert.deepEqual(adjusted.bridge_speed, ["50", "50"]);
});

test("filament_map para extrusor que o destino não tem vai para o primeiro", () => {
  const project = { filament_colour: ["#FFFFFF", "#000000"], filament_map: ["2", "1"] };
  assert.deepEqual(adjustNozzleVariants(project, SINGLE_NOZZLE).filament_map, ["1", "1"]);
  assert.deepEqual(adjustNozzleVariants(project, { nozzle_diameter: ["0.4", "0.4"] }).filament_map, ["2", "1"]);
});
