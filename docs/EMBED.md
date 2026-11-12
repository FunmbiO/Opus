# Showing Opus on your portfolio

**Short version:** your portfolio gets a public, sample-data **demo** of Opus in an iframe. The real Opus (your mail, your
money) stays private on your server, behind Tailscale. They are two separate things.

| | Real Opus | Public demo |
|---|---|---|
| Where | your server, Tailscale only | Vercel, public |
| Data | your real mail, bills, clients | made-up sample data |
| Server behind it | yes (agent, database, Gmail) | **none**: a static site |
| Can it reach the internet | yes | **no**, the build refuses every network call |
| Can it be framed by other sites | **never** (`frame-ancestors 'none'`) | **only** by your portfolio |

## Why the real one is not the one embedded
It would put your inbox and finances behind a public web address, and an iframe makes that worse: a page on another site
would be displaying it. Opus also needs a long-running server with a database, which Vercel's serverless platform is not.
Hardening ([SECURITY.md](SECURITY.md)) makes the private one safe on your network; it does not make it a good public page.

## 1. Deploy the demo on Vercel
Deploy the **`dashboard`** folder as its own project. The repo root also holds the private agent, which Vercel might try to
treat as a second app, so pointing it at `dashboard` keeps it simple.
1. vercel.com → **Add New… → Project** → import `FunmbiO/Opus` (from `main`).
2. On the configure screen, click **Edit** next to **Root Directory** and choose **`dashboard`**.
3. Leave everything else alone. `dashboard/vercel.json` already sets the install command, the build command
   (`npm run build:demo`), the output folder (`dist-demo`) and the security headers. Add no environment variables.
4. Make sure **Include source files outside of the Root Directory in the Build Step** is on (Project → Settings → General).
   It is on by default, and the demo needs it to read the sample data in `shared/`.
5. Deploy. Name the project something short like `opus-demo`, which gives `https://opus-demo.vercel.app`.
   You already use `demo.jadedmedia.ca` for NitroDrp, so `opus.jadedmedia.ca` would fit (Project → Settings → Domains).

Do **not** accept an auto-suggested "multi-service" setup that includes the `agent`: the agent is your private server and
must never be deployed publicly.

## 2. Let your portfolio frame it
Your portfolio's `vercel.json` has a strict `frame-src` list, so the new address has to be added there. In the
`Content-Security-Policy` value, add the demo's origin to `frame-src`:

```diff
- frame-src 'self' https://www.jadedmedia.ca https://jadedmedia.ca https://edgeline-exports.vercel.app https://demo.jadedmedia.ca https://edgelineexports.com;
+ frame-src 'self' https://www.jadedmedia.ca https://jadedmedia.ca https://edgeline-exports.vercel.app https://demo.jadedmedia.ca https://edgelineexports.com https://opus-demo.vercel.app;
```

Then the iframe, following the pattern your other demos use:

```html
<iframe title="Opus live demo" loading="lazy"
        src="https://opus-demo.vercel.app/?embed=1"
        referrerpolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin"
        width="420" height="760"></iframe>
```
`?embed=1` skips the opening animation and the install tip. The demo works at phone width and at desktop width, so size the frame
to taste. `allow-same-origin` is needed (the theme setting uses local storage); `allow-scripts` is needed to run at all.

## 3. If your portfolio is on a different address
The demo only allows framing by `https://jaded-works.vercel.app` (your portfolio's canonical address). If you serve it from a
custom domain too, list every origin that should be allowed, then redeploy:
```bash
node dashboard/scripts/set-embed-origin.mjs https://jaded-works.vercel.app https://your-custom-domain.com   # updates both vercel.json files
```
Only exact `https://` origins are accepted. Wildcards are refused on purpose.

## 4. Check it
```bash
cd dashboard
npm run check:demo
```
This builds the demo and serves it with the headers from `vercel.json`, then confirms:
- every page works, and **nothing** calls an API or any other site;
- no emails, phone numbers or secrets are in the built files;
- the strict Content-Security-Policy is never violated;
- the demo renders inside an iframe on your portfolio, and is **refused** inside pages on other sites, including look-alike domains.

## What the demo is
Sample data only. You can click through every page, approve things, and use Ask, all on made-up data, locally in the browser.
Nothing is saved or sent. A banner says so. Because the demo build replaces `fetch` with a function that always refuses, it
cannot contact a server even if someone edited the page.

## Other hosts
Any static host works: build with `npm run build:demo` and publish `dashboard/dist-demo`. You must copy the headers from
`vercel.json` (especially `frame-ancestors`). GitHub Pages cannot set headers, so it cannot restrict who frames the demo; avoid it.
