import { useMemo } from "react";
import type { Sub } from "../types";
import { money } from "../format";
import { upcoming } from "../renewals";

const DAYS = 30;
const VIRTUAL_W = 700; // used only to estimate label widths when stacking

export function RenewalTimeline({ subs, now }: { subs: Sub[]; now: string }) {
  const { charges, labels, lanes, total } = useMemo(() => {
    const charges = upcoming(subs, now, DAYS);
    const byDay = new Map<number, typeof charges>();
    for (const c of charges) if (!c.repeat) byDay.set(c.offset, [...(byDay.get(c.offset) ?? []), c]);
    const labels = [...byDay.entries()].map(([offset, group]) => {
      const left = (offset / DAYS) * 100;
      const longest = Math.max(...group.map((c) => c.name.length));
      const w = ((Math.max(longest * 7.2, 90) + 70) / VIRTUAL_W) * 100;
      const flip = false;
      return { group, offset, left, a: flip ? left - w : left, b: flip ? left : left + w, flip, lane: 0 };
    });
    // Right to left: a label sits above every label whose stem runs underneath it.
    const placed = labels;
    for (let i = placed.length - 1; i >= 0; i--) {
      const x = placed[i]!;
      for (let j = i + 1; j < placed.length; j++) {
        const y = placed[j]!;
        if (y.left >= x.a - 0.4 && y.left <= x.b + 0.4) x.lane = Math.max(x.lane, y.lane + 1);
      }
    }
    const laneCount = placed.reduce((n, p) => Math.max(n, p.lane + 1), 1);
    return { charges, labels, lanes: laneCount, total: charges.reduce((n, c) => n + c.amount, 0) };
  }, [subs, now]);

  const start = new Date(now);
  const ticks = [0, 7, 14, 21, 28].map((d) => ({ d, label: new Date(start.getTime() + d * 86400000).toLocaleDateString("en-CA", { month: "short", day: "numeric" }) }));
  const LANE = 62;
  const height = lanes * LANE + 70;

  return (
    <div className="timeline-wrap">
      <div className="tl-sum"><span className="tl-total">{money(total)}</span><span>leaves your account in the next {DAYS} days, across {new Set(charges.map((c) => c.id)).size} subscriptions.</span></div>
      <div className="tl-scroll">
        <div className="tl" style={{ height }} role="img" aria-label={`Upcoming charges over ${DAYS} days: ${money(total)} in total`}>
          <div className="tl-axis" />
          {ticks.map((t) => (
            <div key={t.d} className="tl-tick" style={{ left: `${(t.d / DAYS) * 100}%` }}><i /><span>{t.d === 0 ? "Today" : t.label}</span></div>
          ))}
          {charges.map((c, i) => (
            <i key={i} className={`tl-dot vv-${c.verdict}${c.repeat ? " rep" : ""}`} style={{ left: `${(c.offset / DAYS) * 100}%` }} />
          ))}
          {labels.map(({ group, offset, left, flip, lane }) => (
            <div key={offset} className={`tl-label vv-${group[0]!.verdict}${flip ? " flip" : ""}`} style={{ left: `${left}%`, bottom: 48 + lane * LANE }}>
              {group.map((c) => (
                <div key={c.id} className="tl-row"><strong>{c.name}</strong><span>{money(c.amount)}</span></div>
              ))}
              <em>{group[0]!.date.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</em>
              <b style={{ height: 18 + lane * LANE }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
