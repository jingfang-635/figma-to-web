/**
 * Consume capture.json + Layout IR / app-spec; emit four leg results.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG, opaqueBox } from "./lib/png-lite.mjs";
import { envNum, loadRootEnv } from "./lib/load-env.mjs";
import {
  colorsClose,
  fail,
  isGeomControlRole,
  legResult,
  normalizeText,
  readAppSpec,
  readLayoutIr,
  sortBoxes,
  writeJson,
} from "./lib/gate-common.mjs";
import { repoRoot, readJson } from "./lib/pipeline.mjs";

loadRootEnv();

function loadCapture(runStamp) {
  const p = join(repoRoot(), "artifacts/gates", runStamp, "capture.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

/** Declared reference-shot sizes (see asset-export). Absent manifest is not an
 * excuse: a reference whose size is not declared anywhere cannot be audited. */
function refManifest() {
  try {
    const m = readJson("artifacts/figma/assets-manifest.json");
    const map = new Map();
    for (const a of m.assets || []) {
      if (a.kind === "ref-screen") map.set(a.screenId, a);
    }
    return map;
  } catch {
    return new Map();
  }
}

function alignMargin(ref, run, tol) {
  if (ref.width === run.width && ref.height === run.height) {
    return { ok: true, dx: 0, dy: 0 };
  }
  const box = opaqueBox(ref);
  const dw = box.w - run.width;
  const dh = box.h - run.height;
  if (Math.abs(dw) > tol || Math.abs(dh) > tol) {
    return { ok: false, dx: 0, dy: 0, box };
  }
  return { ok: true, dx: box.x0, dy: box.y0, box };
}

/** Reference pixels may be semi-transparent (rounded card corners over the
 * shadow margin); composite onto white so both sides are colour-comparable. */
function over(px, o) {
  const a = px[o + 3] / 255;
  return [
    Math.round(px[o] * a + 255 * (1 - a)),
    Math.round(px[o + 1] * a + 255 * (1 - a)),
    Math.round(px[o + 2] * a + 255 * (1 - a)),
  ];
}

function sample(img, x, y) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
  return over(img.data, (y * img.width + x) * 4);
}

/** Live-data regions the DOM opted into (table rows, calendar cells, a preview
 * whose values follow the form). Their content is seeded, not drawn, so the
 * pixel leg scores chrome and labels and reports how much it masked. */
function inMask(masks, x, y) {
  return masks.some((m) => x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h);
}

function pixelDiffRatio(aBuf, bBuf, tol = 2, masks = []) {
  const a = PNG.decode(aBuf);
  const b = PNG.decode(bBuf);
  const align = alignMargin(a, b, tol);
  if (!align.ok) {
    return {
      sizeMismatch: true,
      aw: a.width,
      ah: a.height,
      bw: b.width,
      bh: b.height,
      box: align.box,
      ratio: 1,
    };
  }
  let n = 0;
  let diff = 0;
  let masked = 0;
  for (let y = 0; y < b.height; y++) {
    for (let x = 0; x < b.width; x++) {
      if (inMask(masks, x, y)) {
        masked++;
        continue;
      }
      const rc = sample(a, x + align.dx, y + align.dy);
      if (!rc) {
        n++;
        diff++;
        continue;
      }
      const o = (y * b.width + x) * 4;
      const run = [b.data[o], b.data[o + 1], b.data[o + 2]];
      n++;
      if (
        Math.abs(rc[0] - run[0]) + Math.abs(rc[1] - run[1]) + Math.abs(rc[2] - run[2]) >
        30
      ) {
        diff++;
      }
    }
  }
  return {
    sizeMismatch: false,
    ratio: n === 0 ? 1 : diff / n,
    maskedRatio: masked / (b.width * b.height),
    aw: a.width,
    ah: a.height,
    bw: b.width,
    bh: b.height,
    refMargin: { dx: align.dx, dy: align.dy },
  };
}

function flatBgDrift(refBuf, runBuf, tol = 2, masks = []) {
  const a = PNG.decode(refBuf);
  const b = PNG.decode(runBuf);
  const align = alignMargin(a, b, tol);
  if (!align.ok) return { drift: 1, refMargin: { dx: 0, dy: 0 } };
  const w = b.width;
  const h = b.height;
  let flat = 0;
  let drifted = 0;
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      if (inMask(masks, x, y)) continue;
      const ref = sample(a, x + align.dx, y + align.dy);
      if (!ref) continue;
      const neighbors = [
        sample(a, x + align.dx - 1, y + align.dy),
        sample(a, x + align.dx + 1, y + align.dy),
        sample(a, x + align.dx, y + align.dy - 1),
        sample(a, x + align.dx, y + align.dy + 1),
      ].filter(Boolean);
      let maxD = 0;
      for (const nb of neighbors) {
        maxD = Math.max(
          maxD,
          Math.abs(ref[0] - nb[0]) + Math.abs(ref[1] - nb[1]) + Math.abs(ref[2] - nb[2]),
        );
      }
      if (maxD > 18) continue; // not flat in reference
      const o = (y * w + x) * 4;
      const run = [b.data[o], b.data[o + 1], b.data[o + 2]];
      flat++;
      const d =
        Math.abs(ref[0] - run[0]) + Math.abs(ref[1] - run[1]) + Math.abs(ref[2] - run[2]);
      if (d > 24) drifted++;
    }
  }
  return {
    drift: flat === 0 ? 0 : drifted / flat,
    refMargin: { dx: align.dx, dy: align.dy },
  };
}

