import { useId } from "react";
import { CAR_BOLD, CAR_FULL, CLIP_X, GRAD, HALO, RING_BOLD, RING_FULL, STOPS } from "./omarkPaths";

const stops = (k: keyof typeof STOPS) => STOPS[k].map(([o, c]) => <stop key={o} offset={o} stopColor={c} />);

/**
 * The Opus mark: a fine open ring with the Opus car driving through the gap. The car passes in front of the ring's
 * thin side and behind its thick left stroke. "bold" is the heavier version that stays readable at small sizes
 * (nav, favicon). The shapes come from scripts/make-logo.mjs. The car's dark edge uses --mark-knock, so it matches
 * whatever the mark sits on.
 */
export function OMark({ bold = false, size = 32, className = "", title = "Opus" }: { bold?: boolean; size?: number; className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  const o = `#o${id}`, v = `#v${id}`;
  return (
    <svg className={`omark ${className}`} viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={title}>
      <defs>
        <linearGradient id={`r${id}`} gradientUnits="userSpaceOnUse" x1={GRAD.ring.x1} y1={GRAD.ring.y1} x2={GRAD.ring.x2} y2={GRAD.ring.y2}>{stops("ring")}</linearGradient>
        <linearGradient id={`c${id}`} gradientUnits="userSpaceOnUse" x1={GRAD.car.x1} y1={GRAD.car.y1} x2={GRAD.car.x2} y2={GRAD.car.y2}>{stops("car")}</linearGradient>
        <clipPath id={`l${id}`}><rect x="0" y="0" width={CLIP_X} height="100" /></clipPath>
        <path id={`o${id}`} d={bold ? RING_BOLD : RING_FULL} />
        <path id={`v${id}`} d={bold ? CAR_BOLD : CAR_FULL} />
      </defs>
      <use href={o} fill={`url(#r${id})`} />
      <g className="omark-car">
        <use href={v} className="omark-halo" strokeWidth={bold ? HALO.bold : HALO.full} strokeLinejoin="round" />
        <use href={v} fill={`url(#c${id})`} />
      </g>
      <use href={o} fill={`url(#r${id})`} clipPath={`url(#l${id})`} />
    </svg>
  );
}
