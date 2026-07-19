#!/usr/bin/env node
/**
 * One-time Gmail OAuth2 setup for the production notifier (installed-app flow).
 *
 * HARD POLICY (production harness): email may be sent ONLY as
 *     earthone@earthone.life  →  hadinayebi@earthone.life
 * This script refuses to save a token for any other Google account, and the
 * send script (send-email.mjs) re-verifies the account on every send.
 *
 * Scope is SEND-ONLY (gmail.send + openid email for identity assertion): the
 * saved credential cannot read, list, or delete any mail.
 *
 * Prereqs (channel owner, once):
 *   1. Google Cloud Console → SAME project as the YouTube client → enable "Gmail API".
 *   2. Reuses the Desktop-app client at .secrets/youtube_client_secret.json.
 *   3. Consent screen publishing status should be "In production" (unverified is
 *      fine for personal use) — in "Testing" status Google expires refresh
 *      tokens after 7 days.
 *
 * Then:  node pipeline/notify/auth-gmail.mjs
 * Opens a Google consent URL — sign in as earthone@earthone.life. The granted
 * refresh token is written to .secrets/gmail_token.json (gitignored).
 */
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SECRETS = join(ROOT, ".secrets");
const SENDER = "earthone@earthone.life"; // sole allowed identity — hard policy
const SCOPE = "https://www.googleapis.com/auth/gmail.send openid email";
const PORT = 8766; // 8765 is the YouTube auth loopback

const cs = JSON.parse(await readFile(join(SECRETS, "youtube_client_secret.json"), "utf8"));
const conf = cs.installed ?? cs.web;
if (!conf) throw new Error("client secret JSON has neither .installed nor .web");
const redirect = `http://localhost:${PORT}`;

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: conf.client_id,
    redirect_uri: redirect,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    login_hint: SENDER,
  });

console.log(`\nOpen this URL in a browser and sign in as ${SENDER}:\n`);
console.log(authUrl + "\n");

const code = await new Promise((resolve, reject) => {
  const srv = createServer((req, res) => {
    const u = new URL(req.url, redirect);
    const c = u.searchParams.get("code");
    res.end(c ? "Authorized — you can close this tab." : "No code in callback.");
    if (c) { srv.close(); resolve(c); }
    else if (u.searchParams.get("error")) { srv.close(); reject(new Error(u.searchParams.get("error"))); }
  }).listen(PORT, () => console.log(`(waiting for the redirect on ${redirect} …)`));
});

const r = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code,
    client_id: conf.client_id,
    client_secret: conf.client_secret,
    redirect_uri: redirect,
    grant_type: "authorization_code",
  }),
});
const tok = await r.json();
if (!tok.refresh_token) throw new Error(`no refresh_token in response: ${JSON.stringify(tok)}`);

// Assert the authorized account IS the allowed sender — refuse anything else.
const ui = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
  headers: { Authorization: `Bearer ${tok.access_token}` },
});
const who = await ui.json();
if ((who.email ?? "").toLowerCase() !== SENDER) {
  throw new Error(
    `authorized account is "${who.email}", but the production sender policy allows ONLY ${SENDER}. ` +
    `No token written. Re-run and sign in as ${SENDER}.`
  );
}

await mkdir(SECRETS, { recursive: true });
await writeFile(
  join(SECRETS, "gmail_token.json"),
  JSON.stringify({ account: who.email, refresh_token: tok.refresh_token, scope: tok.scope }, null, 2)
);
console.log(`✓ verified account ${who.email} — wrote .secrets/gmail_token.json (send-only scope).`);
