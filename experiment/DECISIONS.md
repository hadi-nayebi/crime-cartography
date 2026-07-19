# Producer decisions & open taste calls — for Hadi

Non-blocking items the producer resolved with its best judgment, plus a few that
genuinely want Hadi's taste/eye. Nothing here blocks production; these are logged
so Hadi can override any call on a watch-through. Newest first.

## 2026-07-19 — batch-1 story frames: charlotte-nc / nashville-tn / dallas-tx (producer)

Same rules as the earlier trio (whole-percent hooks, exact endpoints in the
punchline, same-measure comparisons only). Frames chosen from the data:

- *Charlotte* → **"The Flat Line"** (±0%: 75,042 → 75,179, +0.2% across CMPD's own
  2017–2025 measure; hook adds the honest twist "the map underneath is not" —
  divisions diverge, University City +17% vs Airport −33% since 2022). The FBI
  arc is the misleading shape here (climb to 2007, fall to a 2014 low, then a
  rebound into the seam), so per the Denver "recent turn" precedent the lead is
  the clean same-measure recent line. Alts rejected: "−26% from the 2007 peak
  to 2016" (stale, and hides that the FBI era *ends on a two-year climb*,
  35,784 → 43,512); "−4% from the 2023 incident peak" (weak, cherry-picks a peak).
- *Nashville* → **"The Long Slide"** (−40%: 59,467 (1996) → 35,624 (2018), one FBI
  ruler; violent crime peaked the same year, 10,021 — a clean rise-then-fall arc,
  Detroit-style). Alts rejected: incident-era "−9% since 2024" (too short a base,
  105,071 is a single-year high); window "−6% 2022→2025" (true, kept as an
  annotation, but the 22-year slide is the stronger honest spine).
- *Dallas* → **"Two-Thirds Down"** (−68%: 171,772 (1988) → 54,511 (2014), the
  batch's steepest single-measure fall). The DPD era then *rose* 2015→2021
  (84,996 → 114,352) before falling again — shown honestly in the notes
  (2021 high) and window annotation (−15% 2022→2025), never hidden. Alt
  rejected: leading on the recent "−15% since 2022" (Denver-style) — the FBI-era
  fall is clean, not U-shaped, so the historic frame is both stronger and honest
  (Detroit precedent).
- Hook rounding: +0.18%→"±0%", −40.09%→"−40%", −68.27%→"−68%".
- Disclosure calls: Charlotte's 800-series (128,848) + unfounded (21,392)
  exclusions carried in coverageText, methodFootnote, creditsSources, listing +
  README; Dallas's source-level sex-offense/juvenile exclusion carried in
  sourceLine, coverageText, seamExplain, methodFootnote, creditsSources, listing +
  README, with ODC-BY attribution; Nashville's offense→incident dedup
  (906,703→750,423) + 5,467 unfounded exclusions in creditsSources, listing +
  README, and its ~2–3-decimal source-rounded coordinates disclosed wherever
  dots are described (never called "block-anonymized").

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
   **Ruling (2026-07-19, implemented):** option (b) adopted. `build-trend.mjs`
   gained a general `artifactYears`/`artifactReason` plan option: declared years
   are omitted from the assembled series (never corrected/interpolated), recorded
   in `trend.json` as `artifactYears` + `artifactReason`, appended to the honesty
   note, and the contiguity check passes only holes whose every missing year is
   declared — undeclared within-era gaps stay fatal. Applied to baltimore-md
   (1999 omitted + disclosed; evidence 1997 77,982 · 1998 72,994 · **1999 503** ·
   2000 66,397 · 2001 63,914). Detroit rebuilt as regression — semantically
   unchanged. Baltimore's config is now unheld; both disclosures (1999 artifact +
   2021 seam gap) are covered in its `seamExplain`. Full trail in
   `data/baltimore-md/PROVENANCE.md`.

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
