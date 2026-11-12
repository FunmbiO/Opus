import { config } from "./config.js";
import { monthSpend } from "./cost.js";
import { all, get, kvGet, kvSet } from "./db.js";
import { makeMailbox } from "./gmail.js";
import { runSubscriptionScan, runTriage, type Deps } from "./jobs.js";
import { makeLLM } from "./llm.js";
import { checkGoogleAuth, reportIfAuthError } from "./reminders.js";
import { seedFromAudit } from "./seed.js";
import { seedBills, syncBudgetAlerts } from "./finance.js";
import { seedPay } from "./pay.js";
import { backupIfDue, encryptOldBackups } from "./backups.js";
import { encryptExistingFiles } from "./files.js";
import { keyDir, keyMode, masterKey } from "./crypto.js";
import { passwordSet } from "./auth.js";
import { startServer } from "./server.js";
import { bankConfigured, syncAll } from "./bank.js";

const cmd = process.argv[2];
const usage = `Opus commands:
  triage   sort unread mail and write drafts for anything that needs a reply
  subs     scan receipts and update the subscription list
  seed     load the first inbox audit so the dashboard has data
  serve    start the dashboard and API (set AUTORUN=1 to also run jobs on a schedule)
  demo     run everything on fake data, no keys needed (MOCK=1 is set for you)`;

const money = (n: number) => `$${n.toFixed(4)}`;

function deps(): Deps {
  return { mailbox: makeMailbox(), llm: makeLLM() };
}

function schedule(d: Deps) {
  const everyMin = Number(process.env.TRIAGE_EVERY_MIN ?? 15);
  console.log(`Auto-run on: triage every ${everyMin} min, subscription scan Mondays.`);
  let busy = false;
  const guard = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    busy = true;
    try { await fn(); } catch (e) { console.error(e); reportIfAuthError(e); } finally { busy = false; }
  };
  setInterval(() => guard(() => runTriage(d)), everyMin * 60_000);
  setInterval(() => {
    const now = new Date();
    const weekKey = `subs-ran:${now.getUTCFullYear()}-${Math.floor(now.getTime() / 604_800_000)}`;
    if (now.getDay() === 1 && now.getHours() >= 7 && !kvGet(weekKey)) {
      kvSet(weekKey, now.toISOString());
      guard(() => runSubscriptionScan(d));
    }
  }, 3_600_000);
}

async function main() {
  switch (cmd) {
    case "triage": {
      const r = await runTriage(deps());
      console.log(r);
      break;
    }
    case "subs": {
      await runSubscriptionScan(deps());
      break;
    }
    case "seed": {
      console.log(`Seeded ${seedFromAudit()} subscriptions.`);
      seedBills();
      seedPay();
      break;
    }
    case "serve": {
      console.log("Opus v20: knows your payday, plans each month and each pay period from it");
      try {
        masterKey();
        const sealed = encryptExistingFiles() + encryptOldBackups();
        console.log(`Encryption on (${keyMode() === "windows-dpapi" ? "key locked to your Windows login" : "key file"}). Key folder: ${keyDir()}${sealed ? `. Sealed ${sealed} older item${sealed === 1 ? "" : "s"}.` : ""}`);
      } catch (e) { console.warn("Encryption is OFF:", e instanceof Error ? e.message : e); }
      if (!passwordSet()) console.log("No dashboard password yet. Open the dashboard and set one, or run npm run password.");
      const d = deps();
      seedBills();
      seedPay();
      startServer(d);
      backupIfDue();
      syncBudgetAlerts();
      setInterval(() => { backupIfDue(); syncBudgetAlerts(); }, 3_600_000);
      checkGoogleAuth();
      setInterval(checkGoogleAuth, 3_600_000);
      // Card transactions: look for new ones every few minutes once a bank is linked. Always on, no AUTORUN needed.
      if (bankConfigured()) {
        const every = Math.max(2, config.plaid.syncEveryMin) * 60_000;
        const tick = () => { if (get("SELECT id FROM bank_items LIMIT 1")) syncAll(d.llm).catch((e) => console.warn("[bank]", e instanceof Error ? e.message : e)); };
        setTimeout(tick, 5_000);
        setInterval(tick, every);
        console.log(`Bank sync on (${config.mock ? "demo" : config.plaid.env}): checks every ${Math.max(2, config.plaid.syncEveryMin)} min once a bank is linked.`);
      } else console.log("Bank sync is off. Add PLAID_CLIENT_ID and PLAID_SECRET to .env to link your card.");
      if (process.env.AUTORUN === "1") schedule(d);
      return; // keep the process alive
    }
    case "demo": {
      config.mock || console.log("(demo always runs in mock mode)");
      const d = deps();
      console.log("1. Sorting the fake inbox...");
      console.log("  ", await runTriage(d));
      console.log("2. Scanning fake receipts...");
      await runSubscriptionScan(d);
      console.log("3. Result");
      console.table(all("SELECT category, needs_reply, decided_by, subject FROM threads ORDER BY received_at DESC"));
      console.table(all("SELECT name, amount, cycle, monthly_equivalent AS monthly, verdict FROM subscriptions"));
      console.log("Drafts waiting:", get<{ n: number }>("SELECT COUNT(*) AS n FROM drafts WHERE status = 'waiting'")?.n);
      console.log("Pending approvals:", get<{ n: number }>("SELECT COUNT(*) AS n FROM approvals WHERE status = 'pending'")?.n);
      console.log("Spend this month (mock tokens priced like real ones):", money(monthSpend()));
      console.log(`\nSee it in the dashboard: npm run seed:mock then npm run serve:mock  (database: ${config.dbPath})`);
      break;
    }
    default:
      console.log(usage);
  }
  process.exit(0);
}

main().catch((err) => {
  reportIfAuthError(err);
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
