# Setup

## 1. Anthropic key
console.anthropic.com → API keys → create. Then Settings → Limits → set a monthly spend limit (e.g. $50). That is your hard backstop; Opus's own guard alerts at $100 and stops there.
Put it in `agent/.env` (copy `.env.example`): `ANTHROPIC_API_KEY=...`

## 2. Gmail
1. console.cloud.google.com → new project → enable Gmail API.
2. OAuth consent screen: External, add yourself as test user. Scopes: `gmail.readonly`, `gmail.compose`.
3. Credentials → OAuth client ID → Desktop app. Put id/secret in `.env`.
4. `npm run auth` and approve in the browser; copy the refresh token into `.env`.
Note: Google's `gmail.compose` scope technically permits sending. Opus's guarantee comes from its code (no send function exists), not from the scope.

## 3. Phone alerts (optional)
Telegram → @BotFather → /newbot → token; message your bot, then get your chat id from `https://api.telegram.org/bot<TOKEN>/getUpdates`. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

## 4. Run
`cd dashboard && npm install && npm run build`, then `cd agent && AUTORUN=1 npm run serve`. Open http://127.0.0.1:8787.
Triage runs every 15 min, subscription scan Mondays. First run: `npm run seed` loads your audit.

## 5. Make drafts sound like you
Edit `agent/style.md`. Review the first drafts closely; the `[CONFIRM: ...]` markers show facts the model refused to guess.

## 6. Later: home server
Run in Docker on the box, keep `HOST=127.0.0.1`, reach it through Tailscale, set `API_TOKEN`. Never expose the port to the internet.

## Caveats
Not yet tested against a real API key or Gmail. Amounts in the audit are assumed CAD. Draft quality is unverified until you try it.

