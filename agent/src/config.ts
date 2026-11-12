import { openString } from "./crypto.js";

// Secrets in .env can be sealed (enc1:...) with `npm run protect`. Plain values still work.
const secret = (k: string) => { try { return openString(process.env[k]); } catch (e) { console.error(`Could not open ${k} from .env:`, e instanceof Error ? e.message : e); return ""; } };

const num = (key: string, fallback: number) => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && process.env[key] !== undefined && process.env[key] !== "" ? v : fallback;
};

// Works on every OS: `--mock` on the command line, or the demo command, or MOCK=1 in .env.
const mock = process.env.MOCK === "1" || process.argv.includes("--mock") || process.argv[2] === "demo";

export const config = {
  mock,
  anthropicKey: secret("ANTHROPIC_API_KEY"),

  // Model tiers. Haiku sorts mail, Sonnet writes drafts and reasons about subscriptions.
  models: {
    triage: process.env.TRIAGE_MODEL ?? "claude-haiku-4-5-20251001",
    draft: process.env.DRAFT_MODEL ?? "claude-sonnet-5-5",
    scan: process.env.SCAN_MODEL ?? "claude-sonnet-5-5",
  },

  // Money guard. Prices are USD, same as the API bill.
  budget: {
    targetUsd: num("MONTHLY_TARGET_USD", 22), // where you want to land
    alertUsd: num("ALERT_USD", 100), // loud alert at this amount
    hardStopUsd: num("HARD_STOP_USD", 100), // jobs refuse to start at or above this
    maxRunUsd: num("MAX_RUN_USD", 0.25), // one job may not spend more than this
  },

  dbPath: process.env.DB_PATH ?? (mock ? "data/mock.db" : "data/aide.db"),

  server: {
    host: process.env.HOST ?? "127.0.0.1",
    port: num("PORT", 8787),
    token: secret("API_TOKEN"),
  },

  telegram: {
    botToken: secret("TELEGRAM_BOT_TOKEN"),
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: secret("GOOGLE_CLIENT_SECRET"),
    refreshToken: secret("GOOGLE_REFRESH_TOKEN"),
  },

  // Bank sync through Plaid. Read only: Opus can see transactions and can never move money.
  plaid: {
    clientId: process.env.PLAID_CLIENT_ID ?? "",
    secret: secret("PLAID_SECRET"),
    env: (process.env.PLAID_ENV === "production" ? "production" : "sandbox") as "production" | "sandbox",
    host: process.env.PLAID_HOST ?? "", // for testing against a stand-in; leave empty
    redirectUri: process.env.PLAID_REDIRECT_URI ?? "", // only needed for banks that sign you in on their own site (OAuth)
    syncEveryMin: num("BANK_SYNC_MIN", 10),
    alertOver: num("BANK_ALERT_OVER", 200), // phone alert for a new charge of at least this much (0 turns it off)
  },

  // How many unread threads one triage run looks at.
  triageBatch: num("TRIAGE_BATCH", 40),
  styleGuidePath: process.env.STYLE_GUIDE ?? "style.md",
};
