#!/usr/bin/env node
/**
 * ir-glyphs — first-class glyph/band inspector for the IR workflow.
 *
 * Two recurring jobs had only throwaway scripts:
 *   1. glyph-match: a Layout IR icon slot has a placeholder node name
 *      (Vector/Group/svg-icon), so the symbol has to be recovered by looking at
 *      the drawn glyph in the reference screenshot.
 *   2. band compare: a table header / control row drifts and the ref-vs-runtime
 *      band must be laid side by side by eye.
 *
 * Both are "crop a box, magnify it, maybe stack two crops". This tool does
 * exactly that with the shared png-lite codec — no browser, no image deps.
 *
 * Usage:
 *   # one crop, magnified
 *   node scripts/ir-glyphs.mjs --out artifacts/ir/glyphs/caret.png \
 *     --crop imports/figma/screens/schedules.png:425,160,200,36 --scale 6
 *
 *   # ref vs runtime band, stacked vertically (default), ref first
 *   node scripts/ir-glyphs.mjs --out artifacts/ir/glyphs/dept-head.png --scale 2 \
 *     --crop imports/figma/screens/departments.png:250,326,1195,30 \
 *     --crop artifacts/gates/<run>/shots/departments.png:250,326,1195,30
 *
 *   # normalize the first crop to the opaque card box before magnifying
 *   node scripts/ir-glyphs.mjs --out /tmp/card.png --normalize-first \
 *     --crop imports/figma/screens/department-create.png:0,0,0,0
 *
 * Box syntax is `x,y,w,h`. Passing w=0,h=0 (or omitting the box) means the
 * whole image, or — with --normalize-first/--normalize — the opaque box.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { PNG, opaqueBox } from "./lib/png-lite.mjs";

function usage(msg) {
  if (msg) console.error(`ir-glyphs: ${msg}`);
  console.error(
    [
      "usage: ir-glyphs.mjs --out <png> [--scale N] [--stack v|h] [--gap N]",
      "                        [--normalize|--normalize-first]",
      "                        --crop <path>[:x,y,w,h] [--crop ...]",
    ].join("\n"),
  );
  process.exit(2);
}

function flagValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function allValues(name) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === name && process.argv[i + 1]) out.push(process.argv[i + 1]);
  }
  return out;
}

function parseCrop(spec) {
  // <path>[:x,y,w,h][@scale]
  let scale = null;
  let body = spec;
  const at = spec.lastIndexOf("@");
  if (at > 0 && /^\d+(\.\d+)?$/.test(spec.slice(at + 1))) {
    scale = Number(spec.slice(at + 1));
    body = spec.slice(0, at);
  }
  // The path may itself contain ':' (Windows drive), so only treat a trailing
  // `x,y,w,h` group after the last ':' as the box.
  const m = body.match(/:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (!m) return { path: body, box: null, scale };
  return {
    path: body.slice(0, body.length - m[0].length),
    box: { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) },
    scale,
  };
}

function main() {
  const out = flagValue("--out");
  const crops = allValues("--crop");
  if (!out) usage("--out is required");
  if (!crops.length) usage("at least one --crop is required");

  const scale = Number(flagValue("--scale") || 0);
  const gap = Number(flagValue("--gap") || 8);
  const stack = flagValue("--stack") || "v";
  const normalize = process.argv.includes("--normalize");
  const normalizeFirst = process.argv.includes("--normalize-first");

  const jobs = crops.map(parseCrop);
  const images = [];
  jobs.forEach((job, idx) => {
    const abs = resolve(job.path);
    if (!existsSync(abs)) {
      console.error(`ir-glyphs: missing image ${job.path}`);
      process.exit(1);
    }
    const img = PNG.decode(readFileSync(abs));
    const wantNormalize = normalize || (normalizeFirst && idx === 0);
    let cropBox;
    if (wantNormalize) {
      cropBox = opaqueBox(img);
    } else if (!job.box || (!job.box.w && !job.box.h)) {
      cropBox = { x0: 0, y0: 0, w: img.width, h: img.height };
    } else {
      // PNG.crop addresses boxes as {x0,y0,w,h} (same shape as opaqueBox).
      cropBox = { x0: job.box.x, y0: job.box.y, w: job.box.w, h: job.box.h };
    }
    const f = job.scale || scale || 1;
    const cropped = PNG.crop(img, cropBox);
    images.push(PNG.magnify(cropped, f));
  });

  let sheet;
  if (images.length === 1) {
    sheet = images[0];
  } else if (stack === "h") {
    const w = images.reduce((s, i) => s + i.width, 0) + gap * (images.length - 1);
    const h = Math.max(...images.map((i) => i.height));
    sheet = PNG.blank(w, h, [255, 255, 255, 255]);
    let x = 0;
    for (const img of images) {
      PNG.blit(sheet, img, x, 0);
      x += img.width + gap;
    }
  } else {
    const w = Math.max(...images.map((i) => i.width));
    const h = images.reduce((s, i) => s + i.height, 0) + gap * (images.length - 1);
    sheet = PNG.blank(w, h, [255, 255, 255, 255]);
    let y = 0;
    for (const img of images) {
      PNG.blit(sheet, img, 0, y);
      y += img.height + gap;
    }
  }

  const outAbs = resolve(out);
  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, PNG.encode(sheet));
  console.log(
    JSON.stringify({
      ok: true,
      out: outAbs,
      crops: images.length,
      sheet: `${sheet.width}x${sheet.height}`,
      cropped: images.map((i) => `${i.width}x${i.height}`),
    }),
  );
}

main();
