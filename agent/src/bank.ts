import { config } from "./config.js";
import { all, db, get, kvGet, kvSet, logActivity, nowIso, run } from "./db.js";
import { openString, sealString } from "./crypto.js";
import { applyToVendor, askAboutMerchants, classify, FIXED_KINDS, isCategory, merchantKey, NON_SPEND, type SpendCategory } from "./categorize.js";
import { shares } from "./finance.js";
import { notify } from "./notify.js";
import { learnPay } from "./pay.js";
import type { LLM } from "./llm.js";

/**
 * Read-only link to your bank through Plaid. Opus can see accounts and transactions. It has no way to move money:
 * nothing in this file calls a Plaid endpoint that can pay, transfer or change an account.
 */

export class BankError extends Error {}
const bad = (m: string): never => { throw new BankError(m); };

const HOST = { sandbox: "https://sandbox.plaid.com", production: "https://production.plaid.com" } as const;
export const bankConfigured = () => config.mock || !!(config.plaid.clientId && config.plaid.secret);
export const bankEnv = (): "mock" | "sandbox" | "production" => (config.mock ? "mock" : config.plaid.env);

// ---- Talking to Plaid -----------------------------------------------------------------------

interface PlaidError { error_type?: string; error_code?: string; error_message?: string; display_message?: string | null }
class PlaidCall extends BankError { constructor(message: string, public code = "") { super(message); } }

async function plaid<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!bankConfigured()) bad("Add PLAID_CLIENT_ID and PLAID_SECRET to .env first.");
  let res: Response;
  try {
    res = await fetch((config.plaid.host || HOST[config.plaid.env]) + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: config.plaid.clientId, secret: config.plaid.secret, ...body }),
    });
  } catch {
    throw new PlaidCall("Could not reach Plaid. Check the internet connection and try again.", "NETWORK");
  }
  const data = (await res.json().catch(() => ({}))) as T & PlaidError;
  if (!res.ok) {
    const code = data.error_code ?? "";
    const msg = code === "ITEM_LOGIN_REQUIRED" ? "Your bank needs you to sign in again."
      : code === "INVALID_API_KEYS" || code === "INVALID_CLIENT_ID" || code === "INVALID_SECRET" ? "Plaid rejected the keys in .env. Check PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV."
      : data.display_message || data.error_message || `Plaid error (${res.status}).`;
    throw new PlaidCall(msg, code);
  }
  return data;
}

interface PAccount { account_id: string; name: string; official_name?: string | null; mask?: string | null; type: string; subtype?: string | null }
interface PTx {
  transaction_id: string; account_id: string; amount: number; date: string; authorized_date?: string | null; name: string;
  merchant_name?: string | null; pending: boolean; pending_transaction_id?: string | null;
  personal_finance_category?: { primary: string; detailed: string } | null;
}
interface SyncPage { added: PTx[]; modified: PTx[]; removed: { transaction_id: string }[]; next_cursor: string; has_more: boolean; accounts?: PAccount[] }

// ---- Linking ------------------------------------------------------------------------------------

/** A short-lived token the dashboard uses to open Plaid's sign-in window. Pass an item id to re-sign in to a bank. */
export async function createLinkToken(itemId?: string): Promise<{ linkToken: string; mock: boolean }> {
  if (config.mock) return { linkToken: "mock", mock: true };
  const base: Record<string, unknown> = {
    client_name: "Opus", language: "en", country_codes: ["CA"], user: { client_user_id: "opus-owner" },
    ...(config.plaid.redirectUri ? { redirect_uri: config.plaid.redirectUri } : {}),
  };
  if (itemId) {
    const item = get<{ access_token: string }>("SELECT access_token FROM bank_items WHERE id = ?", itemId) ?? bad("That bank is not linked.");
    const r = await plaid<{ link_token: string }>("/link/token/create", { ...base, access_token: openString(item.access_token) });
    return { linkToken: r.link_token, mock: false };
  }
  const r = await plaid<{ link_token: string }>("/link/token/create", { ...base, products: ["transactions"] });
  return { linkToken: r.link_token, mock: false };
}

