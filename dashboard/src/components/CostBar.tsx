import type { Sub } from "../types";
import { money } from "../format";

/** Each subscription as a block, wide in proportion to its monthly cost. */
export function CostBar({ subs, onPick }: { subs: Sub[]; onPick: (name: string) => void }) {
  const priced = subs.filter((s) => s.monthlyEquivalent).sort((a, b) => (b.monthlyEquivalent ?? 0) - (a.monthlyEquivalent ?? 0));
  const total = priced.reduce((n, s) => n + (s.monthlyEquivalent ?? 0), 0);
  return (
    <div className="costbar" role="list" aria-label="Monthly cost by subscription">
      {priced.map((s) => (
        <button key={s.id} role="listitem" className={`cb vv-${s.verdict}`} style={{ flexGrow: s.monthlyEquivalent ?? 0 }} onClick={() => onPick(s.name)} title={`${s.name}: ${money(s.monthlyEquivalent)} a month`}>
          <span className="cb-name">{s.name}</span>
          <span className="cb-amt">{money(s.monthlyEquivalent, 0)}</span>
          <span className="cb-pct">{Math.round(((s.monthlyEquivalent ?? 0) / total) * 100)}%</span>
        </button>
      ))}
    </div>
  );
}
