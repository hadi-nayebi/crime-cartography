# Channel roadmap — Crime Cartography / Earth One

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
