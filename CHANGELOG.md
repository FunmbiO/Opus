# Changelog

## Unreleased
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
