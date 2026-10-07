import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.VIDEO_DIR ?? "";
type Seg = { id: string; text: string; duration: number };
const segs: Record<string, Seg> = dir
  ? Object.fromEntries((JSON.parse(readFileSync(join(dir, "segments.json"), "utf8")) as Seg[]).map((s) => [s.id, s]))
  : {};
const timings: Record<string, number> = {};

const LOAN =
  "Instant Personal Loan Rs 50,000 in 5 minutes! No CIBIL check, only Aadhaar & PAN. 100% approval. Download QuickRupee app now: https://bit.ly/quickrupee-loan Limited time offer! Call 9876543210";

const SHIELD =
  '<svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>';

const THEME = process.env.VIDEO_THEME === "light" ? "light" : "dark";
const CHIP: Record<string, string> =
  THEME === "light"
    ? { g: "#b45309", e: "#4f46e5", s: "#9333ea", v: "#475569", w: "#047857" }
    : { g: "#f59e0b", e: "#818cf8", s: "#c084fc", v: "#94a3b8", w: "#34d399" };
const COMBOS: [string, string, [string, string][]][] = [
  ["Loan forward check", "Is this loan app safe?", [["App Identity", "e"], ["RBI Registry", "g"], ["Review Voice", "e"], ["Web Reputation", "e"], ["News Timeline", "e"], ["Advertiser Identity", "e"], ["Verdict", "v"]]],
  ["Market Pulse + Ad Studio", "Where is my market going?", [["Demand Trend", "e"], ["News Timeline", "e"], ["Price Reality", "e"], ["Review Voice", "e"], ["Advertiser Identity", "e"], ["Market Brief", "s"], ["Ad Studio", "s"]]],
  ["Buy decision", "Is this deal real?", [["Price Reality", "e"], ["Web Reputation", "e"], ["Verdict", "v"]]],
  ["Investment tip check", "Is this tipster registered?", [["SEBI Registry", "g"], ["Market", "e"], ["Web Reputation", "e"], ["News Timeline", "e"], ["Verdict", "v"]]],
  ["Job offer check", "Is this employer hiring?", [["Jobs Demand", "e"], ["Place Reality", "e"], ["Web Reputation", "e"], ["Verdict", "v"]]],
  ["Trip timing", "Is this the right time and price?", [["Travel Price", "e"], ["Demand Trend", "e"], ["News Timeline", "e"], ["Verdict", "v"]]],
  ["Local service check", "Is this shop or clinic genuine?", [["Place Reality", "e"], ["Review Voice", "e"], ["Web Reputation", "e"], ["Verdict", "v"]]],
  ["Customer care number", "Is this helpline official?", [["Web Reputation", "e"], ["Place Reality", "e"], ["Verdict", "v"]]],
  ["Image provenance", "Has this photo been used before?", [["Visual Provenance", "e"], ["Web Reputation", "e"], ["Verdict", "v"]]],
  ["Competitor watch", "What are my rivals doing?", [["Advertiser Identity", "e"], ["News Timeline", "e"], ["Demand Trend", "e"], ["Market Brief", "s"], ["Weekly watch", "w"]]],
];
const COMBOS_HTML = `<div class="combos"><div class="head"><div class="kicker">One agent library · endless workflows</div>
  <h2>17 agents · 16 SerpApi engines · 10 ready-made workflows</h2></div><div class="grid">${COMBOS.map(
    ([name, q, chips], i) =>
      `<div class="row" style="animation-delay:${0.08 * i}s"><div class="t">${name}</div><div class="q">${q}</div><div class="chips">${chips
        .map(([c, k]) => `<span style="color:${CHIP[k]};border-color:${CHIP[k]}55;background:${CHIP[k]}14">${c}</span>`)
        .join("")}</div></div>`,
  ).join("")}</div><div class="legend"><span style="color:${CHIP.e}">● Evidence (live SerpApi)</span><span style="color:${CHIP.g}">● Ground truth</span><span style="color:${CHIP.s}">● Synthesis</span><span style="color:${CHIP.v}">● Rules verdict</span><span style="color:${CHIP.w}">● Schedule & alerts</span></div></div>`;

