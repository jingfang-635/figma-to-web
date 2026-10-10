/**
 * Export included app-spec screens as PNG reference shots for gate-pixel.
 * Writes imports/figma/screens/<screenId>.png and updates assets-manifest.
 *
 *   node scripts/export-ref-screens.mjs                # export from Figma
 *   node scripts/export-ref-screens.mjs --normalize    # re-crop existing shots only
 *
 * Normalization is mandatory: a Figma node export carries its effect bleed
 * (drop shadow), so the raw PNG is the card *plus* an asymmetric margin
 * (544x517 for a 520x493 card). We crop to the opaque box before writing, so a
 * reference shot is exactly the box the runtime renders and the pixel leg can
 * assert size equality instead of guessing an alignment. The declared
 * cardSize/effectBleed go into the manifest, which is what makes the whole
 * thing auditable rather than implicit.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "./lib/load-env.mjs";
import { PNG, opaqueBox } from "./lib/png-lite.mjs";
import { repoRoot, readJson } from "./lib/pipeline.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
void __dirname;

loadRootEnv();

const decision = readJson("artifacts/decision/decision.json");
const appSpec = readJson("artifacts/app-spec/app-spec.json");

const screens = (appSpec.screens || []).filter((s) => s.id && s.frameId);
const outDir = join(repoRoot(), "imports/figma/screens");
mkdirSync(outDir, { recursive: true });

/**
 * Crop a written shot to its opaque box. Returns the measurement used by the
 * pixel leg: the card box the runtime is compared against.
 */
function normalizeShot(absPath) {
  const img = PNG.decode(readFileSync(absPath));
  const box = opaqueBox(img);
  const cropped = box.x0 !== 0 || box.y0 !== 0 || box.w !== img.width || box.h !== img.height;
  if (cropped) {
    writeFileSync(absPath, PNG.encode(PNG.crop(img, box)));
  }
  return {
    cropped,
    rawSize: { width: img.width, height: img.height },
    cardSize: { width: box.w, height: box.h },
    effectBleed: {
      top: box.y0,
      left: box.x0,
      right: img.width - (box.x0 + box.w),
      bottom: img.height - (box.y0 + box.h),
    },
  };
}

