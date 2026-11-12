import type Anthropic from "@anthropic-ai/sdk";
import PDFDocument from "pdfkit";
import type { DraftArgs, Mailbox, ThreadFull, ThreadSummary } from "./gmail.js";
import type { LLM, LLMRequest, LLMResponse } from "./llm.js";

/**
 * Offline stand-ins so the whole system can run with no keys and no inbox.
 * `npm run demo` uses these. They are rule-based, so draft quality here says
 * nothing about how Claude will write. They exist to prove the plumbing.
 */

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const FIXTURES: ThreadFull[] = [
  {
    id: "mock-wedding",
    subject: "Photography for our June 2027 wedding?",
    sender: "Priya Nair <priya.nair@example.com>",
    date: hoursAgo(3),
    snippet: "Hi! We found you on Instagram and love your style. We are getting married June 19, 2027 in Halifax. Are you available, and what are your packages?",
    unread: true,
    viewUrl: "https://mail.google.com/mail/u/0/#all/mock-wedding",
    messages: [
      {
        from: "Priya Nair <priya.nair@example.com>",
        date: hoursAgo(3),
        body: "Hi! We found you on Instagram and love your style. We are getting married June 19, 2027 in Halifax, about 120 guests. Are you available, and what are your packages? Thanks, Priya",
      },
    ],
    attachments: [{ n: 1, filename: "Wedding-timeline.txt", mimeType: "text/plain", size: 120 }],
  },
  {
    id: "mock-apple",
    subject: "Your receipt from Apple",
    sender: "Apple <no_reply@email.apple.com>",
    date: hoursAgo(20),
    snippet: "Receipt October 2, 2026 Lightroom: AI Photo Editor Premium Monthly 100GB (Monthly) Renews October 23, 2026 $9.49",
    unread: true,
    viewUrl: "https://mail.google.com/mail/u/0/#all/mock-apple",
    messages: [{ from: "Apple <no_reply@email.apple.com>", date: hoursAgo(20), body: "Lightroom: AI Photo Editor Premium Monthly 100GB (Monthly) Renews October 23, 2026 $9.49" }],
  },
  {
    id: "mock-stripe",
    subject: "Your receipt from Mockly #2525-4518",
    sender: "Mockly <invoice+statements@stripe.com>",
    date: hoursAgo(26),
    snippet: "Receipt from Mockly $1.99 Paid on October 4, 2026. Mockly Weekly Oct 4-Oct 11, 2026. Questions? Contact us at support@example.com",
    unread: true,
    viewUrl: "https://mail.google.com/mail/u/0/#all/mock-stripe",
    messages: [{ from: "Mockly <invoice+statements@stripe.com>", date: hoursAgo(26), body: "Mockly Weekly Oct 4-Oct 11, 2026 $1.99. Questions? Contact us at support@example.com" }],
  },
  {
    id: "mock-linkedin",
    subject: "Software developer: 5 new jobs in Halifax",
    sender: "LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>",
    date: hoursAgo(5),
    snippet: "Junior developer at a Halifax company and 4 more jobs match your alert.",
    unread: true,
    viewUrl: "https://mail.google.com/mail/u/0/#all/mock-linkedin",
    messages: [{ from: "LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>", date: hoursAgo(5), body: "5 new jobs" }],
  },
  {
    id: "mock-nbcc",
    subject: "The Connection - NBCC's weekly student e-newsletter!",
    sender: "NBCC <nbcc@nbcc.ca>",
    date: hoursAgo(30),
    snippet: "Events and happenings this week at NBCC.",
    unread: true,
    viewUrl: "https://mail.google.com/mail/u/0/#all/mock-nbcc",
    messages: [{ from: "NBCC <nbcc@nbcc.ca>", date: hoursAgo(30), body: "Events and happenings" }],
  },
  {
    id: "mock-friend",
    subject: "Dinner on Sunday?",
    sender: "Sam Okafor <sam.okafor@example.com>",
    date: hoursAgo(8),
    snippet: "Are you free Sunday evening? Thinking of cooking at mine, around 6.",
    unread: true,
    viewUrl: "https://mail.google.com/mail/u/0/#all/mock-friend",
    messages: [{ from: "Sam Okafor <sam.okafor@example.com>", date: hoursAgo(8), body: "Are you free Sunday evening? Thinking of cooking at mine, around 6. Let me know!" }],
  },
];

