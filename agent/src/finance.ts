import { seedJson } from "./seedfile.js";
import { all, get, kvGet, kvSet, logActivity, nowIso, run } from "./db.js";
import { monthKey, planGoals } from "./plan.js";
import { buildPay, payIncomeFor, paySummary } from "./pay.js";

/**
 * Bills, budget lines and savings goals. Fixed costs come from your subscriptions and bills,
 * so there is one list of recurring money, not two.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const text = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const money = (v: unknown, max = 10_000_000) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error("Enter an amount of zero or more.");
  return round2(n);
};
const isoDate = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export class FinanceError extends Error {}
const bad = (m: string): never => { throw new FinanceError(m); };

// ---- The bills you gave Opus -------------------------------------------------

interface Bill { name: string; amount: number; charged: string; posted: string; note?: string; billing: string; id: string; keep?: boolean }
// Your own list comes from seed/bills.json (not committed); seed/bills.example.json shows the shape.
const BILLS: Bill[] = seedJson<Bill[]>("bills", []);

const STOP = new Set(["the", "sub", "com", "bill", "mobile", "plan", "premium", "plus", "and"]);
const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
export const shares = (a: string, b: string) => { const tb = tokens(b); return [...tokens(a)].some((w) => tb.has(w)); };

/** The next date on or after today that falls on the same day of the month as `from`. */
function nextMonthly(from: string, today: Date): string {
  const day = Number(from.slice(8, 10));
  for (let i = 0; i < 3; i++) {
    const y = today.getUTCFullYear() + Math.floor((today.getUTCMonth() + i) / 12);
    const m = (today.getUTCMonth() + i) % 12;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const d = new Date(Date.UTC(y, m, Math.min(day, last)));
    if (d.getTime() >= Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) return d.toISOString().slice(0, 10);
  }
  return from;
}

interface SubLite { id: string; name: string; amount: number | null }

/** Adds your bill list once. A bill Opus already has is skipped; a known service with no price gets its price filled in. */
export function seedBills(today = new Date()) {
  if (kvGet("bills-seed-v1")) return;
  const added: string[] = [];
  const skipped: string[] = [];
  const filled: string[] = [];
  for (const b of BILLS) {
    const existing = all<SubLite>("SELECT id, name, amount FROM subscriptions").filter((s) => s.id === b.id || shares(s.name, b.name));
    const same = existing.find((s) => s.amount !== null && Math.abs(s.amount - b.amount) < 0.01);
    if (same) { skipped.push(b.name); continue; } // Already tracked at the same price.
    const blank = existing.find((s) => s.amount === null);
    const next = nextMonthly(b.charged, today);
    if (blank) {
      run("UPDATE subscriptions SET amount = ?, cycle = 'monthly', monthly_equivalent = ?, next_charge = ?, last_seen = ?, updated_at = ? WHERE id = ?", b.amount, b.amount, next, b.posted, nowIso(), blank.id);
      run("INSERT OR IGNORE INTO charges (name, amount, charged, posted, subscription_id, note, created_at) VALUES (?, ?, ?, ?, ?, 'From your bill list', ?)", b.name, b.amount, b.charged, b.posted, blank.id, nowIso());
      filled.push(b.name);
      continue;
    }
    const apple = b.billing === "apple";
    run(
      `INSERT INTO subscriptions (id, name, plan, billing, amount, cycle, monthly_equivalent, next_charge, last_seen, status, verdict, reason, source, updated_at)
       VALUES (?, ?, ?, ?, ?, 'monthly', ?, ?, ?, 'active', ?, ?, 'import', ?) ON CONFLICT(id) DO NOTHING`,
      b.id, b.name, apple ? "Apple subscription" : "Monthly bill", b.billing, b.amount, b.amount, next, b.posted, b.keep ? "keep" : "unclear",
      apple
        ? "Apple does not say which app this is. On your iPhone: Settings, your name, Subscriptions. Billed monthly is assumed from one statement."
        : "From your bill list. Billed monthly is assumed from one statement.",
      nowIso(),
    );
    run("INSERT OR IGNORE INTO charges (name, amount, charged, posted, subscription_id, note, created_at) VALUES (?, ?, ?, ?, ?, 'From your bill list', ?)", b.name, b.amount, b.charged, b.posted, b.id, nowIso());
    added.push(b.name);
  }
  kvSet("bills-seed-v1", "1");
  logActivity({
    kind: "system", job: "finance",
    summary: `Loaded your bill list: ${added.length} added${filled.length ? `, price filled in for ${filled.join(", ")}` : ""}${skipped.length ? `, ${skipped.length} skipped as duplicates (${skipped.join(", ")})` : ""}`,
  });
}

