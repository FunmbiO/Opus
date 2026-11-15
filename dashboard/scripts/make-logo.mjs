// Draws the Opus "O" and writes the shape data. The O is calligraphy: a pen that is thick on the downstroke and a
// hairline on the upstroke, spiralling in at the end like a flourished capital, with a long hairline swash that
// sweeps across it like the roofline of the Opus car.
//
//   node scripts/make-logo.mjs                 writes src/components/omarkPaths.ts, public/logo.svg, public/favicon.svg
//   OUT_DIR=/some/folder node scripts/make-logo.mjs    writes there instead (for previewing)
//
// Everything is in a 0..100 box. Tweak the numbers in PEN and SWASH, rerun, and look at public/logo.svg.
import { mkdirSync, writeFileSync } from "node:fs";

const rad = (d) => (d * Math.PI) / 180;
const f = (n) => (Math.round(n * 10) / 10).toString();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- the O: a pen with thick downstrokes
const PEN = {
  cx: 50, cy: 52, rx: 27, ry: 36,   // size of the first loop
  lean: 13,                          // degrees the letter leans to the right
  start: 292, sweep: 478,            // the pen starts near the top and goes round counter-clockwise, past a full turn
  spiral: 0.5,                      // how far the extra turn curls inwards (1 = no curl)
  thick: 11.6, hair: 0.9,           // widest and thinnest the line gets
  press: 2.5,                       // how quickly it thickens on the downstroke (higher = sharper contrast)
  taper: 0.1,                        // how much of each end tapers to a point
  steps: 360,
};

function penPoint(t, P) {
  const turned = P.sweep * t;
  const a = rad(P.start - turned);
  const k = turned <= 360 ? 1 : 1 - (1 - P.spiral) * smooth(0, 1, (turned - 360) / (P.sweep - 360));
  const x = P.rx * k * Math.cos(a), y = P.ry * k * Math.sin(a);
  const c = Math.cos(rad(P.lean)), s = Math.sin(rad(P.lean));
  return [P.cx + x * c - y * s, P.cy + x * s + y * c];
}

/** Turns a centre-line and a width function into one closed outline. */
function ribbon(centre, widthAt) {
  const left = [], right = [];
  for (let i = 0; i < centre.length; i++) {
    const p = centre[i], q = centre[Math.min(centre.length - 1, i + 1)], o = centre[Math.max(0, i - 1)];
    let tx = q[0] - o[0], ty = q[1] - o[1];
    const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
    const w = widthAt(i / (centre.length - 1), tx, ty) / 2;
    left.push([p[0] - ty * w, p[1] + tx * w]);
    right.push([p[0] + ty * w, p[1] - tx * w]);
  }
  const pts = [...left, ...right.reverse()];
  return "M" + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L") + "Z";
}

function theO(P = PEN) {
  const centre = Array.from({ length: P.steps + 1 }, (_, i) => penPoint(i / P.steps, P));
  return ribbon(centre, (t, tx, ty) => {
    const down = Math.max(0, ty);                            // moving downward = pressing down
    const turned = P.sweep * t;
    const lift = turned <= 360 ? 1 : 1 - 0.9 * smooth(0, 0.3, (turned - 360) / (P.sweep - 360)); // the curl is a hairline
    const w = P.hair + (P.thick - P.hair) * Math.pow(down, P.press) * lift;
    const env = smooth(0, P.taper, t) * (1 - smooth(1 - P.taper * 1.6, 1, t)); // pointed at both ends
    return Math.max(0.25, w * (0.18 + 0.82 * env));
  });
}

// ---------------------------------------------------------------- the swash: a pointed pen, like the car's roofline
const SWASH = {
  // a long low sweep from the lower left, rising over the letter and tapering away to the right
  pts: [[0, 74], [16, 69], [36, 56], [57, 42], [76, 35], [90, 37], [100, 45]],
  width: 2.3, hair: 0.45, steps: 220,
};

function bezierThrough(pts, steps) {
  // Catmull-Rom through the points, so the swash passes smoothly through each one
  const out = [];
  const n = pts.length;
  for (let s = 0; s < n - 1; s++) {
    const p0 = pts[Math.max(0, s - 1)], p1 = pts[s], p2 = pts[s + 1], p3 = pts[Math.min(n - 1, s + 2)];
    const per = Math.round(steps / (n - 1));
    for (let i = 0; i < per; i++) {
      const t = i / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(pts[n - 1]);
  return out;
}

// a second, finer line underneath, like the car's lower body lines
const LINE2 = { pts: [[6, 84], [26, 80], [46, 72], [64, 63]], width: 1.1, hair: 0.3, steps: 140 };

function swash(S = SWASH) {
  const centre = bezierThrough(S.pts, S.steps);
  return ribbon(centre, (t) => S.hair + S.width * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 1.4));
}

// ---------------------------------------------------------------- output
const O = theO();
const SW = swash();
const BOLD = theO({ ...PEN, thick: 17.5, hair: 3.1, press: 1.6 });
const SW_BOLD = swash({ ...SWASH, width: 4.2, hair: 1.1 });
const L2 = swash(LINE2);

// Colours, shared by the SVG mark, the canvas orbit and the icons. Each is [position 0..1, colour].
const STOPS = {
  ring: [[0, "#a9772f"], [0.13, "#f8ecc6"], [0.3, "#d9b877"], [0.62, "#c88a45"], [1, "#b8692f"]],  // metallic ribbon
  swash: [[0, "#ff7a45"], [0.6, "#d2b072"], [1, "#f6e8bf"]],                                         // ember, then gold
  line: [[0, "#b8863e"], [1, "#f1dfa8"]],
};
const stops = (k) => STOPS[k].map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("");
const defs = (id = "") => `<defs><linearGradient id="r${id}" x1="0" y1=".15" x2="1" y2=".85">${stops("ring")}</linearGradient><linearGradient id="a${id}" x1="0" y1="0" x2="1" y2="0">${stops("swash")}</linearGradient><linearGradient id="b${id}" x1="0" y1="0" x2="1" y2="0">${stops("line")}</linearGradient></defs>`;
const mark = (o, sw, id = "", l2 = "") => `${defs(id)}${l2 ? `<path fill="url(#b${id})" d="${l2}"/>` : ""}<path fill="url(#a${id})" d="${sw}"/><path fill="url(#r${id})" d="${o}"/>`;

const dir = process.env.OUT_DIR ?? new URL("..", import.meta.url).pathname;
const at = (p) => (process.env.OUT_DIR ? `${dir}/${p.split("/").pop()}` : `${dir}${p}`);
if (process.env.OUT_DIR) mkdirSync(dir, { recursive: true });

writeFileSync(at("public/logo.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${mark(O, SW, "", L2)}</svg>\n`);
writeFileSync(at("public/favicon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0a0a0a"/>${mark(BOLD, SW_BOLD)}</svg>\n`);
writeFileSync(at("src/components/omarkPaths.ts"), `/**
 * Shape data for the Opus O, shared by the SVG mark and the canvas orbit. Coordinates are in a 0..100 box.
 * GENERATED by scripts/make-logo.mjs. Change the numbers there, not here.
 */
export const O_FULL = "${O}";
export const O_BOLD = "${BOLD}";
export const SWASH_FULL = "${SW}";
export const SWASH_BOLD = "${SW_BOLD}";
export const LINE_FULL = "${L2}";
/** Colour stops: [position 0..1, colour]. */
export const STOPS = ${JSON.stringify(STOPS)} as const;
`);
console.log(`wrote logo (${(O.length + SW.length) >> 10} KB of path data) to ${dir}`);
