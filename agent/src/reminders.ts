import { createHash } from "node:crypto";
import { config } from "./config.js";
import { get, kvGet, kvSet, logActivity, nowIso, run } from "./db.js";
import { notify } from "./notify.js";

/**
 * Reminds you to re-run `npm run auth`. While the Google app is in Testing
 * mode, the login expires after 7 days.
 *
 * Opus can't see when you signed in, so it remembers a fingerprint of the
 * refresh token in .env (never the token itself). A new token means a fresh
 * sign-in, and the 7-day clock restarts.
 */
const WINDOW_DAYS = 7;
const SOON = "google-reauth-soon";
const EXPIRED = "google-reauth-expired";

const day = 86_400_000;

function clearOther(id: string) {
  run("DELETE FROM alerts WHERE id = ?", id === EXPIRED ? SOON : EXPIRED);
}

function upsert(id: string, severity: string, title: string, detail: string) {
  run(
    `INSERT INTO alerts (id, severity, title, detail) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET severity = excluded.severity, title = excluded.title, detail = excluded.detail`,
    id, severity, title, detail,
  );
  clearOther(id);
}

const HOW = "In the agent folder run: npm run auth, paste the new GOOGLE_REFRESH_TOKEN into .env, then restart Opus.";

export function checkGoogleAuth(now = new Date()) {
  const token = config.google.refreshToken;
  if (config.mock || !token) return;

  const fingerprint = createHash("sha256").update(token).digest("hex").slice(0, 16);
  if (kvGet("google-token-fp") !== fingerprint) {
    kvSet("google-token-fp", fingerprint);
    kvSet("google-auth-at", now.toISOString());
    run("DELETE FROM alerts WHERE id IN (?, ?)", SOON, EXPIRED);
    logActivity({ kind: "system", job: "reminders", summary: "New Google login detected. 7-day clock restarted." });
  }

  const since = new Date(kvGet("google-auth-at") ?? now.toISOString()).getTime();
  const age = (now.getTime() - since) / day;
  const left = Math.ceil(WINDOW_DAYS - age);

  if (age < 5) return;

  const stage = age >= WINDOW_DAYS ? "expired" : "soon";
  if (stage === "soon") {
    const title = left <= 1 ? "Google login expires within a day" : `Google login expires in ${left} days`;
    upsert(SOON, "medium", title, `Google ends test logins after 7 days. ${HOW}`);
  } else {
    upsert(EXPIRED, "high", "Google login has probably expired", `It has been over 7 days since you signed in. If Opus stops reading mail, this is why. ${HOW}`);
  }

  // One ping per stage per day, so it nags gently and never floods.
  const key = `reauth-pinged:${stage}:${Math.floor(now.getTime() / day)}`;
  if (!kvGet(key)) {
    kvSet(key, nowIso());
    void notify(
      stage === "soon"
        ? `Reminder: your Google login for Opus expires in about ${Math.max(left, 1)} day(s). Run npm run auth when you can.`
        : "Your Google login for Opus has probably expired. Run npm run auth to reconnect.",
      { urgent: stage === "expired" },
    );
  }
}

/** Call from any catch block. Turns Google's cryptic "invalid_grant" into a clear alert. */
export function reportIfAuthError(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${JSON.stringify((err as { response?: { data?: unknown } }).response?.data ?? "")}` : String(err);
  if (!/invalid_grant/i.test(text)) return false;

  upsert(EXPIRED, "high", "Google login expired", `Google rejected the saved login, so Opus can't read mail right now. ${HOW}`);
  const key = `reauth-failed:${Math.floor(Date.now() / day)}`;
  if (!get("SELECT 1 FROM kv WHERE key = ?", key)) {
    kvSet(key, nowIso());
    void notify("Opus can't reach Gmail: your Google login expired. Run npm run auth to fix it.", { urgent: true });
  }
  return true;
}