function overlay() {
  const css = `
    #rc-cursor{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;
      transform:translate(-100px,-100px);filter:drop-shadow(0 2px 4px rgba(0,0,0,.55))}
    #rc-cursor .ring{position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;
      background:rgba(99,102,241,.45);transform:scale(0);opacity:0;transition:transform .25s,opacity .35s}
    #rc-cursor.down .ring{transform:scale(1.4);opacity:1;transition:transform .08s,opacity .08s}
    #rc-caption{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);max-width:1040px;z-index:2147483646;
      pointer-events:none;padding:11px 20px;border-radius:14px;background:rgba(8,10,18,.84);color:#f5f6fa;
      font:500 17.5px/1.45 Inter,"Segoe UI",system-ui,sans-serif;text-align:center;letter-spacing:.005em;
      box-shadow:0 10px 30px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);transition:opacity .3s}
    #rc-caption:empty{opacity:0}
    #rc-card{position:fixed;inset:0;z-index:2147483645;display:grid;place-items:center;pointer-events:none;
      background:radial-gradient(1200px 600px at 50% 40%,rgba(99,102,241,.28),transparent 60%),#07080d;
      color:#fff;font-family:Inter,"Segoe UI",system-ui,sans-serif;opacity:0;transition:opacity .6s}
    #rc-card.show{opacity:1}
    #rc-card .combos{width:1380px;margin-bottom:110px}
    #rc-card .combos .head{text-align:center;margin-bottom:22px}
    #rc-card .combos .kicker{font-size:14px;letter-spacing:.14em;text-transform:uppercase;color:#a5b4fc}
    #rc-card .combos h2{font-size:34px;font-weight:700;letter-spacing:-.02em;margin:8px 0 0}
    #rc-card .combos .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}
    #rc-card .combos .row{padding:12px 16px;border-radius:14px;background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.08);opacity:0;animation:rc-in .45s ease-out forwards}
    #rc-card .combos .t{font-size:16px;font-weight:650}
    #rc-card .combos .q{font-size:13px;color:#9ca3b8;margin:2px 0 8px}
    #rc-card .combos .chips{display:flex;flex-wrap:wrap;gap:5px}
    #rc-card .combos .chips span{font-size:12px;font-weight:550;padding:3px 9px;border-radius:999px;border:1px solid}
    #rc-card .combos .legend{display:flex;justify-content:center;gap:22px;margin-top:16px;font-size:13px}
    @keyframes rc-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    .rc-carded #rc-cursor{opacity:0}
    #rc-card .logo{width:84px;height:84px;border-radius:22px;background:#6366f1;display:grid;place-items:center;
      margin:0 auto 26px;box-shadow:0 20px 60px rgba(99,102,241,.5)}
    #rc-card h1{font-size:56px;font-weight:700;letter-spacing:-.03em;margin:0;text-align:center}
    #rc-card p{font-size:21px;color:#b7bbcc;margin:14px 0 0;text-align:center}
    #rc-card .tag{display:inline-block;margin-top:28px;padding:7px 14px;border-radius:999px;font-size:14px;
      color:#c7c9ff;border:1px solid rgba(129,140,248,.45);background:rgba(99,102,241,.12)}
    .rc-light #rc-card{background:radial-gradient(1200px 600px at 50% 40%,rgba(99,102,241,.16),transparent 60%),#f7f8fc;
      color:#0f172a}
    .rc-light #rc-card p{color:#475569}
    .rc-light #rc-card .logo{box-shadow:0 20px 50px rgba(99,102,241,.35)}
    .rc-light #rc-card .tag{color:#4338ca;border-color:rgba(79,70,229,.35);background:rgba(99,102,241,.08)}
    .rc-light #rc-card .combos .kicker{color:#4f46e5}
    .rc-light #rc-card .combos .row{background:#fff;border-color:#e2e8f0;box-shadow:0 1px 3px rgba(15,23,42,.06)}
    .rc-light #rc-card .combos .q{color:#64748b}
    .rc-light #rc-cursor{filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))}`;
  const mount = () => {
    document.documentElement.classList.toggle("rc-light", localStorage.getItem("rc_theme") === "light");
    if (document.getElementById("rc-cursor")) return;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    const cursor = document.createElement("div");
    cursor.id = "rc-cursor";
    cursor.innerHTML =
      '<span class="ring"></span><svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2.5v17.2l4.6-4.3 3 6.6 3-1.4-3-6.4h6.2z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cursor);
    const caption = document.createElement("div");
    caption.id = "rc-caption";
    caption.textContent = sessionStorage.getItem("rc-caption") ?? "";
    document.body.appendChild(caption);
    const card = document.createElement("div");
    card.id = "rc-card";
    document.body.appendChild(card);
    const place = (x: number, y: number) => {
      cursor.style.transform = `translate(${x - 4}px,${y - 2}px)`;
      sessionStorage.setItem("rc-pos", `${x},${y}`);
    };
    const saved = sessionStorage.getItem("rc-pos");
    if (saved) {
      const [x, y] = saved.split(",").map(Number);
      place(x, y);
    }
    window.addEventListener("mousemove", (e) => place(e.clientX, e.clientY), true);
    window.addEventListener("mousedown", () => cursor.classList.add("down"), true);
    window.addEventListener("mouseup", () => cursor.classList.remove("down"), true);
    window.addEventListener("dragover", (e) => place(e.clientX, e.clientY), true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
}

async function caption(page: Page, text: string) {
  await page.evaluate((t) => {
    sessionStorage.setItem("rc-caption", t);
    const el = document.getElementById("rc-caption");
    if (el) el.textContent = t;
  }, text);
}

async function card(page: Page, html: string | null) {
  await page.evaluate((h) => {
    const el = document.getElementById("rc-card");
    if (!el) return;
    if (h) el.innerHTML = h;
    el.classList.toggle("show", Boolean(h));
    document.documentElement.classList.toggle("rc-carded", Boolean(h));
  }, html);
}

async function seg(page: Page, id: string, body: () => Promise<void> = async () => {}, minMs = 0) {
  const s = segs[id];
  const start = Date.now();
  timings[id] = start / 1000;
  await caption(page, s?.text ?? "");
  await body();
  const need = Math.max((s?.duration ?? 2) * 1000 + 450, minMs);
  const left = need - (Date.now() - start);
  if (left > 0) await page.waitForTimeout(left);
}

async function reveal(loc: Locator) {
  await loc.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await loc.page().waitForTimeout(700);
}

async function moveTo(page: Page, loc: Locator, steps = 28) {
  await loc.waitFor({ state: "visible" });
  const box = await loc.boundingBox();
  if (!box || box.y < 0 || box.y + box.height > 864) {
    await reveal(loc);
  }
  const b = (await loc.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps });
}

async function click(page: Page, loc: Locator) {
  await moveTo(page, loc);
  await page.waitForTimeout(180);
  await loc.click();
}

async function glide(page: Page, dy: number, ms = 1600) {
  const steps = Math.max(10, Math.round(ms / 50));
  const start = Date.now();
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    const wait = start + ((i + 1) * ms) / steps - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  }
}

