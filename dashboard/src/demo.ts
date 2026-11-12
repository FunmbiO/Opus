import audit from "../../shared/audit.json";
import defaults from "../../shared/jaded-defaults.json";
import { calcTotals } from "./format";
import type { Client, Contract, JadedSettings, Money, Pay, State, Sub, Approval, Alert } from "./types";

/**
 * Shown when the dashboard can't reach the agent (for example the standalone preview file).
 * Subscriptions, approvals and alerts are your real inbox audit. Drafts, activity,
 * the weekly chart and spend are SAMPLES and are labelled that way in the UI.
 */
const iso = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();
const ymd = (daysAhead: number) => new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);

function demoContract(id: number, name: string, email: string, date: string, venue: string, label: string, price: number, status: "draft" | "sent" = "draft"): Contract {
  const d = defaults as unknown as JadedSettings;
  const items = [{ label, amount: price }];
  return {
    id, inquiryId: id, clientName: name, clientEmail: email, clientPhone: "", eventType: "Wedding", eventDate: date, venue, items, discount: 0, taxRate: d.taxRate, depositPct: d.depositPct,
    notes: "", terms: d.terms, coverSubject: d.coverSubject, coverBody: d.coverBody.replace("{{first_name}}", name.split(" ")[0]!).replace("{{event_type}}", "wedding").replace("{{event_date}}", date).replace("{{sign_off}}", d.business.signer),
    status, sentAt: status === "sent" ? iso(30) : null, sentTo: status === "sent" ? email : null, updatedAt: iso(2), totals: calcTotals(items, 0, d.taxRate, d.depositPct), problems: status === "sent" ? [] : ["Fill in the placeholder in the terms: [CONFIRM: delivery timeline]"],
  };
}

function demoClients(): Client[] {
  return [
    {
      id: 1, source: "gmail", name: "Priya Nair", email: "priya.nair@example.com", phone: "", service: "photo", eventDate: ymd(260), venue: "Halifax", guests: 120,
      message: "Hi! We found you on Instagram and love your style. We are getting married in Halifax, about 120 guests. Are you available, and what are your packages? Thanks, Priya",
      summary: "Couple marrying in Halifax with about 120 guests, asking about availability and packages.", stage: "contract", createdAt: iso(3), threadUrl: null,
      draft: { id: 1, subject: "Re: Photography for our June 2027 wedding?", viewUrl: null, body: "Hi Priya,\n\nThank you so much for reaching out, and congratulations!\n\n[CONFIRM: availability for your date]\n\nPhotography is $1,000.00 for full-day coverage. Would a quick call this week work? I will send an agreement after we have spoken.\n\nAlex" },
      contract: demoContract(1, "Priya Nair", "priya.nair@example.com", ymd(260), "", "Wedding photography. Full-day coverage, getting ready through reception.", 1000),
    },
    {
      id: 2, source: "web", name: "Daniel & Amara Okoye", email: "amara.okoye@example.com", phone: "506-555-0142", service: "combo", eventDate: ymd(190), venue: "Crystal Palace, Halifax", guests: 80,
      message: "Looking for photo and video for our wedding. Small ceremony, big reception.", summary: "Wants photo and video for a small ceremony and larger reception.", stage: "replied", createdAt: iso(20), threadUrl: null,
      draft: { id: 2, subject: "Your wedding with Example Studio", viewUrl: null, body: "Hi Amara,\n\nThank you for reaching out, and congratulations!\n\n[CONFIRM: availability for your date]\n\nThe photo and video package is $1,900.00. Would a quick call this week work?\n\nAlex" },
      contract: null,
    },
    {
      id: 3, source: "gmail", name: "Chidi & Lola Eze", email: "lola.eze@example.com", phone: "", service: "video", eventDate: ymd(-40), venue: "Dieppe", guests: null,
      message: "", summary: "Videography booking.", stage: "booked", createdAt: iso(24 * 21), threadUrl: null, draft: null,
      contract: demoContract(3, "Chidi & Lola Eze", "lola.eze@example.com", ymd(-40), "Dieppe", "Wedding videography. Full-day coverage, getting ready through reception.", 1200, "sent"),
    },
  ];
}

