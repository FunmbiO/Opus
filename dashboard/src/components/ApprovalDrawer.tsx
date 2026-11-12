import { useEffect } from "react";
import type { Approval, State } from "../types";
import { ago, dueLabel, money } from "../format";
import { kindMeta, linkedSub } from "../approvals";
import { Icon } from "./Icons";

interface Props {
  a: Approval; s: Pick<State, "subscriptions" | "now">; busy: boolean;
  onClose: () => void; onApprove: () => void; onDismiss: () => void;
}

export function ApprovalDrawer({ a, s, busy, onClose, onApprove, onDismiss }: Props) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);
  const sub = linkedSub(a, s.subscriptions);
  const meta = kindMeta(a.kind);
  const pending = a.status === "pending";
  return (
    <div className="scrim right" onMouseDown={onClose}>
      <aside className="drawer" role="dialog" aria-label="Approval details" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-top">
          <span className="pill aq-kind">{meta.label}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <h2 className="drawer-title">{a.title}</h2>
        <div className="from">Suggested {ago(a.createdAt, s.now)}</div>
        <pre className="drawer-body">{a.reason}</pre>
        {sub && (
          <dl className="aq-detail">
            <div><dt>Service</dt><dd>{sub.name}</dd></div>
            <div><dt>Plan</dt><dd>{sub.plan || "—"}</dd></div>
            <div><dt>Billing</dt><dd>{sub.billing || sub.cycle || "—"}</dd></div>
            <div><dt>Costs</dt><dd>{money(sub.amount)} {sub.cycle && <small>{sub.cycle}</small>}{sub.cycle !== "monthly" && sub.monthlyEquivalent != null ? <> · {money(sub.monthlyEquivalent)}/mo</> : null}</dd></div>
            <div><dt>Next charge</dt><dd>{dueLabel(sub.nextCharge, s.now)}{sub.nextCharge ? ` (${sub.nextCharge})` : ""}</dd></div>
            <div><dt>Last seen</dt><dd>{sub.lastSeen ?? "—"}</dd></div>
            <div><dt>Why Opus flagged it</dt><dd>{sub.reason || "—"}</dd></div>
          </dl>
        )}
        <div className="aq-outcome"><Icon name="shield" size={16} /><p><b>If you approve:</b> {meta.outcome}</p></div>
        {pending ? (
          <div className="sub-actions">
            <button className="btn primary" disabled={busy} onClick={onApprove}>{busy ? "Working…" : meta.verb}</button>
            <button className="btn" disabled={busy} onClick={onDismiss}>Not now</button>
          </div>
        ) : (
          <p className="drawer-note">{a.status === "dismissed" ? "You said not now." : a.result ?? "Prepared."}</p>
        )}
      </aside>
    </div>
  );
}
