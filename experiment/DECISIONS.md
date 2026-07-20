# Producer decisions & open taste calls — for Hadi

Non-blocking items the producer resolved with its best judgment, plus a few that
genuinely want Hadi's taste/eye. Nothing here blocks production; these are logged
so Hadi can override any call on a watch-through. Newest first.

## Repo hygiene

Proposals from the daily repo-hygiene-reviewer routine (public-vs-private lens).
Nothing here is a secret leak — the secret scan is clean (see note below). These
are ambiguous public/private calls awaiting Hadi's ruling. Answer inline (edit
this section) or via a studio project-note; the routine then applies the change
and generalizes the ruling into `experiment/PUBLIC-POLICY.md`.

**Secret-scan status (2026-07-20, re-verified 12:0x run): CLEAN.** Second scan of
the day (post-batch of ~24 changed files incl. new `experiment/channel/*`
snapshots, `pipeline/status.mjs`, CRITIC/WATCHER lens docs, `boston-ma/thumbnail.jpg`).
No credential shapes, OAuth client_id/secret literals, tokens, `.env`/`.pem`/key
files, or high-entropy strings in tracked files. `.secrets/` is gitignored and
untracked; every code path reads credentials from `.secrets/` at runtime and
embeds none; `pipeline/audio/README.md` uses a `hf_YOUR_READ_TOKEN` placeholder.
No phone numbers or street addresses. Channel snapshots carry only PUBLIC YouTube
channel/playlist IDs (`UC…`/`PL…`), not tokens. New personal-email hits are only
the critic *quoting* the H1 issue (CRITIC.md, studio-feedback.json) — same
address, no new vector. Nothing needs `git rm --cached`.

### H5 — `.claude/settings.local*.json` repo-gitignore gap — SELF-APPLIED (clear-cut)

`settings.local.json` is already NEVER-tracked policy, but on 2026-07-20 it was
protected only by the *machine's global* git ignore (`~/.config/git/ignore`), not
the repo's own `.gitignore` — so a fresh clone / contributor / CI would not have
that protection. Worse, an untracked `.claude/settings.local.PROPOSED.json`
(5.6 KB of local permission allowlists + PIDs + systemctl commands; no
credentials) sat protected by *nothing*, one `git add -A` from being committed.
**Applied this run:** added `.claude/settings.local*.json` to the repo `.gitignore`
(covers both `settings.local.json` and the `.PROPOSED` variant). Nothing was
tracked, so no `git rm --cached` / history exposure. This implements the existing
NEVER-tracked category, not a new taste call → self-applied, logged to
PUBLIC-POLICY.md Rulings log.

### Re-surface (2026-07-20, run 2) — H1–H4 still UNRULED; critic escalated the same gap

H1–H4 (filed 10:29 run) have **no ruling yet**. Independently, the critic
(infrastructure lens, note 15:xx in `studio-feedback.json` + `CRITIC.md:34`)
flagged the exact contradiction: PUBLIC-POLICY.md lists **5 PRIVATE-candidate
classes** (`experiment/briefings/`, `experiment/channel/`, `HARNESS.md`,
`DECISIONS.md`, `videos/*/feedback.json`) whose gray-zone rule says "keep OUT
until ruled," yet `git ls-files` shows **all 5 already tracked** while the Rulings
log is **empty** — so routines commit them on gut, not on a decision. The critic
asks the hygiene reviewer to, at minimum, `git rm --cached experiment/briefings/`.

**I did NOT remove anything.** Reasons, so Hadi can rule cleanly: (1) my charter
forbids acting on ambiguous items until ruled; (2) removal is a substantive
brand decision, not hygiene — my own H1/H2 recommendations lean **KEEP PUBLIC**
(radical process transparency is the channel's differentiator; the lone PII is a
personal-domain email already assessed LOW-harm under H1(a) and identical to the
deliberately-hardcoded notify addresses); (3) `experiment/briefings/`,
`experiment/channel/`, `studio-feedback.json` are actively written by concurrent
routines — a mid-flight `git rm --cached` would race their in-flight commits. The
correct resolution of a policy-vs-practice gap where practice has been public and
low-risk is **ratify-or-remove per class**, not a retroactive strip.

