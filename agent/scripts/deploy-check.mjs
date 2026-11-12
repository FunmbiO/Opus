// Fails if the Docker/Tailscale setup could expose Opus or leak secrets.
// Run with: npm run check:deploy   (also part of `npm run check`)
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url).pathname;
const read = (f) => (existsSync(root + f) ? readFileSync(root + f, "utf8") : null);
// Lines that are not comments.
const code = (t) => t.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

const compose = read("docker-compose.yml");
const dockerfile = read("Dockerfile");
const dockerignore = read(".dockerignore");
const serve = read("deploy/tailscale-serve.json");
const envExample = read(".env.example");

let bad = 0;
const fail = (why) => { bad += 1; console.error(`FAIL ${why}`); };

for (const [name, text] of [["docker-compose.yml", compose], ["Dockerfile", dockerfile], [".dockerignore", dockerignore], ["deploy/tailscale-serve.json", serve]]) {
  if (text == null) fail(`${name} is missing`);
}

if (compose) {
  const c = code(compose);
  if (/^\s*ports\s*:/m.test(c)) fail("docker-compose.yml publishes ports. Opus must only be reachable through Tailscale.");
  if (/network_mode\s*:\s*["']?host/.test(c)) fail("docker-compose.yml uses host networking.");
  if (/privileged\s*:\s*true/.test(c)) fail("docker-compose.yml runs a privileged container.");
  if (/0\.0\.0\.0/.test(c)) fail("docker-compose.yml mentions 0.0.0.0.");
  if (!/network_mode\s*:\s*service:tailscale/.test(c)) fail("opus must share the tailscale container's network (network_mode: service:tailscale).");
  if (!/cap_drop\s*:\s*\n\s*-\s*ALL/.test(c)) fail("opus must drop all Linux capabilities (cap_drop: ALL).");
  if (!/no-new-privileges:true/.test(c)) fail("opus must set no-new-privileges.");
  // environment: beats env_file, so these cannot be overridden from agent/.env.
  if (!/^\s+HOST\s*:\s*["']?127\.0\.0\.1["']?\s*$/m.test(c)) fail("docker-compose.yml must pin HOST: 127.0.0.1 in environment (it wins over agent/.env).");
  if (!/^\s+PORT\s*:\s*["']?8787["']?\s*$/m.test(c)) fail("docker-compose.yml must pin PORT: 8787 so it matches deploy/tailscale-serve.json.");
  if (!/^\s+OPUS_KEY_DIR\s*:\s*\/keys\s*$/m.test(c)) fail("docker-compose.yml must pin OPUS_KEY_DIR: /keys.");
  if (!/-\s*data:\/app\/agent\/data\b/.test(c)) fail("the data volume must be mounted at /app/agent/data.");
  if (!/-\s*keys:\/keys\b/.test(c)) fail("the master key must live on its own volume (keys:/keys), apart from data.");
  if (/TS_AUTHKEY\s*:\s*["']?tskey-/.test(c)) fail("a Tailscale auth key is written into docker-compose.yml.");
  if (!/TS_AUTHKEY\s*:\s*\$\{TS_AUTHKEY:\?/.test(c)) fail("TS_AUTHKEY must be required from .env (${TS_AUTHKEY:?...}).");
}

if (dockerfile) {
  const d = code(dockerfile);
  if (!/^ENV[\s\S]*\bHOST=127\.0\.0\.1\b/m.test(d)) fail("Dockerfile must set HOST=127.0.0.1.");
  if (/HOST=0\.0\.0\.0/.test(d)) fail("Dockerfile binds HOST=0.0.0.0.");
  if (!/^USER\s+node\s*$/m.test(d)) fail("Dockerfile must run as USER node.");
  if (/COPY[^\n]*\.env\b/.test(d) && !/\.env\.example/.test(d)) fail("Dockerfile copies a .env file into the image.");
  if (/(tskey-|sk-ant-)[A-Za-z0-9]/.test(d)) fail("Dockerfile contains something that looks like a secret.");
  // The dashboard build imports ../../shared/*.json, so that stage must have it (a missing folder only fails inside the image build).
  const dashStage = d.split(/^FROM\s/m).find((st) => /^node[^\n]*\bAS\s+dashboard\b/i.test(st)) ?? "";
  if (!/COPY\s+shared\/\s+\/app\/shared\/?/.test(dashStage)) fail("the dashboard build stage must COPY shared/ /app/shared/ (the dashboard imports it).");
  // NODE_ENV=production makes `npm ci` skip devDependencies, and tsx (what runs the agent) is one.
  const runStage = d.split(/^FROM\s/m).find((st) => /\bAS\s+run\b/i.test(st)) ?? "";
  if (/NODE_ENV=production/.test(runStage) && /^RUN\s+npm\s+ci(?!.*--include=dev)/m.test(runStage)) fail("the run stage sets NODE_ENV=production, so `npm ci` needs --include=dev or tsx will be missing.");
  if (!/OPUS_KEY_DIR=\/keys/.test(d)) fail("Dockerfile must point OPUS_KEY_DIR at /keys (a separate volume).");
}

if (dockerignore) {
  for (const need of [".env", "agent/style.md", "seed/*.json", "**/data", ".git"]) {
    if (!dockerignore.split("\n").some((l) => l.trim() === need)) fail(`.dockerignore must exclude ${need}.`);
  }
}

if (serve) {
  if (/AllowFunnel/i.test(serve)) fail("tailscale-serve.json enables Funnel, which puts Opus on the public internet.");
  try {
    const j = JSON.parse(serve);
    const handlers = Object.values(j.Web ?? {}).flatMap((w) => Object.values(w.Handlers ?? {}));
    if (!handlers.length || !handlers.every((h) => /^http:\/\/127\.0\.0\.1:\d+/.test(h.Proxy ?? ""))) fail("tailscale-serve.json must proxy only to http://127.0.0.1:<port>.");
  } catch { fail("deploy/tailscale-serve.json is not valid JSON."); }
}

if (envExample && /(tskey-|sk-ant-)[A-Za-z0-9]/.test(envExample)) fail(".env.example contains something that looks like a real secret.");

if (bad) {
  console.error(`\nDeploy check failed (${bad}). Opus must stay reachable only through Tailscale, with no secrets in the image.`);
  process.exit(1);
}
console.log("Deploy check passed: no published ports, loopback only, Tailscale-only access, no Funnel, key on its own volume, no secrets baked in.");
