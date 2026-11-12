import { useEffect, useRef, useState } from "react";
import { CarMark } from "./CarMark";

/** Plays in full on every load: the mark draws itself, the name resolves, the curtain lifts. */
export function Boot({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const a = setTimeout(() => setLeaving(true), 2500);
    const b = setTimeout(() => done.current(), 3300);
    // A stray key press or tap can't cut it short; skipping only works once the name is on screen.
    let ready = false;
    const r = setTimeout(() => { ready = true; }, 2200);
    const skip = () => { if (!ready) return; setLeaving(true); setTimeout(() => done.current(), 650); };
    window.addEventListener("keydown", skip);
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(r); window.removeEventListener("keydown", skip); };
  }, []);
  const skip = () => undefined;
  return (
    <div className={leaving ? "boot-screen leave" : "boot-screen"} onClick={skip} aria-hidden="true">
      <svg viewBox="0 0 120 120" className="boot-mark">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E8CC8A" /><stop offset=".5" stopColor="#CFA349" /><stop offset="1" stopColor="#9C7A2E" /></linearGradient>
        </defs>
        <path className="m1" pathLength="1" d="M60 6 L114 60 L60 114 L6 60 Z" />
        <path className="m2" pathLength="1" d="M60 30 L90 60 L60 90 L30 60 Z" />
        <path className="m3" d="M60 30 L90 60 L60 90 L30 60 Z" />
      </svg>
      <div className="boot-word">{"OPUS".split("").map((c, i) => <span key={i} style={{ animationDelay: `${1.0 + i * 0.13}s` }}>{c}</span>)}</div>
      <CarMark className="boot-car" />
      <div className="boot-line" />
      <div className="boot-sub">Your assistant is ready</div>
    </div>
  );
}
