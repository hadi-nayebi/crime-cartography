# Buffalo, NY · 1985–2026 — Crime, Mapped

A long fall to the 2022 low (10,822 reports — less than half the 2007 peak), a 32% one-year bounce in 2023, and the easing since — across all 35 neighborhoods.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see [`data/buffalo-ny/PROVENANCE.md`](../../data/buffalo-ny/PROVENANCE.md)).
- Every dot is a REAL reported incident location, rounded to the block (~3 decimals) by BPD open data. 97.9% of records map to one of 35 neighborhoods; the rest are counted, disclosed, never invented.
- The long-arc chart joins FBI UCR (through 2005) with BPD's own incident data
  (2006+) at an explicitly labeled measure-change seam — shapes are comparable
  within an era, never across it. Long-arc annual totals are citywide from the
  source (the share of reports never mapped to a neighborhood swings by year,
  so placed-only annuals would distort the recent shape — disclosed in provenance).
- Buffalo publishes only ten major crime types (no drug/weapon/vice offenses) —
  a narrower measure than most cities, said on screen.
- The 2008 records-system gap is shown as-is — a real dip in the source, never patched.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/buffalo-ny.mjs           # fetch + normalize + validate
node pipeline/build-trend.mjs buffalo-ny       # long-arc series (FBI + citywide BPD data)
node pipeline/fetch-basemap.mjs buffalo-ny     # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs buffalo-ny
npx remotion render CrimeStory ../../videos/buffalo-ny/out/buffalo-ny.mp4 --props=../../videos/buffalo-ny/config.json
```

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render (written at render time)
- Data + provenance: [`data/buffalo-ny/`](../../data/buffalo-ny/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
