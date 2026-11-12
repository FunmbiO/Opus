import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icons";

export interface Command { id: string; label: string; hint?: string; group: string; icon: string; run: () => void }

export function Palette({ commands, onClose, onAsk }: { commands: Command[]; onClose: () => void; onAsk: (q: string) => void }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? commands.filter((c) => (c.label + " " + c.group).toLowerCase().includes(needle)) : commands;
    const asks: Command[] = q.trim().length > 2 ? [{ id: "ask-q", label: `Ask Opus: ${q.trim()}`, group: "Ask", icon: "ask", hint: "Enter", run: () => onAsk(q.trim()) }] : [];
    return [...asks, ...list];
  }, [q, commands, onAsk]);

  useEffect(() => setI(0), [q]);

  const go = (c?: Command) => { if (!c) return; onClose(); c.run(); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setI((n) => Math.min(items.length - 1, n + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); go(items[i]); }
    else if (e.key === "Escape") onClose();
  };

  let last = "";
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pal-input">
          <Icon name="search" size={18} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="Jump to a page, find a subscription, or ask anything" aria-label="Command" />
          <kbd>Esc</kbd>
        </div>
        <div className="pal-list" role="listbox">
          {items.length === 0 && <div className="pal-empty">Nothing matches. Press Enter on a longer phrase to ask Opus.</div>}
          {items.map((c, n) => {
            const head = c.group !== last ? c.group : null;
            last = c.group;
            return (
              <div key={c.id}>
                {head && <div className="pal-group">{head}</div>}
                <button role="option" aria-selected={n === i} className={n === i ? "pal-item on" : "pal-item"} onMouseEnter={() => setI(n)} onClick={() => go(c)}>
                  <Icon name={c.icon} size={18} /><span>{c.label}</span>{c.hint && <kbd>{c.hint}</kbd>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
