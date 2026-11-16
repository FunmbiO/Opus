// Draws the Opus mark: a fine open ring with the Opus car driving through the gap.
//
//   node scripts/make-logo.mjs                  writes src/components/omarkPaths.ts, public/logo.svg, public/favicon.svg
//   OUT_DIR=/some/folder node scripts/make-logo.mjs    writes there instead (for previewing)
//
// The ring is a pen line that swells from a hairline to its fullest at the lower left and thins out again, leaving a gap
// at the upper right. The car is the Opus car outline from src/components/CarMark.tsx, turned slightly, scaled to fit,
// and simplified so the files stay small. The car passes in front of the ring's thin side and behind its thick left
// stroke, so it reads as driving through. Everything is in a 0..100 box. Tweak the numbers below and rerun.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const rad = (d) => (d * Math.PI) / 180;
const f = (n) => (Math.round(n * 10) / 10).toString();

// ---------------------------------------------------------------- the ring
const RING = {
  cx: 50, cy: 50, rx: 34, ry: 38,   // size of the ring
  from: -40, sweep: 336,            // where the pen starts (degrees) and how far it goes round; the rest is the gap
  hair: 0.7, swell: 3.4, curve: 0.7,// thinnest line, how much it swells, and the shape of the swelling
  steps: 300,
};
// the heavier version for small sizes (nav, favicon), where a hairline would vanish
const RING_BOLD = { ...RING, hair: 1.9, swell: 6.4, curve: 0.65 };

function ribbon(centre, widthAt) {
  const left = [], right = [];
  for (let i = 0; i < centre.length; i++) {
    const p = centre[i], q = centre[Math.min(centre.length - 1, i + 1)], o = centre[Math.max(0, i - 1)];
    let tx = q[0] - o[0], ty = q[1] - o[1];
    const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
    const w = widthAt(i / (centre.length - 1)) / 2;
    left.push([p[0] - ty * w, p[1] + tx * w]);
    right.push([p[0] + ty * w, p[1] - tx * w]);
  }
  return [...left, ...right.reverse()];
}
const toPath = (pts) => "M" + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L") + "Z";

function ring(R) {
  const centre = Array.from({ length: R.steps }, (_, i) => {
    const a = rad(R.from - (i / (R.steps - 1)) * R.sweep);
    return [R.cx + R.rx * Math.cos(a), R.cy + R.ry * Math.sin(a)];
  });
  return toPath(ribbon(centre, (t) => R.hair + R.swell * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.04 + 0.01)), R.curve)));
}

// ---------------------------------------------------------------- the car
const CAR = { x: 50, y: 60, scale: 0.172, rot: -8, simplify: 0.045 };
const carSrc = readFileSync(new URL("../src/components/CarMark.tsx", import.meta.url), "utf8");
const carData = (name) => new RegExp(`const ${name} = "([^"]+)"`).exec(carSrc)[1];

/** Ramer-Douglas-Peucker: drops points that lie within eps of the line between their neighbours. */
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1, at = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > eps) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function car(name) {
  const subs = carData(name).split("M").slice(1).map((s) => s.replace("Z", "").split("L").map((p) => p.trim().split(/\s+/).map(Number)));
  const all = subs.flat();
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const c = Math.cos(rad(CAR.rot)), s = Math.sin(rad(CAR.rot));
  const place = ([x, y]) => { const px = (x - cx) * CAR.scale, py = (y - cy) * CAR.scale; return [CAR.x + px * c - py * s, CAR.y + px * s + py * c]; };
  return subs.map((sub) => toPath(simplify(sub.map(place), CAR.simplify))).join("");
}

// ---------------------------------------------------------------- colours and the weave
const STOPS = {
  ring: [[0, "#a9772f"], [0.13, "#f8ecc6"], [0.3, "#d9b877"], [0.62, "#c88a45"], [1, "#b8692f"]], // metallic gold
  car: [[0, "#ff7a45"], [0.42, "#e0aa5c"], [1, "#f1d79a"]],                                       // ember tail lights, then gold
};
const GRAD = { ring: { x1: 10, y1: 22, x2: 92, y2: 84 }, car: { x1: 2, y1: 0, x2: 98, y2: 0 } }; // absolute, so every part matches
const CLIP_X = 33;   // left of this the ring is redrawn over the car, so the car passes behind the thick stroke
const HALO = { full: 1.2, bold: 1.6 }; // the car's dark edge, which keeps it distinct where it crosses the ring

const O = ring(RING), OB = ring(RING_BOLD);
const CF = car("FULL"), CB = car("BOLD");

const stops = (k) => STOPS[k].map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("");
const grad = (id, k) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${GRAD[k].x1}" y1="${GRAD[k].y1}" x2="${GRAD[k].x2}" y2="${GRAD[k].y2}">${stops(k)}</linearGradient>`;
/** The whole mark as SVG. Shapes are defined once and reused, so the files stay small. */
const mark = (ringD, carD, halo) =>
  `<defs>${grad("r", "ring")}${grad("c", "car")}<clipPath id="l"><rect x="0" y="0" width="${CLIP_X}" height="100"/></clipPath>` +
  `<path id="o" d="${ringD}"/><path id="v" d="${carD}"/></defs>` +
  `<use href="#o" fill="url(#r)"/>` +
  `<use href="#v" fill="#0a0a0a" stroke="#0a0a0a" stroke-width="${halo}" stroke-linejoin="round"/>` +
  `<use href="#v" fill="url(#c)"/>` +
  `<use href="#o" fill="url(#r)" clip-path="url(#l)"/>`;

const dir = process.env.OUT_DIR ?? new URL("..", import.meta.url).pathname;
const at = (p) => (process.env.OUT_DIR ? `${dir}/${p.split("/").pop()}` : `${dir}${p}`);
if (process.env.OUT_DIR) mkdirSync(dir, { recursive: true });

writeFileSync(at("public/logo.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${mark(O, CF, HALO.full)}</svg>\n`);
writeFileSync(at("public/favicon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0a0a0a"/>${mark(OB, CB, HALO.bold)}</svg>\n`);
writeFileSync(at("src/components/omarkPaths.ts"), `/**
 * Shape data for the Opus mark, shared by the SVG mark and the canvas orbit. Coordinates are in a 0..100 box.
 * GENERATED by scripts/make-logo.mjs. Change the numbers there, not here.
 */
export const RING_FULL = "${O}";
export const RING_BOLD = "${OB}";
export const CAR_FULL = "${CF}";
export const CAR_BOLD = "${CB}";
/** The car's dark edge, in drawing units, for the full and the bold version. */
export const HALO = ${JSON.stringify(HALO)} as const;
/** Left of this x, the ring is drawn again over the car, so the car passes behind the thick left stroke. */
export const CLIP_X = ${CLIP_X};
/** Colour stops: [position 0..1, colour]. Gradients run in absolute drawing coordinates, so all parts match. */
export const STOPS = ${JSON.stringify(STOPS)} as const;
export const GRAD = ${JSON.stringify(GRAD)} as const;
`);
console.log(`wrote the mark: ring ${O.length} + car ${CF.length} chars (full), ${OB.length} + ${CB.length} (bold), to ${dir}`);
