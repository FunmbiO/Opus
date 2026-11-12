import type { State } from "./types";
import { DEMO_BUILD } from "./mode";
import { demoState } from "./demo";

const TOKEN_KEY = "aide-token";

/** The only way this file talks to the network. In the public demo build it always refuses, so the demo cannot reach any server. */
const netFetch: typeof fetch = DEMO_BUILD ? () => Promise.reject(new Error("This is a demo, so nothing is sent anywhere.")) : (...a) => fetch(...a);
const token = () => { try { return localStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } };
export const clearToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };
export const saveToken = (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* private mode */ } };

async function call(path: string, method = "GET"): Promise<State> {
  const t = token();
  const res = await netFetch(path, { method, headers: t ? { authorization: `Bearer ${t}` } : {} });
  if (res.status === 401) throw new Error("auth");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) throw new Error("not-api"); // e.g. static preview returns index.html
  return (await res.json()) as State;
}

export async function load(): Promise<{ state: State; error?: string }> {
  if (DEMO_BUILD) return { state: demoState() };
  try { return { state: await call("/api/state") }; }
  catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return { state: demoState(), error: msg === "auth" ? "auth" : undefined };
  }
}

export class ApiError extends Error {
  constructor(message: string, public problems: string[] = []) { super(message); }
}

/** JSON request that returns fresh state. Errors carry the agent's message. */
export async function req(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<State> {
  const t = token();
  const res = await netFetch(`/api/${path}`, {
    method,
    headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `HTTP ${res.status}`, (data as { problems?: string[] }).problems);
  return data as State;
}

/** Opens the contract PDF the agent builds, in a new tab. */
export async function openPdf(id: number) {
  const t = token();
  const res = await netFetch(`/api/contracts/${id}/pdf`, { headers: t ? { authorization: `Bearer ${t}` } : {} });
  if (!res.ok) throw new ApiError("Could not build the PDF.");
  window.open(URL.createObjectURL(await res.blob()), "_blank");
}

/** Sends a decision. In demo mode (no agent) the caller applies it locally instead. */
export const act = (path: string) => call(`/api/${path}`, "POST");

export interface PasswordRequest { threadId: string; number: number; filename: string; subject: string }
export interface AskReply { passwordRequests?: PasswordRequest[]; documents?: { id: number; name: string; kind: string; size: number }[]; reply: string; drafts: { subject: string; viewUrl: string | null }[]; steps?: string[]; costUsd: number; state?: State }

export async function ask(message: string, history: { role: "user" | "assistant"; content: string }[]): Promise<AskReply> {
  const t = token();
  const res = await netFetch("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: JSON.stringify({ message, history }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as AskReply;
}

/** Sends the password straight to the agent. It is never put in the chat, and the model never sees it. */
export async function unlockAttachment(threadId: string, number: number, password: string, reuse = false): Promise<void> {
  const t = token();
  const res = await netFetch("/api/attachments/unlock", {
    method: "POST",
    headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: JSON.stringify({ threadId, number, password, reuse }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
}

/** Attaches a file to the chat. Returns its id, which the message mentions so Opus can read it. */
export async function uploadFile(file: File): Promise<{ id: number; name: string; state: State }> {
  const t = token();
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read that file."));
    r.readAsDataURL(file);
  });
  const res = await netFetch("/api/files/upload", {
    method: "POST",
    headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: JSON.stringify({ name: file.name, data }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as { id: number; name: string; state: State };
}

/** Downloads a file Opus made (or one you attached). */
export async function downloadFile(id: number, name: string) {
  const t = token();
  const res = await netFetch(`/api/files/${id}`, { headers: t ? { authorization: `Bearer ${t}` } : {} });
  if (!res.ok) throw new Error("That file is gone.");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---- Sign-in ----------------------------------------------------------------------

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const t = token();
  const res = await netFetch(path, { method: "POST", headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(String(data.error ?? `HTTP ${res.status}`));
  return data;
}

export async function authStatus(): Promise<{ passwordSet: boolean; hasToken: boolean } | null> {
  try {
    const r = await netFetch("/api/auth/status");
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return null;
    return (await r.json()) as { passwordSet: boolean; hasToken: boolean };
  } catch { return null; }
}
export async function signIn(password: string) { saveToken(String((await post("/api/auth/login", { password })).token)); }
export async function firstPassword(accessToken: string, password: string) { saveToken(String((await post("/api/auth/setup", { token: accessToken, password })).token)); }
export async function signOut() { try { await post("/api/auth/logout", {}); } catch { /* already out */ } clearToken(); }
export const signOutOthers = () => req("POST", "auth/logout-others");
export const changePassword = (current: string, next: string) => req("POST", "auth/password", { current, next });

// ---- Bank ---------------------------------------------------------------------------

export async function bankLinkToken(itemId?: string): Promise<{ linkToken: string; mock: boolean; redirect: boolean }> {
  const r = await post("/api/bank/link-token", itemId ? { itemId } : {});
  return { linkToken: String(r.linkToken), mock: r.mock === true, redirect: r.redirect === true };
}
