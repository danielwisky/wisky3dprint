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

// Mesmo polyfill de doc.querySelector("parsererror") dos outros testes que passam por XML.
const origParse = DOMParser.prototype.parseFromString;
DOMParser.prototype.parseFromString = function (text, type) {
  const doc = origParse.call(this, text, type);
  doc.querySelector = function (sel) {
    if (sel !== "parsererror") return null;
    const els = doc.getElementsByTagName("parsererror");
    return els.length ? els[0] : null;
  };
  return doc;
};

const ModelParser = window.Wisky3D.ModelParser;

function fakeZip() {
  return { file: () => null };
}

// Cubo fechado de aresta `a` com o canto em (0,0,0).
function cube(id, a) {
  const v = [[0,0,0],[a,0,0],[a,a,0],[0,a,0],[0,0,a],[a,0,a],[a,a,a],[0,a,a]];
  const t = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  return `<object id="${id}" type="model"><mesh><vertices>${v.map(([x,y,z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join("")}</vertices><triangles>${t.map(([a1,b,c]) => `<triangle v1="${a1}" v2="${b}" v3="${c}"/>`).join("")}</triangles></mesh></object>`;
}

const MODEL = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    ${cube(1, 10)}
    ${cube(2, 50)}
    <object id="4" type="model"><components>
      <component objectid="1"/>
      <component objectid="2"/>
    </components></object>
  </resources>
  <build><item objectid="4"/></build>
</model>`;

function settings(subtype) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="4">
    <part id="1" subtype="normal_part"/>
    <part id="2" subtype="${subtype}"/>
  </object>
</config>`;
}

test("parse3MFPackage sem model_settings soma todas as partes", () => {
  return ModelParser.parse3MFPackage(fakeZip(), MODEL).then((r) => {
    assert.ok(Math.abs(r.volumeMm3 - (1000 + 125000)) < 1e-6, `volume=${r.volumeMm3}`);
    assert.equal(r.bbox.maxX, 50);
  });
});

["modifier_part", "negative_part", "support_blocker", "support_enforcer"].forEach((subtype) => {
  test(`parse3MFPackage ignora parte ${subtype} no volume, na área, nos triângulos e no tamanho`, () => {
    return ModelParser.parse3MFPackage(fakeZip(), MODEL, settings(subtype)).then((r) => {
      assert.ok(Math.abs(r.volumeMm3 - 1000) < 1e-6, `volume=${r.volumeMm3}`);
      assert.ok(Math.abs(r.areaMm2 - 600) < 1e-6, `area=${r.areaMm2}`);
      assert.equal(r.triangleCount, 12);
      assert.equal(r.bbox.maxX, 10);
      assert.equal(r.items[0].bbox.maxX, 10);
    });
  });
});

test("parse3MFPackage mantém parte normal_part e ignora model_settings inválido", () => {
  return Promise.all([
    ModelParser.parse3MFPackage(fakeZip(), MODEL, settings("normal_part")),
    ModelParser.parse3MFPackage(fakeZip(), MODEL, "<config><object")
  ]).then((rs) => {
    rs.forEach((r) => assert.ok(Math.abs(r.volumeMm3 - 126000) < 1e-6, `volume=${r.volumeMm3}`));
  });
});

test("parse3MFPackage não aplica as partes de model_settings a item com p:path (ids de outro arquivo)", () => {
  const external = MODEL.replace("<build><item objectid=\"4\"/></build>", "<build/>");
  const root = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
  <resources/>
  <build><item p:path="/3D/Objects/x.model" objectid="4"/></build>
</model>`;
  const zip = { file: (p) => (p === "3D/Objects/x.model" ? { async: () => Promise.resolve(external) } : null) };

  return ModelParser.parse3MFPackage(zip, root, settings("support_blocker")).then((r) => {
    assert.ok(Math.abs(r.volumeMm3 - 126000) < 1e-6, `volume=${r.volumeMm3}`);
  });
});

test("extractTriangles3MF deixa de fora as partes que não são normal_part (Colorir)", () => {
  return Promise.all([
    ModelParser.extractTriangles3MF(fakeZip(), MODEL, "3D/3dmodel.model"),
    ModelParser.extractTriangles3MF(fakeZip(), MODEL, "3D/3dmodel.model", settings("modifier_part"))
  ]).then(([withModifier, withoutModifier]) => {
    assert.equal(withModifier.triangles.length, 24, "peça + modificador");
    assert.equal(withoutModifier.triangles.length, 12, "só a peça");
    assert.ok(withoutModifier.origins.every((o) => o.objectId === "1"));
  });
});
