#!/usr/bin/env node
/**
 * Layout IR icon slots �?enumerate / resolve / check / sync.
 *
 * The icons[] list used to be a schema-required but unconsumed field that only
 * carried { nodeId, exportable }: it could not say *which* icon, *where*, or in
 * *what colour*, so every consumer silently skipped it and no gate leg noticed.
 * This tool makes the slot list complete and machine-checkable, and mirrors the
 * IR into the webDir generated folder in one step (replacing ad-hoc copies).
 *
 *   node scripts/ir-icons.mjs            # check (exit 1 on contract problems)
 *   node scripts/ir-icons.mjs --list     # inspect enumerated slots
 *   node scripts/ir-icons.mjs --write    # backfill icons[] + mirror to webDir
 *   node scripts/ir-icons.mjs --sync     # only mirror artifacts → webDir generated
 *
 * Contract + role table: see .cursor/skills/layout-ir-extract.
 * Symbol names that the IR tree cannot supply live in the overrides file
 * (artifacts/ir/icon-symbols.json) �?design data belongs in artifacts/ir, never
 * in this script or in a skill.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot, readJson } from "./lib/pipeline.mjs";

const ROOT = repoRoot();
const IR_DIR = join(ROOT, "artifacts/ir/layout");
const OVERRIDES_REL = "artifacts/ir/icon-symbols.json";

const spec = readJson("artifacts/app-spec/app-spec.json");
const GENERATED_DIR = join(ROOT, spec.output.webDir, "src/generated/layout");

/**
 * Icon slot roles. These are *presentational* categories, deliberately disjoint
 * from the controls[] geom role table: an icon slot is never an input/button.
 */
const ICON_ROLES = new Set(["brand-mark", "nav-item", "leading", "trailing", "standalone"]);

/**
 * Figma auto-names that describe a *shape*, not a symbol. A slot whose node
 * name is one of these has NOT been resolved �?it must say so explicitly
 * instead of pretending "Vector" is an icon identity.
 */
const GENERIC_NODE_NAMES = new Set([
  "Vector", "Group", "Frame", "Rectangle", "RoundedRectangle", "Ellipse",
  "Oval", "Line", "Polygon", "Star", "Path", "Shape", "Union", "Subtract",
  "Intersect", "Exclude", "Boolean", "Component", "Instance", "Text", "Slice",
  "Image", "image", "img", "Mask", "Compound",
]);

/** Pattern-generic names: the node carries *a* name, but it does not identify
 * which glyph it is, so it counts as unresolved. */
const GENERIC_NAME_PATTERNS = [/^svg[-\s]?icon$/i, /^icon$/i, /^icon[-\s]?\d+$/i, /^shape\d*$/i];

function isSymbolName(name) {
  if (!name) return false;
  if (GENERIC_NODE_NAMES.has(name)) return false;
  if (GENERIC_NAME_PATTERNS.some((re) => re.test(name))) return false;
  return /^[A-Za-z][A-Za-z0-9_.-]*$/.test(name);
}

/** First painted colour in the node's own subtree (icon frames wrap a vector). */
function colorOf(node) {
  const own = (n) => {
    const fill = (n?.fills || []).find((f) => f && f.color);
    if (fill) return fill.color;
    const stroke = (n?.strokes || []).find((s) => s && s.color);
    return stroke ? stroke.color : undefined;
  };
  const direct = own(node);
  if (direct) return direct;
  for (const c of node?.children || []) {
    const nested = colorOf(c);
    if (nested) return nested;
  }
  return undefined;
}

function walk(node, parents, out) {
  out.push({ node, parents });
  for (const c of node.children || []) walk(c, [...parents, node], out);
  return out;
}

function descendantsIncludeNamed(node, name) {
  for (const c of node.children || []) {
    if (c.name === name) return true;
    if (descendantsIncludeNamed(c, name)) return true;
  }
  return false;
}