function writeManifest(entries, fileKey = null) {
  const manifestPath = join(repoRoot(), "artifacts/figma/assets-manifest.json");
  let prev = { schemaVersion: 1, fileKey: null, assets: [] };
  if (existsSync(manifestPath)) {
    try {
      prev = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      /* keep default */
    }
  }
  const other = (prev.assets || []).filter((a) => a.kind !== "ref-screen");
  const manifest = {
    schemaVersion: 1,
    fileKey: fileKey ?? prev.fileKey ?? null,
    exportedAt: new Date().toISOString(),
    assets: [...other, ...entries],
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifestPath;
}

/**
 * Re-crop shots that are already on disk and refresh their manifest entries.
 * Runs without a Figma token, so a reference made with an older exporter can be
 * brought up to the normalization contract in place.
 */
if (process.argv.includes("--normalize")) {
  const entries = [];
  const changed = [];
  const normalized = [];
  for (const screen of screens) {
    const rel = `imports/figma/screens/${screen.id}.png`;
    const abs = join(repoRoot(), rel);
    if (!existsSync(abs)) {
      entries.push({
        screenId: screen.id,
        frameId: screen.frameId,
        kind: "ref-screen",
        path: rel,
        skipReason: "REF_SCREEN_FILE_MISSING",
      });
      continue;
    }
    const m = normalizeShot(abs);
    if (m.cropped) changed.push(`${screen.id} ${m.rawSize.width}x${m.rawSize.height}→${m.cardSize.width}x${m.cardSize.height}`);
    normalized.push(screen.id);
    entries.push({
      screenId: screen.id,
      frameId: screen.frameId,
      kind: "ref-screen",
      path: rel,
      bytes: readFileSync(abs).length,
      cardSize: m.cardSize,
      effectBleed: m.effectBleed,
      normalization: m.cropped ? "cropped-to-card" : "already-normalized",
    });
  }
  const manifestPath = writeManifest(entries);
  console.log(`normalized=${normalized.length} cropped=${changed.length}`);
  for (const c of changed) console.log(`  ${c}`);
  console.log(`manifest=${manifestPath}`);
  process.exit(0);
}

const token = process.env.FIGMA_ACCESS_TOKEN;
if (!token) {
  console.error("Missing env key: FIGMA_ACCESS_TOKEN");
  process.exit(1);
}
const fileKey = decision.figma?.fileKey;
if (!fileKey) {
  console.error("decision.figma.fileKey missing");
  process.exit(1);
}

const ids = [...new Set(screens.map((s) => s.frameId))];
const batchSize = 8;
const urlByNode = new Map();

async function fetchImages(nodeIds) {
  const qs = new URLSearchParams({
    ids: nodeIds.join(","),
    format: "png",
    scale: "1",
  });
  const url = `https://api.figma.com/v1/images/${fileKey}?${qs}`;
  const res = await fetch(url, {
    headers: { "X-Figma-Token": token },
  });
  if (res.status === 429 || res.status >= 500) {
    const err = new Error(`Figma images HTTP ${res.status}`);
    err.retryable = true;
    throw err;
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma images HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.err) throw new Error(String(data.err));
  return data.images || {};
}

async function withRetry(fn, max = 5) {
  let last;
  for (let i = 0; i < max; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!e.retryable && !String(e.message).includes("429")) throw e;
      const wait = Math.min(60_000, 2000 * 2 ** i);
      console.error(`retry in ${wait}ms: ${e.message}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

for (let i = 0; i < ids.length; i += batchSize) {
  const chunk = ids.slice(i, i + batchSize);
  const images = await withRetry(() => fetchImages(chunk));
  for (const [nodeId, imageUrl] of Object.entries(images)) {
    if (imageUrl) urlByNode.set(nodeId, imageUrl);
  }
}

const assets = [];
const missing = [];

for (const screen of screens) {
  const imageUrl = urlByNode.get(screen.frameId);
  const rel = `imports/figma/screens/${screen.id}.png`;
  const abs = join(repoRoot(), rel);
  if (!imageUrl) {
    missing.push(screen.id);
    assets.push({
      screenId: screen.id,
      frameId: screen.frameId,
      kind: "ref-screen",
      path: rel,
      skipReason: "FIGMA_IMAGE_URL_NULL",
    });
    continue;
  }
  const imgRes = await withRetry(async () => {
    const r = await fetch(imageUrl);
    if (r.status === 429 || r.status >= 500) {
      const err = new Error(`CDN HTTP ${r.status}`);
      err.retryable = true;
      throw err;
    }
    if (!r.ok) throw new Error(`CDN HTTP ${r.status}`);
    return r;
  });
  const buf = Buffer.from(await imgRes.arrayBuffer());
  writeFileSync(abs, buf);
  const m = normalizeShot(abs);
  assets.push({
    screenId: screen.id,
    frameId: screen.frameId,
    kind: "ref-screen",
    path: rel,
    bytes: readFileSync(abs).length,
    cardSize: m.cardSize,
    effectBleed: m.effectBleed,
    normalization: m.cropped ? "cropped-to-card" : "already-normalized",
  });
  console.log(
    `OK ${screen.id} raw=${m.rawSize.width}x${m.rawSize.height} → card=${m.cardSize.width}x${m.cardSize.height}`,
  );
}

const manifestPath = writeManifest(assets, fileKey);

if (missing.length) {
  console.error("INGEST_REF_SHOT_MISSING:", missing.join(", "));
  process.exit(2);
}
console.log(`Wrote ${assets.length} ref screens → ${outDir}`);
console.log(`manifest=${manifestPath}`);
