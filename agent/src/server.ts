import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { get, logActivity, nowIso, run } from "./db.js";
import { getContract, saveSettings, updateContract, buildPdf, createContract } from "./contracts.js";
import { decideApproval, runAsk, runTriage, runWebInquiry, undoApproval, type Deps } from "./jobs.js";
import { sendContract, SendRefused } from "./send.js";
import { unlockAttachment, UnlockError } from "./unlock.js";
import { reportIfAuthError } from "./reminders.js";
import { buildState } from "./state.js";
import { deleteClient } from "./clients.js";
import { clearPay, PayError, setPay } from "./pay.js";
import { addBill, addGoal, addLine, FinanceError, removeBill, removeGoal, removeLine, setAside, syncBudgetAlerts, undoSetAside, updateGoal, updateLine } from "./finance.js";
import { addNote, NoteError, removeNote } from "./notes.js";
import { BankError, connectDemoBank, createLinkToken, disconnect, finishLink, setCategory, setTracked, syncAll } from "./bank.js";
import { backupNow } from "./backups.js";
import { createHash, timingSafeEqual } from "node:crypto";
import { AuthError, changePassword, createSession, endOtherSessions, endSession, passwordSet, sessionValid, setPassword, verifyPassword } from "./auth.js";
import { notify } from "./notify.js";
import { cleanName, deleteFile, extOf, MAX_UPLOAD_BYTES, mimeOf, readFile, saveFile, UPLOAD_TYPES } from "./files.js";

const DIST = fileURLToPath(new URL("../../dashboard/dist", import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json",
};

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, limit = 80_000): Promise<Record<string, unknown>> {
  if (!(req.headers["content-type"] ?? "").includes("application/json")) throw new Error("Send JSON.");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error("Message too long.");
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
}

class Bad extends Error {}

const digest = (v: string) => createHash("sha256").update(v).digest();

const sameSecret = (given: string, want: string) => !!want && timingSafeEqual(digest(given), digest(want));
const bearer = (req: IncomingMessage) => String(req.headers.authorization ?? "").replace(/^Bearer /, "");

/**
 * Once a password is set, only a signed-in session works. API_TOKEN then does one job only: letting your website
 * form post an inquiry. Before a password is set, the old token still works so you can get in and set one.
 */
function authorized(req: IncomingMessage, path: string): boolean {
  const given = bearer(req);
  if (passwordSet()) {
    if (path === "/api/inquiries/ingest" && req.method === "POST" && sameSecret(given, config.server.token)) return true;
    return sessionValid(given);
  }
  if (!config.server.token) return true;
  return sameSecret(given, config.server.token);
}

// Slows down guessing: after 10 wrong tokens in a minute from one address, that address waits.
const misses = new Map<string, { n: number; since: number }>();
function throttled(ip: string): boolean {
  const m = misses.get(ip);
  return !!m && Date.now() - m.since < 60_000 && m.n >= 10;
}
function noteMiss(ip: string) {
  const m = misses.get(ip);
  if (!m || Date.now() - m.since >= 60_000) misses.set(ip, { n: 1, since: Date.now() });
  else m.n += 1;
  if (misses.get(ip)!.n === 10) {
    const who = ip.replace(/^::ffff:/, "");
    logActivity({ kind: "system", job: "security", summary: `Too many wrong sign-in tries from ${who}. It is locked out for a minute.` });
    run(
      `INSERT INTO alerts (id, severity, title, detail, dismissed) VALUES ('security-lockout', 'high', ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET detail = excluded.detail, dismissed = 0`,
      "Someone keeps guessing your sign-in", `10 wrong tries from ${who} at ${new Date().toLocaleTimeString("en-CA")} - if that wasn't you, change your password in Activity.`,
    );
    void notify(`Opus: 10 wrong sign-in tries from ${who}. It is locked out for a minute.`, { urgent: true }).catch(() => {});
  }
  if (misses.size > 500) misses.clear();
}

