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
