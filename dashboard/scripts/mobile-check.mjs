// Phone check: opens every page in an iPhone-sized browser and looks for the usual mobile problems.
//   npm run dev            (in one terminal)
//   node scripts/mobile-check.mjs [url] [screenshot-prefix]
// Needs Playwright installed (a dev tool, not a dependency). Exits 1 if anything fails.
import { chromium, devices } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:5173/";
const shot = process.argv[3];
const MIN_TARGET = 44; // Apple's minimum comfortable tap size, in CSS pixels
const problems = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 14"] });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForSelector(".tabbar", { timeout: 15000 });
await page.waitForTimeout(4200); // boot animation

const tabs = ["Today", "Ask", "Clients", "Approvals", "Budget", "Subscriptions", "Activity"];
const primary = new Set(["Today", "Ask", "Clients", "Approvals"]);

async function open(name) {
  if (primary.has(name)) {
    await page.locator(".tabbar button", { hasText: name }).first().click();
  } else {
    await page.locator(".tabbar button", { hasText: "More" }).click();
    await page.locator(".sheet-item", { hasText: name }).click();
  }
  await page.waitForTimeout(600);
}

const nav = await page.locator(".tabbar button").count();
if (nav !== 5) problems.push(`tab bar has ${nav} buttons, expected 5 (four tabs and More)`);

for (const name of tabs) {
  await open(name);

  const r = await page.evaluate((MIN) => {
    const doc = document.scrollingElement;
    const out = { overflow: doc.scrollWidth - window.innerWidth, small: [], smallInputs: [] };
    const sel = "button, a[href], [role=button], input, select, textarea, summary";
    for (const el of document.querySelectorAll(sel)) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || b.bottom < 0 || b.top > window.innerHeight * 6) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
      if (el.closest(".boot-screen, [aria-hidden=true]")) continue;
      if (/INPUT|TEXTAREA|SELECT/.test(el.tagName) && parseFloat(cs.fontSize) < 16 && el.type !== "checkbox" && el.type !== "radio" && el.type !== "file") {
        out.smallInputs.push(`${el.tagName.toLowerCase()}.${el.className} ${cs.fontSize}`);
      }
      if (el.type === "checkbox" || el.type === "radio" || el.type === "file" || el.tagName === "SUMMARY") continue;
      // a ::after with negative insets widens the touch area without changing how the control looks
      const pa = getComputedStyle(el, "::after");
      const grow = pa.position === "absolute" ? -(parseFloat(pa.top) || 0) - (parseFloat(pa.bottom) || 0) : 0;
      if (b.height + Math.max(0, grow) < MIN - 0.5) out.small.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} "${(el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 24)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    return out;
  }, MIN_TARGET);

  if (r.overflow > 1) problems.push(`${name}: page scrolls sideways by ${r.overflow}px`);
  for (const s of [...new Set(r.small)].slice(0, 6)) problems.push(`${name}: tap target under ${MIN_TARGET}px: ${s}`);
  for (const s of [...new Set(r.smallInputs)]) problems.push(`${name}: input text under 16px (iOS will zoom): ${s}`);
  if (shot) await page.screenshot({ path: `${shot}-${name.toLowerCase()}.png` });
}

// The More sheet
await page.locator(".tabbar button", { hasText: "More" }).click();
await page.waitForTimeout(300);
const items = await page.locator(".sheet-item").allInnerTexts();
for (const want of ["Budget", "Subscriptions", "Activity"]) if (!items.some((t) => t.includes(want))) problems.push(`More sheet is missing ${want}`);
if (shot) await page.screenshot({ path: `${shot}-more.png` });

if (errors.length) problems.push(`page errors: ${errors.join(" | ").slice(0, 300)}`);
await browser.close();

if (problems.length) {
  console.error(`Phone check found ${problems.length} problem${problems.length === 1 ? "" : "s"}:`);
  for (const p of problems) console.error(" - " + p);
  process.exit(1);
}
console.log(`Phone check passed on ${tabs.length} pages: no sideways scrolling, tap targets at least ${MIN_TARGET}px, inputs at least 16px.`);
