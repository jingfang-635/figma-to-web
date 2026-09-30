#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
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
const filePath = join(repoRoot(), fileArg || entry.file);
if (!entry.file && !fileArg) {
  console.error("gate-report requires explicit file path");
  process.exit(2);
}
if (!existsSync(filePath)) {
  console.error(JSON.stringify({ ok: false, error: `missing file ${filePath}` }));
  process.exit(1);
}

const schema = JSON.parse(readFileSync(join(repoRoot(), entry.schema), "utf8"));
const data = JSON.parse(readFileSync(filePath, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
if (kind === "app-spec") {
  ajv.addSchema(
    JSON.parse(readFileSync(join(repoRoot(), "schemas/decision.schema.json"), "utf8"))
  );
}
const validate = ajv.compile(schema);
const ok = validate(data);
if (!ok) {
  console.error(JSON.stringify({ ok: false, errors: validate.errors }, null, 2));
  process.exit(1);
}
if (entry.extra) {
  const err = entry.extra(data);
  if (err) {
    console.error(JSON.stringify({ ok: false, error: err }));
    process.exit(1);
  }
}
console.log(JSON.stringify({ ok: true, file: filePath }));
