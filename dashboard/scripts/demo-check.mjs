// End-to-end check of the public demo, the way Vercel will serve it.
//   npm run build:demo && node scripts/demo-check.mjs
// It serves dashboard/dist-demo with the headers from ../vercel.json, then checks that the demo:
//   - makes no network calls to any server,  - contains no private-looking data,
//   - works under its own strict CSP,         - can be framed by your portfolio and by nobody else.
// Needs Playwright installed (a dev tool, not a dependency). Exits 1 if anything fails.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const root = new URL("..", import.meta.url).pathname;
const dist = resolve(root, "dist-demo");
const vercel = JSON.parse(readFileSync(resolve(root, "..", "vercel.json"), "utf8"));
const dashVercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));
if (!existsSync(dist)) { console.error("dist-demo is missing. Run: npm run build:demo"); process.exit(1); }

// The site that must be able to embed the demo. It comes from your portfolio's own canonical address
// (https://jaded-works.vercel.app). If your portfolio moves, run: PORTFOLIO_ORIGIN=https://new.example node scripts/demo-check.mjs
const PORTFOLIO = process.env.PORTFOLIO_ORIGIN ?? "https://jaded-works.vercel.app";

let passed = 0;
const ok = (m) => { passed += 1; console.log(`  ok  ${m}`); };

