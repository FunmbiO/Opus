import { config } from "./config.js";
import { profile } from "./seedfile.js";
import { budgetLevel, monthSpend } from "./cost.js";
import { contractTotals, getSettings, problems, rowToContract } from "./contracts.js";
import { CATEGORIES, all, get, type Category } from "./db.js";
import { buildFinance } from "./finance.js";
import { buildPay } from "./pay.js";
import { buildMoney } from "./spending.js";
import { listFiles } from "./files.js";
import { listNotes } from "./notes.js";
import { backupStatus } from "./backups.js";
import { securityInfo } from "./auth.js";
import { keyMode } from "./crypto.js";

/** Builds the JSON the dashboard reads. Shape matches dashboard/src/types.ts. */

interface SubRow {
  id: string; name: string; plan: string; billing: string; amount: number | null; cycle: string;
  monthly_equivalent: number | null; next_charge: string | null; last_seen: string | null;
  status: string; verdict: string; reason: string; source: string;
}

interface InqRow {
  id: number; thread_id: string | null; source: string; name: string; email: string; phone: string; service: string;
  event_date: string | null; venue: string; guests: number | null; message: string; summary: string; outcome: string | null; created_at: string;
}

function buildClients() {
  const settings = getSettings();
  return all<InqRow>("SELECT * FROM inquiries ORDER BY created_at DESC LIMIT 100").map((i) => {
    const cRow = get<Parameters<typeof rowToContract>[0]>("SELECT * FROM contracts WHERE inquiry_id = ?", i.id);
    const contract = cRow ? rowToContract(cRow) : null;
    const draft = i.thread_id
      ? get<{ id: number; subject: string; body: string; view_url: string | null }>("SELECT id, subject, body, view_url FROM drafts WHERE thread_id = ? ORDER BY id DESC", i.thread_id)
      : get<{ id: number; subject: string; body: string; view_url: string | null }>("SELECT id, subject, body, view_url FROM drafts WHERE lower(sender) = lower(?) ORDER BY id DESC", i.email);
    const stage = i.outcome ?? (contract?.status === "sent" ? "sent" : contract ? "contract" : draft ? "replied" : "new");
    return {
      id: i.id, source: i.source, name: i.name, email: i.email, phone: i.phone, service: i.service, eventDate: i.event_date, venue: i.venue,
      guests: i.guests, message: i.message, summary: i.summary, stage, createdAt: i.created_at,
      threadUrl: i.thread_id ? `https://mail.google.com/mail/u/0/#all/${i.thread_id}` : null,
      draft: draft ? { id: draft.id, subject: draft.subject, body: draft.body, viewUrl: draft.view_url } : null,
      contract: contract ? { ...contract, totals: contractTotals(contract), problems: contract.status === "sent" ? [] : problems(contract, settings) } : null,
    };
  });
}

export function buildState() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();

  const today = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const r of all<{ category: Category; n: number }>(
    "SELECT category, COUNT(*) AS n FROM threads WHERE received_at >= ? GROUP BY category",
    dayAgo,
  )) {
    if (r.category in today) today[r.category] = r.n;
  }

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 86_400_000).toISOString().slice(0, 10);
    const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
    for (const r of all<{ category: Category; n: number }>(
      "SELECT category, COUNT(*) AS n FROM threads WHERE substr(received_at, 1, 10) = ? GROUP BY category",
      d,
    )) {
      if (r.category in counts) counts[r.category] = r.n;
    }
    return { date: d, ...counts };
  });

  const spend = monthSpend();
  const finance = buildFinance(now);
  const money = buildMoney(now, finance);

  return {
    now: now.toISOString(),
    mode: "live" as const,
    user: profile().name,
    spend: { monthUsd: spend, targetUsd: config.budget.targetUsd, alertUsd: config.budget.alertUsd, level: budgetLevel(spend) },
    today,
    week,
    drafts: all<{ id: number; subject: string; sender: string; category: Category; body: string; view_url: string | null; created_at: string }>(
      "SELECT id, subject, sender, category, body, view_url, created_at FROM drafts WHERE status = 'waiting' ORDER BY created_at DESC LIMIT 20",
    ).map((d) => ({ id: d.id, subject: d.subject, sender: d.sender, category: d.category, preview: d.body.slice(0, 1500), viewUrl: d.view_url, createdAt: d.created_at })),
    subscriptions: all<SubRow>("SELECT * FROM subscriptions ORDER BY (next_charge IS NULL), next_charge").map((s) => ({
      id: s.id, name: s.name, plan: s.plan, billing: s.billing, amount: s.amount, cycle: s.cycle,
      monthlyEquivalent: s.monthly_equivalent, nextCharge: s.next_charge, lastSeen: s.last_seen,
      status: s.status, verdict: s.verdict, reason: s.reason, userDecided: s.source === "user",
    })),
    approvals: all<{ id: string; kind: string; title: string; reason: string; subscription_id: string | null; created_at: string; status: string; result: string | null }>(
      "SELECT * FROM approvals WHERE status = 'pending' OR decided_at >= ? ORDER BY created_at DESC LIMIT 30",
      new Date(now.getTime() - 7 * 86_400_000).toISOString(),
    ).map((a) => ({ id: a.id, kind: a.kind, title: a.title, reason: a.reason, subscriptionId: a.subscription_id, createdAt: a.created_at, status: a.status, result: a.result })),
    clients: buildClients(),
    finance,
    money,
    pay: buildPay(now, {
      perDay: money.pace?.perDay ?? 0, remaining: money.pace?.remaining ?? 0, used: money.pace?.used ?? 0, free: money.pace?.free ?? 0,
      hasBudget: !!money.pace, upcoming: finance.upcoming.map((u) => ({ name: u.name, amount: u.amount, date: u.date })), hasBank: money.accounts.length > 0,
    }),
    notes: listNotes().map((n) => ({ id: n.id, text: n.text, source: n.source, createdAt: n.created_at })),
    backup: backupStatus(),
    security: { ...securityInfo(), encryption: keyMode() },
    files: listFiles(40).map((f) => ({ id: f.id, name: f.name, kind: f.kind, size: f.size, source: f.source, createdAt: f.created_at })),
    jaded: getSettings(),
    alerts: all<{ id: string; severity: string; title: string; detail: string }>("SELECT id, severity, title, detail FROM alerts WHERE dismissed = 0"),
    activity: all<{ id: number; ts: string; kind: string; job: string; summary: string }>(
      "SELECT id, ts, kind, job, summary FROM activity WHERE kind != 'model' ORDER BY id DESC LIMIT 60",
    ),
  };
}
