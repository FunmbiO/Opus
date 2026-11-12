import type { State } from "../types";
import { ago } from "../format";
import { Icon } from "../components/Icons";
import { ApprovalSummary } from "../components/ApprovalSummary";

interface Props { s: State; decide: (id: string, action: "approve" | "dismiss") => void; busy: string | null }

export function Approvals({ s, decide, busy }: Props) {
  const pending = s.approvals.filter((a) => a.status === "pending");
  const done = s.approvals.filter((a) => a.status !== "pending");
  return (
    <div className="view">
      <header className="hero slim">
        <div>
          <div className="eyebrow">Approval queue</div>
          <h1>{pending.length ? `${pending.length} waiting on you` : "All clear"}</h1>
          <p className="lede">Opus only suggests. Approving here makes it write the steps or a draft email. It never cancels or sends for you.</p>
        </div>
      </header>

      <ApprovalSummary approvals={s.approvals} subs={s.subscriptions} />

      {pending.length === 0 && <p className="empty big">Nothing to decide right now.</p>}
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
