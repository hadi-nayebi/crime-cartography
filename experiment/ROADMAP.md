# Channel roadmap — Crime Cartography / Earth One

> **Historical inherited roadmap—superseded on 2026-07-23.** Earth One, fixed
> batches of 20, and same-day cohort publishing are not current strategy. See
> [`CURRENT-OPERATING-PLAN.md`](CURRENT-OPERATING-PLAN.md) and the public
> commentable roadmap instead.

The standing production strategy. Every stage feeds measured learnings into the
next; honesty invariants (see DESIGN.md) apply to every format forever.

## Cadence

1. **City batches of 20.** Produce → all reach confidence 100 → publish as a
   same-day cohort → **monitor a few days** (retention curves, CTR, avg view
   duration, comments) → write `experiment/RESULTS-batch<N>.md` → lock winning
   feature levels → produce the next 20 with them (keeping a small exploration
   slice so learning never stops).
2. **State comparatives — unlocked at ≥5 key cities in one state.** A new
   format: the state's key cities compared over time on one canvas — including
   an on-screen segment showing how each city's data was pulled, transformed,
   normalized, and joined so the comparison is honest (different sources,
   different measures, labeled). Batch-2+ city selection deliberately clusters
   states to unlock these early (TX, CA, OH, NY, TN are closest).
3. **Format expansion as coverage grows** — each format its own playlist:
   - All counties in a state, over time
   - State-by-state national comparisons
   - All-US major-cities timeline comparison
   - …every honest form of crime over time × location
4. **Co-variables (context layers).** Co-plot public datasets against crime:
   churches, libraries, schools, parks, population, income — over time and
   place. RULE: correlation is presented as correlation, never causation;
   every co-variable carries its own provenance and its own measure caveats.
5. **Continuous feedback loops.** Studio feedback (producer-side) + YouTube
   analytics and comments (audience-side) → ledger evidence → engine and
   format improvements → next batch. The channel is the experiment.

## Endgame — the studio as a product (revenue-gated, set 2026-07-18)

When the channel generates revenue: move production to a VPS and ship the
studio as a standalone open-source app — multi-tenant, anyone connects THEIR
YouTube channel via OAuth and produces data-honest city videos from this repo.
Architecture rules adopted NOW so nothing blocks it later:
- Studio stays a zero-dependency Node server; all state in plain repo files
  (configs, ledgers, feedback) — no hidden local coupling.
- Secrets strictly per-tenant-shaped (.secrets/ single-tenant today; the
  boundary is already clean for a per-user vault).
- Engine/config split stays absolute: a new operator = configs + data dirs,
  never engine edits.
- Known gates to clear at productization time: Google OAuth app verification
  (mandatory for public use of youtube.upload scope, incl. possible security
  assessment); YouTube API quota extension (default ≈6 uploads/day/project);
  Stable Audio Open license terms re-review for a hosted multi-user service
  (today's under-$1M/yr community license covers us, not necessarily tenants);
  renders are CPU-only (fine for VPS) but music gen wants GPU or a CPU path.
- Honest revenue framing: YPP eligibility first (1k subs + 4k watch hours);
  the batch→measure→improve loop is the engine that gets there. No timeline
  promises — the ledger and analytics decide.

## Current state coverage (toward the 5-city state comparatives)

MI: Grand Rapids, Detroit · TN: Nashville, Memphis · CA: San Francisco ·
TX: Dallas · plus 12 single-city states. Batch-2 targets: TX (+Houston, San
Antonio, Fort Worth, El Paso), CA (+San Diego, Sacramento, San Jose, Oakland,
Long Beach — LA re-checked each batch), OH (+Columbus, Cleveland, Toledo
alongside Cincinnati), NY (+Rochester, Syracuse, Yonkers alongside Buffalo —
NYC re-checked each quarterly refresh).

## In-video transparency (standing feature, from user direction 2026-07-18)

Every video carries a quick diagram scene — per chart type — showing how its
data was pulled → transformed → normalized → visualized (trend lineage and map
lineage), plus the seam explainer at every measure change. The repo remains the
full audit trail each video links to.
