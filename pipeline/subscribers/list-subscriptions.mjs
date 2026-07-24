#!/usr/bin/env node

import {readFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {parseSubscriptionRequest, subscriptionProtocol} from "./email-protocol.mjs";
import {
  assertPrivateCredential,
  gmailCredentialPaths,
} from "./gmail-credential-paths.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const account = "earthone@earthone.life";
const recipient = "earthone+crimecarto@earthone.life";
const rawJson = process.argv.includes("--json");
const {clientSecretPath, tokenPath} = gmailCredentialPaths({root});

function decodeBase64Url(value) {
  return Buffer.from(value ?? "", "base64url").toString("utf8");
}

function textParts(payload) {
  const parts = [];
  if (payload?.body?.data && /^text\/(?:plain|html)$/i.test(payload.mimeType ?? "")) {
    parts.push(decodeBase64Url(payload.body.data));
  }
  for (const part of payload?.parts ?? []) parts.push(...textParts(part));
  return parts;
}

async function accessToken() {
  await assertPrivateCredential(clientSecretPath, "Gmail OAuth client secret");
  await assertPrivateCredential(tokenPath, "Gmail read-only token");
  const clientSecret = JSON.parse(
    await readFile(clientSecretPath, "utf8"),
  );
  const client = clientSecret.installed ?? clientSecret.web;
  const stored = JSON.parse(
    await readFile(tokenPath, "utf8"),
  );
  if ((stored.account ?? "").toLowerCase() !== account) {
    throw new Error(`subscriber inbox token belongs to "${stored.account}", not ${account}`);
  }
  if (!String(stored.scope ?? "").includes("gmail.readonly")) {
    throw new Error("subscriber inbox token is not read-only Gmail authorization");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: stored.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const token = await response.json();
  if (!response.ok || !token.access_token) {
    throw new Error(`subscriber inbox token refresh failed: ${JSON.stringify(token)}`);
  }

  const identityResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {Authorization: `Bearer ${token.access_token}`},
  });
  const identity = await identityResponse.json();
  if ((identity.email ?? "").toLowerCase() !== account) {
    throw new Error(`live subscriber inbox credential is "${identity.email}", not ${account}`);
  }
  return token.access_token;
}

async function gmailJson(token, path) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: {Authorization: `Bearer ${token}`},
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`Gmail request failed (${response.status}): ${JSON.stringify(value)}`);
  return value;
}

async function listMessageIds(token) {
  const ids = [];
  let pageToken;
  do {
    const query = new URLSearchParams({
      q: `to:${recipient} ${subscriptionProtocol.marker.slice(0, -1)}`,
      maxResults: "500",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await gmailJson(token, `messages?${query}`);
    ids.push(...(page.messages ?? []).map(({id}) => id));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return ids;
}

const token = await accessToken();
const messageIds = await listMessageIds(token);
const records = [];
const invalid = [];

for (const messageId of messageIds) {
  const message = await gmailJson(token, `messages/${messageId}?format=full`);
  const candidates = textParts(message.payload);
  let parsed;
  for (const candidate of candidates) {
    try {
      parsed = parseSubscriptionRequest(candidate);
      break;
    } catch {
      // Try the next MIME part. Invalid details remain private.
    }
  }
  if (parsed) records.push({...parsed, gmail_message_id: messageId});
  else invalid.push(messageId);
}

const latestByEmail = new Map();
for (const record of records) {
  const previous = latestByEmail.get(record.email);
  if (!previous || record.requested_at > previous.requested_at) {
    latestByEmail.set(record.email, record);
  }
}
const current = [...latestByEmail.values()].sort(
  (a, b) => a.requested_at.localeCompare(b.requested_at),
);

if (rawJson) {
  process.stdout.write(`${JSON.stringify({
    schema_version: "1.0.0",
    private: true,
    recipient,
    records: current,
    invalid_message_ids: invalid,
  }, null, 2)}\n`);
} else {
  const interests = {};
  for (const record of current) {
    for (const interest of record.interests) {
      interests[interest] = (interests[interest] ?? 0) + 1;
    }
  }
  process.stdout.write(`${JSON.stringify({
    recipient,
    scanned_messages: messageIds.length,
    valid_requests: records.length,
    unique_unverified_requests: current.length,
    invalid_messages: invalid.length,
    latest_request_at: current.at(-1)?.requested_at ?? null,
    interests,
  }, null, 2)}\n`);
}