// ---- 1. the config itself -------------------------------------------------------------
const csp = vercel.headers.flatMap((b) => b.headers).find((h) => h.key === "Content-Security-Policy")?.value ?? "";
const ancestors = /frame-ancestors ([^;]*)/.exec(csp)?.[1]?.split(/\s+/) ?? [];
assert.ok(ancestors.length >= 2, "frame-ancestors is missing");
assert.ok(ancestors.includes(PORTFOLIO), `frame-ancestors must include your portfolio (${PORTFOLIO}); it has: ${ancestors.join(" ")}`);
assert.ok(!ancestors.includes("*") && !ancestors.some((a) => a.includes("*")), "frame-ancestors must not use wildcards");
assert.ok(ancestors.every((a) => a === "'self'" || a.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(a)), "frame-ancestors has a non-https origin");
for (const want of ["default-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(want), `CSP missing ${want}`);
assert.ok(!/script-src[^;]*(unsafe-inline|unsafe-eval)/.test(csp), "scripts must not allow inline or eval");
assert.ok(!vercel.headers.flatMap((b) => b.headers).some((h) => h.key === "X-Frame-Options"), "X-Frame-Options would override frame-ancestors and block the embed");
ok(`vercel.json is strict and allows framing only by: ${ancestors.join(" ")}`);

assert.deepEqual(dashVercel.headers, vercel.headers, "dashboard/vercel.json and the root vercel.json must have identical headers (run scripts/set-embed-origin.mjs to change both)");
assert.equal(dashVercel.outputDirectory, "dist-demo");
assert.equal(dashVercel.buildCommand, "npm run build:demo");
ok("dashboard/vercel.json matches the root config");

// ---- 2. nothing private in the build ---------------------------------------------------
const files = [];
(function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } })(dist);
const text = files.filter((f) => /\.(js|html|json|webmanifest|svg|css)$/.test(f)).map((f) => [f, readFileSync(f, "utf8")]);
const findings = [];
for (const [f, t] of text) {
  const rel = f.replace(dist, "");
  for (const m of t.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z.]{2,}/g)) if (!/@(example\.(com|org|net)|domain\.com|sample\.com|mail\.com)$/i.test(m[0]) && !/\.(png|svg|woff2?)$/i.test(m[0]) && !/^[a-z]+@\d/.test(m[0])) findings.push(`email-like in ${rel}: ${m[0]}`);
  for (const m of t.matchAll(/(?<![\w.#-])(?:\+?1[ .-]?)?\(?\b[2-9]\d{2}\)?[ .-]\d{3}[ .-]\d{4}\b/g)) if (!/555/.test(m[0])) findings.push(`phone-like in ${rel}: ${m[0]}`);
  for (const m of t.matchAll(/\b(sk-ant-[A-Za-z0-9_-]{10,}|tskey-[A-Za-z0-9-]{8,}|AIza[0-9A-Za-z_-]{20,}|enc1:[A-Za-z0-9+/=]{10,}|GOCSPX-[A-Za-z0-9_-]{10,}|ya29\.[A-Za-z0-9_-]{10,})/g)) findings.push(`secret-like in ${rel}: ${m[0].slice(0, 12)}...`);
}
assert.deepEqual(findings, [], `possible private data in the demo build:\n  ${findings.join("\n  ")}`);
ok(`no emails, phone numbers or secrets in ${text.length} built files`);

// ---- 3. serve it the way Vercel would --------------------------------------------------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };
const toRegex = (src) => new RegExp("^" + src.replace(/\//g, "\\/").replace(/\(\.\*\)/g, ".*").replace(/\./g, "\\.") + "$");
function headersFor(path) {
  const out = {};
  for (const b of vercel.headers) if (toRegex(b.source).test(path)) for (const h of b.headers) out[h.key.toLowerCase()] = h.value;
  return out;
}
function serve(path) {
  const p = normalize(path === "/" ? "/index.html" : path);
  let file = resolve(dist, "." + p);
  if (!file.startsWith(dist + "/") || !existsSync(file) || statSync(file).isDirectory()) file = null;
  if (!file) return { status: 404, headers: headersFor(path), body: Buffer.from("Not found") };
  return { status: 200, headers: { "content-type": MIME[extname(file)] ?? "application/octet-stream", ...headersFor(path) }, body: readFileSync(file) };
}
const server = createServer((req, res) => { const r = serve(new URL(req.url, "http://x").pathname); res.writeHead(r.status, r.headers); res.end(r.body); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
try {
  // ---- 4. behaviour ---------------------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const requests = [], violations = [], errors = [];
    page.on("request", (r) => requests.push(r.url()));
    page.on("console", (m) => { if (/content security policy|refused to/i.test(m.text())) violations.push(m.text().slice(0, 160)); });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(base + "/");
    await page.waitForTimeout(4500);
    assert.match(await page.locator(".banner").first().innerText(), /Demo with sample data/);
    for (const n of ["Clients", "Ask", "Budget", "Subscriptions", "Approvals", "Activity", "Today"]) { await page.locator(".nav-item", { hasText: n }).click(); await page.waitForTimeout(250); }
    await page.locator(".nav-item", { hasText: "Approvals" }).click();
    await page.keyboard.press("a"); await page.waitForTimeout(400);
    await page.locator(".nav-item", { hasText: "Ask" }).click();
    await page.locator(".composer textarea").fill("hello"); await page.keyboard.press("Enter"); await page.waitForTimeout(800);
    const calls = requests.filter((u) => /\/api\//.test(u));
    assert.deepEqual(calls, [], `the demo called the API: ${calls.join(", ")}`);
    const foreign = requests.filter((u) => !u.startsWith(base) && !/fonts\.(googleapis|gstatic)\.com|^data:|^blob:/.test(u));
    assert.deepEqual(foreign, [], `requests to other sites: ${foreign.join(", ")}`);
    assert.deepEqual(violations, [], `CSP violations: ${violations.join(" | ")}`);
    assert.deepEqual(errors, [], `page errors: ${errors.join(" | ")}`);
    ok("every page works, nothing calls an API or another site, and the CSP is never violated");
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
    await page.goto(base + "/?embed=1");
    await page.waitForTimeout(900);
    assert.equal(await page.locator(".boot-screen").count(), 0, "embed mode skips the opening animation");
    assert.equal(await page.locator(".install-tip").count(), 0, "embed mode has no install tip");
    assert.ok((await page.locator(".tabbar").count()) > 0);
    ok("?embed=1 skips the opening animation and the install tip");
    await page.close();
  }

  // ---- 5. who may frame it ---------------------------------------------------------------
  const demoHost = "https://opus-demo.test";
  const ctx = await browser.newContext();
  await ctx.route(demoHost + "/**", async (route) => {
    const r = serve(new URL(route.request().url()).pathname);
    await route.fulfill({ status: r.status, headers: r.headers, body: r.body });
  });
  const framed = async (parent) => {
    const page = await ctx.newPage();
    await page.route(parent + "/", (route) => route.fulfill({ contentType: "text/html", body: `<iframe id="f" src="${demoHost}/?embed=1" width="420" height="700" sandbox="allow-scripts allow-same-origin"></iframe>` }));
    await page.goto(parent + "/");
    await page.waitForTimeout(2200);
    const f = page.frames().find((x) => x.url().startsWith(demoHost));
    const rendered = !!f && (await f.locator("#root").count().catch(() => 0)) > 0 && (await f.locator(".tabbar").count().catch(() => 0)) > 0;
    await page.close();
    return rendered;
  };
  const allowed = PORTFOLIO;
  assert.ok(await framed(allowed), `the demo should render inside ${allowed}`);
  ok(`the demo renders inside an iframe on ${allowed}, with the same sandbox your portfolio uses`);
  assert.equal(await framed("https://evil.example"), false, "a stranger's page must not be able to frame it");
  assert.equal(await framed("https://jaded-works.vercel.app.evil.example"), false, "a look-alike domain must not be able to frame it");
  ok("pages on other sites, including look-alike domains, cannot frame it");
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
console.log(`\ndemo check passed (${passed} groups)`);
