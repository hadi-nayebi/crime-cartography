# RESULTS.md — Channel Scientist ledger (live performance → learning)

> **Closed historical snapshot.** The three Earth One Crime Cartography uploads
> described below were permanently deleted on 2026-07-23. These observations
> must not be treated as current channel analytics or dedicated-channel
> performance. New results require dedicated Crime Cartography releases and a
> fresh dated collection.

> Reviewer tier. The channel-scientist writes here; nobody else. Every number
> traces to a YouTube API response or a repo file **read on the dated run** — no
> vibes, no carried-forward guesses. Findings correlate live performance with the
> designed experiment (`experiment/matrix.json`) and public metadata
> (`videos/*/youtube.json`). Title/thumbnail changes on live videos go to the
> **owner as PROPOSAL notes** (he decides; the producer/watcher applies only after
> his approval); running experiments are tracked in the **A/B log** at the bottom.
> With <5 published videos or <3 days of data, this file logs
> **"insufficient n — observations only"** and records DIRECTIONAL observations,
> never conclusions.

## Instrumentation status (read this before every run — so we never re-file)

- **`yt-analytics.readonly` scope: MISSING** (confirmed 2026-07-20 by refreshing
  the stored token: live grant = `youtube.upload youtube` only). This blocks the
  entire deep-analytics half of the scientist mission — **audience retention
  (audienceWatchRatio → drop-off-vs-phase mapping), averageViewPercentage,
  estimatedMinutesWatched, CTR/impressions, and subscribersGained are all
  403/unavailable.** Only `videos.list` counters (views/likes/comments) are
  readable today.
  - **Code side is already DONE:** the studio's `OAUTH_SCOPE`
    (`pipeline/dashboard/server.mjs:28-29`) already includes
    `…/auth/yt-analytics.readonly`, and `auth-youtube.mjs` requests it too. The
    only missing step is a human OAuth-consent click — a scheduled run cannot
    trigger it. **Owner action: open the studio and re-run `/oauth/start`
    (localhost:4400) so a fresh refresh_token carries the scope.**
  - Filed as **scientist/growth scope note** in `experiment/studio-feedback.json`
    (2026-07-20), consolidating the existing owner-facing thread
    (`DECISIONS.md` D6 + `HARNESS.md` "requested"). **This is the scope-note of
    record — do NOT re-file; update this line when the scope lands.**

## 2026-07-20 — first live-data run — INSUFFICIENT n (3 published, <1 day), OBSERVATIONS ONLY

**Context shift since ACTIVE.md:** all **3** published videos are now
**LIVE / public** (API `status.privacyStatus = "public"`), though their local
`videos/<slug>/youtube.json` still read `private/uploaded-private` (record lag,
harmless; the channel-manager owns drift-sync). The owner has published
boston-ma, washington-dc, and grand-rapids-mi. This is the first run with any
live performance data.

### Data snapshot — `videos.list part=statistics,snippet,status`, fetched this run
| slug | id | public since (UTC) | age at fetch | views | likes | comments |
|---|---|---|---|---|---|---|
| boston-ma | XHDs73XhSqY | 2026-07-20T16:37:56Z | ~6h33m | **7** | 1 | 0 |
| washington-dc | ldg_pQsNdMo | 2026-07-20T16:53:16Z | ~6h18m | **2** | 1 | 0 |
| grand-rapids-mi | EV4T91mTBQQ | 2026-07-20T22:59:16Z | ~12m | **0** | 0 | 0 |

Fetch stamp: 2026-07-20T23:10Z. These are single-digit counts — **at this scale a
single viewer moves a metric**, so nothing below is a conclusion.

### Directional observations (NOT conclusions — n is far too small)
- **Boston (7 views) > DC (2 views)** at near-identical age (~6.3–6.5 h). Tempting
  read: Boston's hook stat is the batch's joint-largest (**−71%** vs DC −48%),
  its palette is `neon-dark`, chart `lollipop`. But boston↔dc is **not a clean
  twin** — they differ on D1(lollipop/bars), D3(long-fall/rebound), D4(neon-dark/
  mono+accent), D7(points/heat) AND hook magnitude — so the 7-vs-2 gap is
  un-attributable to any one dimension and is within plausible noise for <10 views.
  **No lever credited.**
