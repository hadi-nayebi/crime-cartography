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

## Status / next actions
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
- [ ] **RESUME HERE → build the Remotion surface** per surface/remotion/DESIGN.md:
      1. Load `remotion-best-practices` skill FIRST.
      2. `npm init` a Remotion project in surface/remotion/ (Root.tsx, components in DESIGN §Components).
      3. Read normalized bundle from data/grand-rapids-mi/normalized/ (import or staticFile).
      4. Build MapLayer (projected beat polygons + choropleth + proportional symbols), Counters, TimelineChart, Feed, Clock, Annotation, Credits. Deterministic on `frame`.
      5. videos/grand-rapids-mi/config.json (title, annotations checkable vs timeline.json).
      6. Render ~5-min mp4 → videos/grand-rapids-mi/out/ (gitignored). Gate on validate passing.
      7. Keep on-screen honesty: source credit + method card + 'other' labeled + coverage shown.
- [ ] Update surface/preview/ HTML to read the real normalized data (preview parity) — optional/after.
- [ ] wiki: Home, Data-Provenance index, Add-a-City guide; dataset catalog (cities→counties→states→US)
- [ ] Publish video + finalize README status

## Self-compact command (this pane)
bash .claude/skills/self-compact/self-compact.sh "<DIRECTIVE>" "<FOLLOWUP>"
(auto-targets $TMUX_PANE=%3. Shapes required — see SKILL.md. Verify with --dry-run / --check-shape.)