// ---- Reading ------------------------------------------------------------------

interface LineRow { id: number; kind: "income" | "expense" | "saving"; name: string; amount: number }
interface GoalRow { id: number; name: string; target: number; saved: number; monthly: number; due: string | null }
interface ChargeRow { id: number; name: string; amount: number; charged: string | null; posted: string | null; subscription_id: string | null; note: string }

interface SubDue { id: string; name: string; amount: number | null; next_charge: string | null }
interface ContribRow { goal_id: number; month: string; planned: number; amount: number }

const localYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function buildFinance(now = new Date()) {
  const subs = all<{ id: string; name: string; monthly_equivalent: number | null; status: string; source: string }>(
    "SELECT id, name, monthly_equivalent, status, source FROM subscriptions WHERE status != 'lapsed' ORDER BY monthly_equivalent DESC",
  );
  const fixedItems = subs.filter((s) => s.monthly_equivalent !== null).map((s) => ({ id: s.id, name: s.name, monthly: s.monthly_equivalent!, removable: s.source === "import" }));
  const unpriced = subs.length - fixedItems.length;
  const fixed = round2(fixedItems.reduce((n, x) => n + x.monthly, 0));

  const lines = all<LineRow>("SELECT id, kind, name, amount FROM budget_lines ORDER BY kind, id");
  const sum = (k: string) => round2(lines.filter((l) => l.kind === k).reduce((n, l) => n + l.amount, 0));
  // Income: your real paydays when Opus knows your pay, plus any income line that is not the paycheque itself.
  const PAYLINE = /pay|salary|wage|job|employ|work|income|take.?home/i;
  const lineIncome = sum("income");
  const pay = payIncomeFor(monthKey(now));
  const otherIncome = round2(lines.filter((l) => l.kind === "income" && !PAYLINE.test(l.name)).reduce((n, l) => n + l.amount, 0));
  const income = pay ? round2(pay.total + otherIncome) : lineIncome;
  const planned = sum("expense");
  const regularSaving = sum("saving");

  // Goals: Opus works out what to set aside each month and whether you can afford it.
  const goalRows = all<GoalRow>("SELECT id, name, target, saved, monthly, due FROM goals ORDER BY id");
  const contribs = all<ContribRow>("SELECT goal_id, month, planned, amount FROM goal_contributions");
  const free = income > 0 ? round2(income - fixed - planned - regularSaving) : null;
  const { plans, committed } = planGoals(
    goalRows.map((g) => ({ id: g.id, name: g.name, target: g.target, saved: g.saved, due: g.due })),
    contribs.map((c) => ({ goalId: c.goal_id, month: c.month, planned: c.planned, amount: c.amount })),
    free, now,
  );
  const goals = goalRows.map((g, i) => ({ name: g.name, target: g.target, saved: g.saved, due: g.due, ...plans[i]! }));
  const saving = round2(regularSaving + committed);
  const left = round2(income - fixed - planned - saving);
  const open = goals.filter((g) => g.status !== "reached");
  const goalsVerdict: "none" | "unknown" | "ok" | "short" = open.length === 0 ? "none" : open.some((g) => g.status === "short") ? "short" : open.some((g) => g.status === "unknown") ? "unknown" : "ok";

  const today = localYmd(now);
  const horizon = localYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));
  const upcoming = all<SubDue>("SELECT id, name, amount, next_charge FROM subscriptions WHERE status != 'lapsed' AND amount IS NOT NULL AND next_charge IS NOT NULL ORDER BY next_charge")
    .filter((s) => s.next_charge! >= today && s.next_charge! <= horizon)
    .map((s) => ({ id: s.id, name: s.name, amount: s.amount!, date: s.next_charge!, days: Math.round((Date.parse(`${s.next_charge}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000) }));
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;

  const charges = all<ChargeRow>("SELECT * FROM charges ORDER BY COALESCE(posted, charged) DESC, id DESC LIMIT 60").map((c) => ({
    id: c.id, name: c.name, amount: c.amount, charged: c.charged, posted: c.posted, subscriptionId: c.subscription_id, note: c.note,
  }));

  return {
    income, fixed, planned, saving, left,
    incomeFrom: pay ? { paydays: pay.count, each: pay.each, other: otherIncome, dates: pay.dates } : null,
    savingsRate: income > 0 ? Math.round((saving / income) * 100) : null,
    perDay: left > 0 ? round2(left / daysLeft) : 0, daysLeft,
    fixedItems, unpricedCount: unpriced,
    lines, goals, goalsVerdict, charges,
    upcoming, upcomingTotal: round2(upcoming.reduce((n, u) => n + u.amount, 0)),
    month: monthKey(now),
    hasIncome: income > 0,
  };
}

/** Log what you really put aside for a goal this month. No amount means the full plan (the check mark). */
export function setAside(goalId: number, amount: unknown, now = new Date()) {
  const g = buildFinance(now).goals.find((x) => x.id === goalId) ?? bad("That goal is gone.");
  if (g.status === "reached" && g.setAside === null) bad("That goal is already reached.");
  const planned = g.plan;
  const wanted = amount === undefined || amount === null || amount === "" ? planned : money(amount);
  const amt = Math.min(wanted, g.remainingAtStart); // never past the target
  const month = monthKey(now);
  run(
    `INSERT INTO goal_contributions (goal_id, month, planned, amount, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(goal_id, month) DO UPDATE SET amount = excluded.amount`,
    goalId, month, planned, round2(amt), nowIso(),
  );
  logActivity({ kind: "system", job: "finance", summary: `You set aside $${round2(amt).toFixed(2)} for "${g.name}" for ${month}${amt + 0.004 < planned ? ` (plan was $${planned.toFixed(2)})` : ""}` });
}
export function undoSetAside(goalId: number, now = new Date()) {
  run("DELETE FROM goal_contributions WHERE goal_id = ? AND month = ?", goalId, monthKey(now));
}

/** Plain text for the model: numbers only, no personal notes. */
export function financeSummary(): string {
  const f = buildFinance();
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  return [
    `Monthly picture (CAD, assumed), for ${f.month}:`,
    `Income: ${f.hasIncome ? fmt(f.income) : "not entered yet"}${f.incomeFrom ? ` (${f.incomeFrom.paydays} paydays of ${fmt(f.incomeFrom.each)}${f.incomeFrom.other ? ` plus ${fmt(f.incomeFrom.other)} other` : ""})` : ""}`,
    `Fixed costs from subscriptions and bills: ${fmt(f.fixed)}${f.unpricedCount ? ` (${f.unpricedCount} more have no price)` : ""}`,
    `Planned spending: ${fmt(f.planned)}`,
    `Saving this month (regular lines plus goal plans): ${fmt(f.saving)}`,
    `Free to spend after all of that: ${f.hasIncome ? `${fmt(f.left)} (about ${fmt(f.perDay)} a day for ${f.daysLeft} more days)` : "n/a"}`,
    ``,
    `Fixed costs:\n${f.fixedItems.map((x) => `- ${x.name}: ${fmt(x.monthly)}/month`).join("\n") || "- none"}`,
    `Budget lines:\n${f.lines.map((l) => `- ${l.kind}: ${l.name} ${fmt(l.amount)}/month`).join("\n") || "- none"}`,
    `Savings goals (Opus calculates the monthly amount from target and date):\n${f.goals.map((g) => `- ${g.name}: ${fmt(g.totalSaved)} of ${fmt(g.target)}${g.due ? `, due ${g.due}` : ", no date"}; this month ${fmt(g.plan)} needed; status ${g.status}. ${g.message}`).join("\n") || "- none"}`,
    paySummary(),
    `Charges due in the next 30 days:\n${f.upcoming.map((u) => `- ${u.date} ${u.name} ${fmt(u.amount)}`).join("\n") || "- none"}`,
    `Recent charges:\n${f.charges.slice(0, 20).map((c) => `- ${c.posted ?? c.charged ?? "?"} ${c.name} ${fmt(c.amount)}`).join("\n") || "- none"}`,
  ].join("\n");
}

/** "Could I save $X by this date?" without saving anything. */
export function financeWhatIf(target: number, due: string | null, saved = 0, now = new Date()): string {
  const f = buildFinance(now);
  const free = f.hasIncome ? round2(f.income - f.fixed - f.planned - f.lines.filter((l) => l.kind === "saving").reduce((n, l) => n + l.amount, 0)) : null;
  const goalRows = all<GoalRow>("SELECT id, name, target, saved, monthly, due FROM goals ORDER BY id").map((g) => ({ id: g.id, name: g.name, target: g.target, saved: g.saved, due: g.due }));
  const contribs = all<ContribRow>("SELECT goal_id, month, planned, amount FROM goal_contributions").map((c) => ({ goalId: c.goal_id, month: c.month, planned: c.planned, amount: c.amount }));
  const { plans } = planGoals([...goalRows, { id: -1, name: "What-if", target, saved, due }], contribs, free, now);
  const p = plans[plans.length - 1]!;
  return `What-if goal of $${target.toFixed(2)}${due ? ` by ${due}` : ""} (already saved $${saved.toFixed(2)}): needs $${p.plan.toFixed(2)} this month. Status: ${p.status}. ${p.message}`;
}

// ---- Alerts ---------------------------------------------------------------------

/** Keeps the Today alerts in step with your budget. Alerts you dismissed stay dismissed until the situation changes. */
export function syncBudgetAlerts(now = new Date()) {
  const f = buildFinance(now);
  const want = new Map<string, { sev: string; title: string; detail: string }>();
  for (const g of f.goals) {
    if (g.status === "short") want.set(`budget-goal-${g.id}-${f.month}`, { sev: "medium", title: `You can't fully fund "${g.name}" this month`, detail: g.message });
  }
  if (f.hasIncome && f.left < 0) want.set(`budget-over-${f.month}`, { sev: "high", title: "Your plan spends more than you earn", detail: `Subscriptions, bills, planned spending and saving come to $${(-f.left).toFixed(2)} more than your income. Open Budget to adjust.` });
  for (const u of f.upcoming.filter((x) => x.days <= 3)) {
    want.set(`budget-due-${u.id}-${u.date}`, { sev: "medium", title: `${u.name} is charged ${u.days === 0 ? "today" : u.days === 1 ? "tomorrow" : `in ${u.days} days`}`, detail: `About $${u.amount.toFixed(2)} on ${u.date}.` });
  }
  const p = buildPay(now, { perDay: 0, remaining: 0, used: 0, free: 0, hasBudget: false, upcoming: [], hasBank: all<{ n: number }>("SELECT COUNT(*) AS n FROM bank_accounts")[0]!.n > 0 });
  if (p.configured) {
    if (p.late) want.set(`budget-paylate-${p.late}`, { sev: "medium", title: "Your pay has not shown up yet", detail: `Payday was ${p.late} and no deposit has landed in your linked accounts. Banks can take a day or two. If it is late, check with your employer.` });
    if (p.extraMonth && p.extraMonth.month === f.month) want.set(`budget-extrapay-${p.extraMonth.month}`, { sev: "low", title: "Extra paycheque this month", detail: `You have ${p.extraMonth.count} paydays in ${p.extraMonth.month}. The third one is spare: it is a good one to put toward a goal instead of spending.` });
  }
  const have = all<{ id: string }>("SELECT id FROM alerts WHERE id LIKE 'budget-%'");
  for (const h of have) if (!want.has(h.id)) run("DELETE FROM alerts WHERE id = ?", h.id);
  for (const [id, a] of want) {
    run(
      `INSERT INTO alerts (id, severity, title, detail) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET severity = excluded.severity, title = excluded.title, detail = excluded.detail`,
      id, a.sev, a.title, a.detail,
    );
  }
}

// ---- Your edits (dashboard only) ---------------------------------------------------

export function addLine(b: Record<string, unknown>) {
  const kind = b.kind;
  if (kind !== "income" && kind !== "expense" && kind !== "saving") bad("Pick income, spending or saving.");
  const name = text(b.name) || bad("Give it a name.");
  run("INSERT INTO budget_lines (kind, name, amount, created_at) VALUES (?, ?, ?, ?)", kind as string, name, money(b.amount), nowIso());
}
export function updateLine(id: number, b: Record<string, unknown>) {
  const cur = get<LineRow>("SELECT * FROM budget_lines WHERE id = ?", id) ?? bad("That line is gone.");
  run("UPDATE budget_lines SET name = ?, amount = ? WHERE id = ?", text(b.name) || cur.name, b.amount === undefined ? cur.amount : money(b.amount), id);
}
export const removeLine = (id: number) => { run("DELETE FROM budget_lines WHERE id = ?", id); };

export function addGoal(b: Record<string, unknown>) {
  const name = text(b.name) || bad("Give the goal a name.");
  const target = money(b.target);
  if (target <= 0) bad("Enter how much you want to save.");
  run("INSERT INTO goals (name, target, saved, monthly, due, created_at) VALUES (?, ?, ?, 0, ?, ?)", name, target, money(b.saved ?? 0), isoDate(b.due), nowIso());
}
export function updateGoal(id: number, b: Record<string, unknown>) {
  const cur = get<GoalRow>("SELECT * FROM goals WHERE id = ?", id) ?? bad("That goal is gone.");
  const target = b.target === undefined ? cur.target : money(b.target);
  if (target <= 0) bad("Enter how much you want to save.");
  run(
    "UPDATE goals SET name = ?, target = ?, saved = ?, due = ? WHERE id = ?",
    text(b.name) || cur.name, target, b.saved === undefined ? cur.saved : money(b.saved), b.due === undefined ? cur.due : isoDate(b.due), id,
  );
}
export const removeGoal = (id: number) => { run("DELETE FROM goal_contributions WHERE goal_id = ?", id); run("DELETE FROM goals WHERE id = ?", id); };

/** A bill you add by hand. It becomes a subscription too, so there is one list of recurring costs. */
export function addBill(b: Record<string, unknown>) {
  const name = text(b.name) || bad("Give the bill a name.");
  const amount = money(b.amount);
  const cycle = b.cycle === "weekly" || b.cycle === "yearly" ? b.cycle : "monthly";
  const factor = cycle === "weekly" ? 52 / 12 : cycle === "yearly" ? 1 / 12 : 1;
  const dayDate = isoDate(b.nextCharge);
  const id = `bill-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}-${Date.now().toString(36)}`;
  run(
    `INSERT INTO subscriptions (id, name, plan, billing, amount, cycle, monthly_equivalent, next_charge, last_seen, status, verdict, reason, source, updated_at)
     VALUES (?, ?, 'Bill you added', 'unknown', ?, ?, ?, ?, NULL, 'active', 'keep', 'Added by you.', 'import', ?)`,
    id, name, amount, cycle, round2(amount * factor), dayDate, nowIso(),
  );
  logActivity({ kind: "system", job: "finance", summary: `You added the bill "${name}"` });
}
/** Only bills you or the import added can be removed here. Subscriptions found in your email stay. */
export function removeBill(id: string) {
  const s = get<{ name: string; source: string }>("SELECT name, source FROM subscriptions WHERE id = ?", id) ?? bad("That bill is gone.");
  if (s.source !== "import") bad("Only bills you added can be removed here.");
  run("DELETE FROM charges WHERE subscription_id = ?", id);
  run("DELETE FROM approvals WHERE subscription_id = ?", id);
  run("DELETE FROM subscriptions WHERE id = ?", id);
  logActivity({ kind: "system", job: "finance", summary: `You removed the bill "${s.name}"` });
}
