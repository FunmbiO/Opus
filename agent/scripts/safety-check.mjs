// Fails if the code could ever send (outside the one approved path), delete, trash or relabel email.
// Run with: npm run safety   (also part of `npm run check`)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../src", import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") && files.push(p);
  }
})(root);

// The single, human-triggered send path. Everything else stays forbidden.
const SEND_FILE = "send.ts";
const SENDER_ALLOWED_IMPORTERS = ["server.ts"];

const rules = [
  { re: /gmail\.users\.\w+\.(send|delete|trash|untrash|modify|batchModify|batchDelete|import|insert)\b/, why: "Gmail call that can send, delete or change mail" },
  { re: /users\.drafts\.(send|delete|update)\b/, why: "Draft call that can send or change an existing draft" },
  { re: /users\.settings\b/, why: "Gmail settings access (filters, forwarding)" },
  { re: /name:\s*"(send|delete|trash|archive|cancel|forward|unsubscribe)[a-z_]*"/i, why: "A tool with a dangerous name" },
  { re: /^\s*(send|delete|trash|archive|forward|label)\w*\s*\(.*\)\s*:\s*Promise/m, why: "Mailbox interface method that can act on mail" },
];

let bad = 0;
const fail = (f, why, m) => {
  bad += 1;
  console.error(`FAIL ${f.replace(root, "src")}: ${why}\n     matched: ${m}`);
};
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const name = f.slice(f.lastIndexOf("/") + 1);

  // send.ts may call messages.send. Nothing else may, and nothing but the server may import send.ts.
  if (/users\.messages\.send\b|users\.drafts\.send\b/.test(text) && name !== SEND_FILE) {
    fail(f, "Only send.ts may send email", "users.messages.send");
  }
  if (/from\s+["']\.\/send\.js["']/.test(text) && !SENDER_ALLOWED_IMPORTERS.includes(name)) {
    fail(f, "Only server.ts may import send.ts (so the model can never reach it)", "import ./send.js");
  }
  if (name === SEND_FILE && /users\.drafts\.send\b/.test(text)) fail(f, "send.ts may only use messages.send", "users.drafts.send");

  for (const { re, why } of rules) {
    if (name === SEND_FILE && re.source.startsWith("gmail\\.users")) {
      // Inside send.ts, allow only messages.send out of the dangerous list.
      const m2 = /gmail\.users\.\w+\.(send|delete|trash|untrash|modify|batchModify|batchDelete|import|insert)\b/g;
      for (const hit of text.matchAll(m2)) if (hit[0] !== "gmail.users.messages.send") fail(f, why, hit[0]);
      continue;
    }
    const m = re.exec(text);
    if (m) fail(f, why, m[0].trim());
  }
}
if (bad) {
  console.error(`\nSafety check failed (${bad}). Opus must not be able to send (outside send.ts), delete or change mail.`);
  process.exit(1);
}
console.log(`Safety check passed in ${files.length} files: no delete, trash or modify calls; sending exists only in send.ts and only server.ts can reach it.`);