export function runPixelLeg(capture, runDir) {
  const failures = [];
  const notes = [];
  if (!capture?.screens?.length) {
    return legResult([
      fail("GATE_CAPTURE_MISSING", "capture.json missing or empty"),
    ]);
  }
  const sizeTol = envNum("GATE_PIXEL_SIZE_TOL", envNum("VISUAL_SIZE_TOL", 2).value)
    .value;
  const mismatchMax = envNum(
    "GATE_PIXEL_MISMATCH_MAX",
    envNum("VISUAL_MISMATCH_MAX", 0.08).value,
  ).value;
  const flatMax = envNum(
    "GATE_PIXEL_FLAT_BG_MAX",
    envNum("VISUAL_FLATBG_MAX", 0.12).value,
  ).value;
  const maskMax = envNum(
    "GATE_PIXEL_LIVE_MASK_MAX",
    envNum("VISUAL_LIVE_MASK_MAX", 0.5).value,
  ).value;
  const refs = refManifest();

  // A capture taken while a page or modal was still animating / loading has
  // correct DOM boxes but incorrect pixels. That is a measurement fault, not a
  // fidelity fault, so it must not silently inflate the mismatch ratio.
  const stabilityProps = [
    ["fontsReady", "web fonts had not settled"],
    ["imagesReady", "images had not finished loading"],
    ["animationsSettled", "entrance animations were still running"],
    ["networkIdle", "network had not gone idle"],
  ];
  for (const screen of capture.screens) {
    const st = screen.stability;
    if (!st) {
      failures.push(
        fail(
          "GATE_CAPTURE_UNSTABLE",
          "capture has no stability record; re-capture before scoring pixels",
          { screenId: screen.screenId },
        ),
      );
      continue;
    }
    for (const [prop, why] of stabilityProps) {
      if (st[prop] !== true) {
        failures.push(
          fail("GATE_CAPTURE_UNSTABLE", `${why} at capture time (${prop}=${st[prop]})`, {
            screenId: screen.screenId,
          }),
        );
      }
    }
  }

  for (const screen of capture.screens) {
    const ir = readLayoutIr(screen.screenId);
    if (!ir) {
      failures.push(
        fail("GATE_PIXEL_SIZE", "Layout IR missing for pixel size check", {
          screenId: screen.screenId,
        }),
      );
      continue;
    }
    const shotAbs = join(runDir, screen.screenshot);
    if (!existsSync(shotAbs)) {
      failures.push(
        fail("GATE_CAPTURE_MISSING", "runtime screenshot missing", {
          screenId: screen.screenId,
          path: screen.screenshot,
        }),
      );
      continue;
    }

    // Canvas / modal card size vs IR. A modal frame may carry prototype
    // overhang (schedule-batch frame 520x739 vs its 520x726 card rect), so the
    // card role is the box the runtime renders and the one asserted here.
    const cardControl =
      screen.type === "modal"
        ? (ir.controls || []).find((c) => c.role === "modal-card")
        : null;
    const sizeBox = cardControl?.bounds ?? ir.bounds;
    const irW = sizeBox.width;
    const irH = sizeBox.height;
    let runW;
    let runH;
    if (screen.type === "modal" && screen.dom?.modal) {
      runW = screen.dom.modal.w;
      runH = screen.dom.modal.h;
    } else {
      runW = screen.viewport?.width ?? screen.dom?.viewport?.w;
      runH = screen.viewport?.height ?? screen.dom?.viewport?.h;
    }
    if (
      runW == null ||
      runH == null ||
      Math.abs(runW - irW) > sizeTol ||
      Math.abs(runH - irH) > sizeTol
    ) {
      failures.push(
        fail(
          "GATE_PIXEL_SIZE",
          `size Δw=${(runW ?? -1) - irW} Δh=${(runH ?? -1) - irH} (tol=${sizeTol})`,
          {
            screenId: screen.screenId,
            evidence: `ir=${irW}x${irH}${
              cardControl ? `(role=modal-card,frame=${ir.bounds.width}x${ir.bounds.height})` : ""
            } run=${runW}x${runH}`,
          },
        ),
      );
    }

    const refCandidates = [
      join(repoRoot(), "imports/figma/screens", `${screen.screenId}.png`),
      join(repoRoot(), "artifacts/figma/screens", `${screen.screenId}.png`),
    ];
    const ref = refCandidates.find((p) => existsSync(p));
    if (!ref) {
      failures.push(
        fail(
          "GATE_PIXEL_DIFF",
          "reference screenshot missing; cannot score SSIM/mismatch",
          {
            screenId: screen.screenId,
            path: `imports/figma/screens/${screen.screenId}.png`,
          },
        ),
      );
      continue;
    }

    const refBuf = readFileSync(ref);
    const runBuf = readFileSync(shotAbs);

    // Reference normalization contract (asset-export): a shot must be the card
    // box itself, and its size must be declared in assets-manifest. A reference
    // that still carries Figma's effect bleed means the pixel leg would have to
    // guess an alignment, which is how a whole screen class ends up never
    // actually compared while every report says "size mismatch".
    const refImg = PNG.decode(refBuf);
    const box = opaqueBox(refImg);
    const isNormalized =
      box.x0 === 0 && box.y0 === 0 && box.w === refImg.width && box.h === refImg.height;
    const declared = refs.get(screen.screenId);
    if (!isNormalized) {
      const bleed = declared?.effectBleed;
      const declaredOk =
        bleed &&
        box.w === declared?.cardSize?.width &&
        box.h === declared?.cardSize?.height &&
        box.x0 === bleed.left &&
        box.y0 === bleed.top;
      if (!declaredOk) {
        failures.push(
          fail(
            "GATE_PIXEL_REF_UNNORMALIZED",
            `reference still carries effect bleed (opaque ${box.w}x${box.h}@${box.x0},${box.y0} in ${refImg.width}x${refImg.height}) and the manifest declares no matching cardSize/effectBleed`,
            {
              screenId: screen.screenId,
              path: `imports/figma/screens/${screen.screenId}.png`,
            },
          ),
        );
        continue;
      }
      notes.push(
        `reference not normalized but declared as card ${declared.cardSize.width}x${declared.cardSize.height} (bleed ${bleed.left},${bleed.top}): ${screen.screenId}`,
      );
    } else if (
      !declared ||
      declared.cardSize?.width !== refImg.width ||
      declared.cardSize?.height !== refImg.height
    ) {
      failures.push(
        fail(
          "GATE_PIXEL_REF_UNNORMALIZED",
          `reference is ${refImg.width}x${refImg.height} but the manifest declares ${declared?.cardSize ? `${declared.cardSize.width}x${declared.cardSize.height}` : "nothing"}; a reference whose size is undeclared cannot be audited`,
          {
            screenId: screen.screenId,
            path: `imports/figma/screens/${screen.screenId}.png`,
          },
        ),
      );
      continue;
    }

    const masks = liveRegionsOf(screen);
    const diff = pixelDiffRatio(refBuf, runBuf, sizeTol, masks);
    if (diff.sizeMismatch) {
      failures.push(
        fail(
          "GATE_PIXEL_SIZE",
          `png size mismatch ref=${diff.aw}x${diff.ah} run=${diff.bw}x${diff.bh}${
            diff.box
              ? ` refOpaqueBox=${diff.box.w}x${diff.box.h}@${diff.box.x0},${diff.box.y0}`
              : ""
          }`,
          { screenId: screen.screenId },
        ),
      );
    } else if (diff.ratio > mismatchMax) {
      failures.push(
        fail(
          "GATE_PIXEL_DIFF",
          `mismatch ratio=${diff.ratio.toFixed(4)} > ${mismatchMax}`,
          { screenId: screen.screenId },
        ),
      );
    }
    if (diff.refMargin && (diff.refMargin.dx || diff.refMargin.dy)) {
      notes.push(
        `aligned ref by ${diff.refMargin.dx},${diff.refMargin.dy}px (Figma effect bleed): ${screen.screenId}`,
      );
    }
    if (diff.maskedRatio != null && diff.maskedRatio > maskMax) {
      failures.push(
        fail(
          "GATE_PIXEL_LIVE_MASK",
          `live regions cover ${(diff.maskedRatio * 100).toFixed(1)}% of the shot > ${maskMax * 100}% — too little of the screen is being scored`,
          { screenId: screen.screenId },
        ),
      );
    }
    const drift = flatBgDrift(refBuf, runBuf, sizeTol, masks);
    notes.push(
      `pixel mismatch=${diff.ratio.toFixed(4)} flatBgDrift=${drift.drift.toFixed(4)} liveMasked=${
        diff.maskedRatio == null ? "n/a" : diff.maskedRatio.toFixed(4)
      }: ${screen.screenId}`,
    );
    if (drift.drift > flatMax) {
      failures.push(
        fail(
          "GATE_PIXEL_FLAT_BG",
          `flatBgDrift=${drift.drift.toFixed(4)} > ${flatMax}`,
          { screenId: screen.screenId },
        ),
      );
    }
  }
  return legResult(failures, notes);
}

export function runGeomLeg(capture) {
  const failures = [];
  if (!capture?.screens?.length) {
    return legResult([
      fail("GATE_CAPTURE_MISSING", "capture.json missing or empty"),
    ]);
  }
  const tol = envNum("GATE_GEOM_TOL_PX", envNum("VISUAL_GEO_TOL", 8).value)
    .value;

  for (const screen of capture.screens) {
    if (screen.openError) {
      failures.push(
        fail("GATE_GEOM_MODAL", `modal open failed: ${screen.openError}`, {
          screenId: screen.screenId,
        }),
      );
      continue;
    }
    const ir = readLayoutIr(screen.screenId);
    if (!ir) {
      failures.push(
        fail("GATE_GEOM_CONTROL", "Layout IR missing", {
          screenId: screen.screenId,
        }),
      );
      continue;
    }

    if (screen.type === "modal") {
      const white =
        ir.controls?.find((c) => /panel|card|box|modal/i.test(c.role || "")) ||
        null;
      const expectW = white?.bounds?.width ?? ir.bounds.width;
      const expectH = white?.bounds?.height ?? ir.bounds.height;
      const modal = screen.dom?.modal;
      if (!modal) {
        failures.push(
          fail("GATE_GEOM_MODAL", "DOM .ant-modal-content not found", {
            screenId: screen.screenId,
          }),
        );
      } else if (
        Math.abs(modal.w - expectW) > tol ||
        Math.abs(modal.h - expectH) > tol
      ) {
        failures.push(
          fail(
            "GATE_GEOM_MODAL",
            `modal card Δw=${(modal.w - expectW).toFixed(1)} Δh=${(modal.h - expectH).toFixed(1)}`,
            {
              screenId: screen.screenId,
              evidence: `ir=${expectW}x${expectH} dom=${modal.w.toFixed(1)}x${modal.h.toFixed(1)}`,
            },
          ),
        );
      }
    }

    let irControls = sortBoxes(
      (ir.controls || [])
        .filter((c) => isGeomControlRole(c.role))
        .map((c) => ({
          role: c.role,
          x: c.bounds.x,
          y: c.bounds.y,
          w: c.bounds.width,
          h: c.bounds.height,
        })),
    );

    if (irControls.length === 0) continue;

    let domControls = sortBoxes(
      (screen.dom?.controls || [])
        .filter((c) => isGeomControlRole(c.role) || c.role === "button")
        .map((c) => ({ role: c.role, x: c.x, y: c.y, w: c.w, h: c.h })),
    );

    // Modal screens: DOM rects are viewport coordinates while modal IR is
    // card-relative. Normalise both sides into card space by subtracting the
    // live card origin (the runtime anchor is a render convention — centered —
    // not an IR fact, so it is read from the DOM, never assumed).
    if (screen.type === "modal" && screen.dom?.modal) {
      const mo = screen.dom.modal;
      domControls = domControls.map((c) => ({
        ...c,
        x: c.x - mo.x,
        y: c.y - mo.y,
      }));
    }

    // For page screens, drop chrome buttons in sidebar (x < 220)
    if (screen.type !== "modal") {
      domControls = domControls.filter((c) => c.x >= 200);
      const irPage = irControls.filter((c) => c.x >= 200);
      if (irPage.length) irControls = irPage;
    }

    // Pair by index after sort; also allow role-family mismatch count check
    const n = Math.min(irControls.length, domControls.length);
    if (irControls.length !== domControls.length) {
      failures.push(
        fail(
          "GATE_GEOM_CONTROL",
          `control count ir=${irControls.length} dom=${domControls.length}`,
          { screenId: screen.screenId },
        ),
      );
    }
    for (let i = 0; i < n; i++) {
      const a = irControls[i];
      const b = domControls[i];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      const dw = Math.abs(a.w - b.w);
      const dh = Math.abs(a.h - b.h);
      if (dx > tol || dy > tol || dw > tol || dh > tol) {
        failures.push(
          fail(
            "GATE_GEOM_CONTROL",
            `box#${i} Δx=${dx.toFixed(1)} Δy=${dy.toFixed(1)} Δw=${dw.toFixed(1)} Δh=${dh.toFixed(1)}`,
            {
              screenId: screen.screenId,
              evidence: `ir=${a.role}@${a.x},${a.y},${a.w}x${a.h} dom=${b.role}@${b.x.toFixed(1)},${b.y.toFixed(1)},${b.w.toFixed(1)}x${b.h.toFixed(1)}`,
            },
          ),
        );
      }
    }
  }
  return legResult(failures);
}

