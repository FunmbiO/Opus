import { createServer } from "node:http";
import { google } from "googleapis";
import { openString } from "../src/crypto.js";

/**
 * One-time Google sign-in. Prints a refresh token to paste into .env.
 *
 * Setup first (about 5 minutes):
 *  1. console.cloud.google.com: create a project, enable the Gmail API.
 *  2. OAuth consent screen: External, add yourself as a test user.
 *  3. Credentials: create an OAuth client ID, type "Desktop app".
 *  4. Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env, then run `npm run auth`.
 *
 * Scopes: read mail, and manage drafts. Google bundles "create drafts" and
 * "send drafts" into one scope, so the guarantee that Opus never sends comes
 * from the code, not from Google. `npm run safety` checks for that.
 */
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];
const PORT = 53682;
const redirect = `http://127.0.0.1:${PORT}/callback`;

const id = process.env.GOOGLE_CLIENT_ID;
// npm run protect seals this value in .env, so it has to be unsealed before Google sees it.
let secret = "";
try { secret = openString(process.env.GOOGLE_CLIENT_SECRET); } catch (e) { console.error("Could not open GOOGLE_CLIENT_SECRET:", e instanceof Error ? e.message : e); process.exit(1); }
if (!id || !secret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const client = new google.auth.OAuth2(id, secret, redirect);
const url = client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });

console.log("\nOpen this link in your browser and approve access:\n\n" + url + "\n");

const server = createServer(async (req, res) => {
  const u = new URL(req.url ?? "/", redirect);
  if (u.pathname !== "/callback") return void res.end();
  const code = u.searchParams.get("code");
  if (!code) {
    res.end("No code received. Try again.");
    return;
  }
  try {
    const { tokens } = await client.getToken(code);
    res.end("Done. You can close this tab and return to the terminal.");
    console.log("Add this line to .env:\n\nGOOGLE_REFRESH_TOKEN=" + tokens.refresh_token + "\n");
    if (!tokens.refresh_token) console.log("No refresh token came back. Remove Opus at myaccount.google.com/permissions and run this again.");
  } catch (err) {
    res.end("Sign-in failed. See the terminal.");
    console.error(err);
  }
  server.close();
});
server.listen(PORT, "127.0.0.1");
