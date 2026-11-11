const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const root = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
const IMAGES_DIR = path.join(root, "assets", "img", "projects");

const frontMatter = read("projects.html").split("---")[1];
const yaml = read("_data", "projects.yml");

// The YAML has a fixed layout (one field per line), so it can be read without
// a parser dependency.
const projects = yaml
  .split("\nprojects:\n")[1]
  .split(/^ {2}- /m)
  .slice(1)
  .map((block) => {
    const field = (key) => (block.match(new RegExp(`^\\s*${key}: "(.*)"$`, "m")) || [])[1];
    const versions = (block.match(/versions: \[(.*)\]/) || [])[1];
    return {
      name: field("name"),
      category: field("category"),
      designer: field("designer"),
      image: field("image"),
      versions: versions ? versions.split(",").map((v) => v.trim().replace(/"/g, "")) : []
    };
  });

// Reads width/height from the WebP header (VP8X, VP8 or VP8L chunk).
function webpSize(file) {
  const b = fs.readFileSync(file);
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  throw new Error(`${file}: not a WebP`);
}

test("projects page stays out of Google and the sitemap", () => {
  assert.match(frontMatter, /^noindex: true$/m);
  assert.match(frontMatter, /^sitemap: false$/m);
  assert.match(frontMatter, /^permalink: \/projetos\/$/m);
});

test("no page or include links to /projetos/ (direct link only)", () => {
  const files = [
    ...fs.readdirSync(root).filter((f) => f.endsWith(".html") && f !== "projects.html"),
    ...fs.readdirSync(path.join(root, "_includes")).map((f) => path.join("_includes", f)),
    ...fs.readdirSync(path.join(root, "_layouts")).map((f) => path.join("_layouts", f))
  ];
  // Only the page path in quotes ('/projetos/' | relative_url or href="/projetos/").
  const linking = files.filter((f) => /["']\/projetos\/?["']/.test(read(f)));
  assert.deepEqual(linking, []);
});

test("every project has name, category, designer, valid versions and image", () => {
  assert.ok(projects.length > 0);
  for (const p of projects) {
    assert.ok(p.name && p.category && p.designer && p.image, `missing field in ${JSON.stringify(p)}`);
    assert.ok(p.versions.length > 0, `${p.name} has no version`);
    for (const v of p.versions) assert.ok(["Regular", "Knitted"].includes(v), `${p.name}: version "${v}"`);
  }
});

test("no project is listed twice, not even in another category", () => {
  const seen = new Map();
  for (const p of projects) {
    const key = p.name.toLowerCase();
    assert.ok(!seen.has(key), `"${p.name}" in ${seen.get(key)} and ${p.category}`);
    seen.set(key, p.category);
  }
});

test("every photo exists, is used by exactly one project, and no photo is unused", () => {
  const files = new Set(fs.readdirSync(IMAGES_DIR));
  const used = new Map();
  for (const p of projects) {
    assert.ok(p.image.startsWith("/assets/img/projects/"), `${p.name}: image outside the folder`);
    const file = path.basename(p.image);
    assert.ok(files.has(file), `${p.name}: ${p.image} does not exist`);
    assert.ok(!used.has(file), `${file} used by ${used.get(file)} and ${p.name}`);
    used.set(file, p.name);
  }
  assert.deepEqual(
    [...files].filter((f) => !used.has(f)),
    [],
    "photos without a project"
  );
});

// Hundreds of cards: every photo goes through the same conversion (square
// webp up to 400px, quality 72), which gives ~13 KB on average and ~50 KB max.
test("project photos are light, square webp files up to 400px", () => {
  const bad = [];
  for (const f of fs.readdirSync(IMAGES_DIR)) {
    const file = path.join(IMAGES_DIR, f);
    if (!f.endsWith(".webp")) bad.push(`${f}: not webp`);
    else if (fs.statSync(file).size > 60 * 1024) bad.push(`${f}: over 60 KB`);
    else {
      const [w, h] = webpSize(file);
      if (w !== h || w > 400) bad.push(`${f}: ${w}x${h}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("every category search term points to an existing category", () => {
  const block = yaml.split("category_search_terms:\n")[1].split("\n\n")[0];
  const categories = new Set(projects.map((p) => p.category));
  for (const [, category] of block.matchAll(/^ {2}"(.*)": /gm)) {
    assert.ok(categories.has(category), `search terms for unknown category "${category}"`);
  }
});

test("the YAML has no Drive links (they expose the STL/3MF in the public repo)", () => {
  assert.doesNotMatch(yaml, /drive\.google|drive\.usercontent/);
});
