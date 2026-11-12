import { useState } from "react";
import type { BudgetActions } from "./Budget";
import type { State } from "../types";
import { money } from "../format";
import { CountUp } from "../components/CountUp";

const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
const fmtShort = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
const fmtMonth = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("en-CA", { month: "long", year: "numeric" });

/** Opus's pay clock: next payday, this month's real income, what is safe to spend until payday, and the months ahead. */
export function PayCard({ s, a }: { s: State; a: BudgetActions }) {
  const p = s.pay;
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const busy = false;

  if (!p.configured) {
    return (
      <section className="panel paycard">
        <div className="panel-head"><h2>Payday</h2></div>
        <p className="soft">Tell Opus when you were last paid and it will plan your months around your real paydays.</p>
        <div className="payform">
          <label>Last payday<input type="date" value={date || p.detected?.anchor || ""} onChange={(e) => setDate(e.target.value)} /></label>
          <label>One paycheque (optional)<input inputMode="decimal" placeholder={p.detected?.amount ? String(p.detected.amount) : "follow my deposits"} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <button className="btn primary" disabled={busy || !(date || p.detected?.anchor)} onClick={() => void a.savePay({ anchor: date || p.detected?.anchor, everyDays: 14, ...(amount.trim() ? { amount } : {}) })}>Save pay</button>
        </div>
      </section>
    );
  }

  const nextWhen = p.next.today ? "Today" : p.next.days === 1 ? "Tomorrow" : `In ${p.next.days} days`;
  const u = p.until;
  return (
    <section className="panel paycard">
      <div className="panel-head">
        <h2>Payday</h2>
        <button className="textbtn" onClick={() => { setEditing(!editing); setDate(p.last); setAmount(p.amountFixed && p.amount ? String(p.amount) : ""); }}>{editing ? "Close" : "Edit"}</button>
      </div>

      {p.late && <div className="alert sev-medium"><div><strong>Your {fmtShort(p.late)} pay has not shown up yet</strong><p>Banks can take a day or two. If it is still missing tomorrow, check with your employer.</p></div></div>}

      <div className="mstats">
        <div className="mstat"><span>Next payday</span><b>{nextWhen}</b><small>{fmtDay(p.next.date)}{p.amount !== null ? ` · about ${money(p.amount)}` : ""}</small></div>
        <div className="mstat"><span>{fmtMonth(p.month.key).split(" ")[0]} income</span><b>{p.month.expected !== null ? <CountUp value={p.month.expected} decimals={2} prefix="$" /> : "—"}</b><small>{p.month.count} paydays{p.month.extra ? " · extra paycheque month" : ""}{p.month.received > 0 ? ` · ${money(p.month.received)} in` : ""}</small></div>
        <div className={`mstat${u?.tight ? " over" : ""}`}><span>Safe until payday</span><b>{u?.safe != null ? <CountUp value={u.safe} decimals={0} prefix="$" /> : "—"}</b><small>{u?.safe != null ? `about ${money(u.perDay, 0)} a day for ${u.days} day${u.days === 1 ? "" : "s"}` : "Add your plan to see this"}</small></div>
      </div>

      <div className="paydays" aria-label="Paydays this month">
        {p.month.dates.map((d) => (
          <span key={d.date} className={`payday${d.received !== null ? " in" : d.passed ? " miss" : ""}`}>{d.received !== null ? "✓ " : ""}{fmtShort(d.date)}{d.received !== null ? ` · ${money(d.received, 0)}` : ""}</span>
        ))}
      </div>

      {u && u.billsBefore.length > 0 && (
        <p className="soft">Before payday: {u.billsBefore.map((b) => `${b.name} ${money(b.amount)} (${fmtShort(b.date)})`).join(", ")}. That is {money(u.billsTotal)} leaving your account.</p>
      )}
      {p.monthEnd && (
        <p className="soft">{p.monthEnd.onTrack ? <>At this pace you finish the month with about <b>{money(p.monthEnd.projectedLeft, 0)}</b> of free money unspent.</> : <>At this pace you finish the month about <b className="neg">{money(-p.monthEnd.projectedLeft, 0)}</b> over your free money.</>}</p>
      )}

      <div className="outlook">
        {p.outlook.map((o) => (
          <div key={o.month} className={`orow${o.extra ? " extra" : ""}`}>
            <span>{fmtMonth(o.month)}</span>
            <span className="soft">{o.paydays.map(fmtShort).join(" · ")}</span>
            <b>{o.total !== null ? money(o.total, 0) : "—"}{o.extra && <small> extra paycheque</small>}</b>
          </div>
        ))}
      </div>

      {editing && (
        <div className="payform">
          <label>Last payday<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>One paycheque<input inputMode="decimal" placeholder="follow my deposits" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <button className="btn primary" onClick={async () => { if (await a.savePay({ anchor: date, everyDays: p.schedule.everyDays, amount: amount.trim() ? amount : null })) setEditing(false); }}>Save</button>
          <button className="btn ghost" onClick={async () => { if (await a.clearPay()) setEditing(false); }}>Forget my pay</button>
        </div>
      )}
    </section>
  );
}
