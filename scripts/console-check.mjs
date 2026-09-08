import { chromium } from "playwright";

const urls = process.argv.slice(2);
if (urls.length === 0) urls.push("https://wisky3dprint.com.br/");

const headed = process.env.HEADED === "1";

const browser = await chromium.launch({
  channel: headed ? "chrome" : undefined,
  headless: !headed,
});
const page = await browser.newPage();

page.on("console", (msg) => {
  const type = msg.type();
  if (type === "error" || type === "warning") {
    page._logs.push({ kind: `console.${type}`, text: msg.text(), location: msg.location() });
  }
});

page.on("pageerror", (err) => {
  page._logs.push({ kind: "pageerror", text: err.message });
});

page.on("requestfailed", (req) => {
  page._logs.push({
    kind: "requestfailed",
    text: `${req.method()} ${req.url()} -> ${req.failure()?.errorText}`,
  });
});

page.on("response", (res) => {
  if (res.status() >= 400) {
    page._logs.push({ kind: "http-error", text: `${res.status()} ${res.url()}` });
  }
});

for (const url of urls) {
  page._logs = [];
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(headed ? 4000 : 1500);

  const logs = page._logs;
  if (logs.length === 0) {
    console.log(`Nenhum erro/warning de console ou rede encontrado em ${url}`);
  } else {
    console.log(`Encontrados ${logs.length} problema(s) em ${url}:\n`);
    for (const l of logs) {
      console.log(`[${l.kind}] ${l.text}`);
      if (l.location?.url) {
        console.log(`    at ${l.location.url}:${l.location.lineNumber}:${l.location.columnNumber}`);
      }
    }
  }
  console.log();
}

await browser.close();
