# Changelog

## Unreleased
### Security
- Rate limits per caller and route, a cap on concurrent model calls, a Host check (DNS rebinding), a strict CSP and other headers, request timeouts, safe static paths, and generic 500 errors. See `docs/SECURITY.md`.
- Fixed: a single malformed URL could crash the server. Fixed: email header injection in reply drafts, new drafts and contract emails. Fixed: the static-file check could be fooled by a sibling folder.
- `npm run test:security` attacks a running server; every protection was also broken on purpose to confirm the tests notice. Safe `npm audit` fixes applied.

### Portfolio demo
- Deploy the demo with Vercel Root Directory = `dashboard` (`dashboard/vercel.json`); the root `vercel.json` is kept in sync and `check:demo` fails if they differ.
- Public sample-data build (`npm run build:demo`) with no network access, `?embed=1`, Vercel config, and `npm run check:demo` (in `dashboard/`). See `docs/EMBED.md`.

### iPhone web app
- Phone layout: four-tab bar with a More sheet, safe-area handling, 44px tap targets, 16px inputs (no iOS zoom), dynamic viewport height.
- Refreshes when the app returns to the foreground; refresh button in the top bar; one-time "Add to Home Screen" tip on iPhone Safari.
- iPhone launch screens, tighter manifest, home-screen shortcuts (`/?tab=ask`).
- `dashboard/scripts/mobile-check.mjs` tests every page in an iPhone-sized browser.

### Logo and colour
- New car-inspired "O" mark replaces the diamond: nav, boot screen, orbit centre, favicon and all app icons.
- Ember, teal, violet and copper accents added to the black and gold look; the orbit, charts and category colours use them.

### Secrets
- `agent/scripts/reveal.ts` (`npm run reveal`) prints sealed `.env` secrets in plain text on the computer that sealed them, so they can be moved to a server. Only the secrets Opus keeps can be requested. Covered by `npm run test:reveal`.

### Deployment
- Docker and Tailscale setup: multi-stage `Dockerfile`, `docker-compose.yml` (Opus shares a Tailscale container's network, no published ports), `tailscale serve` config (no Funnel), `.dockerignore`, `.env.example`, `deploy/backup.sh` (data and key in separate archives), and `docs/DEPLOY.md`.
- `npm run check:deploy` (part of `npm run check`) fails if the setup could expose Opus or leak secrets.
- Not yet run against a real Docker daemon, Tailscale account or server. See DEPLOY.md.

### Approval queue
- New approval queue page: summary strip, kind filter and sort, cards with the linked subscription facts and an "if you approve" line, details drawer, keyboard shortcuts (j/k/a/d/Enter/Esc), plain-language safety tiers, and a decided history.
- Undo for "Not now": `POST /api/approvals/:id/undo` (dismissed items only, refuses duplicates), a ten-second undo bar with the `u` key, and Undo buttons in the history and drawer. Covered by `npm run test:undo`.
- Fixed: sample approvals now show as pending in preview mode.

### Design
- Final direction: the original Opus palette and fonts, plus pieces of NitroDrp (dot grid, `$` eyebrows, gold marker and cursor, mono labels, offset shadows, dashed cards). Earlier Obsidian Pop and NitroDrp-palette attempts are superseded.
- Restyled to the NitroDrp look: Night Signal (dark) and Concrete Signal (light), dot-grid ground, Space Mono headlines with `$` eyebrows, lime marker and cursor, offset-shadow cards and buttons, orange primary actions.
- Earlier Obsidian Pop work below is superseded.
- New Obsidian Pop palette: ground `#0A0A09`, gold `#CFA349`, pink, orange, burgundy and green signals.
- Fonts changed to Newsreader (headlines), Space Mono (labels) and Inter (body).
- Hard-edged cards with offset shadows, flat black ground, no gradients on figures.
- Boot screen, car mark and orbit retuned to the new gold.
- Light theme retuned to the same tokens.
