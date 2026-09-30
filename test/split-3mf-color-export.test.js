const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");

global.window = global;
global.DOMParser = DOMParser;
global.XMLSerializer = XMLSerializer;

// Mesmo truque de test/split-3mf-build-filter.test.js e
// test/split-3mf-color-groups.test.js: split-3mf.js só executa seu corpo (e
// expõe window.Wisky3D.Split3MF) quando document.getElementById("split3mf")
// existe, porque o módulo inteiro é funcionalidade de página, não lib
// standalone.
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

// threemf-writer.js precisa estar carregado antes de split-3mf.js: o módulo
// lê window.Wisky3D.ThreeMFWriter no topo do seu escopo, na hora que é
// avaliado (mesma ordem de <script> usada nas páginas reais).
const writerSource = fs.readFileSync(
  path.join(__dirname, "..", "assets", "js", "threemf-writer.js"),
  "utf8"
);
new Function(writerSource)();

const splitSource = fs.readFileSync(
  path.join(__dirname, "..", "assets", "js", "split-3mf.js"),
  "utf8"
);
new Function(splitSource)();

const { exportarGruposDeCorComoObjects } = window.Wisky3D.Split3MF;

function corPorTrianguloDe(cores) {
  const out = new Uint8ClampedArray(cores.length * 3);
  cores.forEach((c, i) => {
    out[i * 3] = c[0];
    out[i * 3 + 1] = c[1];
    out[i * 3 + 2] = c[2];
  });
  return out;
}

test("exportarGruposDeCorComoObjects: 2 grupos viram 2 <object>, cada um com sua cor e vértices reindexados localmente", () => {
  // Grupo 0 (vermelho): 2 triângulos formando um quadrado, compartilhando a
  // aresta (0,0,0)-(1,1,0) — devem reindexar pra só 4 vértices únicos (não 6).
  const triA = [[0, 0, 0], [1, 0, 0], [1, 1, 0]];
  const triB = [[0, 0, 0], [1, 1, 0], [0, 1, 0]];
  // Grupo 1 (azul): 1 triângulo isolado, longe do grupo 0.
  const triC = [[10, 10, 10], [11, 10, 10], [10, 11, 10]];

  const triangulos = [triA, triB, triC];
  const corPorTriangulo = corPorTrianguloDe([
    [255, 0, 0],
    [255, 0, 0],
    [0, 0, 255]
  ]);

  const gruposDeCor = new Map([
    [0, [0, 1]],
    [1, [2]]
  ]);

  const { modelXml, contentTypesXml, relsXml } = exportarGruposDeCorComoObjects(
    gruposDeCor,
    triangulos,
    corPorTriangulo
  );

  assert.match(contentTypesXml, /Types xmlns/, "contentTypesXml deve conter o elemento Types");
  assert.match(relsXml, /Relationships xmlns/, "relsXml deve conter o elemento Relationships");

  const doc = new DOMParser().parseFromString(modelXml, "application/xml");
  const objectEls = doc.getElementsByTagName("object");
  const itemEls = doc.getElementsByTagName("item");
  const colorEls = doc.getElementsByTagName("m:color");

  assert.equal(objectEls.length, 2, "deve haver 1 <object> por grupo de cor");
  assert.equal(itemEls.length, 2, "deve haver 1 <item> por object (todos no build)");
  assert.equal(colorEls.length, 2, "2 cores distintas no total (vermelho e azul)");

  assert.equal(objectEls[0].getAttribute("id"), "1", "primeiro grupo vira objectId 1");
  assert.equal(objectEls[1].getAttribute("id"), "2", "segundo grupo vira objectId 2");

  const verticesGrupo0 = objectEls[0].getElementsByTagName("vertex");
  const trianglesGrupo0 = objectEls[0].getElementsByTagName("triangle");
  assert.equal(verticesGrupo0.length, 4, "quadrado (2 triângulos, 1 aresta compartilhada) reindexa pra 4 vértices únicos");
  assert.equal(trianglesGrupo0.length, 2, "grupo 0 mantém seus 2 triângulos");

  const verticesGrupo1 = objectEls[1].getElementsByTagName("vertex");
  const trianglesGrupo1 = objectEls[1].getElementsByTagName("triangle");
  assert.equal(verticesGrupo1.length, 3, "triângulo isolado não compartilha vértice com ninguém: 3 vértices");
  assert.equal(trianglesGrupo1.length, 1, "grupo 1 mantém seu 1 triângulo");

  // Todos os triângulos do grupo 0 (vermelho) apontam pro mesmo p1; idem
  // grupo 1 (azul), e os dois p1 são diferentes entre si (cores distintas).
  const p1Grupo0 = Array.from(trianglesGrupo0).map((t) => t.getAttribute("p1"));
  const p1Grupo1 = Array.from(trianglesGrupo1).map((t) => t.getAttribute("p1"));
  assert.equal(p1Grupo0[0], p1Grupo0[1], "os 2 triângulos vermelhos do grupo 0 usam a mesma cor (mesmo p1)");
  assert.notEqual(p1Grupo0[0], p1Grupo1[0], "grupo vermelho e grupo azul devem ter p1 diferentes");
});

test("exportarGruposDeCorComoObjects: 1 grupo só vira 1 <object> com a cor correta preservada", () => {
  const tri = [[0, 0, 0], [2, 0, 0], [0, 2, 0]];
  const triangulos = [tri];
  const corPorTriangulo = corPorTrianguloDe([[10, 200, 30]]);

  const gruposDeCor = new Map([[0, [0]]]);

  const { modelXml } = exportarGruposDeCorComoObjects(gruposDeCor, triangulos, corPorTriangulo);
  const doc = new DOMParser().parseFromString(modelXml, "application/xml");

  const objectEls = doc.getElementsByTagName("object");
  const colorEls = doc.getElementsByTagName("m:color");

  assert.equal(objectEls.length, 1);
  assert.equal(colorEls.length, 1);
  assert.equal(colorEls[0].getAttribute("color").toLowerCase(), "#0ac81eff", "cor [10,200,30] deve virar #0AC81Eff");
});
