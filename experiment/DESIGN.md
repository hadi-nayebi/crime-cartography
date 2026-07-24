# Batch-1 experiment — 20 US cities

> **Inherited reference design.** The 20 renders are not publication-ready
> dedicated-channel videos. They are inputs to the remake phase. Every inherited
> approval is invalid until a new cut is produced, inspected, and approved.

Twenty publication-ready videos, produced as a **designed experiment**. Every
video is unique in at least two dimensions; every video shares each of its
feature levels with at least one sibling. When batch-1 performance data lands
(views, retention curves, CTR, subs), features can be attributed — not guessed —
and batch-2 (cities 21–40) is produced from the winning levels.

## Design dimensions (levels)

| Dimension | Levels | What it tests |
|---|---|---|
| D1 `trendStyle` | bars · area · lollipop · steps · stacked | which chart form holds attention on the long arc |
| D2 `hookStyle` | stat (shock number) · question (quiz-first) · zoom (map-first) | first-8-seconds retention |
| D3 `storyFrame` | long-fall · plateau · rebound-and-retreat · composition-shift · geography-shift | which narrative arc clicks |
| D4 `paletteFamily` | warm · cool · mono+accent · dual-tone · neon-dark | visual identity family (hue itself stays city-true) |
| D5 `musicFamily` | cinematic-strings · electronic-pulse · ambient-atmos · jazz-tinged | score personality |
| D6 `durationSec` | 330 (standard) · 270 (tight cut) | length tolerance |
| D7 `mapEmphasis` | points-forward (dots bright, choropleth dim) · heat-forward (choropleth bright, fewer dots) | map readability preference |

Assignment lives in `experiment/matrix.json` (one feature vector per video) and
is constructed so each level appears ≥3 times and each video pairs with a
near-twin differing in exactly 1–2 dimensions (the attribution pairs).

## Confidence ledger

`experiment/confidence.json` — per video: `score` (0–100), per-axis rubric
(`data`, `representation`, `narrative`, `technical`), open `blockers`, and a
dated `history` of every change. Rules:
- New videos enter ≤75. Nothing ships below 100.
- +points only with evidence (validation pass, my own number re-verification,
  encode frame checks, watch-through of rendered output).
- Any discovered defect drops the score immediately and adds a blocker.
- 100 = every blocker closed + all four axes at 25/25 → publish via
  `pipeline/publish/upload-youtube.mjs` (private upload → public flip attempt →
  ledger records the YouTube URL).

## Honesty invariants (not experiment variables — never varied)

Sourced data only · exact monthly reconciliation · labeled measure seams ·
partial periods excluded · redactions/gaps disclosed on screen · OSM/basemap
attribution · per-city license terms honored · "Made by an AI" transparency in
every description.

## Evaluation plan (after publishing batch 1)

Primary: YouTube retention curve (esp. 0–15s and the seam/transition moments),
CTR, average view duration. Per-dimension: compare paired near-twins only.
Output: `experiment/RESULTS.md` → locked winning levels for batch 2.
