import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { cleanName, extOf } from "./files.js";

/**
 * Builds Word, PDF, Excel, CSV and text files from what the model writes.
 * Prose is written as simple Markdown (#, ##, -, 1., | tables |, **bold**). Spreadsheets are rows of cells.
 */

export const DOC_TYPES = ["docx", "pdf", "xlsx", "csv", "txt", "md"] as const;
export type DocType = (typeof DOC_TYPES)[number];
export type Cell = string | number | boolean | null;
export interface Sheet { name: string; rows: Cell[][] }
export interface DocInput { type: DocType; title: string; filename?: string; content?: string; sheets?: Sheet[] }

type Block =
  | { t: "h"; level: 1 | 2 | 3; text: string }
  | { t: "p"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: string[] }
  | { t: "table"; rows: string[][] }
  | { t: "hr" };

const MAX_CONTENT = 60_000;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ t: "p", text: para.join(" ") }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed) { flush(); continue; }
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(trimmed))) { flush(); out.push({ t: "h", level: m[1]!.length as 1 | 2 | 3, text: m[2]! }); continue; }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) { flush(); out.push({ t: "hr" }); continue; }
    if (trimmed.startsWith("|")) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) {
        const cells = lines[i]!.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      if (rows.length) out.push({ t: "table", rows });
      continue;
    }
    if (/^[-*•]\s+/.test(trimmed)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i]!)) { items.push(lines[i]!.replace(/^\s*[-*•]\s+/, "").trim()); i++; }
      i--;
      out.push({ t: "ul", items });
      continue;
    }
    if (/^\d+[.)]\s+/.test(trimmed)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]!)) { items.push(lines[i]!.replace(/^\s*\d+[.)]\s+/, "").trim()); i++; }
      i--;
      out.push({ t: "ol", items });
      continue;
    }
    para.push(trimmed);
  }
  flush();
  return out;
}

