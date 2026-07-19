#!/usr/bin/env node
/**
 * Production email sender.
 *
 * HARD POLICY — not configurable by flag, env, or config file:
 *     From: earthone@earthone.life   To: hadinayebi@earthone.life
 * The sender identity is re-verified against Google on EVERY send; any other
 * account or recipient is refused. Widening this policy requires editing these
 * constants in the public repo (auditable by design).
 *
 * Usage:
 *   node pipeline/notify/send-email.mjs --briefing experiment/briefings/<ts>.md
 *   node pipeline/notify/send-email.mjs --subject "..." --html body.html [--text body.txt]
 *
 * Needs .secrets/gmail_token.json from auth-gmail.mjs (send-only scope).
 */
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderBriefing } from "./render-briefing.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SECRETS = join(ROOT, ".secrets");

const SENDER = "earthone@earthone.life";      // sole allowed sender — hard policy
const RECIPIENT = "hadinayebi@earthone.life"; // sole allowed recipient — hard policy
const SENDER_NAME = "Earth One Production";

// ---- args ----
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

let subject, htmlBody, textBody;
if (opt("briefing")) {
  const md = await readFile(opt("briefing"), "utf8");
  ({ subject, html: htmlBody, text: textBody } = renderBriefing(md));
} else {
  subject = opt("subject");
  if (!subject || !opt("html")) {
    console.error("usage: send-email.mjs --briefing <md> | --subject <s> --html <file> [--text <file>]");
    process.exit(1);
  }
  htmlBody = await readFile(opt("html"), "utf8");
  textBody = opt("text") ? await readFile(opt("text"), "utf8") : htmlBody.replace(/<[^>]+>/g, " ");
}

// ---- refresh access token ----
const cs = JSON.parse(await readFile(join(SECRETS, "youtube_client_secret.json"), "utf8"));
const conf = cs.installed ?? cs.web;
const tokFile = JSON.parse(await readFile(join(SECRETS, "gmail_token.json"), "utf8"));
if ((tokFile.account ?? "").toLowerCase() !== SENDER)
  throw new Error(`token file account "${tokFile.account}" != allowed sender ${SENDER} — refusing.`);

const tr = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: conf.client_id,
    client_secret: conf.client_secret,
    refresh_token: tokFile.refresh_token,
    grant_type: "refresh_token",
  }),
});
const tok = await tr.json();
if (!tok.access_token) throw new Error(`token refresh failed: ${JSON.stringify(tok)}`);

// ---- live identity assertion (every send) ----
const ui = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
  headers: { Authorization: `Bearer ${tok.access_token}` },
});
const who = await ui.json();
if ((who.email ?? "").toLowerCase() !== SENDER)
  throw new Error(`live credential is "${who.email}", not ${SENDER} — refusing to send.`);

// ---- build RFC 2822 message (multipart/alternative: text + html) ----
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const wrap76 = (s) => s.replace(/(.{76})/g, "$1\r\n");
const subjEnc = /^[\x20-\x7e]*$/.test(subject) ? subject : `=?UTF-8?B?${b64(subject)}?=`;
const boundary = "b_earthone_briefing";
const mime = [
  `From: ${SENDER_NAME} <${SENDER}>`,
  `To: ${RECIPIENT}`,
  `Subject: ${subjEnc}`,
  `MIME-Version: 1.0`,
  `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ``,
  `--${boundary}`,
  `Content-Type: text/plain; charset=UTF-8`,
  `Content-Transfer-Encoding: base64`,
  ``,
  wrap76(b64(textBody)),
  `--${boundary}`,
  `Content-Type: text/html; charset=UTF-8`,
  `Content-Transfer-Encoding: base64`,
  ``,
  wrap76(b64(htmlBody)),
  `--${boundary}--`,
].join("\r\n");

// ---- send ----
const raw = Buffer.from(mime, "utf8").toString("base64url");
const sr = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
  method: "POST",
  headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ raw }),
});
const sent = await sr.json();
if (!sr.ok) throw new Error(`send failed (${sr.status}): ${JSON.stringify(sent)}`);
console.log(`✓ sent "${subject}" ${SENDER} → ${RECIPIENT} (id ${sent.id})`);
