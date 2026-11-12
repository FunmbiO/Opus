import { useMemo, useState } from "react";
import type { State, Tx } from "../types";
import { ago, money } from "../format";
import { Icon } from "../components/Icons";
import { CountUp } from "../components/CountUp";

export interface MoneyActions {
  link: (itemId?: string) => Promise<void>;
  sync: () => Promise<boolean>;
  track: (accountId: string, tracked: boolean) => Promise<boolean>;
  disconnect: (itemId: string) => Promise<boolean>;
  setCategory: (id: string, category: string, wholeVendor: boolean) => Promise<boolean>;
  busy: string | null;
  ask: (q: string) => void;
}

const NOT_SPENDING = new Set(["Transfers", "Income"]);

function dayLabel(date: string, today: string) {
  const d = new Date(date + "T12:00:00");
  const t = new Date(today + "T12:00:00");
  const diff = Math.round((t.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric" });
}

export function Spending({ s, m }: { s: State; m: MoneyActions }) {
  const k = s.money;
  const tracked = k.accounts.filter((a) => a.tracked);
  const linked = k.accounts.length > 0;
  const monthName = new Date(k.today.date + "T12:00:00").toLocaleDateString("en-CA", { month: "long" });
  const preview = s.mode === "demo";

  if (!linked) return <Connect s={s} m={m} />;

  return (
    <div className="view">
      <header className="hero slim">
        <div>
          <div className="eyebrow">Spending{preview ? " · sample data" : ""}</div>
          <h1><CountUp value={k.today.spent} decimals={2} prefix="$" /> <span className="soft">spent today</span></h1>
          <p className="lede">
            {tracked.length === 0
              ? "No card is being tracked right now. Turn one on below."
              : <>{money(k.month.spent)} in {monthName} so far across {k.month.count} purchase{k.month.count === 1 ? "" : "s"}.{" "}
                {k.pace ? (k.pace.remaining >= 0 ? <>About <b>{money(k.pace.remaining, 0)}</b> of your free-to-spend money is left{k.pace.perDay > 0 ? `, around ${money(k.pace.perDay, 0)} a day` : ""}.</> : <>You're <b className="neg">{money(-k.pace.remaining, 0)}</b> past your free-to-spend money for the month.</>)
                  : "Add your income under Plan and Opus will show how much you have left to spend."}</>}
          </p>
        </div>
        <div className="hero-actions">
          <button className="btn" onClick={() => void m.sync()} disabled={m.busy === "bank" || preview} title={preview ? "Needs the live agent" : "Check for new transactions now"}><Icon name="refresh" size={16} /> {m.busy === "bank" ? "Checking…" : "Check now"}</button>
          <button className="btn primary" onClick={() => m.ask("What did I spend this month, and where did most of it go? Anything unusual?")}><Icon name="ask" size={16} /> Ask Opus</button>
        </div>
      </header>

      <div className="mstats">
        <div className="mstat"><span>Today</span><b><CountUp value={k.today.spent} decimals={2} prefix="$" /></b><small>{k.today.count} purchase{k.today.count === 1 ? "" : "s"}</small></div>
        <div className="mstat"><span>{monthName}</span><b><CountUp value={k.month.spent} decimals={2} prefix="$" /></b><small>{money(k.month.fixedSpent, 0)} of it is bills and subscriptions</small></div>
        <div className={`mstat${k.pace && k.pace.remaining < 0 ? " over" : ""}`}>
          <span>Free to spend left</span>
          <b>{k.pace ? `${k.pace.remaining < 0 ? "−" : ""}$${Math.abs(k.pace.remaining).toLocaleString("en-CA", { maximumFractionDigits: 0 })}` : "—"}</b>
          <small>{k.pace ? `of ${money(k.pace.free, 0)} after bills, plans and saving` : "needs your income"}</small>
        </div>
      </div>

      <div className="grid-2 bgrid">
        <div className="bstack">
          <section className="panel">
            <div className="panel-head"><h2>Transactions</h2>{preview && <span className="sample">Sample</span>}</div>
            <TxList s={s} m={m} />
          </section>
        </div>

        <div className="bstack">
          <section className="panel">
            <div className="panel-head"><h2>Where it went</h2><strong>{money(k.month.spent, 0)}</strong></div>
            <Categories s={s} />
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Last 14 days</h2></div>
            <DayChart days={k.days} today={k.today.date} />
          </section>

          <Accounts s={s} m={m} />
        </div>
      </div>
    </div>
  );
}

// ---- Not linked yet --------------------------------------------------------------------------

function Connect({ s, m }: { s: State; m: MoneyActions }) {
  const k = s.money;
  const mock = k.env === "mock";
  return (
    <div className="view">
      <header className="hero slim">
        <div>
          <div className="eyebrow">Spending</div>
          <h1>See every purchase, <span className="soft">sorted for you.</span></h1>
          <p className="lede">Link your TD cards and Opus logs each purchase with the vendor name, sorts it into a category like Gas or Groceries, and adds it to your budget. It can only read. It can't move money.</p>
        </div>
      </header>
      <section className="panel connect">
        {s.mode === "demo" ? (
          <p className="hint">This is the preview. Run Opus (<code>npm run serve</code>) to link a card.</p>
        ) : !k.configured ? (
          <>
            <h2>One-time setup</h2>
            <ol className="steps">
              <li>Make a free developer account at <b>plaid.com</b>.</li>
              <li>Copy your <b>client_id</b> and <b>secret</b> into <code>.env</code> as <code>PLAID_CLIENT_ID</code> and <code>PLAID_SECRET</code>. Start with <code>PLAID_ENV=sandbox</code> to try it with a fake bank.</li>
              <li>Restart Opus, then come back here and press Link.</li>
            </ol>
            <p className="hint">The full steps are in SETUP.md under v19.</p>
          </>
        ) : (
          <>
            <h2>{mock ? "Try it with a demo bank" : "Link your bank"}</h2>
            <p className="hint">{mock
              ? "Demo mode: this makes a fake TD Visa and chequing account with sample purchases so you can see how it works."
              : k.env === "sandbox"
                ? "You're in Plaid's sandbox. Pick any bank and sign in with the test login user_good / pass_good."
                : "Plaid opens its own window. Choose TD Canada Trust, sign in, and pick the cards to share. Opus never sees your password."}</p>
            <div><button className="btn primary" onClick={() => void m.link()} disabled={m.busy === "bank"}><Icon name="wallet" size={16} /> {mock ? "Link the demo bank" : "Link a bank"}</button></div>
          </>
        )}
      </section>
    </div>
  );
}

// ---- Accounts ----------------------------------------------------------------------------------

function Accounts({ s, m }: { s: State; m: MoneyActions }) {
  const k = s.money;
  const preview = s.mode === "demo";
  return (
    <section className="panel">
      <div className="panel-head"><h2>Cards and accounts</h2><button className="btn small" onClick={() => void m.link()} disabled={preview || m.busy === "bank"}><Icon name="plus" size={14} /> Link another</button></div>
      <p className="hint">Switch a card off to stop tracking it. Nothing new is saved from it and its purchases are hidden. Switch it back on and the history returns.</p>
      {k.items.map((it) => (
        <div className="accgroup" key={it.id}>
          <div className="acchead">
            <strong>{it.institution}</strong>
            <small className="soft">{it.error ? "" : it.loading ? "loading your history…" : it.lastSync ? `checked ${ago(it.lastSync, s.now)}` : ""}</small>
          </div>
          {it.error && (
            <div className="accerr">
              <span>{it.error}</span>
              {/sign in again/i.test(it.error) && <button className="btn small" onClick={() => void m.link(it.id)}>Sign in again</button>}
            </div>
          )}
          {k.accounts.filter((a) => a.itemId === it.id).map((a) => (
            <label key={a.id} className={`check accrow${a.tracked ? " on" : ""}`}>
              <input type="checkbox" checked={a.tracked} disabled={preview || m.busy === `acc${a.id}`} onChange={(e) => void m.track(a.id, e.target.checked)} />
              <span><b>{a.name}</b>{a.mask ? <> <span className="soft">••{a.mask}</span></> : null}<small className="soft"> {a.type === "credit" ? "credit card" : "debit / chequing"} · {a.tracked ? "tracked" : "not tracked"}</small></span>
            </label>
          ))}
          <button className="textbtn danger" disabled={preview} onClick={() => { if (window.confirm(`Unlink ${it.institution}? Opus will delete every transaction it saved from it. You can link again later.`)) void m.disconnect(it.id); }}>Unlink {it.institution}</button>
        </div>
      ))}
    </section>
  );
}

// ---- Categories ----------------------------------------------------------------------------------

function Categories({ s }: { s: State }) {
  const k = s.money;
  const max = Math.max(1, ...k.categories.map((c) => c.amount));
  if (k.categories.length === 0) return <p className="empty">Nothing spent yet this month.</p>;
  return (
    <div className="rows tight">
      {k.categories.map((c) => {
        const line = c.lineId === null ? undefined : k.lines.find((l) => l.id === c.lineId);
        const over = line ? line.spent > line.planned : false;
        return (
          <div className="catrow" key={c.category}>
            <div className="cathead">
              <span className="bname">{c.category}{c.fixed && <small className="soft"> bills</small>}</span>
              <span className="bamt">{money(c.amount, 0)}</span>
            </div>
            <div className="catbar"><i className={over ? "over" : ""} style={{ width: `${Math.max(2, (Math.max(0, c.amount) / max) * 100)}%` }} /></div>
            {line && <small className={over ? "neg" : "soft"}>{line.name}: {money(line.spent, 0)} of {money(line.planned, 0)} planned{over ? ` (${money(line.spent - line.planned, 0)} over)` : ""}</small>}
          </div>
        );
      })}
    </div>
  );
}

function DayChart({ days, today }: { days: { date: string; amount: number }[]; today: string }) {
  const max = Math.max(1, ...days.map((d) => d.amount));
  return (
    <div className="daychart" role="img" aria-label="Spending per day for the last 14 days">
      {days.map((d) => (
        <div key={d.date} className={`dcol${d.date === today ? " now" : ""}`} title={`${d.date}: ${money(d.amount)}`}>
          <i style={{ height: `${Math.max(d.amount > 0 ? 4 : 1, (Math.max(0, d.amount) / max) * 100)}%` }} />
          <span>{new Date(d.date + "T12:00:00").toLocaleDateString("en-CA", { weekday: "narrow" })}</span>
        </div>
      ))}
    </div>
  );
}

// ---- Transactions -----------------------------------------------------------------------------------

function TxList({ s, m }: { s: State; m: MoneyActions }) {
  const k = s.money;
  const [show, setShow] = useState(40);
  const [edit, setEdit] = useState<string | null>(null);
  const groups = useMemo(() => {
    const out: { date: string; rows: Tx[]; total: number }[] = [];
    for (const t of k.recent.slice(0, show)) {
      let g = out[out.length - 1];
      if (!g || g.date !== t.date) { g = { date: t.date, rows: [], total: 0 }; out.push(g); }
      g.rows.push(t);
      if (!NOT_SPENDING.has(t.category)) g.total += t.amount;
    }
    return out;
  }, [k.recent, show]);

  if (k.recent.length === 0) return <p className="empty">{k.items.some((i) => i.loading) ? "Opus is loading your history from the bank. This can take a minute." : "No transactions yet."}</p>;
  return (
    <div className="txlist">
      {groups.map((g) => (
        <div key={g.date}>
          <div className="txday"><span>{dayLabel(g.date, k.today.date)}</span><b>{money(g.total)}</b></div>
          {g.rows.map((t) => <TxRow key={t.id} t={t} k={k} editing={edit === t.id} setEditing={(on) => setEdit(on ? t.id : null)} m={m} />)}
        </div>
      ))}
      {k.recent.length > show && <button className="textbtn" onClick={() => setShow((n) => n + 40)}>Show more</button>}
    </div>
  );
}

function TxRow({ t, k, editing, setEditing, m }: { t: Tx; k: State["money"]; editing: boolean; setEditing: (on: boolean) => void; m: MoneyActions }) {
  const [cat, setCat] = useState(t.category);
  const [whole, setWhole] = useState(true);
  const same = k.recent.filter((x) => x.merchant === t.merchant).length;
  const off = NOT_SPENDING.has(t.category);
  const guess = t.source === "ai" || t.source === "unsorted";
  const refund = t.amount < 0;
  const save = async () => { if (cat !== t.category && (await m.setCategory(t.id, cat, whole))) setEditing(false); else if (cat === t.category) setEditing(false); };
  return (
    <div className={`txrow${off ? " tx-off" : ""}`}>
      <div className="txmain">
        <div className="txname">
          <b>{t.merchant}</b>
          {t.pending && <span className="txpend">pending</span>}
        </div>
        <small className="soft">{t.account}{t.rawName && t.rawName.toLowerCase() !== t.merchant.toLowerCase() ? ` · ${t.rawName.slice(0, 40)}` : ""}</small>
      </div>
      <button className={`txcat${guess ? " guess" : ""}`} onClick={() => { setCat(t.category); setEditing(!editing); }} aria-label={`Category ${t.category}. Change it.`} title={guess ? "Opus guessed this. Tap to change it." : "Tap to change the category"}>
        {t.category}{guess && <span aria-hidden> ?</span>}
      </button>
      <span className={`bamt txamt${refund ? " in" : ""}`}>{refund ? "+" : ""}{money(Math.abs(t.amount))}</span>
      {editing && (
        <div className="txedit">
          <select className="inp" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            {k.categoryList.map((c) => <option key={c}>{c}</option>)}
          </select>
          {same > 1 && <label className="check small"><input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} /><span>Every {t.merchant} purchase ({same}), including future ones</span></label>}
          {same <= 1 && <label className="check small"><input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} /><span>Remember this for future {t.merchant} purchases</span></label>}
          <div className="txbtns"><button className="btn small primary" onClick={() => void save()} disabled={m.busy === `tx${t.id}`}>Save</button><button className="btn small" onClick={() => setEditing(false)}>Cancel</button></div>
        </div>
      )}
    </div>
  );
}
