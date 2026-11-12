import type { Sub } from "./types";

export interface Charge { id: string; name: string; amount: number; offset: number; date: Date; verdict: string; repeat: boolean }

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Every charge expected in the next `days` days. Weekly plans repeat. Only prices seen on receipts are used. */
export function upcoming(subs: Sub[], nowIso: string, days = 30): Charge[] {
  const today = startOfDay(new Date(nowIso));
  const out: Charge[] = [];
  for (const s of subs) {
    if (!s.nextCharge || s.amount == null || s.status === "lapsed") continue;
    const first = new Date(s.nextCharge + "T12:00:00");
    const step = s.cycle === "weekly" ? 7 : 0;
    let d = first;
    let n = 0;
    do {
      const offset = Math.round((startOfDay(d).getTime() - today.getTime()) / 86400000);
      if (offset >= 0 && offset <= days) out.push({ id: s.id, name: s.name, amount: s.amount, offset, date: new Date(d), verdict: s.verdict, repeat: n > 0 });
      d = new Date(d.getTime() + step * 86400000);
      n++;
    } while (step && n < 8 && Math.round((startOfDay(d).getTime() - today.getTime()) / 86400000) <= days);
  }
  return out.sort((a, b) => a.offset - b.offset);
}
