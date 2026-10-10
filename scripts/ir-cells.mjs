#!/usr/bin/env node
/**
 * Layout IR cell boxes: enumerate / check / sync.
 *
 * `controls[]` only lists input-like chrome (a select, a button). `icons[]` only
 * lists glyphs. Everything a prototype draws as a *plain rectangle* (a calendar
 * grid frame, its weekday band, its day cells, colour swatches, a today badge, a
 * segmented-control track) belonged to neither list, so nothing consumed it and
 * no gate leg could see it. A calendar could render flat white at three times
 * its IR row height and every leg still passed.
 *
 * This tool enumerates those boxes into `cells[]`, classifies each by role, and
 * mirrors the IR into the webDir generated folder.
 *
 *   node scripts/ir-cells.mjs            # check
 *   node scripts/ir-cells.mjs --list     # inspect enumerated cells
 *   node scripts/ir-cells.mjs --write    # backfill cells[] + mirror to webDir
 *
 * Role table and contract: see .cursor/skills/layout-ir-extract.
 *
 * Classification is structural (no screen name, no pixel literal, no palette),
 * so it works on any frame that draws a grid:
 *
 *   frame          a stroked, rounded box inside the content panel that holds
 *                  the most other boxes: the grid outline (and its line colour,
 *                  since the 1px gaps show it through).
 *   grid-head      inside the frame, grouped into columns by x; the shortest
 *                  member of each column is the band above the grid body.
 *   grid-cell      the remaining members of those columns.
 *   legend-swatch  small square swatches elsewhere in the panel.
 *   badge          a circle-or-pill elsewhere in the panel (today marker).
 *   toggle-track   a rounded box that wraps another box (a segmented control);
 *                  the wrapper is chrome, the wrapped box is the sliding pill
 *                  and rides along as a sample.
 *
 * Boxes drawn *inside* a grid cell are live content (one chip per schedule row),
 * so they are recorded as `sample: true` and carry no gate assertion: the page
 * still reads their geometry, radius and paint off the IR, but how many rows a
 * cell has is a data question, not a fidelity question.
 *
 * Boxes in a panel that no role claims are reported as notes, not as failures:
 * a list screen draws its own row bands and separators, and refusing to write
 * its IR until someone models them would block the work rather than describe it.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot, readJson } from "./lib/pipeline.mjs";

const ROOT = repoRoot();
const IR_DIR = join(ROOT, "artifacts/ir/layout");
const spec = readJson("artifacts/app-spec/app-spec.json");
const GENERATED_DIR = join(ROOT, spec.output.webDir, "src/generated/layout");

const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

function walk(node, out = []) {
  if (!node) return out;
  out.push(node);
  for (const c of node.children || []) walk(c, out);
  return out;
}

const fillOf = (n) => (n.fills || []).find((f) => f.color)?.color;
const contains = (outer, inner) =>
  outer.x <= inner.x + 0.01 &&
  outer.y <= inner.y + 0.01 &&
  outer.x + outer.width >= inner.x + inner.width - 0.01 &&
  outer.y + outer.height >= inner.y + inner.height - 0.01;

/**
 * Classify every filled rectangle the prototype drew inside one screen's
 * content panel. Returns `{ cells, problems, notes }`; `cells` is `[]` for a
 * screen that draws no panel-level boxes (a modal, or a form-only page).
 */
