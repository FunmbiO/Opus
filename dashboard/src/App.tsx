import { useCallback, useEffect, useState } from "react";
import type { Contract, Draft, JadedSettings, State } from "./types";
import { act, ApiError, bankLinkToken, load, openPdf, req, saveToken } from "./api";
import { forgetLink, openPlaid, rememberLink, savedLink } from "./plaid";
import { Clients, type ClientActions, type Edit } from "./views/Clients";
import { SignIn } from "./components/SignIn";
import { Icon } from "./components/Icons";
import { Today } from "./views/Today";
import { Subscriptions } from "./views/Subscriptions";
import { Approvals } from "./views/Approvals";
import { Activity } from "./views/Activity";
import { Ask } from "./views/Ask";
import { Budget, type BudgetActions } from "./views/Budget";
import type { MoneyActions } from "./views/Spending";
import { Palette, type Command } from "./components/Palette";
import { DraftDrawer } from "./components/Drawer";
import { OMark } from "./components/OMark";
import { Boot } from "./components/Boot";
import { calcTotals, money } from "./format";

type Theme = "system" | "light" | "dark";
const readTheme = (): Theme => { try { const t = localStorage.getItem("aide-theme"); return t === "light" || t === "dark" || t === "system" ? t : "dark"; } catch { return "dark"; } };
// The opening animation plays on every load, and again after you sign in.
const shouldBoot = () => true;

type Tab = "today" | "clients" | "ask" | "budget" | "subs" | "approvals" | "activity";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "today" },
  { id: "clients", label: "Clients", icon: "clients" },
  { id: "ask", label: "Ask", icon: "ask" },
  { id: "budget", label: "Budget", icon: "wallet" },
  { id: "subs", label: "Subscriptions", icon: "subs" },
  { id: "approvals", label: "Approvals", icon: "approve" },
  { id: "activity", label: "Activity", icon: "activity" },
];

