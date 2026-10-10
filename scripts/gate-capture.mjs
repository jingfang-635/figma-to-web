/**
 * Single-session DOM + screenshot capture for GATE legs.
 * Writes artifacts/gates/<runStamp>/capture.json
 */
import { join } from "node:path";
import { chromium } from "playwright";
import { envNum, loadRootEnv } from "./lib/load-env.mjs";
import {
  gateDir,
  makeRunStamp,
  readAppSpec,
  readLayoutIr,
  writeJson,
} from "./lib/gate-common.mjs";

loadRootEnv();

const MODAL_TRIGGERS = {
  "department-create": {
    parentRoute: "/departments",
    open: async (page) => {
      await page.getByRole("button", { name: /新增/ }).first().click();
      await page.waitForSelector(".ant-modal-content", { timeout: 10000 });
    },
  },
  "doctor-create": {
    parentRoute: "/doctors",
    open: async (page) => {
      await page.getByRole("button", { name: /新增/ }).first().click();
      await page.waitForSelector(".ant-modal-content", { timeout: 10000 });
    },
  },
  "schedule-create": {
    parentRoute: "/schedules",
    open: async (page) => {
      await page.getByRole("button", { name: /新增/ }).first().click();
      await page.waitForSelector(".ant-modal-content", { timeout: 10000 });
    },
  },
  "schedule-batch": {
    parentRoute: "/schedules",
    open: async (page) => {
      await page.getByRole("button", { name: /批量/ }).first().click();
      await page.waitForSelector(".ant-modal-content", { timeout: 10000 });
    },
  },
};

async function login(page, webUrl, username, password) {
  // Prefer 127.0.0.1 when WEB_URL uses localhost (Vite may bind IPv4 only).
  const base = webUrl.replace("://localhost", "://127.0.0.1");
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("form", { timeout: 15000 });
  const userInput = page
    .locator(
      'input[autocomplete="username"], #username, input[id*="username"]',
    )
    .first();
  await userInput.waitFor({ state: "visible", timeout: 10000 });
  await userInput.fill(username);
  await page
    .locator(
      'input[autocomplete="current-password"], input[type="password"]',
    )
    .first()
    .fill(password);
  const submit = page.locator('button[type="submit"]').first();
  if ((await submit.count()) > 0) {
    await submit.click();
  } else {
    await page.locator("form button.ant-btn-primary").first().click();
  }
  await page.waitForURL((u) => !u.pathname.includes("/login"), {
    timeout: 20000,
  });
  return base;
}

