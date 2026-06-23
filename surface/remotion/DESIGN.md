# Surface design — the reusable crime-map video

The renderer of record. One Remotion composition, parameterized by a normalized dataset bundle (`data/<slug>/normalized/`), produces a ~5-minute story for any city. Grand Rapids is the first instance.

## Inputs (all real, all sourced)
`beats.json` (polygons + centroids + category palette) · `timeline.json` (months[] + per-beat per-category counts) · `feed.json` (real incident sample) · `summary.json` (totals, span, coverage %, source links).

## Honesty on screen (non-negotiable)
- Persistent **source credit**: "Data: GRPD via City of Grand Rapids ArcGIS Hub · aggregated per police beat".
- A one-time **method card**: "No individual incidents are plotted. Public data carries no coordinates; each symbol is a per-beat aggregate at the beat's centroid. 96.7% of records mapped to a beat."
- The `other` (Local/Other) category is shown and labeled, never hidden or recolored as violent crime.
- Counters show real totals; the coverage figure is on screen when map counts are referenced.

## Frame & format
1920×1080, 30fps, ~5 min (≈9000 frames). Background near-black `#07090d`, mono type, the `gr_crime_timeline.html` palette. Vertical 1080×1920 cut is a later variant.

## Visual system
- **Basemap**: static, deterministic. Render the beat polygons themselves as the map (filled dark, thin `#7d91af33` strokes) over a subtle GR street reference — NOT live Leaflet tiles (non-deterministic). Optionally a baked static CARTO dark tile image as a backdrop layer; polygons are the focus.
- **Choropleth**: each beat polygon's fill intensity = its trailing-window incident rate, eased between months. Color = dominant category hue, lightness = volume.
- **Proportional symbols**: a glowing disc at each beat centroid, radius ∝ √(window count), color = dominant category. Pulses when a month ticks. This is the "heat".
- **Counters** (top-right): cumulative persons/property/society/other + total, counting up in real time.
- **Growing timeline chart** (bottom): cumulative total area + per-category lines, with a moving playhead and year ticks — same language as the HTML shell.
- **Dispatch feed** (left): real incidents stream in on their real dates — title + block address + beat, color-dotted by category.
- **Clock** (top-left): big MON YYYY, animating through the 42 months.

## Narrative arc (~5 min, sequenced)
1. **0:00–0:20 Cold open** — title "Grand Rapids · Three Years of Crime, by the Numbers", source credit, the city's beats fade in.
2. **0:20–0:45 Method card** — the honesty card above; establishes trust.
3. **0:45–3:30 The sweep** — play Jan 2023 → Jun 2026. Heat blooms and recedes per beat/season; counters climb; chart grows; feed streams. Periodic **annotation beats** ("air messages"): seasonal summer rise, the highest-volume beat (C3 / Central 3 — downtown), category shifts. Each annotation is a sourced, true statement pulled from the data.
4. **3:30–4:30 Reveal** — freeze on the full period: rank beats, show the persons/property/society/other split, the busiest beat, total incidents.
5. **4:30–5:00 Close** — recap card, full source + license credit, repo URL, "data-honest" sign-off.

## Annotations ("air messages")
Generated from the data, each carrying its own truth (e.g. "Summer 2024: property crime peaks", "Central 3 (downtown) — busiest beat, N incidents"). A small `annotations` array in the video config; every entry must be checkable against `timeline.json`. No editorializing beyond what the counts support.

## Components (planned)
`Root.tsx` (register) · `CrimeStory.tsx` (top sequence/timing) · `MapLayer.tsx` (projected beat polygons + choropleth + symbols) · `Counters.tsx` · `TimelineChart.tsx` · `Feed.tsx` · `Clock.tsx` · `Annotation.tsx` · `Credits.tsx`. Geo projection: fit `beats.json` bounds to the frame (simple equirectangular scale — small extent, distortion negligible). All animation is a pure function of `frame` (deterministic).

## Config per video (`videos/<slug>/config.json`)
`{ slug, datasetDir, durationSec, fps, title, subtitle, annotations:[{atMonth, text}], emphasizeGroupA:true }`.

## Render
`npx remotion render CrimeStory videos/grand-rapids-mi/out/grand-rapids.mp4 --props=videos/grand-rapids-mi/config.json`. Gate on `node pipeline/validate.mjs <slug>` passing first.
