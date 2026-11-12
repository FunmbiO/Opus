import { useEffect, useMemo, useState } from "react";
import type { Client, Contract, Item, JadedSettings, Stage, State } from "../types";
import { ago, calcTotals, longDate, money } from "../format";
import { Icon } from "../components/Icons";

export interface ClientActions {
  scan: () => void;
  saveContract: (id: number, edit: Edit) => Promise<boolean>;
  send: (c: Contract) => Promise<boolean>;
  startContract: (inquiryId: number, packageId: string) => Promise<boolean>;
  outcome: (inquiryId: number, outcome: "booked" | "declined" | null) => void;
  saveSettings: (s: JadedSettings) => Promise<boolean>;
  pdf: (id: number) => void;
  remove: (inquiryId: number) => Promise<boolean>;
  busy: string | null;
}

export type Edit = Pick<Contract, "clientName" | "clientEmail" | "clientPhone" | "eventType" | "eventDate" | "venue" | "items" | "discount" | "taxRate" | "depositPct" | "notes" | "terms" | "coverSubject" | "coverBody">;

const STAGES: { id: Stage; label: string }[] = [
  { id: "new", label: "New inquiry" },
  { id: "replied", label: "Reply drafted" },
  { id: "contract", label: "Contract drafted" },
  { id: "sent", label: "Contract sent" },
  { id: "booked", label: "Booked" },
];
const stageLabel = (s: Stage) => (s === "declined" ? "Declined" : STAGES.find((x) => x.id === s)!.label);

const toEdit = (c: Contract): Edit => ({
  clientName: c.clientName, clientEmail: c.clientEmail, clientPhone: c.clientPhone, eventType: c.eventType, eventDate: c.eventDate, venue: c.venue,
  items: c.items.map((i) => ({ ...i })), discount: c.discount, taxRate: c.taxRate, depositPct: c.depositPct, notes: c.notes, terms: c.terms,
  coverSubject: c.coverSubject, coverBody: c.coverBody,
});

