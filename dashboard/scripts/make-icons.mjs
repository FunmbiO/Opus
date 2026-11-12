// Regenerates the app icons and the iPhone launch screens from public/logo.svg. Needs Playwright installed (it is a dev tool, not a dependency).
//   node scripts/make-icons.mjs
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const inner = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8").replace(/<svg[^>]*>|<\/svg>|<rect[^>]*\/>/g, "");
const mark = inner("logo.svg");

// Android "maskable" icons are cropped to a circle or squircle, so the mark stays inside the central 60%.
const jobs = [
  { out: "icon-512.png", size: 512, scale: 0.74, at: 13 },
  { out: "icon-192.png", size: 192, scale: 0.74, at: 13 },
  { out: "apple-touch-icon.png", size: 180, scale: 0.74, at: 13 },
  { out: "icon-maskable-512.png", size: 512, scale: 0.6, at: 20 },
];

const browser = await chromium.launch();
for (const j of jobs) {
  const page = await browser.newPage({ viewport: { width: j.size, height: j.size } });
  await page.setContent(
    `<body style="margin:0;background:#0a0a0a"><svg viewBox="0 0 100 100" width="${j.size}" height="${j.size}">` +
    `<rect width="100" height="100" fill="#0a0a0a"/><g transform="translate(${j.at} ${j.at}) scale(${j.scale})">${mark}</g></svg></body>`,
  );
  await page.screenshot({ path: new URL(`../public/${j.out}`, import.meta.url).pathname });
  await page.close();
  console.log("wrote", j.out);
}
await browser.close();

// iPhone launch screens: shown while the home-screen app starts. One per common screen size (CSS px, pixel ratio).
const phones = [
  { w: 430, h: 932, r: 3 }, // 14 Pro Max, 15 Plus, 15 Pro Max
  { w: 393, h: 852, r: 3 }, // 14 Pro, 15, 15 Pro
  { w: 390, h: 844, r: 3 }, // 12, 13, 14
  { w: 375, h: 812, r: 3 }, // 13 mini, X, XS, 11 Pro
  { w: 414, h: 896, r: 2 }, // XR, 11
  { w: 375, h: 667, r: 2 }, // SE, 8
];
mkdirSync(new URL("../public/splash/", import.meta.url), { recursive: true });
const b2 = await chromium.launch();
for (const d of phones) {
  const page = await b2.newPage({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.r });
  const m = Math.round(Math.min(d.w, d.h) * 0.46);
  await page.setContent(
    `<body style="margin:0;background:#0a0a0a;width:${d.w}px;height:${d.h}px;display:grid;place-items:center;` +
    `">` +
    `<svg viewBox="0 0 100 100" width="${m}" height="${m}" style="margin-top:-4vh">${mark}</svg></body>`,
  );
  const name = `${d.w * d.r}x${d.h * d.r}.png`;
  await page.screenshot({ path: new URL(`../public/splash/${name}`, import.meta.url).pathname });
  await page.close();
  console.log("wrote splash/" + name);
}
await b2.close();
