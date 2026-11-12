import type { ReactElement } from "react";

const P: Record<string, ReactElement> = {
  today: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></>,
  subs: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18M7 15h3" /></>,
  approve: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
  activity: <><path d="M3 12h4l3-7 4 14 3-7h4" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 8 8 6 8-6" /></>,
  draft: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
  alert: <><path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4M12 17v.01" /></>,
  shield: <><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" /></>,
  ask: <><path d="M4 5h16v11H9l-5 4V5Z" /></>,
  send: <><path d="M4 12 20 4l-5 16-3-7-8-1Z" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></>,
  moon: <><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></>,
  clients: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .6 3.2 2.3 3.5 5.2" /></>,
  file: <><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2" /></>,
  wallet: <><path d="M3 8a2 2 0 0 1 2-2h12v3" /><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M16 14h2" /></>,
  x: <><path d="M6 6l12 12M18 6 6 18" /></>,
};

export function Icon({ name, size = 20 }: { name: keyof typeof P | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}
