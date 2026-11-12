/**
 * The savings engine. Pure maths, no database, so it can be tested with fixed dates.
 *
 * For each goal it works out what you need to put aside THIS month from the target and the date, using the amount
 * still missing at the START of the month, so the number doesn't change when you tick the box. It then checks
 * whether you can afford it after fixed costs, planned spending and the goals due sooner.
 * What you really set aside each month is remembered, so a missed month moves into the months that are left.
 */

export interface GoalIn { id: number; name: string; target: number; saved: number; due: string | null }
export interface Contribution { goalId: number; month: string; planned: number; amount: number }

export type GoalStatus = "reached" | "done" | "partial" | "on_track" | "short" | "unknown";

export interface MonthEntry { month: string; planned: number; amount: number }
export interface GoalPlan {
  id: number;
  month: string;
  totalSaved: number;           // starting amount plus everything you've set aside
  remaining: number;            // still missing now
  remainingAtStart: number;     // missing at the start of this month
  pct: number;
  plan: number;                 // what to set aside this month
  monthsLeft: number | null;    // months left including this one, when there is a date
  hasDate: boolean;
  overdue: boolean;
  allocated: number;            // what you can afford of that
  status: GoalStatus;
  setAside: number | null;      // what you logged this month, if anything
  shortfall: number;
  finishBy: string | null;      // YYYY-MM at the pace you can really afford
  message: string;
  history: MonthEntry[];        // up to six months, newest first
  realisticMonthly: number | null;
  followThrough: number | null; // 0..1 across logged months
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const ceil2 = (n: number) => Math.ceil(n * 100 - 1e-7) / 100;
const dollars = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const idx = (key: string) => Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1);
const fromIdx = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

/**
 * @param free money left each month after fixed costs, planned spending and regular saving lines. null when no income is entered.
 */
export function planGoals(goals: GoalIn[], contribs: Contribution[], free: number | null, now: Date): { plans: GoalPlan[]; pool: number | null; committed: number } {
  const thisMonth = monthKey(now);
  const thisIdx = idx(thisMonth);
  const order = [...goals].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.id - b.id);
  let pool = free === null ? null : Math.max(0, free);
  let committed = 0;
  const out = new Map<number, GoalPlan>();

  for (const g of order) {
    const mine = contribs.filter((c) => c.goalId === g.id);
    const before = mine.filter((c) => idx(c.month) < thisIdx).reduce((n, c) => n + c.amount, 0);
    const now_ = mine.find((c) => c.month === thisMonth);
    const totalSaved = r2(g.saved + mine.reduce((n, c) => n + c.amount, 0));
    const remaining = Math.max(0, r2(g.target - totalSaved));
    const remainingAtStart = Math.max(0, r2(g.target - g.saved - before));
    const dueIdx = g.due ? idx(g.due.slice(0, 7)) : null;
    const overdue = dueIdx !== null && dueIdx < thisIdx && remainingAtStart > 0;
    const monthsLeft = dueIdx === null ? null : Math.max(1, dueIdx - thisIdx + 1);

    let plan: number;
    if (remainingAtStart <= 0) plan = 0;
    else if (monthsLeft !== null) plan = Math.min(remainingAtStart, ceil2(remainingAtStart / monthsLeft));
    else plan = Math.min(remainingAtStart, r2((pool ?? 0) * 0.5)); // no date: half of what is free

    const history = mine.sort((a, b) => b.month.localeCompare(a.month)).slice(0, 6).map((c) => ({ month: c.month, planned: c.planned, amount: c.amount }));
    const past = mine.filter((c) => idx(c.month) < thisIdx && c.planned > 0);
    const followThrough = past.length >= 2 ? r2(past.reduce((n, c) => n + c.amount, 0) / past.reduce((n, c) => n + c.planned, 0)) : null;
    const recent = past.sort((a, b) => b.month.localeCompare(a.month)).slice(0, 3);
    const realisticMonthly = recent.length >= 2 ? r2(recent.reduce((n, c) => n + c.amount, 0) / recent.length) : null;

    let allocated = 0;
    let status: GoalStatus;
    let message = "";
    let setAside: number | null = null;
    let shortfall = 0;
    let finishBy: string | null = null;

    const finishAt = (perMonth: number, from: number) => (perMonth > 0 && from > 0 ? fromIdx(thisIdx + Math.ceil(from / perMonth)) : null);

    if (remaining <= 0 && !now_) {
      status = "reached";
      message = "Goal reached.";
    } else if (now_) {
      setAside = now_.amount;
      allocated = now_.amount;
      committed += now_.amount;
      if (pool !== null) pool = Math.max(0, pool - now_.amount);
      const fullyDone = now_.amount + 0.004 >= now_.planned;
      status = remaining <= 0 ? "reached" : fullyDone ? "done" : "partial";
      shortfall = fullyDone ? 0 : r2(now_.planned - now_.amount);
      message = remaining <= 0
        ? "Goal reached."
        : fullyDone
          ? `Done for ${monthLabel(thisMonth)}: ${dollars(now_.amount)} set aside.`
          : `You set aside ${dollars(now_.amount)} of ${dollars(now_.planned)} this month. The ${dollars(shortfall)} you missed is spread over the months left, so the plan next month is a bit higher.`;
    } else if (pool === null) {
      status = "unknown";
      allocated = 0;
      committed += plan;
      message = `Put aside ${dollars(plan)} this month. Add your income on this page and Opus will tell you if you can afford it.`;
    } else {
      allocated = Math.min(plan, pool);
      committed += allocated;
      pool = r2(pool - allocated);
      if (allocated + 0.004 >= plan) {
        status = "on_track";
        message = `You can afford ${dollars(plan)} this month${g.due && !overdue ? ` and stay on track for ${monthLabel(g.due.slice(0, 7))}` : ""}.`;
      } else {
        status = "short";
        shortfall = r2(plan - allocated);
        finishBy = finishAt(allocated, remainingAtStart);
        message = allocated > 0
          ? `You need ${dollars(plan)} this month but only ${dollars(allocated)} is free after your bills and other goals. At that pace you'd finish around ${finishBy ? monthLabel(finishBy) : "a long way off"}${g.due ? `, not ${monthLabel(g.due.slice(0, 7))}` : ""}.`
          : `You need ${dollars(plan)} this month but nothing is free after your bills and other goals. Move the date, lower the target, or free up money.`;
      }
    }
    if (overdue && status !== "reached") message = `The date has passed and ${dollars(remainingAtStart)} is still missing. ${message}`;
    if (followThrough !== null && followThrough < 0.9 && realisticMonthly !== null && remaining > 0 && status !== "reached") {
      const real = finishAt(realisticMonthly, remaining);
      message += ` Lately you set aside about ${Math.round(followThrough * 100)}% of the plan (around ${dollars(realisticMonthly)} a month)${real ? `, which would finish around ${monthLabel(real)}` : ""}.`;
    }

    out.set(g.id, {
      id: g.id, month: thisMonth, totalSaved, remaining, remainingAtStart,
      pct: g.target > 0 ? Math.min(100, Math.round((totalSaved / g.target) * 100)) : 0,
      plan, monthsLeft, hasDate: g.due !== null, overdue, allocated, status, setAside, shortfall, finishBy, message, history, realisticMonthly, followThrough,
    });
  }
  return { plans: goals.map((g) => out.get(g.id)!), pool, committed: r2(committed) };
}
