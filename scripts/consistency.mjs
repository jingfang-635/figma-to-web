#!/usr/bin/env node
/**
 * Structural consistency for the pipeline's own vocabulary.
 *
 * Why this exists: the loop that keeps producing incidents here is
 * "gate is all green but a whole dimension is unasserted". Adding the missing
 * leg is the fix — and adding a leg means introducing a FAIL code, a repair
 * route, and an owner. Those three used to be maintained by hand in four
 * places (code, a lint allowlist nobody read, the playbook, the skills), and
 * they had already drifted: codes existed in code+playbook that no skill ever
 * mentions, and the roster in `docs-lint.mjs` was inert dead weight.
 *
 * So: derive the roster from the single source of truth (the emitter), then
 * assert it landed where it can be acted on.
 *
 *   1. every code emitted by `fail("<CODE>", …)` in `scripts/**` must have a
 *      row in `docs/repair/fail-code-playbook.md`   → what to do about it
 *   2. … and must be mentioned in `.cursor/**`        → who is told to do it
 *   3. every skill directory must be registered in the design doc, and must be
 *      loaded by at least one agent
 *   4. every skill an agent declares under its "加载 Skill" section must exist
 *
 * Codes are emitted by `fail()`, so the roster cannot silently rot: delete a
 * leg's failure site and the entry becomes stale on the next run; add a leg and
 * forgetting its playbook row or its owner fails here.
 */
import fs from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "./lib/pipeline.mjs";

const root = repoRoot();
const rel = (p) => relative(root, p).replace(/\\/g, "/");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function walk(dir, filter, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, n.name);
    if (n.isDirectory()) walk(p, filter, acc);
    else if (filter(p)) acc.push(p);
  }
  return acc;
}

/**
 * Emitter sites. The impl leg emits through a helper rather than `fail()`, so
 * the roster has to know every shape a code can be born in — a code that only
 * exists via `report(hits, …)` is just as real, and missing it here would let a
 * code live in code with no playbook row and no owner while this check smiled.
 */
