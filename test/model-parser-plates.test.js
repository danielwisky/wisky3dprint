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

test("parsePlateAssignments com 2 plates retorna lista de ids por chapa", () => {
  const xmlText = `<?xml version="1.0"?>
<model_settings_config>
  <plate index="0">
    <model_instance>
      <metadata key="object_id" value="1"/>
    </model_instance>
    <model_instance>
      <metadata key="object_id" value="2"/>
    </model_instance>
  </plate>
  <plate index="1">
    <model_instance>
      <metadata key="object_id" value="3"/>
    </model_instance>
  </plate>
</model_settings_config>`;

  const result = window.Wisky3D.ModelParser.parsePlateAssignments(xmlText);

  assert.ok(Array.isArray(result), "resultado deve ser array");
  assert.equal(result.length, 2, "deve ter 2 chapas");
  assert.deepEqual(result[0], ["1", "2"], "primeira chapa tem ids 1 e 2");
  assert.deepEqual(result[1], ["3"], "segunda chapa tem id 3");
});

test("parsePlateAssignments com apenas 1 plate retorna null", () => {
  const xmlText = `<?xml version="1.0"?>
<model_settings_config>
  <plate index="0">
    <model_instance>
      <metadata key="object_id" value="1"/>
    </model_instance>
  </plate>
</model_settings_config>`;

  const result = window.Wisky3D.ModelParser.parsePlateAssignments(xmlText);

  assert.equal(result, null, "uma única chapa retorna null");
});

test("parsePlateAssignments sem plates retorna null", () => {
  const xmlText = `<?xml version="1.0"?>
<model_settings_config>
</model_settings_config>`;

  const result = window.Wisky3D.ModelParser.parsePlateAssignments(xmlText);

  assert.equal(result, null, "sem plates retorna null");
});

test("parsePlateAssignments com XML inválido retorna null", () => {
  const xmlText = `<?xml version="1.0"?>
<model_settings_config>
  <plate index="0">
    <unclosed_tag>
</model_settings_config>`;

  const result = window.Wisky3D.ModelParser.parsePlateAssignments(xmlText);

  assert.equal(result, null, "XML inválido retorna null");
});

test("parsePlateAssignments com texto vazio retorna null", () => {
  const result = window.Wisky3D.ModelParser.parsePlateAssignments("");

  assert.equal(result, null, "texto vazio retorna null");
});

test("parsePlateAssignments ignora model_instances sem object_id", () => {
  const xmlText = `<?xml version="1.0"?>
<model_settings_config>
  <plate index="0">
    <model_instance>
      <metadata key="other" value="123"/>
    </model_instance>
    <model_instance>
      <metadata key="object_id" value="1"/>
    </model_instance>
  </plate>
  <plate index="1">
    <model_instance>
      <metadata key="object_id" value="2"/>
    </model_instance>
  </plate>
</model_settings_config>`;

  const result = window.Wisky3D.ModelParser.parsePlateAssignments(xmlText);

  assert.deepEqual(result[0], ["1"], "primeira chapa ignora model_instance sem object_id");
  assert.deepEqual(result[1], ["2"], "segunda chapa tem id 2");
});