/** A paystub-style email with a locked PDF (password 1234), so the unlock flow can be tried offline. Not part of the triage fixtures. */
const PAYROLL: ThreadFull = {
  id: "mock-payroll", subject: "Paystub", sender: "Payroll Department <payroll@example.com>", date: hoursAgo(30), snippet: "Your paystub is attached. The PDF password is your assigned 4-digit number.",
  unread: false, viewUrl: "https://mail.google.com/mail/u/0/#all/mock-payroll",
  messages: [{ from: "Payroll Department <payroll@example.com>", date: hoursAgo(30), body: "Your paystub is attached. The PDF password is your assigned 4-digit number." }],
  attachments: [{ n: 1, filename: "Paystub.pdf", mimeType: "application/pdf", size: 4000 }],
};

function lockedPdf(): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ userPassword: "1234", ownerPassword: "owner-secret", permissions: { printing: "highResolution" } });
    const chunks: Buffer[] = [];
    doc.on("data", (d: Buffer) => chunks.push(d));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.fontSize(14).text("Pay period ending Sept 23. Hours: 80. Gross pay: $2,400.00. Deductions: $410.00. Net pay: $1,990.00.");
    doc.end();
  });
}

const summary = ({ messages: _m, ...s }: ThreadFull): ThreadSummary => s;

export class MockMailbox implements Mailbox {
  private drafts = 0;
  async ownAddress() { return "me@example.com"; }
  async listUnreadInbox(max: number) {
    return FIXTURES.slice(0, max).map(summary);
  }
  async search(query: string, max: number) {
    const wantsReceipts = /receipt|invoice|renew|subscription|billing/i.test(query);
    const pool = wantsReceipts ? FIXTURES.filter((t) => /receipt/i.test(t.subject)) : FIXTURES;
    return pool.slice(0, max).map(summary);
  }
  async getThread(id: string) {
    const t = id === PAYROLL.id ? PAYROLL : id === "mock-payroll-2" ? { ...PAYROLL, id: "mock-payroll-2" } : FIXTURES.find((f) => f.id === id);
    if (!t) throw new Error(`No thread ${id}`);
    return t;
  }
  async readAttachment(threadId: string, n: number) {
    if ((threadId === PAYROLL.id || threadId === "mock-payroll-2") && n === 1) return { filename: "Paystub.pdf", mimeType: "application/pdf", data: await lockedPdf() };
    const a = FIXTURES.find((f) => f.id === threadId)?.attachments?.find((x) => x.n === n);
    if (!a) throw new Error(`There is no attachment number ${n} in this thread.`);
    return { filename: a.filename, mimeType: a.mimeType, data: Buffer.from("2:00 PM getting ready at the Delta\n4:30 PM ceremony at St. Bernard\n6:30 PM reception, 120 guests") };
  }
  async createDraft(args: DraftArgs) {
    this.drafts += 1;
    const draftId = `mock-draft-${this.drafts}`;
    return { draftId, viewUrl: `https://mail.google.com/mail/u/0/#drafts?compose=${draftId}` };
  }
}

// ---- Mock model -----------------------------------------------------------

let counter = 0;
const toolUse = (name: string, input: Record<string, unknown>) =>
  ({ type: "tool_use", id: `mock_${++counter}`, name, input }) as unknown as Anthropic.ContentBlock;
const text = (t: string) => ({ type: "text", text: t }) as unknown as Anthropic.ContentBlock;

const usageFor = (req: LLMRequest) => ({
  input_tokens: Math.ceil(JSON.stringify(req).length / 4),
  output_tokens: 120,
});

