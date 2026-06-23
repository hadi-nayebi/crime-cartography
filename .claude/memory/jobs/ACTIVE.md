# ACTIVE JOB — Crime Cartography video pipeline

> Durable state. Chat dies at /compact; THIS file is ground truth. Read first after every compact; update before every compact and at every focus boundary.

## Mission
Repeatable YouTube pipeline: city crime data → engaging ~5-min animated map videos (heat + points over time, counters, dispatch feed, narrative). One reusable visual SURFACE that plugs into many datasets (cities → counties → states → all-US). Published as a public GitHub repo for community growth.

## Hard constraints (user, 2026-06-22) — BINDING
1. **Strict data honesty.** NEVER fabricate or synthesize data points. Every point/figure must be factually sourced with a reliable, citable LINK. No "approximate placement" synthesis. If only aggregate counts exist (no coords), do NOT invent dot positions — visualize honestly (choropleth/counts) or defer.
2. Build datasets **via workflows**; each dataset records its source link + provenance.
3. Public repo, community-growable → everything proper, documented, reproducible.
4. Renderer of record = **Remotion** (deterministic export). Leaflet HTML = live preview only. One data contract feeds both.
5. Self-compact at ~40% context, targeting THIS tmux pane %3 (session yt-re) ONLY — never siblings %0/%1/%2. Write this file first, then fire self-compact.

## Decisions locked
- First deliverable: ONE full Grand Rapids, MI video end-to-end (vertical slice), then generalize.
- Data honesty mode: real, coordinate-accurate only (GRPD ArcGIS Hub ~6-month window). Long decades-sweep deferred until a real sourced historical dataset exists.
- GitHub: PUBLIC repo, created now under account hadi-nayebi. Name: crime-cartography (confirm/rename if needed).

## Canonical incident schema (from DATA_HANDOFF §3)
row = { date:"YYYY-MM-DD", lat:Number, lng:Number, cat:"persons|property|society", type?:String, place?:String }
NIBRS groups → cat: Crimes Against Persons→persons, Against Property→property, Against Society→society.

## Repo layout
- data/ (raw + normalized, provenance in data/README.md)
- pipeline/ (sources/ adapters, normalize, validate, schema)
- surface/ (remotion/ export + preview/ Leaflet HTML)
- videos/grand-rapids-mi/ (config + output)
- wiki/ (Home, Data-Provenance, Add-a-City)
- .claude/ (self-compact skill, hooks, this memory)

## Data sources (DATA_HANDOFF §5) — ranked
A. GRPD open data (ArcGIS Hub) — incident-level points, NIBRS, ~last 6mo, ~1mo lag. BEST for real dots. Hub: https://grpd-grandrapids.hub.arcgis.com/
B. City of GR open data portal — https://grdata-grandrapids.opendata.arcgis.com/
C. FBI CDE — historical agency COUNTS only, no coords. https://cde.ucr.cjis.gov/
D. Michigan MSP MICR — aggregate counts. E. FOIA GRPD — possible historical points.

## KEY DATA FINDING (2026-06-22) — strategy pivot
The GRPD Crime Data layer has **NO coordinates** (`geometryType: None`). The handoff wrongly assumed block-level points. Reality:
- Layer: GRPD_Crime_Data/FeatureServer/0 @ services2.arcgis.com/L81TiOwAPO1ZvU9b — **210,488 records, 2023-01-01 → 2026-06-01 (3.4 yrs)**.
- Fields: DATEOFOFFENSE, NIBRS_Category (clean!), NIBRS_GRP, Offense_Description, OFFENSETITLE, **Beat__ (38 beats)**, Service_Area, BLOCK_ADDRESS (text only), Weapon_Type, Day_of_the_Week.
- Beat POLYGONS (real geometry): GRPD_SERVICE_AREA_MAP_NEW/FeatureServer/1 (GRPD_ServiceArea_Beats_2025, field BEAT).
- **Honest viz = animated BEAT-LEVEL map over 3.4 yrs**: real monthly counts joined to real beat polygons; proportional symbols at real beat centroids (labeled as per-beat aggregates, NOT individual incidents); real category split; feed of real offenses. NO fabricated dots — honors the no-fabrication rule and gives a real multi-year sweep.
- Category map via NIBRS_Category: Crimes Against Person→persons, Property→property, Society→society; Local/Local-DL/All Other/0→`other` (137,988 "Local" dominate — local-ordinance e.g. "Sound of Gunshots"; keep visible + honestly labeled). NIBRS Group A subset (persons+property+society) ≈ 54,870.
- License: City of Grand Rapids GIS Data Access/Use Constraint Agreement ("as is", complementary public service). Record in PROVENANCE.

