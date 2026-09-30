const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");

global.window = global;
global.DOMParser = DOMParser;
global.XMLSerializer = XMLSerializer;

// Mesmo truque de test/split-3mf-build-filter.test.js: split-3mf.js só
// executa seu corpo (e expõe window.Wisky3D.Split3MF) quando
// document.getElementById("split3mf") existe, porque o módulo inteiro é
// funcionalidade de página, não lib standalone.
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

const { agruparPorCorContigua } = window.Wisky3D.Split3MF;

function corPorTrianguloDe(cores) {
  const out = new Uint8ClampedArray(cores.length * 3);
  cores.forEach((c, i) => {
    out[i * 3] = c[0];
    out[i * 3 + 1] = c[1];
    out[i * 3 + 2] = c[2];
  });
  return out;
}

test("agruparPorCorContigua une 2 triângulos vizinhos da mesma cor num grupo só, e mantém o isolado (cor diferente) separado", () => {
  // Triângulo 0 e 1 são vizinhos entre si (adjacency simétrica) e têm a
  // mesma cor (vermelho); triângulo 2 não é vizinho de nenhum dos dois e
  // tem cor diferente (verde) — deve ficar isolado no seu próprio grupo,
  // mesmo que por algum motivo fosse vizinho de alguém com cor diferente.
  const adjacency = [
    [1],    // triângulo 0 é vizinho do 1
    [0],    // triângulo 1 é vizinho do 0
    []      // triângulo 2 não tem vizinhos
  ];
  const corPorTriangulo = corPorTrianguloDe([
    [255, 0, 0],
    [255, 0, 0],
    [0, 255, 0]
  ]);

  const grupos = agruparPorCorContigua(adjacency, corPorTriangulo, 3);

  assert.equal(grupos.size, 2, "deve haver exatamente 2 grupos");

  const listas = Array.from(grupos.values()).map((lista) => lista.slice().sort());
  const grupoDoVermelho = listas.find((lista) => lista.length === 2);
  const grupoDoVerde = listas.find((lista) => lista.length === 1);

  assert.deepEqual(grupoDoVermelho, [0, 1], "triângulos 0 e 1 (vermelhos, vizinhos) devem estar no mesmo grupo");
  assert.deepEqual(grupoDoVerde, [2], "triângulo 2 (verde, isolado) deve ficar no seu próprio grupo");
});

test("agruparPorCorContigua NÃO une vizinhos com cores diferentes", () => {
  // Triângulos 0 e 1 são vizinhos, mas têm cores diferentes — não devem
  // ser unidos, mesmo estando lado a lado (fronteira de cor).
  const adjacency = [[1], [0]];
  const corPorTriangulo = corPorTrianguloDe([
    [255, 0, 0],
    [0, 0, 255]
  ]);

  const grupos = agruparPorCorContigua(adjacency, corPorTriangulo, 2);

  assert.equal(grupos.size, 2, "cores diferentes entre vizinhos não devem ser unidas");
});

test("agruparPorCorContigua com 3 triângulos em cadeia (0-1-2) da mesma cor forma 1 grupo só (transitividade do union-find)", () => {
  const adjacency = [[1], [0, 2], [1]];
  const corPorTriangulo = corPorTrianguloDe([
    [10, 20, 30],
    [10, 20, 30],
    [10, 20, 30]
  ]);

  const grupos = agruparPorCorContigua(adjacency, corPorTriangulo, 3);

  assert.equal(grupos.size, 1, "cadeia inteira da mesma cor deve virar 1 grupo só");
  const [unico] = Array.from(grupos.values());
  assert.deepEqual(unico.slice().sort(), [0, 1, 2]);
});