export function demoState(): State {
  const now = new Date();
  const h = (n: number) => new Date(now.getTime() - n * 3_600_000).toISOString();
  const day = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString().slice(0, 10);
  const wk = [
    [1, 0, 3, 1, 9], [2, 1, 2, 0, 12], [0, 0, 4, 2, 8], [1, 0, 2, 1, 14], [3, 1, 3, 1, 11], [0, 0, 1, 0, 6], [2, 0, 2, 1, 10],
  ];
  return {
    now: now.toISOString(),
    mode: "demo",
    user: "Alex",
    spend: { monthUsd: 6.4, targetUsd: 22, alertUsd: 100, level: "ok" },
    today: { jaded: 2, school: 0, bills: 2, personal: 1, junk: 10 },
    week: wk.map((c, i) => ({ date: day(6 - i), jaded: c[0]!, school: c[1]!, bills: c[2]!, personal: c[3]!, junk: c[4]! })),
    drafts: [
      { id: 1, subject: "Photography for our June 2027 wedding?", sender: "Priya Nair", category: "jaded", viewUrl: null, createdAt: h(2),
        preview: "Hi Priya,\n\nThank you so much for reaching out, and congratulations! I'd love to hear more about your day.\n\n[CONFIRM: availability for June 19, 2027]\n[CONFIRM: package options and pricing]\n\nWould a quick call this week work?" },
      { id: 2, subject: "Dinner on Sunday?", sender: "Sam Okafor", category: "personal", viewUrl: null, createdAt: h(7),
        preview: "Hey Sam, Sunday works. Around 6 is perfect. Want me to bring dessert?\n\n[CONFIRM: that you're free Sunday evening]" },
    ],
    clients: demoClients(),
    finance: {
      income: 0, fixed: 290.9, planned: 0, saving: 0, left: -290.9, savingsRate: null, hasIncome: false, unpricedCount: 3,
      fixedItems: [
        { id: "mobile-phone", name: "Mobile phone", monthly: 62.50, removable: true }, { id: "claude", name: "Claude (Anthropic)", monthly: 32.2, removable: false },
        { id: "chatgpt-plus", name: "ChatGPT Plus", monthly: 24.99, removable: false }, { id: "apple-bill-11", name: "Apple.com/Bill (billed on the 11th)", monthly: 17.24, removable: true },
        { id: "apple-bill-26", name: "Apple.com/Bill (billed on the 26th)", monthly: 14.94, removable: true }, { id: "amazon-prime", name: "Amazon Prime", monthly: 11.49, removable: false },
      ],
      goalsVerdict: "none", perDay: 0, daysLeft: 20, upcoming: [], upcomingTotal: 0, month: now.toISOString().slice(0, 7),
      lines: [], goals: [],
      charges: [
        { id: 5, name: "Apple.com/Bill (billed on the 3rd)", amount: 10.91, charged: "2026-09-03", posted: "2026-09-04", subscriptionId: "apple-bill-3", note: "" },
        { id: 1, name: "Mobile phone", amount: 62.50, charged: "2026-08-29", posted: "2026-08-31", subscriptionId: "mobile-phone", note: "" },
      ],
    },
    money: demoMoney(),
    pay: demoPay(now),
    files: [],
    notes: [],
    backup: { lastAt: null, count: 0, folder: "data/backups" },
    security: { passwordSet: false, sessions: 0, lastLoginAt: null, encryption: "key-file" },
    jaded: defaults as unknown as JadedSettings,
    subscriptions: audit.subscriptions as Sub[],
    approvals: (audit.approvals as Partial<Approval>[]).map((a) => ({ status: "pending", ...a })) as Approval[],
    alerts: audit.alerts as Alert[],
    activity: [
      { id: 7, ts: h(0.2), kind: "triage", job: "triage", summary: "Sorted 14 new emails. 2 need a reply." },
      { id: 6, ts: h(2), kind: "draft", job: "draft", summary: "Drafted a reply to Priya Nair (wedding enquiry)" },
      { id: 5, ts: h(7), kind: "draft", job: "draft", summary: "Drafted a reply to Sam Okafor" },
      { id: 4, ts: h(26), kind: "subs", job: "subs", summary: "Weekly scan found 13 subscriptions, 3 worth a look" },
      { id: 3, ts: h(26), kind: "system", job: "seed", summary: `Loaded the ${audit.generatedAt} inbox audit` },
    ],
  };
}