function saveAccounts(itemId: string, accounts: PAccount[]) {
  for (const a of accounts) {
    // New accounts start as tracked: you asked for both cards to be tracked by default.
    run(
      `INSERT INTO bank_accounts (id, item_id, name, mask, type, subtype, tracked, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, mask = excluded.mask, type = excluded.type, subtype = excluded.subtype`,
      a.account_id, itemId, (a.official_name || a.name || "Account").slice(0, 60), (a.mask ?? "").slice(0, 8), a.type, a.subtype ?? "", nowIso(),
    );
  }
}

/** Plaid's sign-in window finished. Swap its one-time token for a lasting read-only one, which is stored encrypted. */
export async function finishLink(publicToken: string, institution: string, llm: LLM) {
  if (typeof publicToken !== "string" || !publicToken) bad("The bank did not finish linking.");
  const ex = await plaid<{ access_token: string; item_id: string }>("/item/public_token/exchange", { public_token: publicToken });
  const acc = await plaid<{ accounts: PAccount[] }>("/accounts/get", { access_token: ex.access_token });
  const name = institution.trim().slice(0, 60) || "Your bank";
  run(
    `INSERT INTO bank_items (id, institution, access_token, cursor, last_sync, error, created_at) VALUES (?, ?, ?, NULL, NULL, NULL, ?)
     ON CONFLICT(id) DO UPDATE SET access_token = excluded.access_token, institution = excluded.institution, error = NULL`,
    ex.item_id, name, sealString(ex.access_token), nowIso(),
  );
  saveAccounts(ex.item_id, acc.accounts);
  logActivity({ kind: "system", job: "bank", summary: `You linked ${name} (${acc.accounts.length} account${acc.accounts.length === 1 ? "" : "s"}), read only` });
  await syncAll(llm);
  soonAgain(llm);
}

/** Plaid takes a little while to collect the first batch of history, so look again shortly after linking. */
function soonAgain(llm: LLM) {
  for (const s of [25, 75, 200]) setTimeout(() => { void syncAll(llm).catch(() => {}); }, s * 1000);
}

// ---- Syncing ---------------------------------------------------------------------------------------

interface ItemRow { id: string; institution: string; access_token: string; cursor: string | null; last_sync: string | null; error: string | null }
interface AccRow { id: string; item_id: string; name: string; mask: string; type: string; tracked: number }

let syncing = false;

