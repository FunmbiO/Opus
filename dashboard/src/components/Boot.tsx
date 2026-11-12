import { useEffect, useRef, useState } from "react";
import { CarMark } from "./CarMark";
import { OMark } from "./OMark";

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
      <OMark size={128} className="boot-o" />
      <div className="boot-word">{"OPUS".split("").map((c, i) => <span key={i} style={{ animationDelay: `${1.0 + i * 0.13}s` }}>{c}</span>)}</div>
      <CarMark className="boot-car" />
      <div className="boot-line" />
      <div className="boot-sub">Your assistant is ready</div>
    </div>
  );
}