/** Live-data mode: skip IR sample metrics/ticks (values come from API seed). */
function isLiveDataSampleText(characters) {
  const raw = String(characters || "").trim();
  if (!raw) return true;
  const n = normalizeText(raw);
  if (!n) return true;
  if (/^¥/.test(raw) || /¥/.test(raw)) return true;
  if (/%$/.test(n) && /^[\d.,]+%$/.test(n)) return true;
  if (/^[\d.,]+$/.test(n)) return true;
  // axis ticks like 8/1 or 2026-08-10
  if (/^\d{1,2}\/\d{1,2}$/.test(raw)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return true;
  // char counters like "32 / 1000" (Figma sample length)
  if (/^\d+\s*\/\s*\d+$/.test(raw)) return true;
  return false;
}

/** Value-holding roles: their IR text is a control value, not a DOM text node. */
function isValueControlRole(role) {
  return /^(input|textarea|select|checkbox|radio|date|number)/i.test(role || "");
}

/**
 * Live-data regions. A list/table/calendar page marks the subtree whose content
 * comes from the API with data-ir-live="<key>". Prototype samples drawn inside
 * such a region describe *seed data*, not layout: the row count and the values
 * differ by design, so the text and icon legs must not demand them. Everything
 * outside the marked regions (chrome, labels, column headers, controls) is
 * still asserted.
 */
function liveRegionsOf(screen) {
  return screen?.dom?.liveRegions || [];
}

function inAnyRegion(regions, x, y) {
  return regions.some(
    (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
  );
}

export function runTextLeg(capture) {
  const failures = [];
  if (!capture?.screens?.length) {
    return legResult([
      fail("GATE_CAPTURE_MISSING", "capture.json missing or empty"),
    ]);
  }
  const posTol = envNum("GATE_TEXT_TOL_PX", envNum("VISUAL_TEXT_TOL", 12).value)
    .value;
  const sizeTol = envNum(
    "GATE_TEXT_SIZE_TOL_PX",
    envNum("VISUAL_TEXT_SIZE_TOL", 2).value,
  ).value;

  for (const screen of capture.screens) {
    if (screen.openError) {
      failures.push(
        fail("GATE_TEXT_CONTENT", `modal open failed: ${screen.openError}`, {
          screenId: screen.screenId,
        }),
      );
      continue;
    }
    const ir = readLayoutIr(screen.screenId);
    if (!ir) {
      failures.push(
        fail("GATE_TEXT_CONTENT", "Layout IR missing", {
          screenId: screen.screenId,
        }),
      );
      continue;
    }

    // Input-like control boxes: a sample value drawn inside them is a control
    // value at runtime, not a DOM text node — do not demand it as text.
    const controlBoxes = (ir.controls || [])
      .filter((c) => isValueControlRole(c.role))
      .map((c) => ({
        x0: c.bounds.x,
        y0: c.bounds.y,
        x1: c.bounds.x + c.bounds.width,
        y1: c.bounds.y + c.bounds.height,
      }));

    const liveRegions = liveRegionsOf(screen);

    const irTexts = (ir.texts || [])
      .map((t) => ({
        characters: t.characters,
        norm: normalizeText(t.characters),
        x: t.bounds.x,
        y: t.bounds.y,
        w: t.bounds.width,
        h: t.bounds.height,
        fontSize: t.style?.fontSize,
        color: t.style?.color || t.style?.fills?.[0]?.color,
      }))
      .filter((t) => {
        if (!t.norm) return false;
        if (t.norm === "*" || t.norm.length === 1) return false;
        // skip tiny icon glyphs
        if (t.norm.length <= 1 && !/[\u4e00-\u9fffA-Za-z0-9]/.test(t.norm))
          return false;
        // live data: do not require Figma sample numbers/ticks in DOM
        if (isLiveDataSampleText(t.characters)) return false;
        // live data: sample values sitting inside an input/textarea control
        const cx = t.x + t.w / 2;
        const cy = t.y + t.h / 2;
        if (
          controlBoxes.some(
            (b) => cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1,
          )
        )
          return false;
        // live data: sample values inside a data-ir-live region (table rows,
        // calendar cells, a month title derived from today)
        if (inAnyRegion(liveRegions, cx, cy)) return false;
        return true;
      });

    const domTexts = (screen.dom?.texts || []).map((t) => ({
      characters: t.characters,
      norm: normalizeText(t.characters),
      x: t.x,
      y: t.y,
      w: t.w,
      h: t.h,
      fontSize: t.fontSize,
      color: t.color,
    }));

    // Modal screens: DOM text boxes are viewport coordinates while modal IR
    // is card-relative. Normalise the DOM side into card space with the live
    // card origin read from the DOM (the anchor is a render convention, not
    // an IR fact).
    const modalBox =
      screen.type === "modal" ? screen.dom?.modal : null;
    if (modalBox) {
      for (const dt of domTexts) {
        dt.x -= modalBox.x;
        dt.y -= modalBox.y;
      }
    }

    const used = new Set();
    let missing = 0;
    let styleFails = 0;
    for (const it of irTexts) {
      const cx = it.x + it.w / 2;
      const cy = it.y + it.h / 2;
      const findBest = (accept) => {
        let best = -1;
        let bestDist = Infinity;
        for (let i = 0; i < domTexts.length; i++) {
          if (used.has(i)) continue;
          const dt = domTexts[i];
          if (!accept(dt)) continue;
          const dx = dt.x + dt.w / 2;
          const dy = dt.y + dt.h / 2;
          const dist = Math.hypot(cx - dx, cy - dy);
          if (dist < bestDist) {
            bestDist = dist;
            best = i;
          }
        }
        return best;
      };
      // Exact match first; only fall back to substring when both sides are long
      // enough that a 1-2 char DOM fragment cannot impersonate a label.
      let best = findBest((dt) => dt.norm === it.norm);
      if (best < 0) {
        best = findBest((dt) => {
          const shorter = Math.min(dt.norm.length, it.norm.length);
          return (
            shorter >= 4 &&
            (dt.norm.includes(it.norm) || it.norm.includes(dt.norm))
          );
        });
      }
      if (best < 0) {
        missing++;
        if (missing <= 5) {
          failures.push(
            fail("GATE_TEXT_CONTENT", `IR text not in DOM: ${it.characters}`, {
              screenId: screen.screenId,
            }),
          );
        }
        continue;
      }
      used.add(best);
      const dt = domTexts[best];
      const dx = Math.abs(it.x - dt.x);
      const dy = Math.abs(it.y + it.h / 2 - (dt.y + dt.h / 2));
      const dw = Math.abs(it.w - dt.w);
      if (dx > posTol || dy > posTol || dw > posTol * 2) {
        styleFails++;
        if (styleFails <= 5) {
          failures.push(
            fail(
              "GATE_TEXT_STYLE",
              `text box drift for "${it.characters}": Δx=${dx.toFixed(1)} Δy=${dy.toFixed(1)} Δw=${dw.toFixed(1)}`,
              { screenId: screen.screenId },
            ),
          );
        }
      }
      if (
        it.fontSize &&
        Math.abs((dt.fontSize || 0) - it.fontSize) > sizeTol
      ) {
        styleFails++;
        if (styleFails <= 8) {
          failures.push(
            fail(
              "GATE_TEXT_STYLE",
              `fontSize "${it.characters}": ir=${it.fontSize} dom=${dt.fontSize}`,
              { screenId: screen.screenId },
            ),
          );
        }
      }
      if (it.color && dt.color && !colorsClose(it.color, dt.color)) {
        // color often missing on IR style — only fail when IR has explicit color
        styleFails++;
      }
    }
    if (missing > 5) {
      failures.push(
        fail(
          "GATE_TEXT_CONTENT",
          `${missing - 5} additional IR texts missing from DOM`,
          { screenId: screen.screenId },
        ),
      );
    }
  }
  return legResult(failures);
}

export async function runDataLeg(capture) {
  const failures = [];
  const spec = readAppSpec();
  const apiUrl = process.env.API_URL;
  const password = process.env.GATE_PASS;
  const username = process.env.GATE_USER || spec.seedAdmin?.username || "admin";

  if (!apiUrl || !password) {
    return legResult([
      fail("GATE_DATA_LOOP", "API_URL or GATE_PASS missing for data leg"),
    ]);
  }

  let token;
  try {
    const loginRes = await fetch(`${apiUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!loginRes.ok) {
      return legResult([
        fail("GATE_DATA_LOOP", `login HTTP ${loginRes.status}`),
      ]);
    }
    const body = await loginRes.json();
    token = body.token;
  } catch (e) {
    return legResult([
      fail("GATE_DATA_LOOP", `login failed: ${String(e?.message || e)}`),
    ]);
  }

  const auth = { Authorization: `Bearer ${token}` };
  async function getJson(path) {
    const r = await fetch(`${apiUrl}${path}`, { headers: auth });
    if (!r.ok) throw new Error(`${path} HTTP ${r.status}`);
    return r.json();
  }

  let stats;
  try {
    stats = await getJson("/api/stats");
  } catch (e) {
    failures.push(
      fail("GATE_DATA_LOOP", `stats API: ${String(e?.message || e)}`),
    );
  }

  if (stats && Array.isArray(spec.stats)) {
    for (const s of spec.stats) {
      if (!(s.id in stats)) {
        failures.push(
          fail("GATE_DATA_LOOP", `stats key missing in API: ${s.id}`, {
            path: "stats",
          }),
        );
      }
    }
  }

  const entityPaths = {
    department: "/api/departments",
    doctor: "/api/doctors",
    schedule: "/api/schedules",
    appointment: "/api/appointments",
    organization: "/api/organizations",
  };

  for (const ent of spec.entities || []) {
    const path = entityPaths[ent.id];
    if (!path) continue;
    try {
      const data = await getJson(path);
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      if (rows.length === 0) {
        failures.push(
          fail("GATE_DATA_LIVE", `entity ${ent.id} returned empty`, {
            path,
          }),
        );
      } else {
        // field presence on first row
        for (const f of ent.fields || []) {
          if (f.required && !(f.id in rows[0]) && rows[0][f.id] !== null) {
            // soft: only fail if key entirely absent
          }
          if (!(f.id in rows[0])) {
            failures.push(
              fail(
                "GATE_DATA_LOOP",
                `field ${ent.id}.${f.id} absent in API row`,
                { path },
              ),
            );
          }
        }
      }
    } catch (e) {
      failures.push(
        fail("GATE_DATA_LOOP", `${ent.id}: ${String(e?.message || e)}`, {
          path,
        }),
      );
    }
  }

  // DOM live / backfill from capture
  if (!capture?.screens?.length) {
    failures.push(
      fail("GATE_CAPTURE_MISSING", "capture missing for data DOM checks"),
    );
  } else {
    const home = capture.screens.find((s) => s.screenId === "home");
    if (home) {
      const kpis = home.dom?.live?.kpiValues || [];
      if (kpis.length === 0) {
        failures.push(
          fail("GATE_DATA_LIVE", "home KPI values not found in DOM", {
            screenId: "home",
          }),
        );
      } else if (kpis.every((v) => v === "0" || v === "¥0" || v === "")) {
        failures.push(
          fail("GATE_DATA_LIVE", "home KPI values all zero/empty", {
            screenId: "home",
            evidence: kpis.join(","),
          }),
        );
      }
      // chart bars present?
      const chartLabels = (home.dom?.texts || []).filter((t) =>
        /周|一|二|三|四|五|六|日|科室|医生/.test(t.characters || ""),
      );
      if (chartLabels.length === 0) {
        // SimpleBarChart should render labels — if none, stats gap
        failures.push(
          fail(
            "GATE_DATA_STATS_GAP",
            "dashboard chart labels not observed in DOM",
            { screenId: "home" },
          ),
        );
      }
    }

    const org = capture.screens.find((s) => s.screenId === "organization");
    if (org) {
      const vals = org.dom?.live?.formValues || [];
      if (vals.length === 0) {
        failures.push(
          fail("GATE_DATA_LIVE", "organization form has no filled values", {
            screenId: "organization",
          }),
        );
      }
    }

    for (const listId of ["departments", "doctors"]) {
      const sc = capture.screens.find((s) => s.screenId === listId);
      if (!sc) continue;
      const cells = sc.dom?.live?.tableCells || [];
      if (cells.filter(Boolean).length === 0) {
        failures.push(
          fail("GATE_DATA_LIVE", `${listId} table appears empty in DOM`, {
            screenId: listId,
          }),
        );
      }
    }
  }

  return legResult(failures);
}

export function loadCaptureOrNull(runStamp) {
  return loadCapture(runStamp);
}

/**
 * Icon leg. Layout IR enumerates every visible icon slot; an empty or wrong
 * slot is invisible to the pixel leg (a card without its title glyph still
 * matches well) and to the geom leg (icons are not controls), so it gets its
 * own leg: same slots must appear in the DOM at the same box and colour.
 */
export function runIconLeg(capture) {
  const failures = [];
  if (!capture?.screens?.length) {
    return legResult([
      fail("GATE_CAPTURE_MISSING", "capture.json missing or empty"),
    ]);
  }
  const tol = envNum("GATE_ICON_TOL_PX", 8).value;

  for (const screen of capture.screens) {
    if (screen.openError) {
      failures.push(
        fail("GATE_ICON_MISSING", `screen did not open: ${screen.openError}`, {
          screenId: screen.screenId,
        }),
      );
      continue;
    }
    const ir = readLayoutIr(screen.screenId);
    if (!ir) {
      failures.push(
        fail("GATE_ICON_MISSING", "Layout IR missing", {
          screenId: screen.screenId,
        }),
      );
      continue;
    }

    const slots = ir.icons || [];
    const domIcons = screen.dom?.icons || [];
    const isModal = screen.type === "modal";

    // Modal slots are framed in the modal's own coordinate space. DOM rects
    // are viewport coordinates: subtract the live card position so both sides
    // compare in card space. (The runtime anchor is a render convention, not
    // an IR fact — the card may be centered, so read it from the DOM.)
    let offset = { x: 0, y: 0 };
    if (isModal) {
      const card =
        (ir.controls || []).find((c) => /panel|card|box|modal/i.test(c.role || "")) ||
        null;
      const dom = screen.dom?.modal;
      if (card && dom) offset = { x: dom.x, y: dom.y };
    }

    const screenLive = liveRegionsOf(screen);
    const unresolved = slots
      .filter((s) => s.symbol?.source === "unresolved")
      .filter(
        (s) =>
          !inAnyRegion(
            screenLive,
            s.bounds.x + s.bounds.width / 2,
            s.bounds.y + s.bounds.height / 2,
          ),
      );
    for (const s of unresolved.slice(0, 5)) {
      failures.push(
        fail(
          "GATE_ICON_UNRESOLVED",
          `icon slot has no symbol name (nodeId=${s.nodeId}) — resolve it in the Layout IR or the slot cannot be rendered`,
          { screenId: screen.screenId, evidence: JSON.stringify(s.bounds) },
        ),
      );
    }

    const expected = slots
      .filter((s) => s.symbol?.source !== "unresolved" && s.symbol?.name)
      .filter(
        (s) =>
          !inAnyRegion(
            liveRegionsOf(screen),
            s.bounds.x + s.bounds.width / 2,
            s.bounds.y + s.bounds.height / 2,
          ),
      )
      .map((s) => ({
        name: s.symbol.name,
        nodeId: s.nodeId,
        x: s.bounds.x - offset.x,
        y: s.bounds.y - offset.y,
        w: s.bounds.width,
        h: s.bounds.height,
        color: s.color,
      }))
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const actual = [...domIcons].sort((a, b) => a.y - b.y || a.x - b.x);

    if (expected.length !== actual.length) {
      failures.push(
        fail(
          "GATE_ICON_MISSING",
          `icon count ir=${expected.length} dom=${actual.length}`,
          {
            screenId: screen.screenId,
            evidence: `ir=[${expected.map((e) => e.name).join(",")}] dom=[${actual
              .map((a) => a.name)
              .join(",")}]`,
          },
        ),
      );
    }

    const n = Math.min(expected.length, actual.length);
    for (let i = 0; i < n; i++) {
      const a = expected[i];
      const b = actual[i];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      const dw = Math.abs(a.w - b.w);
      const dh = Math.abs(a.h - b.h);
      if (dx > tol || dy > tol || dw > tol || dh > tol) {
        if (failures.length < 40) {
          failures.push(
            fail(
              "GATE_ICON_BOX",
              `slot#${i} ${a.name} Δx=${dx.toFixed(1)} Δy=${dy.toFixed(1)} Δw=${dw.toFixed(1)} Δh=${dh.toFixed(1)} (tol=${tol})`,
              {
                screenId: screen.screenId,
                evidence: `ir=${a.nodeId}@${a.x.toFixed(1)},${a.y.toFixed(1)},${a.w.toFixed(1)}x${a.h.toFixed(1)} dom=${b.name}@${b.x.toFixed(1)},${b.y.toFixed(1)},${b.w.toFixed(1)}x${b.h.toFixed(1)}`,
              },
            ),
          );
        }
      }
      // Colour is only asserted when the IR recorded one (Figma does not always
      // carry a paint for stroke-drawn glyphs).
      if (a.color && b.color && !colorsClose(a.color, b.color)) {
        if (failures.length < 40) {
          failures.push(
            fail("GATE_ICON_COLOR", `slot#${i} ${a.name} ir=${a.color} dom=${b.color}`, {
              screenId: screen.screenId,
            }),
          );
        }
      }
    }
  }
  return legResult(failures);
}

