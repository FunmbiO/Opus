import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * Web-facing protections, kept apart from server.ts so they can be tested on their own.
 * Nothing here talks to Gmail, the database or the model.
 */

// ---- Who is calling ---------------------------------------------------------------------

const LOOPBACK = /^(::ffff:)?127\.\d+\.\d+\.\d+$|^::1$/;
export const isLoopback = (ip: string) => LOOPBACK.test(ip);

/**
 * The caller's address. Behind `tailscale serve` every request arrives from 127.0.0.1, so the real address is in
 * X-Forwarded-For. That header is only believed when the connection itself comes from this machine, and only its
 * LAST entry is used (the one our own proxy appended), because earlier entries can be written by the caller.
 */
export function clientIp(req: Pick<IncomingMessage, "socket" | "headers">): string {
  const peer = req.socket.remoteAddress ?? "?";
  if (!isLoopback(peer)) return peer;
  const xff = String(req.headers["x-forwarded-for"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const last = xff[xff.length - 1];
  return last && last.length <= 64 && /^[0-9a-fA-F:.]+$/.test(last) ? last : peer;
}

/** True only for a direct connection from this machine, not one forwarded by a proxy. */
export const isDirectLocal = (req: Pick<IncomingMessage, "socket" | "headers">) =>
  isLoopback(req.socket.remoteAddress ?? "") && !req.headers["x-forwarded-for"];

// ---- Rate limiting ----------------------------------------------------------------------

export interface Limit { max: number; windowMs: number }

/** Sliding-window limiter. In memory, which is right for one small server. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private now: () => number = Date.now) {}

  /** 0 when the call is allowed (and counted); otherwise the whole seconds to wait. */
  take(key: string, limit: Limit): number {
    const t = this.now();
    const fresh = (this.hits.get(key) ?? []).filter((x) => t - x < limit.windowMs);
    if (fresh.length >= limit.max) {
      this.hits.set(key, fresh);
      return Math.max(1, Math.ceil((fresh[0]! + limit.windowMs - t) / 1000));
    }
    fresh.push(t);
    this.hits.set(key, fresh);
    if (this.hits.size > 5000) this.prune(limit.windowMs);
    return 0;
  }

  private prune(windowMs: number) {
    const t = this.now();
    for (const [k, v] of this.hits) if (!v.length || t - v[v.length - 1]! >= windowMs) this.hits.delete(k);
    if (this.hits.size > 5000) this.hits.clear(); // bounded memory beats perfect accounting
  }
}

/** Caps how many calls to the model run at once, so a burst cannot run up the bill. */
export class Gate {
  private n = 0;
  constructor(private max: number) {}
  /** Returns a release function, or null if the gate is full. Release is safe to call twice. */
  enter(): (() => void) | null {
    if (this.n >= this.max) return null;
    this.n += 1;
    let done = false;
    return () => { if (!done) { done = true; this.n -= 1; } };
  }
}

export interface Route { name: string; limit: Limit; ai: boolean }
const MIN = 60_000;

/** Each kind of request gets its own budget. Costly or sensitive ones get small ones. */
export function classify(method: string, path: string): Route {
  if (!path.startsWith("/api/")) return { name: "static", limit: { max: 300, windowMs: MIN }, ai: false };
  if (method === "POST" && (path === "/api/auth/login" || path === "/api/auth/setup" || path === "/api/auth/password")) return { name: "auth", limit: { max: 12, windowMs: MIN }, ai: false };
  if (method === "POST" && /^\/api\/contracts\/\d+\/send$/.test(path)) return { name: "outbound", limit: { max: 5, windowMs: MIN }, ai: false };
  if (method === "POST" && path === "/api/attachments/unlock") return { name: "unlock", limit: { max: 10, windowMs: MIN }, ai: false };
  if (method === "POST" && path === "/api/files/upload") return { name: "upload", limit: { max: 10, windowMs: MIN }, ai: false };
  if (method === "POST" && path === "/api/inquiries/ingest") return { name: "ingest", limit: { max: 20, windowMs: MIN }, ai: true };
  if (method === "POST" && (path === "/api/ask" || /^\/api\/run\//.test(path) || /^\/api\/approvals\/[^/]+\/approve$/.test(path))) return { name: "ai", limit: { max: 12, windowMs: MIN }, ai: true };
  return { name: "api", limit: { max: 240, windowMs: MIN }, ai: false };
}

// ---- Which site is asking ---------------------------------------------------------------

const IP_LITERAL = /^(\d{1,3}\.){3}\d{1,3}$|^\[[0-9a-fA-F:.]+\]$/;

/**
 * DNS-rebinding guard. A hostile web page can point its own domain at your private address; the browser then sends
 * that domain in the Host header. Only names you actually use are accepted: localhost, IP addresses, Tailscale names
 * (*.ts.net) and anything listed in ALLOWED_HOSTS (comma separated).
 */
export function hostAllowed(hostHeader: string | undefined, extra: string[] = []): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.trim().toLowerCase().replace(/:\d+$/, "");
  if (!host || host.length > 253) return false;
  if (host === "localhost" || host.endsWith(".localhost") || IP_LITERAL.test(host)) return true;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net$/.test(host)) return true;
  return extra.map((h) => h.trim().toLowerCase()).filter(Boolean).includes(host);
}

// ---- Headers ----------------------------------------------------------------------------

export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.plaid.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // React sets style attributes
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.plaid.com",
  "frame-src https://cdn.plaid.com https://*.plaid.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'", // nobody may put the private app in a frame
].join("; ");

export function setSecurityHeaders(res: ServerResponse, req: Pick<IncomingMessage, "headers">) {
  res.setHeader("content-security-policy", CSP);
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  res.setHeader("cross-origin-opener-policy", "same-origin");
  res.setHeader("cross-origin-resource-policy", "same-origin");
  res.setHeader("x-permitted-cross-domain-policies", "none");
  if (String(req.headers["x-forwarded-proto"] ?? "").toLowerCase() === "https") {
    res.setHeader("strict-transport-security", "max-age=63072000; includeSubDomains");
  }
}

// ---- Files ------------------------------------------------------------------------------

/**
 * Maps a URL path to a file inside root, or null if it would leave root or touch a hidden file.
 * Uses a real path comparison, not startsWith, so a sibling folder like "dist-preview" cannot match "dist".
 */
export function safeJoin(root: string, urlPath: string): string | null {
  if (urlPath.includes("\0") || urlPath.includes("\\")) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const file = resolve(root, "." + (decoded.startsWith("/") ? decoded : "/" + decoded));
  const rel = relative(root, file);
  if (rel.startsWith("..") || isAbsolute(rel) || rel.split(sep).some((p) => p.startsWith("."))) return null;
  return file;
}

/** Only error text that is safe to show. Paths, stack frames and database errors stay in the log. */
export function publicMessage(err: unknown): string {
  const m = err instanceof Error ? err.message : "";
  if (!m || m.length > 200 || /[\\/]|\bat\s+\S+\s*\(|node:|SQLITE|ENOENT|EACCES|ECONN|undefined|\[object/i.test(m) || m.includes("\n")) return "Something went wrong.";
  return m;
}
