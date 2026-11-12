import { useId } from "react";
import { LINE_BOLD, LINES_FULL, RING_BOLD, RING_FULL } from "./omarkPaths";

/**
 * The Opus mark: an "O" drawn like the Opus car, from tapering strokes, with speed lines cutting through
 * its lower third. "bold" is the heavier version that stays readable at small sizes (nav, favicon).
 * The gap around the lines uses --mark-knock, so it matches whatever the mark sits on.
 */
export function OMark({ bold = false, size = 32, className = "", title = "Opus" }: { bold?: boolean; size?: number; className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  const ring = `url(#r${id})`;
  return (
    <svg className={`omark ${className}`} viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={title}>
      <defs>
        <linearGradient id={`r${id}`} x1=".1" y1="0" x2=".9" y2="1">
          <stop offset="0" stopColor="#f6e8bf" /><stop offset=".5" stopColor="#d2b072" /><stop offset="1" stopColor="#c0703a" />
        </linearGradient>
        <linearGradient id={`a${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff7a45" /><stop offset="1" stopColor="#f6e8bf" />
        </linearGradient>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d2b072" /><stop offset="1" stopColor="#f6e8bf" />
        </linearGradient>
      </defs>
      <g transform="translate(2 0) skewX(-4)">
        {(bold ? RING_BOLD : RING_FULL).map((d) => <path key={d} fill={ring} d={d} />)}
      </g>
      <g className="omark-lines" strokeWidth={bold ? 2.4 : 1.8} paintOrder="stroke" strokeLinejoin="round">
        {bold
          ? <path fill={`url(#a${id})`} d={LINE_BOLD} />
          : LINES_FULL.map(([d, g]) => <path key={d} fill={`url(#${g}${id})`} d={d} />)}
      </g>
    </svg>
  );
}