/**
 * Cell leg. Drawn boxes that are neither controls (the geom leg pairs only
 * input-like roles), nor icons (no glyph), nor text (no characters): calendar
 * day cells, their header band, legend swatches, a today badge. They opt in
 * with data-ir-cell="<role>" and are paired with `ir.cells[]` in reading order.
 *
 * Why it exists: these boxes are pure geometry and paint. A calendar can render
 * flat white at three times its IR row height while every other leg passes —
 * pixel diff is masked by the live region over the grid, geom has no control to
 * pin, text has no string to match, icon has no glyph. The only witness is the
 * box itself.
 *
 * Roles with a month-independent position (`grid-head`, `legend-swatch`,
 * `frame`, `toggle-track`) are asserted box-exact. `grid-cell` is asserted
 * box-exact too, because the grid rows are IR-fixed and content clips inside
 * them; only columns whose IR cells unanimously agree on a fill (the weekend
 * columns) have their paint asserted, so today/hover states stay free to move
 * with the real month. `badge` is position-free by design: it follows today, so
 * only its size and paint are asserted. `sample: true` boxes are live content
 * (one chip per row) and are never paired.
 */
const CELL_FREE_POSITION_ROLES = new Set(["badge"]);

export function runCellLeg(capture) {
  const failures = [];
  if (!capture?.screens?.length) {
    return legResult([
      fail("GATE_CAPTURE_MISSING", "capture.json missing or empty"),
    ]);
  }
  // Pixel-level tolerance. The cells are a 1fr grid, so a browser lays them out
  // on fractional widths; measured drift against the IR is under 1px, which
  // leaves room to pin this tightly enough to catch a 6px badge or swatch error
  // rather than waving it through with the usual 8px budget.
  const tol = envNum("GATE_CELL_TOL_PX", 2).value;

  for (const screen of capture.screens) {
    if (screen.openError) {
      failures.push(
        fail("GATE_CELL_MISSING", `screen did not open: ${screen.openError}`, {
          screenId: screen.screenId,
        }),
      );
      continue;
    }
    const ir = readLayoutIr(screen.screenId);
    if (!ir) {
      failures.push(
        fail("GATE_CELL_MISSING", "Layout IR missing", {
          screenId: screen.screenId,
        }),
      );
      continue;
    }
    const slots = (ir.cells || []).filter((c) => !c.sample);
    if (!slots.length) continue;

    const isModal = screen.type === "modal";
    let offset = { x: 0, y: 0 };
    if (isModal) {
      const card =
        (ir.controls || []).find((c) => /panel|card|box|modal/i.test(c.role || "")) ||
        null;
      const dom = screen.dom?.modal;
      if (card && dom) offset = { x: dom.x, y: dom.y };
    }

    // No live-region filter here, deliberately. `cells[]` is IR-declared chrome:
    // a mask frees *values* (the chip rows), not the box that holds them. If the
    // leg honoured masks, masking the calendar interior — exactly what the
    // broken page did — would put the whole grid beyond scoring again. The impl
    // leg guards the other direction: a mask may not swallow a cell box.
    const visible = slots;

    // Columns whose IR cells unanimously agree on a fill are month-independent
    // (weekend columns). Derive the expectation from the IR, never from a
    // literal, so the leg carries no palette of its own.
    const columnFills = new Map();
    const byColumn = new Map();
    for (const s of visible.filter((s) => s.role === "grid-cell")) {
      if (!s.fill) continue;
      const key = Math.round(s.bounds.x);
      if (!byColumn.has(key)) byColumn.set(key, new Set());
      byColumn.get(key).add(s.fill);
    }
    for (const [key, fills] of byColumn) {
      if (fills.size === 1) columnFills.set(key, [...fills][0]);
    }

    // Pair by role first, then reading order. The badge follows today, so its y
    // moves every month; ordering purely by position would put it at a different
    // index in the IR list than in the DOM list and derail every later pair.
    const readOrder = (a, z) => a.y - z.y || a.x - z.x;
    const expected = visible
      .map((s) => ({
        role: s.role,
        nodeId: s.nodeId,
        x: s.bounds.x - offset.x,
        y: s.bounds.y - offset.y,
        w: s.bounds.width,
        h: s.bounds.height,
        fill: s.fill || null,
      }))
      .sort((a, z) => a.role.localeCompare(z.role) || readOrder(a, z));
    const actual = [...(screen.dom?.cells || [])].sort(
      (a, z) => a.role.localeCompare(z.role) || readOrder(a, z),
    );

    if (expected.length !== actual.length) {
      failures.push(
        fail(
          "GATE_CELL_MISSING",
          `cell count ir=${expected.length} dom=${actual.length}`,
          {
            screenId: screen.screenId,
            evidence: `ir=[${expected.map((e) => e.role).join(",")}] dom=[${actual
              .map((a) => a.role)
              .join(",")}]`,
          },
        ),
      );
    }

    const n = Math.min(expected.length, actual.length);
    for (let i = 0; i < n; i++) {
      const a = expected[i];
      const b = actual[i];
      if (a.role !== b.role) {
        failures.push(
          fail(
            "GATE_CELL_ROLE",
            `cell#${i} role ir=${a.role} dom=${b.role} — reading order diverged, later cells are unpairable`,
            { screenId: screen.screenId },
          ),
        );
        continue;
      }

      if (!CELL_FREE_POSITION_ROLES.has(a.role)) {
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        const dw = Math.abs(a.w - b.w);
        const dh = Math.abs(a.h - b.h);
        if (dx > tol || dy > tol || dw > tol || dh > tol) {
          if (failures.length < 40) {
            failures.push(
              fail(
                "GATE_CELL_BOX",
                `${a.role}#${i} Δx=${dx.toFixed(1)} Δy=${dy.toFixed(1)} Δw=${dw.toFixed(1)} Δh=${dh.toFixed(1)} (tol=${tol})`,
                {
                  screenId: screen.screenId,
                  evidence: `ir=${a.nodeId}@${a.x.toFixed(1)},${a.y.toFixed(1)},${a.w.toFixed(1)}x${a.h.toFixed(1)} dom@${b.x.toFixed(1)},${b.y.toFixed(1)},${b.w.toFixed(1)}x${b.h.toFixed(1)}`,
                },
              ),
            );
          }
        }
      } else {
        const dw = Math.abs(a.w - b.w);
        const dh = Math.abs(a.h - b.h);
        if (dw > tol || dh > tol) {
          if (failures.length < 40) {
            failures.push(
              fail(
                "GATE_CELL_BOX",
                `${a.role}#${i} size Δw=${dw.toFixed(1)} Δh=${dh.toFixed(1)} (tol=${tol})`,
                {
                  screenId: screen.screenId,
                  evidence: `ir=${a.w.toFixed(1)}x${a.h.toFixed(1)} dom=${b.w.toFixed(1)}x${b.h.toFixed(1)}`,
                },
              ),
            );
          }
        }
      }

      // Paint. Day cells defer to the whole-column check below so live
      // today/hover states can move; every other role is compared directly.
      if (a.role !== "grid-cell" && a.fill && b.fill && !colorsClose(a.fill, b.fill)) {
        if (failures.length < 40) {
          failures.push(
            fail("GATE_CELL_FILL", `${a.role}#${i} ir=${a.fill} dom=${b.fill}`, {
              screenId: screen.screenId,
              evidence: `ir=${a.nodeId}`,
            }),
          );
        }
      }
    }

    // Freeze-blocker: a column the IR paints uniformly must stay that paint.
    // Catches the flat-white grid that box geometry alone would accept.
    for (const b of actual) {
      if (b.role !== "grid-cell") continue;
      const want = columnFills.get(Math.round(b.x));
      if (!want || !b.fill) continue;
      if (!colorsClose(want, b.fill)) {
        if (failures.length < 40) {
          failures.push(
            fail(
              "GATE_CELL_FILL",
              `grid-cell column x≈${Math.round(b.x)} ir=${want} dom=${b.fill} — column paint drifted (all-white grid?)`,
              { screenId: screen.screenId },
            ),
          );
        }
      }
    }
  }
  return legResult(failures);
}

