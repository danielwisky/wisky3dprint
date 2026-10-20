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

const { contarTriangulos3MF, contarTriangulosSTL } = window.Wisky3D.ModelParser;

// Fake de JSZip com zip.file(regex) devolvendo as entradas que casam.
function fakeZip(files) {
  return {
    file: (p) => {
      if (p instanceof RegExp) {
        return Object.keys(files).filter((n) => p.test(n)).map((name) => ({ name, async: () => Promise.resolve(files[name]) }));
      }
      return p in files ? { name: p, async: () => Promise.resolve(files[p]) } : null;
    }
  };
}

function triangulos(n) {
  return Array.from({ length: n }, () => '<triangle v1="0" v2="1" v3="2"/>').join("");
}

test("contarTriangulos3MF soma os <triangle> de todos os .model do pacote", () => {
  const zip = fakeZip({
    "3D/3dmodel.model": `<model><resources><object id="1"><mesh><triangles>${triangulos(3)}</triangles></mesh></object></resources></model>`,
    "3D/Objects/object_1.model": `<model><triangles>${triangulos(5)}</triangles></model>`,
    "Metadata/model_settings.config": "<triangle/> não conta",
    "3D/Objects/object_2.MODEL": `<model>${triangulos(2)}</model>`
  });

  return contarTriangulos3MF(zip).then((n) => assert.equal(n, 10));
});

test("contarTriangulos3MF não confunde <triangles> com <triangle>", () => {
  const zip = fakeZip({ "3D/3dmodel.model": "<triangles></triangles><triangles/>" });

  return contarTriangulos3MF(zip).then((n) => assert.equal(n, 0));
});

test("contarTriangulosSTL lê a contagem do cabeçalho do STL binário", () => {
  const buffer = new ArrayBuffer(84 + 7 * 50);
  new DataView(buffer).setUint32(80, 7, true);

  assert.equal(contarTriangulosSTL(buffer), 7);
});

test("contarTriangulosSTL conta as facets do STL ASCII", () => {
  const facet = " facet normal 0 0 1\n  outer loop\n   vertex 0 0 0\n   vertex 1 0 0\n   vertex 0 1 0\n  endloop\n endfacet\n";
  const texto = "solid x\n" + facet.repeat(4) + "endsolid x\n";

  assert.equal(contarTriangulosSTL(new TextEncoder().encode(texto).buffer), 4);
});
