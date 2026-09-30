#!/usr/bin/env node
import { buildOutputPaths } from "./lib/pipeline.mjs";

const mode = process.argv[2];
const runId = process.argv[3];
const out = buildOutputPaths(mode, runId);
if (out.error) {
  console.error(JSON.stringify({ ok: false, error: out.error }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, output: out }, null, 2));
