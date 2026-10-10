import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./pipeline.mjs";

/** Load repo-root .env into process.env (does not override existing). Never logs values. */
export function loadRootEnv() {
  const envPath = join(repoRoot(), ".env");
  if (!existsSync(envPath)) return { ok: false, missingFile: true };
  const text = readFileSync(envPath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1);
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
  return { ok: true };
}

export function envNum(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return { value: fallback, fromEnv: false };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { value: fallback, fromEnv: false };
  return { value: n, fromEnv: true };
}