**One decision, five classes — please pick per class (default in brackets):**
`experiment/briefings/` [KEEP], `experiment/channel/` [KEEP], `HARNESS.md` [KEEP],
`DECISIONS.md` [KEEP], `videos/*/feedback.json` [KEEP]. Answer inline or via a
project-note; I'll apply + log each into PUBLIC-POLICY.md's Rulings log and stop
re-surfacing. If you want zero personal PII regardless, the narrowest move is to
read the notify sender/recipient from `.secrets/notify.json` (H1(a) alt) — say
the word.

### H1 — Personal emails in tracked files (seed open item) — NOT YET RULED

`hadinayebi@earthone.life` and `earthone@earthone.life` appear in tracked files.
Three distinct sub-cases with different recommendations:

- **(a) `pipeline/notify/*` — DELIBERATE auditable hard-coding.** `send-email.mjs`
  and `auth-gmail.mjs` hard-code `SENDER = earthone@…` / `RECIPIENT = hadinayebi@…`
  as the *sole allowed* identities, re-verified on every send — this is a
  single-tenant safety guardrail (the mechanism that makes "briefings can only go
  to Hadi" auditable), not a config value. Exposure risk: LOW — a personal-domain
  address harvestable by scrapers (spam), no account-takeover value.
  **Recommendation: STAYS PUBLIC.** The auditability is the point and the harm is
  minimal. If you'd rather not publish the address, the alt is to read both from
  `.secrets/notify.json` (or env) with the identity-lock assertion kept — small
  change, weakens the "grep the code and see exactly who can be emailed" property.
- **(b) `experiment/PLAN.md:32` + `experiment/briefings/*` + `experiment/HARNESS.md`
  — incidental mentions** inside operational docs ("briefing to hadinayebi@… every
  8h", "signed in as earthone@…"). These ride along with whatever ruling covers the
  experiment/ operational-exhaust class (H2). If those go private, this resolves
  itself; if they stay public, it's the same address as (a). **Recommendation:
  fold into H2 — no separate action.**
- **(c) `PoliceOpenData@minneapolismn.gov`** (PROVENANCE, source adapter, wiki) is
  a **public government data-source contact**, part of the provenance/transparency
  brand. **Recommendation: STAYS PUBLIC as a standing rule** — public-agency
  provenance contacts are always fine; only *personal* PII is in scope.

### H2 — New `experiment/` role, lens & ops files — uncategorized

A family of internal "how the AI fleet runs" files has grown and isn't yet in the
policy: `FLEET.md` (team charter), `CRITIC.md` + `CRITIC-LENS.md` +
`WATCHER-LENS.md` (reviewer role/lens files), `studio-feedback.json` (critic
notes). These are the same species as the already-listed PRIVATE-candidate
`HARNESS.md`/`DECISIONS.md` — internal operational/taste process, no secrets, no
third-party PII. This wants a single **class ruling** for all "AI-fleet ops &
lens" docs rather than file-by-file calls. **Recommendation: KEEP PUBLIC** —
radical transparency about the AI production process is itself the channel's
brand differentiator, and none of these expose anything sensitive. (Counter-view,
your call: they're inside-baseball ops noise that clutters the public repo and
could go to a private `ops/` submodule.) Whichever way you rule, I'll generalize
it to cover future `*-LENS.md` / role files automatically.

### H3 — `experiment/matrix.json` + `experiment/factsheets-batch1.txt` — audit trail

Experiment feature vectors (matrix) and the aggregate factsheets used to build
configs. Same class as `confidence.json`, already ruled PUBLIC (audit trail).
Content is aggregate stats only — no PII, no secrets. **Recommendation: PUBLIC
(audit trail), same rule as confidence.json.**

### H4 — `pipeline/dashboard/` (server.mjs + index.html) — production console

The studio/production console. It *reads* `.secrets/youtube_client_secret.json` +
`youtube_token.json` at runtime but embeds no credential literals (verified: only
`conf.client_id`/`conf.client_secret` variable refs, no hardcoded values). It's
code, so it fits "PUBLIC by design (code)", but it's an internal operator tool.
**Recommendation: PUBLIC** — it's clean code and demonstrates the reproducible
publish path. Flag only so it's a deliberate choice, not a default.

## 2026-07-20 — two on-screen items surfaced during encode verification (producer)

While encode-verifying the 12 batch-1 renders (all 12 PASS — hooks/punchlines/ref-lines/
reveals/credits all match config and source data, 0 honesty defects), two non-blocking
on-screen items came up that want a taste/policy call:

**1. On-screen "made by an AI" authorship line — absent by design.** The video Credits
card carries the data-source credit, the license attribution (OSM/ODbL + city data), a
reproducibility line ("every number here is reproducible · full code, data & sources on
GitHub"), and a music-AI disclosure ("Music generated with Stable Audio Open (Stability
AI)") — but **no explicit "this video was made by an AI (Claude/Anthropic)" line on the
video itself.** The full AI-authorship + transparency statement lives in every
`youtube.json` **description** (verified present on all 12: "AI ✓ Claude ✓ transparency ✓").
The 8 already-shipped originals are the same way, so this is a consistent repo-wide design,
not a per-video gap. **Producer call (non-blocking): the description carries the required
transparency, so I did not treat this as a defect.** If Hadi wants the AI-authorship stated
*on-screen* too (arguably stronger transparency given "your reputation is attached"), that's
a one-line Credits.tsx addition + a batch re-render — flag it and I'll do it in the next
render wave. Logged so it's an explicit choice, not an oversight.

**2. Reveal leaderboard header noun for division/precinct cities.** For the four cities whose
regions are police divisions/precincts (charlotte, dallas = "police division"; nashville,
memphis = "police precinct"), the reveal panel header still reads the generic **"Busiest
neighborhoods"** even though the listed entries correctly name the divisions/precincts. The
data is right; only the header noun is generic. Small engine nit (Reveal/Leaderboard header
should read from `regionNoun`). I docked those four cities' representation axis by 1 (rep 22→21)
to reflect it and filed it as an engine item; not a honesty issue, not a publish-blocker.

## 2026-07-20 — experiment matrix assigned (producer)

Built `experiment/matrix.json` — the 7-dimension feature vector for all 20 videos
(DESIGN.md D1–D7), reconciled with the configs. Every on-screen hook/punchline
NUMBER was independently re-verified from `data/<slug>/normalized/trend.json` first
(all 20 exact endpoints check out; the two incident-era hooks that could have been
distorted by the placed-cells bug — Charlotte's flat line and Memphis's −32% — were
cleared: both cities place records by *administrative* tag, 99.9% / 98.8%, not by
geocode, so placed-share doesn't drift, and both series are smooth with no placement
cliff).

Two calls worth your eye (override freely):

1. **Two D3 story-frame cells sit at 2, not the design's ≥3 — on purpose.**
   `geography-shift` (Seattle, Charlotte) and `composition-shift` (Memphis, Atlanta)
   each have only two *honest* members. Batch-1's 20 US cities are genuinely
   dominated by long-decline stories (the real post-1990s national trend); only two
   cities each lead on a neighborhood-reshuffle arc or a category-mix arc. I did
   **not** relabel a trend-led video's frame to fill the grid — honesty invariants
   outrank the experiment grid (DESIGN.md). `stacked` (D1) also sits at 2 for the
   same reason: the stacked chart only means something when composition is the
   story, so `stacked == composition-shift == 2` by design. **Batch-2 action:**
   deliberately source cities with dominant geography/composition arcs to reach ≥3.
   Everything else hits ≥3 (D1 steps brought to 3, D2/D4/D5/D6/D7 all balanced).

2. **cincinnati-oh trendStyle area → steps** (the only config field changed this
   session; no numbers touched). Purely to bring D1 `steps` from 2 to 3. Cincinnati
   is a "corner" city with no clean near-twin, so nothing breaks; steps reads well
   on its clean −45% long fall; it's unrendered so there's no re-render cost. I kept
   **baltimore on bars** (not steps) specifically to preserve the cleanest palette
   A/B pair in the batch (baltimore ↔ kansas-city differ only in palette+music).
   Revert to area if you prefer the identity-plan choice.

Design highlights (for context, not decisions): the batch has two **1-dimension**
near-twins — *boston ↔ milwaukee* isolates music family with everything else equal,
and *grand-rapids ↔ washington-dc* isolates the story-frame (long-fall vs
rebound-and-retreat) with everything else equal — plus eight clean 2-dim pairs, so
each primary dimension is cleanly attributable once retention data lands. Four
"corner anchor" cities (detroit, charlotte, buffalo, cincinnati) are deliberately
multi-dimensionally unique but still share every level with ≥2 siblings.

**Engine dependencies flagged in matrix.json:** D2 question/zoom hook variants, D6
270s tight-cut (phases-from-config), and the D7 points/heat toggle are still OPEN
engine dims. Cities assigned those levels fall back to the built default until the
dim lands; all 20 re-render together with the MethodDiagram standing feature.

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

### 2026-07-20 — theme-name vocabulary defined + set on all 20 (note-watcher)

Resolves the critic/studio note (`studio-feedback.json` 2026-07-20T00:01:57Z):
`theme.name` was null on all 20 configs, so the dashboard theme badge fell back to
the luminance-derived mode — 19 identical "dark" badges + grand-rapids (no theme
block) showing none — making the batch illegible as distinct "experiment points"
(owner note 2026-07-19T21:18). **Root cause:** the config-authoring step never
emits `theme.name`, and no vocabulary existed. **Fix (this run):** defined the
vocabulary below and set a distinct, honest `theme.name` on every config, each
name DERIVED FROM that city's real committed palette (`theme.colors.bg` tint +
`theme.catColors`), not invented. Grand-rapids got a full `theme` block whose
color values EQUAL the engine defaults (`surface/remotion/src/theme.ts` COLORS +
CAT_COLORS) — badge parity with zero render change.

**Metadata-only, NO re-render:** `applyThemeOverrides` (theme.ts) reads only
`theme.colors`/`theme.catColors`; `theme.name` is consumed solely by the dashboard
(`index.html` `themeBadge`, `server.mjs` `themeSummary`). GR's block equals the
defaults it already rendered with, so all 20 mp4s are untouched → no confidence
blocker filed.

**Vocabulary (name = accurate description of that config's actual dark palette):**
`moss` (atlanta, green-black + mint), `rust` (baltimore, orange+teal),
`sage` (boston, muted green-gold), `steel` (buffalo, silver property),
`brass` (charlotte, metallic gold), `ember` (chicago, warm amber bg),
`clay` (cincinnati, terracotta), `cobalt` (dallas, sky-blue),
`glacier` (denver, pale glacial blue), `iron` (detroit, steel-blue+yellow),
`neon` (grand-rapids, vivid pink/amber/cyan = engine default),
`jade` (kansas-city, turquoise), `cyan` (memphis, bright cyan),
`wheat` (milwaukee, wheat-gold), `amethyst` (minneapolis, purple property),
`honey` (nashville, warm gold), `iris` (philadelphia, periwinkle+purple),
`sunset` (san-francisco, warm balanced), `tide` (seattle, deep+bright blue),
`marble` (washington-dc, pale gold+sky). All 20 are dark-mode.

**Honesty rule for this field:** a `theme.name` is an operator-facing label that
must accurately describe the config's own colors — never assert light when the bg
is dark, never a hue the palette doesn't carry. It is NOT an on-screen data claim
(never appears in the video), so it carries no incident-data honesty risk.

**Still open — the light/dark axis is untested (0 light-mode cities).** The owner
wanted to compare light vs dark; all 20 are dark. Flipping an existing city to
light means new bg/ink colors = a REAL re-render (producer's GPU + a design call),
so it was NOT done here. Filed to HARNESS.md 'requested': (1) authoring must emit
a `theme.name` from this vocabulary for every new config; (2) a future wave should
include ≥1 genuinely light-mode city (light bg palette + re-render) so the axis has
data. Grand-rapids's default-mirroring block is the template for adding a theme
block to any bare config without changing its render.

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

## RULING D5 (Hadi, 2026-07-20) — publishing is a FLOW, not a schedule
Verbatim intent: routines together produce PUBLISHABLE videos; when a video
reaches publishable status it gets published — "we can have a max, but we
cannot have a mean." Zero-ready days are a management event: they must trigger
manager-level routine operations (harness diagnoses + improves) so ready videos
flow again. Hadi is the only publisher (studio modal — his thumbnail/title
choices). Shorts/vertical derivatives: RULED OUT. Implemented: experiment/
FLEET.md team charter; producer flow-SLO + alarm; harness starvation duty;
briefing flow scoreboard; studio server enforces ≤6/24h as a hard MAX (HTTP 429).
