import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Encryption at rest for the things that get copied around: uploaded files, backups and the secrets in .env.
 *
 * One random 256-bit master key. It is NOT kept in C:\aide. On Windows it lives in %LOCALAPPDATA%\Opus, wrapped with
 * Windows DPAPI, which means only your Windows login on this PC can unwrap it. So a copy of the aide folder, a backup
 * file or a zip of .env is useless on its own.
 *
 * Honest limits: the live database is a normal SQLite file (Node's built-in SQLite cannot encrypt), and anyone already
 * signed in to your Windows account can use the key like you can. BitLocker covers the rest.
 */

const MAGIC = Buffer.from("OPUSENC1");
let cached: Buffer | null = null;

export function keyDir(): string {
  return process.env.OPUS_KEY_DIR ?? (process.platform === "win32" ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Opus") : join(homedir(), ".opus"));
}

function ps(script: string, input: string): string {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    env: { ...process.env, OPUS_IN: input }, encoding: "utf8", timeout: 20_000, windowsHide: true,
  }).trim();
}
const PROTECT = "Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String($env:OPUS_IN); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))";
const UNPROTECT = "Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String($env:OPUS_IN); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))";

export type KeyMode = "windows-dpapi" | "key-file";
let mode: KeyMode = "key-file";
export const keyMode = () => mode;

export function masterKey(): Buffer {
  if (cached) return cached;
  const dir = keyDir();
  const wrapped = join(dir, "master.key.dpapi");
  const plain = join(dir, "master.key");
  if (existsSync(wrapped)) {
    const key = Buffer.from(ps(UNPROTECT, readFileSync(wrapped, "utf8").trim()), "base64");
    if (key.length !== 32) throw new Error("The Opus key could not be unlocked. It only opens for the Windows user that created it.");
    mode = "windows-dpapi";
    return (cached = key);
  }
  if (existsSync(plain)) {
    const key = Buffer.from(readFileSync(plain, "utf8").trim(), "hex");
    if (key.length !== 32) throw new Error(`The key file ${plain} is damaged.`);
    return (cached = key);
  }
  // First run: make a key.
  mkdirSync(dir, { recursive: true });
  const key = randomBytes(32);
  if (process.platform === "win32") {
    try {
      const blob = ps(PROTECT, key.toString("base64"));
      // Prove it opens again before trusting it with anything.
      const back = Buffer.from(ps(UNPROTECT, blob), "base64");
      if (back.equals(key)) { writeFileSync(wrapped, blob); mode = "windows-dpapi"; return (cached = key); }
    } catch { /* fall through to a plain key file */ }
  }
  writeFileSync(plain, key.toString("hex"), { mode: 0o600 });
  try { chmodSync(plain, 0o600); } catch { /* Windows ignores this */ }
  return (cached = key);
}

export const isEncrypted = (b: Buffer) => b.length > MAGIC.length + 28 && b.subarray(0, MAGIC.length).equals(MAGIC);

export function encrypt(data: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]);
}

/** Opens encrypted data. Data from before encryption existed (no header) is returned as it is. */
export function decrypt(data: Buffer): Buffer {
  if (!isEncrypted(data)) return data;
  const o = MAGIC.length;
  const d = createDecipheriv("aes-256-gcm", masterKey(), data.subarray(o, o + 12));
  d.setAuthTag(data.subarray(o + 12, o + 28));
  return Buffer.concat([d.update(data.subarray(o + 28)), d.final()]);
}

/** For values in .env. Looks like enc1:xxxx. Plain values pass through, so old .env files keep working. */
export function sealString(v: string): string { return "enc1:" + encrypt(Buffer.from(v, "utf8")).subarray(MAGIC.length).toString("base64"); }
export function openString(v: string | undefined): string {
  if (!v || !v.startsWith("enc1:")) return v ?? "";
  return decrypt(Buffer.concat([MAGIC, Buffer.from(v.slice(5), "base64")])).toString("utf8");
}