async function collectDom(page, { isModal }) {
  return page.evaluate(({ isModal }) => {
    const root = isModal
      ? document.querySelector(".ant-modal-content")
      : document.body;
    if (!root) return { controls: [], texts: [], modal: null, viewport: null };

    const viewport = {
      w: window.innerWidth,
      h: window.innerHeight,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
    };

    let modal = null;
    const modalEl = document.querySelector(".ant-modal-content");
    if (modalEl) {
      const r = modalEl.getBoundingClientRect();
      modal = { x: r.x, y: r.y, w: r.width, h: r.height };
    }

    const outermost = (els) => {
      const arr = [...els];
      return arr.filter(
        (el) => !arr.some((other) => other !== el && other.contains(el)),
      );
    };

    const controlSel =
      'input:not([type="hidden"]):not([type="search"]), select, textarea, .ant-select-selector, .ant-picker, button.ant-btn';
    const controlEls = outermost(root.querySelectorAll(controlSel)).filter(
      (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      },
    );
    const controls = controlEls.map((el) => {
      const r = el.getBoundingClientRect();
      let role = el.tagName.toLowerCase();
      if (el.classList.contains("ant-select-selector")) role = "select";
      if (el.classList.contains("ant-picker")) role = "date";
      if (el.tagName === "BUTTON" || el.classList.contains("ant-btn"))
        role = "button";
      if (el.tagName === "TEXTAREA") role = "textarea";
      if (el.tagName === "INPUT") {
        const t = (el.getAttribute("type") || "text").toLowerCase();
        role = t === "number" ? "number" : "input";
      }
      return {
        role,
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        value:
          el.tagName === "INPUT" || el.tagName === "TEXTAREA"
            ? el.value
            : el.textContent?.trim()?.slice(0, 80) || "",
      };
    });

    // Group text by parent element
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const byParent = new Map();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const t = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!t || t.length < 1) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      if (parent.closest("script,style,noscript")) continue;
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push(t);
    }
    const texts = [];
    for (const [el, parts] of byParent) {
      const characters = parts.join("");
      if (!characters.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      texts.push({
        characters,
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        fontSize: parseFloat(cs.fontSize) || 0,
        color: cs.color,
      });
    }

    // Live-data regions. A list/table/calendar page opts a subtree in with
    // data-ir-live="<key>" when its content is filled from the API at runtime
    // (row cells, calendar chips, a month title derived from today). The text
    // and icon legs assert chrome, labels and column headers; the IR samples
    // drawn inside these regions are live values, not DOM text to demand.
    const liveRegions = [...root.querySelectorAll("[data-ir-live]")].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        key: el.getAttribute("data-ir-live") || "*",
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
      };
    });

    // Live data probes
    const kpiValues = [...document.querySelectorAll(".kpi-card__value, .kpi-value")].map(
      (el) => el.textContent?.trim() || "",
    );
    const tableCells = [...document.querySelectorAll(".ant-table-tbody td")]
      .slice(0, 40)
      .map((el) => el.textContent?.trim() || "");
    const formValues = [...document.querySelectorAll("input, textarea")]
      .filter((el) => el.type !== "password" && el.type !== "hidden")
      .map((el) => el.value)
      .filter(Boolean);

    // Icon slots. An element opts in with data-ir-icon="<symbol>" so the icon
    // leg can pair it with the Layout IR slot of the same box.
    const icons = [...root.querySelectorAll("[data-ir-icon]")].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        name: el.getAttribute("data-ir-icon") || "",
        nodeId: el.getAttribute("data-ir-icon-node") || "",
        symbolUnresolved: el.getAttribute("data-ir-icon") === "unresolved",
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        color: getComputedStyle(el).color,
      };
    });

    // Cell boxes. Plain drawn rectangles — calendar day cells, their header
    // band, legend swatches, a today badge — opt in with data-ir-cell="<role>".
    // They carry no label and no glyph, so the text and icon legs cannot see
    // them: without this the whole grid could render flat white at three times
    // its IR height and every leg would still pass.
    const cells = [...root.querySelectorAll("[data-ir-cell]")].map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        role: el.getAttribute("data-ir-cell") || "",
        nodeId: el.getAttribute("data-ir-cell-node") || "",
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        fill: cs.backgroundColor,
      };
    });

    return {
      controls,
      texts,
      modal,
      viewport,
      icons,
      cells,
      liveRegions,
      live: { kpiValues, tableCells, formValues },
    };
  }, { isModal });
}

/**
 * Layout probes used by the fluid leg: which containers declare themselves
 * fluid, how the shell is transformed, where the main area ends. Collected at
 * the capture viewport and again at a widened viewport, because a container
 * that simply keeps its IR pixel width passes every check at IR width.
 *
 * Each fluid container also reports the union box of its own children. The
 * container box alone cannot tell "the panel stretched and so did its content"
 * from "the panel stretched while the fields on it kept their IR width" — the
 * two are identical at the IR viewport, and the container box is the same in
 * both cases.
 */
