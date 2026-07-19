# Baltimore, MD · 1985–2026 — Crime, Mapped

A 71% fall from the 1995 peak to 2020 under the FBI measure, then the city's own NIBRS record — across all 278 neighborhoods.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see [`data/baltimore-md/PROVENANCE.md`](../../data/baltimore-md/PROVENANCE.md)).
- Every dot is a REAL reported incident location as published by BPD open data. 99.9% of incidents map to one of 278 neighborhoods; the rest are counted, disclosed, never invented.
- BPD publishes one row per victim; every count shown is incidents, deduplicated
  by complaint number (259,819 victim rows → 224,602 incidents) — disclosed on
  screen and in provenance.
- The long-arc chart joins FBI UCR (through 2020) with BPD's own NIBRS data
  (2022+) at an explicitly labeled measure-change seam — shapes are comparable
  within an era, never across it.
- Two years are omitted and disclosed, never interpolated: **1999** (a broken
  FBI reporting year — 503 reported vs ~70,000 either side) and **2021** (BPD's
  NIBRS transition left no full-year total). Gaps are shown as gaps.
- Partial years/months are excluded, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/baltimore-md.mjs         # fetch + normalize + validate
node pipeline/build-trend.mjs baltimore-md     # long-arc series (FBI + city data)
node pipeline/fetch-basemap.mjs baltimore-md   # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs baltimore-md
npx remotion render CrimeStory ../../videos/baltimore-md/out/baltimore-md.mp4 --props=../../videos/baltimore-md/config.json
```

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render (written at render time)
- Data + provenance: [`data/baltimore-md/`](../../data/baltimore-md/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
