import mammoth from "mammoth";
import readXlsx from "read-excel-file/node";
import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";

/**
 * Turns an email attachment into something the model can read.
 * Everything here is read only, and the result is untrusted data.
 */

export const MAX_BYTES = 15 * 1024 * 1024; // refuse to even open anything bigger
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_SCAN_PAGES = 4; // pictures cost more than text, so cap them
const MAX_CHARS = 12_000; // keeps one attachment to roughly 3,000 tokens

/** The PDF is locked. `wrong` is true when a password was given and it did not work. */
export class PasswordRequired extends Error {
  constructor(public wrong: boolean) {
    super(wrong ? "Wrong password" : "Password required");
  }
}

export interface Extracted {
  text?: string;
  image?: { media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string };
  /** Page pictures of a scanned PDF, for the model to read. */
  images?: { media_type: "image/png"; data: string }[];
  note?: string;
}

const ext = (name: string) => name.toLowerCase().split(".").pop() ?? "";
const clip = (s: string) => {
  const t = s.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return t.length > MAX_CHARS ? `${t.slice(0, MAX_CHARS)}\n[trimmed: the file continues]` : t;
};

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** `password` is only ever supplied by the unlock route, never by the model. It is used once and not stored. */
export async function extract(filename: string, mime: string, data: Buffer, password?: string): Promise<Extracted> {
  const e = ext(filename);
  const m = mime.toLowerCase();

  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp"].includes(e)) {
    const type = m === "image/jpg" ? "image/jpeg" : m;
    const ok = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(type);
    if (!ok) return { note: `This image type (${mime || e}) can't be read. Only JPEG, PNG, GIF and WebP work. Open it in Gmail.` };
    if (data.length > MAX_IMAGE_BYTES) return { note: "This image is over 4 MB, which is too large to read. Open it in Gmail." };
    return { image: { media_type: type as NonNullable<Extracted["image"]>["media_type"], data: data.toString("base64") } };
  }

  if (m === "application/pdf" || e === "pdf") {
    let pdf;
    try {
      pdf = await getDocumentProxy(new Uint8Array(data), password ? { password } : undefined);
    } catch (err) {
      // pdf.js: code 1 = needs a password, code 2 = the password was wrong.
      const e2 = err as { name?: string; code?: number };
      if (e2?.name === "PasswordException") throw new PasswordRequired(e2.code === 2);
      throw err;
    }
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const body = (Array.isArray(text) ? text.join("\n") : text).trim();
    if (body.length < 20) {
      // A scan or photo: no text layer. Draw the first pages as pictures so the model can read them.
      const pages = Math.min(totalPages, MAX_SCAN_PAGES);
      const images: NonNullable<Extracted["images"]> = [];
      try {
        for (let p = 1; p <= pages; p++) {
          const png = await renderPageAsImage(pdf, p, { canvasImport: () => import("@napi-rs/canvas"), scale: 1.6 });
          const buf = Buffer.from(png);
          if (buf.length <= MAX_IMAGE_BYTES) images.push({ media_type: "image/png", data: buf.toString("base64") });
        }
      } catch (err) {
        const why = String((err as Error)?.message ?? err).replace(/\s+/g, " ").slice(0, 200);
        console.error("Scan render failed:", why);
        return { note: `This PDF (${totalPages} pages) is a scan and Opus couldn't turn its pages into pictures. Reason: ${why}` };
      }
      if (!images.length) return { note: `This PDF (${totalPages} pages) is a scan whose pages are too large to read. Open it in Gmail.` };
      return { images, note: `Scanned PDF, ${totalPages} page(s)${totalPages > pages ? `, first ${pages} shown` : ""}. The pages follow as pictures; read the text from them.` };
    }
    return { text: `PDF, ${totalPages} page(s):\n${clip(body)}` };
  }

  if (e === "docx" || m.includes("wordprocessingml")) {
    const { value } = await mammoth.extractRawText({ buffer: data });
    return value.trim() ? { text: `Word document:\n${clip(value)}` } : { note: "This Word document has no text." };
  }

  if (e === "xlsx" || m.includes("spreadsheetml")) {
    const sheets = await readXlsx(data);
    const out = sheets.slice(0, 5).map((s) => {
      const rows = s.data.slice(0, 200).map((r) => r.slice(0, 20).map((c) => (c == null ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))).join("\t"));
      return `Sheet "${s.sheet}" (${s.data.length} rows${s.data.length > 200 ? ", first 200 shown" : ""}):\n${rows.join("\n")}`;
    });
    return out.length ? { text: clip(out.join("\n\n")) } : { note: "This spreadsheet is empty." };
  }

  if (e === "doc" || e === "xls" || e === "ppt" || e === "pptx") {
    return { note: `.${e} files can't be read yet. Only PDF, Word (.docx), Excel (.xlsx), CSV, text and images work. Open it in Gmail.` };
  }

  if (["txt", "csv", "tsv", "md", "json", "ics", "vcf", "log", "xml"].includes(e) || m.startsWith("text/plain") || m === "text/csv" || m === "text/calendar") {
    return { text: clip(data.toString("utf8")) };
  }
  if (e === "html" || e === "htm" || m === "text/html") return { text: clip(htmlToText(data.toString("utf8"))) };

  return { note: `Can't read this kind of file (${mime || e}). Only PDF, Word (.docx), Excel (.xlsx), CSV, text and images work.` };
}
