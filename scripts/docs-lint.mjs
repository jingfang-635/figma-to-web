#!/usr/bin/env node
/**
 * Zero-hardcode lint.
 *
 * Two scopes, two standards — deliberately different:
 *
 *  - `.cursor/agents` + `.cursor/skills`: the whole file is instruction, so the
 *    pattern blacklist applies verbatim. A hex inside a fenced example is still
 *    a design value someone will copy.
 *  - `docs/`: prose that *states these very rules* has to be able to quote them
 *    ("matches `#RGB` / `rgb(` …"), so inline code spans are stripped before
 *    matching. Fenced blocks are NOT exempt — only what a sentence names inside
 *    backticks.
 *
 * The spec cross-check (no business leaf leaking into instructions) stays
 * scoped to `.cursor` only; docs legitimately discuss screen names as prose.
 *
 * Third rule: every authored text file must be valid UTF-8. This repo is
 * Chinese-prose heavy and gets round-tripped through PowerShell, whose
 * `Get-Content`/`Set-Content` default to the system code page: a multi-byte
 * character's tail byte pairs with the following ASCII byte, the pair is
 * undecodable, and the write-back replaces both with `?` — silently eating a
 * neighbouring space, `$`, or newline. That has broken a page and a leg file
 * before, and the damage is invisible in a diff, so it is checked rather than
 * trusted.
 *
 * FAIL-code roster consistency is *not* here — see `scripts/consistency.mjs`.
 * It used to keep a hand-maintained list in this file, which nothing consumed:
 * the set was only read by the cross-check below, so registering a code there
 * had no effect at all.
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

/** Structural names the instructions are allowed to spell out. */
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
  return set;
}

const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RGB = /\brgba?\s*\(/gi;
const PASSWORD_ASSIGN = /\b(password|passwd|secret)\s*[:=]\s*['"][^'"]+['"]/gi;
const WINDOWS_ABS = /\b[A-Za-z]:\\(?:Users|home)\\[^\s`'"]+/g;

/** Drop inline code spans so prose can quote a pattern without tripping it. */
function stripInlineCode(text) {
  return text.replace(/`[^`\n]*`/g, "");
}

/**
 * Authored text, not build output. The gate reports are included because agents
 * read them straight back, and the app sources because the last encoding
 * incident landed in a page.
 */
const TEXT_EXT = /\.(md|mdc|json|mjs|cjs|ts|tsx|css|html|ya?ml|xml|svg|txt)$/i;
const SKIP_DIR = /(node_modules|[\\/]dist[\\/]|[\\/]target[\\/]|[\\/]\.git[\\/]|[\\/]coverage[\\/])/;

function walkText(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP_DIR.test(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walkText(p, acc);
    else if (TEXT_EXT.test(name)) acc.push(p);
  }
  return acc;
}

/** Rule: the bytes must be valid UTF-8 (no lossy ?/U+FFFD substitutions). */
function checkEncoding(file) {
  const buf = readFileSync(file);
  const text = buf.toString("utf8");
  if (Buffer.from(text, "utf8").equals(buf)) return;
  const at = text.indexOf("\uFFFD");
  const count = (text.match(/\uFFFD/g) || []).length;
  failures.push({
    file: relative(root, file),
    rule: "invalid-utf8",
    match:
      count +
      " undecodable byte sequence(s), first near line " +
      text.slice(0, at).split("\n").length +
      " - re-encode as UTF-8; a PowerShell Get-Content/Set-Content round-trip does this and eats the neighbouring character",
  });
}

function scanPatterns(file, text) {
  const rel = relative(root, file);
  for (const re of [HEX, RGB, PASSWORD_ASSIGN, WINDOWS_ABS]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
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
const strict = [
  ...walk(join(root, ".cursor/agents")),
  ...walk(join(root, ".cursor/skills")),
];
const prose = walk(join(root, "docs"));

for (const file of strict) {
  scanPatterns(file, readFileSync(file, "utf8"));
}
for (const file of prose) {
  scanPatterns(file, stripInlineCode(readFileSync(file, "utf8")));
}

const encoded = [
  ...new Set([
    ...strict,
    ...prose,
    ...walkText(join(root, "scripts")),
    ...walkText(join(root, "schemas")),
    ...walkText(join(root, ".cursor")),
    ...walkText(join(root, "artifacts")),
    ...walkText(join(root, "apps/web/src")),
    ...walkText(join(root, "apps/api/src")),
    join(root, "package.json"),
  ]),
].filter((f) => existsSync(f));
for (const file of encoded) checkEncoding(file);

const specPath = join(root, "artifacts/app-spec/app-spec.json");
if (existsSync(specPath)) {
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const leaves = businessLeaves(spec);
  for (const file of strict) {
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
  JSON.stringify({
    ok: true,
    scanned: { strict: strict.length, prose: prose.length, encoding: encoded.length },
    crossCheck: existsSync(specPath),
  }),
);
