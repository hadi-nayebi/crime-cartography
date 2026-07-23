# Public-vs-private policy

This is the public repository boundary. Ambiguous material stays private until
an intentional review says it improves reproducibility or accountability
without exposing people, credentials, unpublished work, or internal agent
state.

## Categories (v1 seed)
- **NEVER tracked (secrets):** .secrets/**, tokens, API keys, OAuth JSON,
  anything credential-shaped. Also settings.local.json.
- **PUBLIC by design (the transparency brand):** code, pipelines, engine,
  data/*/normalized + PROVENANCE, wiki, videos/*/config|youtube|render.lock|README,
  experiment/DESIGN.md, ROADMAP.md, PLAN.md, confidence.json (audit trail),
  PUBLIC-POLICY.md itself, RESULTS-*.md.
- **PRIVATE operational state:** agent harnesses and memory; raw feedback;
  briefings; channel/account snapshots; unpublished strategy and scouting;
  internal decisions, fleet instructions, critic/watcher lenses, reflections,
  and friction logs. These remain usable locally but are ignored by Git.
- **Curated public project state:** aggregate production counts, current public
  milestone, participation calls, and public links may be exported through a
  deterministic allowlist. Contributor identities, email, raw feedback,
  confidence notes, and local paths never enter that export.
- **Gray zone rule:** when unsure, keep it out of the public repository until a
  documented review resolves it.

## Rulings log
(append decisions here when they materially change the public boundary)

- **2026-07-20 — self-applied (clear-cut, no owner ruling needed).** Pinned
  `.claude/settings.local*.json` in the repo's own `.gitignore`. It was previously
  covered only by the machine's *global* git ignore, leaving a fresh clone / CI /
  contributor unprotected, and an untracked `settings.local.PROPOSED.json` (local
  permission allowlists, no credentials) protected by nothing. This just enforces
  the pre-existing "NEVER-tracked: settings.local.json" category → no taste call.
  **Generalized rule:** any `settings.local*` / machine-local Claude settings
  variant is NEVER-tracked and must be pinned in the *repo* `.gitignore`, not
  relied on via a per-machine global ignore.

- **2026-07-22 — owner ruling.** Only production machinery and deliberately
  curated reproducibility/audit material belong in the public repository.
  Claude/Codex harnesses, root agent instructions, raw feedback, operational
  briefings and snapshots, unpublished scouting, fleet/critic/watcher guidance,
  internal deliberation, and reflection logs are private. They are ignored and
  removed from the Git index without deleting the local files. Existing Git
  history is unchanged; history rewriting, if desired, is a separate decision.

- **2026-07-23 — owner operating-sequence ruling.** Crime Cartography does not
  wait for project subscribers before it starts publishing. The introduction
  and project page launch first, followed by one or two remade test videos under
  Hadi's editorial review. During that creator-led period, public feedback is
  used to improve the production harness and participation design. A community
  editorial workflow becomes operational only after the project reaches 500
  project subscribers and has accumulated enough relevant feedback to shape a
  responsible workflow. This is a participation milestone, not permission to
  begin the channel, and it is separate from YouTube subscriber counts.

- **2026-07-23 — owner channel-migration ruling.** Crime Cartography is the
  only public channel for this series. After an approved remake is live on the
  dedicated channel, the corresponding inherited Earth One upload must leave
  public availability. The removal method—private versus permanent deletion—
  remains an explicit owner decision because deletion is irreversible. Until
  that decision is recorded and a replacement is live, Earth One is unchanged.

- **2026-07-23 — superseding owner Earth One removal ruling.** Permanently
  delete the three inherited Crime Cartography uploads from Earth One now,
  without waiting for replacement releases. The Boston, Grand Rapids, and
  Washington DC video IDs were verified absent through the YouTube Data API,
  and the Earth One OAuth connection was removed. Earth One is no longer a
  managed or publishing channel for this project. This does not authorize any
  other Earth One mutation.
