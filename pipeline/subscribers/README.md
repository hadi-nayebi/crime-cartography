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

Private decoded operator view:

```bash
node pipeline/subscribers/list-subscriptions.mjs --json
```

The latter emits personal information to the terminal. Do not redirect it into
the public repository, paste it into issues, or include it in agent transcripts
that may be shared.
