# Running Opus on a server (Docker + Tailscale)

Goal: Opus runs 24/7 on a Linux box, and only your own devices can reach it.

## Shape
```
your phone / laptop ──(Tailscale, WireGuard)──► tailscale container ──► opus container
                                               HTTPS on https://opus.<tailnet>.ts.net
```
- The **opus** container shares the **tailscale** container's network. Opus listens on `127.0.0.1:8787` inside that
  shared network, so the only way in is `tailscale serve`. No port is published on the host.
- `tailscale serve` (not Funnel) is used, so the address works inside your tailnet only. It is never on the public internet.
- Two named volumes: `data` (database, files, daily backups) and `keys` (the master encryption key). They are separate
  on purpose: a backup of `data` must not contain the key that opens it.

## Rules this setup keeps
1. No `ports:` anywhere in `docker-compose.yml`.
2. `HOST` stays `127.0.0.1`.
3. No secrets in the image or the repo. Secrets come from `agent/.env` and `.env` on the server (both git-ignored).
4. The app runs as the unprivileged `node` user with all Linux capabilities dropped.
5. Tailscale Funnel (public sharing) is never enabled. `npm run check:deploy` fails if it appears.

## Hosting provider
This guide works on any Linux box with Docker. Which provider you use is **not verified here**: nothing in the repo
says, and the AWS connection used during development was not signed in. If you use AWS Lightsail, see the note at the end
once it has been checked.

## What was checked, and what was not
| Checked here | How |
|---|---|
| `docker-compose.yml` is valid and renders as intended | `docker compose config` (no ports, shared network, `cap_drop: ALL`, three volumes, missing Tailscale key fails loudly) |
| `agent/.env` cannot override `HOST`, `PORT` or the key folder | rendered with a hostile `HOST=0.0.0.0` in `agent/.env`: still `127.0.0.1` |
| The safety rules hold | `npm run check:deploy`, tested by breaking each rule on purpose (14 cases, all caught) |
| The agent starts from a fresh `npm ci`, as the image does | installed into an empty folder with `NODE_ENV=production`, reproduced a real failure (`tsx` missing), fixed, then ran the exact start command and healthcheck |
| The dashboard build stage works in isolation | reproduced a real failure (missing `shared/`), fixed, and confirmed the build passes with only the files the Dockerfile copies |
| The container's folder layout works | recreated `/app/...` in a temp folder and ran the same start command: dashboard served, healthcheck command exits 0, database and backups in the data folder, `master.key` alone in the key folder |
| Opus listens on loopback only | reachable on `127.0.0.1`, connection refused on the machine's other address |

| **Not** checked here | Why |
|---|---|
| Building the whole image | there is no Docker daemon in the development environment. The first real build on a server found a bug the dry run missed, so expect to read the output |
| The Tailscale container joining your tailnet, and HTTPS via `tailscale serve` | needs a real Tailscale account and key |
| `deploy/backup.sh` and the restore steps below | need Docker running (the script is syntax-checked only) |
| A real server, including Lightsail | not verified, see the end |

Treat the first `docker compose up` as the real test, and read the logs.

