import { mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "./config.js";
import { decrypt, encrypt, isEncrypted } from "./crypto.js";
import { all, get, logActivity, nowIso, run } from "./db.js";

/**
 * The only place Opus writes files. Everything lands in data/files, named by id, so a name from the model or
 * from an upload can never point somewhere else on the disk.
 */

const DIR = join(dirname(config.dbPath), "files");
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const UPLOAD_TYPES = ["pdf", "docx", "xlsx", "csv", "tsv", "txt", "md", "json", "html", "png", "jpg", "jpeg", "gif", "webp"];

export interface FileRow { id: number; name: string; kind: string; size: number; source: "opus" | "upload"; path: string; created_at: string }

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8", tsv: "text/tab-separated-values; charset=utf-8", txt: "text/plain; charset=utf-8", md: "text/markdown; charset=utf-8",
  json: "application/json", html: "text/html; charset=utf-8", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
};
export const mimeOf = (kind: string) => MIME[kind] ?? "application/octet-stream";

/** A plain file name: letters, numbers, dots, dashes, spaces. No folders. */
export function cleanName(name: string, fallback = "file"): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const t = base.replace(/[^\w.\- ()]+/g, "_").replace(/^\.+/, "").replace(/\s+/g, " ").trim().slice(0, 100);
  return t || fallback;
}
export const extOf = (name: string) => (name.toLowerCase().split(".").pop() ?? "").replace(/[^a-z0-9]/g, "");

export function saveFile(name: string, data: Buffer, source: "opus" | "upload"): FileRow {
  const clean = cleanName(name);
  const kind = extOf(clean);
  mkdirSync(DIR, { recursive: true });
  const ins = run("INSERT INTO files (name, kind, size, source, path, created_at) VALUES (?, ?, ?, ?, '', ?)", clean, kind, data.length, source, nowIso());
  const id = Number(ins.lastInsertRowid);
  const path = join(DIR, `${id}.${kind || "bin"}`);
  writeFileSync(path, encrypt(data));
  run("UPDATE files SET path = ? WHERE id = ?", path, id);
  return get<FileRow>("SELECT * FROM files WHERE id = ?", id)!;
}

export const getFileRow = (id: number) => get<FileRow>("SELECT * FROM files WHERE id = ?", id);
export function readFile(id: number): { row: FileRow; data: Buffer } | undefined {
  const row = getFileRow(id);
  if (!row || !existsSync(row.path)) return undefined;
  return { row, data: decrypt(readFileSync(row.path)) };
}
export const listFiles = (limit = 50) => all<FileRow>("SELECT * FROM files ORDER BY id DESC LIMIT ?", limit);

/** Your own action from the dashboard. Opus has no tool that can reach this. */
export function deleteFile(id: number): boolean {
  const row = getFileRow(id);
  if (!row) return false;
  try { unlinkSync(row.path); } catch { /* already gone */ }
  run("DELETE FROM files WHERE id = ?", id);
  logActivity({ kind: "system", job: "files", summary: `You deleted the file "${row.name}"` });
  return true;
}

/** Encrypts files saved before encryption existed. Each one is checked by reading it back before it replaces the original. */
export function encryptExistingFiles(): number {
  let n = 0;
  let names: string[] = [];
  try { names = readdirSync(DIR); } catch { return 0; }
  for (const f of names) {
    const p = join(DIR, f);
    try {
      const raw = readFileSync(p);
      if (isEncrypted(raw)) continue;
      const sealed = encrypt(raw);
      if (!decrypt(sealed).equals(raw)) continue;
      writeFileSync(p + ".tmp", sealed);
      renameSync(p + ".tmp", p);
      n++;
    } catch { /* leave it as it is */ }
  }
  if (n) logActivity({ kind: "system", job: "security", summary: `Encrypted ${n} saved file${n === 1 ? "" : "s"}` });
  return n;
}
