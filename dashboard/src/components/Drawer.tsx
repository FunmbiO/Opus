import { useEffect } from "react";
import type { Draft } from "../types";
import { CAT, ago } from "../format";
import { Icon } from "./Icons";

export function DraftDrawer({ draft, now, onClose, onDismiss }: { draft: Draft; now: string; onClose: () => void; onDismiss: () => void }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);
  return (
    <div className="scrim right" onMouseDown={onClose}>
      <aside className="drawer" role="dialog" aria-label="Draft" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-top">
          <span className="chip-cat"><i style={{ background: CAT[draft.category].color }} />{CAT[draft.category].label}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <h2 className="drawer-title">{draft.subject || "Draft"}</h2>
        <div className="from">Reply to {draft.sender.replace(/<.*>/, "").trim() || "unknown"} · written {ago(draft.createdAt, now)}</div>
        <pre className="drawer-body">{draft.preview}</pre>
        <p className="drawer-note">Facts in [CONFIRM: …] are things Opus would not guess. Fill them in before you send.</p>
        <div className="sub-actions">
          {draft.viewUrl && <a className="btn primary" href={draft.viewUrl} target="_blank" rel="noreferrer">Open in Gmail <Icon name="external" size={14} /></a>}
          <button className="btn" onClick={onDismiss}>Discard from list</button>
        </div>
      </aside>
    </div>
  );
}
