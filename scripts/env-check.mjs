#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  repoRoot,
  requiredEnvKeys,
  checkEnvKeys,
} from "./lib/pipeline.mjs";

function loadDotEnv() {
  const p = join(repoRoot(), ".env");
  const env = { ...process.env };
  if (!existsSync(p)) return env;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (env[k] === undefined) env[k] = v;
  }
  return env;
}

const phase = process.argv[2] || "INGEST";
const decisionPath = join(repoRoot(), "artifacts/decision/decision.json");
const specPath = join(repoRoot(), "artifacts/app-spec/app-spec.json");

const ctx = {};
if (existsSync(decisionPath)) {
  const d = JSON.parse(readFileSync(decisionPath, "utf8"));
  ctx.database = d.stack?.database;
  ctx.authMode = d.auth?.mode;
}
if (existsSync(specPath)) {
  const s = JSON.parse(readFileSync(specPath, "utf8"));
  ctx.database = s.stack?.database ?? ctx.database;
  ctx.authMode = s.auth?.mode ?? ctx.authMode;
  ctx.hasSeedAdmin = Boolean(s.seedAdmin?.username);
}

const keys = requiredEnvKeys(phase, ctx);
const result = checkEnvKeys(keys, loadDotEnv());
const payload = {
  ok: result.ok,
  phase,
  missingKeys: result.missingKeys,
  checkedKeys: keys,
};
console.log(JSON.stringify(payload, null, 2));
process.exit(result.ok ? 0 : 1);