export default function App() {
  const [s, setS] = useState<State | null>(null);
  const [needAuth, setNeedAuth] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [palette, setPalette] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [seed, setSeed] = useState("");
  const [boot, setBoot] = useState(shouldBoot);

  useEffect(() => {
    const el = document.documentElement;
    if (theme === "system") el.removeAttribute("data-theme"); else el.dataset.theme = theme;
    try { localStorage.setItem("aide-theme", theme); } catch { /* ignore */ }
  }, [theme]);
  const cycleTheme = () => setTheme((t) => (t === "system" ? "dark" : t === "dark" ? "light" : "system"));

  // Gold light that follows the pointer along panel borders.
  useEffect(() => {
    const f = (e: PointerEvent) => {
      const p = (e.target as HTMLElement).closest?.(".panel") as HTMLElement | null;
      if (!p) return;
      const r = p.getBoundingClientRect();
      p.style.setProperty("--mx", `${e.clientX - r.left}px`);
      p.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    window.addEventListener("pointermove", f);
    return () => window.removeEventListener("pointermove", f);
  }, []);

  // Keyboard: Ctrl/Cmd+K opens the palette. 1-6 switch pages when you are not typing.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); return; }
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= TABS.length) setTab(TABS[n - 1]!.id);
      if (e.key === "/") { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  const refresh = useCallback(async () => {
    const r = await load();
    setNeedAuth(r.error === "auth");
    setS((prev) => (prev && prev.mode === "demo" && r.state.mode === "demo" ? prev : r.state));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3200); };

  /** Runs on the agent when live. In the demo it just updates what you see. */
  const run = async (key: string, path: string, local: (p: State) => State, msg: string) => {
    if (!s) return;
    setBusy(key);
    try {
      if (s.mode === "demo") setS(local(s));
      else setS(await act(path));
      say(msg);
    } catch { say("That didn't work. Try again."); }
    finally { setBusy(null); }
  };

  /** Like run(), but shows the agent's own error message and reports success. */
  const exec = async (key: string, live: () => Promise<State>, local: (p: State) => State, msg: string): Promise<boolean> => {
    if (!s) return false;
    setBusy(key);
    try {
      setS(s.mode === "demo" ? local(s) : await live());
      say(msg);
      return true;
    } catch (e) {
      say(e instanceof ApiError || e instanceof Error ? e.message : "That didn't work. Try again.");
      return false;
    } finally { setBusy(null); }
  };

  /** Opens Plaid's window. After you finish (or come back from your bank's own page) Opus saves the link. */
  const runLink = async (token: string, itemId: string | null, receivedRedirectUri?: string) => {
    await openPlaid({
      token, receivedRedirectUri,
      onSuccess: (publicToken, institution) => {
        forgetLink();
        if (itemId) void exec("bank", () => req("POST", "bank/sync"), (p) => p, "Signed in again");
        else void exec("bank", () => req("POST", "bank/exchange", { publicToken, institution }), (p) => p, "Linked. Opus is loading your history, which can take a minute.");
      },
      onExit: (err) => { forgetLink(); if (err) say(err); },
    });
  };
  const bankLink = async (itemId?: string) => {
    if (s?.mode === "demo") { say("Linking needs the live agent (npm run serve)."); return; }
    setBusy("bank");
    try {
      const t = await bankLinkToken(itemId);
      if (t.mock) { await exec("bank", () => req("POST", "bank/demo"), (p) => p, "Demo bank linked"); return; }
      rememberLink(t.linkToken, itemId ?? null);
      await runLink(t.linkToken, itemId ?? null);
    } catch (e) { say(e instanceof Error ? e.message : "Could not start linking."); }
    finally { setBusy((b) => (b === "bank" ? null : b)); }
  };

  // Some banks send you to their own site to sign in, then back here with ?oauth_state_id=...
  const [resumed, setResumed] = useState(false);
  useEffect(() => {
    if (resumed || !s || s.mode !== "live" || needAuth) return;
    setResumed(true);
    if (!new URLSearchParams(window.location.search).has("oauth_state_id")) return;
    const saved = savedLink();
    setTab("budget");
    if (!saved) { say("That bank sign-in expired. Press Link again."); return; }
    const here = window.location.href;
    window.history.replaceState(null, "", window.location.pathname);
    void runLink(saved.token, saved.itemId, here);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, needAuth, resumed]);

  if (!s) return <div className="boot"><div className="spinner" /></div>;

  if (needAuth) return <SignIn onDone={refresh} />;
  if (settingUp) return <SignIn onDone={() => { setSettingUp(false); refresh(); }} onCancel={() => setSettingUp(false)} />;

  const pending = s.approvals.filter((a) => a.status === "pending").length;
  const openClients = s.clients.filter((c) => c.stage === "new" || c.stage === "replied" || c.stage === "contract").length;

  const decide = (id: string, action: "approve" | "dismiss") =>
    run(id, `approvals/${id}/${action}`, (p) => ({
      ...p,
      approvals: p.approvals.map((a) => a.id === id ? { ...a, status: action === "approve" ? "approved" : "dismissed", result: action === "approve" ? "Prepared. (Demo)" : null } : a),
    }), action === "approve" ? "Preparing it now" : "Dismissed");

  /** Put a "not now" back in the queue. Uses exec() so a refusal (already queued) shows the agent's own message. */
  const undo = (id: string) =>
    exec(id, () => act(`approvals/${id}/undo`), (p) => ({
      ...p,
      approvals: p.approvals.map((a) => a.id === id && a.status === "dismissed" ? { ...a, status: "pending", result: null } : a),
    }), "Put back in the queue");

  const keep = (id: string) =>
    run(id, `subscriptions/${id}/keep`, (p) => ({ ...p, subscriptions: p.subscriptions.map((x) => x.id === id ? { ...x, verdict: "keep", userDecided: true } : x) }), "Marked as keep");

  const prepare = (id: string) =>
    run(id, `subscriptions/${id}/prepare`, (p) => {
      const sub = p.subscriptions.find((x) => x.id === id);
      return { ...p, approvals: [{ id: `ap-${id}-${Date.now()}`, kind: "cancel", title: `Prepare cancellation: ${sub?.name}`, reason: "You asked for this.", subscriptionId: id, createdAt: p.now, status: "pending" }, ...p.approvals] };
    }, "Added to your approval queue");

  const dismissAlert = (id: string) =>
    run(id, `alerts/${id}/dismiss`, (p) => ({ ...p, alerts: p.alerts.filter((a) => a.id !== id) }), "Dismissed");

  const runTriage = () => run("triage", "run/triage", (p) => p, "Inbox sorted");

  const mapContract = (p: State, id: number, fn: (c: Contract) => Contract): State => ({
    ...p, clients: p.clients.map((c) => (c.contract?.id === id ? { ...c, contract: fn(c.contract) } : c)),
  });
  const withTotals = (c: Contract): Contract => ({ ...c, totals: calcTotals(c.items, c.discount, c.taxRate, c.depositPct) });

  const clientActions: ClientActions = {
    busy,
    scan: () => { exec("scan", () => req("POST", "run/inquiries"), (p) => p, "Scan finished"); },
    saveContract: (id, edit: Edit) =>
      exec(`save${id}`, () => req("PUT", `contracts/${id}`, edit), (p) => mapContract(p, id, (c) => withTotals({ ...c, ...edit, updatedAt: new Date().toISOString(), problems: /\[CONFIRM/.test(edit.terms) ? ['Fill in the placeholder in the terms: [CONFIRM: …]'] : [] })), "Saved"),
    send: (c) =>
      exec(`send${c.id}`, () => req("POST", `contracts/${c.id}/send`, { approved: true, to: c.clientEmail, version: c.updatedAt }),
        (p) => ({ ...mapContract(p, c.id, (k) => ({ ...k, status: "sent", sentAt: p.now, sentTo: k.clientEmail })), clients: p.clients.map((x) => (x.contract?.id === c.id ? { ...x, stage: "sent", contract: { ...x.contract!, status: "sent", sentAt: p.now, sentTo: x.contract!.clientEmail } } : x)) }),
        "Contract sent. (Demo: nothing really went out.)"),
    startContract: (inquiryId, packageId) =>
      exec(`start${inquiryId}`, () => req("POST", `inquiries/${inquiryId}/contract`, { packageId }), (p) => p, "Contract created"),
    outcome: (inquiryId, outcome) => {
      exec(`out${inquiryId}`, () => req("POST", `inquiries/${inquiryId}/outcome`, { outcome }), (p) => ({ ...p, clients: p.clients.map((c) => (c.id === inquiryId ? { ...c, stage: outcome ?? (c.contract?.status === "sent" ? "sent" : c.contract ? "contract" : c.draft ? "replied" : "new") } : c)) }), outcome ? `Marked as ${outcome}` : "Reopened");
    },
    saveSettings: (next: JadedSettings) => exec("settings", () => req("PUT", "settings/jaded", next), (p) => ({ ...p, jaded: next }), "Pricing and terms saved"),
    remove: (inquiryId) =>
      exec(`del${inquiryId}`, () => req("POST", `inquiries/${inquiryId}/delete`, { confirmed: true }), (p) => ({ ...p, clients: p.clients.filter((c) => c.id !== inquiryId) }), "Client deleted"),
    pdf: (id) => { if (s.mode === "demo") say("PDF preview needs the live agent."); else openPdf(id).catch(() => say("Could not build the PDF.")); },
  };

  const demoNote = (p: State) => p;
  const fin = (key: string, path: string, method: "POST" | "PUT", body: unknown, msg: string) =>
    exec(key, () => req(method, path, body), demoNote, s.mode === "demo" ? "Saving needs the live agent (npm run serve)." : msg);
  const budgetActions: BudgetActions = {
    addLine: (kind, name, amount) => fin("bl", "budget/lines", "POST", { kind, name, amount }, "Added"),
    updateLine: (id, name, amount) => fin(`bl${id}`, `budget/lines/${id}`, "PUT", { name, amount }, "Saved"),
    removeLine: (id) => fin(`bl${id}`, `budget/lines/${id}/remove`, "POST", {}, "Removed"),
    addGoal: (g) => fin("bg", "budget/goals", "POST", g, "Goal added"),
    setAside: (id, amount) => fin(`bg${id}`, `budget/goals/${id}/setaside`, "POST", amount === undefined ? {} : { amount }, "Logged. It counts toward your goal."),
    undoSetAside: (id) => fin(`bg${id}`, `budget/goals/${id}/undo`, "POST", {}, "Undone"),
    updateGoal: (id, g) => fin(`bg${id}`, `budget/goals/${id}`, "PUT", g, "Saved"),
    removeGoal: (id) => fin(`bg${id}`, `budget/goals/${id}/remove`, "POST", {}, "Goal removed"),
    addBill: (name, amount, cycle) => fin("bb", "bills", "POST", { name, amount, cycle }, "Bill added"),
    removeBill: (id) => fin(`bb${id}`, `bills/${encodeURIComponent(id)}/remove`, "POST", {}, "Bill removed"),
    savePay: (b) => fin("pay", "pay", "POST", b, "Saved. Opus is using your pay."),
    clearPay: () => exec("pay", () => req("DELETE", "pay"), demoNote, s.mode === "demo" ? "Saving needs the live agent." : "Pay cleared"),
    ask: (q) => { setTab("ask"); setSeed(q); },
  };

  const moneyActions: MoneyActions = {
    link: bankLink,
    sync: () => exec("bank", () => req("POST", "bank/sync"), (p) => p, s.mode === "demo" ? "Needs the live agent." : "Checked for new purchases"),
    track: (id, tracked) => exec(`acc${id}`, () => req("POST", `bank/accounts/${encodeURIComponent(id)}/track`, { tracked }), (p) => p, tracked ? "Tracking again. Missing purchases are being filled in." : "No longer tracked"),
    disconnect: (id) => exec("bank", () => req("POST", `bank/items/${encodeURIComponent(id)}/disconnect`, { confirmed: true }), (p) => p, "Unlinked. Its saved transactions are deleted."),
    setCategory: (id, category, wholeVendor) => exec(`tx${id}`, () => req("POST", `transactions/${encodeURIComponent(id)}/category`, { category, wholeVendor }), (p) => p, s.mode === "demo" ? "Saving needs the live agent." : "Category changed"),
    busy,
    ask: (q) => { setTab("ask"); setSeed(q); },
  };
  const askOpus = (q: string) => { setTab("ask"); setSeed(q); };
  const commands: Command[] = [
    ...TABS.map((t, i) => ({ id: `go-${t.id}`, label: `Go to ${t.label}`, group: "Pages", icon: t.icon, hint: String(i + 1), run: () => setTab(t.id) })),
    { id: "scan", label: "Scan for client inquiries", group: "Actions", icon: "refresh", run: () => { setTab("clients"); clientActions.scan(); } },
    ...s.clients.map((c) => ({ id: `cl-${c.id}`, label: c.name || c.email, group: "Clients", icon: "clients", run: () => setTab("clients") })),
    { id: "triage", label: "Sort inbox now", group: "Actions", icon: "refresh", run: runTriage },
    { id: "theme", label: `Theme: ${theme === "system" ? "match system (switch to dark)" : theme === "dark" ? "dark (switch to light)" : "light (switch to system)"}`, group: "Actions", icon: theme === "light" ? "sun" : "moon", run: cycleTheme },
    ...s.subscriptions.map((x) => ({ id: `sub-${x.id}`, label: x.name, group: "Subscriptions", icon: "subs", hint: x.amount != null ? money(x.amount) : undefined, run: () => { setQuery(x.name); setTab("subs"); } })),
    ...s.drafts.map((d) => ({ id: `dr-${d.id}`, label: d.subject || "Draft", group: "Drafts", icon: "draft", run: () => { setTab("today"); setDraft(d); } })),
  ];

  return (
    <div className="shell">
      {boot && <Boot onDone={() => setBoot(false)} />}
      <aside className="nav">
        <div className="brand"><OMark bold size={30} />Opus</div>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "nav-item on" : "nav-item"} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} />
              <span>{t.label}</span>
              {t.id === "approvals" && pending > 0 && <b className="badge">{pending}</b>}
              {t.id === "clients" && openClients > 0 && <b className="badge">{openClients}</b>}
            </button>
          ))}
        </nav>
        <div className="side-spend">
          <div className="ss-row"><span>API spend</span><b>{money(s.spend.monthUsd)}<small> of {money(s.spend.targetUsd, 0)}</small></b></div>
          <div className="ss-bar"><i style={{ width: `${Math.min(100, (s.spend.monthUsd / s.spend.targetUsd) * 100)}%` }} /></div>
        </div>
        <div className="side-tools">
          <button onClick={() => setPalette(true)} className="kbtn"><Icon name="search" size={15} />Search or jump <kbd>Ctrl K</kbd></button>
          <button onClick={cycleTheme} className="kbtn" aria-label="Change theme"><Icon name={theme === "light" ? "sun" : "moon"} size={15} />Theme: {theme}</button>
        </div>
        <div className={`mode ${s.mode}`}>
          <i />{s.mode === "live" ? "Connected to your agent" : "Preview with sample data"}
        </div>
      </aside>

      <main>
        <div className="topbar">
          <div className="brand"><OMark bold size={30} />Opus</div>
          <div><button className="icon-btn" onClick={() => setPalette(true)} aria-label="Search"><Icon name="search" /></button><button className="icon-btn" onClick={cycleTheme} aria-label="Change theme"><Icon name={theme === "light" ? "sun" : "moon"} /></button></div>
        </div>
        {s.mode === "live" && !s.security.passwordSet && (
          <div className="banner warn">
            <span>Opus has no password yet, so anyone who can reach this page can use it.</span>
            <button className="btn small" onClick={() => setSettingUp(true)}>Set a password</button>
          </div>
        )}
        {s.mode === "demo" && (
          <div className="banner">Preview mode. Your subscriptions and alerts are real (from your inbox audit). Drafts, activity, spend and the weekly chart are samples.</div>
        )}
        {tab === "today" && <Today s={s} go={(t) => setTab(t)} dismissAlert={dismissAlert} runTriage={runTriage} busy={busy === "triage"} openDraft={setDraft} />}
        {tab === "clients" && <Clients s={s} a={clientActions} />}
        {tab === "ask" && <Ask s={s} onState={setS} seed={seed} clearSeed={() => setSeed("")} />}
        {tab === "budget" && <Budget s={s} a={budgetActions} m={moneyActions} start={s.money.accounts.length > 0 || s.money.configured ? "spending" : "plan"} />}
        {tab === "subs" && <Subscriptions s={s} keep={keep} prepare={prepare} query={query} setQuery={setQuery} />}
        {tab === "approvals" && <Approvals s={s} decide={decide} undo={undo} busy={busy} />}
        {tab === "activity" && <Activity s={s} onState={setS} onSignedOut={refresh} />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
            {t.id === "approvals" && pending > 0 && <b className="badge">{pending}</b>}
            {t.id === "clients" && openClients > 0 && <b className="badge">{openClients}</b>}
          </button>
        ))}
      </nav>

      {palette && <Palette commands={commands} onClose={() => setPalette(false)} onAsk={askOpus} />}
      {draft && <DraftDrawer draft={draft} now={s.now} onClose={() => setDraft(null)} onDismiss={() => { const id = draft.id; setDraft(null); run(`d${id}`, `drafts/${id}/dismiss`, (p) => ({ ...p, drafts: p.drafts.filter((x) => x.id !== id) }), "Removed from the list"); }} />}

      <div className={toast ? "toast show" : "toast"} role="status">{toast}</div>
    </div>
  );
}