/**
 * Per fluid container instance at one viewport: the union box of its own
 * children, keyed by `group#occurrence` so several containers of one group stay
 * apart while remaining stable across viewports (document order does not
 * change).
 */
function contentByInstance(probe) {
  const out = new Map();
  const seen = new Map();
  for (const f of probe.fluid || []) {
    const occurrence = (seen.get(f.group) || 0) + 1;
    seen.set(f.group, occurrence);
    if (!f.content || !f.childCount) continue;
    out.set(`${f.group}#${occurrence}`, {
      group: f.group,
      containerW: f.w,
      contentW: f.content.w,
    });
  }
  return out;
}

/**
 * Layout (fluid) leg. The visual legs capture at the IR viewport, where a
 * container pinned to its IR pixel width and a container that follows the main
 * area are indistinguishable. This leg re-measures at a widened viewport and
 * asserts two layers:
 *
 * 1. every container marked data-ir-fluid keeps spanning the main area (same
 *    left/right insets), with no page-level scale and no horizontal overflow;
 * 2. the content *inside* such a container grows with it.
 *
 * Layer 2 exists because layer 1 judges container boxes alone: a white panel can
 * stretch to the main area correctly while the fields drawn on it keep their IR
 * pixel width, leaving a blank band on its right. That is invisible at the IR
 * viewport by construction, and the container box is identical either way — so
 * the witness has to be the content. Comparing per-control insets instead does
 * not work: a right-anchored fixed button and a frozen field are geometrically
 * the same shape (one inset conserved, the other growing), and no threshold
 * separates them. Requiring the content bbox to grow does: legitimate
 * fixed-width buttons sit next to fluid content that still grows, while a
 * frozen field cluster cannot grow at all.
 */
