import { useState } from "react";
import type { State, Sub } from "../types";
import { daysUntil, dueLabel, money, cycleLabel } from "../format";
import { Icon } from "../components/Icons";
import { CostBar } from "../components/CostBar";
import { CountUp } from "../components/CountUp";

const VERDICT: Record<string, { label: string; cls: string }> = {
  keep: { label: "Keep", cls: "v-keep" },
  review: { label: "Worth a look", cls: "v-review" },
  unclear: { label: "Unclear", cls: "v-unclear" },
  lapsed: { label: "Lapsed", cls: "v-lapsed" },
};
type Filter = "all" | "review" | "keep" | "other";

interface Props {
  s: State;
  keep: (id: string) => void;
  prepare: (id: string) => void;
  query: string;
  setQuery: (q: string) => void;
}

export function Subscriptions({ s, keep, prepare, query, setQuery }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"soon" | "cost">("soon");
  const priced = s.subscriptions.filter((x) => x.monthlyEquivalent);
  const sum = (list: Sub[]) => list.reduce((n, x) => n + (x.monthlyEquivalent ?? 0), 0);
  const total = sum(priced);
  const reviewSum = sum(priced.filter((x) => x.verdict === "review"));
  const unpriced = s.subscriptions.length - priced.length;

  const q = query.trim().toLowerCase();
  const list = s.subscriptions
    .filter((x) => (filter === "all" ? true : filter === "other" ? x.verdict === "unclear" || x.verdict === "lapsed" : x.verdict === filter))
    .filter((x) => !q || (x.name + " " + x.plan + " " + x.reason).toLowerCase().includes(q))
    .sort((a, b) => sort === "cost" ? (b.monthlyEquivalent ?? -1) - (a.monthlyEquivalent ?? -1) : 0);
  const pendingFor = new Set(s.approvals.filter((a) => a.status === "pending").map((a) => a.subscriptionId));

  return (
    <div className="view">
      <header className="hero slim">
        <div>
          <div className="eyebrow">Subscriptions</div>
          <h1><CountUp value={total} prefix="$" /> <span className="soft">a month</span></h1>
          <p className="lede">
            That is about {money(total * 12, 0)} a year. {money(reviewSum, 0)} a month of it is worth a second look.
            {unpriced > 0 && ` ${unpriced} more have no price in your emails, so they aren't counted.`} Amounts are as shown on receipts (assumed CAD).
          </p>
        </div>
      </header>

      <CostBar subs={s.subscriptions} onPick={setQuery} />
      <div className="costkey"><span><i className="k-keep" />Keep</span><span><i className="k-review" />Worth a look</span><span><i className="k-other" />Unclear</span><span className="soft">Block width = monthly cost. Click one to find it below.</span></div>

      <div className="toolbar">
      <label className="search"><Icon name="search" size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search subscriptions" aria-label="Search subscriptions" />{query && <button type="button" className="icon-btn" onClick={() => setQuery("")} aria-label="Clear"><Icon name="x" size={14} /></button>}</label>
      <div className="chips seg2"><button className={sort === "soon" ? "chip on" : "chip"} onClick={() => setSort("soon")}>By date</button><button className={sort === "cost" ? "chip on" : "chip"} onClick={() => setSort("cost")}>By cost</button></div>
      </div>
      <div className="chips" role="tablist">
        {(["all", "review", "keep", "other"] as Filter[]).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "chip on" : "chip"} onClick={() => setFilter(f)}>
            {{ all: "All", review: "Worth a look", keep: "Keeping", other: "Unclear or lapsed" }[f]}
          </button>
        ))}
      </div>

      <div className="rows">
        {list.map((x) => {
          const v = VERDICT[x.verdict] ?? VERDICT.unclear!;
          const soon = (daysUntil(x.nextCharge, s.now) ?? 99) <= 7 && x.verdict === "review";
          return (
            <article className="sub" key={x.id}>
              <div className="sub-main">
                <div className="sub-title">
                  <strong>{x.name}</strong>
                  <span className={`pill ${v.cls}`}>{v.label}</span>
                  {x.userDecided && <span className="pill v-you">Your call</span>}
                </div>
                <div className="sub-plan">{x.plan}</div>
                <p className="sub-reason">{x.reason}</p>
                <div className="sub-actions">
                  {x.verdict !== "keep" && x.status !== "lapsed" && (
                    <button className="btn small" onClick={() => keep(x.id)}>Keep it</button>
                  )}
                  {x.verdict === "review" && (
                    pendingFor.has(x.id)
                      ? <span className="queued"><Icon name="approve" size={14} /> In your approval queue</span>
                      : <button className="btn small primary" onClick={() => prepare(x.id)}>Prepare cancellation</button>
                  )}
                </div>
              </div>
              <div className="sub-price">
                <div className="amt">{x.amount != null ? money(x.amount) : "—"}<small>{cycleLabel(x.cycle)}</small></div>
                {x.cycle !== "monthly" && x.monthlyEquivalent != null && <div className="eq">{money(x.monthlyEquivalent)} / mo</div>}
                <div className={soon ? "next soon" : "next"}>{x.status === "lapsed" ? "Lapsed" : dueLabel(x.nextCharge, s.now)}</div>
              </div>
            </article>
          );
        })}
        {list.length === 0 && <p className="empty big">No subscription matches. Clear the search to see all {s.subscriptions.length}.</p>}
      </div>
    </div>
  );
}
