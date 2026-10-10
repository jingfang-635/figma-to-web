/**
 * GATE orchestrator: assume runtime already up; capture → all legs → gate-report.
 * Does not mutate pipeline-state.
 */
import { join } from "node:path";
import { spawn } from "node:child_process";
import { loadRootEnv } from "./lib/load-env.mjs";
import {
  gateDir,
  legResult,
  makeRunStamp,
  writeJson,
  fail,
} from "./lib/gate-common.mjs";
import {
  loadCaptureOrNull,
  runDataLeg,
  runCellLeg,
  runGeomLeg,
  runIconLeg,
  runImplLeg,
  runLayoutLeg,
  runPixelLeg,
  runTextLeg,
} from "./gate-legs.mjs";
import { repoRoot } from "./lib/pipeline.mjs";

loadRootEnv();

async function probeRuntime() {
  const webUrl = process.env.WEB_URL;
  const apiUrl = process.env.API_URL;
  let webOk = false;
  let apiOk = false;
  try {
    const r = await fetch(webUrl, { method: "GET" });
    webOk = r.ok;
  } catch {
    webOk = false;
  }
  try {
    const password = process.env.GATE_PASS;
    if (!password) throw new Error("GATE_PASS missing");
    const r = await fetch(`${apiUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: process.env.GATE_USER || "admin",
        password,
      }),
    });
    if (r.ok) {
      const j = await r.json();
      apiOk = Boolean(j.token);
    }
  } catch {
    apiOk = false;
  }
  return { webOk, apiOk };
}

function runNode(script, envExtra = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: repoRoot(),
      env: { ...process.env, ...envExtra },
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited ${code}`));
    });
  });
}

async function main() {
  const runtime = await probeRuntime();
  console.log(`runtime.apiOk=${runtime.apiOk} runtime.webOk=${runtime.webOk}`);

  const runStamp = process.env.GATE_RUN_STAMP || makeRunStamp();
  const dir = gateDir(runStamp);

  let capture = null;
  if (runtime.webOk && runtime.apiOk) {
    try {
      await runNode(join(repoRoot(), "scripts/gate-capture.mjs"), {
        GATE_RUN_STAMP: runStamp,
      });
      capture = loadCaptureOrNull(runStamp);
    } catch (e) {
      console.error("capture failed:", e.message || e);
    }
  }

  const runtimeFailures = [];
  if (!runtime.apiOk) {
    runtimeFailures.push(
      fail("RUNTIME_NOT_UP", "API probe failed (login/token); gate cannot score data leg", {
        path: "env:API_URL|GATE_USER|GATE_PASS",
      }),
    );
  }
  if (!runtime.webOk) {
    runtimeFailures.push(
      fail("RUNTIME_NOT_UP", "WEB_URL probe failed; gate cannot capture", {
        path: "env:WEB_URL",
      }),
    );
  }

  let pixel;
  let geom;
  let text;
  let icons;
  let cells;
  let layout;
  let data;
  let impl;

  // The impl leg is source-based, so it runs even when capture is unavailable:
  // "the page re-types IR values" is observable without a browser.
  impl = runImplLeg(capture);

  if (!capture) {
    const missing = legResult([
      fail("GATE_CAPTURE_MISSING", "capture unavailable; legs cannot run"),
    ]);
    pixel = missing;
    geom = missing;
    text = missing;
    icons = missing;
    cells = missing;
    layout = missing;
    data = await runDataLeg(null).catch(() => missing);
    // data can still hit API without capture
    if (runtime.apiOk) {
      data = await runDataLeg(null);
    }
  } else {
    pixel = runPixelLeg(capture, dir);
    geom = runGeomLeg(capture);
    text = runTextLeg(capture);
    icons = runIconLeg(capture);
    cells = runCellLeg(capture);
    layout = runLayoutLeg(capture);
    data = await runDataLeg(capture);
  }

  // Runtime failure must force overall FAIL but not fake visual PASS:
  // if runtime failed, mark legs that depend on capture as FAIL already.
  // The code is the documented RUNTIME_NOT_UP (with the failing side in the
  // message) rather than an ad-hoc per-probe code, so it routes through the
  // playbook like any other; and it has to reach the report — it used to be
  // collected into a local array and dropped, leaving overall=FAIL with no
  // entry anywhere saying why.
  const legs = { pixel, geom, text, icons, cells, layout, data, impl };
  const legsPass =
    pixel.status === "PASS" &&
    geom.status === "PASS" &&
    text.status === "PASS" &&
    icons.status === "PASS" &&
    cells.status === "PASS" &&
    layout.status === "PASS" &&
    data.status === "PASS" &&
    impl.status === "PASS";
  const overall =
    legsPass && runtime.webOk && runtime.apiOk ? "PASS" : "FAIL";

  const report = {
    schemaVersion: 1,
    runStamp,
    overall,
    legs,
    runtime: {
      webOk: runtime.webOk,
      apiOk: runtime.apiOk,
      ...(runtimeFailures.length ? { failures: runtimeFailures } : {}),
    },
  };

  const reportPath = join(dir, "gate-report.json");
  writeJson(reportPath, report);

  // Also mirror to artifacts/gate-report.json for convenience
  writeJson(join(repoRoot(), "artifacts/gate-report.json"), report);

  console.log(`gate_report=${reportPath}`);
  console.log(`overall=${overall}`);
  console.log(
    `legs pixel=${pixel.status} geom=${geom.status} text=${text.status} icons=${icons.status} cells=${cells.status} layout=${layout.status} data=${data.status} impl=${impl.status}`,
  );
  for (const [name, leg] of Object.entries(legs)) {
    const codes = [...new Set(leg.failures.map((f) => f.code))];
    if (codes.length) console.log(`  ${name} codes: ${codes.slice(0, 8).join(",")}`);
  }
  for (const f of runtimeFailures) console.log(`  runtime ${f.code}: ${f.message}`);

  process.exit(overall === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
