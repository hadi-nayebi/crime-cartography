# Email-first project interface

Status: **v0.1 implementation contract for public review**

Crime Cartography begins with email as its private participation interface. The
website is the friendly input surface; the EarthOne mailbox is the initial
subscriber record; the public repository contains only the protocol and
processing machinery.

The intended deployment is one private VPS running the production harness and
mailbox worker. The website can remain static and separately hosted. A local
file, mailbox, or encrypted operator backup may be used for operational state
only when the worker needs it; a managed subscriber database is not a default
requirement. This is a cost and simplicity preference, not a promise that email
can satisfy every later privacy, moderation, identity, or revision-history need.

## Subscription path

1. A visitor completes the Crime Cartography project form on the Hadosh Academy
   website.
2. EmailJS converts that form submission into a structured notification email.
3. The notification is delivered to
   `earthone+crimecarto@earthone.life`.
4. A read-only inbox worker selects only messages delivered to that address and
   decodes the embedded Crime Cartography subscription envelope.
5. The harness can count, validate, and segment current requests directly from
   the mailbox. It does not create a second subscriber database.

EmailJS is a transit processor in this design. “Mailbox-backed” means the
project does not operate its own subscriber datastore; it does not mean that
the browser, EmailJS, or the email provider never processes the submission.

## Structured envelope

The human-readable EmailJS message contains one machine-readable line:

```text
CRIME_CARTOGRAPHY_SUBSCRIPTION_V1:<base64url JSON>
```

The decoded object contains only:

- protocol version and `subscribe` action;
- project ID;
- submitted name and email;
- selected editorial interests;
- the consent-text version; and
- the client submission timestamp.

The public parser rejects another project ID, action, malformed email,
unsupported version, missing consent version, invalid timestamp, oversized
fields, and malformed encoding.

## Credential boundary

The existing production-notifier credential remains send-only and may email
only the channel owner. Subscriber intake uses a separate credential with
`gmail.readonly` plus identity verification. It can list and read mail but
cannot send, label, trash, or delete it.

The inbox command does not write subscriber records to disk. Its normal output
is an aggregate summary. Raw decoded records require an explicit `--json`
flag and are private operator output.

## Not active yet

Receiving a form does not yet:

- create an economic claim, job, assignment, point, or membership right;
- authorize marketing or editorial-task email;
- prove age, residence, citizenship, identity, or eligibility;
- confirm that the submitted address belongs to the submitter; or
- grant access to unpublished material.

Confirmation, unsubscribe, suppression, retention, eligibility, task sending,
and any contribution ledger are later gates. Before subscriber email is sent,
the project needs a versioned privacy notice, confirmation language, a working
reply-to unsubscribe path, an appropriate postal address for commercial-email
compliance, and owner approval of the exact message class.

## Deployment gates

- confirm the EarthOne mail system accepts the `+crimecarto` recipient;
- configure the EmailJS notification template to deliver to that exact
  recipient and preserve the structured message;
- run a form-to-inbox test with a non-production address;
- authorize the separate read-only Gmail credential;
- verify the worker sees the test without exposing its address in logs; and
- publish the applicable privacy and consent text before collecting real
  requests.

The VPS deployment should use a non-root service account, an environment or
secret-file path outside the repository for OAuth material, restricted file
permissions, encrypted backups where backups exist, and a firewall exposing
only the service endpoints that are actually needed. The public repository may
contain the service template and health checks, never the refresh token,
mailbox contents, subscriber list, or private harness state.