test("calculatePlates com plateAssignments simples retorna bbox por chapa", () => {
  const plateAssignments = [["1", "2"], ["3"]];
  const items = [
    { objectId: "1", bbox: { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 10 } },
    { objectId: "2", bbox: { minX: 5, minY: 5, minZ: 5, maxX: 15, maxY: 15, maxZ: 15 } },
    { objectId: "3", bbox: { minX: 20, minY: 20, minZ: 20, maxX: 30, maxY: 30, maxZ: 30 } }
  ];

  const result = window.Wisky3D.ModelParser.calculatePlates(items, plateAssignments);

  assert.ok(Array.isArray(result), "resultado deve ser array");
  assert.equal(result.length, 2, "deve ter 2 chapas");
  assert.equal(result[0].index, 1, "primeira chapa tem indice 1");
  assert.equal(result[1].index, 2, "segunda chapa tem indice 2");

  // Primeira chapa: merge de bbox de items 1 e 2
  assert.equal(result[0].bbox.minX, 0, "bbox chapa 1 minX = 0");
  assert.equal(result[0].bbox.minY, 0, "bbox chapa 1 minY = 0");
  assert.equal(result[0].bbox.minZ, 0, "bbox chapa 1 minZ = 0");
  assert.equal(result[0].bbox.maxX, 15, "bbox chapa 1 maxX = 15");
  assert.equal(result[0].bbox.maxY, 15, "bbox chapa 1 maxY = 15");
  assert.equal(result[0].bbox.maxZ, 15, "bbox chapa 1 maxZ = 15");

  // Segunda chapa: apenas item 3
  assert.equal(result[1].bbox.minX, 20, "bbox chapa 2 minX = 20");
  assert.equal(result[1].bbox.maxX, 30, "bbox chapa 2 maxX = 30");
});

test("calculatePlates com apenas 1 chapa retorna null", () => {
  const plateAssignments = [["1", "2", "3"]];
  const items = [
    { objectId: "1", bbox: { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 10 } },
    { objectId: "2", bbox: { minX: 5, minY: 5, minZ: 5, maxX: 15, maxY: 15, maxZ: 15 } },
    { objectId: "3", bbox: { minX: 20, minY: 20, minZ: 20, maxX: 30, maxY: 30, maxZ: 30 } }
  ];

  const result = window.Wisky3D.ModelParser.calculatePlates(items, plateAssignments);

  assert.equal(result, null, "apenas 1 chapa retorna null");
});

test("calculatePlates descarta chapas sem bbox", () => {
  const plateAssignments = [["1"], ["99"], ["2"]]; // 99 não existe nos items
  const items = [
    { objectId: "1", bbox: { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 10 } },
    { objectId: "2", bbox: { minX: 20, minY: 20, minZ: 20, maxX: 30, maxY: 30, maxZ: 30 } }
  ];

  const result = window.Wisky3D.ModelParser.calculatePlates(items, plateAssignments);

  assert.ok(Array.isArray(result), "resultado deve ser array");
  assert.equal(result.length, 2, "deve ter 2 chapas válidas (descartou a chapa 99)");
  assert.equal(result[0].index, 1, "primeira chapa tem indice 1");
  assert.equal(result[1].index, 3, "segunda chapa tem indice 3 (pulou 2)");
});

test("calculatePlates com plateAssignments null retorna null", () => {
  const items = [
    { objectId: "1", bbox: { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 10 } }
  ];

  const result = window.Wisky3D.ModelParser.calculatePlates(items, null);

  assert.equal(result, null, "plateAssignments null retorna null");
});

test("calculatePlates com itens null retorna null", () => {
  const plateAssignments = [["1"]];

  const result = window.Wisky3D.ModelParser.calculatePlates(null, plateAssignments);

  assert.equal(result, null, "itens null retorna null");
});

test("parsePlateAssignments com manterVazias mantém mesas sem peças para o índice ser o da mesa", () => {
  const xmlText = `<?xml version="1.0"?>
<config>
  <plate><model_instance><metadata key="object_id" value="1"/></model_instance></plate>
  <plate></plate>
  <plate><model_instance><metadata key="object_id" value="3"/></model_instance></plate>
</config>`;

  assert.deepEqual(window.Wisky3D.ModelParser.parsePlateAssignments(xmlText), [["1"], ["3"]]);
  assert.deepEqual(window.Wisky3D.ModelParser.parsePlateAssignments(xmlText, true), [["1"], [], ["3"]]);
});

test("parsePlateAssignments com manterVazias devolve também uma mesa só", () => {
  const xmlText = `<?xml version="1.0"?><config><plate><model_instance><metadata key="object_id" value="1"/></model_instance></plate></config>`;

  assert.equal(window.Wisky3D.ModelParser.parsePlateAssignments(xmlText), null);
  assert.deepEqual(window.Wisky3D.ModelParser.parsePlateAssignments(xmlText, true), [["1"]]);
});
