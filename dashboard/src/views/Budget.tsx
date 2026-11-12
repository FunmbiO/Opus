import { PayCard } from "./Pay";
import { useState } from "react";
import type { BudgetLine, Goal, GoalStatus, State } from "../types";
import { longDate, money, monthName } from "../format";
import { Icon } from "../components/Icons";
import { CountUp } from "../components/CountUp";
import { Spending, type MoneyActions } from "./Spending";

export interface BudgetActions {
  addLine: (kind: BudgetLine["kind"], name: string, amount: number) => Promise<boolean>;
  updateLine: (id: number, name: string, amount: number) => Promise<boolean>;
  removeLine: (id: number) => Promise<boolean>;
  addGoal: (g: { name: string; target: number; saved: number; due: string | null }) => Promise<boolean>;
  updateGoal: (id: number, g: Partial<{ name: string; target: number; saved: number; due: string | null }>) => Promise<boolean>;
  removeGoal: (id: number) => Promise<boolean>;
  setAside: (id: number, amount?: number) => Promise<boolean>;
  undoSetAside: (id: number) => Promise<boolean>;
  addBill: (name: string, amount: number, cycle: string) => Promise<boolean>;
  removeBill: (id: string) => Promise<boolean>;
  savePay: (b: Record<string, unknown>) => Promise<boolean>;
  clearPay: () => Promise<boolean>;
  ask: (q: string) => void;
}

const num = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(/[$,\s]/g, "")));

/** One page, two views: what you spent (from your cards) and the plan (income, bills, goals). */
export function Budget({ s, a, m, start }: { s: State; a: BudgetActions; m: MoneyActions; start: "spending" | "plan" }) {
  const [view, setView] = useState<"spending" | "plan">(start);
  return (
    <div className="view">
      <div className="chips" role="tablist" aria-label="Budget views">
        <button role="tab" aria-selected={view === "spending"} className={view === "spending" ? "chip on" : "chip"} onClick={() => setView("spending")}>Spending</button>
        <button role="tab" aria-selected={view === "plan"} className={view === "plan" ? "chip on" : "chip"} onClick={() => setView("plan")}>Plan and goals</button>
      </div>
      <PayCard s={s} a={a} />
      {view === "spending" ? <Spending s={s} m={m} /> : <Plan s={s} a={a} />}
    </div>
  );
}

