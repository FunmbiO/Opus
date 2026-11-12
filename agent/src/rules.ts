import type { Category } from "./db.js";
import type { ThreadSummary } from "./gmail.js";

/**
 * Plain rules run before any model. Bulk mail is about 85% of an inbox like
 * yours, and sorting it with code costs nothing. Edit these lists freely.
 * Order matters: the first match wins.
 */
const RULES: { test: RegExp; category: Category; reason: string }[] = [
  // School first: its newsletters should not be filed as marketing.
  { test: /nbcc\.ca|brightspace|d2l\.com|desire2learn/i, category: "school", reason: "School sender" },
  // Marketing from companies that also send real receipts: must come first.
  { test: /insideapple\.apple\.com|news@|newsletter|marketing|offers@|promo|deals@|mailer|em\.walmart|e\.walmart/i, category: "junk", reason: "Marketing sender" },
  // Receipts and billing.
  { test: /email\.apple\.com|stripe\.com|googleplay-noreply|billing@|invoice\+|receipt|td\.com|paypal\.com|failed-payments/i, category: "bills", reason: "Receipt or billing sender" },
  // Government notices are important but need no reply here.
  { test: /\.gc\.ca|canada\.ca/i, category: "personal", reason: "Government notice. Read it yourself." },
  // Known bulk senders.
  {
    test: /linkedin\.com|facebookmail\.com|uber\.com|ihg\.com|westjet|snapchat|letterboxd|ebay|paperlesspost|bandsintown|primevideo|spotify|wix\.com|microsoftstore|topazlabs|actionvfx|vsco|mancity|chelseafc|tottenhamhotspur|shopifyemail|alert\.refer\.io|noreply|no-reply|notifications@|donotreply/i,
    category: "junk",
    reason: "Bulk or automated sender",
  },
];

export interface RuleResult {
  category: Category;
  needsReply: boolean;
  reason: string;
}

export function applyRules(t: ThreadSummary): RuleResult | null {
  const hay = `${t.sender} ${t.subject}`;
  for (const r of RULES) {
    if (r.test.test(hay)) return { category: r.category, needsReply: false, reason: r.reason };
  }
  return null; // looks like a person or something unclear: ask the model
}
