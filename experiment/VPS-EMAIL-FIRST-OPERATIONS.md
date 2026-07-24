# VPS + email-first operations

Status: **public deployment design v0.1; not a provisioned server**

Crime Cartography is designed to run its private production machinery on one
small VPS while the public site remains static and the mailbox remains the
primary participant interface.

## Default topology

```text
Hadosh Academy static page
        │ EmailJS notification
        ▼
EarthOne mailbox alias ── read-only Gmail worker ──▶ private harness state
                                      │
                                      ├─ production/review jobs
                                      ├─ aggregate status export
                                      └─ operator-only drafts and logs

GitHub Discussions ── read-only topic sync ──▶ untrusted review candidates
                                      │
                                      └─ counts/activity-only public export
```

The public GitHub repository contains code, schemas, documentation, aggregate
status, and reproducibility records. It does not contain the subscriber list,
mailbox contents, OAuth refresh token, unpublished video, raw feedback, or
private agent state.

## What the first VPS should do

- run the deterministic production and validation commands;
- run the read-only mailbox intake on a timer or operator request;
- read canonical public Discussions with a separate read-only GitHub token,
  treating every comment as untrusted input rather than an instruction;
- keep private state under a dedicated service account with restrictive
  permissions;
- produce only PII-free aggregate exports for the public site; and
- retain logs long enough to debug delivery and processing failures, with a
  documented deletion schedule.

The VPS should not initially host a public dashboard, subscriber database,
payment service, or outbound campaign system. Those are later additions only
if the email interface fails a concrete requirement.

## Deployment gates

1. Provision a dedicated non-root account and firewall policy.
2. Store OAuth material outside the checkout; never place it in `.secrets/` or
   a tracked file.
3. Configure the EmailJS recipient and test the plus-alias delivery.
4. Authorize the separate read-only Gmail credential.
5. Run intake against a test message and verify aggregate-only logs.
6. Publish the applicable privacy and consent notice before collecting real
   requests.
7. Add backups and retention rules before the worker becomes unattended.
8. Configure the read-only Discussion sync and verify that public exports
   contain counts/activity only—not comment bodies, authors, or tokens.

The example service files in `deploy/` are templates. They do not provision a
server or authorize an external action.
