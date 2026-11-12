import { seedJson } from "./seedfile.js";
import PDFDocument from "pdfkit";
import { get, kvGet, kvSet, nowIso, run } from "./db.js";

/**
 * Pricing, contract terms and the PDF. Prices only ever come from the
 * settings table below, which you edit in the dashboard. The model never
 * types a price: it can only pick a package by id.
 */

export interface Pkg { id: string; name: string; price: number; description: string }
export interface Item { label: string; amount: number }

export interface Settings {
  business: { name: string; email: string; phone: string; location: string; signer: string };
  taxLabel: string;
  taxRate: number; // percent, 0 if you do not charge HST
  depositPct: number;
  packages: Pkg[];
  terms: string;
  coverSubject: string;
  coverBody: string;
}

export const DEFAULT_TERMS = `## 1. Services
{{business}} (the "Provider") will provide the services listed above for {{client}} (the "Client") for the {{event_type}} on {{date}} at {{venue}}.

## 2. Fees and payment
The total fee is {{total}}. A non-refundable retainer of {{deposit}} is due when this agreement is signed and reserves the date. The remaining balance of {{balance}} is due 14 days before the event. The date is not held until the signed agreement and the retainer have been received.

## 3. Coverage
Coverage is as described in the package above. Start and end times are agreed in writing before the event. Extra time is subject to the Provider's availability and an additional fee agreed in writing beforehand.

## 4. Cancellation and rescheduling
The retainer is not refunded if the Client cancels. If the Client cancels fewer than 30 days before the event, the full fee is due. The Client may reschedule once, subject to the Provider's availability, and the retainer carries over to the new date.

## 5. Delivery
The edited photos and video will be delivered through an online gallery or download link within [CONFIRM: delivery timeline]. The Provider keeps the raw files.

## 6. Copyright and usage
The Provider keeps the copyright in all photos and video. The Client receives a personal, non-commercial licence to print, share and post them. The Provider may use selected work in its portfolio and marketing unless the Client asks in writing not to.

## 7. If something goes wrong
If the Provider cannot attend because of illness, an emergency or circumstances beyond its control, it will make reasonable efforts to arrange a replacement of similar quality. If it cannot, its liability is limited to a refund of the amounts paid. The Provider is not responsible for events outside its control, including weather, venue restrictions, or guests who do not cooperate.

## 8. Governing law
This agreement is governed by the laws of the Province of New Brunswick and the federal laws of Canada that apply there.

## 9. Agreement
This is the entire agreement between the parties. Changes must be in writing and signed by both. By signing below, both parties agree to these terms.`;

export const DEFAULT_COVER_BODY = `Hi {{first_name}},

Thanks again for chatting. As discussed, I've attached the agreement for your {{event_type}} on {{event_date}}.

Please read it through, sign it, and send it back to me along with the retainer to lock in the date. If anything needs to change, just tell me and I'll update it.

Looking forward to being part of your day.

{{sign_off}}`;

export function defaultSettings(): Settings {
  // Your own values come from seed/business.json (not committed). Without it, the example template is used.
  const mine = seedJson<Partial<Settings>>("business", {});
  const base: Settings = {
    business: { name: "Your Business", email: "hello@example.com", phone: "", location: "", signer: "Your Name" },
    taxLabel: "HST",
    taxRate: 0,
    depositPct: 30,
    packages: [{ id: "package-1", name: "Package", price: 1000, description: "What is included." }],
    terms: DEFAULT_TERMS,
    coverSubject: "Your agreement",
    coverBody: DEFAULT_COVER_BODY,
  };
  return { ...base, ...mine, business: { ...base.business, ...(mine.business ?? {}) }, packages: mine.packages?.length ? mine.packages : base.packages };
}

export function getSettings(): Settings {
  const d = defaultSettings();
  try {
    const saved = JSON.parse(kvGet("jaded-settings") ?? "{}") as Partial<Settings>;
    const business = { ...d.business, ...(saved.business ?? {}) };
    return { ...d, ...saved, business, packages: saved.packages?.length ? saved.packages : d.packages };
  } catch {
    return d;
  }
}

