const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");

global.window = global;
global.DOMParser = DOMParser;
global.XMLSerializer = XMLSerializer;

// split-3mf.js só executa seu corpo (e expõe window.Wisky3D.Split3MF) quando
// document.getElementById("split3mf") existe — o módulo inteiro é uma
// funcionalidade de página, não uma lib standalone. Pra testar
// filtrarBuildParaObjectIds isoladamente, fingimos um documento mínimo: um
// elemento genérico pra cada id que o módulo consulta no load, com só os
// métodos usados na fiação de eventos (addEventListener/classList).
function criarElementoFalso() {
  return {
    addEventListener: function () {},
    classList: { add: function () {}, remove: function () {} },
    dataset: {},
    style: {},
    hidden: false,
    textContent: "",
    innerHTML: "",
    appendChild: function () {},
    files: null
  };
}

global.document = {
  getElementById: function () {
    return criarElementoFalso();
  }
};

const modelParserSource = fs.readFileSync(
  path.join(__dirname, "..", "assets", "js", "model-parser.js"),
  "utf8"
);
new Function(modelParserSource)();

const splitSource = fs.readFileSync(
  path.join(__dirname, "..", "assets", "js", "split-3mf.js"),
  "utf8"
);
new Function(splitSource)();

const { filtrarBuildParaObjectIds } = window.Wisky3D.Split3MF;

const XML_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model"><mesh/></object>
    <object id="2" type="model"><mesh/></object>
    <object id="3" type="model"><mesh/></object>
  </resources>
  <build>
    <item objectid="1"/>
    <item objectid="2"/>
    <item objectid="3"/>
  </build>
</model>`;

test("filtrarBuildParaObjectIds mantém só os <item> cujo objectid está na lista", () => {
  const resultado = filtrarBuildParaObjectIds(XML_FIXTURE, ["2"]);
  const doc = new DOMParser().parseFromString(resultado, "application/xml");

  const buildEl = doc.getElementsByTagName("build")[0];
  const itemEls = Array.from(buildEl.getElementsByTagName("item"));
  assert.equal(itemEls.length, 1, "só deve sobrar 1 <item>");
  assert.equal(itemEls[0].getAttribute("objectid"), "2");
});

test("filtrarBuildParaObjectIds não mexe em <resources>/<object>", () => {
  const antes = new DOMParser().parseFromString(XML_FIXTURE, "application/xml");
  const qtdObjectsAntes = antes.getElementsByTagName("object").length;

  const resultado = filtrarBuildParaObjectIds(XML_FIXTURE, ["2"]);
  const depois = new DOMParser().parseFromString(resultado, "application/xml");
  const qtdObjectsDepois = depois.getElementsByTagName("object").length;

  assert.equal(qtdObjectsDepois, qtdObjectsAntes, "contagem de <object> deve ficar igual");
  assert.equal(qtdObjectsDepois, 3);
});

test("filtrarBuildParaObjectIds preserva a declaração <?xml ...?>", () => {
  const resultado = filtrarBuildParaObjectIds(XML_FIXTURE, ["1", "3"]);
  assert.match(resultado, /^<\?xml/, "resultado deve começar com a declaração XML");
});

test("filtrarBuildParaObjectIds com múltiplos ids mantidos preserva todos eles", () => {
  const resultado = filtrarBuildParaObjectIds(XML_FIXTURE, ["1", "3"]);
  const doc = new DOMParser().parseFromString(resultado, "application/xml");
  const buildEl = doc.getElementsByTagName("build")[0];
  const ids = Array.from(buildEl.getElementsByTagName("item")).map(function (el) {
    return el.getAttribute("objectid");
  });
  assert.deepEqual(ids, ["1", "3"]);
});
