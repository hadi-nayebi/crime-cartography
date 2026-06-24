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
- [x] **V2 RENDERED + COMMITTED + PUSHED** (commit fe963fb, 2026-06-23): videos/grand-rapids-mi/out/grand-rapids-v2.mp4 — 1920×1080 h264 + AAC stereo, 330.05s (5:30), 44MB. Verified: encoded frame matches stills; audio muxed + data-reactive (history −30.8dB vs granular −22.4dB mean). PROVENANCE + wiki updated w/ FBI source. v1 (grand-rapids.mp4) kept for comparison. mp4/wav/raw gitignored.
- [x] **MUSIC ADDED + WIRED + RE-RENDERED** (commit 8e05f0d, 2026-06-23): pipeline/audio/gen_music.py — numpy tempo track (A minor, 88 BPM, drums+bass+arp, kick-sidechain, section-aware arrangement w/ 2023 "drop"). config+Root audioSrc → audio/grand-rapids-music.wav. grand-rapids-v2.mp4 re-rendered w/ music (history −15.8dB, drop −12.9dB, granular −12.5dB). Ambient bed (gen-bed.mjs) still available. Two audio generators now: gen-bed.mjs (drone+binaural), gen_music.py (tempo).
## V3 UPGRADE (user feedback 2026-06-24) — "50% satisfied", clarity + engagement + trend honesty
User: audio now audible (playback was Chrome muting; PipeWire fine) but MUSIC too monotonic → FIXED in music skill v0.2 (below). Remaining = VISUAL CLARITY + ENGAGEMENT + TREND HONESTY. Work until satisfied.
- [x] **MUSIC SKILL created + used**: .claude/skills/music/SKILL.md (maturing skill, Maturity Log — APPEND each use). gen_music.py → v0.2 (92 BPM, lead motif+development, A/B reharm PROG_A Am-F-C-G / PROG_B Dm-C-G-Am, fills, rests, brightness automation). Regenerated wav. ALWAYS read+follow the skill when touching music; log the use.
- [x] **V3 VISUALS BUILT + STILL-VERIFIED** (2026-06-24): all tsc-clean, 4 stills confirm.
  - Task12 ✓ TimelineChart REWRITTEN → per-week Group A RATE (weeklyGroupARates in derive.ts; rate=monthly*7/daysInMonth; oscillates ~300-340/wk, NOT cumulative). Labeled "GROUP A INCIDENTS PER WEEK — trailing rate · not a running total" + live "{n}/wk now" readout + playhead + year ticks. Removed cityCumulative/grandTotalAll props.
  - Task13 ✓ NEW TrendArrows.tsx — per-beat ▲red(rising)/▼green(falling) vs prior 3-mo window (beatTrend() in derive.ts), shown on map ≥ window+0.5 mo, skips beats <6 incidents. Meaning in Legend.
  - Task14 ✓ NEW PhaseTitle.tsx (granular-only top-center strip "CHAPTER 2 · 2023–2026 · GRPD NIBRS / The map comes alive — per police beat" + caption; HistoryEra header already carries Chapter 1, edited to "CHAPTER 1 · 2000–2022"). NEW Legend.tsx (bottom-left: cat colors, "1 dot ≈ 4 incidents — density not location", arrow meaning). Counters.tsx REWRITTEN → headline = GROUP A cumulative "TOTAL SINCE 2023" (persons+property+society), Group-A cats listed, Local/ordinance shown separately + dimmed as context (fixes UCR→NIBRS discontinuity / scale-confusion).
  - Task15 ✓ NEW Quiz.tsx posed in history era (sec 92–144, right side clear of bars): "Which neighborhood is Grand Rapids' safest? = fewest reported Group A". Options = {safest, mid, busiest} alphabetized (no position tell). Reveal.tsx REWRITTEN: LEFT busiest-6, RIGHT "QUIZ ANSWER · Fewest reported Group A" big answer + safest-3 + honesty "report counts only — not adjusted for population/area". Answer = stats.ranking[last] (CENTRAL 4, 216).
  - CrimeStory wired: imports + ARROW_WINDOW=3 + quizOptions/quizStart/quizDur + <TrendArrows>/<PhaseTitle>/<Legend>/<Quiz> placed. Stills 3300(hist+quiz)/6900/7800(granular: rate line oscillates, arrows, legend, Group A counter)/9150(reveal+answer) all read clearly. MUSIC UNCHANGED this round (v0.2 stands).
  - [x] Task16 DONE: rendered grand-rapids-v2.mp4 (1920×1080 h264 + AAC 48k stereo, 330.05s, 9900f, 50.9MB; enc frame@260s matches still; audio mean −14.4dB/peak −0.0dB). COMMITTED + PUSHED (commit c1791cb, bad2bac..c1791cb). **V3 COMPLETE — awaiting user ear/eye check.**
