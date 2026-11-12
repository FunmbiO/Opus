import { existsSync } from "node:fs";
import { seedJson, seedPath } from "./seedfile.js";
import { all, kvGet, kvSet, logActivity, run } from "./db.js";

/**
 * Opus's internal clock for your pay. You get paid every 14 days (every other Thursday), so most months have two
 * paydays and two months a year have three. This file knows the calendar; the rest of Opus asks it.
 * Dates are plain YYYY-MM-DD strings and all the maths is done in UTC so daylight saving can never shift a day.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
export class PayError extends Error {}
const bad = (m: string): never => { throw new PayError(m); };

export interface PayConfig { anchor: string; everyDays: 7 | 14; amount: number | null; source: "you" | "detected" }

const DAY = 86_400_000;
const ymdMs = (s: string) => Date.parse(`${s}T00:00:00Z`);
const msYmd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => msYmd(ymdMs(s) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((ymdMs(b) - ymdMs(a)) / DAY);
const localYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const isoDate = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(ymdMs(v)) ? v : null);

// ---- Config -----------------------------------------------------------------------

export function getPayConfig(): PayConfig | null {
  const raw = kvGet("pay");
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<PayConfig>;
    if (!isoDate(c.anchor) || (c.everyDays !== 7 && c.everyDays !== 14)) return null;
    return { anchor: c.anchor!, everyDays: c.everyDays, amount: typeof c.amount === "number" && c.amount > 0 ? c.amount : null, source: c.source === "you" ? "you" : "detected" };
  } catch { return null; }
}
const save = (c: PayConfig) => kvSet("pay", JSON.stringify(c));

/** Every payday from `from` to `to`, both included. */
export function paydaysBetween(c: Pick<PayConfig, "anchor" | "everyDays">, from: string, to: string): string[] {
  const out: string[] = [];
  const first = Math.ceil(daysBetween(c.anchor, from) / c.everyDays);
  for (let k = first; ; k++) {
    const d = addDays(c.anchor, k * c.everyDays);
    if (d > to) break;
    out.push(d);
    if (out.length > 400) break;
  }
  return out;
}
const monthEnd = (month: string) => { const [y, m] = month.split("-").map(Number); return msYmd(Date.UTC(y!, m!, 0)); };
export const monthPaydays = (c: Pick<PayConfig, "anchor" | "everyDays">, month: string) => paydaysBetween(c, `${month}-01`, monthEnd(month));
const nextMonthKey = (month: string, n = 1) => { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y!, m! - 1 + n, 1)); return d.toISOString().slice(0, 7); };

// ---- What the bank says --------------------------------------------------------------

interface Dep { date: string; amount: number }
/** Money coming in that was sorted as Income, newest first. Looks at every linked account, tracked or not. */
function deposits(sinceDays = 150, now = new Date()): Dep[] {
  const since = addDays(localYmd(now), -sinceDays);
  return all<{ date: string; amount: number }>("SELECT date, -amount AS amount FROM transactions WHERE category = 'Income' AND amount < 0 AND pending = 0 AND date >= ? ORDER BY date DESC", since)
    .map((d) => ({ date: d.date, amount: round2(d.amount) }));
}

/** Finds the rhythm in your pay deposits: the same amount, 7 or 14 days apart. Needs two. */
export function detectPay(now = new Date()): PayConfig | null {
  const deps = deposits(150, now);
  if (deps.length < 2) return null;
  const latest = deps[0]!;
  const similar = deps.filter((d) => Math.abs(d.amount - latest.amount) <= Math.max(25, latest.amount * 0.2));
  if (similar.length < 2) return null;
  const gaps = similar.slice(0, -1).map((d, i) => daysBetween(similar[i + 1]!.date, d.date)).filter((g) => g > 0);
  const near = (g: number, t: number) => Math.abs(g - t) <= 1;
  const every = gaps.length && gaps.filter((g) => near(g, 14)).length >= Math.ceil(gaps.length / 2) ? 14 : gaps.length && gaps.filter((g) => near(g, 7)).length >= Math.ceil(gaps.length / 2) ? 7 : null;
  if (!every) return null;
  return { anchor: latest.date, everyDays: every, amount: latest.amount, source: "detected" };
}

