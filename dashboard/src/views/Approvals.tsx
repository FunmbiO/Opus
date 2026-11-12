import { useState } from "react";
import type { State } from "../types";
import { ago } from "../format";
import { Icon } from "../components/Icons";
import { ApprovalSummary } from "../components/ApprovalSummary";
import { decidedOf, filterApprovals, pendingOf, sortApprovals, type KindFilter, type SortKey } from "../approvals";

interface Props { s: State; decide: (id: string, action: "approve" | "dismiss") => void; busy: string | null }

export function Approvals({ s, decide, busy }: Props) {
  const [filter, setFilter] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const all = pendingOf(s.approvals);
  const pending = sortApprovals(filterApprovals(all, filter), sort, s);
  const done = decidedOf(s.approvals);
  return (
    <div className="view">
      <header className="hero slim">
        <div>
          <div className="eyebrow">Approval queue</div>
          <h1>{all.length ? `${all.length} waiting on you` : "All clear"}</h1>
          <p className="lede">Opus only suggests. Approving here makes it write the steps or a draft email. It never cancels or sends for you.</p>
        </div>
      </header>

      <ApprovalSummary approvals={s.approvals} subs={s.subscriptions} />

      {all.length > 0 && (
        <div className="toolbar">
          <div className="chips" role="group" aria-label="Filter by kind">
            {([["all", "All"], ["cancel", "Cancel"], ["other", "Other"]] as const).map(([k, l]) => (
              <button key={k} className={`chip ${filter === k ? "on" : ""}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <div className="chips seg2" role="group" aria-label="Sort">
            {([["newest", "Newest"], ["saving", "Biggest saving"], ["soonest", "Soonest charge"]] as const).map(([k, l]) => (
              <button key={k} className={`chip ${sort === k ? "on" : ""}`} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>
            ))}
          </div>
        </div>
      )}

      {all.length === 0 && <p className="empty big">Nothing to decide right now.</p>}
      {all.length > 0 && pending.length === 0 && <p className="empty">Nothing of that kind is waiting.</p>}
      <div className="rows">
        {pending.map((a) => (
          <article className="approval" key={a.id}>
            <div className="approval-icon"><Icon name="approve" /></div>
            <div className="approval-body">
              <strong>{a.title}</strong>
              <p>{a.reason}</p>
              <div className="sub-actions">
                <button className="btn primary small" disabled={busy === a.id} onClick={() => decide(a.id, "approve")}>
                  {busy === a.id ? "Working…" : "Approve: prepare it"}
                </button>
                <button className="btn small" disabled={busy === a.id} onClick={() => decide(a.id, "dismiss")}>Not now</button>
              </div>
            </div>
            <span className="when">{ago(a.createdAt, s.now)}</span>
          </article>
        ))}
      </div>

      {done.length > 0 && (
        <>
          <h3 className="sect">Decided this week</h3>
          <div className="rows">
            {done.map((a) => (
              <article className="approval done" key={a.id}>
                <div className="approval-body">
                  <strong>{a.title}</strong>
                  <p>{a.status === "dismissed" ? "You said not now." : a.result ?? "Prepared."}</p>
                </div>
                <span className="when">{ago(a.createdAt, s.now)}</span>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
