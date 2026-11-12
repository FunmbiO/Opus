// Security tests. Run: npm run test:security
// Part 1 tests the building blocks. Part 2 starts the real server and attacks it over HTTP.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { request } from "node:http";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Gate, RateLimiter, classify, clientIp, hostAllowed, publicMessage, safeJoin } from "../src/security.js";
import { HeaderError, cleanHeader, cleanRecipients, encodeHeader, firstAddress, safeCopied } from "../src/mailsafe.js";

let n = 0;
const ok = (name: string) => { n += 1; console.log(`  ok  ${name}`); };

// ---------------------------------------------------------------- Part 1: building blocks
console.log("Building blocks");

{ // rate limiter: allows up to max, then says how long to wait, then recovers
  let t = 1_000_000;
  const rl = new RateLimiter(() => t);
  const lim = { max: 3, windowMs: 60_000 };
  assert.equal(rl.take("a", lim), 0); assert.equal(rl.take("a", lim), 0); assert.equal(rl.take("a", lim), 0);
  const wait = rl.take("a", lim);
  assert.ok(wait >= 1 && wait <= 60, `wait ${wait}`);
  assert.equal(rl.take("b", lim), 0, "another caller is unaffected");
  t += 61_000;
  assert.equal(rl.take("a", lim), 0, "recovers after the window");
  ok("rate limiter blocks, isolates callers and recovers");
}
{ // memory stays bounded under a flood of distinct callers
  const rl = new RateLimiter();
  for (let i = 0; i < 12_000; i++) rl.take(`ip${i}`, { max: 1, windowMs: 60_000 });
  assert.ok((rl as unknown as { hits: Map<string, unknown> }).hits.size <= 5001);
  ok("rate limiter memory is bounded");
}
{ const g = new Gate(2); const a = g.enter(), b = g.enter(), c = g.enter();
  assert.ok(a && b && c === null, "third entry refused");
  a!(); a!(); // releasing twice must not free two slots
  assert.ok(g.enter() && g.enter() === null);
  ok("AI gate caps concurrency and ignores double release"); }

{ const r = (m: string, p: string) => classify(m, p);
  assert.equal(r("POST", "/api/auth/login").name, "auth");
  assert.equal(r("POST", "/api/ask").name, "ai");
  assert.equal(r("POST", "/api/run/triage").name, "ai");
  assert.equal(r("POST", "/api/approvals/x/approve").name, "ai");
  assert.equal(r("POST", "/api/approvals/x/dismiss").name, "api");
  assert.equal(r("POST", "/api/contracts/4/send").name, "outbound");
  assert.equal(r("POST", "/api/files/upload").name, "upload");
  assert.equal(r("GET", "/").name, "static");
  assert.ok(r("POST", "/api/auth/login").limit.max < r("GET", "/api/state").limit.max);
  ok("routes get the right budget (sensitive ones are smaller)"); }

{ const root = resolve("/srv/app/dist");
  for (const bad of ["/../secret", "/%2e%2e/secret", "/..%2fsecret", "/assets/../../secret", "/a\\..\\b", "/x%00.js", "/.env", "/assets/.hidden", "/%2e%2e%2f%2e%2e%2fetc/passwd", "/%zz"]) {
    assert.equal(safeJoin(root, bad), null, `should refuse ${bad}`);
  }
  assert.equal(safeJoin(root, "/assets/app.js"), join(root, "assets", "app.js"));
  assert.equal(safeJoin(root, "/index.html"), join(root, "index.html"));
  // the old check, startsWith, would have let a sibling folder through
  assert.ok(resolve("/srv/app/dist-preview/x").startsWith(root), "premise: startsWith is fooled by a sibling");
  assert.equal(safeJoin(root, "/../dist-preview/x"), null);
  ok("static paths cannot leave the folder, including sibling folders"); }

{ assert.ok(hostAllowed("localhost:8787")); assert.ok(hostAllowed("127.0.0.1")); assert.ok(hostAllowed("100.79.122.88:443")); assert.ok(hostAllowed("[::1]:8787"));
  assert.ok(hostAllowed("opus.tail1b2c3.ts.net"));
  assert.ok(!hostAllowed("evil.example.com")); assert.ok(!hostAllowed("opus.ts.net.evil.com")); assert.ok(!hostAllowed(undefined)); assert.ok(!hostAllowed(""));
  assert.ok(!hostAllowed("evil.com", ["other.com"])); assert.ok(hostAllowed("my.domain.com", ["my.domain.com"]));
  ok("host check accepts your names and rejects DNS-rebinding hosts"); }

{ const req = (peer: string, xff?: string) => ({ socket: { remoteAddress: peer }, headers: xff ? { "x-forwarded-for": xff } : {} }) as never;
  assert.equal(clientIp(req("127.0.0.1", "100.1.2.3")), "100.1.2.3");
  assert.equal(clientIp(req("127.0.0.1", "6.6.6.6, 100.1.2.3")), "100.1.2.3", "a forged first entry is ignored");
  assert.equal(clientIp(req("203.0.113.9", "1.1.1.1")), "203.0.113.9", "forwarded header is not believed from outside");
  assert.equal(clientIp(req("127.0.0.1", "not an ip <script>")), "127.0.0.1");
  ok("client address resists forged X-Forwarded-For"); }