async function collectLayout(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    };
    const shell = document.querySelector(".app-shell");
    const main = document.querySelector(".app-main");
    // Containment probe: does the box hold its own content? A container that
    // clips or scrolls its content must opt in with data-ir-scroll, otherwise
    // the content has escaped and no leg could see it (a page-declared live
    // mask scores nowhere, so overflowing rows/pagination vanish).
    const scrollOf = (el) => {
      const cs = getComputedStyle(el);
      return {
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        overflowX: cs.overflowX,
        overflowY: cs.overflowY,
        scrollDeclared: el.hasAttribute("data-ir-scroll"),
      };
    };
    const fluid = [...document.querySelectorAll("[data-ir-fluid]")].map((el) => {
      const box = rect(el);
      const scroll = scrollOf(el);
      const group = el.getAttribute("data-ir-fluid") || "*";
      const kids = [...el.children]
        .map((c) => c.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      if (!kids.length) return { group, ...box, ...scroll };
      const x0 = Math.min(...kids.map((r) => r.left));
      const x1 = Math.max(...kids.map((r) => r.right));
      const y1 = Math.max(...kids.map((r) => r.bottom));
      return {
        group,
        ...box,
        ...scroll,
        childCount: kids.length,
        content: { x: x0, right: x1, w: x1 - x0, bottom: y1, h: y1 - Math.min(...kids.map((r) => r.top)) },
      };
    });
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      transform: shell ? getComputedStyle(shell).transform : null,
      overflowX: shell ? getComputedStyle(shell).overflowX : null,
      main: main ? rect(main) : null,
      fluid,
    };
  });
}

async function waitSettled(page) {
  let networkIdle = false;
  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
    networkIdle = true;
  } catch {
    networkIdle = false;
  }
  await page.waitForTimeout(400);
  return networkIdle;
}

/**
 * Capture-stability record. The pixel leg scores a *snapshot*, so a snapshot
 * taken before fonts/images/animations have settled has correct DOM boxes but a
 * wrong picture. Recording the four conditions in capture.json turns "the
 * screenshot was early" from an invisible scoring error into an explicit
 * GATE_CAPTURE_UNSTABLE failure that points at re-capture, not at the page.
 *
 * Scope matters: the animation check must cover what is actually screenshotted.
 * A page shot is the document; a modal shot is `.ant-modal-content`, so a
 * ripple still running on the page behind the modal (antd's ant-wave on the
 * button that opened it) is not part of the captured pixels and must not make
 * the capture look unstable.
 */
async function collectStability(page, networkIdle, isModal) {
  const dom = await page.evaluate(({ isModal }) => {
    const fontsReady = Boolean(
      document.fonts && document.fonts.status === "loaded",
    );
    const imgs = [...document.images];
    const imagesReady =
      imgs.length === 0 ||
      imgs.every((img) => img.complete && img.naturalWidth > 0);
    const scope = isModal
      ? document.querySelector(".ant-modal-content")
      : document.documentElement;
    const animationsSettled = scope
      ? scope
          .getAnimations({ subtree: true })
          .every((a) => a.playState !== "running")
      : true;
    return { fontsReady, imagesReady, animationsSettled };
  }, { isModal });
  return { ...dom, networkIdle: Boolean(networkIdle) };
}

/**
 * Ant Modal enters with a zoom+fade animation. Screenshotting or measuring while
 * it runs captures a scaled, semi-transparent card — the DOM boxes survive but
 * the pixels do not, which silently poisons the pixel leg. Wait for the modal
 * subtree's animations to finish and the card to reach full opacity.
 */