/** Sample card spending for the preview. Clearly labelled as sample in the UI. */
function demoMoney(): Money {
  const day = (back: number) => { const d = new Date(Date.now() - back * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const v = "TD Cash Back Visa ••4821";
  const recent = [
    { id: "d1", date: day(0), merchant: "Tim Hortons", rawName: "TIM HORTONS #4521 HALIFAX NS", amount: 4.37, category: "Dining", source: "rule" as const, pending: true, account: v },
    { id: "d2", date: day(1), merchant: "Esso", rawName: "ESSO 1873 DIEPPE NB", amount: 58.4, category: "Gas", source: "rule" as const, pending: false, account: v },
    { id: "d3", date: day(1), merchant: "Marcos Taqueria", rawName: "SQ *MARCOS TAQUERIA", amount: 24.5, category: "Dining", source: "ai" as const, pending: false, account: v },
    { id: "d4", date: day(2), merchant: "Sobeys", rawName: "SOBEYS 0129 HALIFAX NS", amount: 87.22, category: "Groceries", source: "rule" as const, pending: false, account: v },
    { id: "d5", date: day(2), merchant: "Apple.com/Bill", rawName: "APPLE.COM/BILL", amount: 14.94, category: "Subscriptions", source: "rule" as const, pending: false, account: v },
    { id: "d6", date: day(3), merchant: "Visa payment", rawName: "PAYMENT - THANK YOU", amount: -300, category: "Transfers", source: "rule" as const, pending: false, account: v },
  ];
  return {
    configured: true, env: "sandbox",
    accounts: [
      { id: "a1", itemId: "i1", name: "TD Cash Back Visa", mask: "4821", type: "credit", tracked: true, institution: "TD Canada Trust" },
      { id: "a2", itemId: "i1", name: "TD Every Day Chequing", mask: "0377", type: "depository", tracked: true, institution: "TD Canada Trust" },
    ],
    items: [{ id: "i1", institution: "TD Canada Trust", lastSync: new Date(Date.now() - 240_000).toISOString(), error: null, loading: false }],
    today: { date: day(0), spent: 4.37, count: 1 },
    month: { key: day(0).slice(0, 7), spent: 189.43, count: 5, fixedSpent: 14.94 },
    categories: [
      { category: "Groceries", amount: 87.22, lineId: null, fixed: false }, { category: "Gas", amount: 58.4, lineId: null, fixed: false },
      { category: "Dining", amount: 28.87, lineId: null, fixed: false }, { category: "Subscriptions", amount: 14.94, lineId: null, fixed: true },
    ],
    lines: [], pace: null,
    days: Array.from({ length: 14 }, (_, i) => ({ date: day(13 - i), amount: [0, 22, 0, 41, 18, 0, 9, 63, 0, 14.94, 111.72, 82.9, 4.37, 0][i]! })),
    recent,
    categoryList: ["Groceries", "Dining", "Gas", "Transport", "Shopping", "Subscriptions", "Bills & utilities", "Health", "Entertainment", "Travel", "Example Studio", "Fees", "Transfers", "Income", "Other"],
  };
}

/** Sample pay clock, every other Thursday, so the Payday card has something to show in the preview. */
function demoPay(now: Date): Pay {
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const at = (n: number) => ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
  const month = ymd(now).slice(0, 7);
  const next = at(9), last = at(-5), mid = at(23);
  const mine = (d: string) => d.startsWith(month);
  const dates = [last, next, mid].filter(mine).map((date) => ({ date, passed: date <= ymd(now), received: date === last ? 1200 : null }));
  return {
    configured: true, schedule: { anchor: last, everyDays: 14, source: "you" }, amount: 1200, amountFixed: false,
    next: { date: next, days: 9, today: false }, last,
    month: { key: month, count: dates.length, dates, expected: dates.length * 1200, received: dates.reduce((n, d) => n + (d.received ?? 0), 0), extra: dates.length >= 3, stillToCome: dates.filter((d) => !d.passed).length },
    late: null,
    outlook: [0, 1, 2, 3].map((i) => { const d = new Date(now.getFullYear(), now.getMonth() + i, 1); const m = ymd(d).slice(0, 7); return { month: m, paydays: [`${m}-05`, `${m}-19`], count: 2, total: 2400, extra: false }; }),
    extraMonth: null, until: null, monthEnd: null,
  };
}
