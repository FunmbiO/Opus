import { config } from "./config.js";
import { get, kvGet, kvSet } from "./db.js";
import { notify } from "./notify.js";

/** USD per million tokens. Source: Claude API pricing page, checked Oct 2026. */
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-opus-5-5": { in: 4, out: 20 },
};
// Unknown model: assume a pricey one so the guard errs on the safe side.
const FALLBACK = { in: 10, out: 50 };

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export function costUsd(model: string, u: Usage): number {
  const p = PRICES[model] ?? FALLBACK;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const usd =
    (u.input_tokens * p.in +
      cacheRead * p.in * 0.1 +
      cacheWrite * p.in * 1.25 +
      u.output_tokens * p.out) /
    1_000_000;
  return usd;
}

export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

export function monthSpend(): number {
  const row = get<{ total: number | null }>(
    "SELECT SUM(cost_usd) AS total FROM activity WHERE substr(ts, 1, 7) = ?",
    monthKey(),
  );
  return row?.total ?? 0;
}

export type BudgetLevel = "ok" | "nearing" | "target" | "warn" | "alert";

export function budgetLevel(spend: number): BudgetLevel {
  const { targetUsd, alertUsd } = config.budget;
  if (spend >= alertUsd) return "alert";
  if (spend >= alertUsd * 0.75) return "warn";
  if (spend >= targetUsd) return "target";
  if (spend >= targetUsd * 0.8) return "nearing";
  return "ok";
}

const money = (n: number) => `$${n.toFixed(2)}`;

const MESSAGES: Record<Exclude<BudgetLevel, "ok">, (spend: number) => string> = {
  nearing: (s) => `Opus has used ${money(s)} of API credit this month, close to your ${money(config.budget.targetUsd)} target.`,
  target: (s) => `Opus passed your ${money(config.budget.targetUsd)} monthly target. Spend so far: ${money(s)}.`,
  warn: (s) => `Heads up: API spend is ${money(s)} this month, heading toward your ${money(config.budget.alertUsd)} alert line.`,
  alert: (s) => `API spend hit ${money(s)} this month, past your ${money(config.budget.alertUsd)} alert line. New jobs are paused until you raise the limit.`,
};

/** Check spend, send each alert level once per month, and say whether jobs may run. */
export async function checkBudget(): Promise<{ spend: number; level: BudgetLevel; blocked: boolean }> {
  const spend = monthSpend();
  const level = budgetLevel(spend);

  if (level !== "ok") {
    const key = `budget-alert:${monthKey()}:${level}`;
    if (!kvGet(key)) {
      kvSet(key, new Date().toISOString());
      await notify(MESSAGES[level](spend), { urgent: level === "warn" || level === "alert" });
    }
  }

  return { spend, level, blocked: spend >= config.budget.hardStopUsd };
}
