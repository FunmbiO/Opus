// Sets which websites may put the public demo in an iframe (the CSP frame-ancestors rule in vercel.json).
//   node scripts/set-embed-origin.mjs https://your-portfolio.com https://www.your-portfolio.com
// Only exact https origins are accepted (plus http://localhost for testing). Wildcards are refused on purpose.
import { readFileSync, writeFileSync } from "node:fs";

// Two files hold the same headers: the repo root (deploy from the root) and dashboard/ (deploy with Root Directory = dashboard).
const files = [new URL("../../vercel.json", import.meta.url), new URL("../vercel.json", import.meta.url)];
const origins = process.argv.slice(2);
if (!origins.length || origins.length > 6) {
  console.error("Give 1 to 6 origins, for example: node scripts/set-embed-origin.mjs https://my-portfolio.vercel.app");
  process.exit(1);
}
for (const o of origins) {
  let u;
  try { u = new URL(o); } catch { console.error(`Not a URL: ${o}`); process.exit(1); }
  const local = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  if ((u.protocol !== "https:" && !local) || o !== u.origin || o.includes("*")) {
    console.error(`Use an exact origin like https://example.com (no path, no wildcard, https only): ${o}`);
    process.exit(1);
  }
}

for (const file of files) {
  const cfg = JSON.parse(readFileSync(file, "utf8"));
  let changed = false;
  for (const block of cfg.headers) for (const h of block.headers) {
    if (h.key !== "Content-Security-Policy") continue;
    h.value = h.value.replace(/frame-ancestors [^;]*/, `frame-ancestors 'self' ${origins.join(" ")}`);
    changed = true;
  }
  if (!changed) { console.error(`No Content-Security-Policy found in ${file.pathname}.`); process.exit(1); }
  writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
}
console.log(`Embedding allowed from: ${origins.join(", ")}`);
