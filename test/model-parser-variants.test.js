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
function projetoBambu() {
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
  const novo = adjustNozzleVariants(projetoBambu(), CREATOR_5);
  assert.deepEqual(novo.filament_self_index, ["1", "2", "3"]);
  assert.deepEqual(novo.filament_extruder_variant, [STD, STD, STD]);
  assert.deepEqual(novo.filament_max_volumetric_speed, ["21", "22", "23"]);
  assert.deepEqual(novo.nozzle_temperature, ["220", "221", "222"]);
  assert.deepEqual(novo.filament_colour, ["#FFFFFF", "#000000", "#61C680"]);
});

test("opções de processo ficam com a variante do destino, no formato do perfil", () => {
  const novo = adjustNozzleVariants(projetoBambu(), CREATOR_5);
  assert.deepEqual(novo.print_extruder_id, ["1"]);
  assert.deepEqual(novo.print_extruder_variant, [STD]);
  assert.equal(novo.bridge_speed, "50");
  assert.deepEqual(novo.enable_height_slowdown, ["0"]);
  assert.equal(novo.sparse_infill_density, "15%");
});

test("listas que não são por variante ficam como estão", () => {
  const novo = adjustNozzleVariants(projetoBambu(), CREATOR_5);
  assert.deepEqual(novo.flush_volumes_vector, ["140", "140", "140", "140", "140", "140"]);
  assert.deepEqual(novo.start_end_points, ["30x-3", "54x245"]);
});

test("tira o mapa de filamento por bico que o destino não tem", () => {
  const novo = adjustNozzleVariants(projetoBambu(), CREATOR_5);
  assert.ok(!("filament_nozzle_map" in novo));
  assert.ok(!("filament_volume_map" in novo));
  assert.ok(!("filament_extruder_compatibility" in novo));
  assert.ok(!("enable_filament_dynamic_map" in novo));
});

test("sem a variante do destino, fica a primeira de cada filamento", () => {
  const projeto = projetoBambu();
  projeto.filament_extruder_variant = [HF, "Bowden Standard", HF, "Bowden Standard", HF, "Bowden Standard"];
  projeto.print_extruder_variant = [HF, "Bowden Standard"];
  const novo = adjustNozzleVariants(projeto, CREATOR_5);
  assert.deepEqual(novo.filament_max_volumetric_speed, ["21", "22", "23"]);
  assert.deepEqual(novo.filament_extruder_variant, [STD, STD, STD]);
  assert.equal(novo.bridge_speed, "50");
});

test("com 2 filamentos e 2 variantes, as opções de filamento não viram processo", () => {
  const projeto = projetoBambu();
  projeto.filament_colour = ["#FFFFFF", "#000000"];
  projeto.filament_self_index = ["1", "1", "2", "2"];
  projeto.filament_extruder_variant = [STD, HF, STD, HF];
  projeto.filament_max_volumetric_speed = ["21", "40", "22", "41"];
  projeto.nozzle_temperature = ["220", "230", "221", "231"];
  projeto.filament_type = ["PLA", "PETG"];
  projeto.hot_plate_temp = ["55", "70"];
  const novo = adjustNozzleVariants(projeto, CREATOR_5);
  assert.deepEqual(novo.filament_type, ["PLA", "PETG"]);
  assert.deepEqual(novo.hot_plate_temp, ["55", "70"]);
  assert.deepEqual(novo.nozzle_temperature, ["220", "221"]);
  assert.equal(novo.bridge_speed, "50");
});

test("projeto já nas variantes do destino não muda", () => {
  const projeto = {
    filament_colour: ["#FFFFFF", "#000000"],
    filament_self_index: ["1", "2"],
    filament_extruder_variant: [STD, STD],
    nozzle_temperature: ["220", "221"],
    print_extruder_id: ["1"],
    print_extruder_variant: [STD],
    bridge_speed: ["50"]
  };
  assert.deepEqual(adjustNozzleVariants(projeto, CREATOR_5), projeto);
});

test("destino com duas variantes recebe um valor por variante", () => {
  const h2d = {
    printer_extruder_variant: [STD, HF],
    print_extruder_id: ["1", "2"],
    print_extruder_variant: [STD, HF],
    bridge_speed: ["50", "50"]
  };
  const novo = adjustNozzleVariants(projetoBambu(), h2d);
  assert.deepEqual(novo.print_extruder_id, ["1", "2"]);
  assert.deepEqual(novo.bridge_speed, ["50", "60"]);
  assert.deepEqual(novo.filament_self_index, ["1", "1", "2", "2", "3", "3"]);
});

