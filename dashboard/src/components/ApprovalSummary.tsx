import type { Approval, Sub } from "../types";
import { counts, pendingOf, totalSaving } from "../approvals";
import { money } from "../format";

/** Four numbers at the top of the queue: what is waiting, what was decided, and what is at stake. */
export function ApprovalSummary({ approvals, subs }: { approvals: Approval[]; subs: Sub[] }) {
  const c = counts(approvals);
  const atStake = totalSaving(pendingOf(approvals), subs);
  return (
    <section className="aq-summary" aria-label="Queue summary">
      <div className="aq-stat hot"><b>{c.waiting}</b><span>waiting on you</span></div>
      <div className="aq-stat"><b>{c.prepared}</b><span>prepared</span></div>
      <div className="aq-stat"><b>{c.dismissed}</b><span>not now</span></div>
      <div className="aq-stat save"><b>{money(atStake)}</b><span>a month at stake</span></div>
    </section>
  );
}
