#!/usr/bin/env node
/**
 * Local decision UI server: clickable matrix interview → writes decision.json
 * Usage: npm run decision:ui
 * Open http://127.0.0.1:4747/
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { repoRoot, resolveStack, buildOutputPaths, checkEnvKeys } from "./lib/pipeline.mjs";

const PORT = Number(process.env.DECISION_UI_PORT || 4747);
const root = repoRoot();

function loadDotEnv() {
  const p = join(root, ".env");
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

function parseFileKey(input) {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.match(/figma\.com\/(?:design|file)\/([A-Za-z0-9]+)/);
  if (m) return { fileKey: m[1], sourceUrl: s.startsWith("http") ? s : undefined };
  if (/^[A-Za-z0-9]{10,}$/.test(s)) return { fileKey: s };
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, data, type = "application/json; charset=utf-8") {
  const body = typeof data === "string" ? data : JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function mime(p) {
  const e = extname(p);
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
    }[e] || "application/octet-stream"
  );
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/matrix") {
      return send(
        res,
        200,
        JSON.parse(readFileSync(join(root, "config/stack-matrix.json"), "utf8"))
      );
    }

    if (req.method === "GET" && url.pathname === "/api/prefill") {
      let decision = null;
      const dp = join(root, "artifacts/decision/decision.json");
      if (existsSync(dp)) {
        try {
          decision = JSON.parse(readFileSync(dp, "utf8"));
        } catch {
          decision = null;
        }
      }
      return send(res, 200, { decision });
    }

    if (req.method === "GET" && url.pathname === "/api/env-check") {
      const env = loadDotEnv();
      const ingest = checkEnvKeys(["FIGMA_ACCESS_TOKEN"], env);
      const mysql = checkEnvKeys(["MYSQL_URL|MYSQL_JDBC_URL"], env);
      const pg = checkEnvKeys(["POSTGRES_URL"], env);
      const jwt = checkEnvKeys(["JWT_SECRET"], env);
      return send(res, 200, {
        keys: {
          FIGMA_ACCESS_TOKEN: ingest.ok,
          MYSQL: mysql.ok,
          POSTGRES_URL: pg.ok,
          JWT_SECRET: jwt.ok,
        },
        ingestOk: ingest.ok,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/decision") {
      const body = await readBody(req);
      const figma = parseFileKey(body.figmaInput || body.fileKey || body.sourceUrl);
      if (!figma?.fileKey) {
        return send(res, 400, { ok: false, error: "figma fileKey or URL required" });
      }
      const resolved = resolveStack({
        language: body.language,
        frontend: body.frontend,
        backend: body.backend,
        database: body.database,
        orm: body.orm,
        ui: body.ui,
      });
      if (!resolved.ok) {
        return send(res, 400, { ok: false, error: resolved.error });
      }
      if (!body.authMode || !["jwt", "none"].includes(body.authMode)) {
        return send(res, 400, { ok: false, error: "auth.mode required: jwt | none" });
      }
      if (!body.outputMode || !["apps", "output-run"].includes(body.outputMode)) {
        return send(res, 400, { ok: false, error: "output.mode required: apps | output-run" });
      }
      const output = buildOutputPaths(body.outputMode, body.runId);
      if (output.error) {
        return send(res, 400, { ok: false, error: output.error });
      }

      const env = loadDotEnv();
      const ingest = checkEnvKeys(["FIGMA_ACCESS_TOKEN"], env);
      const decision = {
        schemaVersion: 1,
        figma: {
          fileKey: figma.fileKey,
          ...(figma.sourceUrl ? { sourceUrl: figma.sourceUrl } : {}),
        },
        stack: resolved.stack,
        auth: { mode: body.authMode },
        output,
        envCheck: {
          ok: ingest.ok,
          missingKeys: ingest.missingKeys,
        },
      };

      const outPath = join(root, "artifacts/decision/decision.json");
      writeFileSync(outPath, JSON.stringify(decision, null, 2) + "\n");

      // mark DECISION complete only if env ok
      const statePath = join(root, "artifacts/pipeline-state.json");
      if (existsSync(statePath)) {
        const state = JSON.parse(readFileSync(statePath, "utf8"));
        state.history = state.history || [];
        state.history.push({
          at: new Date().toISOString(),
          event: "decision-ui-submit",
          stackId: decision.stack.id,
        });
        if (ingest.ok) {
          state.completed.DECISION = true;
          state.phase = "INGEST";
          state.blocked = false;
          state.blockReason = null;
        } else {
          state.blocked = true;
          state.blockReason = "MISSING_ENV";
          state.completed.DECISION = false;
          state.phase = "DECISION";
        }
        writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
      }

      return send(res, 200, {
        ok: true,
        decision,
        decisionComplete: ingest.ok,
        nextPhase: ingest.ok ? "INGEST" : "DECISION",
      });
    }

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/decision.html")) {
      const html = readFileSync(join(root, "decision.html"), "utf8");
      return send(res, 200, html, "text/html; charset=utf-8");
    }

    if (req.method === "GET" && url.pathname.startsWith("/static/")) {
      const rel = url.pathname.slice("/static/".length);
      const fp = join(root, "public", rel);
      if (!existsSync(fp)) return send(res, 404, { ok: false, error: "not found" });
      return send(res, 200, readFileSync(fp), mime(fp));
    }

    send(res, 404, { ok: false, error: "not found" });
  } catch (e) {
    send(res, 500, { ok: false, error: String(e?.message || e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`decision UI: http://127.0.0.1:${PORT}/`);
});