{ assert.equal(publicMessage(new Error("That file is over 15 MB.")), "That file is over 15 MB.");
  for (const leak of ["ENOENT: no such file or directory, open '/app/agent/data/aide.db'", "SQLITE_ERROR: no such table: x", "Cannot read properties of undefined", "at Object.run (/app/agent/src/db.ts:12:3)", "x".repeat(300)]) {
    assert.equal(publicMessage(new Error(leak)), "Something went wrong.", leak.slice(0, 40));
  }
  ok("error responses do not leak paths or internals"); }

{ // email header injection
  for (const bad of ["a@b.com\r\nBcc: x@y.com", "a@b.com\nBcc: x@y.com", "a@b.com Bcc: x@y.com", "a@b.com\0"]) {
    assert.throws(() => cleanRecipients(bad), HeaderError, JSON.stringify(bad));
    assert.throws(() => cleanHeader(bad, "Subject"), HeaderError);
    assert.throws(() => encodeHeader(bad), HeaderError);
    assert.throws(() => firstAddress(bad), HeaderError);
    assert.equal(safeCopied(bad), null);
  }
  assert.throws(() => cleanRecipients("a@b.com, <script>@x.com"), HeaderError);
  assert.throws(() => cleanRecipients("a@b.com,b@c.com,d@e.com,f@g.com,h@i.com,j@k.com"), HeaderError, "more than 5");
  assert.equal(cleanRecipients("priya@example.com"), "priya@example.com");
  assert.equal(cleanRecipients('"Doe, John" <j@x.com>, Sam <s@y.org>'), '"Doe, John" <j@x.com>, Sam <s@y.org>');
  assert.equal(firstAddress('"Doe, John" <j@x.com>, other@y.com'), "j@x.com", "replies go to the first person only");
  assert.equal(firstAddress("plain@x.com"), "plain@x.com");
  assert.equal(encodeHeader("Hello"), "Hello");
  assert.match(encodeHeader("Café ☕"), /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
  ok("email headers reject line breaks and encode non-ASCII"); }

// ---------------------------------------------------------------- Part 2: the real server
console.log("Running server");

const freePort = () => new Promise<number>((res) => { const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const port = await freePort();
const work = mkdtempSync(join(tmpdir(), "opus-sec-"));
const server: ChildProcess = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", "serve", "--mock"], {
  env: { PATH: process.env.PATH ?? "", HOME: work, HOST: "127.0.0.1", PORT: String(port), DB_PATH: join(work, "t.db"), OPUS_KEY_DIR: join(work, "keys"), MOCK: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout!.on("data", (d) => { log += d; });
server.stderr!.on("data", (d) => { log += d; });
const stop = () => { try { server.kill("SIGKILL"); } catch { /* already gone */ } };
process.on("exit", stop);
for (let i = 0; i < 100 && !log.includes("Opus is running"); i++) await new Promise((r) => setTimeout(r, 100));
assert.ok(log.includes("Opus is running"), `server did not start:\n${log}`);

interface Res { status: number; headers: Record<string, string | string[] | undefined>; body: string }
const call = (method: string, path: string, opts: { headers?: Record<string, string>; body?: string } = {}) =>
  new Promise<Res>((resolveCall, reject) => {
    const r = request({ host: "127.0.0.1", port, method, path, headers: opts.headers, agent: false }, (res) => {
      let body = ""; res.on("data", (d) => { body += d; }); res.on("end", () => resolveCall({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    r.on("error", reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });
/** Sends a hand-written request line, so we can send things Node's own client would refuse. Returns the status code. */
const raw = (requestLine: string) =>
  new Promise<number>((resolveRaw) => {
    const sock = connect(port, "127.0.0.1", () => sock.write(`${requestLine} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`));
    let data = "";
    sock.on("data", (d) => { data += d; });
    sock.on("close", () => resolveRaw(Number(/^HTTP\/1\.1 (\d{3})/.exec(data)?.[1] ?? 0)));
    sock.on("error", () => resolveRaw(0));
    setTimeout(() => sock.destroy(), 4000);
  });
const alive = async () => (await call("GET", "/api/auth/status")).status === 200;

try {
  { const r = await call("GET", "/api/auth/status");
    assert.equal(r.status, 200);
    const csp = String(r.headers["content-security-policy"]);
    for (const want of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'", "script-src 'self' https://cdn.plaid.com"]) assert.ok(csp.includes(want), `CSP missing ${want}`);
    assert.ok(!/script-src[^;]*unsafe-inline/.test(csp) && !/script-src[^;]*unsafe-eval/.test(csp), "scripts must not allow inline or eval");
    assert.equal(r.headers["x-frame-options"], "DENY");
    assert.equal(r.headers["x-content-type-options"], "nosniff");
    assert.equal(r.headers["referrer-policy"], "no-referrer");
    assert.equal(r.headers["cross-origin-opener-policy"], "same-origin");
    assert.match(String(r.headers["permissions-policy"]), /camera=\(\)/);
    assert.equal(r.headers["strict-transport-security"], undefined, "no HSTS over plain http");
    const h = await call("GET", "/api/auth/status", { headers: { "x-forwarded-proto": "https" } });
    assert.match(String(h.headers["strict-transport-security"]), /max-age=\d+/);
    ok("security headers on every response (HSTS only over https)"); }

  { const page = await call("GET", "/");
    assert.ok(String(page.headers["content-security-policy"]).includes("frame-ancestors 'none'"), "the page itself is protected too");
    ok("the page is served with the same protections"); }

  { assert.equal((await call("GET", "/api/auth/status", { headers: { host: "evil.example.com" } })).status, 421);
    assert.equal((await call("GET", "/api/auth/status", { headers: { host: "opus.tail1b2c3.ts.net" } })).status, 200);
    assert.equal((await call("GET", "/api/auth/status", { headers: { host: `localhost:${port}` } })).status, 200);
    ok("unknown Host headers are refused (DNS rebinding)"); }

  { // the crash: one bad URL used to take the whole process down
    for (const bad of ["//[", "//a b", "http://[::1", "/%", "/\u0001"]) {
      const status = await raw(`GET ${bad}`);
      assert.ok([200, 400, 404, 414].includes(status), `${JSON.stringify(bad)} -> ${status}`);
      assert.ok(await alive(), `server died after ${JSON.stringify(bad)}`);
    }
    ok("malformed URLs get an answer and the server stays up"); }

  { for (const p of ["/../../etc/passwd", "/%2e%2e/%2e%2e/etc/passwd", "/..%2f..%2fetc%2fpasswd", "/.env", "/assets/../../agent/.env", "/%00", "/..\\..\\etc\\passwd"]) {
      const r = await call("GET", p).catch(() => ({ status: -1, body: "" }) as Res);
      assert.ok(!/root:.*:0:0|ANTHROPIC_API_KEY|OPUS_KEY/.test(r.body), `leaked via ${p}`);
    }
    assert.ok(await alive());
    ok("path traversal attempts leak nothing"); }

  { assert.equal((await call("TRACE", "/")).status, 405);
    assert.equal((await call("OPTIONS", "/api/state")).status, 405);
    assert.equal((await call("GET", "/" + "a".repeat(3000))).status, 414);
    ok("odd methods and oversized URLs are refused"); }

  { const hdr = { "content-type": "application/json" };
    assert.equal((await call("POST", "/api/auth/login", { headers: { "content-type": "text/plain" }, body: "x" })).status, 400);
    assert.equal((await call("POST", "/api/auth/login", { headers: hdr, body: "{not json" })).status, 400);
    assert.equal((await call("POST", "/api/auth/login", { headers: hdr, body: JSON.stringify({ password: "x".repeat(100_000) }) })).status, 400);
    assert.equal((await call("POST", "/api/auth/login", { headers: hdr, body: JSON.stringify({ password: { $ne: 1 } }) })).status === 500, false, "odd types must not cause a 500");
    assert.ok(await alive());
    ok("bad bodies (wrong type, invalid JSON, oversized, odd shapes) are refused cleanly"); }

  { // the first password cannot be claimed through a proxy that makes everything look local
    const r = await call("POST", "/api/auth/setup", { headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" }, body: JSON.stringify({ password: "correct horse battery staple" }) });
    assert.ok(r.status === 401 || r.status === 409, `forwarded setup got ${r.status}`);
    ok("first-password setup is refused when the request was forwarded"); }

  { // sign-in attempts: a small budget per caller. (Spoofed leading X-Forwarded-For entries do not reset it.)
    let blocked = 0, retry = "";
    for (let i = 0; i < 20; i++) {
      const r = await call("POST", "/api/auth/login", { headers: { "content-type": "application/json", "x-forwarded-for": `10.0.${i}.1, 203.0.113.50` }, body: JSON.stringify({ password: "nope" }) });
      if (r.status === 429) { blocked += 1; retry = String(r.headers["retry-after"] ?? ""); }
    }
    assert.ok(blocked >= 6 && blocked <= 9, `expected about 8 blocked of 20, got ${blocked}`);
    assert.match(retry, /^\d+$/, "429 carries Retry-After");
    ok("sign-in is rate limited per caller and a forged header cannot dodge it"); }

  { let blocked = 0;
    for (let i = 0; i < 260; i++) { const r = await call("GET", "/api/auth/status", { headers: { "x-forwarded-for": "203.0.113.77" } }); if (r.status === 429) blocked += 1; }
    assert.ok(blocked >= 15, `expected the general API limit to engage, blocked ${blocked}`);
    assert.equal((await call("GET", "/api/auth/status", { headers: { "x-forwarded-for": "198.51.100.1" } })).status, 200, "a different caller is unaffected");
    ok("a flood from one caller is cut off and does not affect others"); }
} finally {
  stop();
}

console.log(`\nsecurity tests passed (${n} groups)`);
