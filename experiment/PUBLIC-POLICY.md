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
