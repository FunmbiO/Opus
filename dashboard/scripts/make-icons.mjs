// Regenerates the app icons from public/logo.svg. Needs Playwright installed (it is a dev tool, not a dependency).
//   node scripts/make-icons.mjs
import { readFileSync } from "node:fs";
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