export async function syncAll(llm: LLM): Promise<{ added: number }> {
  if (syncing) return { added: 0 };
  syncing = true;
  let added = 0;
  try {
    for (const item of all<ItemRow>("SELECT * FROM bank_items")) {
      try {
        added += await syncItem(item);
        run("UPDATE bank_items SET error = NULL, last_sync = ? WHERE id = ?", nowIso(), item.id);
        run("DELETE FROM alerts WHERE id = ?", `bank-login-${item.id}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Sync failed.";
        run("UPDATE bank_items SET error = ? WHERE id = ?", msg.slice(0, 200), item.id);
        if (e instanceof PlaidCall && e.code === "ITEM_LOGIN_REQUIRED") {
          run(
            `INSERT INTO alerts (id, severity, title, detail, dismissed) VALUES (?, 'medium', ?, ?, 0) ON CONFLICT(id) DO NOTHING`,
            `bank-login-${item.id}`, `${item.institution} needs you to sign in again`, "Open Budget, then Spending, and choose Sign in again. Until then new transactions will not appear.",
          );
        }
        console.warn(`[bank] ${item.institution}: ${msg}`);
      }
    }
    await sortUnsorted(llm);
    learnPay();
  } finally { syncing = false; }
  return { added };
}

async function fetchPages(item: ItemRow): Promise<{ pages: SyncPage[]; cursor: string }> {
  if (config.mock) return mockPages(item);
  const token = openString(item.access_token);
  for (let attempt = 0; attempt < 2; attempt++) {
    const pages: SyncPage[] = [];
    let cursor = item.cursor ?? "";
    try {
      for (let i = 0; i < 40; i++) {
        const p = await plaid<SyncPage>("/transactions/sync", { access_token: token, cursor, count: 250, options: { include_personal_finance_category: true } });
        pages.push({ ...p, added: p.added ?? [], modified: p.modified ?? [], removed: p.removed ?? [] });
        cursor = p.next_cursor;
        if (!p.has_more) return { pages, cursor };
      }
      return { pages, cursor };
    } catch (e) {
      // Plaid asks for a restart if data changed while we were reading it.
      if (e instanceof PlaidCall && e.code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" && attempt === 0) continue;
      throw e;
    }
  }
  return { pages: [], cursor: item.cursor ?? "" };
}

async function syncItem(item: ItemRow): Promise<number> {
  const { pages, cursor } = await fetchPages(item);
  const first = !item.cursor;
  for (const p of pages) if (p.accounts?.length) saveAccounts(item.id, p.accounts);
  const tracked = new Map(all<AccRow>("SELECT * FROM bank_accounts WHERE item_id = ?", item.id).map((a) => [a.id, a]));

  const fresh: { merchant: string; amount: number; category: string; pending: boolean; replaced: boolean }[] = [];
  const posted: { id: string }[] = [];
  db.exec("BEGIN");
  try {
    // Added first, then changed, then removed: when a pending charge posts, its edits must carry over before it is dropped.
    for (const p of pages) for (const t of p.added) {
      const r = store(t, tracked.get(t.account_id), true);
      if (r) { fresh.push(r); if (!t.pending) posted.push({ id: t.transaction_id }); }
    }
    for (const p of pages) for (const t of p.modified) {
      store(t, tracked.get(t.account_id), false);
      if (!t.pending && (tracked.get(t.account_id)?.tracked ?? 1)) posted.push({ id: t.transaction_id });
    }
    for (const p of pages) for (const t of p.removed) run("DELETE FROM transactions WHERE id = ?", t.transaction_id);
    run("UPDATE bank_items SET cursor = ? WHERE id = ?", cursor, item.id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  for (const t of posted) matchSubscription(t.id);

  // Phone alert for a big new charge. Not for the first load of history, and not when a pending charge just posted.
  const limit = config.plaid.alertOver;
  if (!first && limit > 0) {
    for (const f of fresh) {
      if (f.replaced || f.amount < limit || NON_SPEND.has(f.category)) continue;
      void notify(`Opus: $${f.amount.toFixed(2)} at ${f.merchant}${f.pending ? " (pending)" : ""}`).catch(() => {});
    }
  }
  if (fresh.length) logActivity({ kind: "system", job: "bank", summary: `${first ? "Loaded" : "Logged"} ${fresh.length} transaction${fresh.length === 1 ? "" : "s"} from ${item.institution}` });
  return fresh.length;
}

/** Saves one transaction. Returns details for a brand new one, or null when it was skipped or already known. */
function store(t: PTx, acct: AccRow | undefined, isAdded: boolean) {
  if (acct && !acct.tracked) return null; // you turned this card off: nothing about it is saved
  const date = t.authorized_date || t.date;
  const d = classify({
    rawName: t.name, bankMerchant: t.merchant_name, primary: t.personal_finance_category?.primary, detailed: t.personal_finance_category?.detailed,
    amount: t.amount, accountType: acct?.type ?? "",
  });
  let category: string = d.category ?? "Other";
  let source: string = d.category ? d.source : "unsorted";

  // A pending charge has just posted as a new record: keep what you changed on the pending one, then drop it.
  let replaced = false;
  if (isAdded && t.pending_transaction_id) {
    const old = get<{ category: string; category_source: string }>("SELECT category, category_source FROM transactions WHERE id = ?", t.pending_transaction_id);
    if (old) {
      replaced = true;
      if (old.category_source === "you") { category = old.category; source = "you"; }
      run("DELETE FROM transactions WHERE id = ?", t.pending_transaction_id);
    }
  }
  const existing = get<{ category: string; category_source: string }>("SELECT category, category_source FROM transactions WHERE id = ?", t.transaction_id);
  if (existing?.category_source === "you") { category = existing.category; source = "you"; }

  run(
    `INSERT INTO transactions (id, account_id, date, amount, merchant, raw_name, category, category_source, pending, plaid_category, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET date = excluded.date, amount = excluded.amount, merchant = excluded.merchant, raw_name = excluded.raw_name,
       category = excluded.category, category_source = excluded.category_source, pending = excluded.pending, plaid_category = excluded.plaid_category, updated_at = excluded.updated_at`,
    t.transaction_id, t.account_id, date, Math.round(t.amount * 100) / 100, d.merchant, t.name.slice(0, 120), category, source, t.pending ? 1 : 0,
    t.personal_finance_category?.detailed ?? "", nowIso(), nowIso(),
  );
  return existing ? null : { merchant: d.merchant, amount: t.amount, category, pending: t.pending, replaced };
}

/** Vendors nothing recognised get one cheap question to Claude. The answer is remembered for next time. */
async function sortUnsorted(llm: LLM) {
  const rows = all<{ id: string; merchant: string }>("SELECT id, merchant FROM transactions WHERE category_source = 'unsorted'");
  if (rows.length === 0) return;
  let asked = false;
  try {
    const n = await askAboutMerchants(llm, rows.map((r) => r.merchant));
    asked = n >= 0;
  } catch (e) { console.warn("[bank] vendor sorting skipped:", e instanceof Error ? e.message : e); }
  for (const r of rows) {
    const rule = get<{ category: string }>("SELECT category FROM merchant_rules WHERE merchant_key = ?", merchantKey(r.merchant));
    if (rule && isCategory(rule.category)) run("UPDATE transactions SET category = ?, category_source = 'ai', updated_at = ? WHERE id = ?", rule.category, nowIso(), r.id);
    else if (asked) run("UPDATE transactions SET category = 'Other', category_source = 'rule', updated_at = ? WHERE id = ?", nowIso(), r.id); // asked and still unknown: stop asking
  }
}

// ---- Matching charges to your subscriptions and bills ------------------------------------------------

interface SubRow { id: string; name: string; amount: number | null; billing: string }

/**
 * A posted charge that lines up with a subscription updates when it was last seen and joins the charge history.
 * A different price than the one you have on file raises a dismissible alert (it never changes your subscription).
 */
function matchSubscription(txId: string) {
  const t = get<{ merchant: string; amount: number; date: string; category: string }>("SELECT merchant, amount, date, category FROM transactions WHERE id = ?", txId);
  if (!t || t.amount <= 0) return;
  const subs = all<SubRow>("SELECT id, name, amount, billing FROM subscriptions WHERE status != 'lapsed'").filter((s) => shares(s.name, t.merchant));
  if (subs.length === 0) return;
  const exact = subs.find((s) => s.amount !== null && Math.abs(s.amount - t.amount) < 0.011);
  const solo = !exact && subs.length === 1 && FIXED_KINDS.has(t.category) && subs[0]!.billing !== "apple" ? subs[0]! : undefined;
  const hit = exact ?? solo;
  if (!hit) return;
  run("UPDATE subscriptions SET last_seen = ?, updated_at = ? WHERE id = ?", t.date, nowIso(), hit.id);
  run("INSERT OR IGNORE INTO charges (name, amount, charged, posted, subscription_id, note, created_at) VALUES (?, ?, ?, ?, ?, 'From your bank', ?)", hit.name, t.amount, t.date, t.date, hit.id, nowIso());
  if (solo && hit.amount !== null) {
    const diff = t.amount - hit.amount;
    if (Math.abs(diff) >= 0.5 && Math.abs(diff) / hit.amount >= 0.02) {
      run(
        `INSERT INTO alerts (id, severity, title, detail, dismissed) VALUES (?, 'medium', ?, ?, 0) ON CONFLICT(id) DO NOTHING`,
        `price-${hit.id}-${t.date.slice(0, 7)}`, `${hit.name} charged $${t.amount.toFixed(2)}`,
        `Your list has $${hit.amount.toFixed(2)}. If the price went ${diff > 0 ? "up" : "down"}, update it on the Subscriptions page; taxes can also explain a small difference.`,
      );
    }
  }
}

// ---- Your controls -----------------------------------------------------------------------------------

/** Start or stop tracking one card. Stopping keeps the history out of sight and saves nothing new; starting again refills it. */
export async function setTracked(accountId: string, tracked: boolean, llm: LLM) {
  const a = get<AccRow>("SELECT * FROM bank_accounts WHERE id = ?", accountId) ?? bad("That account is gone.");
  run("UPDATE bank_accounts SET tracked = ? WHERE id = ?", tracked ? 1 : 0, accountId);
  if (tracked) run("UPDATE bank_items SET cursor = NULL WHERE id = ?", a.item_id); // refetch, so the gap fills in
  logActivity({ kind: "system", job: "bank", summary: `You ${tracked ? "started" : "stopped"} tracking ${a.name}${a.mask ? ` ••${a.mask}` : ""}` });
  if (tracked) await syncAll(llm).catch(() => {});
}

/** Unlinks the bank at Plaid and deletes everything Opus saved from it. */
export async function disconnect(itemId: string) {
  const item = get<ItemRow>("SELECT * FROM bank_items WHERE id = ?", itemId) ?? bad("That bank is already unlinked.");
  let remote = true;
  if (!config.mock) {
    try { await plaid("/item/remove", { access_token: openString(item.access_token) }); } catch { remote = false; }
  }
  const ids = all<{ id: string }>("SELECT id FROM bank_accounts WHERE item_id = ?", itemId);
  for (const a of ids) run("DELETE FROM transactions WHERE account_id = ?", a.id);
  run("DELETE FROM bank_accounts WHERE item_id = ?", itemId);
  run("DELETE FROM bank_items WHERE id = ?", itemId);
  run("DELETE FROM alerts WHERE id = ?", `bank-login-${itemId}`);
  logActivity({ kind: "system", job: "bank", summary: `You unlinked ${item.institution} and deleted its saved transactions${remote ? "" : " (Plaid could not be reached; remove access from your bank's settings too)"}` });
  return remote;
}

/** Change a category. By default every purchase from that vendor changes, now and from here on. */
export function setCategory(txId: string, category: unknown, wholeVendor: boolean) {
  if (!isCategory(category)) bad("Pick a category from the list.");
  const t = get<{ merchant: string }>("SELECT merchant FROM transactions WHERE id = ?", txId) ?? bad("That transaction is gone.");
  const cat = category as SpendCategory;
  run("UPDATE transactions SET category = ?, category_source = 'you', updated_at = ? WHERE id = ?", cat, nowIso(), txId);
  if (wholeVendor) {
    const key = merchantKey(t.merchant);
    run("INSERT INTO merchant_rules (merchant_key, category, source, created_at) VALUES (?, ?, 'you', ?) ON CONFLICT(merchant_key) DO UPDATE SET category = excluded.category, source = 'you'", key, cat, nowIso());
    applyToVendor(key, cat, "you");
  }
  logActivity({ kind: "system", job: "bank", summary: `You changed ${t.merchant} to ${cat}${wholeVendor ? " for every purchase there" : " (this purchase only)"}` });
}

// ---- Demo bank (mock mode only): exercises the same code paths as the real thing -------------------------

export async function connectDemoBank(llm: LLM) {
  if (!config.mock) bad("The demo bank only exists in demo mode.");
  run("INSERT OR IGNORE INTO bank_items (id, institution, access_token, cursor, created_at) VALUES ('mock-item', 'TD Canada Trust (demo)', ?, NULL, ?)", sealString("mock-token"), nowIso());
  saveAccounts("mock-item", [
    { account_id: "mock-visa", name: "TD Cash Back Visa", mask: "4821", type: "credit", subtype: "credit card" },
    { account_id: "mock-chq", name: "TD Every Day Chequing", mask: "0377", type: "depository", subtype: "checking" },
  ]);
  await syncAll(llm);
}

const ymd = (back: number) => { const d = new Date(); d.setDate(d.getDate() - back); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const mk = (id: string, acct: string, back: number, amount: number, name: string, pending = false, pfc?: [string, string], merchant?: string, pendingOf?: string): PTx => ({
  transaction_id: id, account_id: acct, amount, date: ymd(back), name, pending, merchant_name: merchant ?? null, pending_transaction_id: pendingOf ?? null,
  personal_finance_category: pfc ? { primary: pfc[0], detailed: pfc[1] } : null,
});

function mockPages(item: ItemRow): { pages: SyncPage[]; cursor: string } {
  const page = (p: Partial<SyncPage>, cursor: string): { pages: SyncPage[]; cursor: string } => ({ pages: [{ added: [], modified: [], removed: [], next_cursor: cursor, has_more: false, ...p }], cursor });
  const day1 = [
    mk("m1", "mock-visa", 0, 4.37, "TIM HORTONS #4521 HALIFAX NS", true),
    mk("m2", "mock-visa", 1, 58.4, "ESSO 1873 DIEPPE NB", true),
    mk("m3", "mock-visa", 1, 24.5, "SQ *MARCOS TAQUERIA", false),
    mk("m4", "mock-visa", 2, 87.22, "SOBEYS 0129 HALIFAX NS"),
    mk("m5", "mock-visa", 2, 31.99, "AMZN Mktp CA*2K4"),
    mk("m6", "mock-visa", 2, 14.94, "APPLE.COM/BILL"),
    mk("m7", "mock-visa", 3, 62.50, "FIDO MOBILE"),
    mk("m8", "mock-visa", 3, -300, "PAYMENT - THANK YOU"),
    mk("m9", "mock-visa", 4, 18.3, "UBER *TRIP HELP.UBER.COM"),
    mk("m10", "mock-visa", 4, 22.1, "SHOPPERS DRUG MART #1042"),
    mk("m11", "mock-visa", 5, 249, "B&H PHOTO VIDEO 800-606-6969 NY"),
    mk("m12", "mock-visa", 6, 20.99, "NETFLIX.COM"),
    mk("m13", "mock-visa", 7, 40, "BLUE DOOR STUDIO"),
    mk("m14", "mock-visa", 7, -12, "AMZN Mktp CA REFUND"),
    mk("m15", "mock-visa", 8, 36, "ANTHROPIC CLAUDE.AI SUBSCR"),
    mk("m16", "mock-chq", 2, 3.12, "TIM HORTONS #0077 HALIFAX NS"),
    mk("m17", "mock-chq", 3, 300, "TD VISA PAYMENT"),
    mk("m18", "mock-chq", 5, -1200, "PAYROLL DEPOSIT ACME CO"),
    mk("m19", "mock-chq", 1, 50, "INTERAC E-TRANSFER SENT"),
    mk("m21", "mock-chq", 19, -1200, "PAYROLL DEPOSIT ACME CO"),
  ];
  // The next day: yesterday's Esso charge posts (as a new record that points at the pending one), and a new coffee appears.
  const day2Added = [
    mk("m2-posted", "mock-visa", 1, 58.4, "ESSO 1873 DIEPPE NB", false, undefined, undefined, "m2"),
    mk("m20", "mock-visa", 0, 6.85, "STARBUCKS 2210 HALIFAX NS", true),
  ];
  const stage = Number(kvGet("mock-stage") ?? 0);
  if (!item.cursor) {
    if (stage < 2) { kvSet("mock-stage", "1"); return page({ added: day1 }, "mock-1"); }
    // Linking again later: Plaid hands over the current picture in one go.
    return page({ added: [...day1.filter((t) => t.transaction_id !== "m2"), ...day2Added.map((t) => ({ ...t, pending_transaction_id: null }))] }, "mock-2");
  }
  if (item.cursor === "mock-1") { kvSet("mock-stage", "2"); return page({ added: day2Added, removed: [{ transaction_id: "m2" }] }, "mock-2"); }
  return page({}, item.cursor);
}
