import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { seedPath } from "./seedfile.js";
import { logActivity, nowIso, run } from "./db.js";

interface AuditSub {
  id: string; name: string; plan: string; billing: string; amount: number | null; cycle: string;
  monthlyEquivalent: number | null; nextCharge: string | null; lastSeen: string | null;
  status: string; verdict: string; reason: string;
}
interface Audit {
  generatedAt: string;
  subscriptions: AuditSub[];
  approvals: { id: string; kind: string; title: string; reason: string; subscriptionId: string; createdAt: string }[];
  alerts: { id: string; severity: string; title: string; detail: string }[];
}

/** Loads a first inbox audit so the dashboard has data on day one: seed/audit.json if you have one, else the sample in shared/. Safe to run twice. */
export function seedFromAudit() {
  const path = existsSync(seedPath("audit.json")) ? seedPath("audit.json") : fileURLToPath(new URL("../../shared/audit.json", import.meta.url));
  const audit = JSON.parse(readFileSync(path, "utf8")) as Audit;

  for (const s of audit.subscriptions) {
    run(
      `INSERT INTO subscriptions (id, name, plan, billing, amount, cycle, monthly_equivalent, next_charge, last_seen, status, verdict, reason, source, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'audit', ?)
       ON CONFLICT(id) DO NOTHING`,
      s.id, s.name, s.plan, s.billing, s.amount, s.cycle, s.monthlyEquivalent, s.nextCharge, s.lastSeen, s.status, s.verdict, s.reason, nowIso(),
    );
  }
  for (const a of audit.approvals) {
    run(
      `INSERT INTO approvals (id, kind, title, reason, subscription_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?) ON CONFLICT(id) DO NOTHING`,
      a.id, a.kind, a.title, a.reason, a.subscriptionId, a.createdAt,
    );
  }
  for (const a of audit.alerts) {
    run("INSERT INTO alerts (id, severity, title, detail) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING", a.id, a.severity, a.title, a.detail);
  }
  logActivity({ kind: "system", job: "seed", summary: `Loaded the ${audit.generatedAt} inbox audit: ${audit.subscriptions.length} subscriptions` });
  return audit.subscriptions.length;
}