const { adjustFlushPerNozzle } = window.Wisky3D.ModelParser;

test("uma matriz de purga e um multiplicador por bico do destino", () => {
  const projeto = {
    filament_colour: ["#FFFFFF", "#000000"],
    flush_volumes_matrix: ["0", "100", "200", "0"],
    flush_multiplier: ["1.2"]
  };
  const novo = adjustFlushPerNozzle(projeto, { flush_multiplier: ["1", "1", "1"] });
  assert.deepEqual(novo.flush_volumes_matrix, ["0", "100", "200", "0", "0", "100", "200", "0", "0", "100", "200", "0"]);
  assert.deepEqual(novo.flush_multiplier, ["1.2", "1.2", "1.2"]);
});

test("destino de um bico fica com a primeira matriz de purga", () => {
  const projeto = {
    filament_colour: ["#FFFFFF", "#000000"],
    flush_volumes_matrix: ["0", "100", "200", "0", "0", "300", "400", "0"],
    flush_multiplier: ["1", "1.5"]
  };
  const novo = adjustFlushPerNozzle(projeto, { flush_multiplier: ["1"] });
  assert.deepEqual(novo.flush_volumes_matrix, ["0", "100", "200", "0"]);
  assert.deepEqual(novo.flush_multiplier, ["1"]);
});

test("sem quantidade de bicos no perfil, a purga não muda", () => {
  const projeto = { filament_colour: ["#FFFFFF", "#000000"], flush_volumes_matrix: ["0", "100", "200", "0"], flush_multiplier: "1" };
  assert.deepEqual(adjustFlushPerNozzle(projeto, {}), projeto);
});

// Perfil de um bico, um filamento e uma variante (o formato mais comum).
const UM_BICO = {
  nozzle_diameter: ["0.4"],
  printer_extruder_variant: [STD],
  print_extruder_id: ["1"],
  print_extruder_variant: [STD],
  filament_colour: ["#FFFFFF"],
  hot_plate_temp: ["55"],
  bridge_speed: ["25"],
  printable_area: ["0x0", "256x0", "256x256", "0x256"]
};

function projeto2Filamentos() {
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
  const novo = adjustNozzleVariants(projeto2Filamentos(), UM_BICO);
  assert.deepEqual(novo.hot_plate_temp, ["55", "70"]);
  assert.deepEqual(novo.bridge_speed, ["50"]);
});

test("opção de processo que o destino não tem também fica com a variante dele", () => {
  const novo = adjustNozzleVariants(projeto2Filamentos(), UM_BICO);
  assert.deepEqual(novo.enable_height_slowdown, ["0"]);
});

test("listas sem relação com variante não mudam, mesmo com o mesmo tamanho", () => {
  const novo = adjustNozzleVariants(projeto2Filamentos(), UM_BICO);
  assert.deepEqual(novo.printable_area, ["0x0", "256x0", "256x256", "0x256"]);
});

test("destino com mais variantes não duplica listas sem relação com elas", () => {
  const projeto = {
    filament_colour: ["#FFFFFF", "#000000", "#61C680"],
    print_extruder_id: ["1"],
    print_extruder_variant: [STD],
    bridge_speed: ["50"],
    compatible_printers: ["X"]
  };
  const h2d = { print_extruder_id: ["1", "2"], print_extruder_variant: [STD, HF] };
  const novo = adjustNozzleVariants(projeto, h2d);
  assert.deepEqual(novo.compatible_printers, ["X"]);
  assert.deepEqual(novo.bridge_speed, ["50", "50"]);
});

test("filament_map para extrusor que o destino não tem vai para o primeiro", () => {
  const projeto = { filament_colour: ["#FFFFFF", "#000000"], filament_map: ["2", "1"] };
  assert.deepEqual(adjustNozzleVariants(projeto, UM_BICO).filament_map, ["1", "1"]);
  assert.deepEqual(adjustNozzleVariants(projeto, { nozzle_diameter: ["0.4", "0.4"] }).filament_map, ["2", "1"]);
});
