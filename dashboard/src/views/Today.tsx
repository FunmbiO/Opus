import type { Draft, State } from "../types";
import { CATEGORIES } from "../types";
import { CAT, ago, greeting, money } from "../format";
import { CarMark } from "../components/CarMark";
import { Icon } from "../components/Icons";
import { Meter } from "../components/Meter";
import { Legend, WeekChart } from "../components/WeekChart";
import { CountUp } from "../components/CountUp";
import { Orbit } from "../components/Orbit";
import { RenewalTimeline } from "../components/Timeline";

interface Props {
  s: State;
  go: (tab: "approvals" | "subs" | "budget") => void;
  dismissAlert: (id: string) => void;
  runTriage: () => void;
  busy: boolean;
  openDraft: (d: Draft) => void;
}

export function Today({ s, go, dismissAlert, runTriage, busy, openDraft }: Props) {
  const pending = s.approvals.filter((a) => a.status === "pending");
  const total = CATEGORIES.reduce((n, c) => n + s.today[c], 0);
  const review = s.subscriptions.filter((x) => x.verdict === "review" && x.monthlyEquivalent);
  const reviewSum = review.reduce((n, x) => n + (x.monthlyEquivalent ?? 0), 0);

  return (
    <div className="view">
      <header className="stage">
        <div className="stage-copy">
          <CarMark className="stage-car" />
          <div className="eyebrow">{new Date(s.now).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}</div>
          <h1>{greeting(s.now)}, {s.user}.</h1>
          <p className="lede">
            {total} email{total === 1 ? "" : "s"} in the last day, {s.drafts.length} draft{s.drafts.length === 1 ? "" : "s"} waiting for you
            {pending.length ? `, and ${pending.length} thing${pending.length === 1 ? "" : "s"} for you to decide.` : "."}
          </p>
          <button className="btn ghost" onClick={runTriage} disabled={busy || s.mode === "demo"} title={s.mode === "demo" ? "Connect the agent to run this" : "Sort new mail now"}>
            <Icon name="refresh" size={16} /> {busy ? "Sorting…" : "Sort inbox now"}
          </button>
        </div>
        <div className="stage-orbit">
          <Orbit counts={s.today} busy={busy} />
          <div className="orbit-cap">Each point is an email from the last 24 hours.{s.mode === "demo" ? " Sample data." : ""}</div>
        </div>
      </header>

      {s.alerts.length > 0 && (
        <section className="alerts">
          {s.alerts.map((a) => (
            <div key={a.id} className={`alert sev-${a.severity}`}>
              <Icon name="alert" />
              <div><strong>{a.title}</strong><p>{a.detail}</p></div>
              <button className="icon-btn" aria-label="Dismiss" onClick={() => dismissAlert(a.id)}><Icon name="x" size={16} /></button>
            </div>
          ))}
        </section>
      )}

      {s.pay.configured && (
        <section className="panel">
          <div className="panel-head"><h2>Payday</h2><button className="textbtn" onClick={() => go("budget")}>Open Payday</button></div>
          <div className="mstats tight">
            <div className="mstat"><span>Next payday</span><b>{s.pay.next.today ? "Today" : s.pay.next.days === 1 ? "Tomorrow" : `${s.pay.next.days} days`}</b><small>{new Date(`${s.pay.next.date}T12:00:00`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}</small></div>
            <div className="mstat"><span>Safe until then</span><b>{s.pay.until?.safe != null ? money(s.pay.until.safe, 0) : "—"}</b><small>{s.pay.until?.safe != null ? `about ${money(s.pay.until.perDay, 0)} a day` : "add your plan to see this"}</small></div>
          </div>
        </section>
      )}

      {s.money.accounts.some((a) => a.tracked) && (
        <section className="panel">
          <div className="panel-head"><h2>Spending</h2><button className="textbtn" onClick={() => go("budget")}>Open Spending</button></div>
          <div className="mstats tight">
            <div className="mstat"><span>Today</span><b><CountUp value={s.money.today.spent} decimals={2} prefix="$" /></b><small>{s.money.today.count} purchase{s.money.today.count === 1 ? "" : "s"}</small></div>
            <div className="mstat"><span>This month</span><b><CountUp value={s.money.month.spent} decimals={2} prefix="$" /></b><small>{s.money.pace ? (s.money.pace.remaining >= 0 ? `${money(s.money.pace.remaining, 0)} free to spend left` : `${money(-s.money.pace.remaining, 0)} past your free money`) : `${s.money.month.count} purchases`}</small></div>
          </div>
          {s.money.recent.filter((t) => !["Transfers", "Income"].includes(t.category)).slice(0, 3).map((t) => (
            <div className="brow" key={t.id}>
              <span className="bname">{t.merchant}<small className="soft"> {t.category}{t.pending ? " · pending" : ""}</small></span>
              <span className="bamt">{money(Math.abs(t.amount))}</span>
            </div>
          ))}
        </section>
      )}

      {s.finance.goals.some((g) => g.status !== "reached") && (
        <section className="panel">
          <div className="panel-head"><h2>Saving this month</h2><button className="textbtn" onClick={() => go("budget")}>Open Budget</button></div>
          <div className="rows tight">
            {s.finance.goals.filter((g) => g.status !== "reached").map((g) => (
              <div className="brow" key={g.id}>
                <span className="bname">{g.name}<small className="soft"> {g.status === "done" ? "done" : g.status === "partial" ? "partly set aside" : g.status === "short" ? "can't fully afford" : g.status === "unknown" ? "add income to check" : "on track"}</small></span>
                <span className="bamt">{g.setAside !== null ? `✓ ${money(g.setAside)}` : money(g.plan)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head"><h2>Next 30 days of charges</h2><button className="textbtn" onClick={() => go("subs")}>All subscriptions</button></div>
        <RenewalTimeline subs={s.subscriptions} now={s.now} />
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><h2>Inbox, last 24 hours</h2>{s.mode === "demo" && <span className="sample">Sample</span>}</div>
          <div className="tally">
            {CATEGORIES.map((c) => (
              <div key={c} className="tally-item">
                <i style={{ background: CAT[c].color }} />
                <span className="n"><CountUp value={s.today[c]} ms={700} /></span>
                <span className="l">{CAT[c].label}</span>
              </div>
            ))}
          </div>
          <WeekChart week={s.week} />
          <Legend />
        </section>

        <section className="panel">
          <Meter spend={s.spend} />
          <div className="safe"><Icon name="shield" size={18} /><span>Opus can write drafts and suggest actions. It cannot send, delete or cancel anything.</span></div>
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><h2>Drafts waiting</h2>{s.mode === "demo" && <span className="sample">Sample</span>}</div>
          {s.drafts.length === 0 && <p className="empty">No drafts. Nothing needs a reply right now.</p>}
          {s.drafts.map((d) => (
            <article className="draft" key={d.id} onClick={() => openDraft(d)} tabIndex={0} role="button" onKeyDown={(e) => e.key === "Enter" && openDraft(d)}>
              <div className="draft-top">
                <span className="dot" style={{ background: CAT[d.category].color }} />
                <strong>{d.subject}</strong>
                <span className="when">{ago(d.createdAt, s.now)}</span>
              </div>
              <div className="from">Reply to {d.sender.replace(/<.*>/, "").trim()}</div>
              <pre className="preview">{d.preview}</pre>
              <span className="link">Read the full draft</span>
            </article>
          ))}
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Needs your decision</h2></div>
          <button className="rowbtn" onClick={() => go("approvals")}>
            <span className="big"><CountUp value={pending.length} ms={600} /></span>
            <span><strong>Waiting in the approval queue</strong><small>Cancellations Opus has prepared. You decide.</small></span>
            <Icon name="arrow" />
          </button>
          <button className="rowbtn" onClick={() => go("subs")}>
            <span className="big"><CountUp value={reviewSum} prefix="$" ms={900} /></span>
            <span><strong>A month worth a second look</strong><small>{review.length} subscriptions flagged for review</small></span>
            <Icon name="arrow" />
          </button>
        </section>
      </div>
    </div>
  );
}
