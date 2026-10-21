const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

global.window = global;
new Function(fs.readFileSync(path.join(__dirname, "..", "assets", "js", "colorize-calculations.js"), "utf8"))();
const C = window.Wisky3D.ColorizeCalculations;

// Cubo de lado 10 com as 12 faces voltadas pra fora, duas por lado.
function cube() {
  const v = [
    [0, 0, 0],
    [10, 0, 0],
    [10, 10, 0],
    [0, 10, 0],
    [0, 0, 10],
    [10, 0, 10],
    [10, 10, 10],
    [0, 10, 10]
  ];
  const f = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 6],
    [1, 6, 5],
    [2, 3, 7],
    [2, 7, 6],
    [3, 0, 4],
    [3, 4, 7]
  ];
  return f.map((t) => t.map((i) => v[i]));
}

function setup() {
  const { triCount, positions } = C.buildGeometryData(cube());
  const faceNormals = C.computeFaceNormals(positions, triCount);
  const index = C.buildAdjacencyAndExportIndex(positions, triCount);
  return { triCount, positions, faceNormals, ...index };
}

const GRAY = [200, 200, 200];
const RED = [255, 0, 0];
const BLUE = [0, 0, 255];

function colors(list) {
  return new Uint8ClampedArray(list.flat());
}

test("buildGeometryData achata 9 floats por triângulo", () => {
  const { triCount, positions } = C.buildGeometryData(cube());
  assert.equal(triCount, 12);
  assert.equal(positions.length, 108);
  assert.deepEqual(Array.from(positions.slice(0, 9)), [0, 0, 0, 10, 10, 0, 10, 0, 0]);
});

test("computeFaceNormals devolve normais unitárias", () => {
  const { faceNormals } = setup();
  assert.deepEqual(Array.from(faceNormals.slice(0, 3)), [0, 0, -1]);
  assert.deepEqual(Array.from(faceNormals.slice(6, 9)), [0, 0, 1]);
});

test("expandFaceNormalsToCorners repete a normal nos 3 cantos", () => {
  const { faceNormals, triCount } = setup();
  const corners = C.expandFaceNormalsToCorners(faceNormals, triCount);
  assert.deepEqual(Array.from(corners.slice(0, 9)), [0, 0, -1, 0, 0, -1, 0, 0, -1]);
});

test("buildAdjacencyAndExportIndex solda vértices e liga triângulos por aresta", () => {
  const { exportVertices, cornerExportIndex, adjacency } = setup();
  assert.equal(exportVertices.length, 8);
  assert.equal(cornerExportIndex.length, 36);
  adjacency.forEach((neighbors) => assert.equal(neighbors.length, 3));
  assert.ok(adjacency[0].includes(1));
});

test("floodFillByNormalTolerance para na quina do cubo e atravessa com tolerância alta", () => {
  const { adjacency, faceNormals, triCount } = setup();
  const face = C.floodFillByNormalTolerance(0, 8, adjacency, faceNormals, triCount, true, null);
  assert.deepEqual(face.sort(), [0, 1]);

  const all = C.floodFillByNormalTolerance(0, 91, adjacency, faceNormals, triCount, false, null);
  assert.equal(all.length, 12);
});

test("floodFillByNormalTolerance respeita o filtro de triângulos visíveis", () => {
  const { adjacency, faceNormals, triCount } = setup();
  const r = C.floodFillByNormalTolerance(0, 91, adjacency, faceNormals, triCount, false, new Set([0, 4, 5]));
  assert.deepEqual(r.sort(), [0, 4, 5]);
});

test("hexToRgb", () => {
  assert.deepEqual(C.hexToRgb("#3fb6e8"), [63, 182, 232]);
});

test("exportPalette reserva o slot 1 pra área não pintada", () => {
  const { palette, slotByColor } = C.exportPalette(colors([GRAY, RED, BLUE, RED]), 4, GRAY);
  assert.deepEqual(palette, [GRAY, RED, BLUE]);
  assert.equal(slotByColor.get("255,0,0"), 2);
  assert.equal(slotByColor.get("0,0,255"), 3);
});

test("exportPalette omite a cor padrão quando tudo foi pintado", () => {
  const { palette, slotByColor } = C.exportPalette(colors([BLUE, RED]), 2, GRAY);
  assert.deepEqual(palette, [BLUE, RED]);
  assert.equal(slotByColor.get("0,0,255"), 1);
});

test("exportPalette sem nenhum triângulo cai na cor padrão", () => {
  assert.deepEqual(C.exportPalette(colors([]), 0, GRAY).palette, [GRAY]);
});

test("groupColorsByFile agrupa por path e objectId e ignora triângulos sem origem", () => {
  const origins = [
    { path: "3D/a.model", objectId: "1", localIndex: 0 },
    null,
    { path: "3D/a.model", objectId: "1", localIndex: 1 },
    { path: "3D/b.model", objectId: "7", localIndex: 0 }
  ];
  const byFile = C.groupColorsByFile(origins, colors([RED, BLUE, BLUE, GRAY]), 4);
  assert.deepEqual([...byFile.keys()], ["3D/a.model", "3D/b.model"]);
  assert.deepEqual(byFile.get("3D/a.model").get("1"), [
    { localIndex: 0, r: 255, g: 0, b: 0 },
    { localIndex: 1, r: 0, g: 0, b: 255 }
  ]);
  assert.deepEqual(byFile.get("3D/b.model").get("7"), [{ localIndex: 0, r: 200, g: 200, b: 200 }]);
});

test("trianglesForExport usa os índices soldados e a cor de cada triângulo", () => {
  const tris = C.trianglesForExport(new Int32Array([0, 1, 2, 2, 3, 0]), colors([RED, BLUE]), 2);
  assert.deepEqual(tris, [
    { v1: 0, v2: 1, v3: 2, color: [255, 0, 0] },
    { v1: 2, v2: 3, v3: 0, color: [0, 0, 255] }
  ]);
});
