import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

export type Category = "jaded" | "school" | "bills" | "personal" | "junk";
export const CATEGORIES: Category[] = ["jaded", "school", "bills", "personal", "junk"];

mkdirSync(dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);

db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  sender TEXT NOT NULL,
  received_at TEXT NOT NULL,
  category TEXT NOT NULL,
  needs_reply INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  decided_by TEXT NOT NULL DEFAULT 'rule',
  triaged_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  gmail_draft_id TEXT,
  subject TEXT NOT NULL DEFAULT '',
  sender TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'personal',
  body TEXT NOT NULL,
  view_url TEXT,
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT '',
  billing TEXT NOT NULL DEFAULT 'unknown',
  amount REAL,
  cycle TEXT NOT NULL DEFAULT 'unknown',
  monthly_equivalent REAL,
  next_charge TEXT,
  last_seen TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  verdict TEXT NOT NULL DEFAULT 'unclear',
  reason TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'agent',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,          -- sha256 of the session token; the token itself is never stored
  created_at TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT,
  agent TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  dismissed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,          -- tool | model | system
  job TEXT NOT NULL,
  tool TEXT,
  summary TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT UNIQUE,
  source TEXT NOT NULL DEFAULT 'gmail',      -- gmail | web
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT '',          -- package id, or empty if unclear
  event_date TEXT,
  venue TEXT NOT NULL DEFAULT '',
  guests INTEGER,
  message TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  outcome TEXT,                              -- booked | declined, set by you
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id INTEGER NOT NULL UNIQUE,
  client_name TEXT NOT NULL DEFAULT '',
  client_email TEXT NOT NULL DEFAULT '',
  client_phone TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT 'Wedding',
  event_date TEXT,
  venue TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL DEFAULT '[]',          -- JSON: [{label, amount}]
  discount REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  deposit_pct REAL NOT NULL DEFAULT 30,
  notes TEXT NOT NULL DEFAULT '',
  terms TEXT NOT NULL,
  cover_subject TEXT NOT NULL DEFAULT '',
  cover_body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',      -- draft | sent
  sent_at TEXT,
  sent_to TEXT,
  message_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Every charge on a bill or receipt you gave Opus (history). Recurring ones link to a subscription.
CREATE TABLE IF NOT EXISTS charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  charged TEXT,
  posted TEXT,
  subscription_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (name, amount, charged)
);

-- Your monthly budget: income, planned spending, planned saving. Fixed costs come from subscriptions and bills.
CREATE TABLE IF NOT EXISTS budget_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                        -- income | expense | saving
  name TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,            -- per month
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  target REAL NOT NULL DEFAULT 0,
  saved REAL NOT NULL DEFAULT 0,
  monthly REAL NOT NULL DEFAULT 0,           -- planned contribution per month
  due TEXT,
  created_at TEXT NOT NULL
);

-- What you actually set aside for a goal each month. "planned" is what the plan asked for that month.
CREATE TABLE IF NOT EXISTS goal_contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL,
  month TEXT NOT NULL,                       -- YYYY-MM
  planned REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (goal_id, month)
);

-- Things you told Opus about yourself, so it can use them next time. You can see and delete every one.
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'you',        -- you | chat
  created_at TEXT NOT NULL
);

-- Files Opus made, and files you attached in chat. The bytes live in data/files.
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                        -- extension: docx, xlsx, pdf, csv, ...
  size INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,                      -- opus | upload
  path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- A bank login you linked through Plaid. The access token is sealed (encrypted) before it is stored.
CREATE TABLE IF NOT EXISTS bank_items (
  id TEXT PRIMARY KEY,                       -- Plaid item id
  institution TEXT NOT NULL DEFAULT '',
  access_token TEXT NOT NULL,
  cursor TEXT,
  last_sync TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,                       -- Plaid account id
  item_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  mask TEXT NOT NULL DEFAULT '',             -- last 4 digits, as Plaid gives them
  type TEXT NOT NULL DEFAULT '',             -- credit | depository
  subtype TEXT NOT NULL DEFAULT '',
  tracked INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- Card transactions. amount > 0 is money out (a purchase), amount < 0 is money in (a refund or payment).
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,                        -- the day you made the purchase (YYYY-MM-DD)
  amount REAL NOT NULL,
  merchant TEXT NOT NULL,                    -- cleaned-up vendor name
  raw_name TEXT NOT NULL DEFAULT '',         -- exactly what the bank sent
  category TEXT NOT NULL DEFAULT 'Other',
  category_source TEXT NOT NULL DEFAULT 'rule',  -- you | rule | bank | ai
  pending INTEGER NOT NULL DEFAULT 0,
  plaid_category TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tx_date ON transactions (date);

-- "Always call this vendor that": learned from your edits (you) or guessed by Opus (ai).
CREATE TABLE IF NOT EXISTS merchant_rules (
  merchant_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'you',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

export const nowIso = () => new Date().toISOString();

export function all<T>(sql: string, ...params: (string | number | null)[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}
export function get<T>(sql: string, ...params: (string | number | null)[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}
export function run(sql: string, ...params: (string | number | null)[]) {
  return db.prepare(sql).run(...params);
}

export function kvGet(key: string): string | undefined {
  return get<{ value: string }>("SELECT value FROM kv WHERE key = ?", key)?.value;
}
export function kvSet(key: string, value: string) {
  run("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
}

export interface ActivityInput {
  kind: "tool" | "model" | "system";
  job: string;
  tool?: string;
  summary: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

/** Every action the agent takes goes through here. This is the audit trail. */
export function logActivity(a: ActivityInput) {
  run(
    `INSERT INTO activity (ts, kind, job, tool, summary, model, input_tokens, output_tokens, cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    nowIso(),
    a.kind,
    a.job,
    a.tool ?? null,
    a.summary,
    a.model ?? null,
    a.inputTokens ?? 0,
    a.outputTokens ?? 0,
    a.costUsd ?? 0,
  );
}
