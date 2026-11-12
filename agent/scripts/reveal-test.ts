// Checks scripts/reveal.ts with real sealed values. Run: npm run test:reveal
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const keyA = mkdtempSync(join(tmpdir(), "opus-keyA-"));
const keyB = mkdtempSync(join(tmpdir(), "opus-keyB-"));

// Seal two values with key A (the "Windows computer").
process.env.OPUS_KEY_DIR = keyA;
const { sealString } = await import("../src/crypto.js");
const sealedSecret = sealString("super-secret-value-123");
const sealedToken = sealString("1//refresh-token-xyz");
assert.ok(sealedSecret.startsWith("enc1:"));

const tsx = join(process.cwd(), "node_modules", ".bin", "tsx");
const reveal = (keyDir: string, env: Record<string, string>, ...names: string[]) =>
  spawnSync(tsx, ["scripts/reveal.ts", ...names], {
    env: { PATH: process.env.PATH ?? "", OPUS_KEY_DIR: keyDir, ...env },
    encoding: "utf8",
  });

// 1. With the right key, sealed values come back in plain text; plain values pass through.
const ok = reveal(keyA, { GOOGLE_CLIENT_SECRET: sealedSecret, GOOGLE_REFRESH_TOKEN: sealedToken, GOOGLE_CLIENT_ID: "abc.apps.googleusercontent.com" },
  "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GOOGLE_CLIENT_ID");
assert.equal(ok.status, 0, ok.stderr);
assert.match(ok.stdout, /^GOOGLE_CLIENT_SECRET=super-secret-value-123$/m);
assert.match(ok.stdout, /^GOOGLE_REFRESH_TOKEN=1\/\/refresh-token-xyz$/m);
assert.match(ok.stdout, /^GOOGLE_CLIENT_ID=abc\.apps\.googleusercontent\.com$/m);

// 2. With a different key (as on the server), it fails and prints no secret.
const wrong = reveal(keyB, { GOOGLE_CLIENT_SECRET: sealedSecret }, "GOOGLE_CLIENT_SECRET");
assert.notEqual(wrong.status, 0);
assert.ok(!wrong.stdout.includes("super-secret-value-123"));
assert.match(wrong.stderr, /could not be opened here/);

// 3. Only the secrets Opus keeps can be asked for (it is not a way to dump the environment).
const other = reveal(keyA, { PATH_SECRET: "x", HOME: "/root" }, "HOME");
assert.notEqual(other.status, 0);
assert.ok(!other.stdout.includes("/root"));
assert.match(other.stderr, /not one of the secrets/);

// 4. Unset values and no arguments are reported, not guessed.
const unset = reveal(keyA, {}, "API_TOKEN");
assert.notEqual(unset.status, 0);
assert.match(unset.stderr, /not set in \.env/);
assert.notEqual(reveal(keyA, {}).status, 0);

console.log("reveal tests passed");
