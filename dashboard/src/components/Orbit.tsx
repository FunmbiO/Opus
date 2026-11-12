import { useEffect, useRef } from "react";
import type { Category } from "../types";
import { CAT } from "../format";

const RINGS: Category[] = ["jaded", "school", "bills", "personal", "junk"];

interface P { ri: number; a: number; s: number; size: number }
interface Dust { r: number; a: number; s: number; o: number }

/**
 * The signature: every email from the last 24 hours is a point on an orbit,
 * one ring per category. It speeds up and sends out pulses while Opus is working.
 */
export function Orbit({ counts, busy }: { counts: Record<Category, number>; busy: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const key = RINGS.map((c) => counts[c]).join(",");

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let w = 0, h = 0, dpr = 1, raf = 0, last = 0, visible = true, frame = 0, boost = 1, spin = 0;
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const colors: Record<string, string> = {};
    const readColors = () => {
      const cs = getComputedStyle(cv);
      for (const n of ["--hair", "--ink", "--ink-2", "--ink-3", "--gold", ...RINGS.map((c) => `--c-${c}`)]) colors[n] = cs.getPropertyValue(n).trim();
    };

    const parts: P[] = RINGS.flatMap((c, ri) =>
      Array.from({ length: counts[c] }, () => ({ ri, a: Math.random() * Math.PI * 2, s: 0.7 + Math.random() * 0.6, size: ri === 0 ? 7.5 : 5.6 })),
    );
    const dust: Dust[] = Array.from({ length: 90 }, () => ({ r: 0.12 + Math.random() * 0.86, a: Math.random() * Math.PI * 2, s: 0.02 + Math.random() * 0.05, o: 0.15 + Math.random() * 0.35 }));

    const resize = () => {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    };

    const diamond = (x: number, y: number, s: number) => {
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath();
    };

    const draw = (t: number, dt: number) => {
      if (frame++ % 40 === 0) readColors();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      mouse.x += (mouse.tx - mouse.x) * 0.06; mouse.y += (mouse.ty - mouse.y) * 0.06;
      boost += ((busyRef.current ? 4.5 : 1) - boost) * 0.05;
      spin += dt * 0.4 * boost;

      const cx = w / 2, cy = h / 2;
      const R = Math.min(w / 2 - 70, h / 2 / 0.66);
      const ys = 0.6 + mouse.y * 0.08;
      const rot = mouse.x * 0.18;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const pos = (r: number, a: number, depth: number) => {
        const lx = r * Math.cos(a), ly = r * ys * Math.sin(a);
        return [cx + lx * cos - ly * sin + mouse.x * depth, cy + lx * sin + ly * cos + mouse.y * depth * 0.6] as const;
      };
      const radius = (ri: number) => R * (0.2 + ri * 0.2);

      // dust
      for (const d of dust) {
        d.a += d.s * dt * boost;
        const [x, y] = pos(R * d.r, d.a, 4);
        ctx.globalAlpha = d.o; ctx.fillStyle = colors["--ink-3"] || "#888";
        ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
      }

      // rings + labels
      RINGS.forEach((c, ri) => {
        const r = radius(ri);
        ctx.globalAlpha = 0.55; ctx.strokeStyle = colors["--ink-3"] || "#666"; ctx.lineWidth = 1; ctx.setLineDash([1, 6]);
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) { const [x, y] = pos(r, (i / 120) * Math.PI * 2, 6 + ri * 3); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        const [lx, ly] = pos(r, -0.62 - ri * 0.12, 6 + ri * 3);
        ctx.fillStyle = colors["--ink-2"] || "#aaa"; ctx.font = "600 12px Inter, system-ui, sans-serif";
        ctx.fillText(`${CAT[c].label} ${counts[c]}`, lx + 10, ly + 4);
        ctx.fillStyle = colors[`--c-${c}`] || "#fff"; diamond(lx + 3, ly, 3); ctx.fill();
      });

      // pulses while working
      if (boost > 1.4) {
        for (let k = 0; k < 2; k++) {
          const p = ((t / 1000) * 0.7 + k * 0.5) % 1;
          ctx.globalAlpha = (1 - p) * 0.55 * Math.min(1, boost - 1); ctx.strokeStyle = colors["--gold"] || "#b4904e"; ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i <= 90; i++) { const [x, y] = pos(R * p * 0.95, (i / 90) * Math.PI * 2, 0); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          ctx.stroke();
        }
      }

      // emails: back half first so the front half overlaps it
      const order = parts.map((p) => ({ p, back: Math.sin(p.a) < 0 })).sort((u, v) => Number(v.back) - Number(u.back));
      for (const { p } of order) {
        const dir = p.ri % 2 ? -1 : 1;
        p.a += dir * p.s * dt * 0.34 * boost / (1 + p.ri * 0.32);
        const r = radius(p.ri);
        const front = (Math.sin(p.a) + 1) / 2;
        const col = colors[`--c-${RINGS[p.ri]}`] || "#fff";
        for (let k = 5; k >= 1; k--) {
          const [tx, ty] = pos(r, p.a - dir * k * 0.045 * Math.min(boost, 2.5), 6 + p.ri * 3);
          ctx.globalAlpha = (0.16 - k * 0.025) * (0.5 + front * 0.5); ctx.fillStyle = col; diamond(tx, ty, p.size * (1 - k * 0.12) * (0.7 + front * 0.4)); ctx.fill();
        }
        const [x, y] = pos(r, p.a, 6 + p.ri * 3);
        ctx.globalAlpha = 0.45 + front * 0.55; ctx.fillStyle = col;
        ctx.shadowColor = p.ri === 0 ? colors["--gold"] || "#b4904e" : "transparent"; ctx.shadowBlur = p.ri === 0 ? 12 : 0;
        diamond(x, y, p.size * (0.75 + front * 0.5)); ctx.fill();
        ctx.shadowBlur = 0;
      }

      // core
      const pulse = 1 + Math.sin(t / 380) * 0.08 * boost;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120 * pulse);
      g.addColorStop(0, "rgba(210,176,114,.7)"); g.addColorStop(1, "rgba(210,176,114,0)");
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 120 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(cx + mouse.x * 2, cy + mouse.y * 2); ctx.rotate(spin * 0.25);
      const cg = ctx.createLinearGradient(-16, -16, 16, 16);
      cg.addColorStop(0, "#f3e4b9"); cg.addColorStop(0.5, "#c9a45c"); cg.addColorStop(1, "#8a6a2f");
      ctx.fillStyle = cg; ctx.shadowColor = "rgba(210,176,114,.7)"; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.rect(-13 * pulse, -13 * pulse, 26 * pulse, 26 * pulse); ctx.fill(); ctx.restore();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    };

    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
      if (visible && !document.hidden) draw(t, dt);
      raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      mouse.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
      mouse.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
    };

    resize(); readColors();
    const ro = new ResizeObserver(() => { resize(); if (reduce) draw(0, 0); });
    ro.observe(cv);
    const io = new IntersectionObserver(([en]) => { visible = !!en?.isIntersecting; });
    io.observe(cv);
    if (reduce) draw(0, 0);
    else { window.addEventListener("pointermove", onMove); raf = requestAnimationFrame(loop); }
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); window.removeEventListener("pointermove", onMove); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const total = RINGS.reduce((n, c) => n + counts[c], 0);
  return <canvas ref={ref} className="orbit" role="img" aria-label={`${total} emails in the last day, shown as points orbiting by category`} />;
}
