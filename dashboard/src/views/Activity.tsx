import { useState } from "react";
import type { State } from "../types";
import { ago } from "../format";
import { changePassword, req, signOut, signOutOthers } from "../api";

export function Activity({ s, onState, onSignedOut }: { s: State; onState: (st: State) => void; onSignedOut: () => void }) {
  const [pw, setPw] = useState(false);
  const [sErr, setSErr] = useState("");
  const [sMsg, setSMsg] = useState("");
  const sec = s.security;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const b = s.backup;
  const stale = b.lastAt ? Date.now() - new Date(b.lastAt).getTime() > 48 * 3_600_000 : true;
  const backup = async () => {
    setBusy(true); setErr("");
    try { onState(await req("POST", "backup")); } catch (e) { setErr(e instanceof Error ? e.message : "Backup failed."); }
    setBusy(false);
  };
  const guard = async (fn: () => Promise<void>) => { setSErr(""); setSMsg(""); try { await fn(); } catch (e) { setSErr(e instanceof Error ? e.message : "That didn't work."); } };
  const submitPw = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    guard(async () => { onState(await changePassword(String(f.get("cur") ?? ""), String(f.get("next") ?? ""))); setPw(false); setSMsg("Password changed. Your other devices were signed out."); });
  };
  return (
    <div className="view">
      <header className="hero slim">
        <div>
          <div className="eyebrow">Activity log</div>
          <h1>Everything Opus did</h1>
          <p className="lede">A plain record of each action, so nothing happens out of sight.{s.mode === "demo" && " (Sample entries in this preview.)"}</p>
        </div>
      </header>
      {s.mode === "live" && (
        <section className="panel backup">
          <div>
            <strong>Backups</strong>
            <p className={stale ? "hint neg" : "hint"}>
              {b.lastAt ? `Last backup ${ago(b.lastAt, s.now)}.` : "No backup yet."} {b.count} cop{b.count === 1 ? "y" : "ies"} kept (newest 14, one a day) in <code>{b.folder}</code>. They hold your clients, contracts, budget, notes and activity, and stay on this computer.
            </p>
            {err && <p className="lock-err" role="alert">{err}</p>}
          </div>
          <button className="btn small" onClick={backup} disabled={busy}>{busy ? "Backing up…" : "Back up now"}</button>
        </section>
      )}
      {s.mode === "live" && sec.passwordSet && (
        <section className="panel secure">
          <div className="sec-top">
            <div>
              <strong>Security</strong>
              <p className="hint">
                Signed in on {sec.sessions} device{sec.sessions === 1 ? "" : "s"}{sec.lastLoginAt ? `, last sign-in ${ago(sec.lastLoginAt, s.now)}` : ""}. Sessions end after 30 days, or 14 days unused.
                {" "}Saved files and backups are encrypted{sec.encryption === "windows-dpapi" ? " with a key locked to your Windows login." : " with a key file kept outside the Opus folder."}
              </p>
            </div>
            <div className="sec-btns">
              <button className="btn small" onClick={() => setPw((v) => !v)}>Change password</button>
              <button className="btn small" disabled={sec.sessions < 2} onClick={() => guard(async () => { onState(await signOutOthers()); setSMsg("Every other device is signed out."); })}>Sign out other devices</button>
              <button className="btn small" onClick={async () => { await signOut(); onSignedOut(); }}>Sign out</button>
            </div>
          </div>
          {pw && (
            <form className="pwform" onSubmit={submitPw}>
              <input name="cur" type="password" autoComplete="current-password" placeholder="Current password" required />
              <input name="next" type="password" autoComplete="new-password" placeholder="New password (12+ characters)" minLength={12} required />
              <button className="btn small primary">Save</button>
            </form>
          )}
          {sErr && <p className="lock-err" role="alert">{sErr}</p>}
          {sMsg && <p className="hint" role="status">{sMsg}</p>}
        </section>
      )}
      <ol className="timeline">
        {s.activity.map((a) => (
          <li key={a.id}>
            <span className={`node k-${a.kind}`} />
            <div>
              <div className="t-sum">{a.summary}</div>
              <div className="t-meta">{a.job} · {ago(a.ts, s.now)}</div>
            </div>
          </li>
        ))}
        {s.activity.length === 0 && <p className="empty">No activity yet.</p>}
      </ol>
    </div>
  );
}
