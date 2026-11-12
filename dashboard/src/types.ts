export type Category = "jaded" | "school" | "bills" | "personal" | "junk";
export const CATEGORIES: Category[] = ["jaded", "school", "bills", "personal", "junk"];
export type Level = "ok" | "nearing" | "target" | "warn" | "alert";

export interface Sub {
  id: string; name: string; plan: string; billing: string; amount: number | null; cycle: string;
  monthlyEquivalent: number | null; nextCharge: string | null; lastSeen: string | null;
  status: string; verdict: string; reason: string; userDecided?: boolean;
}
export interface Approval {
  id: string; kind: string; title: string; reason: string; subscriptionId: string | null;
  createdAt: string; status: string; result?: string | null;
}
export interface Alert { id: string; severity: string; title: string; detail: string }
export interface Draft { id: number; subject: string; sender: string; category: Category; preview: string; viewUrl: string | null; createdAt: string }
export interface Activity { id: number; ts: string; kind: string; job: string; summary: string }
export interface Item { label: string; amount: number }
export interface Totals { subtotal: number; discount: number; tax: number; total: number; deposit: number; balance: number }
export interface Contract {
  id: number; inquiryId: number; clientName: string; clientEmail: string; clientPhone: string; eventType: string; eventDate: string | null; venue: string;
  items: Item[]; discount: number; taxRate: number; depositPct: number; notes: string; terms: string; coverSubject: string; coverBody: string;
  status: "draft" | "sent"; sentAt: string | null; sentTo: string | null; updatedAt: string; totals: Totals; problems: string[];
}
export type Stage = "new" | "replied" | "contract" | "sent" | "booked" | "declined";
export interface Client {
  id: number; source: string; name: string; email: string; phone: string; service: string; eventDate: string | null; venue: string; guests: number | null;
  message: string; summary: string; stage: Stage; createdAt: string; threadUrl: string | null;
  draft: { id: number; subject: string; body: string; viewUrl: string | null } | null;
  contract: Contract | null;
}
export interface Pkg { id: string; name: string; price: number; description: string }
export interface JadedSettings {
  business: { name: string; email: string; phone: string; location: string; signer: string };
  taxLabel: string; taxRate: number; depositPct: number; packages: Pkg[]; terms: string; coverSubject: string; coverBody: string;
}
export interface BudgetLine { id: number; kind: "income" | "expense" | "saving"; name: string; amount: number }
export interface GoalMonth { month: string; planned: number; amount: number }
export type GoalStatus = "reached" | "done" | "partial" | "on_track" | "short" | "unknown";
export interface Goal {
  id: number; name: string; target: number; saved: number; due: string | null;
  month: string; totalSaved: number; remaining: number; remainingAtStart: number; pct: number;
  plan: number; monthsLeft: number | null; hasDate: boolean; overdue: boolean; allocated: number;
  status: GoalStatus; setAside: number | null; shortfall: number; finishBy: string | null; message: string;
  history: GoalMonth[]; realisticMonthly: number | null; followThrough: number | null;
}
export interface Upcoming { id: string; name: string; amount: number; date: string; days: number }
export interface Note { id: number; text: string; source: "you" | "chat"; createdAt: string }
export interface FixedItem { id: string; name: string; monthly: number; removable: boolean }
export interface Charge { id: number; name: string; amount: number; charged: string | null; posted: string | null; subscriptionId: string | null; note: string }
export interface Finance {
  income: number; fixed: number; planned: number; saving: number; left: number; savingsRate: number | null; hasIncome: boolean;
  fixedItems: FixedItem[]; unpricedCount: number; lines: BudgetLine[]; goals: Goal[]; charges: Charge[];
  goalsVerdict: "none" | "unknown" | "ok" | "short"; perDay: number; daysLeft: number; upcoming: Upcoming[]; upcomingTotal: number; month: string;
}
export type TxSource = "you" | "rule" | "bank" | "ai" | "unsorted";
export interface Tx { id: string; date: string; merchant: string; rawName: string; amount: number; category: string; source: TxSource; pending: boolean; account: string }
export interface BankAccount { id: string; itemId: string; name: string; mask: string; type: string; tracked: boolean; institution: string }
export interface BankItem { id: string; institution: string; lastSync: string | null; error: string | null; loading: boolean }
export interface Money {
  configured: boolean; env: "mock" | "sandbox" | "production";
  accounts: BankAccount[]; items: BankItem[];
  today: { date: string; spent: number; count: number };
  month: { key: string; spent: number; count: number; fixedSpent: number };
  categories: { category: string; amount: number; lineId: number | null; fixed: boolean }[];
  lines: { id: number; name: string; planned: number; spent: number }[];
  pace: { free: number; used: number; remaining: number; perDay: number } | null;
  days: { date: string; amount: number }[];
  recent: Tx[]; categoryList: string[];
}
export interface FileItem { id: number; name: string; kind: string; size: number; source: "opus" | "upload"; createdAt: string }
export type DayCounts = { date: string } & Record<Category, number>;

export interface State {
  now: string;
  mode: "live" | "demo";
  user: string;
  spend: { monthUsd: number; targetUsd: number; alertUsd: number; level: Level };
  today: Record<Category, number>;
  week: DayCounts[];
  drafts: Draft[];
  subscriptions: Sub[];
  approvals: Approval[];
  clients: Client[];
  finance: Finance;
  money: Money;
  pay: Pay;
  files: FileItem[];
  notes: Note[];
  backup: { lastAt: string | null; count: number; folder: string };
  security: { passwordSet: boolean; sessions: number; lastLoginAt: string | null; encryption: "windows-dpapi" | "key-file" };
  jaded: JadedSettings;
  alerts: Alert[];
  activity: Activity[];
}

export interface PayDay { date: string; passed: boolean; received: number | null }
export type Pay =
  | { configured: false; detected: { anchor: string; everyDays: number; amount: number | null } | null }
  | {
      configured: true;
      schedule: { anchor: string; everyDays: number; source: "you" | "detected" };
      amount: number | null; amountFixed: boolean;
      next: { date: string; days: number; today: boolean }; last: string;
      month: { key: string; count: number; dates: PayDay[]; expected: number | null; received: number; extra: boolean; stillToCome: number };
      late: string | null;
      outlook: { month: string; paydays: string[]; count: number; total: number | null; extra: boolean }[];
      extraMonth: { month: string; count: number; amount: number | null } | null;
      until: { days: number; billsBefore: { name: string; amount: number; date: string }[]; billsTotal: number; safe: number | null; perDay: number | null; tight: boolean } | null;
      monthEnd: { projectedLeft: number; onTrack: boolean; basis: "pace" } | null;
    };
