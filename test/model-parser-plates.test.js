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

  const resultado = window.Wisky3D.ModelParser.parsePlateAssignments(xmlText);

  assert.ok(Array.isArray(resultado), "resultado deve ser array");
  assert.equal(resultado.length, 2, "deve ter 2 chapas");
  assert.deepEqual(resultado[0], ["1", "2"], "primeira chapa tem ids 1 e 2");
  assert.deepEqual(resultado[1], ["3"], "segunda chapa tem id 3");
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

  const resultado = window.Wisky3D.ModelParser.parsePlateAssignments(xmlText);

  assert.equal(resultado, null, "uma única chapa retorna null");
});

test("parsePlateAssignments sem plates retorna null", () => {
  const xmlText = `<?xml version="1.0"?>
<model_settings_config>
</model_settings_config>`;

  const resultado = window.Wisky3D.ModelParser.parsePlateAssignments(xmlText);

  assert.equal(resultado, null, "sem plates retorna null");
});

test("parsePlateAssignments com XML inválido retorna null", () => {
  const xmlText = `<?xml version="1.0"?>
<model_settings_config>
  <plate index="0">
    <unclosed_tag>
</model_settings_config>`;

  const resultado = window.Wisky3D.ModelParser.parsePlateAssignments(xmlText);

  assert.equal(resultado, null, "XML inválido retorna null");
});

test("parsePlateAssignments com texto vazio retorna null", () => {
  const resultado = window.Wisky3D.ModelParser.parsePlateAssignments("");

  assert.equal(resultado, null, "texto vazio retorna null");
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

  const resultado = window.Wisky3D.ModelParser.parsePlateAssignments(xmlText);

  assert.deepEqual(resultado[0], ["1"], "primeira chapa ignora model_instance sem object_id");
  assert.deepEqual(resultado[1], ["2"], "segunda chapa tem id 2");
});

test("calcularChapas com plateAssignments simples retorna bbox por chapa", () => {
  const plateAssignments = [["1", "2"], ["3"]];
  const itens = [
    { objectId: "1", bbox: { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 10 } },
    { objectId: "2", bbox: { minX: 5, minY: 5, minZ: 5, maxX: 15, maxY: 15, maxZ: 15 } },
    { objectId: "3", bbox: { minX: 20, minY: 20, minZ: 20, maxX: 30, maxY: 30, maxZ: 30 } }
  ];

  const resultado = window.Wisky3D.ModelParser.calcularChapas(itens, plateAssignments);

  assert.ok(Array.isArray(resultado), "resultado deve ser array");
  assert.equal(resultado.length, 2, "deve ter 2 chapas");
  assert.equal(resultado[0].indice, 1, "primeira chapa tem indice 1");
  assert.equal(resultado[1].indice, 2, "segunda chapa tem indice 2");

  // Primeira chapa: merge de bbox de items 1 e 2
  assert.equal(resultado[0].bbox.minX, 0, "bbox chapa 1 minX = 0");
  assert.equal(resultado[0].bbox.minY, 0, "bbox chapa 1 minY = 0");
  assert.equal(resultado[0].bbox.minZ, 0, "bbox chapa 1 minZ = 0");
  assert.equal(resultado[0].bbox.maxX, 15, "bbox chapa 1 maxX = 15");
  assert.equal(resultado[0].bbox.maxY, 15, "bbox chapa 1 maxY = 15");
  assert.equal(resultado[0].bbox.maxZ, 15, "bbox chapa 1 maxZ = 15");

  // Segunda chapa: apenas item 3
  assert.equal(resultado[1].bbox.minX, 20, "bbox chapa 2 minX = 20");
  assert.equal(resultado[1].bbox.maxX, 30, "bbox chapa 2 maxX = 30");

  // objectIds da chapa (usado pelo Split 3MF pra filtrar exports por chapa)
  assert.deepEqual(resultado[0].objectIds, ["1", "2"], "chapa 1 traz seus objectIds");
  assert.deepEqual(resultado[1].objectIds, ["3"], "chapa 2 traz seus objectIds");
});

test("calcularChapas com manterUnica:true não colapsa 1 chapa válida pra null", () => {
  const plateAssignments = [["1"], ["99"]]; // 99 não existe nos itens
  const itens = [
    { objectId: "1", bbox: { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 10 } }
  ];

  const semOpcao = window.Wisky3D.ModelParser.calcularChapas(itens, plateAssignments);
  assert.equal(semOpcao, null, "sem manterUnica, 1 chapa válida ainda colapsa pra null (comportamento preexistente)");

  const comOpcao = window.Wisky3D.ModelParser.calcularChapas(itens, plateAssignments, { manterUnica: true });
  assert.ok(Array.isArray(comOpcao), "com manterUnica, resultado é array mesmo com 1 chapa válida");
  assert.equal(comOpcao.length, 1, "1 chapa válida (a 99 foi descartada por não ter bbox)");
  assert.equal(comOpcao[0].indice, 1, "chapa válida mantém seu índice original");
  assert.deepEqual(comOpcao[0].objectIds, ["1"], "objectIds preservado");
});

test("calcularChapas com apenas 1 chapa retorna null", () => {
  const plateAssignments = [["1", "2", "3"]];
  const itens = [
    { objectId: "1", bbox: { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 10 } },
    { objectId: "2", bbox: { minX: 5, minY: 5, minZ: 5, maxX: 15, maxY: 15, maxZ: 15 } },
    { objectId: "3", bbox: { minX: 20, minY: 20, minZ: 20, maxX: 30, maxY: 30, maxZ: 30 } }
  ];

  const resultado = window.Wisky3D.ModelParser.calcularChapas(itens, plateAssignments);

  assert.equal(resultado, null, "apenas 1 chapa retorna null");
});

test("calcularChapas descarta chapas sem bbox", () => {
  const plateAssignments = [["1"], ["99"], ["2"]]; // 99 não existe nos items
  const itens = [
    { objectId: "1", bbox: { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 10 } },
    { objectId: "2", bbox: { minX: 20, minY: 20, minZ: 20, maxX: 30, maxY: 30, maxZ: 30 } }
  ];

  const resultado = window.Wisky3D.ModelParser.calcularChapas(itens, plateAssignments);

  assert.ok(Array.isArray(resultado), "resultado deve ser array");
  assert.equal(resultado.length, 2, "deve ter 2 chapas válidas (descartou a chapa 99)");
  assert.equal(resultado[0].indice, 1, "primeira chapa tem indice 1");
  assert.equal(resultado[1].indice, 3, "segunda chapa tem indice 3 (pulou 2)");
});

test("calcularChapas com plateAssignments null retorna null", () => {
  const itens = [
    { objectId: "1", bbox: { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 10 } }
  ];

  const resultado = window.Wisky3D.ModelParser.calcularChapas(itens, null);

  assert.equal(resultado, null, "plateAssignments null retorna null");
});

test("calcularChapas com itens null retorna null", () => {
  const plateAssignments = [["1"]];

  const resultado = window.Wisky3D.ModelParser.calcularChapas(null, plateAssignments);

  assert.equal(resultado, null, "itens null retorna null");
});