## First-time setup
1. **Server**: a Linux box with Docker and the Compose plugin. As a rule of thumb give it 2 GB of RAM, because building the image runs `npm ci` and the dashboard build.
2. **Tailscale admin** (https://login.tailscale.com/admin): turn on **MagicDNS** and **HTTPS certificates** (DNS page), then create an **auth key** (Settings, Keys). Make it one-off, not reusable.
3. **Get the code** on the server (run these on the server, from your home folder, in a folder of its own):
   ```bash
   cd ~ && git clone https://github.com/FunmbiO/Opus.git && cd Opus
   ```
   Then create the env files and the style file (all git-ignored). Do not skip the last one: if `agent/style.md` is missing, Docker creates a *folder* with that name and Opus breaks.
   ```bash
   cp .env.example .env              # put TS_AUTHKEY in here
   cp agent/.env.example agent/.env  # Anthropic key, API_TOKEN, AUTORUN=1, Google tokens later
   cp agent/style.example.md agent/style.md
   ```
   Leave `HOST` alone in `agent/.env`; compose pins it to `127.0.0.1` regardless.
   **Sealed secrets do not travel.** If you ran `npm run protect` on your own computer, values like `GOOGLE_CLIENT_SECRET=enc1:...` can only be opened there, by that Windows login. Copying them to the server gives Opus unreadable values. On the computer that sealed them, print the plain values (this only shows them on your own screen):
   ```bash
   cd agent
   npx tsx --env-file=.env scripts/reveal.ts ANTHROPIC_API_KEY GOOGLE_CLIENT_SECRET GOOGLE_REFRESH_TOKEN
   ```
   `GOOGLE_CLIENT_ID` is never sealed, so you can read it straight from `.env`. Type the values into the server's `agent/.env` yourself, and do not paste them into chat. Your old `.env.before-protect` file, if you kept it, also holds the plain values.
   The Google refresh token needs a browser, so run `npm run auth` on your own computer and paste the result into `agent/.env`. Opus starts without it but cannot read Gmail.
4. **Your private files are optional for the first start.** Without them Opus runs on its generic example data. To add them later, put your real `seed/*.json` and `agent/style.md` on the server. These `scp` commands run **on your own computer**, not on the server (replace the placeholders):
   ```bash
   scp seed/*.json ubuntu@YOUR-SERVER:Opus/seed/
   scp agent/style.md ubuntu@YOUR-SERVER:Opus/agent/
   ```
   If you only have the browser SSH console, open each file with `nano` on the server and paste the contents instead.
5. **Start it**:
   ```bash
   docker compose up -d --build
   docker compose ps          # both services should be running, opus "healthy"
   docker compose logs -f     # first-run problems show up here
   ```
6. **Open** `https://opus.<your-tailnet>.ts.net` from a device that is signed in to the same tailnet, and set your dashboard password.

## Everyday
```bash
git pull && docker compose up -d --build   # update
docker compose logs --tail 100 opus        # what happened
docker compose restart opus
```

## Backups
Opus already keeps 14 daily copies of its database inside the data volume. For a copy that survives losing the server:
```bash
deploy/backup.sh ~/opus-backups
```
It writes **two files**: `opus-data-*.tgz` and `opus-key-*.tgz`. Store them in different places. The key file alone is useless, and the data file alone cannot be read; together they are everything. **If the key is lost, encrypted data cannot be recovered.**

To restore onto a fresh server, bring the stack up once so the volumes exist, stop Opus, then unpack:
```bash
docker compose stop opus
docker run --rm -v opus_data:/v -v "$PWD":/in alpine sh -c 'cd /v && tar xzf /in/opus-data-XXXX.tgz'
docker run --rm -v opus_keys:/v -v "$PWD":/in alpine sh -c 'cd /v && tar xzf /in/opus-key-XXXX.tgz'
docker compose start opus
```

## If something is wrong
- **`opus` keeps restarting** (`docker compose ps` shows `Restarting`): `docker compose logs opus --tail 30` has the reason.
- **`required variable TS_AUTHKEY is missing`**: create `.env` from `.env.example`.
- **Opus is not on your tailnet**: `docker compose logs tailscale`. An expired or already-used key is the usual cause.
- **Page does not load but Opus is healthy**: check HTTPS certificates and MagicDNS are on, and that your device is on the tailnet.
- **`npm run check:deploy` fails**: it names the rule. Do not work around it; the rules are what keep Opus off the internet.

## Hosting provider note
Not verified. If this runs on AWS Lightsail, check these once you have confirmed it:
- Tailscale needs **no inbound ports**. You can leave the Lightsail firewall as small as possible.
- Keep a way back in (Lightsail's browser SSH console) before closing anything. The Tailscale container does not give you SSH to the host.
