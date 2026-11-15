import { useId } from "react";
import { LINE_FULL, O_BOLD, O_FULL, STOPS, SWASH_BOLD, SWASH_FULL } from "./omarkPaths";

const stops = (k: keyof typeof STOPS) => STOPS[k].map(([o, c]) => <stop key={o} offset={o} stopColor={c} />);

/**
 * The Opus mark: a calligraphic "O" (thick on the downstroke, a hairline on the upstroke, with a curl inside)
 * and a long swash that sweeps across it like the roofline of the Opus car. "bold" is the heavier version that
 * stays readable at small sizes (nav, favicon). The shapes come from scripts/make-logo.mjs.
 */
export function OMark({ bold = false, size = 32, className = "", title = "Opus" }: { bold?: boolean; size?: number; className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={`omark ${className}`} viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={title}>
      <defs>
        <linearGradient id={`r${id}`} x1="0" y1=".15" x2="1" y2=".85">{stops("ring")}</linearGradient>
        <linearGradient id={`a${id}`} x1="0" y1="0" x2="1" y2="0">{stops("swash")}</linearGradient>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="1" y2="0">{stops("line")}</linearGradient>
      </defs>
      <g className="omark-swash">
        {!bold && <path fill={`url(#b${id})`} d={LINE_FULL} />}
        <path fill={`url(#a${id})`} d={bold ? SWASH_BOLD : SWASH_FULL} />
      </g>
      <path className="omark-o" fill={`url(#r${id})`} d={bold ? O_BOLD : O_FULL} />
    </svg>
  );
}
