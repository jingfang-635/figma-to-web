#!/usr/bin/env node
/**
 * Zero-hardcode lint for .cursor/agents and .cursor/skills.
 * 1) Pattern blacklist (hex/rgb/password-like)
 * 2) Optional cross-check against app-spec business leaves
 * Tool enums from stack-matrix are allowlisted.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot, loadStackMatrix } from "./lib/pipeline.mjs";

const root = repoRoot();
const failures = [];

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(md|mdc)$/i.test(name)) acc.push(p);
  }
  return acc;
}

function collectAllowlist() {
  const set = new Set();
  const matrix = loadStackMatrix();
  for (const row of matrix.rows) {
    set.add(row.id);
    set.add(row.language);
    set.add(row.frontend);
    set.add(row.backend);
    set.add(row.database);
    set.add(row.orm);
    for (const u of row.ui) set.add(u);
  }
  for (const [k, arr] of Object.entries(matrix.enums || {})) {
    set.add(k);
    for (const v of arr) set.add(v);
  }
  const phases = [
    "DECISION",
    "INGEST",
    "SPEC",
    "IR",
    "CODEGEN",
    "FIDELITY",
    "GATE",
    "REPAIR",
    "DONE",
    "STOPPED",
  ];
  for (const p of phases) set.add(p);
  const structural = [
    "artifacts",
    "apps",
    "output",
    "webDir",
    "apiDir",
    "schemaVersion",
    "seedAdmin",
    "storageKey",
    "fileKey",
    "FIGMA_ACCESS_TOKEN",
    "WEB_URL",
    "API_URL",
    "POSTGRES_URL",
    "MYSQL_URL",
    "MYSQL_JDBC_URL",
    "JWT_SECRET",
    "GATE_USER",
    "GATE_PASS",
    "placeholder",
  ];
  for (const s of structural) set.add(s);
  // FAIL codes from design
  const failCodes = [
    "RUNTIME_NOT_UP",
    "RUNTIME_PORT_BUSY",
    "GATE_CAPTURE_MISSING",
    "GATE_PIXEL_SIZE",
    "GATE_PIXEL_DIFF",
    "GATE_PIXEL_FLAT_BG",
    "GATE_GEOM_CONTROL",
    "GATE_GEOM_MODAL",
    "GATE_TEXT_CONTENT",
    "GATE_TEXT_STYLE",
    "GATE_DATA_LOOP",
    "GATE_DATA_LIVE",
    "GATE_DATA_STATS_GAP",
    "FIDELITY_CHART_UNSUPPORTED",
    "CODEGEN_BUILD_FAIL",
    "INGEST_FIGMA_RATE_LIMIT",
    "IR_SCREEN_MISSING",
    "SPEC_NEEDS_REVIEW",
    "AUTH_SEED_MISSING",
    "MAX_ROUNDS",
  ];
  for (const c of failCodes) set.add(c);
  return set;
}

const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RGB = /\brgba?\s*\(/gi;
const PASSWORD_ASSIGN = /\b(password|passwd|secret)\s*[:=]\s*['"][^'"]+['"]/gi;
const WINDOWS_ABS = /\b[A-Za-z]:\\(?:Users|home)\\[^\s`'"]+/g;

function scanPatterns(file, text) {
  const rel = relative(root, file);
  for (const re of [HEX, RGB, PASSWORD_ASSIGN, WINDOWS_ABS]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      // allow in design doc only under docs/ — skills/agents must not
      failures.push({
        file: rel,
        rule: "pattern-blacklist",
        match: m[0].slice(0, 80),
      });
    }
  }
}

function businessLeaves(spec) {
  const leaves = new Set();
  for (const s of spec.screens || []) {
    if (s.name) leaves.add(s.name);
    if (s.route) leaves.add(s.route);
    if (s.id) leaves.add(s.id);
  }
  for (const e of spec.entities || []) {
    if (e.name) leaves.add(e.name);
    for (const f of e.fields || []) {
      if (f.name) leaves.add(f.name);
    }
  }
  if (spec.project?.slug) leaves.add(spec.project.slug);
  if (spec.project?.name) leaves.add(spec.project.name);
  return [...leaves].filter((x) => x && String(x).length >= 2);
}

const allow = collectAllowlist();
const targets = [
  ...walk(join(root, ".cursor/agents")),
  ...walk(join(root, ".cursor/skills")),
];

for (const file of targets) {
  const text = readFileSync(file, "utf8");
  scanPatterns(file, text);
}

const specPath = join(root, "artifacts/app-spec/app-spec.json");
if (existsSync(specPath)) {
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const leaves = businessLeaves(spec);
  for (const file of targets) {
    const text = readFileSync(file, "utf8");
    const rel = relative(root, file);
    for (const leaf of leaves) {
      if (allow.has(leaf)) continue;
      if (text.includes(leaf)) {
        failures.push({
          file: rel,
          rule: "spec-cross-check",
          match: leaf,
        });
      }
    }
  }
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}
console.log(
  JSON.stringify({ ok: true, scanned: targets.length, crossCheck: existsSync(specPath) })
);
