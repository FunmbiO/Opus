import type { State } from "../types";
import { money } from "../format";
import { CountUp } from "./CountUp";

const LABEL: Record<string, string> = {
  ok: "Comfortably under target",
  nearing: "Nearing your target",
  target: "At your target",
  warn: "Climbing toward the alert line",
  alert: "Above the alert line",
};

/** The memorable bit: a ruler from $0 to the alert line with your target tick on it. */
export function Meter({ spend }: { spend: State["spend"] }) {
  const max = spend.alertUsd;
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className={`meter lvl-${spend.level}`}>
      <div className="meter-head">
        <div>
          <div className="eyebrow">API spend this month</div>
          <div className="meter-value"><CountUp value={spend.monthUsd} decimals={2} prefix="$" /></div>
        </div>
        <div className="meter-note">{LABEL[spend.level]}</div>
      </div>
      <div className="ruler" role="img" aria-label={`${money(spend.monthUsd)} spent; target ${money(spend.targetUsd, 0)}; alert at ${money(spend.alertUsd, 0)}`}>
        <div className="ruler-fill" style={{ width: pct(spend.monthUsd) }} />
        {Array.from({ length: 21 }, (_, i) => (
          <i key={i} className={i % 5 === 0 ? "tick major" : "tick"} style={{ left: `${i * 5}%` }} />
        ))}
        <div className="pin target" style={{ left: pct(spend.targetUsd) }}><span>Target {money(spend.targetUsd, 0)}</span></div>
        <div className="pin limit" style={{ left: "100%" }}><span>Alert {money(spend.alertUsd, 0)}</span></div>
      </div>
    </div>
  );
}
