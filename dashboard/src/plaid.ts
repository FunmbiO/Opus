/** Opens Plaid's own sign-in window. Your bank password goes to Plaid and your bank, never to Opus. */

interface Handler { open(): void; destroy(): void }
declare global { interface Window { Plaid?: { create(cfg: Record<string, unknown>): Handler } } }

let loading: Promise<void> | null = null;
function loadPlaid(): Promise<void> {
  if (window.Plaid) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("Could not load Plaid. Check your internet connection.")); };
    document.head.appendChild(s);
  });
  return loading;
}

export const LINK_KEY = "aide-plaid-link";
export const rememberLink = (token: string, itemId: string | null) => { try { localStorage.setItem(LINK_KEY, JSON.stringify({ token, itemId })); } catch { /* private mode */ } };
export const forgetLink = () => { try { localStorage.removeItem(LINK_KEY); } catch { /* ignore */ } };
export function savedLink(): { token: string; itemId: string | null } | null {
  try { const v = JSON.parse(localStorage.getItem(LINK_KEY) ?? "null"); return v && typeof v.token === "string" ? v : null; } catch { return null; }
}

export async function openPlaid(o: {
  token: string; receivedRedirectUri?: string;
  onSuccess: (publicToken: string, institution: string) => void;
  onExit: (error: string | null) => void;
}) {
  await loadPlaid();
  const handler = window.Plaid!.create({
    token: o.token,
    ...(o.receivedRedirectUri ? { receivedRedirectUri: o.receivedRedirectUri } : {}),
    onSuccess: (publicToken: string, meta: { institution?: { name?: string } | null }) => { o.onSuccess(publicToken, meta?.institution?.name ?? ""); handler.destroy(); },
    onExit: (err: { display_message?: string; error_message?: string } | null) => { o.onExit(err ? (err.display_message || err.error_message || "Linking stopped.") : null); handler.destroy(); },
  });
  handler.open();
}
