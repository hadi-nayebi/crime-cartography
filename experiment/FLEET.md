# FLEET.md — the routine team charter

> One page every routine reads. The fleet is a TEAM producing one thing:
> a continuous flow of PUBLISHABLE videos for a successful channel.

## The flow model (owner ruling, 2026-07-20 — supersedes all wave/cohort plans)
- Videos flow: mechanical stages → producer verification → **REVIEW-READY**
  (every light green except verify) → owner watch-through + APPROVE (verify
  light) → **PUBLISH-READY** → owner clicks Publish in the studio → LIVE.
- **The owner is the only publisher.** No routine ever runs upload scripts.
  The machine's whole job is keeping his review queue stocked and his publish
  clicks one-tap easy.
- **Max, never a mean:** ≤6 uploads/24h (YouTube quota, enforced by the studio
  server). No schedule, no waves, no batching-for-batching's-sake. Ready →
  published.
- **STARVATION = ALARM:** a day where nothing new becomes review-ready and the
  owner's queue is empty is a management event, not a quiet day. It triggers
  the manager layer: harness-improver root-causes the bottleneck stage,
  fixes the routine/tooling gap, and logs it; the briefing reports it as the
  top line; the critic's operations lens hunts what the harness missed.
- Shorts/vertical derivatives: **ruled out** by the owner (2026-07-20).

## The team (role → contributes to the flow by…)
| Routine | Cadence | Contribution |
|---|---|---|
| batch1-production-driver | 2h | Mechanical stages (data/trend/basemap/sync/music/render) are NEVER the bottleneck. Clears its whole queue per run; cheap no-ops. |
| producer-work-session | 4h | Judgment: verification evidence, scoring, blockers, matrix, seam decisions, next-batch configs. Drives videos to REVIEW-READY; files a FLOW ALARM when the queue risks starving. |
| note-watcher | 5min | THE FIXER. Resolves one note per run at the ROOT CAUSE with category sweeps (WATCHER-LENS.md). Owner notes always first. |
| production-critic | 15min | THE FINDER. 3+ evidence-backed notes/run across rotating lenses; grows CRITIC-LENS.md. Feeds the watcher; never fixes. |
| youtube-channel-manager | daily | Channel truth: publish-readiness QA + quota ledger pre-publish; stats/comments/playlists post-publish. Comments with accuracy claims → producer, never auto-replied. |
| earth-one-channel-briefing | 8h | The owner's window: flow scoreboard first (review-ready N · awaiting-publish N · published-24h N/6 · starvation status), then decisions needed. Email once gmail auth exists. |
| harness-improver | 2×/day | The MANAGER LAYER: scheduler truth (enabled flags, lastRunAt), FLOW SLO check + starvation root-cause duty, token-efficiency, routine prompt tuning (logged verbatim). |
| repo-hygiene-reviewer | daily | Public-repo trust: secrets never leak, the public/private lens grows via owner rulings. |

## Shared interfaces (don't reinvent)
- Notes channel: videos/<slug>/feedback.json + experiment/studio-feedback.json
  — the SAME channel the owner uses; entries carry by/lens fields.
- Evidence: experiment/confidence.json (scores rise only on evidence; verify
  light is the OWNER's alone — a fresh APPROVE on the current render).
- Taste → owner: experiment/DECISIONS.md. Meta → experiment/HARNESS.md.
- Locks: experiment/.driver.lock (GPU/production), .notes.lock (notes writes),
  .critic.lock — all crash-safe: PID inside, liveness via kill -0, trap-release.
- Commits: scoped adds only, role-prefixed messages (driver:/producer:/note:/
  critic:/channel:/briefing:/harness:/hygiene:) — these prefixes ARE the fleet's
  health telemetry.
- Honesty invariants bind every role absolutely: never fabricate, never
  interpolate, disclose every gap; every on-screen number recomputed from
  normalized data.
