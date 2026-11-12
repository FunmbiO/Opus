import { openString } from "../src/crypto.js";

/**
 * Prints secrets from .env in plain text, so you can copy them to another computer (such as your server).
 * Sealed values (enc1:...) only open on the computer and login that sealed them, so run this on THAT computer.
 *
 *   npx tsx --env-file=.env scripts/reveal.ts GOOGLE_CLIENT_SECRET GOOGLE_REFRESH_TOKEN ANTHROPIC_API_KEY
 *
 * It prints to your own screen only and changes nothing. Do not paste the output into a chat or an email.
 */
const ALLOWED = ["ANTHROPIC_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "TELEGRAM_BOT_TOKEN", "API_TOKEN", "PLAID_SECRET"];

const wanted = process.argv.slice(2);
if (!wanted.length) {
  console.error(`Name the values to show, for example:\n  reveal.ts GOOGLE_CLIENT_SECRET GOOGLE_REFRESH_TOKEN\nAllowed: ${ALLOWED.join(", ")}`);
  process.exit(1);
}

let bad = 0;
for (const name of wanted) {
  if (!ALLOWED.includes(name)) { console.error(`${name}: not one of the secrets Opus keeps (${ALLOWED.join(", ")})`); bad++; continue; }
  const raw = process.env[name];
  if (!raw) { console.error(`${name}: not set in .env`); bad++; continue; }
  try {
    console.log(`${name}=${openString(raw)}`);
  } catch (e) {
    console.error(`${name}: could not be opened here (${e instanceof Error ? e.message : e}). It can only be opened on the computer and Windows login that sealed it.`);
    bad++;
  }
}
if (bad) process.exit(1);
console.error("\nThese are secrets. Clear this window when you are done (type `cls`), and do not paste them anywhere public.");
