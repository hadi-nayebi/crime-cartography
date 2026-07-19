# Kansas City, MO · 1985–2026 — Crime, Mapped

A 51% fall from the 1991 peak to 2014 under the FBI measure, then KCPD's own report-level record — across 240 neighborhoods.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see [`data/kansas-city-mo/PROVENANCE.md`](../../data/kansas-city-mo/PROVENANCE.md)).
- Every dot is a REAL reported incident location at block level, as geocoded by
  KCPD. 86.8% of reports map to one of 240 named neighborhoods; the rest
  (mostly missing coordinates in the source) are counted, disclosed, never invented.
- KCPD publishes one row per involvement — every count here is deduplicated to
  one per report, within and across the 12 yearly datasets.
- The long-arc chart joins FBI UCR (through 2014) with KCPD's own report data
  (2015+) at an explicitly labeled measure-change seam — shapes are comparable
  within an era, never across it. Long-arc annual totals are citywide from the
  source: KCPD's published coordinates fail unevenly by year (2017 bad geocodes,
  2019–2021 missing coordinates), so placed-only annuals would draw false
  craters — measured and disclosed in provenance.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/kansas-city-mo.mjs       # fetch + normalize + validate
node pipeline/build-trend.mjs kansas-city-mo   # long-arc series (FBI + citywide KCPD data)
node pipeline/fetch-basemap.mjs kansas-city-mo # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs kansas-city-mo
npx remotion render CrimeStory ../../videos/kansas-city-mo/out/kansas-city-mo.mp4 --props=../../videos/kansas-city-mo/config.json
```

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render (written at render time)
- Data + provenance: [`data/kansas-city-mo/`](../../data/kansas-city-mo/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