export function classifyCells(ir) {
  const problems = [];
  const notes = [];
  const panel = (ir.controls || []).find((c) => c.role === "panel");
  if (!panel) return { cells: [], problems, notes };

  const controlIds = new Set((ir.controls || []).map((c) => c.nodeId));
  const iconIds = new Set((ir.icons || []).map((i) => i.nodeId));

  // Candidate boxes: filled rectangles inside the panel that are not already a
  // control (the panel itself, the selects, the buttons).
  const candidates = walk(ir.tree)
    .filter((n) => n.type === "RECTANGLE")
    .filter((n) => n.bounds && fillOf(n))
    .filter((n) => !controlIds.has(n.id) && !iconIds.has(n.id))
    .filter((n) => contains(panel.bounds, n.bounds));

  // frame: the stroked rounded box holding the most other boxes.
  const frame = candidates
    .filter((n) => (n.strokes || []).length > 0 && (n.cornerRadius || 0) >= 6)
    .map((n) => ({
      node: n,
      holds: candidates.filter((m) => m.id !== n.id && contains(n.bounds, m.bounds))
        .length,
    }))
    .filter((e) => e.holds >= 8)
    .sort((a, z) => z.holds - a.holds)[0]?.node;

  const cells = [];
  if (frame) {
    cells.push({
      nodeId: frame.id,
      role: "frame",
      bounds: frame.bounds,
      fill: fillOf(frame),
    });
  }

  const inFrame = frame
    ? candidates.filter((n) => n.id !== frame.id && contains(frame.bounds, n.bounds))
    : [];
  const taken = (id) => cells.some((c) => c.nodeId === id);

  // Column grouping: boxes that share an x and a width stack vertically. A
  // column only counts as a grid column when it has a band materially shorter
  // than its tallest member. Three identical chip rows inside one cell share x
  // and width too, and must not be mistaken for a column.
  const columns = new Map();
  for (const n of inFrame) {
    const key = `${round(n.bounds.x)}:${round(n.bounds.width)}`;
    if (!columns.has(key)) columns.set(key, []);
    columns.get(key).push(n);
  }
  const gridColumns = [...columns.values()].filter((col) => {
    if (col.length < 4) return false;
    const heights = col.map((n) => n.bounds.height);
    return (
      Math.max(...heights) >= 2 * Math.min(...heights) && Math.max(...heights) >= 60
    );
  });
  const columnIds = new Set(gridColumns.flat().map((n) => n.id));
  const headIds = new Set();

  for (const col of gridColumns) {
    const byHeight = [...col].sort((a, z) => a.bounds.height - z.bounds.height);
    const head = byHeight[0];
    headIds.add(head.id);
    cells.push({
      nodeId: head.id,
      role: "grid-head",
      bounds: head.bounds,
      fill: fillOf(head),
    });
    for (const cell of byHeight.filter((n) => n.id !== head.id)) {
      cells.push({
        nodeId: cell.id,
        role: "grid-cell",
        bounds: cell.bounds,
        fill: fillOf(cell),
      });
    }
  }

  const bodyCells = gridColumns.flat().filter((n) => !headIds.has(n.id));
  const hostOf = (b) =>
    bodyCells
      .filter((c) => contains(c.bounds, b))
      .sort((a, z) => a.bounds.height - z.bounds.height)[0];
  const isBadge = (n) =>
    (n.cornerRadius || 0) >= Math.min(n.bounds.width, n.bounds.height) / 2 &&
    n.bounds.width <= 32 &&
    n.bounds.height <= 32;

  /** A rounded box that wraps a narrower box is a segmented-control track. */
  const addTrack = (n) => {
    cells.push({ nodeId: n.id, role: "toggle-track", bounds: n.bounds, fill: fillOf(n) });
    const wraps = candidates.filter(
      (m) =>
        m.id !== n.id &&
        contains(n.bounds, m.bounds) &&
        m.bounds.width < n.bounds.width,
    );
    for (const w of wraps) {
      cells.push({
        nodeId: w.id,
        role: "toggle-pill",
        bounds: w.bounds,
        fill: fillOf(w),
        sample: true,
        hostNodeId: n.id,
      });
    }
  };
  const wrapsSomething = (n) =>
    candidates.some(
      (m) =>
        m.id !== n.id &&
        contains(n.bounds, m.bounds) &&
        m.bounds.width < n.bounds.width,
    );

  // Panel-level chrome inside the grid frame that is not a grid box.
  for (const n of inFrame) {
    if (taken(n.id) || columnIds.has(n.id)) continue;
    const b = n.bounds;
    const host = hostOf(b);
    if (isBadge(n)) {
      cells.push({ nodeId: n.id, role: "badge", bounds: b, fill: fillOf(n) });
    } else if (host) {
      // Live content inside a cell: one chip per schedule row. The chip's accent
      // is the paint of the text it wraps, which is the only place the IR
      // records which tint belongs to which legend colour.
      const accent = walk(n)
        .map((t) => (t.type === "TEXT" ? fillOf(t) : undefined))
        .find(Boolean);
      cells.push({
        nodeId: n.id,
        role: "grid-chip",
        bounds: b,
        fill: fillOf(n),
        sample: true,
        hostNodeId: host.id,
        ...(accent ? { accent } : {}),
      });
    } else if ((n.cornerRadius || 0) >= 4 && wrapsSomething(n)) {
      addTrack(n);
    } else {
      notes.push(
        `${ir.screenId}: box ${n.id} at ${round(b.x)},${round(b.y)} ${round(b.width)}x${round(b.height)} has no cell role`,
      );
    }
  }

  // Panel-level chrome outside the grid frame.
  const outside = candidates.filter(
    (n) => n.id !== frame?.id && !columnIds.has(n.id) && !hostOf(n.bounds),
  );
  for (const n of outside) {
    if (taken(n.id)) continue;
    const b = n.bounds;
    if (b.width <= 16 && b.height <= 16) {
      cells.push({ nodeId: n.id, role: "legend-swatch", bounds: b, fill: fillOf(n) });
    } else if (isBadge(n)) {
      cells.push({ nodeId: n.id, role: "badge", bounds: b, fill: fillOf(n) });
    } else if ((n.cornerRadius || 0) >= 4 && wrapsSomething(n)) {
      addTrack(n);
    } else {
      notes.push(
        `${ir.screenId}: box ${n.id} at ${round(b.x)},${round(b.y)} ${round(b.width)}x${round(b.height)} has no cell role`,
      );
    }
  }

  cells.sort(
    (a, z) =>
      a.role.localeCompare(z.role) ||
      a.bounds.y - z.bounds.y ||
      a.bounds.x - z.bounds.x,
  );
  return { cells, problems, notes };
}