## V2 UPGRADE (user feedback 2026-06-23) — "only 40% satisfied", locked decisions
User wants a richer video. Approved approaches (via AskUserQuestion):
1. **DOT-DENSITY (not one disc/beat).** Many count-accurate dots scattered INSIDE each beat polygon. DISCLOSED on screen: "1 dot = K incidents, distributed within the beat to show density — NOT actual locations." This is the honest reconciliation of "show individual dots" with the no-coordinates reality (GRPD has none). Refines BINDING rule #1: dots = density glyphs in REAL regions, disclosed, never claimed as locations. Use seeded point-in-polygon sampling (deterministic; NO Math.random in Remotion). Dots driven by trailing-window count; bloom in / fade out for motion. Focus dots on Group A (persons/property/society); "other" as background shading (labeled).
2. **DEEP HISTORY 2000→now.** Real FBI UCR/CDE data fetched: Grand Rapids PD = ORI **MI4143600** (NOT MI0410100). Annual Violent + Property 2000–2022, 23 full yrs NO gaps. In hand + cached at data/grand-rapids-mi/raw/fbi_ucr.json (gitignored) + committed normalized/history.json (real annual counts: 39,659 violent + 168,196 property total). Era 1 animates these as MONTHLY AVERAGE (annual÷12), LABELED "annual average · FBI UCR". UCR taxonomy (Violent/Property) is DISTINCT from NIBRS — do NOT equate UCR Violent with NIBRS persons; bridge honestly at 2023. API via api.usa.gov CDE, DEMO_KEY (rate-limited ~30/hr; set FBI_API_KEY). Adapter: pipeline/sources/fbi-ucr.mjs; normalizer: pipeline/normalize-history.mjs.
3. **AUDIO**: user said "do what best fits + I'll judge" → generate ambient/binaural bed THAT REACTS to data movements (month ticks, era transition, leaderboard, peak months). Synthesize WAV procedurally in Node (no copyright, no external asset), add via Remotion <Audio>. Then user judges.
Also: better Remotion motion graphics (info pops at the right MAP location, anchored to beat centroids); bring the LEADERBOARD into the recent/granular era (not only the final reveal) "as we get more data".

### V2 narrative arc (two eras; extend to ~5:30–6:00, config-driven phase times)
cold open → method card (explain BOTH eras + dot-density disclosure) → ERA 1 history sweep 2000–2022 (city-level, labeled annual-average, evolving bars + big numbers, NO beat/dot detail) → era-transition card "2023: NIBRS begins, the map comes alive" → ERA 2 granular sweep 2023–2026 (beat dot-density + 4 cats + LIVE leaderboard + annotations popping at locations) → reveal/leaderboard finale → credits. Unified month space 2000-01..2026-06 (318 mo): era1 monthly=annual/12; era2 real monthly.

### V2 build tasks (status)
- [x] FBI scout + fetch (ORI MI4143600), raw/fbi_ucr.json + normalized/history.json + fbi-ucr.mjs + normalize-history.mjs
- [x] **V2 SURFACE BUILT + STILL-VERIFIED** (2026-06-23): all files tsc-clean. New: src/data/dots.ts (seeded mulberry32 + point-in-polygon + makeDotCategories), src/components/{DotLayer,HistoryEra,EraTransition,Leaderboard,MapAnnotation}.tsx; MapLayer +showSymbols; MethodCard v2 (dual-era+dot-density+UCR≠NIBRS disclosure); load.ts+types load history.json. theme PHASES = 2-era (cold13/method39/history150/transition163/granular292/reveal318/close330). CrimeStory rewritten: history era (yearFloat) → EraTransition → granular era (gFloat, dots+choropleth+leaderboard+HUD+map-annotations). config+Root: durationSec 330, audioSrc, historyNotes (3, checkable), annotations (5, Central3 beat-anchored). Stills confirmed: dots = many per beat colored by cat ✓; history bars+monthly-avg labels ✓ (2010: 137 violent 655 property = annual/12 ✓); transition card ✓; map-annotation pops at Central3 centroid ✓; method card full disclosure ✓.
- [x] Audio: pipeline/audio/gen-bed.mjs → public/audio/grand-rapids.wav (58MB, 330s stereo, data-reactive: pads+6Hz binaural+month ticks+transition riser+reveal swell), <Audio> wired. gitignored public/audio.
- [ ] **RESUME HERE**: v2 full render in progress (bg birlr3niy) → videos/grand-rapids-mi/out/grand-rapids-v2.mp4. When done: extract a frame to verify, then update PROVENANCE.md + wiki/Data-Provenance.md with FBI UCR source, COMMIT+PUSH v2 (new src + dots + history pipeline + audio gen + config; NOT the wav/mp4 — gitignored). Then show user / ask judgement (esp. audio).
v1 baseline (commit d1d7edc): 5-min single-era beat-aggregate video — DONE, on disk videos/grand-rapids-mi/out/grand-rapids.mp4.

