import type { Approval, State, Sub } from "../types";
import { ago, dueLabel, money } from "../format";
import { kindMeta, linkedSub } from "../approvals";
import { Icon } from "./Icons";

interface Props {
  a: Approval; s: Pick<State, "subscriptions" | "now">; busy: boolean; selected: boolean;
  onApprove: () => void; onDismiss: () => void; onOpen: () => void;
}

const VERDICT: Record<string, string> = { keep: "Keep", review: "Worth a look", cancel: "Consider cancelling", unclear: "Unclear", lapsed: "Lapsed" };

function Facts({ sub, now }: { sub: Sub; now: string }) {
  return (
    <dl className="aq-facts">
      <div><dt>Costs</dt><dd>{money(sub.monthlyEquivalent)}<small>/mo</small></dd></div>
      <div><dt>Next charge</dt><dd>{dueLabel(sub.nextCharge, now)}</dd></div>
      <div><dt>Opus thinks</dt><dd><span className={`pill v-${sub.verdict}`}>{VERDICT[sub.verdict] ?? sub.verdict}</span></dd></div>
    </dl>
  );
}

export function ApprovalCard({ a, s, busy, selected, onApprove, onDismiss, onOpen }: Props) {
  const sub = linkedSub(a, s.subscriptions);
  const meta = kindMeta(a.kind);
  return (
    <article className={`aq-card ${selected ? "sel" : ""}`} data-id={a.id} aria-current={selected || undefined}>
      <div className="aq-head">
        <span className="pill aq-kind">{meta.label}</span>
        <span className="when">{ago(a.createdAt, s.now)}</span>
      </div>
      <h3 className="aq-title">{a.title}</h3>
      <p className="aq-reason">{a.reason}</p>
      {sub && <Facts sub={sub} now={s.now} />}
      <div className="aq-outcome">
        <Icon name="shield" size={16} />
        <p><b>If you approve:</b> {meta.outcome}</p>
      </div>
      <div className="sub-actions">
        <button className="btn primary small" disabled={busy} onClick={onApprove}>{busy ? "Working…" : meta.verb}</button>
        <button className="btn small" disabled={busy} onClick={onDismiss}>Not now</button>
        <button className="textbtn" onClick={onOpen}>Details <Icon name="arrow" size={14} /></button>
      </div>
    </article>
  );
}
