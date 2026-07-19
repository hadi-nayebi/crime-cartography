# pipeline/notify — production email

HTML email from the production harness to the channel owner.

## Send policy (hard)

```
From: earthone@earthone.life   →   To: hadinayebi@earthone.life
```

That is the **only** permitted route. Both addresses are hard-coded constants in
`send-email.mjs` — no flag, env var, or config file can change them. The sender
identity is verified against Google at auth time (`auth-gmail.mjs` refuses to
save a token for any other account) and re-verified live on **every** send.
Widening the policy requires editing the constants in this public repo, which
makes any change auditable.

The OAuth scope is **send-only** (`gmail.send`): the stored credential cannot
read, list, or delete mail in any mailbox.

## Files

| file | role |
|---|---|
| `auth-gmail.mjs` | one-time OAuth (loopback :8766, Desktop-app client) → `.secrets/gmail_token.json` |
| `render-briefing.mjs` | `experiment/briefings/*.md` → email-safe HTML (inline styles, table layout) |
| `send-email.mjs` | refresh token → assert identity → send multipart (text+HTML) via Gmail API |

## Usage

```bash
# one-time (channel owner, browser sign-in as earthone@earthone.life):
node pipeline/notify/auth-gmail.mjs

# send a briefing:
node pipeline/notify/send-email.mjs --briefing experiment/briefings/<ts>.md

# send arbitrary HTML (same fixed route):
node pipeline/notify/send-email.mjs --subject "…" --html body.html [--text body.txt]
```

## What is committed vs. secret

**Committed (public):** these scripts and this README. They contain no
credentials — only public OAuth endpoints and the (intentionally public)
send-route policy.

**`.secrets/` (gitignored, never committed):** `youtube_client_secret.json`
(OAuth client), `gmail_token.json` (refresh token), `youtube_token.json`,
`fbi_api_key`. If any of these ever appears in `git status`, stop and fix
`.gitignore` before committing anything.

## Cloud Console prereqs (once)

1. Same project as the YouTube OAuth client → **enable Gmail API**.
2. OAuth consent screen publishing status **"In production"** (unverified is fine
   for personal use). In "Testing" status Google expires refresh tokens after
   7 days — the send pipeline would silently die weekly.
