# Surface design — the reusable crime-map video

The renderer of record. One Remotion composition (`CrimeStory`), parameterized by
a normalized dataset bundle (`data/<slug>/normalized/`), produces a ~5½-minute
story for any city. Grand Rapids is the first instance.

> This is the current design (a **two-era** narrative). The project began as a
> single-era 42-month GRPD sweep and grew an FBI UCR history era, dot-density
> mapping, neighborhood locators, a trend line, and a quiz/reveal. `README.md`
> is the operational source of truth; the code is authoritative.

## Inputs (all real, all sourced)
`beats.json` (polygons + centroids + category palette) · `timeline.json`
(months[] + per-beat per-category counts) · `feed.json` (real incident sample) ·
`summary.json` (totals, span, coverage %, source links) · `history.json` (FBI
UCR annual Violent/Property, 2000–2022) · `neighborhoods.json` (beat→neighborhood
name map, point-in-polygon).

## Honesty on screen (non-negotiable)
- Persistent **source credit**: "Data: GRPD via City of Grand Rapids ArcGIS Hub ·
  no individual incidents plotted".
- A one-time **method card**: two eras (UCR annual vs NIBRS monthly — different
  taxonomies), no coordinates, dots are **density within a beat, not a location**,
  96.7% of records mapped to a beat, full category split.
- The `other` (Local/Other) category is shown and labeled separately, never
  hidden or recolored as NIBRS Group A crime.
- "Safest" = *fewest reported Group A incidents* (report counts only, not
  per-capita) — stated on screen.
- Counters/figures show real totals; the coverage figure is on screen when map
  counts are referenced.

## Frame & format
1920×1080, 30fps, 330s (9900 frames). Background near-black `#07090d`, mono type;
palette in `theme.ts` (source of truth). Vertical 1080×1920 cut is a later variant.

## Visual system
- **Basemap**: static, deterministic — the beat polygons themselves are the map
  (filled dark, thin strokes). No live Leaflet tiles (non-deterministic).
- **Choropleth** (`MapLayer`): each beat's fill = its trailing-window rate, eased
  between months; hue = dominant category.
- **Density dots** (`DotLayer`): count-accurate dots scattered *within* each beat
  polygon by seeded point-in-polygon sampling — disclosed as density, never as
  real incident locations.
- **Trend arrows** (`TrendArrows`): per-beat ▲/▼ vs the prior 3-month window.
- **Counters** (`Counters`): cumulative Group A split + total; Local/Other split
  off and dimmed as context.
- **Per-month trend line** (`TimelineChart`): Group A incidents/month with a
  playhead, year ticks, and a 2022-UCR reference line — a rate, never cumulative.
- **History era** (`HistoryEra` + `EraTransition`): per-year stacked bars
  2000–2022, then a bridge card converting the UCR annual figure to a per-month
  rate so the eras are comparable.
- **Rankings** (`Leaderboard`, `Quiz`, `Reveal`): neighborhood-aggregated Group A;
  a "which neighborhood is safest?" quiz posed in the history era, answered at the
  reveal from real data.
- **Dispatch feed** (`Feed`) + **clock** (`Clock`): real incidents stream on real
  dates; big MON YYYY through the granular months.

## Narrative arc (330s, sequenced — see `theme.ts` PHASES)
1. **Cold open** — title, source credit, beats fade in.
2. **Method card** — the honesty card above; establishes trust.
3. **Chapter 1 · 2000–2022** — FBI UCR per-year stacked bars; the "safest
   neighborhood?" quiz is posed.
4. **Era transition** — "the map comes alive"; UCR annual → NIBRS monthly bridge.
5. **Chapter 2 · 2023–2026** — the granular sweep: density dots, trend arrows,
   counters, per-month trend line, live neighborhood leaderboard, sourced
   annotation beats.
6. **Reveal** — busiest neighborhoods + the quiz answer (fewest reported Group A).
7. **Credits** — recap, full source + license credit, music credit, repo URL.

## Annotations ("air messages")
Generated from the data, each carrying its own truth. A small `annotations` array
in the video config; every entry must be checkable against `timeline.json`. No
editorializing beyond what the counts support.

## Components
`Root.tsx` (register + `calculateMetadata`) · `CrimeStory.tsx` (top sequence) ·
`MapLayer` · `DotLayer` · `TrendArrows` · `HistoryEra` · `EraTransition` ·
`Counters` · `TimelineChart` · `Feed` · `Clock` · `Leaderboard` · `Quiz` ·
`Reveal` · `PhaseTitle` · `Legend` · `MapAnnotation` · `ColdOpen` · `MethodCard` ·
`Credits` · `SourceCredit`. Geo projection: fit `beats.json` bounds to the frame
(equirectangular; small extent). All animation is a pure function of `frame`.

## Config per video (`videos/<slug>/config.json`)
`{ slug, datasetDir, durationSec, fps, title, subtitle, audioSrc, emphasizeGroupA,
historyNotes:[{atYear, text}], annotations:[{atMonth, text, beat?}] }`.

## Render
`npx remotion render CrimeStory videos/grand-rapids-mi/out/grand-rapids-v2.mp4
--props=videos/grand-rapids-mi/config.json`. Gate on `node pipeline/validate.mjs
<slug>` passing first.