function Plan({ s, a }: { s: State; a: BudgetActions }) {
  const f = s.finance;
  const spentOn = new Map(s.money.lines.map((l) => [l.id, l.spent]));
  const total = Math.max(f.income, f.fixed + f.planned + f.saving, 1);
  const seg = (n: number) => `${Math.max(0, (n / total) * 100)}%`;
  const overspent = f.hasIncome && f.left < 0;

  return (
    <div className="view">
      <header className="hero slim">
        <div>
          <div className="eyebrow">Budget and savings</div>
          {f.hasIncome ? (
            <h1><span className={overspent ? "neg" : ""}><CountUp value={Math.abs(f.left)} prefix={overspent ? "−$" : "$"} /></span> <span className="soft">{overspent ? "over each month" : "free to spend each month"}</span></h1>
          ) : (
            <h1><CountUp value={f.fixed} prefix="$" /> <span className="soft">fixed each month</span></h1>
          )}
          <p className="lede">
            {f.hasIncome
              ? `${f.perDay > 0 ? `That's about ${money(f.perDay, 0)} a day for the ${f.daysLeft} days left in this month. ` : ""}Of ${money(f.income, 0)} coming in: ${money(f.fixed, 0)} goes to subscriptions and bills, ${money(f.planned, 0)} to planned spending and ${money(f.saving, 0)} to saving${f.savingsRate != null ? ` (${f.savingsRate}% of income)` : ""}.`
              : "Add what you earn each month and Opus can show what is left after your subscriptions, bills and savings. Your subscriptions and bills are already counted."}
            {f.unpricedCount > 0 && ` ${f.unpricedCount} subscriptions have no price yet, so they aren't counted.`}
          </p>
        </div>
        <div className="hero-actions">
          <button className="btn primary" onClick={() => a.ask("Build me a monthly budget spreadsheet from my current budget, bills and subscriptions.")}><Icon name="file" size={16} /> Ask Opus for a budget file</button>
        </div>
      </header>

      {(f.income > 0 || f.fixed > 0) && (
        <div className="bbar" role="img" aria-label="How your monthly income is used">
          <i className="b-fixed" style={{ width: seg(f.fixed) }} title={`Subscriptions and bills ${money(f.fixed)}`} />
          <i className="b-plan" style={{ width: seg(f.planned) }} title={`Planned spending ${money(f.planned)}`} />
          <i className="b-save" style={{ width: seg(f.saving) }} title={`Saving ${money(f.saving)}`} />
          {f.hasIncome && !overspent && <i className="b-left" style={{ width: seg(f.left) }} title={`Left over ${money(f.left)}`} />}
        </div>
      )}
      <div className="costkey"><span><i className="k-fixed" />Subscriptions and bills</span><span><i className="k-plan" />Planned spending</span><span><i className="k-save" />Saving</span>{f.hasIncome && <span><i className="k-left" />Left over</span>}</div>

      <div className="grid-2 bgrid">
        <div className="bstack">
          <LinePanel title="Money coming in" hint="What you earn in a typical month. Opus can estimate this from your paystubs: ask it in chat." kind="income" lines={f.lines} a={a} placeholder="Paycheque (monthly average)" />
          <section className="panel">
            <div className="panel-head"><h2>Subscriptions and bills</h2><strong>{money(f.fixed)}<small className="soft"> / month</small></strong></div>
            <p className="hint">Counted automatically from your Subscriptions page and your bills. Yearly and weekly ones are converted to a monthly amount.</p>
            <div className="rows tight">
              {f.fixedItems.map((x) => (
                <div className="brow" key={x.id}>
                  <span className="bname">{x.name}</span>
                  <span className="bamt">{money(x.monthly)}</span>
                  {x.removable ? <button className="icon-btn" aria-label={`Remove ${x.name}`} onClick={() => a.removeBill(x.id)}><Icon name="x" size={14} /></button> : <span className="bgap" />}
                </div>
              ))}
              {f.fixedItems.length === 0 && <p className="empty">No priced subscriptions or bills yet.</p>}
            </div>
            <AddBill a={a} />
          </section>
          <LinePanel title="Planned spending" hint="Rent, groceries, gas, anything else you plan to spend each month. Lines named like a spending category (Groceries, Gas, Dining) show what you have spent so far." kind="expense" lines={f.lines} a={a} placeholder="Rent" spent={spentOn} />
          <LinePanel title="Saving each month" hint="Money you set aside on a regular basis, apart from the goals on the right." kind="saving" lines={f.lines} a={a} placeholder="Emergency fund" />
        </div>

        <div className="bstack">
          <GoalsPanel goals={f.goals} verdict={f.goalsVerdict} a={a} />
          <section className="panel">
            <div className="panel-head"><h2>Coming up (30 days)</h2><strong>{money(f.upcomingTotal)}</strong></div>
            <div className="rows tight">
              {f.upcoming.map((u) => (
                <div className="brow" key={`${u.id}${u.date}`}>
                  <span className="bname">{u.name}<small className="soft"> {u.days === 0 ? "today" : u.days === 1 ? "tomorrow" : `in ${u.days} days`} · {longDate(u.date)}</small></span>
                  <span className="bamt">{money(u.amount)}</span>
                </div>
              ))}
              {f.upcoming.length === 0 && <p className="empty">No priced charges in the next 30 days.</p>}
            </div>
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Recent charges</h2></div>
            <div className="rows tight">
              {f.charges.map((c) => (
                <div className="brow" key={c.id}>
                  <span className="bname">{c.name}<small className="soft"> {c.posted ? `posted ${longDate(c.posted)}` : c.charged ? `charged ${longDate(c.charged)}` : ""}</small></span>
                  <span className="bamt">{money(c.amount)}</span>
                </div>
              ))}
              {f.charges.length === 0 && <p className="empty">No charges recorded yet.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function LinePanel({ title, hint, kind, lines, a, placeholder, spent }: { title: string; hint: string; kind: BudgetLine["kind"]; lines: BudgetLine[]; a: BudgetActions; placeholder: string; spent?: Map<number, number> }) {
  const mine = lines.filter((l) => l.kind === kind);
  const sum = mine.reduce((n, l) => n + l.amount, 0);
  const [name, setName] = useState("");
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = name.trim() !== "" && Number.isFinite(num(amt)) && num(amt) >= 0;
  return (
    <section className="panel">
      <div className="panel-head"><h2>{title}</h2><strong>{money(sum)}<small className="soft"> / month</small></strong></div>
      <p className="hint">{hint}</p>
      <div className="rows tight">
        {mine.map((l) => <LineRow key={l.id} l={l} a={a} spent={spent?.get(l.id)} />)}
        {mine.length === 0 && <p className="empty">Nothing here yet.</p>}
      </div>
      <form className="addrow" onSubmit={async (e) => { e.preventDefault(); if (!ok || busy) return; setBusy(true); if (await a.addLine(kind, name.trim(), num(amt))) { setName(""); setAmt(""); } setBusy(false); }}>
        <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} aria-label={`${title} name`} />
        <input className="inp amt" value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder="$ per month" aria-label={`${title} amount per month`} />
        <button className="btn small primary" disabled={!ok || busy}><Icon name="plus" size={14} /> Add</button>
      </form>
    </section>
  );
}

function LineRow({ l, a, spent }: { l: BudgetLine; a: BudgetActions; spent?: number }) {
  const [name, setName] = useState(l.name);
  const [amt, setAmt] = useState(String(l.amount));
  const changed = name.trim() !== l.name || num(amt) !== l.amount;
  const valid = name.trim() !== "" && Number.isFinite(num(amt)) && num(amt) >= 0;
  return (
    <div className="brow edit">
      <input className="inp ghost" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
      <input className="inp amt ghost" value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" aria-label={`Monthly amount for ${l.name}`} />
      {spent !== undefined && <span className={`bspent${spent > l.amount ? " neg" : ""}`} title="Spent this month on your cards">{money(spent, 0)} spent</span>}
      {changed && valid ? <button className="btn small" onClick={() => a.updateLine(l.id, name.trim(), num(amt))}>Save</button> : <span className="bgap" />}
      <button className="icon-btn" aria-label={`Remove ${l.name}`} onClick={() => a.removeLine(l.id)}><Icon name="x" size={14} /></button>
    </div>
  );
}

function AddBill({ a }: { a: BudgetActions }) {
  const [name, setName] = useState("");
  const [amt, setAmt] = useState("");
  const [cycle, setCycle] = useState("monthly");
  const [busy, setBusy] = useState(false);
  const ok = name.trim() !== "" && Number.isFinite(num(amt)) && num(amt) >= 0;
  return (
    <form className="addrow" onSubmit={async (e) => { e.preventDefault(); if (!ok || busy) return; setBusy(true); if (await a.addBill(name.trim(), num(amt), cycle)) { setName(""); setAmt(""); } setBusy(false); }}>
      <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a bill (for example Internet)" aria-label="Bill name" />
      <input className="inp amt" value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder="$ amount" aria-label="Bill amount" />
      <select className="inp cyc" value={cycle} onChange={(e) => setCycle(e.target.value)} aria-label="How often"><option value="monthly">monthly</option><option value="yearly">yearly</option><option value="weekly">weekly</option></select>
      <button className="btn small primary" disabled={!ok || busy}><Icon name="plus" size={14} /> Add</button>
    </form>
  );
}

const STATUS: Record<GoalStatus, { label: string; cls: string }> = {
  reached: { label: "Reached", cls: "g-done" },
  done: { label: "Done this month", cls: "g-done" },
  partial: { label: "Partly set aside", cls: "g-warn" },
  on_track: { label: "You can afford it", cls: "g-ok" },
  short: { label: "Can't fully afford it", cls: "g-bad" },
  unknown: { label: "Add income to check", cls: "g-warn" },
};

function GoalsPanel({ goals, verdict, a }: { goals: Goal[]; verdict: string; a: BudgetActions }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", target: "", saved: "", due: "" });
  const [busy, setBusy] = useState(false);
  const ok = f.name.trim() !== "" && num(f.target) > 0 && (f.saved === "" || num(f.saved) >= 0);
  const openGoals = goals.filter((g) => g.status !== "reached");
  const doneCount = openGoals.filter((g) => g.status === "done" || g.status === "partial").length;
  return (
    <section className="panel">
      <div className="panel-head"><h2>Savings goals</h2><button className="btn small" onClick={() => setOpen((o) => !o)}><Icon name="plus" size={14} /> New goal</button></div>
      {openGoals.length > 0 && (
        <p className={`gverdict v-${verdict}`}>
          {verdict === "ok" && `You can afford all of this month's set-asides. ${doneCount} of ${openGoals.length} done.`}
          {verdict === "short" && `You can't fully fund every goal this month. See the red ones below. ${doneCount} of ${openGoals.length} done.`}
          {verdict === "unknown" && "Add your income above and Opus will tell you if you can afford each goal."}
        </p>
      )}
      {open && (
        <form className="goalform" onSubmit={async (e) => {
          e.preventDefault(); if (!ok || busy) return; setBusy(true);
          const done = await a.addGoal({ name: f.name.trim(), target: num(f.target), saved: f.saved === "" ? 0 : num(f.saved), due: f.due || null });
          if (done) { setF({ name: "", target: "", saved: "", due: "" }); setOpen(false); }
          setBusy(false);
        }}>
          <input className="inp" placeholder="Goal (for example New camera)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Goal name" />
          <div className="two">
            <label>How much do you want to save?<input className="inp" inputMode="decimal" placeholder="$" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></label>
            <label>Saved so far (optional)<input className="inp" inputMode="decimal" placeholder="$0" value={f.saved} onChange={(e) => setF({ ...f, saved: e.target.value })} /></label>
            <label>When do you want it by?<input className="inp" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></label>
          </div>
          <p className="hint">You don't pick a monthly amount. Opus works it out from the target and the date, and tells you if you can afford it.{!f.due && " Without a date, Opus plans half of what is free each month."}</p>
          <button className="btn primary" disabled={!ok || busy}>Add goal</button>
        </form>
      )}
      {goals.length === 0 && !open && <p className="empty">No goals yet. Add one, like a new lens, a trip or an emergency fund. Set the amount and a date, and Opus works out what to put aside each month.</p>}
      {goals.map((g) => <GoalCard key={g.id} g={g} a={a} />)}
    </section>
  );
}

function GoalCard({ g, a }: { g: Goal; a: BudgetActions }) {
  const [partial, setPartial] = useState(false);
  const [amt, setAmt] = useState("");
  const [edit, setEdit] = useState(false);
  const [e, setE] = useState({ name: g.name, target: String(g.target), saved: String(g.saved), due: g.due ?? "" });
  const [busy, setBusy] = useState(false);
  const st = STATUS[g.status];
  const logged = g.setAside !== null;
  const reached = g.status === "reached";
  const wrap = async (fn: () => Promise<boolean>) => { setBusy(true); const r = await fn(); setBusy(false); return r; };
  return (
    <article className="goal">
      <div className="goal-top"><strong>{g.name}</strong><span className={`pill ${st.cls}`}>{st.label}</span><span className="grow" /><button className="icon-btn" aria-label={`Edit ${g.name}`} onClick={() => setEdit((x) => !x)}><Icon name="draft" size={15} /></button><button className="icon-btn" aria-label={`Remove ${g.name}`} onClick={() => { if (window.confirm(`Delete the goal "${g.name}" and its history?`)) void a.removeGoal(g.id); }}><Icon name="x" size={14} /></button></div>
      <div className="gbar" role="progressbar" aria-valuenow={g.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.name} progress`}><i style={{ width: `${g.pct}%` }} /></div>
      <div className="goal-nums"><span>{money(g.totalSaved, 0)} of {money(g.target, 0)}{g.due ? ` by ${longDate(g.due)}` : ""}</span><b>{g.pct}%</b></div>

      {edit && (
        <form className="goalform" onSubmit={async (ev) => { ev.preventDefault(); if (await wrap(() => a.updateGoal(g.id, { name: e.name.trim() || g.name, target: num(e.target), saved: num(e.saved), due: e.due || null }))) setEdit(false); }}>
          <div className="two">
            <label>Name<input className="inp" value={e.name} onChange={(x) => setE({ ...e, name: x.target.value })} /></label>
            <label>Target<input className="inp" inputMode="decimal" value={e.target} onChange={(x) => setE({ ...e, target: x.target.value })} /></label>
            <label>Saved before Opus tracked it<input className="inp" inputMode="decimal" value={e.saved} onChange={(x) => setE({ ...e, saved: x.target.value })} /></label>
            <label>Date<input className="inp" type="date" value={e.due} onChange={(x) => setE({ ...e, due: x.target.value })} /></label>
          </div>
          <button className="btn small primary" disabled={busy || !(num(e.target) > 0) || !(num(e.saved) >= 0)}>Save changes</button>
        </form>
      )}

      {!reached && (
        <div className={`gmonth m-${g.status}`}>
          <div className="gm-head"><span>{monthName(g.month)}</span><b>{money(g.plan)}</b></div>
          <p className="gm-msg">{g.message}</p>
          <label className={`check gcheck${logged ? " on" : ""}`}>
            <input type="checkbox" checked={logged && g.status !== "partial"} disabled={busy} onChange={(ev) => { if (ev.target.checked) void wrap(() => a.setAside(g.id)); else void wrap(() => a.undoSetAside(g.id)); }} />
            <span>{logged ? (g.status === "partial" ? `Logged ${money(g.setAside)} of ${money(g.plan)}` : `I set aside ${money(g.setAside)}`) : `I set aside ${money(g.plan)} this month`}</span>
          </label>
          {g.shortfall > 0 && g.status === "short" && <p className="hint">Can only manage less? Log what you did put aside below. Opus spreads the rest over the months that are left.</p>}
          <div className="gm-actions">
            {!partial && <button className="textbtn" onClick={() => { setPartial(true); setAmt(logged ? String(g.setAside) : ""); }}>{logged ? "Change the amount" : "I set aside a different amount"}</button>}
            {logged && <button className="textbtn" onClick={() => void wrap(() => a.undoSetAside(g.id))}>Undo</button>}
          </div>
          {partial && (
            <form className="addrow" onSubmit={async (ev) => { ev.preventDefault(); if (!Number.isFinite(num(amt)) || num(amt) < 0) return; if (await wrap(() => a.setAside(g.id, num(amt)))) { setPartial(false); setAmt(""); } }}>
              <label className="mini">I actually set aside<input className="inp amt" autoFocus value={amt} onChange={(ev) => setAmt(ev.target.value)} inputMode="decimal" placeholder="$0" /></label>
              <button className="btn small primary" disabled={busy || !Number.isFinite(num(amt)) || num(amt) < 0}>Log it</button>
              <button type="button" className="btn small" onClick={() => setPartial(false)}>Cancel</button>
            </form>
          )}
        </div>
      )}
      {g.history.length > 0 && (
        <div className="ghist" aria-label="Past months">
          {g.history.map((h) => <span key={h.month} className={h.amount + 0.004 >= h.planned ? "ok" : "low"} title={`${monthName(h.month)}: set aside ${money(h.amount)} of ${money(h.planned)}`}>{monthName(h.month).slice(0, 3)} {h.amount + 0.004 >= h.planned ? "✓" : money(h.amount, 0)}</span>)}
        </div>
      )}
    </article>
  );
}