- Both boston & dc earned **1 like each** (like-rate ~14% and ~50% of views) — a
  positive early signal for the format, but on 7 and 2 views it is not
  interpretable. Logged, not weighted.
- **Likes/comments are Data-API proxies only.** The metric that actually decides
  batch-2 (retention shape + drop-off timestamps mapped to the hook/method/trend/
  map/reveal phases) is **unavailable until the analytics scope lands** (above).

### Near-twin readability (which comparisons are becoming legible)
- **grand-rapids-mi ↔ washington-dc — the cleanest narrative-arc A/B in the batch
  (matrix diff 1, isolates D3 storyFrame: long-fall vs rebound-and-retreat;
  identical D1 bars / D4 mono+accent / D5 cinematic-strings / D7 heat-forward;
  near-identical hook magnitude −51% vs −48%) is now BOTH LIVE.** This is the pair
  to watch: once GR accrues views and (critically) once retention is readable, it
  can attribute the effect of story-frame with almost everything else held equal.
  Not yet readable — GR is 12 min old with 0 views.
- **boston-ma ↔ milwaukee-wi** (diff 1, isolates D5 music family — the cleanest
  music A/B): milwaukee is **not yet published**, so this pair is pending.
- All 3 live videos share **D5 = cinematic-strings** and **stat** hook style, so
  music-family and hook-style effects are **not yet separable** in the live set.

### Blocked on scope this run (would have been produced with `yt-analytics.readonly`)
- Retention curves (audienceWatchRatio) per video → drop-off timestamps mapped to
  phases (hook 0:00–0:08 / method 0:08–0:22 / trend / map / reveal).
- averageViewPercentage, estimatedMinutesWatched, subscribersGained per video.
- CTR proxies (impressions + impressionClickThroughRate) — needed before any
  title/thumbnail A/B can be *measured* rather than merely *proposed*.
- `experiment/channel/analytics-<date>.json` is intentionally **not created** this
  run (no analytics data to write; creating an empty/faked file would violate the
  honesty rule).

## Brand audit log

- **2026-07-20 — title-formula drift on all 3 live videos (filed scientist/brand
  note, `studio-feedback.json`).** `BRAND.md` title formula = *verified-stat hook*
  (`"City Crime Fell X% Since YYYY — …, Mapped"`, exact figure matching the
  on-screen claim). The 3 LIVE titles are instead the **descriptive** form with no
  leading stat:
  - boston-ma: `"Boston Crime, 1985–2026 — Forty Years Mapped, District by District"`
  - washington-dc: `"Washington DC Crime, 1985–2026 — Forty Years Mapped, Cluster by Cluster"`
  - grand-rapids-mi: `"Grand Rapids Crime, 1985–2026 — How It Rose, Fell, and Moved | Data Map"`

  Each video's `youtube.json.titleOptions[0]` already holds a **brand-conformant
  stat-hook** (Boston "Fell 71% From Its 1989 Peak", DC "Fell 48% From Its 1993
  Peak", GR "Fell 51% Since 1985"). GR was published (22:59Z) *after* BRAND.md's
  stat-hook formula was written, so this needs an **owner reconcile**: either the
  live titles should move to the stat-hook form, or BRAND.md should be updated to
  bless the descriptive style. Reviewer does not decide; note filed for the owner.
- Descriptions & thumbnails (audited from `youtube.json`): descriptions conform
  (chapters + sourced provenance + on-screen-caveat honesty language, no
  fear-mongering, no unverified figures) — **no drift**. Thumbnail *image* content
  not verifiable via API this run (composed frames set per ACTIVE.md); deferred.

## A/B log (sequential title/thumbnail experiments on live videos)

Protocol: a change ships ONLY after the owner approves a PROPOSAL note; measure a
metric over **≥3 days pre / ≥3 days post**; log the verdict here.

| # | video | current → proposed | metric + window | status | verdict |
|---|---|---|---|---|---|
| — | — | — | — | **none running** | — |

**Candidate A1 (NOT yet a formal proposal — gated):** swap each live title from the
descriptive form to its staged stat-hook `titleOptions[0]` to test whether a
leading verified stat lifts CTR. **Held** because (a) CTR is unmeasurable until the
`yt-analytics.readonly` scope lands, and (b) there is no ≥3-day baseline yet
(videos are hours old). Revisit once both conditions are met; until then the
brand note above surfaces the drift for the owner without a measurement claim.
