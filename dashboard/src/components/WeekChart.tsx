import { CATEGORIES, type DayCounts } from "../types";
import { CAT, weekday } from "../format";

export function WeekChart({ week }: { week: DayCounts[] }) {
  const total = (d: DayCounts) => CATEGORIES.reduce((s, c) => s + d[c], 0);
  const max = Math.max(1, ...week.map(total));
  return (
    <div className="week" role="img" aria-label="Emails per day for the last 7 days, by category">
      {week.map((d, i) => (
        <div className="col" key={d.date}>
          <div className="stack" title={`${total(d)} emails`}>
            {[...CATEGORIES].reverse().map((c) =>
              d[c] ? <div key={c} className="seg" style={{ height: `${(d[c] / max) * 100}%`, background: CAT[c].color }} /> : null,
            )}
          </div>
          <div className={i === week.length - 1 ? "day now" : "day"}>{weekday(d.date)}</div>
        </div>
      ))}
    </div>
  );
}

export function Legend() {
  return (
    <div className="legend">
      {CATEGORIES.map((c) => (
        <span key={c}><i style={{ background: CAT[c].color }} />{CAT[c].label}</span>
      ))}
    </div>
  );
}
