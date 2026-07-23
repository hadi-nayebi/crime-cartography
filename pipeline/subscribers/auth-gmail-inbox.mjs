#!/usr/bin/env node

import {createServer} from "node:http";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const secrets = join(root, ".secrets");
const account = "earthone@earthone.life";
const scope = "https://www.googleapis.com/auth/gmail.readonly openid email";
const port = 8767;
const tokenPath = join(secrets, "gmail_subscriber_inbox_token.json");

const clientSecret = JSON.parse(
  await readFile(join(secrets, "youtube_client_secret.json"), "utf8"),
);
const client = clientSecret.installed ?? clientSecret.web;
if (!client) throw new Error("client secret JSON has neither .installed nor .web");
const redirectUri = `http://localhost:${port}`;

const authorizationUrl = "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    login_hint: account,
  });

process.stdout.write(
  `Open this URL and authorize the read-only subscriber inbox as ${account}:\n\n${authorizationUrl}\n\n`,
);

const code = await new Promise((resolve, reject) => {
  const server = createServer((request, response) => {
    const url = new URL(request.url, redirectUri);
    const authorizationCode = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    response.end(authorizationCode ? "Authorized — you can close this tab." : "Authorization failed.");
    if (authorizationCode) {
      server.close();
      resolve(authorizationCode);
    } else if (error) {
      server.close();
      reject(new Error(error));
    }
  }).listen(port, () => {
    process.stdout.write(`Waiting for the redirect on ${redirectUri} …\n`);
  });
});

const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: {"Content-Type": "application/x-www-form-urlencoded"},
  body: new URLSearchParams({
    code,
    client_id: client.client_id,
    client_secret: client.client_secret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  }),
});
const token = await tokenResponse.json();
if (!tokenResponse.ok || !token.refresh_token) {
  throw new Error(`no refresh token returned: ${JSON.stringify(token)}`);
}

const identityResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
  headers: {Authorization: `Bearer ${token.access_token}`},
});
const identity = await identityResponse.json();
if ((identity.email ?? "").toLowerCase() !== account) {
  throw new Error(`authorized account is "${identity.email}", not ${account}; no token written`);
}

await mkdir(secrets, {recursive: true, mode: 0o700});
await writeFile(tokenPath, `${JSON.stringify({
  account: identity.email,
  refresh_token: token.refresh_token,
  scope: token.scope,
}, null, 2)}\n`, {mode: 0o600});
process.stdout.write(`Verified ${identity.email}; wrote ${tokenPath}\n`);
