#!/usr/bin/env node
import { resolveStack, loadStackMatrix } from "./lib/pipeline.mjs";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const matrix = loadStackMatrix();

if (args.id && !args.language) {
  const row = matrix.rows.find((r) => r.id === args.id);
  if (!row) {
    console.error(JSON.stringify({ ok: false, error: `unknown stack id ${args.id}` }));
    process.exit(1);
  }
  if (!args.ui) {
    console.error(
      JSON.stringify({
        ok: false,
        error: `ui required when using --id; allow: ${row.ui.join(",")}`,
      })
    );
    process.exit(1);
  }
  const result = resolveStack({ ...row, ui: args.ui });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

const result = resolveStack({
  language: args.language,
  frontend: args.frontend,
  backend: args.backend,
  database: args.database,
  orm: args.orm,
  ui: args.ui,
});
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
