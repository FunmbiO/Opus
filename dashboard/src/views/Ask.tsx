import { useEffect, useRef, useState } from "react";
import type { State } from "../types";
import { ask, downloadFile, req, unlockAttachment, uploadFile, type AskReply, type PasswordRequest } from "../api";
import { Icon } from "../components/Icons";

interface Turn { role: "user" | "assistant"; content: string; drafts?: AskReply["drafts"]; steps?: string[]; cost?: number; locks?: PasswordRequest[]; docs?: NonNullable<AskReply["documents"]>; files?: { id: number; name: string }[] }
interface Attached { id: number; name: string }
const NOTE = /\n\(Attached files?:[^)]*\)$/;
const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const IDEAS = [
  "Find my latest Apple receipt",
  "Reply to the wedding enquiry",
  "Search the web: wedding photographer pricing in Halifax",
  "Which subscriptions renew this week?",
  "Make me a Word document: a one-page shoot checklist",
  "Build a budget spreadsheet from my bills",
];

const DEMO_REPLY: Turn = {
  role: "assistant",
  content: "This is the preview file, so I'm not connected to your inbox or the web. Run the agent (npm run serve) and this box will search your Gmail, search the web, and save reply drafts. I can't send, delete or cancel anything.",
};

export function Ask({ s, onState, seed, clearSeed }: { s: State; onState: (st: State) => void; seed: string; clearSeed: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [attached, setAttached] = useState<Attached[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [turns, busy]);
  useEffect(() => { if (seed) { clearSeed(); void send(seed); } // eslint-disable-line
  }, [seed]);

  const attach = async (list: FileList | null) => {
    if (!list?.length) return;
    if (s.mode === "demo") { setUploadErr("Attaching files needs the live agent (npm run serve)."); return; }
    setUploadErr("");
    setUploading(true);
    for (const f of Array.from(list).slice(0, 5)) {
      try {
        const r = await uploadFile(f);
        setAttached((a) => [...a, { id: r.id, name: r.name }]);
        onState(r.state);
      } catch (e) { setUploadErr(`${f.name}: ${e instanceof Error ? e.message : "could not attach"}`); }
    }
    setUploading(false);
    if (picker.current) picker.current.value = "";
  };

  const send = async (msg: string) => {
    let m = msg.trim();
    if ((!m && attached.length === 0) || busy || uploading) return;
    const files = attached;
    if (!m) m = "Please read the attached file and tell me what it says.";
    if (files.length) m += `\n(Attached file${files.length > 1 ? "s" : ""}: ${files.map((f) => `${f.name} [file id ${f.id}]`).join(", ")})`;
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((t) => [...t, { role: "user", content: m, files }]);
    setAttached([]);
    setText("");
    setBusy(true);
    try {
      if (s.mode === "demo") {
        await new Promise((r) => setTimeout(r, 500));
        setTurns((t) => [...t, DEMO_REPLY]);
      } else {
        const r = await ask(m, history);
        setTurns((t) => [...t, { role: "assistant", content: r.reply, drafts: r.drafts, steps: r.steps, cost: r.costUsd, locks: r.passwordRequests, docs: r.documents }]);
        if (r.state) onState(r.state);
      }
    } catch (e) {
      setTurns((t) => [...t, { role: "assistant", content: `That failed: ${e instanceof Error ? e.message : "unknown error"}. Try again.` }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="view ask">
      <header className="hero slim">
        <div>
          <div className="eyebrow">Ask Opus</div>
          <h1>What do you need?</h1>
          <p className="lede">Search your inbox or the web, attach a file for Opus to read, or have it write a Word, Excel or PDF file. Reply drafts land in Gmail for you to read and send. Opus never sends.</p>
        </div>
      </header>

      <div className="thread" aria-live="polite">
        {turns.length === 0 && (
          <div className="ideas">
            {IDEAS.map((i) => <button key={i} className="idea" onClick={() => send(i)}>{i}</button>)}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`msg ${t.role}`}>
            {t.steps && t.steps.length > 0 && (
              <ul className="steps">{t.steps.map((x, k) => <li key={k}><Icon name="approve" size={13} />{x}</li>)}</ul>
            )}
            <div className="bubble">{t.content.replace(NOTE, "")}</div>
            {t.files && t.files.length > 0 && <div className="fchips">{t.files.map((f) => <span className="fchip" key={f.id}><Icon name="file" size={13} />{f.name}</span>)}</div>}
            {t.docs?.map((d) => (
              <div className="made doc" key={d.id}>
                <Icon name="file" size={18} />
                <div><strong>{d.name}</strong><small>{d.kind.toUpperCase()} · {kb(d.size)} · saved in Files</small></div>
                <button className="btn small" onClick={() => downloadFile(d.id, d.name).catch(() => undefined)}>Download</button>
              </div>
            ))}
            {t.drafts?.map((d, j) => (
              <div className="made" key={j}>
                <Icon name="draft" size={18} />
                <div><strong>Draft saved{d.subject ? `: ${d.subject}` : ""}</strong><small>In Gmail Drafts. Not sent.</small></div>
                {d.viewUrl && <a className="link" href={d.viewUrl} target="_blank" rel="noreferrer">Open <Icon name="external" size={14} /></a>}
              </div>
            ))}
            {t.locks?.map((l) => (
              <UnlockCard key={`${l.threadId}:${l.number}`} req={l} disabled={busy}
                onUnlocked={() => send(`I've unlocked "${l.filename}". Please read it now and answer my earlier question.`)} />
            ))}
            {t.cost != null && t.cost > 0 && <div className="cost">${t.cost.toFixed(3)}</div>}
          </div>
        ))}
        {busy && <div className="msg assistant"><div className="bubble working"><span /><span /><span /></div></div>}
        <div ref={end} />
      </div>

      {(attached.length > 0 || uploading || uploadErr) && (
        <div className="fchips tray">
          {attached.map((f) => <span className="fchip" key={f.id}><Icon name="file" size={13} />{f.name}<button type="button" aria-label={`Remove ${f.name}`} onClick={() => setAttached((a) => a.filter((x) => x.id !== f.id))}><Icon name="x" size={12} /></button></span>)}
          {uploading && <span className="fchip soft">Attaching…</span>}
          {uploadErr && <span className="lock-err" role="alert">{uploadErr}</span>}
        </div>
      )}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input ref={picker} type="file" hidden multiple accept=".pdf,.docx,.xlsx,.csv,.tsv,.txt,.md,.json,.png,.jpg,.jpeg,.gif,.webp" onChange={(e) => attach(e.target.files)} />
        <button type="button" className="btn icon" aria-label="Attach a file" title="Attach a file (PDF, Word, Excel, CSV, text, image)" disabled={busy || uploading} onClick={() => picker.current?.click()}><Icon name="plus" size={18} /></button>
        <textarea
          value={text} rows={1} placeholder="Ask anything, or attach a file for Opus to read or rewrite…" aria-label="Message Opus"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
        />
        <button className="btn primary" disabled={busy || uploading || (!text.trim() && attached.length === 0)}><Icon name="send" size={16} /> Send</button>
      </form>

      <NotesBox s={s} onState={onState} />

      {s.files.length > 0 && (
        <details className="filebox">
          <summary>Your files ({s.files.length})</summary>
          <div className="rows tight">
            {s.files.map((f) => (
              <div className="brow" key={f.id}>
                <span className="bname">{f.name}<small className="soft"> {f.source === "opus" ? "made by Opus" : "you attached"} · {kb(f.size)}</small></span>
                <button className="btn small" onClick={() => downloadFile(f.id, f.name).catch(() => undefined)}>Download</button>
                <button className="icon-btn" aria-label={`Delete ${f.name}`} onClick={async () => { if (window.confirm(`Delete "${f.name}" from Opus? This can't be undone.`)) { try { onState(await req("POST", `files/${f.id}/delete`)); } catch { /* ignore */ } } }}><Icon name="x" size={14} /></button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** A private box for a PDF password. It goes to the agent, never into the chat or to the model. */
function UnlockCard({ req, onUnlocked, disabled }: { req: PasswordRequest; onUnlocked: () => void; disabled: boolean }) {
  const [pw, setPw] = useState("");
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [err, setErr] = useState("");
  const [reuse, setReuse] = useState(false);

  const submit = async () => {
    const value = pw;
    if (!value || state !== "idle") return;
    setPw("");
    setErr("");
    setState("working");
    try {
      await unlockAttachment(req.threadId, req.number, value, reuse);
      setState("done");
      onUnlocked();
    } catch (e) {
      setState("idle");
      setErr(e instanceof Error ? e.message : "That didn't work.");
    }
  };

  if (state === "done") return <div className="made"><Icon name="approve" size={18} /><div><strong>Unlocked</strong><small>{req.filename}. Opus is reading it now.</small></div></div>;
  return (
    <form className="lockcard" onSubmit={(e) => { e.preventDefault(); void submit(); }} autoComplete="off">
      <div className="lock-top"><Icon name="lock" size={18} /><div><strong>{req.filename} is password protected</strong><small>{req.subject ? `From the email "${req.subject}". ` : ""}Opus can't see what you type here. It is used once to open the file and is not saved.</small></div></div>
      <div className="lock-row">
        <input type="password" name="attachment-code" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" aria-label={`Password for ${req.filename}`} className="inp" />
        <button className="btn primary" disabled={!pw || state === "working" || disabled}>{state === "working" ? "Opening…" : "Unlock and let Opus read it"}</button>
      </div>
      <label className="check small"><input type="checkbox" checked={reuse} onChange={(e) => setReuse(e.target.checked)} /> Use this for the other locked files too (kept in memory for 15 minutes, then forgotten)</label>
      {err && <p className="lock-err" role="alert">{err}</p>}
    </form>
  );
}

/** What Opus has learned about you. Every note is visible and deletable. */
function NotesBox({ s, onState }: { s: State; onState: (st: State) => void }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const live = s.mode === "live";
  const add = async () => {
    const t = text.trim();
    if (!t) return;
    setErr("");
    try { onState(await req("POST", "notes", { text: t })); setText(""); } catch (e) { setErr(e instanceof Error ? e.message : "Could not save."); }
  };
  return (
    <details className="filebox">
      <summary>What Opus knows about you ({s.notes.length})</summary>
      <p className="hint">Tell Opus things like "I always want PDFs for clients" or "I get paid every second Thursday" in chat, or add them here. It uses these notes next time. Delete any you don't want kept. Passwords and account numbers are never saved.</p>
      <div className="rows tight">
        {s.notes.map((n) => (
          <div className="brow" key={n.id}>
            <span className="bname">{n.text}<small className="soft"> {n.source === "chat" ? "saved from chat" : "you added"}</small></span>
            {live && <button className="icon-btn" aria-label="Delete note" onClick={async () => { try { onState(await req("POST", `notes/${n.id}/remove`)); } catch { /* ignore */ } }}><Icon name="x" size={14} /></button>}
          </div>
        ))}
        {s.notes.length === 0 && <p className="empty">Nothing yet.</p>}
      </div>
      {live && (
        <form className="addrow" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <input className="inp" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="Add a note for Opus" aria-label="Add a note for Opus" />
          <button className="btn small primary" disabled={!text.trim()}><Icon name="plus" size={14} /> Add</button>
        </form>
      )}
      {err && <p className="lock-err" role="alert">{err}</p>}
    </details>
  );
}