/** A grid column whose every member is the same height cannot say which row is
 * the header band, so the layout is not a calibratable grid. */
function checkOne(ir, cells) {
  const problems = [];
  const heads = cells.filter((c) => c.role === "grid-head").length;
  const bodies = cells.filter((c) => c.role === "grid-cell").length;
  if (heads && bodies && bodies % heads !== 0) {
    problems.push(
      `${ir.screenId}: ${heads} header band(s) with ${bodies} day cell(s) does not divide evenly`,
    );
  }
  return problems;
}

function screens() {
  if (!existsSync(IR_DIR)) return [];
  return readdirSync(IR_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

function main() {
  const mode = process.argv.includes("--list")
    ? "list"
    : process.argv.includes("--write")
      ? "write"
      : "check";
  const problems = [];
  const notes = [];
  let total = 0;

  for (const screenId of screens()) {
    const path = join(IR_DIR, `${screenId}.json`);
    const ir = JSON.parse(readFileSync(path, "utf8"));
    const result = classifyCells(ir);
    problems.push(...result.problems, ...checkOne(ir, result.cells));
    notes.push(...result.notes);
    total += result.cells.length;

    if (mode === "list") {
      console.log(
        `\n=== ${screenId} (${result.cells.length} cells, was ${(ir.cells || []).length})`,
      );
      for (const c of result.cells) {
        const b = c.bounds;
        console.log(
          `  ${String(c.role).padEnd(14)} ${String(c.nodeId).padEnd(12)} ` +
            `${`${round(b.x)},${round(b.y)}`.padEnd(14)} ` +
            `${`${round(b.width)}x${round(b.height)}`.padEnd(12)} ` +
            `fill=${c.fill ?? "-"}${c.sample ? " (sample)" : ""}` +
            `${c.accent ? ` accent=${c.accent}` : ""}`,
        );
      }
      continue;
    }

    if (mode === "write") {
      const out = JSON.stringify({ ...ir, cells: result.cells }, null, 2) + "\n";
      writeFileSync(path, out, "utf8");
      if (existsSync(GENERATED_DIR)) {
        writeFileSync(join(GENERATED_DIR, `${screenId}.json`), out, "utf8");
      }
    }
  }

  if (mode === "list") return;
  if (notes.length) {
    console.log(`unclassified boxes=${notes.length}`);
    for (const n of notes.slice(0, 10)) console.log(`  ${n}`);
  }
  if (problems.length) {
    console.error(JSON.stringify({ ok: false, problems }, null, 2));
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      ok: true,
      mode,
      screens: screens().length,
      cells: total,
      unclassified: notes.length,
      mirroredTo: existsSync(GENERATED_DIR) ? GENERATED_DIR : null,
    }),
  );
}

main();
