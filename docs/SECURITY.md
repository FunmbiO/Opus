# Security

Opus reads your email and knows your money, so it is built to be reachable by you and nobody else.
This page says what protects it, what it assumes, and how to check.

## The main rule: keep the real Opus private
The live Opus is **not** meant to be on the public internet. In the Docker setup it listens on `127.0.0.1` inside a container
that shares a Tailscale container's network, so it is only reachable from your own devices ([DEPLOY.md](DEPLOY.md)).
`npm run check:deploy` fails if that ever changes.

If you want something to show on a public site (your portfolio), use the sample-data demo instead: [EMBED.md](EMBED.md).
It is a separate static build with no server and none of your data.

## Layers
**Who can get in**
- A password (12+ characters), sessions that expire, and a constant-time check for the access token.
- Sign-in lockout after repeated wrong tries, plus an alert in the dashboard and on your phone.
- The server answers only to host names you use (`localhost`, IP addresses, `*.ts.net`, and `ALLOWED_HOSTS`). This stops
  DNS-rebinding, where a hostile web page points its own domain at your private address.
- The caller's address is taken from `X-Forwarded-For` only when the connection comes from this machine, and only the
  last entry (the one our own proxy added). A forged header cannot dodge a limit or pass as local.
- The "set the first password from this PC" shortcut only works for a direct local connection, never a forwarded one.

**How much a caller can do** (per caller, per minute; `agent/src/security.ts`)
| Kind | Limit |
|---|---|
| Sign-in, first password, change password | 12 |
| Contract email send | 5 |
| Unlock a PDF, file upload | 10 each |
| Anything that calls the model (Ask, runs, approving) | 12, and at most 2 running at once |
| Website form ingest | 20 |
| Everything else in the API | 240 |
| Page and asset requests | 300 |

Over the limit gets `429` with `Retry-After`. Connections are also cut off if they are too slow
(headers 15 s, whole request 5 min), URLs over 2 KB are refused, and only GET, HEAD, POST, PUT and DELETE are accepted.

**What a page can do** (headers on every response)
- `Content-Security-Policy`: scripts only from Opus itself (and Plaid's Link script), no inline scripts, no `eval`,
  no plugins, `frame-ancestors 'none'` so no other site can put Opus in a frame (clickjacking).
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`
  (camera, microphone, location off), `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`.
- `Strict-Transport-Security` when the request came in over HTTPS.

**Injection**
- SQL: every query uses placeholders. One internal `VACUUM INTO` escapes its path.
- Email headers: values from incoming mail or from the model are checked for line breaks and encoded
  (`agent/src/mailsafe.ts`), so a crafted email cannot add a hidden Bcc to a draft or a contract email.
- Cross-site scripting: the dashboard has no `innerHTML`-style sinks, and uploaded files are always sent as downloads.
- Spreadsheets: text that starts with `=`, `+`, `-` or `@` is neutralised in generated CSV files.
- Files: static paths use a real path comparison and refuse hidden files, so they cannot escape the dashboard folder.
- Logs: control characters and line breaks are flattened in activity entries, so a subject line cannot forge log lines.
- Errors: a 500 never includes file paths, stack frames or database messages.
- Prompt injection: text from email and PDFs is passed to the model as untrusted data, and the model has no tool that can
  send, delete or cancel (`npm run safety`). The worst a malicious email can do is make a draft you then read.

## Checking it
```
cd agent
npm run check            # typecheck, email-safety rules, deploy rules
npm run test:security    # building blocks, then attacks against a running server
```
`test:security` starts the real server and tries malformed URLs, path traversal, a bad Host, oversized and malformed
bodies, forged forwarding headers, and floods. Each protection was also broken on purpose to confirm the tests notice.

## Things this does not cover
- Someone who already has your unlocked phone, your Tailscale account or the server itself.
- The in-memory rate limiter resets when Opus restarts, and is per caller address, not per account.
- Your Anthropic, Google and Plaid accounts. Use their own limits (a Console spend limit, Google's security checkup).
- The `uuid` advisory reported through `exceljs` is accepted: it concerns calls that pass a buffer to `v3`/`v5`/`v6`, which Opus
  never makes (it only generates random IDs). Forcing the fix would downgrade `exceljs` to a very old version.

## Reporting a problem
If you find a vulnerability, please use GitHub's private "Report a vulnerability" option on the repository's Security tab
instead of opening a public issue.
