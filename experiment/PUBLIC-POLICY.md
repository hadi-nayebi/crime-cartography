# Public-vs-private policy (living document)

Maintained by the repo-hygiene-reviewer routine; ambiguous calls are ratified by
Hadi via DECISIONS.md. The lens sharpens over time — every ruling is logged.

## Categories (v1 seed)
- **NEVER tracked (secrets):** .secrets/**, tokens, API keys, OAuth JSON,
  anything credential-shaped. Also settings.local.json.
- **PUBLIC by design (the transparency brand):** code, pipelines, engine,
  data/*/normalized + PROVENANCE, wiki, videos/*/config|youtube|render.lock|README,
  experiment/DESIGN.md, ROADMAP.md, PLAN.md, confidence.json (audit trail),
  PUBLIC-POLICY.md itself, RESULTS-*.md.
- **PRIVATE candidates (operational exhaust — pending user ratification):**
  experiment/briefings/ (ops detail + personal emails), experiment/channel/
  (analytics snapshots), experiment/HARNESS.md (internal friction log),
  experiment/DECISIONS.md (taste deliberations), videos/*/feedback.json
  (user's raw review notes — arguably fine public; ASK).
- **Gray zone rule:** when unsure, keep it OUT of the public repo until ruled.

## Rulings log
(appended by the routine as decisions land)

- **2026-07-20 — self-applied (clear-cut, no owner ruling needed).** Pinned
  `.claude/settings.local*.json` in the repo's own `.gitignore`. It was previously
  covered only by the machine's *global* git ignore, leaving a fresh clone / CI /
  contributor unprotected, and an untracked `settings.local.PROPOSED.json` (local
  permission allowlists, no credentials) protected by nothing. This just enforces
  the pre-existing "NEVER-tracked: settings.local.json" category → no taste call.
  **Generalized rule:** any `settings.local*` / machine-local Claude settings
  variant is NEVER-tracked and must be pinned in the *repo* `.gitignore`, not
  relied on via a per-machine global ignore.

### Open proposals — awaiting owner ruling (NOT yet decided)
The log above is deliberately short because **H1–H4 in DECISIONS.md are still
unruled** (2 cycles). Until Hadi rules, the 5 PRIVATE-candidate classes in the
Categories section (briefings/ · channel/ · HARNESS.md · DECISIONS.md ·
videos/*/feedback.json) remain **tracked/public as the de-facto state** — the
routine does NOT strip them unilaterally (see DECISIONS.md "Re-surface, run 2" for
the reasoning: recommendations lean KEEP PUBLIC, only PII is a low-harm personal
email, concurrent routines actively write those paths). An empty Rulings log here
means "pending," not "clean of open questions."
