#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { repoRoot, resolveStack } from "./lib/pipeline.mjs";

const kind = process.argv[2];
const map = {
  decision: {
    schema: "schemas/decision.schema.json",
    file: "artifacts/decision/decision.json",
    extra: (data) => {
      const r = resolveStack(data.stack || {});
      if (!r.ok) return r.error;
      if (r.stack.id !== data.stack.id) return `stack.id mismatch: expected ${r.stack.id}`;
      return null;
    },
  },
  "pipeline-state": {
    schema: "schemas/pipeline-state.schema.json",
    file: "artifacts/pipeline-state.json",
  },
  "app-spec": {
    schema: "schemas/app-spec.schema.json",
    file: "artifacts/app-spec/app-spec.json",
    extra: (data) => {
      const r = resolveStack(data.stack || {});
      if (!r.ok) return r.error;
      if (data.auth?.mode === "jwt") {
        if (!data.auth.storageKey) return "auth.storageKey required when auth.mode=jwt";
        if (!data.seedAdmin?.username) return "seedAdmin.username required when auth.mode=jwt";
      }
      if (data.needsReview === true) return "needsReview must be false to leave SPEC";
      return null;
    },
  },
  "frame-manifest": {
    schema: "schemas/frame-manifest.schema.json",
    file: "artifacts/figma/frame-manifest.json",
  },
  "visual-ir": {
    schema: "schemas/visual-ir.schema.json",
    file: "artifacts/ir/visual-ir.json",
  },
  "layout-ir": {
    schema: "schemas/layout-ir.schema.json",
    // one file per screen: without an explicit path, validate every screen
    file: null,
    dir: "artifacts/ir/layout",
  },
  "fidelity-progress": {
    schema: "schemas/fidelity-progress.schema.json",
    file: "artifacts/ir/fidelity-progress.json",
  },
  "gate-report": {
    schema: "schemas/gate-report.schema.json",
    file: null,
  },
};

const entry = map[kind];
if (!entry) {
  console.error(`usage: validate-artifact.mjs <${Object.keys(map).join("|")}> [file]`);
  process.exit(2);
}

const fileArg = process.argv[3];
const schema = JSON.parse(readFileSync(join(repoRoot(), entry.schema), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
if (kind === "app-spec") {
  ajv.addSchema(
    JSON.parse(readFileSync(join(repoRoot(), "schemas/decision.schema.json"), "utf8"))
  );
}
const validate = ajv.compile(schema);

function runExtra(data) {
  if (!entry.extra) return null;
  return entry.extra(data);
}

/** Kinds stored as one file per screen (no entry.file): validate them all. */
if (!entry.file && !fileArg && entry.dir) {
  const dir = join(repoRoot(), entry.dir);
  if (!existsSync(dir)) {
    console.error(JSON.stringify({ ok: false, error: `missing dir ${dir}` }));
    process.exit(1);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const errors = [];
  for (const f of files) {
    const p = join(dir, f);
    const data = JSON.parse(readFileSync(p, "utf8"));
    if (!validate(data)) {
      errors.push({ file: f, errors: validate.errors });
      continue;
    }
    const err = runExtra(data);
    if (err) errors.push({ file: f, error: err });
  }
  if (errors.length) {
    console.error(JSON.stringify({ ok: false, errors }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, dir, files: files.length }));
  process.exit(0);
}

const filePath = join(repoRoot(), fileArg || entry.file);
if (!entry.file && !fileArg) {
  console.error("gate-report requires explicit file path");
  process.exit(2);
}
if (!existsSync(filePath)) {
  console.error(JSON.stringify({ ok: false, error: `missing file ${filePath}` }));
  process.exit(1);
}

const data = JSON.parse(readFileSync(filePath, "utf8"));
const ok = validate(data);
if (!ok) {
  console.error(JSON.stringify({ ok: false, errors: validate.errors }, null, 2));
  process.exit(1);
}
const extraErr = runExtra(data);
if (extraErr) {
  console.error(JSON.stringify({ ok: false, error: extraErr }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, file: filePath }));