const num = (v: unknown, fallback = 0, min = 0, max = 1_000_000) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback);
const text = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.slice(0, max) : fallback);

export function saveSettings(input: Record<string, unknown>): Settings {
  const cur = getSettings();
  const b = (input.business ?? {}) as Record<string, unknown>;
  const pk = Array.isArray(input.packages) ? input.packages : cur.packages;
  const next: Settings = {
    business: {
      name: text(b.name, 80, cur.business.name) || cur.business.name,
      email: text(b.email, 120, cur.business.email),
      phone: text(b.phone, 40, cur.business.phone),
      location: text(b.location, 80, cur.business.location),
      signer: text(b.signer, 60, cur.business.signer),
    },
    taxLabel: text(input.taxLabel, 12, cur.taxLabel),
    taxRate: num(input.taxRate, cur.taxRate, 0, 30),
    depositPct: num(input.depositPct, cur.depositPct, 0, 100),
    packages: (pk as Record<string, unknown>[]).slice(0, 12).map((p, i) => ({
      id: text(p.id, 32) || `pkg-${i + 1}`,
      name: text(p.name, 80, "Package"),
      price: num(p.price, 0, 0, 100_000),
      description: text(p.description, 300),
    })),
    terms: text(input.terms, 20_000, cur.terms),
    coverSubject: text(input.coverSubject, 150, cur.coverSubject),
    coverBody: text(input.coverBody, 4000, cur.coverBody),
  };
  kvSet("jaded-settings", JSON.stringify(next));
  return next;
}

// ---- Maths and text -------------------------------------------------------

const r2 = (n: number) => Math.round(n * 100) / 100;

export function totals(items: Item[], discount: number, taxRate: number, depositPct: number) {
  const subtotal = r2(items.reduce((a, i) => a + i.amount, 0));
  const disc = Math.min(r2(discount), subtotal);
  const taxable = subtotal - disc;
  const tax = r2((taxable * taxRate) / 100);
  const total = r2(taxable + tax);
  const deposit = r2((total * depositPct) / 100);
  return { subtotal, discount: disc, tax, total, deposit, balance: r2(total - deposit) };
}

export const money = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const longDate = (d: string | null) => {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
};

export interface Contract {
  id: number; inquiryId: number;
  clientName: string; clientEmail: string; clientPhone: string;
  eventType: string; eventDate: string | null; venue: string;
  items: Item[]; discount: number; taxRate: number; depositPct: number;
  notes: string; terms: string; coverSubject: string; coverBody: string;
  status: "draft" | "sent"; sentAt: string | null; sentTo: string | null; updatedAt: string;
}

interface Row {
  id: number; inquiry_id: number; client_name: string; client_email: string; client_phone: string; event_type: string;
  event_date: string | null; venue: string; items: string; discount: number; tax_rate: number; deposit_pct: number;
  notes: string; terms: string; cover_subject: string; cover_body: string; status: string;
  sent_at: string | null; sent_to: string | null; updated_at: string;
}

export function rowToContract(r: Row): Contract {
  let items: Item[] = [];
  try { items = (JSON.parse(r.items) as Item[]).map((i) => ({ label: String(i.label), amount: Number(i.amount) || 0 })); } catch { /* empty */ }
  return {
    id: r.id, inquiryId: r.inquiry_id, clientName: r.client_name, clientEmail: r.client_email, clientPhone: r.client_phone,
    eventType: r.event_type, eventDate: r.event_date, venue: r.venue, items, discount: r.discount, taxRate: r.tax_rate,
    depositPct: r.deposit_pct, notes: r.notes, terms: r.terms, coverSubject: r.cover_subject, coverBody: r.cover_body,
    status: r.status === "sent" ? "sent" : "draft", sentAt: r.sent_at, sentTo: r.sent_to, updatedAt: r.updated_at,
  };
}

export function getContract(id: number): Contract | undefined {
  const r = get<Row>("SELECT * FROM contracts WHERE id = ?", id);
  return r ? rowToContract(r) : undefined;
}

