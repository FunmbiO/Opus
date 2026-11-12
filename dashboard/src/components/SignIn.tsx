import { useEffect, useState } from "react";
import { authStatus, firstPassword, signIn } from "../api";
import { CarMark } from "./CarMark";

/** Sign in with your password. The first time, set one (proved with the old access token). */
export function SignIn({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [st, setSt] = useState<{ passwordSet: boolean; hasToken: boolean } | null | undefined>(undefined);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { authStatus().then(setSt); }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setErr(""); setBusy(true);
    try {
      if (st?.passwordSet) await signIn(String(f.get("pw") ?? ""));
      else {
        if (f.get("pw") !== f.get("pw2")) throw new Error("The two passwords don't match.");
        await firstPassword(String(f.get("old") ?? ""), String(f.get("pw") ?? ""));
      }
      onDone();
    } catch (x) { setErr(x instanceof Error ? x.message : "That didn't work."); }
    setBusy(false);
  };

  if (st === undefined) return <div className="boot"><div className="spinner" /></div>;
  const first = !!st && !st.passwordSet;
  return (
    <div className="boot">
      <form className="auth" onSubmit={submit}>
        <CarMark className="auth-car" />
        <h1>Opus</h1>
        {first ? (
          <>
            <p>Set your password. Use 12 or more characters; a few random words works well.</p>
            {st?.hasToken && <input name="old" type="password" autoComplete="off" placeholder="Your old access token (API_TOKEN)" required />}
            <input name="pw" type="password" autoComplete="new-password" placeholder="New password" minLength={12} required autoFocus />
            <input name="pw2" type="password" autoComplete="new-password" placeholder="New password again" minLength={12} required />
          </>
        ) : (
          <>
            <p>Sign in to your assistant.</p>
            <input name="pw" type="password" autoComplete="current-password" placeholder="Password" required autoFocus />
          </>
        )}
        {err && <p className="lock-err" role="alert">{err}</p>}
        <button className="btn primary" disabled={busy}>{busy ? "One moment…" : first ? "Set password and sign in" : "Sign in"}</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Not now</button>}
        {!first && <p className="hint">Forgot it? On the PC Opus runs on, run <code>npm run password</code>.</p>}
      </form>
    </div>
  );
}