/** Enumerate every visible icon slot in one screen's IR tree. */
export function enumerateSlots(ir) {
  const all = walk(ir.tree, [], []);
  const texts = all.filter((e) => e.node.type === "TEXT");
  const slots = [];
  const rootIds = new Set([ir.tree.id]);

  const isInPlot = (parents) => parents.some((p) => p.name === "plot");
  const chartLike = (node) =>
    node.type === "INSTANCE" && descendantsIncludeNamed(node, "plot");
  /** A node pasted straight onto the frame root (flattened glyph). */
  const isFrameRootChild = (parents) =>
    parents.length === 1 && rootIds.has(parents[0].id);

  for (const entry of all) {
    const { node, parents } = entry;
    if (isInPlot(parents)) continue;

    let resolvedBy = null;
    if (node.type === "FRAME" && isSymbolName(node.name)) resolvedBy = "figma-name";
    else if (
      // Generic icon wrapper (`svg-icon` & friends): a real visible slot whose
      // identity must still be recovered, so keep it and mark it unresolved.
      node.type === "FRAME" &&
      /icon/i.test(node.name || "") &&
      (node.children || []).length > 0
    )
      resolvedBy = "glyph-candidate";
    else if (
      node.type === "VECTOR" &&
      (isFrameRootChild(parents) || chartLike(parents[parents.length - 1]))
    )
      resolvedBy = "glyph-candidate";
    if (!resolvedBy) continue;

    const b = node.bounds;
    if (!b) continue;
    if (b.width > 40 || b.height > 40) continue;

    slots.push({ node, parents, resolvedBy, bounds: b, color: colorOf(node) });
  }

  // A named component frame and its flattened glyph can sit on top of each
  // other (the designer pasted the vector next to the instance). Keep one slot,
  // preferring the one that carries a symbol name.
  const deduped = [];
  for (const slot of slots.slice().sort((a, z) => (a.resolvedBy === "figma-name" ? -1 : 1))) {
    const cx = slot.bounds.x + slot.bounds.width / 2;
    const cy = slot.bounds.y + slot.bounds.height / 2;
    const twin = deduped.find((d) => {
      const dx = d.bounds.x + d.bounds.width / 2;
      const dy = d.bounds.y + d.bounds.height / 2;
      return Math.abs(cx - dx) < 6 && Math.abs(cy - dy) < 6;
    });
    if (!twin) deduped.push(slot);
    // A named component frame often carries no paint itself; the flattened
    // glyph beside it does. Merge so the slot still knows its colour.
    else if (!twin.color && slot.color) twin.color = slot.color;
  }

  // Sidebar / brand slots are the ones under a shell-sidebar subtree.
  const inSidebar = (parents) => parents.some((p) => /sidebar/i.test(p.name || ""));
  const sidebar = deduped.filter((s) => inSidebar(s.parents));
  sidebar.sort((a, z) => a.bounds.y - z.bounds.y);

  for (const slot of deduped) {
    const b = slot.bounds;
    const cy = b.y + b.height / 2;
    const right = b.x + b.width;

    slot.sidebar = inSidebar(slot.parents);
    // Neighbour text on either side, same band.
    const band = texts
      .filter((t) => {
        const tb = t.node.bounds;
        return tb && Math.abs(tb.y + tb.height / 2 - cy) < 14;
      })
      .map((t) => t.node);
    slot.leadingText = band
      .filter((t) => t.bounds.x >= right - 2 && t.bounds.x - right < 26 && t.bounds.width > b.width)
      .sort((a, z) => a.bounds.x - z.bounds.x)[0];
    slot.trailingText = band
      .filter((t) => t.bounds.x + t.bounds.width <= b.x + 2 && b.x - (t.bounds.x + t.bounds.width) < 26)
      .sort((a, z) => z.bounds.x - a.bounds.x)[0];

    let role;
    if (slot.sidebar) {
      role =
        sidebar.length && slot.node.id === sidebar[0].node.id ? "brand-mark" : "nav-item";
    } else if (slot.leadingText) {
      role = "leading";
    } else if (slot.trailingText) {
      role = "trailing";
    } else {
      role = "standalone";
    }
    slot.role = role;
    slot.textNear = slot.leadingText || slot.trailingText;
  }

  deduped.sort((a, z) => a.bounds.y - z.bounds.y || a.bounds.x - z.bounds.x);
  return deduped;
}

function loadOverrides() {
  const p = join(ROOT, OVERRIDES_REL);
  if (!existsSync(p)) return new Map();
  const j = JSON.parse(readFileSync(p, "utf8"));
  const m = new Map();
  for (const o of j.overrides || []) m.set(`${o.screenId}\u0000${o.nodeId}`, o);
  return m;
}

function buildIcons(ir, overrides) {
  const slots = enumerateSlots(ir);
  return slots.map((slot) => {
    const o = overrides.get(`${ir.screenId}\u0000${slot.node.id}`);
    const previous = (ir.icons || []).find((i) => i.nodeId === slot.node.id);
    const exportable = Boolean(previous?.exportable || slot.node.exportable);

    let source;
    let name;
    if (o) {
      source = o.source || "glyph-match";
      name = o.name;
    } else if (slot.resolvedBy === "figma-name") {
      source = "figma-name";
      name = slot.node.name;
    } else {
      source = "unresolved";
    }

    const entry = {
      nodeId: slot.node.id,
      exportable,
      bounds: {
        x: slot.bounds.x,
        y: slot.bounds.y,
        width: slot.bounds.width,
        height: slot.bounds.height,
      },
    };
    if (slot.color) entry.color = slot.color;
    entry.symbol = { source, role: slot.role };
    if (name) entry.symbol.name = name;
    return entry;
  });
}

