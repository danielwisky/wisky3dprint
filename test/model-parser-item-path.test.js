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

// parseXmlDoc (interno) chama doc.querySelector("parsererror"), que o
// xmldom não implementa (só existe em DOM de navegador). Mesmo polyfill
// mínimo usado pra rodar os outros arquivos de teste que passam por XML.
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

// Fake mínimo de JSZip: só o necessário pra resolveObjectRecursivo (zip.file(path).async("text")).
function fakeZip(files) {
  return {
    file: function (p) {
      if (!(p in files)) return null;
      return { async: function () { return Promise.resolve(files[p]); } };
    }
  };
}

const NS_P = ' xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"';

// Reproduz a estrutura real de projetos Bambu Studio/Orca multi-plate: o
// 3D/3dmodel.model raiz tem um <object id="1"> (chapa 1, embutido) e um
// segundo <item> de build apontando, via p:path, pro object da chapa 2 num
// arquivo próprio — que por acaso também numera seu object como id="1"
// (cada arquivo externo numera os próprios ids a partir de 1, de forma
// independente do root).
const rootModel = `<?xml version="1.0"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"${NS_P}>
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices>
        <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1"/>
    <item objectid="1" p:path="/3D/Objects/object_1.model"/>
  </build>
</model>`;

const plate2Model = `<?xml version="1.0"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices><vertex x="50" y="0" z="0"/><vertex x="51" y="0" z="0"/><vertex x="50" y="1" z="0"/></vertices>
        <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
      </mesh>
    </object>
  </resources>
  <build/>
</model>`;

test("extractTriangles3MF resolve <item p:path> pro arquivo externo em vez do object do root", () => {
  const zip = fakeZip({ "3D/Objects/object_1.model": plate2Model });

  return ModelParser.extractTriangles3MF(zip, rootModel, "3D/3dmodel.model").then((resultado) => {
    assert.equal(resultado.triangulos.length, 2, "deve extrair os triângulos dos 2 items (chapa 1 e chapa 2)");
    assert.equal(resultado.origins[0].path, "3D/3dmodel.model", "1º item (sem p:path) vem do root");
    assert.equal(
      resultado.origins[1].path,
      "3D/Objects/object_1.model",
      "2º item (com p:path) deve vir do arquivo externo, não ser confundido com o object id=1 do root"
    );
    assert.equal(resultado.triangulos[1][0][0], 50, "geometria do 2º item deve ser a do arquivo externo (x=50), não a do root (x=0)");
  });
});

test("parse3MFPackage resolve <item p:path> pro arquivo externo ao agregar bbox/volume", () => {
  const zip = fakeZip({ "3D/Objects/object_1.model": plate2Model });

  return ModelParser.parse3MFPackage(zip, rootModel).then((resultado) => {
    assert.equal(resultado.triangleCount, 2, "deve contar os triângulos dos 2 items");
    assert.equal(resultado.itens.length, 2);
    // bbox do 2º item deve refletir a geometria do arquivo externo (x em torno de 50),
    // não ser idêntico ao bbox do 1º item (x em torno de 0).
    assert.ok(resultado.itens[1].bbox.minX >= 50, "bbox do 2º item deve vir do arquivo externo");
  });
});
