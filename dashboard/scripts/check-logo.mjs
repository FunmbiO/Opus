// Checks the logo files. Run: npm run check:logo   (from dashboard/)
//   - the generated files match what scripts/make-logo.mjs produces now (nobody hand-edited them, none are stale)
//   - every path coordinate is a real number inside the 0..100 drawing box
//   - every app icon and launch screen exists at exactly the size it claims
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
let n = 0;
const ok = (m) => { n += 1; console.log(`  ok  ${m}`); };

// 1. in sync with the generator
const tmp = mkdtempSync(join(tmpdir(), "opus-logo-"));
const run = spawnSync(process.execPath, [join(root, "scripts/make-logo.mjs")], { env: { ...process.env, OUT_DIR: tmp }, encoding: "utf8" });
assert.equal(run.status, 0, run.stderr);
for (const [fresh, committed] of [["logo.svg", "public/logo.svg"], ["favicon.svg", "public/favicon.svg"], ["omarkPaths.ts", "src/components/omarkPaths.ts"]]) {
  assert.equal(readFileSync(join(tmp, fresh), "utf8"), readFileSync(join(root, committed), "utf8"),
    `${committed} does not match make-logo.mjs. Run: node scripts/make-logo.mjs   (and do not edit generated files by hand)`);
}
ok("logo.svg, favicon.svg and omarkPaths.ts match the generator");

// 2. the shapes are sane
const ts = readFileSync(join(root, "src/components/omarkPaths.ts"), "utf8");
const paths = [...ts.matchAll(/export const (O_FULL|O_BOLD|SWASH_FULL|SWASH_BOLD|LINE_FULL) = "([^"]+)"/g)];
assert.equal(paths.length, 5, "expected five shapes");
for (const [, name, d] of paths) {
  assert.ok(/^M[\d. L-]+Z$/.test(d), `${name} has unexpected characters`);
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  assert.ok(nums.length > 100 && nums.length % 2 === 0, `${name} has an odd number of coordinates`);
  assert.ok(nums.every((x) => Number.isFinite(x) && x >= -1 && x <= 101), `${name} has a coordinate outside the drawing box`);
}
ok("all five shapes are valid and stay inside the 0..100 box");

// 3. icons and launch screens exist at their stated sizes
const size = (f) => {
  assert.ok(existsSync(join(root, "public", f)), `${f} is missing`);
  const b = readFileSync(join(root, "public", f));
  assert.equal(b.toString("latin1", 1, 4), "PNG", `${f} is not a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
const want = { "icon-512.png": [512, 512], "icon-192.png": [192, 192], "icon-maskable-512.png": [512, 512], "apple-touch-icon.png": [180, 180],
  "splash/1290x2796.png": [1290, 2796], "splash/1179x2556.png": [1179, 2556], "splash/1170x2532.png": [1170, 2532],
  "splash/1125x2436.png": [1125, 2436], "splash/828x1792.png": [828, 1792], "splash/750x1334.png": [750, 1334] };
for (const [f, [w, h]] of Object.entries(want)) assert.deepEqual(size(f), [w, h], `${f} should be ${w}x${h}`);
ok(`${Object.keys(want).length} icons and launch screens are the right size`);

// 4. the page points at them
const html = readFileSync(join(root, "index.html"), "utf8");
for (const need of ["/favicon.svg", "/apple-touch-icon.png", ...Object.keys(want).filter((f) => f.startsWith("splash/")).map((f) => "/" + f)]) {
  assert.ok(html.includes(need), `index.html does not reference ${need}`);
}
ok("index.html references the favicon, touch icon and every launch screen");

console.log(`\nlogo check passed (${n} groups)`);