/** "a **b** c" -> [["a ", false], ["b", true], [" c", false]] */
function runs(text: string): [string, boolean][] {
  const parts = text.replace(/`/g, "").split("**");
  return parts.map((p, i) => [p, i % 2 === 1] as [string, boolean]).filter(([p]) => p.length > 0);
}
const plain = (text: string) => text.replace(/\*\*/g, "").replace(/`/g, "");

// ---- Word ------------------------------------------------------------------

async function toDocx(title: string, content: string): Promise<Buffer> {
  const trs = (text: string, extra: { bold?: boolean; size?: number } = {}) => runs(text).map(([t, b]) => new TextRun({ text: t, bold: b || extra.bold, size: extra.size }));
  const kids: (Paragraph | Table)[] = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, bold: true })], spacing: { after: 240 } })];
  const H = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
  const line = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
  const borders = { top: line, bottom: line, left: line, right: line };
  for (const b of parseMarkdown(content)) {
    if (b.t === "h") kids.push(new Paragraph({ heading: H[b.level - 1], children: trs(b.text), spacing: { before: 240, after: 120 } }));
    else if (b.t === "p") kids.push(new Paragraph({ children: trs(b.text), spacing: { after: 120 } }));
    else if (b.t === "ul") b.items.forEach((x) => kids.push(new Paragraph({ children: trs(x), bullet: { level: 0 } })));
    else if (b.t === "ol") b.items.forEach((x, i) => kids.push(new Paragraph({ children: [new TextRun(`${i + 1}. `), ...trs(x)], indent: { left: 360 } })));
    else if (b.t === "hr") kids.push(new Paragraph({ border: { bottom: line }, spacing: { after: 120 } }));
    else if (b.t === "table") {
      const cols = Math.max(...b.rows.map((r) => r.length));
      kids.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: b.rows.map((r, ri) => new TableRow({
          tableHeader: ri === 0,
          children: Array.from({ length: cols }, (_, ci) => new TableCell({ borders, margins: { top: 60, bottom: 60, left: 100, right: 100 }, shading: ri === 0 ? { fill: "EEEEEE" } : undefined, children: [new Paragraph({ children: trs(r[ci] ?? "", { bold: ri === 0 }) })] })),
        })),
      }));
      kids.push(new Paragraph({ text: "" }));
    }
  }
  const doc = new Document({ title, creator: "Opus", styles: { default: { document: { run: { font: "Calibri", size: 22 } } } }, sections: [{ children: kids }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

// ---- PDF -------------------------------------------------------------------

function toPdf(title: string, content: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margins: { top: 60, bottom: 60, left: 64, right: 64 }, info: { Title: title, Author: "Opus" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const W = doc.page.width - 128;
    const room = (h: number) => { if (doc.y + h > doc.page.height - 60) doc.addPage(); };
    const write = (text: string, size: number, opts: { indent?: number; gap?: number; bold?: boolean } = {}) => {
      doc.fontSize(size);
      const segs = runs(text);
      const width = W - (opts.indent ?? 0);
      segs.forEach(([t, b], i) => {
        doc.font(b || opts.bold ? "Helvetica-Bold" : "Helvetica");
        if (i === 0) doc.text(t, 64 + (opts.indent ?? 0), doc.y, { continued: segs.length > 1, width });
        else doc.text(t, { continued: i < segs.length - 1, width });
      });
      if (!segs.length) doc.text("");
      doc.moveDown(opts.gap ?? 0.4);
    };

    doc.font("Helvetica-Bold").fontSize(22).text(title, { width: W });
    doc.moveDown(0.3);
    doc.moveTo(64, doc.y).lineTo(64 + W, doc.y).strokeColor("#b4904e").lineWidth(1.5).stroke();
    doc.moveDown(0.8);
    doc.fillColor("#111111");

    for (const b of parseMarkdown(content)) {
      if (b.t === "h") { room(50); doc.moveDown(0.4); write(b.text, b.level === 1 ? 17 : b.level === 2 ? 14 : 12, { bold: true, gap: 0.3 }); }
      else if (b.t === "p") { room(30); write(b.text, 10.5); }
      else if (b.t === "hr") { doc.moveTo(64, doc.y).lineTo(64 + W, doc.y).strokeColor("#cccccc").lineWidth(0.5).stroke(); doc.moveDown(0.6); }
      else if (b.t === "ul" || b.t === "ol") {
        b.items.forEach((x, i) => { room(24); write(`${b.t === "ul" ? "•" : `${i + 1}.`}  ${x}`, 10.5, { indent: 12, gap: 0.2 }); });
        doc.moveDown(0.3);
      } else if (b.t === "table") {
        const cols = Math.max(...b.rows.map((r) => r.length));
        const cw = W / cols;
        b.rows.forEach((r, ri) => {
          doc.fontSize(9.5).font(ri === 0 ? "Helvetica-Bold" : "Helvetica");
          const h = Math.max(...Array.from({ length: cols }, (_, ci) => doc.heightOfString(plain(r[ci] ?? ""), { width: cw - 10 }))) + 10;
          room(h);
          const y = doc.y;
          if (ri === 0) doc.rect(64, y, W, h).fillColor("#eeeeee").fill().fillColor("#111111");
          for (let ci = 0; ci < cols; ci++) {
            doc.rect(64 + ci * cw, y, cw, h).strokeColor("#bbbbbb").lineWidth(0.5).stroke();
            doc.fillColor("#111111").font(ri === 0 ? "Helvetica-Bold" : "Helvetica").text(plain(r[ci] ?? ""), 64 + ci * cw + 5, y + 5, { width: cw - 10 });
          }
          doc.y = y + h;
        });
        doc.moveDown(0.8);
      }
    }
    doc.end();
  });
}

// ---- Excel / CSV -----------------------------------------------------------

const safeSheetName = (n: string, i: number) => (n.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || `Sheet${i + 1}`);

/** A cell that starts with "=" is a formula. Everything else is data, so text can never run as a formula by accident. */
async function toXlsx(sheets: Sheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Opus";
  const seen = new Set<string>();
  sheets.slice(0, 12).forEach((s, i) => {
    let name = safeSheetName(s.name, i);
    while (seen.has(name.toLowerCase())) name = `${name.slice(0, 28)} ${i + 1}`;
    seen.add(name.toLowerCase());
    const ws = wb.addWorksheet(name);
    s.rows.slice(0, 2000).forEach((row, ri) => {
      const r = ws.getRow(ri + 1);
      row.slice(0, 60).forEach((v, ci) => {
        const cell = r.getCell(ci + 1);
        if (typeof v === "string" && /^=\s*\S/.test(v)) cell.value = { formula: v.replace(/^=\s*/, "") };
        else cell.value = v === null ? null : typeof v === "string" ? v.slice(0, 2000) : v;
      });
      r.commit();
    });
    const head = ws.getRow(1);
    head.font = { bold: true };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.columns.forEach((col) => {
      let w = 8;
      col.eachCell?.({ includeEmpty: false }, (c) => { const v = c.value; const len = typeof v === "object" && v ? 10 : String(v ?? "").length; w = Math.max(w, Math.min(len + 2, 48)); });
      col.width = w;
    });
  });
  if (!wb.worksheets.length) wb.addWorksheet("Sheet1");
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** CSV cells that start with = + - @ get a leading quote, so opening the file in Excel never runs them as formulas. */
function toCsv(rows: Cell[][]): Buffer {
  const esc = (v: Cell) => {
    let s = v === null ? "" : String(v);
    if (typeof v === "string" && /^[=+@]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return Buffer.from("﻿" + rows.slice(0, 5000).map((r) => r.slice(0, 60).map(esc).join(",")).join("\r\n") + "\r\n", "utf8");
}

export async function buildDocument(input: DocInput): Promise<{ name: string; data: Buffer }> {
  const title = (input.title || "Document").slice(0, 120);
  const base = cleanName((input.filename ?? title).replace(/\.[a-z0-9]{2,4}$/i, ""), "document");
  const name = `${base}.${input.type}`;
  const content = (input.content ?? "").slice(0, MAX_CONTENT);
  switch (input.type) {
    case "docx": return { name, data: await toDocx(title, content) };
    case "pdf": return { name, data: await toPdf(title, content) };
    case "xlsx": {
      if (!input.sheets?.length) throw new Error("An Excel file needs sheets: [{name, rows}].");
      return { name, data: await toXlsx(input.sheets) };
    }
    case "csv": {
      const rows = input.sheets?.[0]?.rows;
      if (!rows?.length) throw new Error("A CSV file needs sheets: [{name, rows}] with at least one row.");
      return { name, data: toCsv(rows) };
    }
    case "txt": return { name, data: Buffer.from(parseMarkdown(content).length ? `${title}\n\n${plain(content)}\n` : `${title}\n`, "utf8") };
    case "md": return { name, data: Buffer.from(`# ${title}\n\n${content}\n`, "utf8") };
  }
}

export { extOf };