export function runLayoutLeg(capture) {
  const failures = [];
  if (!capture?.screens?.length) {
    return legResult([
      fail("GATE_CAPTURE_MISSING", "capture.json missing or empty"),
    ]);
  }
  const tol = envNum("GATE_LAYOUT_TOL_PX", 8).value;
  const growMin = envNum("GATE_LAYOUT_GROW_MIN_PX", 16).value;
  const innerRatio = envNum("GATE_LAYOUT_INNER_GROW_RATIO", 0.5).value;
  const innerTol = envNum("GATE_LAYOUT_INNER_TOL_PX", tol).value;
  let contentChecked = 0;
  let fluidInstances = 0;

  for (const screen of capture.screens) {
    const overflowSeen = new Set();
    if (screen.type === "modal") continue;
    if (screen.openError) {
      failures.push(
        fail("GATE_LAYOUT_NO_FLUID", `screen did not open: ${screen.openError}`, {
          screenId: screen.screenId,
        }),
      );
      continue;
    }
    const layout = screen.layout;
    if (!layout) {
      failures.push(
        fail("GATE_LAYOUT_NO_FLUID", "layout probe missing at capture viewport", {
          screenId: screen.screenId,
        }),
      );
      continue;
    }
    if (!layout.fluid?.length) {
      failures.push(
        fail(
          "GATE_LAYOUT_NO_FLUID",
          "no data-ir-fluid container found — page does not follow the main area (viewport-fit 方案 C)",
          { screenId: screen.screenId },
        ),
      );
      continue;
    }
    if (layout.transform && layout.transform !== "none") {
      failures.push(
        fail(
          "GATE_LAYOUT_SCALED",
          `page shell is transform-scaled (${layout.transform}); scale-to-fit is not viewport fit`,
          { screenId: screen.screenId },
        ),
      );
    }

    const wide = screen.wide;
    if (!wide || wide.error) {
      failures.push(
        fail(
          "GATE_LAYOUT_STATIC",
          `wide-viewport probe failed: ${wide?.error || "missing"}`,
          { screenId: screen.screenId },
        ),
      );
      continue;
    }
    if (!wide.main) {
      failures.push(
        fail("GATE_LAYOUT_STATIC", "main area (.app-main) not found at wide viewport", {
          screenId: screen.screenId,
        }),
      );
      continue;
    }
    if (wide.scrollW - wide.viewport.w > tol) {
      failures.push(
        fail(
          "GATE_LAYOUT_STATIC",
          `horizontal overflow at wide viewport: scrollW=${wide.scrollW} > ${wide.viewport.w}`,
          { screenId: screen.screenId },
        ),
      );
    }

    const irW = screen.irBounds?.width ?? screen.viewport?.width;
    const irMainRight = irW;
    const groups = new Map();
    for (const f of layout.fluid) {
      const g = groups.get(f.group) || { minRightInset: Infinity, minLeftInset: Infinity, items: [] };
      g.minRightInset = Math.min(g.minRightInset, irMainRight - f.right);
      g.minLeftInset = Math.min(g.minLeftInset, f.x - layout.main.x);
      g.items.push(f);
      groups.set(f.group, g);
    }

    for (const [group, g] of groups) {
      const nowItems = wide.fluid.filter((f) => f.group === group);
      if (nowItems.length !== g.items.length) {
        failures.push(
          fail(
            "GATE_LAYOUT_STATIC",
            `fluid group "${group}" lost containers at wide viewport (${g.items.length} → ${nowItems.length})`,
            { screenId: screen.screenId },
          ),
        );
        continue;
      }
      const spanRight = Math.max(...nowItems.map((f) => f.right));
      const spanLeft = Math.min(...nowItems.map((f) => f.x));
      const wantRight = wide.main.right - g.minRightInset;
      const wantLeft = wide.main.x + g.minLeftInset;
      if (
        Math.abs(spanRight - wantRight) > tol ||
        Math.abs(spanLeft - wantLeft) > tol
      ) {
        failures.push(
          fail(
            "GATE_LAYOUT_STATIC",
            `fluid group "${group}" does not follow the main area: span=[${spanLeft.toFixed(1)},${spanRight.toFixed(1)}] want=[${wantLeft.toFixed(1)},${wantRight.toFixed(1)}]`,
            {
              screenId: screen.screenId,
              evidence: `main=[${wide.main.x.toFixed(1)},${wide.main.right.toFixed(1)}] viewport=${wide.viewport.w} irViewport=${irW}`,
            },
          ),
        );
        continue;
      }
      const grew = nowItems.some((f, i) => f.w - g.items[i].w > growMin);
      if (!grew) {
        failures.push(
          fail(
            "GATE_LAYOUT_STATIC",
            `fluid group "${group}" kept its IR widths at a wider viewport (no container grew > ${growMin}px)`,
            { screenId: screen.screenId },
          ),
        );
      }
    }

    // The containers followed — but the content inside them is a separate
    // question, and the container boxes cannot answer it. A panel that stretches
    // while the fields on it keep their IR pixel width looks identical at the
    // capture viewport (which IS IR width) and leaves a blank band on the right
    // at any wider one; only the content gives it away. So: a container that
    // grew must carry its content with it. Containers without measurable
    // children (a background panel that owns no elements) are skipped rather
    // than silently passed.
    const narrowContent = contentByInstance(layout);
    const wideContent = contentByInstance(wide);
    fluidInstances += layout.fluid.length;
    for (const [key, n] of narrowContent) {
      const wd = wideContent.get(key);
      if (!wd) continue;
      const containerGrew = wd.containerW - n.containerW;
      if (containerGrew < growMin) continue;
      const contentGrew = wd.contentW - n.contentW;
      const want = innerRatio * containerGrew;
      contentChecked++;
      if (contentGrew + innerTol < want) {
        failures.push(
          fail(
            "GATE_LAYOUT_INNER_STATIC",
            `fluid group "${n.group}" grew ${containerGrew.toFixed(0)}px but its content only grew ` +
              `${contentGrew.toFixed(0)}px (want ≥ ${want.toFixed(0)}px) — content is pinned to its IR width`,
            {
              screenId: screen.screenId,
              evidence: `content ${n.contentW.toFixed(0)}→${wd.contentW.toFixed(0)} container ${n.containerW.toFixed(0)}→${wd.containerW.toFixed(0)}`,
            },
          ),
        );
      }
    }
    // Containment: a fluid box must hold the content inside it. Overflowing
    // rows or a pagination bar escape the card they belong to, but the page
    // declares that region live (data-ir-live) and a masked region is scored
    // nowhere — so the pixels cannot witness the escape, at either viewport.
    // The container's own scroll metrics can: content taller/wider than the box
    // that owns it. A container that genuinely wants an internal scroll
    // viewport must say so with data-ir-scroll; anything else is content that
    // has left its box.
    for (const [probe, label] of [
      [layout, "capture"],
      [wide, "wide"],
    ]) {
      for (const f of probe?.fluid || []) {
        if (f.scrollDeclared) continue;
        const dx = (f.scrollW || 0) - (f.clientW || 0);
        const dy = (f.scrollH || 0) - (f.clientH || 0);
        if (dx <= tol && dy <= tol) continue;
        const key = `${f.group}@${label}`;
        if (overflowSeen.has(key)) continue;
        overflowSeen.add(key);
        failures.push(
          fail(
            "GATE_LAYOUT_OVERFLOW",
            `fluid container "${f.group}" does not contain its content at the ${label} viewport: ` +
              `overflow ${dx.toFixed(0)}x${dy.toFixed(0)}px (scroll ${f.scrollW}x${f.scrollH} vs client ${f.clientW}x${f.clientH})`,
            {
              screenId: screen.screenId,
              evidence: `box=[${f.x.toFixed(1)},${f.y.toFixed(1)},${f.w.toFixed(1)},${f.h.toFixed(1)}] overflowY=${f.overflowY}`,
            },
          ),
        );
      }
    }
  }
  return legResult(
    failures,
    [
      `content layer: ${contentChecked} of ${fluidInstances} marked container instance(s) judged; ` +
        `${fluidInstances - contentChecked} not judged (no measurable children, or container did not grow)`,
    ],
  );
}

