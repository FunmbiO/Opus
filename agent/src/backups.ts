import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "./config.js";
import { decrypt, encrypt, isEncrypted } from "./crypto.js";
import { db, kvGet, kvSet, logActivity } from "./db.js";

/**
 * A copy of Opus's database each day, kept in data/backups (the newest 14). It holds your clients, contracts,
 * budget, notes and activity. It stays on this computer. Gmail itself is not copied.
 */

const DIR = join(dirname(config.dbPath), "backups");
const KEEP = 14;

export function backupNow(reason = "daily"): { file: string } {
  mkdirSync(DIR, { recursive: true });
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
  const file = join(DIR, `opus-${stamp}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  // The copy is sealed with your key and the plain copy is removed, so a backup file alone reveals nothing.
  const sealed = encrypt(readFileSync(file));
  writeFileSync(file + ".enc", sealed);
  unlinkSync(file);
  kvSet("last-backup", d.toISOString());
  const old = readdirSync(DIR).filter((f) => /^opus-.*\.db(\.enc)?$/.test(f)).sort().reverse().slice(KEEP);
  for (const f of old) { try { unlinkSync(join(DIR, f)); } catch { /* ignore */ } }
  logActivity({ kind: "system", job: "backup", summary: `Backed up your data (${reason}). Keeping the newest ${KEEP}.` });
  return { file: file + ".enc" };
}

/** Takes a backup if the last one is over 20 hours old. Safe to call often. */
export function backupIfDue() {
  const last = kvGet("last-backup");
  if (last && Date.now() - new Date(last).getTime() < 20 * 3_600_000) return;
  try { backupNow(); } catch (e) { console.warn("Backup failed:", e instanceof Error ? e.message : e); }
}

export function backupStatus() {
  let count = 0;
  try { count = readdirSync(DIR).filter((f) => /^opus-.*\.db(\.enc)?$/.test(f)).length; } catch { /* none yet */ }
  void statSync;
  return { lastAt: kvGet("last-backup") ?? null, count, folder: DIR };
}

/** Seals backups taken before encryption existed. */
export function encryptOldBackups(): number {
  let n = 0;
  let names: string[] = [];
  try { names = readdirSync(DIR).filter((f) => /^opus-.*\.db$/.test(f)); } catch { return 0; }
  for (const f of names) {
    try {
      const p = join(DIR, f);
      const raw = readFileSync(p);
      const sealed = encrypt(raw);
      if (!decrypt(sealed).equals(raw)) continue;
      writeFileSync(p + ".enc.tmp", sealed);
      renameSync(p + ".enc.tmp", p + ".enc");
      unlinkSync(p);
      n++;
    } catch { /* leave it */ }
  }
  void isEncrypted;
  return n;
}
