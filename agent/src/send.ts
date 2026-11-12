import { config } from "./config.js";
import { buildPdf, getContract, getSettings, problems, type Contract } from "./contracts.js";
import { get, logActivity, nowIso, run } from "./db.js";
import { gmailClient } from "./gmail.js";
import { notify } from "./notify.js";

/**
 * THE ONLY PLACE OPUS CAN SEND EMAIL.
 *
 * - Not a model tool: nothing the model can call reaches this file.
 * - Only server.ts imports it, and only from the "Approve and send" route
 *   that you trigger by hand in the dashboard. `npm run safety` enforces both.
 * - It sends one thing: the saved contract PDF plus its cover note, to the
 *   address on the contract, exactly as it was when you approved it.
 */

export class SendRefused extends Error {
  constructor(message: string, public problems: string[] = []) {
    super(message);
  }
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const wrap = (s: string) => s.replace(/(.{76})/g, "$1\r\n");
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const safeName = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "Client";

function fillCover(c: Contract) {
  const s = getSettings();
  return { subject: c.coverSubject, body: c.coverBody, signer: s.business.name };
}

export interface Approval {
  contractId: number;
  /** Must equal the address on the contract, so a stale screen cannot send to the wrong person. */
  to: string;
  /** The contract version you were looking at. If it changed since, nothing is sent. */
  version: string;
}

export async function sendContract(a: Approval): Promise<{ messageId: string }> {
  const c = getContract(a.contractId);
  if (!c) throw new SendRefused("No such contract.");
  if (c.status === "sent") throw new SendRefused(`This contract was already sent on ${c.sentAt?.slice(0, 10)}.`);
  if (c.updatedAt !== a.version) throw new SendRefused("The contract changed after you opened it. Review it again, then approve.");
  if (c.clientEmail.trim().toLowerCase() !== a.to.trim().toLowerCase()) throw new SendRefused("The recipient does not match the contract.");
  const issues = problems(c);
  if (issues.length) throw new SendRefused("The contract is not ready to send.", issues);

  const pdf = await buildPdf(c);
  const { subject: coverSubject, body } = fillCover(c);
  const inq = get<{ thread_id: string | null }>("SELECT thread_id FROM inquiries WHERE id = ?", c.inquiryId);

  let messageId = `mock-${Date.now()}`;
  if (config.mock) {
    console.log(`[mock] Would send "${coverSubject}" to ${c.clientEmail} with a ${pdf.length} byte PDF. Nothing was sent.`);
  } else {
    const gmail = gmailClient();
    let subject = coverSubject;
    const extra: string[] = [];
    let threadId: string | undefined;

    // Reply inside the original conversation when there is one.
    if (inq?.thread_id) {
      try {
        const t = await gmail.users.threads.get({ userId: "me", id: inq.thread_id, format: "metadata", metadataHeaders: ["Subject", "Message-ID", "References"] });
        const msgs = t.data.messages ?? [];
        const hdr = (m: (typeof msgs)[number] | undefined, n: string) => m?.payload?.headers?.find((h) => h.name?.toLowerCase() === n.toLowerCase())?.value ?? "";
        const base = hdr(msgs[0], "Subject");
        const last = msgs[msgs.length - 1];
        const id = hdr(last, "Message-ID");
        if (base) subject = /^re:/i.test(base) ? base : `Re: ${base}`;
        if (id) extra.push(`In-Reply-To: ${id}`, `References: ${[hdr(last, "References"), id].filter(Boolean).join(" ")}`);
        threadId = inq.thread_id;
      } catch {
        // Fall back to a new conversation.
      }
    }

    const boundary = `opus_${Date.now().toString(36)}`;
    const filename = `${safeName(getSettings().business.name)}-Agreement-${safeName(c.clientName)}.pdf`;
    // Send as your business address. Gmail only honours this if it is set up under
    // Settings > Accounts > "Send mail as"; otherwise it quietly uses your own address.
    const biz = getSettings().business;
    const from = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(biz.email) ? [`From: ${encodeHeader(biz.name)} <${biz.email}>`, `Reply-To: ${biz.email}`] : [];
    const raw = [
      ...from,
      `To: ${c.clientEmail.trim()}`,
      `Subject: ${encodeHeader(subject)}`,
      ...extra,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrap(b64(body)),
      `--${boundary}`,
      `Content-Type: application/pdf; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      wrap(pdf.toString("base64")),
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw: Buffer.from(raw).toString("base64url"), threadId } });
    messageId = res.data.id ?? messageId;
  }

  const now = nowIso();
  run("UPDATE contracts SET status = 'sent', sent_at = ?, sent_to = ?, message_id = ? WHERE id = ?", now, c.clientEmail.trim(), messageId, c.id);
  logActivity({ kind: "system", job: "contracts", summary: `You approved and sent the contract to ${c.clientName} (${c.clientEmail.trim()})${config.mock ? " [mock, not really sent]" : ""}` });
  await notify(`Contract sent to ${c.clientName}.`);
  return { messageId };
}