/* ---------------------------------------------------------------------------
 * impl leg — the implementation's contract with the IR and with the masking.
 *
 * Two classes of deviation had no leg at all, which is exactly why they could
 * survive a fully green gate:
 *
 * 1. The screen re-types values the IR already holds (colours, and numeric
 *    fallbacks on IR geometry). Nothing measured this, so "I used a constant
 *    instead of the IR" was unobservable.
 * 2. The live-data mask is declared by the page, so the page can widen it to
 *    stop being scored. The legs consumed the mask but never questioned it.
 *
 * Known hits are recorded in artifacts/ir/impl-baseline.json with a reason, so
 * the debt is visible in the repo instead of silently permitted: this leg fails
 * on any hit that is *not* in the baseline.
 * ------------------------------------------------------------------------- */

const IMPL_BASELINE_REL = "artifacts/ir/impl-baseline.json";
const SOURCE_EXT = /\.(tsx|ts|jsx|js|css)$/i;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".vite", "coverage"]);
/** Files generated *from* the IR are the sanctioned home for design values. */
const GENERATED_MARKER = /generated from artifacts\/ir/;

function walkSource(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walkSource(abs, acc);
    else if (SOURCE_EXT.test(name)) acc.push(abs);
  }
  return acc;
}

function collectIrFacts() {
  const facts = {};
  const dir = join(repoRoot(), "artifacts/ir/layout");
  if (!existsSync(dir)) return facts;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const ir = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const controls = ir.controls || [];
    facts[ir.screenId] = {
      bounds: ir.bounds,
      controls,
      geomControls: controls.filter((c) => isGeomControlRole(c.role)),
      card: controls.find((c) => c.role === "modal-card") || null,
      panel: controls.find((c) => c.role === "panel") || null,
      nonSampleCells: (ir.cells || []).filter((c) => !c.sample),
    };
  }
  return facts;
}

function chromeBoxes() {
  try {
    const vis = readJson("artifacts/ir/visual-ir.json");
    return Object.entries(vis.chrome || {})
      .map(([key, c]) => (c?.bounds ? { key, ...c.bounds } : null))
      .filter(Boolean);
  } catch {
    return [];
  }
}

const inter = (a, b) =>
  !(a.x + a.w <= b.x || b.x + b.width <= a.x || a.y + a.h <= b.y || b.y + b.height <= a.y);
const inside = (a, b) =>
  a.x >= b.x - 0.5 &&
  a.y >= b.y - 0.5 &&
  a.x + a.w <= b.x + b.width + 0.5 &&
  a.y + a.h <= b.y + b.height + 0.5;

function loadImplBaseline() {
  const keys = new Set();
  const entries = [];
  const p = join(repoRoot(), IMPL_BASELINE_REL);
  if (!existsSync(p)) return { keys, entries };
  const j = JSON.parse(readFileSync(p, "utf8"));
  for (const e of j.entries || []) {
    keys.add(`${e.code}|${e.file}|${e.literal}`);
    entries.push(e);
  }
  return { keys, entries };
}

/** Declared card sizes from the asset manifest (asset-export normalization). */
function manifestCardSizes() {
  const map = new Map();
  try {
    const m = readJson("artifacts/figma/assets-manifest.json");
    for (const a of m.assets || []) {
      if (a.kind === "ref-screen" && a.cardSize) map.set(a.screenId, a.cardSize);
    }
  } catch {
    /* manifest absent: the pixel leg already fails the reference, here it is a gap */
  }
  return map;
}

/**
 * Modal card size single source of truth. The IR modal-card box, the asset
 * manifest cardSize, and the runtime DOM all describe the same white card. If
 * the IR and the manifest disagree, the pixel leg has been normalizing the
 * reference against one number while the geometry leg asserts another, and the
 * two "passing" legs are measuring different cards.
 */
function checkModalCardSsot(failures, notes) {
  const dir = join(repoRoot(), "artifacts/ir/layout");
  if (!existsSync(dir)) return;
  const declared = manifestCardSizes();
  let checked = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    let ir;
    try {
      ir = JSON.parse(readFileSync(join(dir, f), "utf8"));
    } catch {
      continue;
    }
    const card = (ir.controls || []).find((c) => c.role === "modal-card");
    if (!card) continue;
    checked++;
    const decl = declared.get(ir.screenId);
    if (!decl) {
      failures.push(
        fail(
          "GATE_IMPL_CARD_SSOT",
          `modal ${ir.screenId} declares a modal-card box (${card.bounds.width}x${card.bounds.height}) but the asset manifest declares no cardSize — the reference cannot be normalized against the same number`,
          { screenId: ir.screenId, path: "artifacts/figma/assets-manifest.json" },
        ),
      );
      continue;
    }
    if (
      Math.abs(card.bounds.width - decl.width) > 1 ||
      Math.abs(card.bounds.height - decl.height) > 1
    ) {
      failures.push(
        fail(
          "GATE_IMPL_CARD_SSOT",
          `modal ${ir.screenId} card size disagrees: ir=${card.bounds.width}x${card.bounds.height} manifest=${decl.width}x${decl.height}`,
          { screenId: ir.screenId, path: "artifacts/ir/layout" },
        ),
      );
    }
  }
  if (checked) notes.push(`modal-card SSOT: ${checked} card(s) cross-checked against the manifest`);
}

