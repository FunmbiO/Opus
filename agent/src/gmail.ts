import { google, type gmail_v1 } from "googleapis";
import { cleanHeader, cleanRecipients, encodeHeader, firstAddress, safeCopied } from "./mailsafe.js";
import { config } from "./config.js";
import { MAX_BYTES } from "./attachments.js";
import { MockMailbox } from "./mock.js";
import { getSettings } from "./contracts.js";

export interface ThreadSummary {
  id: string;
  subject: string;
  sender: string;
  date: string; // ISO
  snippet: string;
  unread: boolean;
  viewUrl: string;
}

export interface AttachmentInfo {
  n: number; // 1-based position in the thread, used to ask for it
  filename: string;
  mimeType: string;
  size: number;
}

export interface ThreadFull extends ThreadSummary {
  messages: { from: string; date: string; body: string }[];
  attachments?: AttachmentInfo[];
}

export interface DraftArgs {
  threadId?: string; // reply inside this thread
  to?: string; // or start a new message
  subject?: string;
  body: string;
  /** Leave the To field empty for you to fill in, instead of guessing from the thread. */
  blankTo?: boolean;
}

/**
 * The mailbox surface the agent is allowed to touch. Notice what is missing:
 * there is no send, delete, archive or label method. They do not exist here,
 * so nothing built on top of this interface can do those things.
 */
export interface Mailbox {
  listUnreadInbox(max: number): Promise<ThreadSummary[]>;
  search(query: string, max: number): Promise<ThreadSummary[]>;
  getThread(id: string): Promise<ThreadFull>;
  createDraft(args: DraftArgs): Promise<{ draftId: string; viewUrl: string }>;
  /** The address of the mailbox itself, so Opus never mistakes it for a client. */
  ownAddress(): Promise<string>;
  /** Downloads one attachment so it can be read. Read only. */
  readAttachment(threadId: string, n: number): Promise<{ filename: string; mimeType: string; data: Buffer }>;
}

export function makeMailbox(): Mailbox {
  return config.mock ? new MockMailbox() : new GmailMailbox();
}

const header = (msg: gmail_v1.Schema$Message | undefined, name: string) =>
  msg?.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

const threadUrl = (id: string) => `https://mail.google.com/mail/u/0/#all/${id}`;

function decode(data: string | null | undefined): string {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface RawAttachment { info: AttachmentInfo; messageId: string; attachmentId: string }

/** Real attachments in a thread, oldest first. Tiny inline images (logos, tracking pixels) are skipped. */
function collectAttachments(msgs: gmail_v1.Schema$Message[]): RawAttachment[] {
  const out: RawAttachment[] = [];
  for (const m of msgs) {
    const walk = (p: gmail_v1.Schema$MessagePart) => {
      const size = p.body?.size ?? 0;
      const tinyInline = (p.mimeType ?? "").startsWith("image/") && size < 20_000;
      if (p.filename && p.body?.attachmentId && !tinyInline) {
        out.push({ messageId: m.id ?? "", attachmentId: p.body.attachmentId, info: { n: out.length + 1, filename: p.filename, mimeType: p.mimeType ?? "", size } });
      }
      p.parts?.forEach(walk);
    };
    if (m.payload) walk(m.payload);
  }
  return out;
}

function bodyText(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return "";
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (p: gmail_v1.Schema$MessagePart) => {
    if (p.mimeType === "text/plain" && p.body?.data) plain.push(decode(p.body.data));
    else if (p.mimeType === "text/html" && p.body?.data) html.push(decode(p.body.data));
    p.parts?.forEach(walk);
  };
  walk(part);
  return (plain.join("\n") || htmlToText(html.join("\n"))).trim();
}

/** Drop quoted replies and cap length so one long thread cannot blow the budget. */
function trimBody(text: string, max = 4000): string {
  const cut = text.split(/\n(?:On .{10,80} wrote:|-{2,} ?Forwarded message|From: .+\nSent: )/)[0] ?? text;
  return cut.length > max ? `${cut.slice(0, max)}\n[trimmed]` : cut;
}

/** One authenticated Gmail client. Shared by the mailbox below and by send.ts. */
export function gmailClient(): gmail_v1.Gmail {
  const { clientId, clientSecret, refreshToken } = config.google;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google credentials are missing. Run `npm run auth` and fill in .env, or run the :mock commands.");
  }
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth });
}

class GmailMailbox implements Mailbox {
  private gmail: gmail_v1.Gmail;
  private me: string | undefined;

  constructor() {
    this.gmail = gmailClient();
  }

  ownAddress() { return this.myAddress(); }

  private async myAddress(): Promise<string> {
    if (!this.me) {
      const p = await this.gmail.users.getProfile({ userId: "me" });
      this.me = (p.data.emailAddress ?? "").toLowerCase();
    }
    return this.me;
  }