const EMITTERS = [
  /\bfail\(\s*"([A-Z][A-Z0-9_]+)"/g,
  /\breport\([^,)]+,\s*"([A-Z][A-Z0-9_]+)"/g,
  /\bcode:\s*"([A-Z][A-Z0-9_]+)"/g,
];

function emittedCodes() {
  const codes = new Set();
  const self = join(root, "scripts/consistency.mjs");
  for (const p of walk(join(root, "scripts"), (f) => f.endsWith(".mjs"))) {
    // This file names the emitter shapes in its own docs; scanning it would
    // invent a code out of the comment above.
    if (p === self) continue;
    const text = read(p);
    for (const re of EMITTERS) {
      for (const m of text.matchAll(re)) codes.add(m[1]);
    }
  }
  return codes;
}

function mentions(text, code) {
  return new RegExp(`\\b${code}\\b`).test(text);
}

const errors = [];
const notes = [];

const codes = [...emittedCodes()].sort();

const playbookPath = join(root, "docs/repair/fail-code-playbook.md");
const playbook = fs.existsSync(playbookPath) ? read(playbookPath) : "";
if (!playbook) errors.push({ rule: "playbook-missing", path: rel(playbookPath) });
const missingInPlaybook = codes.filter((c) => !mentions(playbook, c));

const cursorFiles = [
  ...walk(join(root, ".cursor/agents"), (f) => /\.md$/i.test(f)),
  ...walk(join(root, ".cursor/skills"), (f) => /\.(md|mdc)$/i.test(f)),
];
const cursorText = cursorFiles.map(read).join("\n");
const missingInSkills = codes.filter((c) => !mentions(cursorText, c));

for (const c of missingInPlaybook) {
  errors.push({ rule: "code-without-repair-route", code: c, path: rel(playbookPath) });
}
for (const c of missingInSkills) {
  errors.push({ rule: "code-without-owner", code: c, path: ".cursor/" });
}

// Reaching a screen with no IR is a design-level code that lives in the design
// doc rather than the emitter; keep it out of the "stale" noise below.
function documentedCodes() {
  const doc = read(join(root, "docs/figma_agent_skill_design.md"));
  return new Set([...doc.matchAll(/\b([A-Z][A-Z0-9_]{4,})\b/g)].map((m) => m[1]));
}
const documented = documentedCodes();
const staleInPlaybook = [...new Set([...playbook.matchAll(/\b([A-Z][A-Z0-9_]{4,})\b/g)].map((m) => m[1]))]
  .filter((c) => /_(?:NOT_UP|PORT_BUSY|MISSING|DIFF|SIZE|FLAT_BG|LIVE_MASK|CONTROL|MODAL|BOX|COLOR|UNRESOLVED|SCALED|STATIC|OVERFLOW|CONTENT|STYLE|LOOP|GAP|HARDCODED|FALLBACK|SSOT|CARD|CELL|ROLE|FILL|CHROME|OUTSIDE|NORMALIZED|UNSTABLE|RATE_LIMIT|BUILD_FAIL|REVIEW|UNSUPPORTED|ROUNDS|SHOT|API|WEB|ACCESS|DIR|STAMP)/.test(c))
  .filter((c) => !codes.includes(c) && c !== "GATE_VIEWPORT_FIT__");
if (staleInPlaybook.length) {
  notes.push({
    rule: "playbook-row-not-emitted",
    codes: staleInPlaybook.sort(),
    hint: "documented ahead of implementation, or left behind by a removed leg",
  });
}

// ---- skill roster ----------------------------------------------------------
const skillDirs = fs
  .readdirSync(join(root, ".cursor/skills"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const designDoc = read(join(root, "docs/figma_agent_skill_design.md"));
const unregistered = skillDirs.filter((s) => !designDoc.includes(s));

const agentFiles = walk(join(root, ".cursor/agents"), (f) => f.endsWith(".md"));
const declared = new Map(); // skill -> [agent]
const dangling = [];
for (const p of agentFiles) {
  const text = read(p);
  const hit = /^##\s*(?:允许)?加载\s*(?:的\s*)?Skill\s*$([\s\S]*?)(?=^##\s|\Z)/m.exec(text);
  if (!hit) continue;
  for (const line of hit[1].split("\n")) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (!bullet) continue;
    const tokens = [...bullet[1].matchAll(/`([a-z][a-z0-9-]+)`/g)].map((m) => m[1]);
    if (!tokens.length) continue;
    // A bullet names a skill first and may then mention other things in
    // passing (`viewport-fit` bullet also quotes the data-ir-fluid attribute).
    // So: the first token decides whether the bullet is a skill reference at
    // all, and every token that resolves counts as a reference.
    if (!skillDirs.includes(tokens[0])) {
      dangling.push({ agent: rel(p), skill: tokens[0] });
      continue;
    }
    for (const name of tokens) {
      if (!skillDirs.includes(name)) continue;
      if (!declared.has(name)) declared.set(name, []);
      if (!declared.get(name).includes(rel(p))) declared.get(name).push(rel(p));
    }
  }
}
const unreferenced = skillDirs.filter((s) => !declared.has(s));

for (const s of unregistered) {
  errors.push({ rule: "skill-not-registered", skill: s, path: "docs/figma_agent_skill_design.md" });
}
for (const s of unreferenced) {
  errors.push({ rule: "skill-loaded-by-no-agent", skill: s, path: ".cursor/agents/" });
}
for (const d of dangling) {
  errors.push({ rule: "agent-declares-missing-skill", ...d });
}

const report = {
  ok: errors.length === 0,
  emittedCodes: codes.length,
  failCodes: {
    missingInPlaybook,
    missingInSkills,
    alsoInDesignDoc: codes.filter((c) => documented.has(c)).length,
  },
  skills: {
    count: skillDirs.length,
    unregistered,
    unreferenced,
  },
  errors,
  notes,
};
console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);