export function Clients({ s, a }: { s: State; a: ClientActions }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [settings, setSettings] = useState(false);
  const open = s.clients.find((c) => c.id === openId);

  if (settings) return <SettingsPanel initial={s.jaded} a={a} back={() => setSettings(false)} />;
  if (open) return <Detail c={open} s={s} a={a} back={() => setOpenId(null)} />;

  const active = s.clients.filter((c) => c.stage !== "booked" && c.stage !== "declined");
  const count = (st: Stage) => s.clients.filter((c) => c.stage === st).length;
  const needs = s.clients.filter((c) => c.stage === "contract" || c.stage === "replied" || c.stage === "new").length;

  return (
    <div className="view">
      <header className="hero">
        <div>
          <div className="eyebrow">{s.jaded.business.name}</div>
          <h1>{active.length ? `${needs} waiting on you` : "No open inquiries"}</h1>
          <p className="lede">Opus finds new inquiries, drafts the reply and a contract from your price list. Nothing is sent until you approve it here.</p>
        </div>
        <div className="hero-actions">
          <button className="btn primary" onClick={a.scan} disabled={a.busy === "scan" || s.mode === "demo"} title={s.mode === "demo" ? "Connect the agent to run this" : "Look through the last 30 days of mail"}>
            <Icon name="refresh" size={16} /> {a.busy === "scan" ? "Scanning…" : "Scan for inquiries"}
          </button>
          <button className="btn" onClick={() => setSettings(true)}><Icon name="file" size={16} /> Pricing & terms</button>
        </div>
      </header>

      <div className="cl-tally">
        {STAGES.map((st) => (
          <div key={st.id} className="cl-tally-i"><b className="big">{count(st.id)}</b><span>{st.label}</span></div>
        ))}
      </div>

      {s.clients.length === 0 && <p className="empty big">No inquiries yet. When one arrives, it shows up here with a drafted reply and contract.</p>}
      <div className="rows">
        {s.clients.map((c) => (
          <button key={c.id} className="cl-row" onClick={() => setOpenId(c.id)}>
            <span className="cl-main">
              <strong>{c.name || c.email}</strong>
              <span className="cl-sub">{longDate(c.eventDate)}{c.venue ? ` · ${c.venue}` : ""}{c.guests ? ` · ${c.guests} guests` : ""}</span>
            </span>
            <span className="cl-meta">
              {c.contract && <span className="cl-amt">{money(c.contract.totals.total)}</span>}
              <span className={`pill st-${c.stage}`}>{stageLabel(c.stage)}</span>
              <span className="when">{ago(c.createdAt, s.now)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- One client ------------------------------------------------------------

function Detail({ c, s, a, back }: { c: Client; s: State; a: ClientActions; back: () => void }) {
  const k = c.contract;
  const [f, setF] = useState<Edit | null>(k ? toEdit(k) : null);
  const [confirm, setConfirm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [discussed, setDiscussed] = useState(false);
  const [pick, setPick] = useState(s.jaded.packages[0]?.id ?? "");

  // Reload the form whenever the saved contract changes (after a save, or a refresh).
  useEffect(() => { setF(k ? toEdit(k) : null); setConfirm(false); }, [k?.id, k?.updatedAt]);
  useEffect(() => { setConfirm(false); }, [discussed]);

  const dirty = useMemo(() => !!(k && f && JSON.stringify(f) !== JSON.stringify(toEdit(k))), [k, f]);
  const sent = k?.status === "sent";
  const t = f ? calcTotals(f.items, f.discount, f.taxRate, f.depositPct) : null;
  const set = <K extends keyof Edit>(key: K, v: Edit[K]) => setF((p) => (p ? { ...p, [key]: v } : p));
  const setItem = (i: number, patch: Partial<Item>) => set("items", f!.items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const ready = !!k && !sent && !dirty && k.problems.length === 0;

  return (
    <div className="view">
      <button className="textbtn back" onClick={back}>← All clients</button>
      <header className="hero slim">
        <div>
          <div className="eyebrow">{c.source === "web" ? "From your website" : "From your inbox"} · {ago(c.createdAt, s.now)}</div>
          <h1>{c.name || c.email}</h1>
          <Stepper stage={c.stage} />
        </div>
      </header>

      <section className="panel">
        <div className="panel-head"><h2>The inquiry</h2>{c.threadUrl && <a className="link" href={c.threadUrl} target="_blank" rel="noreferrer">Open in Gmail <Icon name="external" size={13} /></a>}</div>
        <dl className="cl-facts">
          <div><dt>Email</dt><dd>{c.email || "—"}</dd></div>
          <div><dt>Phone</dt><dd>{c.phone || "—"}</dd></div>
          <div><dt>Date</dt><dd>{longDate(c.eventDate)}</dd></div>
          <div><dt>Venue</dt><dd>{c.venue || "—"}</dd></div>
          <div><dt>Guests</dt><dd>{c.guests ?? "—"}</dd></div>
          <div><dt>Asked about</dt><dd>{s.jaded.packages.find((p) => p.id === c.service)?.name ?? "Not stated"}</dd></div>
        </dl>
        {c.summary && <p className="cl-summary">{c.summary}</p>}
        {c.message && <details className="cl-msg"><summary>Their message</summary><pre>{c.message}</pre></details>}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Reply draft</h2>{c.draft?.viewUrl && <a className="link" href={c.draft.viewUrl} target="_blank" rel="noreferrer">Open in Gmail <Icon name="external" size={13} /></a>}</div>
        {c.draft ? (
          <>
            <pre className="preview big-preview">{c.draft.body}</pre>
            <p className="drawer-note">This is in your Gmail Drafts. Fill in the [CONFIRM] parts, then send it yourself. Opus does not send replies.</p>
          </>
        ) : <p className="empty">No reply drafted yet.</p>}
      </section>

      {!k && (
        <section className="panel">
          <div className="panel-head"><h2>Contract</h2></div>
          <p className="empty">No contract yet. Pick a package and Opus builds one from your price list.</p>
          <div className="sub-actions">
            <select value={pick} onChange={(e) => setPick(e.target.value)} className="inp">
              {s.jaded.packages.map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.price)}</option>)}
            </select>
            <button className="btn primary" disabled={a.busy === `start${c.id}`} onClick={() => a.startContract(c.id, pick)}><Icon name="plus" size={16} /> Create contract</button>
          </div>
        </section>
      )}

      {k && f && t && (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2>Contract</h2>
              <button className="textbtn" onClick={() => a.pdf(k.id)}>Preview PDF</button>
            </div>
            {sent && <div className="cl-sent"><Icon name="shield" /> Sent to {k.sentTo} on {longDate(k.sentAt?.slice(0, 10) ?? null)}. It is locked now.</div>}
            <fieldset disabled={sent} className="cl-form">
              <div className="fgrid">
                <Field label="Client name"><input className="inp" value={f.clientName} onChange={(e) => set("clientName", e.target.value)} /></Field>
                <Field label="Client email"><input className="inp" type="email" value={f.clientEmail} onChange={(e) => set("clientEmail", e.target.value)} /></Field>
                <Field label="Phone"><input className="inp" value={f.clientPhone} onChange={(e) => set("clientPhone", e.target.value)} /></Field>
                <Field label="Event type"><input className="inp" value={f.eventType} onChange={(e) => set("eventType", e.target.value)} /></Field>
                <Field label="Event date"><input className="inp" type="date" value={f.eventDate ?? ""} onChange={(e) => set("eventDate", e.target.value || null)} /></Field>
                <Field label="Venue"><input className="inp" value={f.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Where is it?" /></Field>
              </div>

              <h3 className="sect">Pricing</h3>
              <div className="items">
                {f.items.map((it, i) => (
                  <div className="item" key={i}>
                    <input className="inp grow" value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} placeholder="What the client is paying for" />
                    <div className="money"><span>$</span><input className="inp" type="number" min="0" step="0.01" value={it.amount || ""} placeholder="0" onChange={(e) => setItem(i, { amount: e.target.valueAsNumber || 0 })} /></div>
                    <button className="icon-btn" aria-label="Remove line" onClick={() => set("items", f.items.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button>
                  </div>
                ))}
                <div className="sub-actions">
                  <button className="btn small" onClick={() => set("items", [...f.items, { label: "", amount: 0 }])}><Icon name="plus" size={14} /> Add line</button>
                  {s.jaded.packages.map((p) => (
                    <button key={p.id} className="btn small ghost" title="Add from your price list" onClick={() => set("items", [...f.items, { label: `${p.name}. ${p.description}`.trim(), amount: p.price }])}>+ {p.name}</button>
                  ))}
                </div>
              </div>
              <div className="fgrid three">
                <Field label="Discount ($)"><input className="inp" type="number" min="0" step="0.01" value={f.discount || ""} placeholder="0" onChange={(e) => set("discount", e.target.valueAsNumber || 0)} /></Field>
                <Field label={`${s.jaded.taxLabel} (%)`}><input className="inp" type="number" min="0" max="30" step="0.5" value={f.taxRate || ""} placeholder="0" onChange={(e) => set("taxRate", e.target.valueAsNumber || 0)} /></Field>
                <Field label="Retainer (%)"><input className="inp" type="number" min="0" max="100" value={f.depositPct || ""} placeholder="0" onChange={(e) => set("depositPct", e.target.valueAsNumber || 0)} /></Field>
              </div>
              <div className="cl-totals">
                <div><span>Subtotal</span><b>{money(t.subtotal)}</b></div>
                {t.discount > 0 && <div><span>Discount</span><b>-{money(t.discount)}</b></div>}
                {f.taxRate > 0 && <div><span>{s.jaded.taxLabel}</span><b>{money(t.tax)}</b></div>}
                <div className="grand"><span>Total</span><b className="gold-num">{money(t.total)}</b></div>
                <div><span>Retainer on signing</span><b>{money(t.deposit)}</b></div>
                <div><span>Balance, 14 days before</span><b>{money(t.balance)}</b></div>
              </div>

              <Field label="Notes on the contract (optional)"><textarea className="inp" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
              <Field label="Terms" hint="Lines starting with ## are headings. Tokens like {{client}}, {{date}}, {{total}} fill in automatically. Anything in [CONFIRM: …] blocks sending until you replace it.">
                <textarea className="inp mono" rows={16} value={f.terms} onChange={(e) => set("terms", e.target.value)} />
              </Field>
            </fieldset>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Email that carries the contract</h2></div>
            <fieldset disabled={sent} className="cl-form">
              <Field label="Subject" hint="When this goes in the same Gmail conversation as their inquiry, the original subject is kept."><input className="inp" value={f.coverSubject} onChange={(e) => set("coverSubject", e.target.value)} /></Field>
              <Field label="Message"><textarea className="inp" rows={9} value={f.coverBody} onChange={(e) => set("coverBody", e.target.value)} /></Field>
            </fieldset>
            {!sent && (
              <div className="sub-actions">
                <button className="btn primary" disabled={!dirty || a.busy === `save${k.id}`} onClick={() => a.saveContract(k.id, f)}>{a.busy === `save${k.id}` ? "Saving…" : dirty ? "Save changes" : "Saved"}</button>
                {dirty && <button className="btn ghost" onClick={() => setF(toEdit(k))}>Undo changes</button>}
                <button className="btn ghost" onClick={() => a.pdf(k.id)}>Preview PDF</button>
              </div>
            )}
          </section>

          {!sent && (
            <section className="panel cl-send">
              <div className="panel-head"><h2>Send to {k.clientName.split(" ")[0] || "client"}</h2></div>
              {dirty && <p className="cl-warn">You have unsaved changes. Save them first, so what you approve is exactly what is sent.</p>}
              {!dirty && k.problems.length > 0 && (
                <div className="cl-todo"><strong>Before this can be sent:</strong><ul>{k.problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
              )}
              {ready && (
                <>
                  <p>This sends <b>{k.coverSubject}</b> to <b>{k.clientEmail}</b> with the agreement PDF attached ({money(k.totals.total)} total). It is the only email Opus ever sends, and only when you press the button.</p>
                  <label className="check"><input type="checkbox" checked={discussed} onChange={(e) => setDiscussed(e.target.checked)} /> I've discussed this with {k.clientName.split(" ")[0] || "the client"}, and I've read the contract.</label>
                  {!confirm ? (
                    <button className="btn primary" disabled={!discussed} onClick={() => setConfirm(true)}><Icon name="send" size={16} /> Approve and send…</button>
                  ) : (
                    <div className="sub-actions">
                      <button className="btn primary" disabled={a.busy === `send${k.id}`} onClick={() => a.send(k)}>{a.busy === `send${k.id}` ? "Sending…" : `Yes, send it to ${k.clientEmail} now`}</button>
                      <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}

      <div className="sub-actions cl-foot">
        {c.stage !== "booked" && <button className="btn" onClick={() => a.outcome(c.id, "booked")}>Mark as booked</button>}
        {c.stage !== "declined" && <button className="btn ghost" onClick={() => a.outcome(c.id, "declined")}>Not going ahead</button>}
        {(c.stage === "booked" || c.stage === "declined") && <button className="btn ghost" onClick={() => a.outcome(c.id, null)}>Reopen</button>}
      </div>
      <div className="cl-danger">
        {!confirmDelete ? (
          <button className="btn ghost danger" onClick={() => setConfirmDelete(true)}>Delete this client…</button>
        ) : (
          <>
            <p>
              Delete <b>{c.name || c.email || "this client"}</b> from Opus? This removes the inquiry{c.contract ? (c.contract.status === "sent" ? ", and the record of the contract you sent" : " and the contract draft") : ""} from your dashboard.
              {c.contract?.status === "sent" && <> The email you sent stays in your Gmail.</>} Your Gmail itself is not touched. This can't be undone.
            </p>
            <div className="sub-actions">
              <button className="btn danger-solid" disabled={a.busy === `del${c.id}`} onClick={async () => { if (await a.remove(c.id)) back(); }}>{a.busy === `del${c.id}` ? "Deleting…" : "Yes, delete"}</button>
              <button className="btn" onClick={() => setConfirmDelete(false)}>Keep</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stepper({ stage }: { stage: Stage }) {
  if (stage === "declined") return <span className="pill st-declined">Declined</span>;
  const at = STAGES.findIndex((x) => x.id === stage);
  return (
    <ol className="stepper">
      {STAGES.map((st, i) => <li key={st.id} className={i < at ? "done" : i === at ? "now" : ""}><i />{st.label}</li>)}
    </ol>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="fld"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

// ---- Pricing and terms -----------------------------------------------------

function SettingsPanel({ initial, a, back }: { initial: JadedSettings; a: ClientActions; back: () => void }) {
  const [f, setF] = useState(initial);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const biz = (k: keyof JadedSettings["business"], v: string) => setF({ ...f, business: { ...f.business, [k]: v } });
  const pk = (i: number, patch: Partial<JadedSettings["packages"][number]>) => setF({ ...f, packages: f.packages.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  return (
    <div className="view">
      <button className="textbtn back" onClick={back}>← All clients</button>
      <header className="hero slim">
        <div>
          <div className="eyebrow">Business settings</div>
          <h1>Pricing & terms</h1>
          <p className="lede">Opus only quotes from this list and builds new contracts from it. Contracts you already started keep their own copy.</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-head"><h2>Packages</h2></div>
        <div className="items">
          {f.packages.map((p, i) => (
            <div className="item pkg" key={p.id}>
              <input className="inp" value={p.name} onChange={(e) => pk(i, { name: e.target.value })} placeholder="Package name" />
              <div className="money"><span>$</span><input className="inp" type="number" min="0" step="1" value={p.price || ""} placeholder="0" onChange={(e) => pk(i, { price: e.target.valueAsNumber || 0 })} /></div>
              <input className="inp grow" value={p.description} onChange={(e) => pk(i, { description: e.target.value })} placeholder="What's included" />
              <button className="icon-btn" aria-label="Remove package" onClick={() => setF({ ...f, packages: f.packages.filter((_, j) => j !== i) })}><Icon name="x" size={16} /></button>
            </div>
          ))}
          <div className="sub-actions"><button className="btn small" onClick={() => setF({ ...f, packages: [...f.packages, { id: `pkg-${Date.now().toString(36)}`, name: "", price: 0, description: "" }] })}><Icon name="plus" size={14} /> Add package</button></div>
        </div>
        <div className="fgrid three">
          <Field label="Retainer (%)"><input className="inp" type="number" min="0" max="100" value={f.depositPct || ""} placeholder="0" onChange={(e) => setF({ ...f, depositPct: e.target.valueAsNumber || 0 })} /></Field>
          <Field label="Tax name"><input className="inp" value={f.taxLabel} onChange={(e) => setF({ ...f, taxLabel: e.target.value })} /></Field>
          <Field label="Tax rate (%)" hint="Leave at 0 unless you charge it."><input className="inp" type="number" min="0" max="30" step="0.5" value={f.taxRate || ""} placeholder="0" onChange={(e) => setF({ ...f, taxRate: e.target.valueAsNumber || 0 })} /></Field>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Your details on the contract</h2></div>
        <div className="fgrid">
          <Field label="Business name"><input className="inp" value={f.business.name} onChange={(e) => biz("name", e.target.value)} /></Field>
          <Field label="Signed by"><input className="inp" value={f.business.signer} onChange={(e) => biz("signer", e.target.value)} /></Field>
          <Field label="Business email"><input className="inp" value={f.business.email} onChange={(e) => biz("email", e.target.value)} /></Field>
          <Field label="Phone"><input className="inp" value={f.business.phone} onChange={(e) => biz("phone", e.target.value)} /></Field>
          <Field label="Location"><input className="inp" value={f.business.location} onChange={(e) => biz("location", e.target.value)} /></Field>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Default terms</h2></div>
        <Field label="Contract terms" hint="Lines starting with ## are headings. Tokens: {{client}} {{event_type}} {{date}} {{venue}} {{business}} {{total}} {{deposit}} {{balance}}. This is a starting template: read it carefully, and have someone qualified check it before you rely on it.">
          <textarea className="inp mono" rows={20} value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} />
        </Field>
        <Field label="Email subject for contracts"><input className="inp" value={f.coverSubject} onChange={(e) => setF({ ...f, coverSubject: e.target.value })} /></Field>
        <Field label="Email message" hint="Tokens: {{first_name}} {{event_type}} {{event_date}} {{sign_off}}"><textarea className="inp" rows={8} value={f.coverBody} onChange={(e) => setF({ ...f, coverBody: e.target.value })} /></Field>
        <div className="sub-actions">
          <button className="btn primary" disabled={!dirty || a.busy === "settings"} onClick={() => a.saveSettings(f)}>{a.busy === "settings" ? "Saving…" : dirty ? "Save pricing & terms" : "Saved"}</button>
          {dirty && <button className="btn ghost" onClick={() => setF(initial)}>Undo changes</button>}
        </div>
      </section>
    </div>
  );
}