/** Literals the page re-types instead of reading from the IR. */
function hardcodeHits(webDir) {
  const files = walkSource(join(webDir, "src"));
  const colorHits = [];
  const fallbackHits = [];
  const HEX = /#[0-9a-fA-F]{6}\b/g;
  const FALLBACK = /(?:\?\?|\|\|)\s*-?\d+(?:\.\d+)?\b/;
  const IR_ACCESS = /\b(bounds|cornerRadius|metrics|irBounds|controlsByRole|controlByRole|textNodeAt|tableMetrics)\b/;
  for (const abs of files) {
    const text = readFileSync(abs, "utf8");
    // A file generated from the IR is where design values are supposed to live.
    if (GENERATED_MARKER.test(text) || /[\\/]generated[\\/]/.test(abs)) continue;
    const rel = abs.slice(repoRoot().length + 1).replace(/\\/g, "/");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      HEX.lastIndex = 0;
      let m;
      while ((m = HEX.exec(line))) {
        colorHits.push({ file: rel, line: i + 1, literal: m[0].toLowerCase() });
      }
      if (FALLBACK.test(line) && IR_ACCESS.test(line)) {
        const fm = line.match(FALLBACK);
        fallbackHits.push({ file: rel, line: i + 1, literal: fm[0].replace(/\s+/g, "") });
      }
    });
  }
  return { colorHits, fallbackHits, scannedFiles: files.length };
}

export function runImplLeg(capture) {
  const failures = [];
  const notes = [];
  const spec = readAppSpec();
  const webDir = join(repoRoot(), spec.output.webDir);
  const baseline = loadImplBaseline();

  const { colorHits, fallbackHits, scannedFiles } = hardcodeHits(webDir);
  const report = (hits, code, kind) => {
    const fresh = [];
    for (const h of hits) {
      const key = `${code}|${h.file}|${h.literal}`;
      if (baseline.keys.has(key)) continue;
      fresh.push(h);
    }
    if (fresh.length) {
      failures.push(
        fail(
          code,
          `${fresh.length} ${kind} literal(s) not covered by the baseline: ${fresh
            .slice(0, 6)
            .map((h) => `${h.file}:${h.line} ${h.literal}`)
            .join(", ")}`,
          {
            path: IMPL_BASELINE_REL,
            evidence: `${fresh.length} new / ${hits.length} total`,
          },
        ),
      );
    }
    return fresh.length;
  };
  const newColors = report(colorHits, "GATE_IMPL_HARDCODED", "colour");
  const newFallbacks = report(fallbackHits, "GATE_IMPL_IR_FALLBACK", "IR-geometry fallback");
  notes.push(
    `hardcode scan: ${scannedFiles} source files, ${colorHits.length} colour literals (${newColors} new), ${fallbackHits.length} IR fallbacks (${newFallbacks} new), baseline entries=${baseline.entries.length}`,
  );

  // Modal card size SSOT: IR ↔ asset manifest (the DOM side is asserted by the
  // pixel/geom legs).
  checkModalCardSsot(failures, notes);

  // Mask integrity: the page declares its own live regions, so the mask itself
  // has to be constrained or it becomes a way to stop being scored.
  if (capture?.screens?.length) {
    const facts = collectIrFacts();
    const chrome = chromeBoxes();
    for (const screen of capture.screens) {
      const regions = liveRegionsOf(screen);
      if (!regions.length) continue;
      const ir = facts[screen.screenId];
      if (!ir) continue;
      const isModal = screen.type === "modal";
      for (const r of regions) {
        if (!(r.w > 0 && r.h > 0)) {
          failures.push(
            fail("GATE_IMPL_MASK_ON_CHROME", `live region "${r.key}" has no area`, {
              screenId: screen.screenId,
            }),
          );
          continue;
        }
        for (const c of ir.geomControls) {
          if (inter(r, c.bounds)) {
            failures.push(
              fail(
                "GATE_IMPL_MASK_ON_CONTROL",
                `live region "${r.key}" covers IR control role=${c.role} — a control must stay scoreable`,
                { screenId: screen.screenId },
              ),
            );
            break;
          }
        }
        if (isModal) {
          if (ir.card && !inside(r, ir.card.bounds)) {
            failures.push(
              fail(
                "GATE_IMPL_MASK_OUTSIDE_CARD",
                `live region "${r.key}" is not inside the modal card box`,
                { screenId: screen.screenId },
              ),
            );
          }
        } else {
          // A list screen's card is its panel: live *content* may be masked,
          // but it must stay inside the card that owns it. A mask that reaches
          // past the panel is masking a region the prototype drew — typically
          // because the real content overflowed and the mask was widened to
          // cover the spill instead of the layout being fixed.
          if (ir.panel && !inside(r, ir.panel.bounds)) {
            failures.push(
              fail(
                "GATE_IMPL_MASK_OUTSIDE_CARD",
                `live region "${r.key}" is not inside the screen panel box — a mask may cover live content, not the layout around it`,
                { screenId: screen.screenId },
              ),
            );
          }
          for (const cb of chrome) {
            if (inter(r, cb)) {
              failures.push(
                fail(
                  "GATE_IMPL_MASK_ON_CHROME",
                  `live region "${r.key}" reaches into chrome "${cb.key}" — chrome is static and must stay scored`,
                  { screenId: screen.screenId },
                ),
              );
              break;
            }
          }
          // A cell is IR-declared chrome. A mask that *contains* one hides the
          // grid's own geometry and paint from every leg, which is how a
          // calendar rendered flat white at three times its IR row height was
          // able to report PASS. Masks may sit inside a cell (they cover live
          // chip values), never over one.
          for (const cell of ir.nonSampleCells) {
            // inside(a, b) reads "a is inside b"; a mask may sit inside a cell,
            // so the failing shape is a cell inside the mask.
            if (inside(cell.bounds, r)) {
              failures.push(
                fail(
                  "GATE_IMPL_MASK_ON_CELL",
                  `live region "${r.key}" contains the IR cell role=${cell.role} (${cell.nodeId}) — a mask may cover live values inside a cell, not the cell box itself`,
                  { screenId: screen.screenId },
                ),
              );
              break;
            }
          }
        }
      }
    }
  }
  return legResult(failures, notes);
}

/* ---------------------------------- CLI ---------------------------------
 * The hardcode baseline is a reviewable artifact, so generating it is a
 * command rather than a hand edit:
 *
 *   node scripts/gate-legs.mjs --impl-hits                 # what would fail
 *   node scripts/gate-legs.mjs --impl-baseline --reason ""<why it must stay>" # record the debt
 *
 * Every baseline entry carries the reason it was accepted, and a *new* hit
 * outside the baseline fails the impl leg.
 * ---------------------------------------------------------------------- */

function writeImplBaseline(reasons) {
  if (!reasons.hardcode || !reasons.fallback) {
    console.error("--impl-baseline requires --reason-hardcode <text> --reason-fallback <text>");
    process.exit(2);
  }
  const spec = readAppSpec();
  const webDir = join(repoRoot(), spec.output.webDir);
  const { colorHits, fallbackHits, scannedFiles } = hardcodeHits(webDir);
  const entries = [
    ...colorHits.map((h) => ({
      code: "GATE_IMPL_HARDCODED",
      file: h.file,
      line: h.line,
      literal: h.literal,
      reason: reasons.hardcode,
    })),
    ...fallbackHits.map((h) => ({
      code: "GATE_IMPL_IR_FALLBACK",
      file: h.file,
      line: h.line,
      literal: h.literal,
      reason: reasons.fallback,
    })),
  ];
  const out = {
    schemaVersion: 1,
    note:
      "Known implementation debt: literals that re-type IR values or fall back to an invented number when an IR node is absent. GATE_IMPL_* fails on any hit that is not listed here, so this file is a record of debt — not an approval of it.",
    generatedAt: new Date().toISOString(),
    scannedFiles,
    entries,
  };
  writeJson(join(repoRoot(), IMPL_BASELINE_REL), out);
  console.log(
    JSON.stringify({
      ok: true,
      entries: entries.length,
      hardcode: colorHits.length,
      fallback: fallbackHits.length,
      path: IMPL_BASELINE_REL,
    }),
  );
}

function flagValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  if (process.argv.includes("--impl-hits")) {
    const spec = readAppSpec();
    const r = hardcodeHits(join(repoRoot(), spec.output.webDir));
    console.log(JSON.stringify(r, null, 2));
  } else if (process.argv.includes("--impl-baseline")) {
    writeImplBaseline({
      hardcode: flagValue("--reason-hardcode"),
      fallback: flagValue("--reason-fallback"),
    });
  } else {
    console.error(
      "usage: gate-legs.mjs --impl-hits | --impl-baseline --reason-hardcode <text> --reason-fallback <text>",
    );
    process.exit(2);
  }
}
