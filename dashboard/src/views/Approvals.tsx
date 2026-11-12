import { useEffect, useState } from "react";
import type { State } from "../types";
import { ago } from "../format";
import { Icon } from "../components/Icons";
import { ApprovalDrawer } from "../components/ApprovalDrawer";
import { ApprovalCard } from "../components/ApprovalCard";
import { SafetyTiers } from "../components/SafetyTiers";
import { ApprovalSummary } from "../components/ApprovalSummary";
import { decidedOf, filterApprovals, pendingOf, sortApprovals, type KindFilter, type SortKey } from "../approvals";

interface Props { s: State; decide: (id: string, action: "approve" | "dismiss") => void; undo: (id: string) => unknown; busy: string | null }

export function Approvals({ s, decide, undo, busy }: Props) {
  const [filter, setFilter] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [openId, setOpenId] = useState<string | null>(null);
  const all = pendingOf(s.approvals);
  const pending = sortApprovals(filterApprovals(all, filter), sort, s);
  const done = decidedOf(s.approvals);
  const [selId, setSelId] = useState<string | null>(null);
  // The last "not now", offered for a few seconds as a one-key undo.
  const [last, setLast] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    if (!last) return;
    const t = setTimeout(() => setLast(null), 10000);
    return () => clearTimeout(t);
  }, [last]);
  const dismiss = (a: { id: string; title: string }) => { decide(a.id, "dismiss"); setLast({ id: a.id, title: a.title }); };
  const undoLast = () => { if (!last) return; undo(last.id); setLast(null); };
  const sel = pending.find((x) => x.id === selId) ?? pending[0] ?? null;
  const opened = openId ? s.approvals.find((x) => x.id === openId) ?? null : null;
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || opened) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const i = sel ? pending.findIndex((x) => x.id === sel.id) : -1;
      const move = (n: number) => {
        const next = pending[Math.max(0, Math.min(pending.length - 1, n))];
        if (!next) return;
        setSelId(next.id);
        document.querySelector(`[data-id="${next.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };
      if (e.key === "j") move(i + 1);
      else if (e.key === "k") move(i - 1);
      else if (e.key === "Enter" && sel) setOpenId(sel.id);
      else if (e.key === "a" && sel && busy !== sel.id) decide(sel.id, "approve");
      else if (e.key === "d" && sel && busy !== sel.id) dismiss(sel);
      else if (e.key === "u" && last) undoLast();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });

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

      {all.length === 0 && (
        <div className="aq-empty">
          <p className="aq-prompt">$ opus queue --pending</p>
          <p><b>0 items.</b> Nothing to decide right now. When Opus spots something worth your attention, it lands here.</p>
        </div>
      )}
      {all.length > 0 && pending.length === 0 && <p className="empty">Nothing of that kind is waiting.</p>}
      {last && (
        <div className="aq-undobar" role="status">
          <span>Not now: <b>{last.title}</b></span>
          <button className="btn small primary" onClick={undoLast}>Undo <kbd>u</kbd></button>
        </div>
      )}
      {pending.length > 0 && (
        <p className="aq-keys" aria-label="Keyboard shortcuts"><kbd>j</kbd><kbd>k</kbd> move <kbd>a</kbd> approve <kbd>d</kbd> not now <kbd>u</kbd> undo <kbd>Enter</kbd> details <kbd>Esc</kbd> close</p>
      )}
      <div className="aq-list">
        {pending.map((a) => (
          <ApprovalCard key={a.id} a={a} s={s} busy={busy === a.id} selected={sel?.id === a.id}
            onApprove={() => decide(a.id, "approve")} onDismiss={() => dismiss(a)} onOpen={() => setOpenId(a.id)} />
        ))}
      </div>

      {done.length > 0 && (
        <>
          <h3 className="sect">Decided</h3>
          <div className="rows">
            {done.map((a) => (
              <div className="aq-done" key={a.id}>
                <button className="aq-done-open" onClick={() => setOpenId(a.id)}>
                  <span className={`pill ${a.status === "approved" ? "v-keep" : "v-unclear"}`}>{a.status === "approved" ? "Prepared" : "Not now"}</span>
                  <span className="aq-done-main">
                    <strong>{a.title}</strong>
                    <small>{a.status === "dismissed" ? "You said not now." : a.result ?? "Prepared."}</small>
                  </span>
                  <span className="when">{ago(a.createdAt, s.now)}</span>
                </button>
                {a.status === "dismissed" && (
                  <button className="btn small aq-undo" disabled={busy === a.id} onClick={() => undo(a.id)} title="Put this back in the queue">Undo</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <SafetyTiers />

      {opened && (
        <ApprovalDrawer a={opened} s={s} busy={busy === opened.id} onClose={() => setOpenId(null)}
          onApprove={() => { decide(opened.id, "approve"); setOpenId(null); }}
          onDismiss={() => { dismiss(opened); setOpenId(null); }}
          onUndo={() => { undo(opened.id); setOpenId(null); }} />
      )}
    </div>
  );
}