/** A deposit near a payday counts as that payday's pay (banks shift it by a day for weekends and holidays). */
function depositFor(payday: string, amount: number | null, deps: Dep[]): Dep | undefined {
  return deps.find((d) => d.date >= addDays(payday, -2) && d.date <= addDays(payday, 3) && (amount === null || d.amount >= amount * 0.5));
}

/** Called after every bank sync. Learns the pay rhythm if you have not set one, and keeps the amount current. */
export function learnPay(now = new Date()) {
  const cur = getPayConfig();
  const found = detectPay(now);
  if (!cur) {
    if (!found) return;
    save(found);
    logActivity({ kind: "system", job: "pay", summary: `Learned your pay: $${found.amount!.toFixed(2)} every ${found.everyDays} days, last on ${found.anchor}` });
    return;
  }
  // The amount follows your latest paycheque unless you typed a fixed one.
  if (cur.source === "detected" && found && found.amount !== cur.amount) save({ ...cur, amount: found.amount });
}

/** One-time: a pay schedule from seed/pay.json, if you made one. Only when nothing is set yet. */
export function seedPay() {
  if (kvGet("pay-seed-v1")) return;
  kvSet("pay-seed-v1", "1");
  if (getPayConfig()) return;
  const s = seedJson<Partial<PayConfig> | null>("pay", null);
  if (!s || !isoDate(s.anchor) || (s.everyDays !== 7 && s.everyDays !== 14)) return; // the example file's date is a placeholder; Opus learns from deposits instead
  if (!seedPayIsMine()) return;
  save({ anchor: s.anchor!, everyDays: s.everyDays, amount: typeof s.amount === "number" && s.amount > 0 ? s.amount : null, source: "you" });
  logActivity({ kind: "system", job: "pay", summary: `Pay schedule loaded from seed/pay.json: every ${s.everyDays} days from ${s.anchor}` });
}
const seedPayIsMine = () => existsSync(seedPath("pay.json"));

// ---- Your edits ------------------------------------------------------------------------

export function setPay(b: Record<string, unknown>) {
  const cur = getPayConfig();
  const anchor = b.anchor === undefined ? cur?.anchor ?? null : isoDate(b.anchor);
  if (!anchor) bad("Pick a payday date.");
  const every = b.everyDays === undefined ? cur?.everyDays ?? 14 : Number(b.everyDays);
  if (every !== 7 && every !== 14) bad("Opus handles weekly or every-two-weeks pay.");
  let amount: number | null = cur?.amount ?? null;
  if (b.amount !== undefined) {
    if (b.amount === null || b.amount === "") amount = null;
    else {
      const n = Number(b.amount);
      if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) bad("Enter what one paycheque is, or leave it empty to follow your deposits.");
      amount = round2(n);
    }
  }
  save({ anchor: anchor!, everyDays: every as 7 | 14, amount, source: amount !== null ? "you" : "detected" });
  logActivity({ kind: "system", job: "pay", summary: `You set your pay: every ${every} days from ${anchor}${amount !== null ? `, $${amount.toFixed(2)}` : ", amount follows your deposits"}` });
}
export function clearPay() { run("DELETE FROM kv WHERE key = ?", "pay"); kvSet("pay-seed-v1", "1"); logActivity({ kind: "system", job: "pay", summary: "You cleared your pay schedule" }); }

// ---- What the rest of Opus reads --------------------------------------------------------

/** Pay used to work out income for a month. Null until the schedule and an amount are both known. */
export function payIncomeFor(month: string): { total: number; count: number; each: number; dates: string[] } | null {
  const c = getPayConfig();
  if (!c) return null;
  const each = payAmount(c);
  if (each === null) return null;
  const dates = monthPaydays(c, month);
  return { total: round2(each * dates.length), count: dates.length, each, dates };
}
export function payAmount(c = getPayConfig()): number | null {
  if (!c) return null;
  if (c.amount !== null) return c.amount;
  return deposits(150)[0]?.amount ?? null;
}

export interface PayContext {
  perDay: number; remaining: number; used: number; free: number; hasBudget: boolean;
  upcoming: { name: string; amount: number; date: string }[];
  hasBank: boolean;
}

