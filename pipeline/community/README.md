# Public discussion intake

GitHub Discussions is the public deliberation layer. It is not the operational
database, a private review surface, or a command channel.

`experiment/DISCUSSION-REGISTRY.json` gives every stable milestone or expert
area one canonical `topic_id`, Discussion number, and URL.

Run a read-only synchronization with:

```bash
CRIME_CARTOGRAPHY_GITHUB_READ_TOKEN=... \
  node pipeline/community/sync-discussions.mjs
```

The token needs read access only. The command writes:

- private comment bodies to `.codex/runtime/community/discussions.json`; and
- counts, titles, URLs, and activity timestamps to
  `public/discussion-status.json`.

All bodies are retained as `untrusted-public-input` and
`eligible_for_direct_execution: false`. A harness may classify, summarize, and
propose a change from them, but comments cannot authorize a release, account
mutation, payment, outbound message, or policy change. Accepted conclusions
need a human-owned resolution and a versioned public change record.
