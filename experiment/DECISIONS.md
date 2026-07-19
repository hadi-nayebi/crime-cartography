# Producer decisions & open taste calls — for Hadi

Non-blocking items the producer resolved with its best judgment, plus a few that
genuinely want Hadi's taste/eye. Nothing here blocks production; these are logged
so Hadi can override any call on a watch-through. Newest first.

## 2026-07-19 — dashboard experiment-badge fields (note-watcher)

Resolving the dashboard note added scope + theme + note-placement-QA badges to
each video card (icon-only, label on hover) plus attention-first sorting and
stage-fit feedback. Interpretations I made (confirm or correct via a project note):

- **theme** badge reads each config's existing `theme.colors.bg` + `theme.catColors`
  (swatch dots + a light/dark **mode** derived from bg luminance). Configs have
  **no theme name**, so it shows "dark"/"light". Add `"theme": { "name": "ember", … }`
  to a config for a named experiment label — the badge picks it up automatically.
- **scope** badge = city | county | state | country, **defaults to city** (all
  current videos). Add `"scope": "county"` (etc.) to a config to mark a
  non-city cut; the badge + priority use it immediately.
- **note-placement QA** badge reads `videos/<slug>/qa.json` and shows "unreviewed"
  until a reviewer routine writes it — that routine is **requested in
  `experiment/HARNESS.md`** (a subagent that watches the rendered mp4 for
  annotations overlapping text / lacking a readable background shade).

Open question: do you also want the render surface to switch between reusable
named light/dark **theme presets** (engine-level, `surface/remotion/src/theme.ts`)
instead of each config carrying a full color block? Larger engine change —
flagged, not done, pending your call.

### DECISIONS NEEDED (Hadi's call — not blocking)

1. **Baltimore FBI 1999 = 503 (a broken UCR reporting year).** Baltimore's FBI
   history has a near-zero 1999 (503 total, surrounded by 72,994 in 1998 and
   66,397 in 2000) — a well-documented incomplete UCR submission that year, not a
   real crime drop. If shipped as-is the long-arc chart shows a false one-year
   crater. **Producer choice pending** — options, all honest: (a) annotate 1999
   on-chart as "incomplete FBI submission — not comparable"; (b) treat 1999 like
   the partial seam years and represent it as a within-era gap (needs a small
   build-trend change to allow a *labeled* intra-FBI-era hole, which today is
   fatal by design); (c) leave it and let the seam/era caveats carry it. I have
   **held Baltimore's config** until this is decided — its data is otherwise ready.
   Recommendation: (b) — a disclosed gap is the most honest, matching how we
   already handle the seam holes.

2. **Atlanta / Baltimore seam GAP is disclosed in copy + era chips, not yet drawn
   as a visible break.** The trend chart plots years by index, so the omitted gap
   years (Atlanta 2019–2020, Baltimore 2021) simply aren't drawn — the 2018 and
   2021 bars sit adjacent, with the gap disclosed via the era legend ("1985–2018"
   vs "2021–2025"), the dashed seam, and a custom `seamExplain`. This is honest
   but a sharp-eyed viewer could misread adjacent bars as consecutive years. A
   future engine enhancement could render an explicit hatched "no data" slot for
   `trend.seamGapYears`. Logged as an enhancement; not blocking. (Could not
   still-verify this session — music generation was holding the GPU.)

### Taste calls made (override freely on watch-through)

- **Story frames chosen from the data, per city:**
  - *Detroit* → "The Long Fall" (−69% 1985→2016, the flagship decline). Alt: lead
    on the incident-era plateau instead of the historic fall — rejected, the fall
    is the stronger, more honest hook.
  - *Denver* → "The Recent Turn" (−20% since the 2022 incident peak). Its FBI arc
    is a messy U-shape (big 1986→2008 fall, then a rebound to 2020), so a single
    "−X% over 40 years" line would mislead; I led on the clean, current,
    same-measure decline instead. Alt: "−59% by 2008" historic-low framing —
    rejected as stale and it hides the rebound.
  - *Milwaukee* → "Nearly Halved" (−44% 2006→2025, MPD's own measure, one ruler).
    A genuinely clean single-measure long fall — used it as the spine.
- **Hook stat rounding:** −69.3%→"−69%", −20.3%→"−20%", −43.9%→"−44%". Rounded to
  whole percent for the cold-open; the exact endpoints appear in the punchline.
- **Quiz framing:** kept the honest "reports the fewest Group A crimes" wording
  (not "safest per capita" — we have no per-neighborhood population). Note some
  "safest" neighborhoods are parks/industrial zones with near-zero residents
  (e.g. Detroit's Belle Isle) — honest but odd; the reveal already caveats
  "report counts only, not adjusted for population/area".
- **Duration:** all three at 330s standard. The 270s tight-cut level (design D6)
  will be assigned during matrix construction to specific near-twins, not chosen
  ad hoc here.

## D5 (2026-07-19, studio session) — Cohort publish vs YouTube quota: staged waves needed
**The math:** one upload ≈ 1,600 quota units; the default daily quota is 10,000
units/project → **max ~6 uploads/day** (thumbnails.set + playlistItems.insert add
~100/video; stats/catalog reads are negligible). "Publish all 20 at once" is not
possible on default quota.
**Options:** (a) **staged waves — ~5-6 videos/day over 4 days** (recommended:
also better for the experiment — daily waves let early retention data inform
nothing mid-cohort since all are pre-made, but avoids a 20-video same-hour flood
that YouTube's recommender may treat as spam); (b) request a quota increase in
Google Cloud Console (audit form, takes days-weeks — worth filing NOW in
parallel either way); (c) publish over a week, 3/day, matching a viewer-facing
release cadence ("new city every day" is itself a subscribable promise).
**My recommendation:** (c)-flavored (a): announceable daily cadence, ~4-5/day
over 4-5 days, ordered to alternate near-twin pairs so A/B comparisons get
similar-age cohorts. Decide the order rule when the cohort gates green.