export const contractTotals = (c: Contract) => totals(c.items, c.discount, c.taxRate, c.depositPct);

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k]! : m));
}

export function varsFor(c: Contract, s: Settings): Record<string, string> {
  const t = contractTotals(c);
  return {
    business: s.business.name, client: c.clientName || "the Client", first_name: (c.clientName.split(/\s+/)[0] ?? "").trim() || "there",
    event_type: c.eventType.toLowerCase(), date: longDate(c.eventDate), event_date: longDate(c.eventDate), venue: c.venue,
    total: money(t.total), deposit: money(t.deposit), balance: money(t.balance), sign_off: s.business.signer, provider_email: s.business.email,
  };
}

const PLACEHOLDER = /\[CONFIRM[^\]]*\]|\[[A-Z ]{3,}:[^\]]*\]|\{\{[^}]*\}\}/;
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** Everything that must be fixed before this contract may be sent. */
export function problems(c: Contract, s = getSettings()): string[] {
  const out: string[] = [];
  const v = varsFor(c, s);
  if (!c.clientName.trim()) out.push("Add the client's name.");
  if (!EMAIL.test(c.clientEmail.trim())) out.push("The client's email address is missing or invalid.");
  else if (c.clientEmail.trim().toLowerCase().endsWith(`@${s.business.email.toLowerCase().split("@")[1] ?? "-"}`)) out.push("The client's email is your own address. Enter the client's email.");
  if (!c.eventDate) out.push("Add the event date.");
  if (!c.venue.trim()) out.push("Add the venue.");
  if (!c.items.length || contractTotals(c).total <= 0) out.push("Add at least one line item with a price.");
  if (c.items.some((i) => !i.label.trim())) out.push("Every line item needs a description.");
  const fields: [string, string][] = [
    ["terms", fill(c.terms, v)], ["cover email", fill(c.coverBody, v)], ["email subject", fill(c.coverSubject, v)],
    ["notes", c.notes], ["venue", c.venue], ["line items", c.items.map((i) => i.label).join(" ")],
  ];
  for (const [name, body] of fields) {
    const m = PLACEHOLDER.exec(body);
    if (m) out.push(`Fill in the placeholder in the ${name}: ${m[0].slice(0, 60)}`);
  }
  if (!c.coverSubject.trim()) out.push("Add an email subject.");
  return out;
}

