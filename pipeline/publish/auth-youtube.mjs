#!/usr/bin/env node
/**
 * One-time YouTube OAuth2 setup (installed-app flow, loopback redirect).
 *
 * Prereqs (done by the channel owner, once):
 *   1. Google Cloud Console → create project → enable "YouTube Data API v3"
 *   2. Credentials → Create OAuth client ID → type "Desktop app"
 *   3. Save the downloaded JSON as  .secrets/youtube_client_secret.json
 *
 * Then:  node pipeline/publish/auth-youtube.mjs
 * Opens a Google consent URL (sign in with the CHANNEL's account). The granted
 * refresh token is written to .secrets/youtube_token.json (gitignored) and is
 * all the upload script needs from then on.
 */
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SECRETS = join(ROOT, ".secrets");
const SCOPE = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube";
const PORT = 8765;

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
  });

console.log("\nOpen this URL in a browser, sign in with the CHANNEL account, and approve:\n");
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
await mkdir(SECRETS, { recursive: true });
await writeFile(join(SECRETS, "youtube_token.json"), JSON.stringify(tok, null, 2));
console.log("✓ wrote .secrets/youtube_token.json — the upload pipeline is ready.");