## Status / next actions  (v1 — superseded by V2 above)
- [x] Read handoff + HTML shell + sibling self-compact mechanism
- [x] Scaffold repo dirs; port self-compact skill (verified targets pane %3)
- [x] git init + create PUBLIC repo: github.com/hadi-nayebi/crime-cartography
- [x] Discover GRPD layer + schema + honest strategy (above)
- [x] data/grand-rapids-mi/PROVENANCE.md
- [x] pipeline/sources/grpd.mjs: fetched 210,488 records + 33 beat polygons (raw gitignored, _fetch_meta kept)
- [x] pipeline/normalize.mjs: 42-month per-beat per-category timeline + centroids + 322-item feed (~178K bundle)
- [x] pipeline/validate.mjs: 10 invariants PASS (96.7% placed, totals reconcile)
- [x] COMMITTED + PUSHED milestone (commit 7267032). Repo: github.com/hadi-nayebi/crime-cartography
- [x] surface/remotion/DESIGN.md written (full video blueprint — READ IT before building)
- [x] **Remotion surface BUILT** (Opus, 2026-06-22): blank create-video scaffold in surface/remotion/.
      - src/theme.ts (palette/phases), src/data/{types,load,derive}.ts (fetch bundle via staticFile + projection fit + cumulative/window aggregation + deriveStats).
      - Components: MapLayer (projected beat polygons + choropleth + √-scaled glowing centroid symbols — REAL per-beat aggregates only), Counters, TimelineChart, Feed, Clock, Annotation, MethodCard, ColdOpen, Reveal, Credits, SourceCredit.
      - src/CrimeStory.tsx ties phases (coldopen 0-20 / method 20-45 / sweep 45-210 / reveal 210-270 / close 270-300); src/Root.tsx has calculateMetadata loading bundle + duration 9000f@30fps.
      - scripts/sync-data.mjs copies data/<slug>/normalized → public/data/ (gitignored; source of truth stays in /data). RAN for grand-rapids-mi.
      - videos/grand-rapids-mi/config.json: 5 annotations ALL verified against timeline.json (Jul2023 peak GroupA=1680; summer property ~663 vs winter ~503; Central 3 busiest GroupA=4835; May2026 persons peak=628). tsc clean.
      - VERIFIED via 6 half-scale stills (coldopen/method/sweep/anno/reveal/close): honesty overlays present — source credit persistent, method card states "no incident coordinates / per-beat aggregate / 96.7% / 33 beats", Local/Other labeled, reveal ranks match computed stats, close = "210,488 sourced records. No invented points."
- [x] **RENDERED + COMMITTED + PUSHED** (commit d1d7edc, 2026-06-22): videos/grand-rapids-mi/out/grand-rapids.mp4 — 1920×1080, 30fps, 300.05s, 51MB, h264. ffprobe valid; mp4 frame@133s matches still. Render cmd (from surface/remotion/): `npx remotion render CrimeStory ../../videos/grand-rapids-mi/out/grand-rapids.mp4 --props=../../videos/grand-rapids-mi/config.json`. mp4 is gitignored (videos/**/out + *.mp4) → publish via YouTube/Releases.
- [x] wiki: Home, Data-Provenance index, Add-a-City (committed). surface/remotion/README done.
- [ ] **GR VERTICAL SLICE COMPLETE.** Next options (ask user / pick): (a) publish mp4 to YouTube + finalize README status badge; (b) surface/preview/ HTML parity to real bundle; (c) generalize to a 2nd city (proves the plug-in surface) — pick a sourced open-data city, run pipeline/sources adapter → normalize → validate → copy config → render; (d) vertical 1080×1920 cut variant.
- [ ] Update surface/preview/ HTML to read the real normalized data (preview parity) — optional.
- [ ] Dataset catalog growth: cities→counties→states→US (each sourced + provenance first).

## Self-compact command (this pane)
bash .claude/skills/self-compact/self-compact.sh "<DIRECTIVE>" "<FOLLOWUP>"
(auto-targets $TMUX_PANE=%3. Shapes required — see SKILL.md. Verify with --dry-run / --check-shape.)
