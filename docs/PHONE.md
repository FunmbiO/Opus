# Opus on your phone

Opus runs on your PC. Your phone reaches it through **Tailscale**, a free private network between your own devices. Nothing is opened to the internet.

Your PC must be on, awake, and running `npm run serve`. If it sleeps, the phone gets nothing.

## One-time setup (about 10 minutes)

**1. Install Tailscale on your PC and your phone.**
Get it from tailscale.com/download (PC) and the App Store or Play Store (phone). Sign in to the same account on both.

**2. Turn on HTTPS in Tailscale.**
Open login.tailscale.com/admin/dns. Make sure **MagicDNS** is on, then click **Enable HTTPS**. HTTPS is what lets the phone install Opus like an app.

**3. Set a password for Opus.**
In PowerShell, make a random one:

```powershell
-join ((48..57)+(97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

Open `C:\aide\agent\.env` and add a line with it:

```
API_TOKEN=paste-the-random-text-here
```

Keep `HOST` as it is (don't set it). Opus then only listens on your own PC, and Tailscale forwards your phone's requests to it.

**4. Start Opus, then share it over Tailscale.**
In one PowerShell window: `cd C:\aide\agent` then `npm run serve`.
In a second PowerShell window:

```powershell
tailscale serve --bg 8787
```

It prints an address like `https://your-pc.your-tailnet.ts.net`. That is your Opus address.

**5. Open it on your phone and install it.**
Open that address on your phone. Enter the password from step 3. Then:
- iPhone: open it in Safari, tap Share, then **Add to Home Screen**.
- Android: open it in Chrome, tap the menu, then **Install app**.

Opus now has its own icon and opens full screen.

## Keeping it reachable

- Windows Settings > System > Power: set **Sleep** to Never while plugged in.
- Leave the `npm run serve` window open. Add `AUTORUN=1` to `.env` so it also checks your mail every 15 minutes.
- Set up Telegram if you want pings on your phone when something needs you.

## Turning it off

`tailscale serve reset` stops sharing. Don't use Tailscale **Funnel**: it puts Opus on the public internet.

## When your PC is the weak link

Everything stops when the PC sleeps or restarts. The fix is to move Opus to an always-on machine (a small home server or a cheap cloud server). It is the same setup, just somewhere that stays on.
