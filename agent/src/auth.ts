import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { all, get, kvGet, kvSet, logActivity, nowIso, run } from "./db.js";

/**
 * Sign-in for the dashboard. One password (scrypt-hashed in the database), and each device gets its own session
 * token that expires. Only a hash of the token is stored, so a copy of the database can't be used to sign in.
 */

const SESSION_DAYS = 30;
const IDLE_DAYS = 14;
export class AuthError extends Error {}

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

export const passwordSet = () => !!kvGet("auth-hash");

function hash(pw: string, salt = randomBytes(16)): string {
  return `scrypt$${salt.toString("hex")}$${scryptSync(pw, salt, 64).toString("hex")}`;
}

export function checkPasswordRules(pw: string) {
  if (pw.length < 12) throw new AuthError("Use at least 12 characters. A few random words works well.");
  if (pw.length > 200) throw new AuthError("That is too long.");
  if (/^(.)\1+$/.test(pw) || /^(password|12345678|qwertyuiop)/i.test(pw)) throw new AuthError("Pick something less guessable.");
}

export function setPassword(pw: string) {
  checkPasswordRules(pw);
  kvSet("auth-hash", hash(pw));
  run("DELETE FROM sessions"); // a new password signs every device out
  logActivity({ kind: "system", job: "security", summary: "Your dashboard password was set. All devices were signed out." });
}

export function verifyPassword(pw: string): boolean {
  const stored = kvGet("auth-hash");
  const [, saltHex, hashHex] = (stored ?? "").split("$");
  // Always do the work, so a missing password and a wrong one take the same time.
  const salt = Buffer.from(saltHex ?? "00".repeat(16), "hex");
  const want = Buffer.from(hashHex ?? "00".repeat(64), "hex");
  const got = scryptSync(String(pw).slice(0, 200), salt, 64);
  return !!stored && want.length === got.length && timingSafeEqual(want, got);
}

export function createSession(ip: string, agent: string): string {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  run(
    "INSERT INTO sessions (id, created_at, last_seen, expires_at, ip, agent) VALUES (?, ?, ?, ?, ?, ?)",
    sha(token), nowIso(), nowIso(), new Date(now + SESSION_DAYS * 86_400_000).toISOString(), ip.slice(0, 60), agent.slice(0, 120),
  );
  run("DELETE FROM sessions WHERE expires_at < ?", nowIso());
  kvSet("last-login", nowIso());
  logActivity({ kind: "system", job: "security", summary: `Signed in from ${ip.replace(/^::ffff:/, "")}` });
  return token;
}

export function sessionValid(token: string): boolean {
  if (!token) return false;
  const row = get<{ expires_at: string; last_seen: string }>("SELECT expires_at, last_seen FROM sessions WHERE id = ?", sha(token));
  if (!row) return false;
  const now = Date.now();
  if (new Date(row.expires_at).getTime() < now || now - new Date(row.last_seen).getTime() > IDLE_DAYS * 86_400_000) {
    run("DELETE FROM sessions WHERE id = ?", sha(token));
    return false;
  }
  if (now - new Date(row.last_seen).getTime() > 60_000) run("UPDATE sessions SET last_seen = ? WHERE id = ?", nowIso(), sha(token));
  return true;
}

export const endSession = (token: string) => void run("DELETE FROM sessions WHERE id = ?", sha(token));

export function endOtherSessions(keepToken: string | null) {
  if (keepToken) run("DELETE FROM sessions WHERE id != ?", sha(keepToken));
  else run("DELETE FROM sessions");
  logActivity({ kind: "system", job: "security", summary: keepToken ? "You signed out every other device" : "Every device was signed out" });
}

export function changePassword(current: string, next: string, keepToken: string) {
  if (!verifyPassword(current)) throw new AuthError("The current password is wrong.");
  checkPasswordRules(next);
  kvSet("auth-hash", hash(next));
  run("DELETE FROM sessions WHERE id != ?", sha(keepToken));
  logActivity({ kind: "system", job: "security", summary: "You changed your dashboard password. Other devices were signed out." });
}

export function securityInfo() {
  const rows = all<{ n: number }>("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?", nowIso());
  return { passwordSet: passwordSet(), sessions: rows[0]?.n ?? 0, lastLoginAt: kvGet("last-login") ?? null };
}
