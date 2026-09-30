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

const ModelParser = window.Wisky3D.ModelParser;
const ThreeMFWriter = window.Wisky3D.ThreeMFWriter;

const ROOT_PATH = "3D/3dmodel.model";

const XML_PID = `<?xml version="1.0"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  <resources>
    <m:colorgroup id="900001">
      <m:color color="#FF0000FF"/>
      <m:color color="#00FF00FF"/>
    </m:colorgroup>
    <object id="2">
      <mesh>
        <triangles>
          <triangle v1="0" v2="1" v3="2" pid="900001" p1="0"/>
          <triangle v1="1" v2="2" v3="3" pid="900001" p1="1"/>
        </triangles>
      </mesh>
    </object>
  </resources>
  <build/>
</model>`;

function fakeZipComRoot(rootPath, extraFiles) {
  return {
    file: function (arg) {
      if (arg instanceof RegExp) {
        return arg.test(rootPath) ? [{ name: rootPath }] : [];
      }
      if (extraFiles && extraFiles[arg]) return extraFiles[arg];
      return null;
    }
  };
}

function origin(objectId, localIndex, p) {
  return { path: p || ROOT_PATH, objectId: objectId, localIndex: localIndex };
}

test("lerCorPorTriangulo resolve cor via pid/p1 contra m:colorgroup", async () => {
  const modelDoc = new DOMParser().parseFromString(XML_PID, "application/xml");
  const zip = fakeZipComRoot(ROOT_PATH);
  const origins = [origin("2", 0), origin("2", 1)];

  const cores = await ModelParser.lerCorPorTriangulo(zip, modelDoc, origins, null);

  assert.deepEqual(Array.from(cores.slice(0, 3)), [255, 0, 0], "primeiro triângulo (p1=0) deve ser vermelho");
  assert.deepEqual(Array.from(cores.slice(3, 6)), [0, 255, 0], "segundo triângulo (p1=1) deve ser verde");
});

test("lerCorPorTriangulo usa cor default quando o triângulo não tem pid nem paint_color", async () => {
  const xml = `<?xml version="1.0"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="2">
      <mesh>
        <triangles>
          <triangle v1="0" v2="1" v3="2"/>
        </triangles>
      </mesh>
    </object>
  </resources>
  <build/>
</model>`;
  const modelDoc = new DOMParser().parseFromString(xml, "application/xml");
  const zip = fakeZipComRoot(ROOT_PATH);
  const origins = [origin("2", 0)];

  const cores = await ModelParser.lerCorPorTriangulo(zip, modelDoc, origins, null);

  assert.deepEqual(Array.from(cores), ModelParser.DEFAULT_COLOR);
});

test("lerCorPorTriangulo resolve cor via paint_color + projectSettingsConfig.filament_colour", async () => {
  const paintColor = ThreeMFWriter.filamentIndexParaPaintColor(2); // slot 2 (1-based)
  const xml = `<?xml version="1.0"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="2">
      <mesh>
        <triangles>
          <triangle v1="0" v2="1" v3="2" paint_color="${paintColor}"/>
        </triangles>
      </mesh>
    </object>
  </resources>
  <build/>
</model>`;
  const modelDoc = new DOMParser().parseFromString(xml, "application/xml");
  const zip = fakeZipComRoot(ROOT_PATH);
  const origins = [origin("2", 0)];
  const projectSettingsConfig = { filament_colour: ["#111111", "#3366FF"] };

  const cores = await ModelParser.lerCorPorTriangulo(zip, modelDoc, origins, projectSettingsConfig);

  assert.deepEqual(Array.from(cores), [0x33, 0x66, 0xff]);
});

test("paintColorParaFilamentIndex é o inverso exato de filamentIndexParaPaintColor", () => {
  [1, 2, 3, 18].forEach((n) => {
    const hex = ThreeMFWriter.filamentIndexParaPaintColor(n);
    assert.equal(ThreeMFWriter.paintColorParaFilamentIndex(hex), n, "round-trip falhou para índice " + n);
  });
});
