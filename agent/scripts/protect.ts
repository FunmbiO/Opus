import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { sealString } from "../src/crypto.js";

/** Replaces the secrets in .env with sealed values (enc1:...). Opus reads them as normal; the file alone reveals nothing. */
const KEYS = ["ANTHROPIC_API_KEY", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "TELEGRAM_BOT_TOKEN", "API_TOKEN", "PLAID_SECRET"];
if (!existsSync(".env")) { console.error("No .env file here. Run this from the agent folder."); process.exit(1); }
const lines = readFileSync(".env", "utf8").split(/\r?\n/);
let n = 0;
const out = lines.map((l) => {
  const m = /^([A-Z_]+)=(.*)$/.exec(l);
  if (!m || !KEYS.includes(m[1]!)) return l;
  const v = m[2]!.trim().replace(/^["']|["']$/g, "");
  if (!v || v.startsWith("enc1:")) return l;
  n++;
  return `${m[1]}=${sealString(v)}`;
});
copyFileSync(".env", ".env.before-protect");
writeFileSync(".env", out.join("\n"));
console.log(n ? `Sealed ${n} secret${n === 1 ? "" : "s"} in .env.\nThe old file is saved as .env.before-protect. Start Opus and check it works, then delete that copy (it is not sealed).` : "Nothing to seal. Your secrets are already sealed or empty.");
