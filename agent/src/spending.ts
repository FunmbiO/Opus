import { all } from "./db.js";
import { bankConfigured, bankEnv } from "./bank.js";
import { CATEGORY_LIST, FIXED_KINDS, NON_SPEND } from "./categorize.js";
import type { buildFinance } from "./finance.js";

/** What you spent, from the card transactions Opus has saved. Tied into the budget lines and the free-to-spend number. */

const round2 = (n: number) => Math.round(n * 100) / 100;
const localYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Which budget line a category belongs to, when you named the line in your own words. */
const LINE_WORDS: Record<string, RegExp> = {
  Groceries: /grocer|food|supermarket/i,
  Dining: /dining|restaurant|eating|takeout|take-out|coffee|food/i,
  Gas: /\bgas\b|fuel|petrol/i,
  Transport: /transport|transit|uber|commut|\bcar\b|parking/i,
  Shopping: /shopping|clothes|clothing|misc|personal/i,
  Health: /health|pharmacy|medical|gym|fitness/i,
  Entertainment: /entertain|\bfun\b|movie|game|leisure/i,
  Travel: /travel|trip|vacation|holiday/i,
  "Jaded Media": /jaded|business|gear|equipment/i,
};

interface TxRow {
  id: string; account_id: string; date: string; amount: number; merchant: string; raw_name: string; category: string;
  category_source: string; pending: number; name: string; mask: string;
}
interface LineLite { id: number; kind: string; name: string; amount: number }

const FROM = `FROM transactions t JOIN bank_accounts a ON a.id = t.account_id WHERE a.tracked = 1`;

export function buildMoney(now: Date, f: ReturnType<typeof buildFinance>) {
  const today = localYmd(now);
  const monthStart = `${today.slice(0, 7)}-01`;

  const accounts = all<{ id: string; item_id: string; name: string; mask: string; type: string; tracked: number; institution: string }>(
    "SELECT a.id, a.item_id, a.name, a.mask, a.type, a.tracked, i.institution FROM bank_accounts a JOIN bank_items i ON i.id = a.item_id ORDER BY a.type DESC, a.name",
  ).map((a) => ({ id: a.id, itemId: a.item_id, name: a.name, mask: a.mask, type: a.type, tracked: !!a.tracked, institution: a.institution }));
  const items = all<{ id: string; institution: string; last_sync: string | null; error: string | null; cursor: string | null }>("SELECT id, institution, last_sync, error, cursor FROM bank_items")
    .map((i) => ({ id: i.id, institution: i.institution, lastSync: i.last_sync, error: i.error, loading: !i.cursor && !i.error }));

  const month = all<TxRow>(`SELECT t.*, a.name, a.mask ${FROM} AND t.date >= ? ORDER BY t.date DESC`, monthStart).filter((t) => !NON_SPEND.has(t.category));
  const sum = (rows: TxRow[]) => round2(rows.reduce((n, t) => n + t.amount, 0));
  const todays = month.filter((t) => t.date === today);

  const byCat = new Map<string, number>();
  for (const t of month) byCat.set(t.category, round2((byCat.get(t.category) ?? 0) + t.amount));

  // Match categories to the planned-spending lines you wrote, so "Groceries $400" shows how much of it is gone.
  const expense = f.lines.filter((l: LineLite) => l.kind === "expense");
  const lineFor = (cat: string): LineLite | undefined => (LINE_WORDS[cat] ? expense.find((l) => LINE_WORDS[cat]!.test(l.name) || l.name.toLowerCase() === cat.toLowerCase()) : undefined) ?? expense.find((l) => l.name.toLowerCase() === cat.toLowerCase());
  const lineSpent = new Map<number, number>();
  const categories = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([category, amount]) => {
    const line = FIXED_KINDS.has(category) ? undefined : lineFor(category);
    if (line) lineSpent.set(line.id, round2((lineSpent.get(line.id) ?? 0) + amount));
    return { category, amount, lineId: line?.id ?? null, fixed: FIXED_KINDS.has(category) };
  });
  const lines = expense.filter((l) => lineSpent.has(l.id)).map((l) => ({ id: l.id, name: l.name, planned: l.amount, spent: lineSpent.get(l.id)! }));

  // Day-to-day money: what is left after bills, planned lines and saving. Card spending eats into it only where it
  // is not already planned for (a category with no budget line, or the part of a line that went over).
  let freeUsed = 0;
  for (const c of categories) {
    if (c.fixed || c.amount <= 0) continue;
    if (c.lineId === null) freeUsed += c.amount;
  }
  for (const l of lines) freeUsed += Math.max(0, l.spent - l.planned);
  freeUsed = round2(freeUsed);
  const pace = f.hasIncome
    ? { free: f.left, used: freeUsed, remaining: round2(f.left - freeUsed), perDay: f.left - freeUsed > 0 ? round2((f.left - freeUsed) / f.daysLeft) : 0 }
    : null;

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (13 - i));
    return localYmd(d);
  });
  const since = days[0]!;
  const perDay = new Map<string, number>();
  for (const t of all<TxRow>(`SELECT t.*, a.name, a.mask ${FROM} AND t.date >= ?`, since).filter((t) => !NON_SPEND.has(t.category))) perDay.set(t.date, round2((perDay.get(t.date) ?? 0) + t.amount));

  const recent = all<TxRow>(`SELECT t.*, a.name, a.mask ${FROM} ORDER BY t.date DESC, t.created_at DESC, t.id DESC LIMIT 150`).map((t) => ({
    id: t.id, date: t.date, merchant: t.merchant, rawName: t.raw_name, amount: t.amount, category: t.category, source: t.category_source as "you" | "rule" | "bank" | "ai" | "unsorted",
    pending: !!t.pending, account: `${t.name}${t.mask ? ` ••${t.mask}` : ""}`,
  }));

  return {
    configured: bankConfigured(),
    env: bankEnv(),
    accounts, items,
    today: { date: today, spent: sum(todays), count: todays.length },
    month: { key: today.slice(0, 7), spent: sum(month), count: month.length, fixedSpent: round2(month.filter((t) => FIXED_KINDS.has(t.category)).reduce((n, t) => n + t.amount, 0)) },
    categories, lines, pace,
    days: days.map((date) => ({ date, amount: perDay.get(date) ?? 0 })),
    recent,
    categoryList: [...CATEGORY_LIST],
  };
}