function checkOne(ir, icons) {
  const problems = [];
  const warnings = [];
  const slots = enumerateSlots(ir);
  const slotIds = new Set(slots.map((s) => s.node.id));
  const iconIds = new Set(icons.map((i) => i.nodeId));

  for (const id of slotIds) {
    if (!iconIds.has(id)) problems.push(`${ir.screenId}: visible icon slot missing from icons[] (${id})`);
  }
  for (const i of icons) {
    if (!slotIds.has(i.nodeId)) {
      problems.push(`${ir.screenId}: icons[] entry is not an icon slot in tree (${i.nodeId})`);
    }
    if (!i.bounds) problems.push(`${ir.screenId}: icons[] entry has no bounds (${i.nodeId})`);
    if (!i.symbol) problems.push(`${ir.screenId}: icons[] entry has no symbol (${i.nodeId})`);
    const s = i.symbol || {};
    // Unresolved slots are allowed to exist (Figma may never have named the
    // glyph) but they must be explicit: gate-icon turns them into a FAIL code
    // rather than letting an empty slot pass unnoticed.
    if (s.source === "unresolved") warnings.push(`${ir.screenId}: unresolved symbol (${i.nodeId})`);
    if (s.source === "figma-name" && !isSymbolName(s.name)) {
      problems.push(`${ir.screenId}: symbol name is a Figma placeholder, not a symbol (${i.nodeId})`);
    }
    if (!ICON_ROLES.has(s.role)) {
      problems.push(`${ir.screenId}: icon role "${s.role}" is not in the role table (${i.nodeId})`);
    }
  }
  return { problems, warnings };
}

function screens() {
  if (!existsSync(IR_DIR)) return [];
  return readdirSync(IR_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

/** Mirror artifacts/ir/layout → webDir generated/layout after a safety check. */
function syncMirror() {
  if (!existsSync(GENERATED_DIR)) {
    console.error(JSON.stringify({ ok: false, error: `missing dir ${GENERATED_DIR}` }));
    process.exit(1);
  }
  const problems = [];
  const collect = (n, set) => {
    if (!n) return;
    set.add(n.id);
    for (const c of n.children || []) collect(c, set);
  };
  for (const screenId of screens()) {
    const src = join(IR_DIR, `${screenId}.json`);
    const dst = join(GENERATED_DIR, `${screenId}.json`);
    if (!existsSync(dst)) {
      problems.push(`${screenId}: generated mirror missing — refusing to write it blind`);
      continue;
    }
    const a = JSON.parse(readFileSync(src, "utf8"));
    const g = JSON.parse(readFileSync(dst, "utf8"));
    const gIds = new Set();
    collect(g.tree, gIds);
    const aIds = new Set();
    collect(a.tree, aIds);
    for (const id of aIds) {
      if (!gIds.has(id)) problems.push(`${screenId}: tree node ${id} only in artifact`);
    }
    writeFileSync(dst, readFileSync(src, "utf8"));
  }
  if (problems.length) {
    console.error(JSON.stringify({ ok: false, problems }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, mirrored: screens().length, to: GENERATED_DIR }));
}

function main() {
  const mode = process.argv.includes("--list")
    ? "list"
    : process.argv.includes("--write")
      ? "write"
      : process.argv.includes("--sync")
        ? "sync"
        : "check";
  if (mode === "sync") {
    syncMirror();
    return;
  }
  const overrides = loadOverrides();
  const problems = [];
  const warnings = [];

  for (const screenId of screens()) {
    const ir = JSON.parse(readFileSync(join(IR_DIR, `${screenId}.json`), "utf8"));
    const icons = buildIcons(ir, overrides);

    if (mode === "list") {
      console.log(`\n=== ${screenId} (${icons.length} slots)`);
      for (const s of icons) {
        const t = s.symbol.name ? s.symbol.name : "-";
        console.log(
          `  ${String(s.symbol.role).padEnd(11)} ${String(s.symbol.source).padEnd(14)} ` +
            `${String(t).padEnd(26)} ${JSON.stringify(s.bounds)} color=${s.color ?? "-"}`,
        );
      }
      console.log(`  old=${(ir.icons || []).length} new=${icons.length}`);
      continue;
    }

    const r = checkOne(ir, icons);
    problems.push(...r.problems);
    warnings.push(...r.warnings);

    if (mode === "write") {
      const next = { ...ir, icons };
      writeFileSync(join(IR_DIR, `${screenId}.json`), JSON.stringify(next, null, 2) + "\n", "utf8");
      if (existsSync(GENERATED_DIR)) {
        writeFileSync(
          join(GENERATED_DIR, `${screenId}.json`),
          JSON.stringify(next, null, 2) + "\n",
          "utf8",
        );
      }
    }
  }

  if (mode === "list") return;

  if (mode === "write") {
    console.log(`ir_icons_written screens=${screens().length}`);
    if (existsSync(GENERATED_DIR)) console.log(`mirrored_to=${GENERATED_DIR}`);
    if (warnings.length) {
      console.log(`open_slots=${warnings.length}`);
      for (const w of warnings) console.log(`  ${w}`);
    }
    if (problems.length) {
      console.error(JSON.stringify({ ok: false, problems }, null, 2));
      process.exit(1);
    }
    return;
  }

  if (problems.length) {
    console.error(JSON.stringify({ ok: false, problems }, null, 2));
    process.exit(1);
  }
  console.log(
    JSON.stringify({ ok: true, screens: screens().length, openSlots: warnings.length }),
  );
}

main();