/** How many tool rounds have finished so far (one round can hold several tool calls). */
const toolRounds = (req: LLMRequest) =>
  req.messages.filter((m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result")).length;

const firstUserText = (req: LLMRequest) => {
  const m = req.messages[0];
  return typeof m?.content === "string" ? m.content : "";
};

export function mockLLM(): LLM {
  return {
    async create(req): Promise<LLMResponse> {
      const job = /\[job:(\w+)\]/.exec(req.system)?.[1] ?? "";
      const usage = usageFor(req);
      const turn = toolRounds(req);
      const done = (content: Anthropic.ContentBlock[], stop = "tool_use"): LLMResponse => ({ content, stop_reason: stop, usage });

      if (job === "categorize") {
        // Stand-in for Claude: a few obvious guesses, "Other" for the rest.
        const vendors = (JSON.parse(firstUserText(req)) as { vendors?: string[] }).vendors ?? [];
        return done([toolUse("record_categories", { items: vendors.map((v) => ({ merchant: v, category: /taqueria|kitchen|eatery|thai|ramen/i.test(v) ? "Dining" : "Other" })) })]);
      }

      if (job === "triage") {
        const p = firstUserText(req);
        const wedding = /wedding|engag|quote|booking|shoot|photograph|package/i.test(p);
        const personal = /dinner|are you free|let me know/i.test(p);
        const bills = /receipt|invoice|statement|payment/i.test(p);
        const school = /assignment|nbcc|course|professor|class/i.test(p);
        return done([
          toolUse("record_triage", {
            category: wedding ? "jaded" : personal ? "personal" : bills ? "bills" : school ? "school" : "junk",
            needs_reply: wedding || personal,
            reason: wedding ? "Prospective wedding client asking about availability and packages." : personal ? "A friend is waiting on an answer." : "No reply needed.",
          }),
        ]);
      }

      if (job === "draft") {
        const id = /Thread id: (\S+)/.exec(firstUserText(req))?.[1] ?? "";
        if (turn === 0) return done([toolUse("gmail_get_thread", { thread_id: id })]);
        if (turn === 1) {
          return done([
            toolUse("gmail_create_draft", {
              thread_id: id,
              body: "Hi,\n\nThanks so much for reaching out, and congratulations! I would love to hear more about your day.\n\n[CONFIRM: availability for the date]\n[CONFIRM: package options and pricing]\n\nWould a quick call this week work?\n\nAlex",
            }),
          ]);
        }
        return done([text("Draft saved for review.")], "end_turn");
      }

      if (job === "inquiry") {
        const first = firstUserText(req);
        const web = /Website form submission/.test(first);
        const results = req.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === "tool_result").map((b) => String((b as { content?: unknown }).content));
        const idFrom = (re: RegExp) => Number(results.map((r) => re.exec(r)?.[1]).find(Boolean));
        if (web) {
          const form = JSON.parse(first.slice(first.indexOf("{"))) as { inquiry_id: number; name: string; email: string; event_date?: string };
          if (turn === 0) return done([toolUse("create_contract", { inquiry_id: form.inquiry_id, package_id: "photo" })]);
          if (turn === 1) {
            return done([toolUse("gmail_create_draft", { to: form.email, subject: "Your wedding with Example Studio", body: `Hi ${form.name.split(" ")[0]},\n\nThank you for reaching out, and congratulations!\n\n[CONFIRM: availability for ${form.event_date ?? "your date"}]\n\nPhotography is $1,000.00. Would a quick call this week work?\n\nAlex` })]);
          }
          return done([text("Draft saved.")], "end_turn");
        }
        const tid = /Thread id: (\S+)/.exec(first)?.[1] ?? "";
        if (turn === 0) return done([toolUse("gmail_get_thread", { thread_id: tid })]);
        if (turn === 1) {
          return done([toolUse("record_inquiry", { thread_id: tid, name: "Priya Nair", event_date: "2027-06-19", venue: "Halifax", guests: 120, service: "photo", summary: "Couple marrying June 19, 2027 in Halifax with about 120 guests. Asking about availability and packages." })]);
        }
        if (turn === 2) return done([toolUse("create_contract", { inquiry_id: idFrom(/inquiry #(\d+)/), package_id: "photo" })]);
        if (turn === 3) {
          return done([toolUse("gmail_create_draft", { thread_id: tid, body: "Hi Priya,\n\nThank you so much for reaching out, and congratulations! A June 19, 2027 wedding in Halifax sounds wonderful.\n\n[CONFIRM: availability for June 19, 2027]\n\nPhotography is $1,000.00 for full-day coverage. Would a quick call this week work? I will send an agreement after we have spoken.\n\nAlex" })]);
        }
        return done([text("Inquiry recorded, contract draft and reply saved.")], "end_turn");
      }

      if (job === "subs") {
        if (turn === 0) return done([toolUse("gmail_search", { query: "receipt OR invoice OR renewal newer_than:120d", max_results: 10 })]);
        if (turn === 1) {
          return done([
            toolUse("save_subscription", { name: "Photo Editor Premium", plan: "Monthly", billing: "apple", amount: 9.49, cycle: "monthly", next_charge: "2026-10-23", verdict: "keep", reason: "Photo editing for Jaded Media." }),
            toolUse("save_subscription", { name: "Mockly Weekly", plan: "Weekly", billing: "stripe", amount: 1.99, cycle: "weekly", next_charge: "2026-10-11", verdict: "review", reason: "Weekly billing adds up to about $8.62 a month." }),
          ]);
        }
        if (turn === 2) {
          return done([toolUse("propose_action", { kind: "cancel", title: "Prepare cancellation: Mockly Weekly", reason: "About $8.62 a month with no clear use.", subscription_id: "mockly-weekly" })]);
        }
        return done([text("Scan finished.")], "end_turn");
      }

      if (job === "ask") {
        const q = firstUserText(req) || (typeof req.messages.at(-1)?.content === "string" ? (req.messages.at(-1)!.content as string) : "");
        const last = [...req.messages].reverse().find((m) => m.role === "user" && typeof m.content === "string");
        const msg = typeof last?.content === "string" ? last.content : q;
        if (/remember/i.test(msg)) {
          if (turn === 0) return done([toolUse("remember", { note: "Prefers PDFs for anything sent to clients" })]);
          return done([text("Noted. I'll remember you prefer PDFs for client documents.")], "end_turn");
        }
        if (/afford|what if/i.test(msg)) {
          if (turn === 0) return done([toolUse("finance_whatif", { target: 3000, due: "2027-06-01" })]);
          return done([text("I checked it against your budget. See the numbers above in the steps.")], "end_turn");
        }
        const fid = /file id (\d+)/i.exec(msg)?.[1];
        if (fid) {
          if (turn === 0) return done([toolUse("read_file", { file_id: Number(fid) })]);
          if (turn === 1) return done([toolUse("create_document", { type: "docx", title: "Summary of your file", content: "# Summary\nHere is what the file says.\n\n- Point one\n- Point two\n\n| Item | Value |\n|---|---|\n| Example | 42 |" })]);
          return done([text("I read your file and saved a summary as a new Word document. The original is untouched.")], "end_turn");
        }
        if (/budget|spreadsheet|excel/i.test(msg)) {
          if (turn === 0) return done([toolUse("finance_summary", {})]);
          if (turn === 1) return done([toolUse("create_document", { type: "xlsx", title: "Monthly budget", sheets: [{ name: "Budget", rows: [["Item", "Monthly"], ["Fido Mobile", 62.50], ["Total", "=SUM(B2:B2)"]] }] })]);
          return done([text("I built your budget spreadsheet from your current numbers. It is ready to download below.")], "end_turn");
        }
        if (/word doc|letter|memo/i.test(msg)) {
          if (turn === 0) return done([toolUse("create_document", { type: "docx", title: "Letter", content: "# Hello\nThis is a **mock** letter." })]);
          return done([text("Your Word document is ready to download below.")], "end_turn");
        }
        if (/paystub|payroll|unlocked/i.test(msg)) {
          if (turn === 0) return done([toolUse("gmail_get_thread", { thread_id: "mock-payroll" })]);
          if (turn === 1) return done([toolUse("gmail_read_attachment", { thread_id: "mock-payroll", number: 1 })]);
          const result = JSON.stringify(req.messages.at(-1)?.content ?? "");
          if (/PASSWORD_REQUIRED/.test(result)) return done([text("Your latest paystub is password protected. Type the password into the private box below (not into the chat) and I'll read it.")], "end_turn");
          return done([text("Net pay on the Sept 23 paystub is $1,990.00 for 80 hours (gross $2,400.00, deductions $410.00).")], "end_turn");
        }
        if (/attach/i.test(msg)) {
          if (turn === 0) return done([toolUse("gmail_get_thread", { thread_id: "mock-wedding" })]);
          if (turn === 1) return done([toolUse("gmail_read_attachment", { thread_id: "mock-wedding", number: 1 })]);
          return done([text("Priya's attachment is a wedding timeline: getting ready at 2:00 PM, ceremony 4:30 PM, reception 6:30 PM.")], "end_turn");
        }
        if (/reply|draft|respond/i.test(msg)) {
          if (turn === 0) return done([toolUse("gmail_search", { query: "wedding", max_results: 5 })]);
          if (turn === 1) return done([toolUse("gmail_get_thread", { thread_id: "mock-wedding" })]);
          if (turn === 2) return done([toolUse("gmail_create_draft", { thread_id: "mock-wedding", body: "Hi Priya,\n\nThank you for reaching out, and congratulations!\n\n[CONFIRM: availability for June 19, 2027]\n\nAlex" })]);
          return done([text("I saved a reply to Priya Nair in your Gmail drafts. It is not sent. Availability is left as a placeholder for you to confirm.")], "end_turn");
        }
        if (turn === 0) return done([toolUse("gmail_search", { query: msg.slice(0, 80), max_results: 5 })]);
        return done([text("Found a few matching emails in your inbox (mock mode). In live mode I would also search the web if you ask.")], "end_turn");
      }

      return done([text("Nothing to do.")], "end_turn");
    },
  };
}
