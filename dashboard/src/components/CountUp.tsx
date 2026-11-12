import { useEffect, useRef, useState } from "react";

/** Counts up once on first render. Skipped when the person prefers reduced motion. */
export function CountUp({ value, decimals = 0, prefix = "", ms = 900 }: { value: number; decimals?: number; prefix?: string; ms?: number }) {
  const [v, setV] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!first.current || reduce) { setV(value); return; }
    first.current = false;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(value * (1 - Math.pow(1 - p, 4)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{prefix}{v.toLocaleString("en-CA", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>;
}
