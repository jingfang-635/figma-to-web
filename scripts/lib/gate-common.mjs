import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot, readJson } from "./pipeline.mjs";

export function readAppSpec() {
  return readJson("artifacts/app-spec/app-spec.json");
}

export function layoutIrPath(screenId) {
  return join(repoRoot(), "artifacts/ir/layout", `${screenId}.json`);
}

export function readLayoutIr(screenId) {
  const p = layoutIrPath(screenId);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

export function makeRunStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

export function gateDir(runStamp) {
  const dir = join(repoRoot(), "artifacts/gates", runStamp);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "shots"), { recursive: true });
  return dir;
}

export function writeJson(absPath, data) {
  writeFileSync(absPath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function legResult(failures, notes = []) {
  return {
    status: failures.length === 0 ? "PASS" : "FAIL",
    failures,
    notes,
  };
}

export function fail(code, message, extra = {}) {
  return { code, message, ...extra };
}

/** Input-like control roles used by geom pairing. */
export function isGeomControlRole(role) {
  if (!role) return false;
  return /^(input|textarea|select|checkbox|radio|date|number|button)/i.test(
    role,
  );
}

export function sortBoxes(boxes) {
  return [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
}

export function normalizeText(s) {
  return String(s || "")
    .replace(/\s+/g, "")
    .trim();
}

export function colorToRgb(hexOrRgb) {
  if (!hexOrRgb) return null;
  const s = String(hexOrRgb).trim();
  const m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const m2 = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m2) return { r: +m2[1], g: +m2[2], b: +m2[3] };
  return null;
}

export function colorsClose(a, b, tol = 12) {
  const ca = colorToRgb(a);
  const cb = colorToRgb(b);
  if (!ca || !cb) return false;
  return (
    Math.abs(ca.r - cb.r) <= tol &&
    Math.abs(ca.g - cb.g) <= tol &&
    Math.abs(ca.b - cb.b) <= tol
  );
}