export function startServer(deps: Deps) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    // Basic browser protections on every response.
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("x-frame-options", "DENY");
    res.setHeader("referrer-policy", "no-referrer");
    const ip = req.socket.remoteAddress ?? "?";

    try {
      if (path.startsWith("/api/")) {
        if (req.method === "GET" && path === "/api/auth/status") return json(res, 200, { passwordSet: passwordSet(), hasToken: !!config.server.token });
        if (throttled(ip)) return json(res, 429, { error: "Too many wrong tries. Wait a minute." });

        if (req.method === "POST" && path === "/api/auth/login") {
          let b: Record<string, unknown>;
          try { b = await readJson(req, 2000); } catch { return json(res, 400, { error: "Bad request." }); }
          if (!passwordSet()) return json(res, 409, { error: "No password is set yet." });
          if (!verifyPassword(String(b.password ?? ""))) { noteMiss(ip); return json(res, 401, { error: "Wrong password." }); }
          return json(res, 200, { token: createSession(ip, String(req.headers["user-agent"] ?? "")) });
        }
        if (req.method === "POST" && path === "/api/auth/setup") {
          // First time only. Proves it is you with the old access token (or, if there never was one, from this PC).
          let b: Record<string, unknown>;
          try { b = await readJson(req, 2000); } catch { return json(res, 400, { error: "Bad request." }); }
          if (passwordSet()) return json(res, 409, { error: "A password is already set." });
          const local = /^(::ffff:)?127\.0\.0\.1$|^::1$/.test(ip);
          const ok = config.server.token ? sameSecret(String(b.token ?? ""), config.server.token) : local;
          if (!ok) { noteMiss(ip); return json(res, 401, { error: config.server.token ? "That access token is wrong." : "Set the first password from the PC Opus runs on, or run npm run password." }); }
          try { setPassword(String(b.password ?? "")); } catch (e) { if (e instanceof AuthError) return json(res, 400, { error: e.message }); throw e; }
          return json(res, 200, { token: createSession(ip, String(req.headers["user-agent"] ?? "")) });
        }

        if (!authorized(req, path)) { noteMiss(ip); return json(res, 401, { error: "Please sign in." }); }

        if (req.method === "POST" && path === "/api/auth/logout") { endSession(bearer(req)); return json(res, 200, { ok: true }); }
        if (req.method === "POST" && path === "/api/auth/logout-others") { endOtherSessions(bearer(req)); return json(res, 200, buildState()); }
        if (req.method === "POST" && path === "/api/auth/password") {
          let b: Record<string, unknown>;
          try { b = await readJson(req, 2000); } catch { return json(res, 400, { error: "Bad request." }); }
          try { changePassword(String(b.current ?? ""), String(b.next ?? ""), bearer(req)); } catch (e) { if (e instanceof AuthError) { if (/wrong/.test(e.message)) noteMiss(ip); return json(res, 400, { error: e.message }); } throw e; }
          return json(res, 200, buildState());
        }

        if (req.method === "GET" && path === "/api/state") return json(res, 200, buildState());

        // Put a dismissed approval back in the queue. Status change only; nothing is sent or cancelled.
        const undo = /^\/api\/approvals\/([^/]+)\/undo$/.exec(path);
        if (req.method === "POST" && undo) {
          const r = undoApproval(undo[1]!);
          if (r === "missing") return json(res, 404, { error: "No such approval." });
          if (r === "not-dismissed") return json(res, 409, { error: "Only items you said not now to can be put back." });
          if (r === "duplicate") return json(res, 409, { error: "That is already waiting in the queue." });
          return json(res, 200, buildState());
        }

        const m = /^\/api\/(approvals|subscriptions|alerts|drafts)\/([^/]+)\/(approve|dismiss|keep|prepare)$/.exec(path);
        if (req.method === "POST" && m) {
          const [, kind, id, action] = m as unknown as [string, string, string, string];
          if (kind === "approvals" && (action === "approve" || action === "dismiss")) {
            await decideApproval(deps, id, action);
          } else if (kind === "subscriptions" && action === "keep") {
            run("UPDATE subscriptions SET verdict = 'keep', source = 'user', updated_at = ? WHERE id = ?", nowIso(), id);
            const s = get<{ name: string }>("SELECT name FROM subscriptions WHERE id = ?", id);
            logActivity({ kind: "system", job: "subscriptions", summary: `You marked ${s?.name ?? id} as keep` });
          } else if (kind === "subscriptions" && action === "prepare") {
            const sub = get<{ name: string; monthly_equivalent: number | null }>("SELECT name, monthly_equivalent FROM subscriptions WHERE id = ?", id);
            if (!sub) return json(res, 404, { error: "No such subscription." });
            const open = get("SELECT id FROM approvals WHERE subscription_id = ? AND status = 'pending'", id);
            if (!open) {
              run(
                "INSERT INTO approvals (id, kind, title, reason, subscription_id, status, created_at) VALUES (?, 'cancel', ?, ?, ?, 'pending', ?)",
                `ap-${id}-${Date.now()}`, `Prepare cancellation: ${sub.name}`, "You asked for this from the Subscriptions page. Approving makes Opus write the steps. Nothing is cancelled for you.", id, nowIso(),
              );
              logActivity({ kind: "system", job: "subscriptions", summary: `You asked to prepare cancelling ${sub.name}` });
            }
          } else if (kind === "alerts" && action === "dismiss") {
            run("UPDATE alerts SET dismissed = 1 WHERE id = ?", id);
          } else if (kind === "drafts" && action === "dismiss") {
            run("UPDATE drafts SET status = 'dismissed' WHERE id = ?", Number(id));
          } else {
            return json(res, 400, { error: "Unsupported action." });
          }
          return json(res, 200, buildState());
        }

        if (req.method === "POST" && path === "/api/ask") {
          let body: Record<string, unknown>;
          try { body = await readJson(req); } catch (e) { return json(res, 400, { error: e instanceof Error ? e.message : "Bad request." }); }
          const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
          if (!message) return json(res, 400, { error: "Type a message first." });
          const history = (Array.isArray(body.history) ? body.history : [])
            .filter((h): h is { role: "user" | "assistant"; content: string } => !!h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
            .map((h) => ({ role: h.role, content: h.content.slice(0, 3000) }));
          const result = await runAsk(deps, message, history);
          return json(res, 200, { ...result, state: buildState() });
        }

        // ---- Business: clients, contracts, sending ----------------------
        const body = async () => { try { return await readJson(req); } catch (e) { throw new Bad(e instanceof Error ? e.message : "Bad request."); } };

        let c: RegExpExecArray | null;
        if (req.method === "PUT" && path === "/api/settings/jaded") {
          saveSettings(await body());
          logActivity({ kind: "system", job: "settings", summary: "You updated business pricing and terms" });
          return json(res, 200, buildState());
        }
        if (req.method === "PUT" && (c = /^\/api\/contracts\/(\d+)$/.exec(path))) {
          const edits = await body();
          try { updateContract(Number(c[1]), edits); } catch (e) { return json(res, 409, { error: e instanceof Error ? e.message : "Could not save." }); }
          return json(res, 200, buildState());
        }
        if (req.method === "GET" && (c = /^\/api\/contracts\/(\d+)\/pdf$/.exec(path))) {
          const k = getContract(Number(c[1]));
          if (!k) return json(res, 404, { error: "No such contract." });
          const pdf = await buildPdf(k);
          res.writeHead(200, { "content-type": "application/pdf", "content-disposition": 'inline; filename="agreement.pdf"', "cache-control": "no-store" });
          return res.end(pdf);
        }
        if (req.method === "POST" && (c = /^\/api\/inquiries\/(\d+)\/contract$/.exec(path))) {
          const b = await body();
          createContract(Number(c[1]), typeof b.packageId === "string" ? b.packageId : "");
          logActivity({ kind: "system", job: "contracts", summary: "You started a contract from the price list" });
          return json(res, 200, buildState());
        }
        if (req.method === "POST" && (c = /^\/api\/inquiries\/(\d+)\/outcome$/.exec(path))) {
          const b = await body();
          const o = b.outcome === "booked" || b.outcome === "declined" ? b.outcome : null;
          run("UPDATE inquiries SET outcome = ? WHERE id = ?", o, Number(c[1]));
          logActivity({ kind: "system", job: "inquiry", summary: o ? `You marked inquiry #${c[1]} as ${o}` : `You reopened inquiry #${c[1]}` });
          return json(res, 200, buildState());
        }
        if (req.method === "POST" && (c = /^\/api\/contracts\/(\d+)\/send$/.exec(path))) {
          // The one and only way an email leaves Opus. Needs your explicit approval in the request.
          const b = await body();
          if (b.approved !== true || typeof b.to !== "string" || typeof b.version !== "string") return json(res, 400, { error: "Approval is required." });
          try {
            await sendContract({ contractId: Number(c[1]), to: b.to, version: b.version });
          } catch (e) {
            if (e instanceof SendRefused) return json(res, 409, { error: e.message, problems: e.problems });
            throw e;
          }
          return json(res, 200, buildState());
        }
        if (req.method === "POST" && (c = /^\/api\/inquiries\/(\d+)\/delete$/.exec(path))) {
          // Your own action from the dashboard. Opus has no tool that can do this, and Gmail is never touched.
          const b = await body();
          if (b.confirmed !== true) return json(res, 400, { error: "Confirm the delete first." });
          if (!deleteClient(Number(c[1]))) return json(res, 404, { error: "That client is already gone." });
          return json(res, 200, buildState());
        }

        // ---- Budget, bills and savings (you edit these; Opus only reads them) ----
        const afterFinance = () => { syncBudgetAlerts(); return buildState(); };
        try {
          if (req.method === "POST" && path === "/api/notes") { const b = await body(); addNote(typeof b.text === "string" ? b.text : "", "you"); return json(res, 200, buildState()); }
          if (req.method === "POST" && (c = /^\/api\/notes\/(\d+)\/remove$/.exec(path))) { removeNote(Number(c[1])); return json(res, 200, buildState()); }
          if (req.method === "POST" && path === "/api/backup") { backupNow("you asked"); return json(res, 200, buildState()); }
          if (req.method === "POST" && path === "/api/budget/lines") { addLine(await body()); return json(res, 200, afterFinance()); }
          if ((c = /^\/api\/budget\/lines\/(\d+)$/.exec(path))) {
            if (req.method === "PUT") { updateLine(Number(c[1]), await body()); return json(res, 200, afterFinance()); }
          }
          if (req.method === "POST" && (c = /^\/api\/budget\/lines\/(\d+)\/remove$/.exec(path))) { removeLine(Number(c[1])); return json(res, 200, afterFinance()); }
          if (req.method === "POST" && path === "/api/budget/goals") { addGoal(await body()); return json(res, 200, afterFinance()); }
          if (req.method === "PUT" && (c = /^\/api\/budget\/goals\/(\d+)$/.exec(path))) { updateGoal(Number(c[1]), await body()); return json(res, 200, afterFinance()); }
          if (req.method === "POST" && (c = /^\/api\/budget\/goals\/(\d+)\/remove$/.exec(path))) { removeGoal(Number(c[1])); return json(res, 200, afterFinance()); }
          if (req.method === "POST" && (c = /^\/api\/budget\/goals\/(\d+)\/setaside$/.exec(path))) { const b = await body(); setAside(Number(c[1]), b.amount); return json(res, 200, afterFinance()); }
          if (req.method === "POST" && (c = /^\/api\/budget\/goals\/(\d+)\/undo$/.exec(path))) { undoSetAside(Number(c[1])); return json(res, 200, afterFinance()); }
          if (req.method === "POST" && path === "/api/pay") { setPay(await body()); return json(res, 200, afterFinance()); }
          if (req.method === "DELETE" && path === "/api/pay") { clearPay(); return json(res, 200, afterFinance()); }
          if (req.method === "POST" && path === "/api/bills") { addBill(await body()); return json(res, 200, afterFinance()); }
          if (req.method === "POST" && (c = /^\/api\/bills\/([^/]+)\/remove$/.exec(path))) { removeBill(decodeURIComponent(c[1]!)); return json(res, 200, afterFinance()); }
        } catch (e) {
          if (e instanceof NoteError) return json(res, 400, { error: e.message });
          if (e instanceof FinanceError || e instanceof PayError || (e instanceof Error && /^Enter an amount/.test(e.message))) return json(res, 400, { error: e.message });
          throw e;
        }

        // ---- Bank: read-only card transactions through Plaid ----
        try {
          if (req.method === "POST" && path === "/api/bank/link-token") {
            const b = await body();
            const t = await createLinkToken(typeof b.itemId === "string" ? b.itemId : undefined);
            return json(res, 200, { linkToken: t.linkToken, mock: t.mock, redirect: !!config.plaid.redirectUri });
          }
          if (req.method === "POST" && path === "/api/bank/exchange") {
            const b = await body();
            await finishLink(String(b.publicToken ?? ""), String(b.institution ?? ""), deps.llm);
            return json(res, 200, buildState());
          }
          if (req.method === "POST" && path === "/api/bank/demo") { await connectDemoBank(deps.llm); return json(res, 200, buildState()); }
          if (req.method === "POST" && path === "/api/bank/sync") { await syncAll(deps.llm); return json(res, 200, buildState()); }
          if (req.method === "POST" && (c = /^\/api\/bank\/accounts\/([^/]+)\/track$/.exec(path))) {
            const b = await body();
            await setTracked(decodeURIComponent(c[1]!), b.tracked === true, deps.llm);
            return json(res, 200, buildState());
          }
          if (req.method === "POST" && (c = /^\/api\/bank\/items\/([^/]+)\/disconnect$/.exec(path))) {
            const b = await body();
            if (b.confirmed !== true) return json(res, 400, { error: "Confirm first." });
            await disconnect(decodeURIComponent(c[1]!));
            return json(res, 200, buildState());
          }
          if (req.method === "POST" && (c = /^\/api\/transactions\/([^/]+)\/category$/.exec(path))) {
            const b = await body();
            setCategory(decodeURIComponent(c[1]!), b.category, b.wholeVendor !== false);
            return json(res, 200, buildState());
          }
        } catch (e) {
          if (e instanceof BankError) return json(res, 400, { error: e.message });
          throw e;
        }

        // ---- Files: what Opus made, and what you attach in chat ----
        if (req.method === "POST" && path === "/api/files/upload") {
          let b: Record<string, unknown>;
          try { b = await readJson(req, Math.ceil(MAX_UPLOAD_BYTES * 1.4)); } catch (e) { return json(res, 400, { error: e instanceof Error ? e.message : "Upload failed." }); }
          const name = cleanName(typeof b.name === "string" ? b.name : "", "attachment");
          const kind = extOf(name);
          if (!UPLOAD_TYPES.includes(kind)) return json(res, 400, { error: `.${kind || "?"} files can't be attached. Use PDF, Word, Excel, CSV, text or an image.` });
          const data = Buffer.from(typeof b.data === "string" ? b.data : "", "base64");
          if (!data.length) return json(res, 400, { error: "That file is empty." });
          if (data.length > MAX_UPLOAD_BYTES) return json(res, 400, { error: "That file is over 15 MB." });
          const f = saveFile(name, data, "upload");
          logActivity({ kind: "system", job: "files", summary: `You attached "${f.name}" in chat` });
          return json(res, 200, { id: f.id, name: f.name, kind: f.kind, state: buildState() });
        }
        if (req.method === "GET" && (c = /^\/api\/files\/(\d+)$/.exec(path))) {
          const f = readFile(Number(c[1]));
          if (!f) return json(res, 404, { error: "That file is gone." });
          // Always a download, never rendered by the browser, so an uploaded HTML file can't run on this page.
          res.writeHead(200, { "content-type": mimeOf(f.row.kind), "content-disposition": `attachment; filename="${f.row.name.replace(/"/g, "")}"`, "x-content-type-options": "nosniff", "cache-control": "no-store" });
          return res.end(f.data);
        }
        if (req.method === "POST" && (c = /^\/api\/files\/(\d+)\/delete$/.exec(path))) {
          deleteFile(Number(c[1]));
          return json(res, 200, buildState());
        }

        if (req.method === "POST" && path === "/api/inquiries/ingest") {
          // For your website form. Requires API_TOKEN, so only your site can post here.
          if (!config.server.token) return json(res, 403, { error: "Set API_TOKEN in .env before letting a website post here." });
          const b = await body();
          const id = await runWebInquiry(deps, {
            name: String(b.name ?? ""), email: String(b.email ?? ""), phone: b.phone ? String(b.phone) : undefined, eventDate: b.eventDate ? String(b.eventDate) : undefined,
            venue: b.venue ? String(b.venue) : undefined, guests: typeof b.guests === "number" ? b.guests : undefined, service: b.service ? String(b.service) : undefined,
            message: b.message ? String(b.message) : undefined,
          });
          return json(res, 200, { ok: true, inquiryId: id });
        }
        if (req.method === "POST" && path === "/api/attachments/unlock") {
          // The password goes from your browser to here and no further: not to the model, the database or the logs.
          const b = await body();
          const n = Number(b.number);
          if (typeof b.threadId !== "string" || !Number.isInteger(n) || typeof b.password !== "string") return json(res, 400, { error: "Bad request." });
          try {
            const { filename } = await unlockAttachment(deps.mailbox, b.threadId.slice(0, 100), n, b.password.slice(0, 200), b.reuse === true);
            return json(res, 200, { ok: true, filename });
          } catch (e) {
            if (e instanceof UnlockError) return json(res, 422, { error: e.message });
            throw e;
          }
        }
        if (req.method === "POST" && path === "/api/run/inquiries") {
          await runTriage(deps, { days: 30 });
          return json(res, 200, buildState());
        }

        if (req.method === "POST" && path === "/api/run/triage") {
          await runTriage(deps);
          return json(res, 200, buildState());
        }
        return json(res, 404, { error: "Not found." });
      }

      // Dashboard files, with single-page-app fallback.
      if (existsSync(DIST)) {
        const safe = normalize(path).replace(/^(\.\.[/\\])+/, "");
        let file = join(DIST, safe);
        if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
        // The service worker and manifest must never be served stale, or updates will not reach the phone.
        const fresh = /(^|[/\\])(sw\.js|manifest\.webmanifest|index\.html)$/.test(file) || extname(file) === ".html";
        res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", ...(fresh ? { "cache-control": "no-cache" } : {}) });
        return res.end(readFileSync(file));
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("Opus API is running. Build the dashboard with: cd ../dashboard && npm run build");
    } catch (err) {
      console.error(err);
      if (err instanceof Bad) return json(res, 400, { error: err.message });
      if (reportIfAuthError(err)) return json(res, 502, { error: "Your Google login expired. Run npm run auth, update .env, and restart Opus." });
      json(res, 500, { error: err instanceof Error ? err.message : "Something went wrong." });
    }
  });

  server.listen(config.server.port, config.server.host, () => {
    console.log(`Opus is running at http://${config.server.host}:${config.server.port}`);
    if (config.server.host !== "127.0.0.1" && !config.server.token) {
      console.warn("WARNING: the server is reachable from the network and API_TOKEN is not set. Set one, and put the server behind Tailscale.");
    }
  });
  return server;
}