  private async summarize(id: string): Promise<ThreadSummary> {
    const t = await this.gmail.users.threads.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });
    const msgs = t.data.messages ?? [];
    const last = msgs[msgs.length - 1];
    const first = msgs[0];
    return {
      id,
      subject: header(first, "Subject") || "(no subject)",
      sender: header(last, "From"),
      date: new Date(Number(last?.internalDate ?? Date.now())).toISOString(),
      snippet: last?.snippet ?? "",
      unread: msgs.some((m) => m.labelIds?.includes("UNREAD")),
      viewUrl: threadUrl(id),
    };
  }

  async search(query: string, max: number): Promise<ThreadSummary[]> {
    const list = await this.gmail.users.threads.list({ userId: "me", q: query, maxResults: Math.min(max, 50) });
    const ids = (list.data.threads ?? []).map((t) => t.id!).filter(Boolean);
    return Promise.all(ids.map((id) => this.summarize(id)));
  }

  listUnreadInbox(max: number) {
    return this.search("in:inbox is:unread newer_than:3d", max);
  }

  async getThread(id: string): Promise<ThreadFull> {
    const t = await this.gmail.users.threads.get({ userId: "me", id, format: "full" });
    const msgs = t.data.messages ?? [];
    const summary = await this.summarize(id);
    return {
      ...summary,
      attachments: collectAttachments(msgs).map((a) => a.info),
      messages: msgs.slice(-6).map((m) => ({
        from: header(m, "From"),
        date: new Date(Number(m.internalDate ?? 0)).toISOString(),
        body: trimBody(bodyText(m.payload)),
      })),
    };
  }

  async readAttachment(threadId: string, n: number) {
    const t = await this.gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
    const found = collectAttachments(t.data.messages ?? []).find((a) => a.info.n === n);
    if (!found) throw new Error(`There is no attachment number ${n} in this thread.`);
    if (found.info.size > MAX_BYTES) throw new Error(`${found.info.filename} is ${(found.info.size / 1048576).toFixed(1)} MB, which is too large to open.`);
    const res = await this.gmail.users.messages.attachments.get({ userId: "me", messageId: found.messageId, id: found.attachmentId });
    return { filename: found.info.filename, mimeType: found.info.mimeType, data: Buffer.from(res.data.data ?? "", "base64url") };
  }

  /** Creates a draft in Gmail. It is never sent from here. */
  async createDraft({ threadId, to, subject, body, blankTo }: DraftArgs) {
    let toAddr = to ?? "";
    let subj = subject ?? "";
    const extra: string[] = [];

    if (threadId) {
      const t = await this.gmail.users.threads.get({ userId: "me", id: threadId, format: "metadata", metadataHeaders: ["From", "To", "Reply-To", "Subject", "Message-ID", "References"] });
      const msgs = t.data.messages ?? [];
      const me = await this.myAddress();
      const lastFromOther = [...msgs].reverse().find((m) => !header(m, "From").toLowerCase().includes(me));
      const target = lastFromOther ?? msgs[msgs.length - 1];
      // An explicit recipient wins. Website-form notifications come from your own address,
      // so replying to "the sender" would send the draft back to you instead of the client.
      toAddr = to ? cleanRecipients(to) : (blankTo ? "" : firstAddress(header(target, "Reply-To") || header(target, "From")));
      const base = header(msgs[0], "Subject");
      subj = /^re:/i.test(base) ? base : `Re: ${base}`;
      const msgId = safeCopied(header(msgs[msgs.length - 1], "Message-ID"));
      if (msgId) {
        extra.push(`In-Reply-To: ${msgId}`);
        extra.push(`References: ${[safeCopied(header(msgs[msgs.length - 1], "References")), msgId].filter(Boolean).join(" ")}`);
      }
    }
    if (!threadId && toAddr) toAddr = cleanRecipients(toAddr);
    if ((!toAddr && !blankTo) || !subj) throw new Error("A new draft needs both a recipient and a subject.");
    subj = cleanHeader(subj, "Subject", 300);

    // Draft as your business address. Gmail honours it when it is set up under "Send mail as".
    const biz = getSettings().business;
    const from = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(biz.email) ? [`From: ${encodeHeader(biz.name)} <${biz.email}>`] : [];
    const raw = [
      ...from,
      `To: ${toAddr}`,
      `Subject: ${encodeHeader(subj)}`,
      ...extra,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      body,
    ].join("\r\n");

    const res = await this.gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw: Buffer.from(raw).toString("base64url"), threadId } },
    });
    const msgId = res.data.message?.id ?? "";
    return { draftId: res.data.id ?? "", viewUrl: `https://mail.google.com/mail/u/0/#drafts?compose=${msgId}` };
  }
}
