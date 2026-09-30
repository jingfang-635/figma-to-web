#!/usr/bin/env node
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./lib/pipeline.mjs";

const cmd = process.argv[2] || "show";
const statePath = join(repoRoot(), "artifacts/pipeline-state.json");

const template = {
  schemaVersion: 1,
  phase: "DECISION",
  round: 0,
  maxRounds: 5,
  blocked: false,
  blockReason: null,
  lastError: null,
  history: [],
  completed: {
    DECISION: false,
    INGEST: false,
    SPEC: false,
    IR: false,
    CODEGEN: false,
    FIDELITY: false,
    GATE: false,
    DONE: false,
  },
  artifacts: {
    decision: "artifacts/decision/decision.json",
    appSpec: "artifacts/app-spec/app-spec.json",
    frameManifest: "artifacts/figma/frame-manifest.json",
    layoutIrDir: "artifacts/ir/layout",
    visualIr: "artifacts/ir/visual-ir.json",
    gateReport: null,
  },
};

if (cmd === "init") {
  mkdirSync(join(repoRoot(), "artifacts"), { recursive: true });
  if (existsSync(statePath) && process.argv[3] !== "--force") {
    console.log(JSON.stringify({ ok: true, skipped: true, file: statePath }));
    process.exit(0);
  }
  writeFileSync(statePath, JSON.stringify(template, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, file: statePath }));
  process.exit(0);
}

if (cmd === "show") {
  if (!existsSync(statePath)) {
    console.error(JSON.stringify({ ok: false, error: "missing pipeline-state" }));
    process.exit(1);
  }
  console.log(readFileSync(statePath, "utf8"));
  process.exit(0);
}

console.error("usage: pipeline-state.mjs init|show [--force]");
process.exit(2);