## Ask page (chat)
Type a request on the Ask page: "reply to the wedding enquiry", "find my Apple receipts", "search the web for ...". It can read Gmail, search the web, and save drafts. It cannot send, delete or cancel (those tools don't exist). The only email Opus sends is a contract you approve by hand on the Clients page.
- Web search is billed about 1 cent per search on top of tokens, capped at 4 per message. If it errors, check that web search is enabled for your organisation in the Anthropic Console.
- Each message is capped at $0.40. The cost shows under each answer.
- Web pages and emails are treated as untrusted. The worst a hostile page can do is cause a wrong draft, because drafts are all it can write.

## Google login reminder

While your Google app is in Testing mode, the login expires every 7 days. Opus tracks this itself:

- From day 5 it shows a banner on Today and pings you (Telegram if set up, otherwise the terminal).
- If Google rejects the login anyway, it shows "Google login expired" instead of a cryptic error.
- To renew: `npm run auth` in the agent folder, paste the new `GOOGLE_REFRESH_TOKEN` into `.env`, restart Opus. The 7-day clock restarts by itself.

Opus can only remind you while it is running. For phone pings, set up Telegram.

## Business: inquiries and contracts

**Finding inquiries.** Opus already reads your inbox. Anything it files under the business category is checked: if it is a new person asking to hire you, Opus records the inquiry, builds a contract draft from your price list, and saves a reply draft in Gmail. Website form emails work the same way. Press **Scan for inquiries** on the Clients page to look back 30 days.

If your site can post to Opus directly, send JSON to `POST /api/inquiries/ingest` with `Authorization: Bearer <API_TOKEN>` and fields `name, email, phone, eventDate (YYYY-MM-DD), venue, guests, service (package id), message`. This needs `API_TOKEN` set, and Opus must be reachable from your site (it is not, by default, because it only listens on your own PC).

**Prices.** Clients > Pricing & terms. Opus can only pick a package from that list; it never types a price. Defaults are the midpoints of your portfolio rates ($1,000 / $1,200 / $1,900) and a 30% retainer. Change them.

**The contract.** Open a client. Edit anything: names, date, venue, line items, discount, tax, retainer, the terms text, and the cover email. Preview PDF shows exactly what will be attached.

**Sending.** Opus never sends replies or contracts on its own. The contract email goes out only when you tick the box and press Approve and send on that client's page. Before that, it checks: saved, valid email, date, venue, a price, and no `[CONFIRM: ...]` placeholders left. It sends only to the address on the contract, and only the version you approved. After sending, the contract locks.

The default terms are a starting template, not legal advice. Read them, and have them checked before you rely on them. `[CONFIRM: delivery timeline]` is left in on purpose so you set it once.

**Your website.** The contact form emails you, so inquiries arrive through Gmail and Opus handles them there. No extra setup. Opus knows you also do automotive and business work: for those it records the inquiry and drafts a reply asking about scope, but it does not quote prices or create a contract, because the price list is wedding-only. You can still start a contract by hand on any client's page and change the event type.

## On your phone

See `docs/PHONE.md`: Tailscale plus "Add to Home Screen" makes Opus work like an app.

## Attachments

Opus lists the attachments in every email thread it reads and can open them: PDF (with selectable text), Word (.docx), Excel (.xlsx), CSV and text files, and JPEG/PNG/GIF/WebP images. It uses this when drafting replies, handling inquiries, and on the Ask page ("what's in the PDF Priya sent?").

It can't read scanned PDFs, old .doc/.xls/.ppt files, HEIC photos, or files over 15 MB. It says so and points you to Gmail. Text is capped at about 12,000 characters per file to keep costs down. Attachment contents are treated as untrusted data, like email text. Reading is read only: nothing is saved, forwarded or changed.

After updating, run `npm install` once (three new packages).

## Password-protected attachments

If Opus opens a PDF that is locked (like a paystub), the Ask page shows a private "Unlock" box under its reply. Type the password there, not in the chat.

- The password goes from your browser straight to the agent on your PC. It never reaches Claude, the chat history, the database or the logs, and it is not saved.
- Opus gets the file's text only, and only for 15 minutes in memory. After that you unlock it again.
- Tick "Use this for the other locked files too" to unlock a batch (like 20 paystubs) with one entry. It is kept in memory for 15 minutes and never given to Opus.
- Five wrong tries on one file locks that file for ten minutes.
- It works for locked PDFs only. Locked Word and Excel files, and scans, are not supported.

## Budget, bills and savings

The **Budget** tab shows what is left each month after your subscriptions and bills, planned spending and saving. Add what you earn, planned spending lines and savings goals. Subscriptions and bills are counted automatically (yearly and weekly ones become a monthly amount). Opus can read the budget in chat ("what can I afford?") but only you change it. Your bill list was added once on first start; anything Opus already tracked was skipped as a duplicate.

## Files: attach, read, write

- The **+** button in Ask attaches a PDF, Word, Excel, CSV, text or image file (15 MB each, up to 5 at a time). Opus can read it, including scanned PDFs.
- Ask Opus to make a Word, PDF, Excel, CSV or text file. It is saved in `data/files` and appears in the chat with a Download button. Opus never changes your attached original: edits are saved as a new file.
- **Your files** (under the chat box) lists everything and lets you delete files.

## Deleting a client

Open a client and choose **Delete this client** at the bottom. It removes Opus's record (inquiry and contract draft) only. Gmail is never touched, and Opus has no way to do this itself.

## v16: dynamic savings, notes, backups, login throttle

**Savings goals.** Add a goal with a target and a date. You never enter a monthly amount. Opus works out what to set aside this month
(what is still missing at the start of the month, divided by the months left), checks it against your income minus bills, planned
spending and goals due sooner, and says whether you can afford it. Tick the box when you've set the money aside and it counts toward the goal.
If you only managed part, choose "I set aside a different amount"; the shortfall is spread over the months left. Undo removes the entry.
A goal with no date plans half of your free money. Enter your income on the Budget page or Opus can't judge affordability.

**What Opus knows about you.** Short notes in the Ask tab. Opus adds one when you tell it something lasting in chat; you can add or delete any.
Notes with numbers that look like secrets (passwords, PINs, card numbers) are refused.

**Backups.** The database is copied daily to `data/backups` (newest 14 kept). Activity tab has "Back up now".

**Login throttle.** 10 wrong tokens in a minute from one address locks that address out for up to a minute.

## v17: logo

The brass diamond stays as the small badge (tab icon, phone home-screen icon, phone top bar, next to the name in the sidebar).
The car is the large mark: the sidebar, the top of Today, the sign-in screen and the opening animation.

## v18: password sign-in and encryption

**Sign-in.** The first time you open the dashboard it asks you to set a password (12+ characters). It proves it's you with your old
access token (API_TOKEN) one last time. After that the old token no longer opens the dashboard; its only remaining job is letting
your website form post inquiries. Each device gets its own session that lasts 30 days (14 if unused). In Activity you can change the
password, sign out other devices, or sign out. Forgot it? On the PC, in `C:\aide\agent`: `npm run password`.

**Wrong-guess alert.** 10 wrong tries in a minute locks that address out for a minute, adds a red alert on Today, and sends a Telegram
message if you set Telegram up.

**Encryption.** Saved files, backups and (optionally) the secrets in `.env` are encrypted with a key that is NOT in `C:\aide`. On Windows it
lives in `%LOCALAPPDATA%\Opus`, locked to your Windows login (DPAPI). Copying the aide folder, a backup or `.env` is useless without it.
- Run `npm run protect` once to seal the secrets in `.env` (the old file is kept as `.env.before-protect`; delete it after Opus starts fine).
- Run `npm run restore -- data\backups\<file>.db.enc` to open a backup into `data\restored.db`.
- BACK UP THE KEY. If you lose `%LOCALAPPDATA%\Opus` (reinstalling Windows, a new PC), encrypted files and backups cannot be opened. Copy that folder
  to a USB stick or password manager. If Windows ever couldn't wrap the key, Opus falls back to a key file in the same folder and says so at startup.
- The live database itself is a normal SQLite file (Node's built-in SQLite can't encrypt). Turn on BitLocker for the whole drive.

**v18.1.** If no password is set yet, a red banner on every page has a "Set a password" button. With no API_TOKEN configured, the first password can only be set from the PC Opus runs on (so a stranger on your network can't claim it first). `npm run password` always works.

**v18.2.** The opening animation now plays in full on every load, and after you sign in. A key press or tap can't cut it short; skipping only works once the name is on screen (about 2 seconds in).

## v19: live card spending (TD, read only)

Opus links to your TD cards through Plaid, logs every purchase with the vendor name, sorts it into a category, and ties it to your budget.
It can only READ. Nothing in Opus can move money, and your bank password goes to Plaid and TD, never to Opus.

**One-time setup**
1. Make a free developer account at plaid.com.
2. In `C:\aide\agent\.env` add `PLAID_CLIENT_ID=...` and `PLAID_SECRET=...` (from the Plaid dashboard) and keep `PLAID_ENV=sandbox` to start.
3. Restart Opus. Open Budget, then Spending, and press Link a bank. In sandbox, pick any bank and sign in with `user_good` / `pass_good` to see how it works.
4. When you're happy, switch to your real bank: put your Production secret in `.env`, set `PLAID_ENV=production`, restart, and link TD Canada Trust.
   Plaid may ask you to complete a short application before it gives Production access. Then run `npm run protect` to seal the new secret.
5. Plaid's sign-in window needs a secure (https) address in Production. Easiest on your setup: let Tailscale give Opus https with
   `tailscale serve --bg 8787` (turn on HTTPS in the Tailscale admin console first) and open Opus at the `https://...ts.net` address it prints.
   Some banks send you to their own site to sign in and back again. If TD does, add that https address as `PLAID_REDIRECT_URI` in `.env` and register
   the same address under Redirect URIs in the Plaid dashboard.

**What you get** (Budget has two views now: Spending, and Plan and goals)
- Spent today, spent this month, and how much of your free-to-spend money is left (needs your income under Plan).
- Every purchase with the vendor as you'd say it ("Esso", not "ESSO 1873 DIEPPE NB"), pending charges marked, and a category.
- Categories come from your own edits first, then vendors Opus knows (Esso, Sobeys, Tim Hortons, Fido...), then TD's own label, then Claude for
  anything left. Claude only sees the vendor name, never amounts or accounts, and each answer is remembered, so a vendor costs a fraction of a cent once.
  Opus's guesses show with a dashed "?" label. Tap any category to change it. By default the change applies to every purchase from that vendor, now and in future.
- Both cards are tracked by default. Switch a card off under Cards and accounts to stop tracking it (nothing new is saved, its purchases are hidden). Switch it back on and the history returns.
- Transfers, card payments and pay are shown dimmed and not counted as spending.
- Your Planned spending lines (Groceries, Gas, Dining...) show how much is spent against them, and go red when over.
- Charges that match a subscription or bill update when it was last seen. A different price than you have on file raises an alert (it never changes your list).
- Ask Opus in chat: "what did I spend on gas this month?", "how much at Tim Hortons?" It reads your spending; it can't change anything.

**Settings in `.env`**: `BANK_SYNC_MIN=10` (how often to check for new purchases) and `BANK_ALERT_OVER=200` (a phone alert for a new charge this big, once Telegram is set up; 0 turns it off).

**Good to know**
- New purchases show up minutes to hours after the tap, as "pending" first. Some banks don't report pending at all.
- If TD asks for a fresh sign-in, a banner appears with a "Sign in again" button.
- Unlinking a bank deletes every transaction Opus saved from it and removes Opus's access at Plaid.
- Transactions are stored in the normal database, so BitLocker on the drive protects them. The bank access token itself is stored encrypted.
- Tested here against a stand-in for Plaid and a demo bank. It has not been tried against your real TD login yet.

## v20: Opus knows your payday

Opus keeps a pay clock. Tell it your last payday under Budget, Payday, Edit (or put it in `seed/pay.json`), and it works out the rest.

- **Months use real paydays.** Income for a month is your paycheque times the paydays in that month. That is 2 in most months and 3 in Dec 2026 and Jul 2027. Any income line named like your paycheque is replaced by this; other income lines (side income) are still added.
- **Paycheque amount** follows your latest Income deposit from the bank. Type a fixed amount under Budget, Payday, Edit if you prefer.
- **Safe until payday**: your free money left this month, paced per day, times the days to the next payday. Bills landing before payday are listed.
- **Month-end outlook**: from day 5 of the month, Opus projects where your free money lands at your current pace.
- **Alerts**: pay not in the bank 2+ days after payday, and a heads-up in a 3-payday month.
- **Re-learning**: if your deposits change rhythm, set the last payday again under Edit. "Forget my pay" clears it; Opus may re-learn it from deposits after the next bank sync.


## Your personal setup (seed/)

Nothing personal lives in the code. Copy the example files in `seed/` and edit the copies; yours are gitignored:

| File | What it holds |
| --- | --- |
| `seed/profile.json` | Your name, a line about you, your business, used in Opus's instructions |
| `seed/business.json` | Business name, email, phone, packages, prices, contract terms |
| `seed/bills.json` | Your fixed bills, loaded once |
| `seed/pay.json` | Your last payday and cycle (`everyDays` 7 or 14), loaded once |
| `seed/audit.json` | An optional first subscription list |
| `agent/style.md` | Your writing voice (copy `agent/style.example.md`) |

Without them Opus uses the examples. Opus also learns your pay from your bank deposits once TD is linked.
