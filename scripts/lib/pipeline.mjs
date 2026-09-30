import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

export function repoRoot() {
  return root;
}

export function readJson(relPath) {
  const full = join(root, relPath);
  return JSON.parse(readFileSync(full, "utf8"));
}

export function loadStackMatrix() {
  return readJson("config/stack-matrix.json");
}

/**
 * Resolve stack id from five core dims; validate ui against row allowlist.
 * @returns {{ ok: true, stack: object } | { ok: false, error: string }}
 */
export function resolveStack(partial) {
  const matrix = loadStackMatrix();
  const { language, frontend, backend, database, orm, ui } = partial;
  const row = matrix.rows.find(
    (r) =>
      r.language === language &&
      r.frontend === frontend &&
      r.backend === backend &&
      r.database === database &&
      r.orm === orm
  );
  if (!row) {
    return {
      ok: false,
      error:
        "stack combination not in matrix; refuse silent downgrade. See config/stack-matrix.json rows.",
    };
  }
  if (!ui || !row.ui.includes(ui)) {
    return {
      ok: false,
      error: `ui must be one of [${row.ui.join(", ")}] for stack id ${row.id}`,
    };
  }
  return {
    ok: true,
    stack: {
      id: row.id,
      language,
      frontend,
      backend,
      database,
      orm,
      ui,
    },
  };
}

export function buildOutputPaths(mode, runId) {
  if (mode === "apps") {
    return {
      mode: "apps",
      root: ".",
      webDir: "apps/web",
      apiDir: "apps/api",
    };
  }
  if (mode === "output-run") {
    const id = runId || `run-${Date.now()}`;
    return {
      mode: "output-run",
      root: `output/${id}`,
      webDir: `output/${id}/web`,
      apiDir: `output/${id}/api`,
      runId: id,
    };
  }
  return { error: "output.mode must be apps | output-run" };
}

/** Env keys required before a given phase, given decision/app-spec slices. */
export function requiredEnvKeys(phase, ctx = {}) {
  const keys = new Set();
  if (phase === "INGEST" || phase === "DECISION") {
    keys.add("FIGMA_ACCESS_TOKEN");
  }
  if (phase === "CODEGEN") {
    if (ctx.database === "postgresql") keys.add("POSTGRES_URL");
    if (ctx.database === "mysql") {
      // either key acceptable; checker treats as OR group
      keys.add("MYSQL_URL|MYSQL_JDBC_URL");
    }
    if (ctx.authMode === "jwt") keys.add("JWT_SECRET");
  }
  if (phase === "GATE") {
    keys.add("WEB_URL");
    keys.add("API_URL");
    if (ctx.authMode === "jwt" && !ctx.hasSeedAdmin) {
      keys.add("GATE_USER");
      keys.add("GATE_PASS");
    }
  }
  return [...keys];
}

export function checkEnvKeys(keySpecs, env = process.env) {
  const missing = [];
  for (const spec of keySpecs) {
    if (spec.includes("|")) {
      const alts = spec.split("|");
      if (!alts.some((k) => env[k] && String(env[k]).length > 0)) {
        missing.push(spec);
      }
    } else if (!env[spec] || String(env[spec]).length === 0) {
      missing.push(spec);
    }
  }
  return { ok: missing.length === 0, missingKeys: missing };
}