- [ ] ~~RESUME V3 VISUALS HERE~~ (DONE above — all derivable in surface, NO new data pipeline):
  1. **Trend line normalized to RATE (task#12)** — CRITICAL honesty fix. Current TimelineChart shows CUMULATIVE (always rises → misleads). Replace with **incidents-per-week** (trailing ~4-week window) line so it shows true up/down trend. cityMonthly→ per-week = monthly/(daysInMonth/7) or monthly*7/30. Label axis "Group A incidents / week (trailing)". Keep year ticks + playhead. Maybe keep a faint cumulative as secondary, but the PRIMARY line must be rate.
  2. **Per-beat up/down arrows (task#13)** — on map, per beat: red ▲ if beat's trailing-window rate > prior window, green ▼ if lower (green=down=good). Small glyph near centroid. Legend explains "▲ rising vs last month · ▼ falling". Compute via windowCountAtMonth now vs shifted-back.
  3. **Legibility + units + legend (task#14)** — EVERY number labeled with WHAT + UNIT. History era numbers are per-MONTH avg (hundreds); granular counters are cumulative totals (tens-of-thousands) — NOT comparable → label each explicitly ("monthly avg" vs "total since 2023") and add a small "what you're seeing" caption per phase. Persistent legend (category colors + dot=density + arrow meaning). Add a phase-title strip top-center ("2000–2022 · annual averages" / "2023–2026 · live, per beat"). Fix top-number + histogram timing (numbers update smoothly, not janky). Goal: any single frame is self-explanatory to a first-time viewer.
  4. **Engagement quiz (task#15)** — during HISTORY era pose: "Which Grand Rapids neighborhood is safest? Keep watching…" with Remotion motion. At REVEAL, answer from real data = beat with LOWEST Group A (stats.ranking last). HONESTY: call it "fewest reported Group A incidents" NOT "safest per-capita" (no per-beat population data). Maybe show bottom-3 safest + top-3 busiest.
  5. **Re-render v3 (task#16)** → grand-rapids-v2.mp4 (overwrite), verify frames self-explanatory + rate line + arrows + quiz + music, commit+push.
- Components to touch: TimelineChart (→rate), new TrendArrows on map, new Legend + PhaseTitle + Caption, new Quiz/QuizReveal, Counters/HistoryEra labels, CrimeStory wiring. deriveStats already has per-beat series + ranking (safest = ranking[last]).
- Files: surface/remotion/src/components/*, CrimeStory.tsx, theme. NO pipeline changes.
- Open pre-publish FIXES still live: UCR→NIBRS discontinuity (granular headline should emphasize Group A ~53k not all 210k; hard-mark era break) — fold into task#14; verify dot motion no harsh flicker (only stills checked); publish packaging.
- v2 baseline committed 8e05f0d (dot-density+history+leaderboard+music). Renders: grand-rapids.mp4 (v1), grand-rapids-v2.mp4 (current).
v1 baseline (commit d1d7edc): 5-min single-era beat-aggregate video — DONE, on disk videos/grand-rapids-mi/out/grand-rapids.mp4.

## V3.1 UPGRADE (user feedback 2026-06-24 #2) — "60% satisfied"
User feedback after V3: (1) still doesn't understand how the histogram numbers relate (hundreds in history vs tens-of-thousands granular); (2) add resident-known neighborhood names per beat ("most don't know what CENTRAL 3 is") — INVESTIGATE + real names; (3) remove "No invented points" close boast (honesty must be obvious, not bragged); (4) proactively surface + fix a handful of issues (animation/data/annotations).
- [x] **NEIGHBORHOOD NAMES (sourced, honest)**: NEW pipeline/sources/gr-neighborhoods.mjs fetches City "Neighborhood Areas" layer (item a59c2c3795c442b3af86071c5ee2d74a, same ArcGIS org/license as beats), point-in-polygon each beat centroid → containing neighborhood. All 33 beats CONTAINED (0 fallback). → normalized/neighborhoods.json {map: beatKey→{name,approx}}. CENTRAL 3=Oldtown-Heartside, CENTRAL 4=Heritage Hill, SOUTH 2=Eastown, etc. Wired into bundle (types+load), deriveStats now computes hoods+hoodRanking (neighborhood-aggregated Group A; multi-beat hoods sum members). Leaderboard→"BUSIEST NEIGHBORHOODS" (West Grand #1, 5271). Reveal→busiest+safest by neighborhood. Quiz options=neighborhood names. Map annotation→"Oldtown-Heartside (beat CENTRAL 3)". hoodName() helper. Map dots/arrows stay per-beat (geometry).
- [x] **ERA SCALE CLARITY**: TimelineChart now PER-MONTH (was per-week) so it matches history-era monthly readouts — same unit, directly comparable. Added dashed REFERENCE LINE at 2022 UCR Violent+Property (~658/mo, labeled "narrower count"). EraTransition now has explicit numeric BRIDGE card: "UCR counted Violent+Property ~658/mo → NIBRS Group A ~1264/mo; the step up is mostly WHAT GETS COUNTED, not a crime wave." HistoryEra got y-axis gridlines+labels (reports/yr) so bars are quantified.
- [x] **REMOVED BOAST**: Credits close was "{N} sourced records / No invented points" → now neutral "Grand Rapids · 2000–2026 / {N} reported records · 33 beats · 42 months NIBRS detail". Tagline "DATA-HONEST·REPRODUCIBLE·OPEN"→"OPEN DATA · OPEN SOURCE". Added neighborhood source to credits source line.
- [x] **ISSUES SURFACED+FIXED**: (a) provenance gap—neighborhood source now in Credits + PROVENANCE.md + wiki; (b) history bars had no y-scale→added gridlines; (c) verified DotLayer no harsh flicker (memoized pool, only boundary dot fades fractionally); (d) checked Annotation(bottom:196) vs HistoryEra note(bottom:46)—no collision; (e) verified all annotation figures vs data (2023-07 GroupA=1680✓, 2026-05 persons=628✓, summer/winter property 663/503✓). Data honesty: annotation figures all re-verified.
- [x] **RENDER v3.1 DONE + COMMITTED + PUSHED** (commit b863ead, c1791cb..b863ead): grand-rapids-v2.mp4 (1920×1080 h264 + AAC stereo, 330.05s, 9900f, 52.3MB; enc transition frame verified). Stills verified: neighborhood leaderboard✓ quiz(Heritage Hill/Midtown/West Grand)✓ reveal(Heritage Hill 210 safest, West Grand busiest)✓ per-month line+658 ref✓ transition bridge✓ neutral close✓ history y-axis✓ method card✓. **V3.1 COMPLETE — awaiting user review (was 60%).**
- New files: pipeline/sources/gr-neighborhoods.mjs, normalized/neighborhoods.json. tsc clean. NOTE: music unchanged (v0.2). Repo public, commit pending after render.

## V3.2 FIX (user 2026-06-24 #3) — history-era UNIT MISMATCH (screenshot)
User caught a real bug: Ch1 histogram y-axis was ANNUAL (~13,056/yr) but the big readout under the year was MONTHLY-avg (171 violent/mo + 837 property/mo) — same frame, two time units, can't reconcile (171+837=1008 ≠ 13,056). User: "think about every single number you display... viewer can easily know what it is."
- [x] FIX = make Chapter 1 ALL ANNUAL (data is annual; the 3 history-note annotations already cite annual figures 10,942/3,869/1,299→1,951, so annual aligns everything). HistoryEra readout now cur.violent/cur.property (per YEAR) not /12; labels "Violent crimes / yr" / "Property crimes / yr"; kicker "REAL CRIMES REPORTED PER YEAR"; added sub "bars & both numbers are totals for the whole year". Now axis(13,056/yr)=bar height=readout sum(2,048+10,044) ✓.
- [x] EraTransition bridge now converts annual→monthly explicitly: "in 2022 UCR logged ~7900/year Violent+Property — roughly 658/month. From here we count per month. NIBRS Group A ... ~1264/month — mostly what gets counted, not a crime wave." (added ucrAnnual prop). Ties Ch1 annual → Ch2 per-month.
- AUDITED every on-screen number: coldopen(none), method(210,488/96.7%/33 + cat record-totals 19,575/26,017/9,278/155,618 labeled), Ch1(annual now ✓), history-notes(annual ✓ now consistent), transition(7900/yr→658/mo→1264/mo ✓), granular counter(cumulative Group A labeled), rate line(per-month + 658 ref), leaderboard(neighborhood cum), reveal(53,097 over 42mo; West Grand 5271 busiest, Heritage Hill 210 safest), credits(210,488/33/42). NOTE residual: method cat-totals are ALL records (54,870 Group A) vs reveal 53,097 mapped-to-beat (96.7%) — disclosed, acceptable.
- [ ] RE-RENDER v3.2 + commit+push pending. tsc clean, stills verified (v32_1350 history annual ✓, v32_4680 bridge ✓). Music unchanged. v3.1 was commit b863ead.

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