/** Plain text for Opus in chat, with optional filters. Merchant names and amounts only; no account numbers. */
export function spendingSummary(opts: { since?: string; category?: string; merchant?: string } = {}, now = new Date()): string {
  const today = localYmd(now);
  const since = /^\d{4}-\d{2}-\d{2}$/.test(opts.since ?? "") ? opts.since! : `${today.slice(0, 7)}-01`;
  const rows = all<TxRow>(`SELECT t.*, a.name, a.mask ${FROM} AND t.date >= ? ORDER BY t.date DESC, t.created_at DESC`, since);
  if (all<{ n: number }>("SELECT COUNT(*) AS n FROM bank_accounts WHERE tracked = 1")[0]!.n === 0) return "No bank account is being tracked yet. The user can link TD under Budget, then Spending.";
  const want = (opts.merchant ?? "").toLowerCase().trim();
  const picked = rows.filter((t) => (!opts.category || t.category.toLowerCase() === opts.category.toLowerCase()) && (!want || t.merchant.toLowerCase().includes(want)));
  const spend = picked.filter((t) => !NON_SPEND.has(t.category));
  const total = round2(spend.reduce((n, t) => n + t.amount, 0));
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const byCat = new Map<string, number>();
  for (const t of spend) byCat.set(t.category, round2((byCat.get(t.category) ?? 0) + t.amount));
  const byShop = new Map<string, number>();
  for (const t of spend) byShop.set(t.merchant, round2((byShop.get(t.merchant) ?? 0) + t.amount));
  const todaySpend = round2(rows.filter((t) => t.date === today && !NON_SPEND.has(t.category)).reduce((n, t) => n + t.amount, 0));
  return [
    `Card spending from ${since} to ${today} (CAD)${opts.category ? `, category ${opts.category}` : ""}${want ? `, vendor containing "${opts.merchant}"` : ""}:`,
    `Total: ${fmt(total)} across ${spend.length} purchases. Today so far (all categories): ${fmt(todaySpend)}. Pending charges are included. Transfers, card payments and pay are not counted as spending.`,
    `By category:\n${[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `- ${c}: ${fmt(n)}`).join("\n") || "- none"}`,
    `Top vendors:\n${[...byShop.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([m, n]) => `- ${m}: ${fmt(n)}`).join("\n") || "- none"}`,
    `Latest purchases:\n${picked.slice(0, 30).map((t) => `- ${t.date} ${t.merchant} ${fmt(t.amount)} [${t.category}]${t.pending ? " pending" : ""}`).join("\n") || "- none"}`,
  ].join("\n");
}
