# Subscriber inbox

This directory implements the public machinery for the mailbox-backed Crime
Cartography project-subscription pilot.

## Boundary

- Form delivery: EmailJS to `earthone+crimecarto@earthone.life`
- Mailbox owner: `earthone@earthone.life`
- Inbox scope: `gmail.readonly` only
- Local subscriber database: none
- Normal command output: aggregate counts, no addresses
- Raw output: explicit private `--json` operator mode

The existing `pipeline/notify` token remains send-only and owner-only. Do not
reuse or replace it with the inbox token.

## Validate the protocol

```bash
node --test pipeline/subscribers/email-protocol.test.mjs
```

## One-time inbox authorization

This command requires a human browser consent step and writes a gitignored
read-only token:

```bash
node pipeline/subscribers/auth-gmail-inbox.mjs
```

## Inspect the mailbox

Aggregate, safe-by-default view:

```bash
node pipeline/subscribers/list-subscriptions.mjs
```

The command scans at most 500 matching messages per run so a mailbox flood
cannot monopolize the harness or Gmail API. An operator may raise the bound for
a deliberate reconciliation, but never above the hard 2,000-message ceiling:

```bash
node pipeline/subscribers/list-subscriptions.mjs --max-messages=1200
```

When the result says `scan_truncated: true`, its counts cover only the bounded
scan and must not be presented as the complete subscriber population.

Private decoded operator view:

```bash
node pipeline/subscribers/list-subscriptions.mjs --json
```

The latter emits personal information to the terminal. Do not redirect it into
the public repository, paste it into issues, or include it in agent transcripts
that may be shared.

Until a confirmation/double-opt-in loop exists, aggregate output calls parsed
messages `unique_unverified_requests`, not subscribers.

## VPS credential paths

Local development defaults to the gitignored `.secrets/` files. A VPS must use
explicit paths:

```text
CRIME_CARTOGRAPHY_GMAIL_CLIENT_SECRET=/etc/crime-cartography/gmail-oauth-client.json
CRIME_CARTOGRAPHY_GMAIL_TOKEN=/var/lib/crime-cartography/gmail-readonly-token.json
```

Both files must be regular files with no group/other permissions. The worker
fails closed if either credential is exposed.