async function waitModalSettled(page) {
  await page
    .waitForFunction(
      () => {
        const content = document.querySelector(".ant-modal-content");
        if (!content) return false;
        const wrap = content.closest(".ant-modal-wrap") || content;
        const running = wrap
          .getAnimations({ subtree: true })
          .some((a) => a.playState === "running");
        if (running) return false;
        const cs = getComputedStyle(content);
        return cs.opacity === "1" && !/matrix\(0\./.test(cs.transform);
      },
      null,
      { timeout: 10000 },
    )
    .catch(() => {});
  await page.waitForTimeout(150);
}

async function main() {
  const webUrl = process.env.WEB_URL;
  const apiUrl = process.env.API_URL;
  if (!webUrl || !apiUrl) {
    console.error("WEB_URL and API_URL env keys required");
    process.exit(1);
  }
  const password = process.env.GATE_PASS;
  if (!password) {
    console.error("GATE_PASS env key required for jwt capture");
    process.exit(1);
  }
  const username = process.env.GATE_USER || "admin";

  const spec = readAppSpec();
  const runStamp = process.env.GATE_RUN_STAMP || makeRunStamp();
  const dir = gateDir(runStamp);

  // Prefer installed Edge/Chrome to avoid downloading Playwright Chromium (~200MB).
  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    try {
      browser = await chromium.launch({ channel: "chrome", headless: true });
    } catch {
      browser = await chromium.launch({ headless: true });
    }
  }
  const screens = [];
  let baseUrl = webUrl.replace("://localhost", "://127.0.0.1");

  try {
    for (const screen of spec.screens) {
      const ir = readLayoutIr(screen.id);
      const isModal = screen.type === "modal";
      const bounds = ir?.bounds || { width: 1440, height: 900 };
      const viewport = isModal
        ? { width: 1440, height: 900 }
        : {
            width: Math.max(1280, Math.round(bounds.width)),
            height: Math.max(800, Math.round(bounds.height)),
          };

      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
      });
      // Mark the session as a gate capture and switch off any legacy cover
      // viewport-fit so DOM boxes match IR coordinates. (Page-level scale is
      // also asserted against by the layout leg.)
      await context.addInitScript(() => {
        globalThis.__GATE_VIEWPORT_FIT__ = false;
        document.documentElement.dataset.gateCapture = "1";
      });
      const page = await context.newPage();
      baseUrl = await login(page, webUrl, username, password);

      let openError = null;
      let networkIdle = false;
      if (isModal) {
        const trig = MODAL_TRIGGERS[screen.id];
        if (!trig) {
          openError = `no trigger mapping for modal ${screen.id}`;
        } else {
          await page.goto(`${baseUrl}${trig.parentRoute}`, {
            waitUntil: "networkidle",
          });
          networkIdle = await waitSettled(page);
          try {
            await trig.open(page);
            await waitModalSettled(page);
          } catch (e) {
            openError = String(e?.message || e);
          }
        }
      } else {
        await page.goto(`${baseUrl}${screen.route}`, {
          waitUntil: "networkidle",
        });
        networkIdle = await waitSettled(page);
      }

      const stability = openError
        ? {
            fontsReady: false,
            imagesReady: false,
            animationsSettled: false,
            networkIdle: false,
          }
        : await collectStability(page, networkIdle, isModal).catch(() => ({
            fontsReady: false,
            imagesReady: false,
            animationsSettled: false,
            networkIdle: Boolean(networkIdle),
          }));

      const shotRel = `shots/${screen.id}.png`;
      const shotAbs = join(dir, shotRel);
      if (isModal) {
        const modal = page.locator(".ant-modal-content").first();
        if ((await modal.count()) > 0) {
          await modal.screenshot({ path: shotAbs });
        } else {
          await page.screenshot({ path: shotAbs, fullPage: false });
        }
      } else {
        await page.screenshot({ path: shotAbs, fullPage: false });
      }

      const dom = openError
        ? {
            controls: [],
            texts: [],
            modal: null,
            viewport: null,
            icons: [],
            cells: [],
            live: { kpiValues: [], tableCells: [], formValues: [] },
            openError,
          }
        : await collectDom(page, { isModal });

      const layout = openError ? null : await collectLayout(page).catch(() => null);

      // Second pass at a wider viewport: a container that keeps its IR pixel
      // width is invisible at IR width but obvious here.
      let wide = null;
      if (!isModal && !openError && dom.viewport) {
        const scale = envNum("GATE_WIDE_SCALE", 1.5).value;
        const wideW = Math.round(viewport.width * scale);
        try {
          await page.setViewportSize({ width: wideW, height: viewport.height });
          await waitSettled(page);
          wide = await collectLayout(page);
        } catch (e) {
          wide = { error: String(e?.message || e) };
        }
      }

      screens.push({
        screenId: screen.id,
        type: screen.type,
        route: screen.route,
        viewport,
        irBounds: bounds,
        screenshot: shotRel,
        stability,
        dom,
        layout,
        wide,
        openError,
      });

      await context.close();
    }
  } finally {
    await browser.close();
  }

  const capture = {
    schemaVersion: 1,
    runStamp,
    webUrlHost: new URL(baseUrl).host,
    capturedAt: new Date().toISOString(),
    screens,
  };
  const out = join(dir, "capture.json");
  writeJson(out, capture);
  console.log(`capture_ok runStamp=${runStamp} screens=${screens.length}`);
  console.log(`capture_path=${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