async function scrollToLoc(page: Page, loc: Locator, offset = 90, ms = 1400) {
  await loc.waitFor();
  const target = await loc.evaluate((el, off) => el.getBoundingClientRect().top + window.scrollY - off, offset);
  await page.evaluate(
    ([y, d]) =>
      new Promise<void>((resolve) => {
        const from = window.scrollY;
        const t0 = performance.now();
        const step = (t: number) => {
          const k = Math.min(1, (t - t0) / d);
          const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
          window.scrollTo({ top: from + (y - from) * e, behavior: "instant" });
          if (k < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      }),
    [Math.max(0, target), ms] as const,
  );
}

async function approve(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Review and approve")).toBeVisible();
  await page.waitForTimeout(1200);
  await click(page, dialog.getByRole("switch"));
  await page.waitForTimeout(500);
  await click(page, dialog.getByRole("button", { name: /Approve & Run/ }));
  await expect(page).toHaveURL(/\/runs\/run_/);
  await ensureCanvas(page);
}

async function ensureCanvas(page: Page) {
  await expect(page.locator(".react-flow__node").first()).toBeAttached();
  await page.waitForTimeout(600);
  const inView = await page.evaluate(() => {
    const pane = document.querySelector(".react-flow")!.getBoundingClientRect();
    return [...document.querySelectorAll(".react-flow__node")].filter((n) => {
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.right > pane.left && r.left < pane.right && r.bottom > pane.top && r.top < pane.bottom;
    }).length;
  });
  if (inView < 3) await page.getByRole("button", { name: "Fit View" }).click();
}

test("demo video", async ({ page }) => {
  test.skip(!dir, "Run through scripts/make_demo_video.py");
  await page.addInitScript((theme) => localStorage.setItem("rc_theme", theme), THEME);
  await page.addInitScript(overlay);
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /Try the demo workspace/ })).toBeVisible();
  await card(
    page,
    `<div><div class="logo">${SHIELD}</div><h1>Reality Check</h1><p>Evidence agents for India, powered by SerpApi</p><div style="text-align:center"><span class="tag">SerpApi India Hackathon 2026</span></div></div>`,
  );
  await page.waitForTimeout(700);

  const frames: { file: string; t: number }[] = [];
  const cdp = await page.context().newCDPSession(page);
  cdp.on("Page.screencastFrame", (f) => {
    const file = `f${String(frames.length + 1).padStart(5, "0")}.jpg`;
    writeFileSync(join(dir, "frames", file), Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp ?? Date.now() / 1000 });
    void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await page.waitForTimeout(300);

  // 1. Title card, then the sign-in page with the live banner slider.
  await seg(page, "intro", async () => {}, 4200);
  await seg(page, "forwards", async () => {
    await card(page, null);
    await page.waitForTimeout(900);
    await page.mouse.move(700, 520, { steps: 40 });
  });

  // 2. Loan forward: paste, plan, approve, live run, verdict, receipt.
  await seg(page, "paste", async () => {
    await click(page, page.getByRole("button", { name: /Try the demo workspace/ }));
    await expect(page.getByRole("heading", { level: 1, name: /Good to see you|Welcome/ })).toBeVisible();
    await page.waitForTimeout(900);
    const box = page.getByRole("textbox", { name: "Message, link or image URL to check" });
    await click(page, box);
    await page.waitForTimeout(300);
    await box.fill(LOAN);
    await page.waitForTimeout(900);
    await click(page, page.getByRole("button", { name: /Plan the check/ }));
  });
  await seg(page, "plan", async () => {
    await expect.poll(() => page.locator(".react-flow__node").count(), { timeout: 30_000 }).toBeGreaterThan(3);
    await page.waitForTimeout(2600);
    await click(page, page.getByRole("button", { name: /Review & run/ }));
    await approve(page);
  });
  await seg(page, "live", async () => {
    await page.mouse.move(980, 300, { steps: 30 });
    await page.waitForTimeout(6500);
    await click(page, page.getByRole("button", { name: /Evidence stream/ }));
    await expect(page.getByText("Do not proceed").first()).toBeVisible();
  });
  await seg(page, "verdict", async () => {
    await page.waitForTimeout(1400);
    await page.mouse.move(1100, 700, { steps: 20 });
    await scrollToLoc(page, page.getByRole("tab", { name: /Verdict/ }), 80, 1200);
    await page.waitForTimeout(900);
    const rbi = page.getByTestId("verdict-gaps").getByText(/not found in RBI's directory/).first();
    await scrollToLoc(page, rbi, 330, 1500);
    await moveTo(page, rbi, 25);
    await page.waitForTimeout(3400);
    await page.mouse.move(1100, 640, { steps: 20 });
    await glide(page, 380, 2000);
  });
  await seg(page, "receipt", async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await page.waitForTimeout(600);
    await click(page, page.getByRole("tab", { name: /Receipt/ }));
    await expect(page.getByText("Search receipt")).toBeVisible();
    await page.waitForTimeout(500);
    await page.mouse.move(760, 600, { steps: 20 });
    await glide(page, 360, 1800);
  });

  // 3. Market Pulse: approve, brief, Ad Studio, then a watch.
  await seg(page, "market", async () => {
    await page.goto("/studio?template=market_pulse_ads&sample=1");
    await approve(page);
    await page.waitForTimeout(2500);
    await click(page, page.getByRole("button", { name: /Evidence stream/ }));
  });
  await expect(page.getByText("Market brief · electric scooter")).toBeVisible();
  await seg(page, "brief", async () => {
    await page.waitForTimeout(1200);
    await page.mouse.move(760, 600, { steps: 20 });
    await glide(page, 480, 1800);
    await page.waitForTimeout(1600);
    await glide(page, 520, 1800);
    await page.waitForTimeout(1600);
    await glide(page, 520, 1800);
  });
  await seg(page, "ads", async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await page.waitForTimeout(500);
    await click(page, page.getByRole("tab", { name: /Ad studio/ }));
    await page.waitForTimeout(900);
    await page.mouse.move(760, 600, { steps: 20 });
    await glide(page, 420, 1800);
    await page.waitForTimeout(1200);
    await glide(page, 420, 1800);
  });
  await seg(page, "watch", async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await page.waitForTimeout(500);
    await click(page, page.getByRole("button", { name: /^Watch$/ }).first());
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Watch this")).toBeVisible();
    await page.waitForTimeout(700);
    await click(page, dialog.getByRole("button", { name: "Daily" }));
    await click(page, dialog.getByRole("switch").first());
    await page.waitForTimeout(500);
    await click(page, dialog.getByRole("button", { name: /Create watch/ }));
    await expect(page.getByRole("heading", { level: 1, name: "Watches" })).toBeVisible();
  });

  // 4. Studio drag and drop, Engine Atlas, MCP.
  await seg(page, "studio", async () => {
    await page.goto("/studio");
    await expect(page.locator(".react-flow__node")).toHaveCount(2);
    await page.waitForTimeout(800);
    const pane = (await page.locator(".react-flow__pane").boundingBox())!;
    const drops: [string, number, number][] = [
      ["News Timeline", 0.42, 0.3],
      ["Jobs Demand", 0.42, 0.62],
    ];
    for (const [title, fx, fy] of drops) {
      const item = page.locator("aside div[draggable]").filter({ hasText: title }).first();
      const before = await page.locator(".react-flow__node").count();
      await moveTo(page, item);
      await page.mouse.down();
      await page.mouse.move(pane.x + pane.width * fx, pane.y + pane.height * fy, { steps: 35 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      if ((await page.locator(".react-flow__node").count()) === before) await item.dblclick();
      await page.waitForTimeout(900);
    }
  });
  await seg(page, "combos", async () => {
    await card(page, COMBOS_HTML);
  }, 5000);
  await seg(page, "mcp", async () => {
    await page.goto("/developer");
    await expect(page.getByRole("heading", { level: 1, name: "Developer" })).toBeVisible();
    await page.waitForTimeout(900);
    await page.mouse.move(760, 560, { steps: 20 });
    await glide(page, 420, 2400);
  });

  // 5. Outro card.
  await seg(page, "outro", async () => {
    await caption(page, "");
    await card(
      page,
      `<div><div class="logo">${SHIELD}</div><h1>Verify before you trust.</h1><p>Reality Check · reusable SerpApi evidence agents in visual workflows</p><div style="text-align:center"><span class="tag">uv run reality-check --demo</span></div></div>`,
    );
  }, 4800);

  timings._end = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  writeFileSync(join(dir, "frames.json"), JSON.stringify(frames));
  writeFileSync(join(dir, "timings.json"), JSON.stringify({ ...timings, _node_now: Date.now() / 1000 }, null, 2));
});