export function buildPay(now: Date, ctx?: PayContext) {
  const c = getPayConfig();
  if (!c) return { configured: false as const, detected: detectPay(now) };
  const today = localYmd(now);
  const month = today.slice(0, 7);
  const each = payAmount(c);
  const deps = deposits(150, now);

  const next = paydaysBetween(c, today, addDays(today, c.everyDays))[0]!;          // today counts as payday
  const last = paydaysBetween(c, addDays(today, -c.everyDays), addDays(today, -1)).pop() ?? addDays(next, -c.everyDays);
  const nextIsToday = next === today;
  const daysToNext = daysBetween(today, next);

  const dates = monthPaydays(c, month).map((date) => {
    const dep = date <= today ? depositFor(date, each, deps) : undefined;
    return { date, passed: date <= today, received: dep ? dep.amount : null };
  });
  const receivedTotal = round2(dates.reduce((n, d) => n + (d.received ?? 0), 0));
  const expectedTotal = each === null ? null : round2(each * dates.length);
  const toCome = dates.filter((d) => !d.passed);
  const lateDate = ctx?.hasBank && each !== null ? dates.filter((d) => d.passed && d.received === null && daysBetween(d.date, today) >= 2).pop()?.date ?? null : null;

  const outlook = Array.from({ length: 6 }, (_, i) => {
    const m = nextMonthKey(month, i);
    const ds = monthPaydays(c, m);
    return { month: m, paydays: ds, count: ds.length, total: each === null ? null : round2(each * ds.length), extra: ds.length >= 3 };
  });
  const extraMonth = outlook.find((o) => o.extra) ?? null;

  // Until payday: how much of the free money the month still has can be used before the next paycheque lands.
  let until: null | { days: number; billsBefore: { name: string; amount: number; date: string }[]; billsTotal: number; safe: number | null; perDay: number | null; tight: boolean } = null;
  if (ctx) {
    const days = Math.max(1, daysToNext);
    const bills = ctx.upcoming.filter((u) => u.date >= today && u.date < next);
    const safe = ctx.hasBudget ? round2(Math.max(0, Math.min(ctx.remaining, ctx.perDay * days))) : null;
    until = { days, billsBefore: bills, billsTotal: round2(bills.reduce((n, b) => n + b.amount, 0)), safe, perDay: safe === null ? null : round2(safe / days), tight: ctx.hasBudget && ctx.remaining <= 0 };
  }

  // Month end: on the pace you have kept so far, where does free money land?
  let monthEnd: null | { projectedLeft: number; onTrack: boolean; basis: "pace" } = null;
  if (ctx?.hasBudget) {
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const elapsed = now.getDate();
    if (elapsed >= 5) {
      const projectedUse = round2((ctx.used / elapsed) * dim);
      const projectedLeft = round2(ctx.free - projectedUse);
      monthEnd = { projectedLeft, onTrack: projectedLeft >= 0, basis: "pace" };
    }
  }

  return {
    configured: true as const,
    schedule: { anchor: c.anchor, everyDays: c.everyDays, source: c.source },
    amount: each, amountFixed: c.amount !== null,
    next: { date: next, days: daysToNext, today: nextIsToday }, last,
    month: { key: month, count: dates.length, dates, expected: expectedTotal, received: receivedTotal, extra: dates.length >= 3, stillToCome: toCome.length },
    late: lateDate,
    outlook, extraMonth: extraMonth ? { month: extraMonth.month, count: extraMonth.count, amount: each } : null,
    until, monthEnd,
  };
}
export type PayState = ReturnType<typeof buildPay>;

/** Plain text for Opus in chat. */
export function paySummary(now = new Date()): string {
  const p = buildPay(now);
  if (!p.configured) return "No pay schedule is set yet.";
  const fmt = (n: number | null) => (n === null ? "unknown yet" : `$${n.toFixed(2)}`);
  return [
    `Pay: ${fmt(p.amount)} every ${p.schedule.everyDays} days. Last payday ${p.last}, next ${p.next.date} (${p.next.today ? "today" : `in ${p.next.days} days`}).`,
    `This month (${p.month.key}): ${p.month.count} paydays (${p.month.dates.map((d) => d.date).join(", ")}), expected ${fmt(p.month.expected)}, received so far ${fmt(p.month.received)}.`,
    `Coming months: ${p.outlook.map((o) => `${o.month} ${o.count} paydays${o.extra ? " (extra paycheque)" : ""}`).join("; ")}.`,
  ].join("\n");
}
