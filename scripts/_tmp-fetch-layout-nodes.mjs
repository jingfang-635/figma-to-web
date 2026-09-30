import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvToken() {
  const envPath = join(root, ".env");
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^FIGMA_ACCESS_TOKEN=(.*)$/);
    if (m) {
      let v = m[1].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      return v;
    }
  }
  return null;
}

const token = loadEnvToken();
if (!token) {
  console.error(JSON.stringify({ ok: false, error: "FIGMA_ACCESS_TOKEN missing" }));
  process.exit(1);
}
console.log(JSON.stringify({ tokenPresent: true, tokenLen: token.length }));

const fileKey = JSON.parse(
  readFileSync(join(root, "artifacts/figma/frame-manifest.json"), "utf8")
).fileKey;
const screens = JSON.parse(
  readFileSync(join(root, "artifacts/app-spec/app-spec.json"), "utf8")
).screens;

const ids = [
  ...new Set([
    ...screens.map((s) => s.frameId),
    "280:2024",
    "280:1700",
  ]),
];

const url =
  `https://api.figma.com/v1/files/${fileKey}/nodes?ids=` +
  encodeURIComponent(ids.join(","));

const res = await fetch(url, { headers: { "X-Figma-Token": token } });
const body = await res.json();
console.log(JSON.stringify({ status: res.status, nodeCount: Object.keys(body.nodes || {}).length }));
if (res.status !== 200) {
  console.error(JSON.stringify({ ok: false, error: body.err || body.message || body }));
  process.exit(1);
}

const outPath = join(root, "artifacts/figma/nodes-full-cache.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(body));
console.log(JSON.stringify({ ok: true, outPath, bytes: Buffer.byteLength(JSON.stringify(body)) }));

const sample = body.nodes[screens[0].frameId]?.document;
if (sample) {
  const findText = (n) => {
    if (n.type === "TEXT") return n;
    for (const c of n.children || []) {
      const t = findText(c);
      if (t) return t;
    }
    return null;
  };
  const t = findText(sample);
  console.log(
    JSON.stringify({
      sampleScreen: screens[0].id,
      childCount: (sample.children || []).length,
      textSample: t
        ? {
            id: t.id,
            characters: t.characters,
            styleKeys: t.style ? Object.keys(t.style) : [],
            hasFills: Array.isArray(t.fills),
          }
        : null,
    })
  );
}
