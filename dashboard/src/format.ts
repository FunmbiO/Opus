import type { Category } from "./types";

export const CAT: Record<Category, { label: string; color: string }> = {
  jaded: { label: "Business", color: "var(--c-jaded)" },
  school: { label: "School", color: "var(--c-school)" },
  bills: { label: "Bills", color: "var(--c-bills)" },
  personal: { label: "Personal", color: "var(--c-personal)" },
  junk: { label: "Junk", color: "var(--c-junk)" },
};

export const money = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : `$${n.toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

export function greeting(now: string) {
  const h = new Date(now).getHours();
  return h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function ago(iso: string, now: string) {
  const s = Math.max(0, (new Date(now).getTime() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function daysUntil(date: string | null, now: string) {
  if (!date) return null;
  const a = new Date(date + "T12:00:00").getTime();
  const b = new Date(now).getTime();
  return Math.round((a - b) / 86400000);
}

export function dueLabel(date: string | null, now: string) {
  const d = daysUntil(date, now);
  if (d == null) return "No date seen";
  if (d < 0) return "Date passed";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d < 14) return `In ${d} days`;
  return new Date(date + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export const cycleLabel = (c: string) => (c === "unknown" ? "" : c === "weekly" ? "/wk" : c === "yearly" ? "/yr" : "/mo");
export const weekday = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-CA", { weekday: "short" });

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Same maths as the agent, so the numbers update as you type. The agent recalculates on save. */
export function calcTotals(items: { amount: number }[], discount: number, taxRate: number, depositPct: number) {
  const subtotal = r2(items.reduce((a, i) => a + (i.amount || 0), 0));
  const disc = Math.min(r2(discount || 0), subtotal);
  const tax = r2(((subtotal - disc) * (taxRate || 0)) / 100);
  const total = r2(subtotal - disc + tax);
  const deposit = r2((total * (depositPct || 0)) / 100);
  return { subtotal, discount: disc, tax, total, deposit, balance: r2(total - deposit) };
}
export const longDate = (d: string | null) => (d ? new Date(d + "T12:00:00").toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }) : "No date yet");

const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10" -> "Oct 2026" */
export const monthName = (key: string) => `${MN[Number(key.slice(5, 7)) - 1] ?? ""} ${key.slice(0, 4)}`;