/** Builds a new contract from the price list. Prices come from settings only. */
export function createContract(inquiryId: number, packageId: string, notes = ""): number {
  const existing = get<{ id: number }>("SELECT id FROM contracts WHERE inquiry_id = ?", inquiryId);
  if (existing) return existing.id;
  const inq = get<{ name: string; email: string; phone: string; event_date: string | null; venue: string }>("SELECT * FROM inquiries WHERE id = ?", inquiryId);
  if (!inq) throw new Error(`No inquiry #${inquiryId}`);
  const s = getSettings();
  const pkg = s.packages.find((p) => p.id === packageId);
  if (!pkg) throw new Error(`Unknown package "${packageId}". Use one of: ${s.packages.map((p) => p.id).join(", ")}`);

  const now = nowIso();
  const draft: Contract = {
    id: 0, inquiryId, clientName: inq.name, clientEmail: inq.email, clientPhone: inq.phone, eventType: "Wedding", eventDate: inq.event_date,
    venue: inq.venue, items: [{ label: pkg.description ? `${pkg.name}. ${pkg.description}` : pkg.name, amount: pkg.price }], discount: 0,
    taxRate: s.taxRate, depositPct: s.depositPct, notes: notes.slice(0, 400), terms: s.terms, coverSubject: s.coverSubject, coverBody: s.coverBody,
    status: "draft", sentAt: null, sentTo: null, updatedAt: now,
  };
  const v = varsFor(draft, s);
  run(
    `INSERT INTO contracts (inquiry_id, client_name, client_email, client_phone, event_type, event_date, venue, items, discount, tax_rate, deposit_pct, notes, terms, cover_subject, cover_body, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    inquiryId, draft.clientName, draft.clientEmail, draft.clientPhone, draft.eventType, draft.eventDate, draft.venue, JSON.stringify(draft.items),
    draft.taxRate, draft.depositPct, draft.notes, draft.terms, draft.coverSubject, fill(draft.coverBody, { ...v, date: v.date! }), now, now,
  );
  return get<{ id: number }>("SELECT id FROM contracts WHERE inquiry_id = ?", inquiryId)!.id;
}

/** Saves edits from the dashboard. Refuses once the contract has been sent. */
export function updateContract(id: number, input: Record<string, unknown>): Contract {
  const cur = getContract(id);
  if (!cur) throw new Error("No such contract.");
  if (cur.status === "sent") throw new Error("This contract was already sent, so it can no longer be edited.");
  const items = (Array.isArray(input.items) ? input.items : cur.items).slice(0, 30).map((i: Record<string, unknown>) => ({
    label: text(i.label, 300), amount: r2(num(i.amount, 0, 0, 1_000_000)),
  }));
  const date = text(input.eventDate, 10, cur.eventDate ?? "");
  run(
    `UPDATE contracts SET client_name=?, client_email=?, client_phone=?, event_type=?, event_date=?, venue=?, items=?, discount=?, tax_rate=?, deposit_pct=?,
       notes=?, terms=?, cover_subject=?, cover_body=?, updated_at=? WHERE id=?`,
    text(input.clientName, 120, cur.clientName), text(input.clientEmail, 200, cur.clientEmail).trim(), text(input.clientPhone, 40, cur.clientPhone),
    text(input.eventType, 60, cur.eventType) || "Wedding", /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, text(input.venue, 200, cur.venue), JSON.stringify(items),
    r2(num(input.discount, cur.discount)), num(input.taxRate, cur.taxRate, 0, 30), num(input.depositPct, cur.depositPct, 0, 100),
    text(input.notes, 600, cur.notes), text(input.terms, 20_000, cur.terms), text(input.coverSubject, 150, cur.coverSubject), text(input.coverBody, 4000, cur.coverBody),
    nowIso(), id,
  );
  return getContract(id)!;
}

// ---- PDF ------------------------------------------------------------------

const GOLD = "#b4904e";
const INK = "#111111";
const MUTED = "#666660";

export function buildPdf(c: Contract, s = getSettings()): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margins: { top: 54, bottom: 64, left: 58, right: 58 }, bufferPages: true, info: { Title: `${s.business.name} agreement: ${c.clientName}`, Author: s.business.name } });
    const chunks: Buffer[] = [];
    doc.on("data", (d: Buffer) => chunks.push(d));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const v = varsFor(c, s);
    const t = contractTotals(c);
    const L = doc.page.margins.left;
    const W = doc.page.width - L - doc.page.margins.right;

    // Header band
    doc.rect(0, 0, doc.page.width, 92).fill("#0a0a09");
    doc.rect(0, 92, doc.page.width, 3).fill(GOLD);
    doc.fillColor("#f5f5f0").font("Helvetica-Bold").fontSize(20).text(s.business.name.toUpperCase(), L, 34, { characterSpacing: 4 });
    doc.fillColor(GOLD).font("Helvetica").fontSize(9).text("SERVICE AGREEMENT", L, 62, { characterSpacing: 3 });
    const contact = [s.business.location, s.business.email, s.business.phone].filter(Boolean).join("   ·   ");
    doc.fillColor("#9a9a92").fontSize(8.5).text(contact, L, 40, { width: W, align: "right" });
    doc.y = 122;

    const label = (k: string, val: string, x: number, y: number, w: number) => {
      doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(k.toUpperCase(), x, y, { width: w, characterSpacing: 1 });
      doc.fillColor(INK).font("Helvetica").fontSize(11).text(val || "—", x, y + 12, { width: w });
    };
    const y0 = doc.y;
    label("Client", c.clientName, L, y0, W / 2 - 10);
    label("Contact", [c.clientEmail, c.clientPhone].filter(Boolean).join("\n"), L + W / 2, y0, W / 2);
    label("Event", c.eventType, L, y0 + 50, W / 2 - 10);
    label("Date", longDate(c.eventDate), L + W / 2, y0 + 50, W / 2);
    label("Venue", c.venue, L, y0 + 100, W);
    doc.y = y0 + 150;

    // Services table
    const heading = (h: string) => {
      doc.moveDown(0.4);
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text(h.toUpperCase(), L, doc.y, { characterSpacing: 1.5 });
      doc.moveTo(L, doc.y + 3).lineTo(L + W, doc.y + 3).lineWidth(0.75).strokeColor(GOLD).stroke();
      doc.moveDown(0.7);
    };
    heading("Services and fees");
    for (const i of c.items) {
      const y = doc.y;
      doc.fillColor(INK).font("Helvetica").fontSize(10.5).text(i.label, L, y, { width: W - 100 });
      const h = doc.y;
      doc.text(money(i.amount), L + W - 90, y, { width: 90, align: "right" });
      doc.y = h + 6;
    }
    const row = (k: string, val: string, bold = false) => {
      const y = doc.y;
      doc.fillColor(bold ? INK : MUTED).font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11.5 : 10).text(k, L, y, { width: W - 100 });
      doc.fillColor(INK).text(val, L + W - 100, y, { width: 100, align: "right" });
      doc.y = y + (bold ? 20 : 16);
    };
    doc.moveTo(L + W - 240, doc.y).lineTo(L + W, doc.y).lineWidth(0.5).strokeColor("#cccccc").stroke();
    doc.y += 8;
    row("Subtotal", money(t.subtotal));
    if (t.discount > 0) row("Discount", `-${money(t.discount)}`);
    if (c.taxRate > 0) row(`${s.taxLabel} (${c.taxRate}%)`, money(t.tax));
    row("Total", money(t.total), true);
    row(`Retainer due on signing (${c.depositPct}%)`, money(t.deposit));
    row("Balance due 14 days before the event", money(t.balance));
    if (c.notes.trim()) {
      doc.moveDown(0.3);
      doc.fillColor(MUTED).font("Helvetica-Oblique").fontSize(9.5).text(`Notes: ${c.notes.trim()}`, L, doc.y, { width: W });
    }
    doc.moveDown(1);

    // Terms
    heading("Terms");
    for (const block of fill(c.terms, v).split(/\n{2,}/)) {
      const b = block.trim();
      if (!b) continue;
      if (b.startsWith("## ")) {
        const [first, ...rest] = b.split("\n");
        if (doc.y > doc.page.height - 100) doc.addPage();
        doc.moveDown(0.3).fillColor(INK).font("Helvetica-Bold").fontSize(10.5).text(first!.slice(3), L, doc.y, { width: W });
        if (rest.length) doc.moveDown(0.15).fillColor("#222").font("Helvetica").fontSize(10).text(rest.join(" "), { width: W, lineGap: 2 });
      } else {
        doc.moveDown(0.2).fillColor("#222").font("Helvetica").fontSize(10).text(b, L, doc.y, { width: W, lineGap: 2 });
      }
    }

    // Signatures
    if (doc.y > doc.page.height - 190) doc.addPage();
    doc.moveDown(2.2);
    const sy = doc.y + 30;
    const colW = W / 2 - 20;
    for (const [i, who] of [[0, c.clientName || "Client"], [1, `${s.business.name}, ${s.business.signer}`]] as [number, string][]) {
      const x = L + i * (W / 2 + 20);
      doc.moveTo(x, sy).lineTo(x + colW, sy).lineWidth(0.75).strokeColor(INK).stroke();
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(9.5).text(who, x, sy + 5, { width: colW });
      doc.fillColor(MUTED).font("Helvetica").fontSize(8.5).text("Signature and date", x, sy + 19, { width: colW });
    }

    // Page numbers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // writing in the footer must not trigger a new page
      doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(`${s.business.name}  ·  Page ${i + 1} of ${range.count}`, L, doc.page.height - 40, { width: W, align: "center", lineBreak: false });
    }
    doc.end();
  });
}
