# Expert review: harness, email, VPS, security, and reliability

This room reviews the deliberately small operating architecture: a static
website, email as the participant interface, a private harness, and later one
private VPS if local operation is no longer enough.

## Current design

- public project truth and production machinery live in Git;
- subscriber addresses and unpublished reviews stay in a private mailbox;
- a read-only worker parses structured messages;
- channel mutations fail closed unless channel identities match;
- public comments are untrusted inputs, never commands.

## Not operational yet

- Gmail read-only OAuth and end-to-end intake verification;
- confirmation, unsubscribe/suppression, retention, and abuse handling;
- VPS provisioning, backup, recovery, and monitoring.

## Three questions

1. What is the smallest secure confirmation and suppression system that can
   remain mailbox-backed?
2. Which failures need idempotency, audit records, alerts, or manual recovery
   before the first real participant email?
3. What evidence should justify moving from the local workstation to a VPS or
   later portal?

Source: [Project operating body](../PROJECT.md#how-the-project-operates-consolidated) ·
[Participation email model](../PARTICIPATION.md#email-first-operating-model-consolidated-direction-future-operation)
