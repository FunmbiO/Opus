import { useState } from "react";
import type { State } from "../types";
import { ago } from "../format";
import { Icon } from "../components/Icons";
import { ApprovalDrawer } from "../components/ApprovalDrawer";
import { ApprovalCard } from "../components/ApprovalCard";
import { ApprovalSummary } from "../components/ApprovalSummary";
import { decidedOf, filterApprovals, pendingOf, sortApprovals, type KindFilter, type SortKey } from "../approvals";

interface Props { s: State; decide: (id: string, action: "approve" | "dismiss") => void; busy: string | null }

export function Approvals({ s, decide, busy }: Props) {
  const [filter, setFilter] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [openId, setOpenId] = useState<string | null>(null);
  const all = pendingOf(s.approvals);
  const pending = sortApprovals(filterApprovals(all, filter), sort, s);
  const done = decidedOf(s.approvals);
  const opened = openId ? s.approvals.find((x) => x.id === openId) ?? null : null;
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
      <div className="aq-list">
        {pending.map((a) => (
          <ApprovalCard key={a.id} a={a} s={s} busy={busy === a.id} selected={false}
            onApprove={() => decide(a.id, "approve")} onDismiss={() => decide(a.id, "dismiss")} onOpen={() => setOpenId(a.id)} />
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
      {opened && (
        <ApprovalDrawer a={opened} s={s} busy={busy === opened.id} onClose={() => setOpenId(null)}
          onApprove={() => { decide(opened.id, "approve"); setOpenId(null); }}
          onDismiss={() => { decide(opened.id, "dismiss"); setOpenId(null); }} />
      )}
    </div>
  );
}
