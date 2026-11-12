import { useId } from "react";

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
        {bold ? (
          <>
            <path fill={ring} d="M56 7C28 7 10 26 10 50C10 74 28 93 46 93C32 87 28 70 28 50C28 31 37 15 56 7Z" />
            <path fill={ring} d="M61 8C80 12 91 30 91 50C91 71 75 90 50 93C70 84 76 68 76 50C76 33 71 19 61 8Z" />
          </>
        ) : (
          <>
            <path fill={ring} d="M56 8C29 8 12 26 12 50C12 74 29 92 46 92C33 86 25 70 25 50C25 31 36 16 56 8Z" />
            <path fill={ring} d="M61 9C79 13 89 30 89 50C89 71 74 89 50 92C71 83 80 68 80 50C80 33 73 19 61 9Z" />
          </>
        )}
      </g>
      <g className="omark-lines" strokeWidth={bold ? 2.4 : 1.8} paintOrder="stroke" strokeLinejoin="round">
        {bold ? (
          <path fill={`url(#a${id})`} d="M0 54L74 58.5L0 62.5Z" />
        ) : (
          <>
            <path fill={`url(#a${id})`} d="M0 55.6L70 58L0 59.4Z" />
            <path fill={`url(#b${id})`} d="M6 64.2L62 66.2L6 65.9Z" />
            <path fill={`url(#b${id})`} d="M16 71.4L52 72.6L16 72.9Z" />
          </>
        )}
      </g>
    </svg>
  );
}
