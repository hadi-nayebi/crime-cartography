# Memphis, TN · 1985–2026 — Crime, Mapped

A property-crime wave that rose 32% to its 2023 crest (106,788 reports) and broke — down 32% by 2025 — under MPD's own measure, mapped across all 9 police precincts, with the FBI's arc back to 1985.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see [`data/memphis-tn/PROVENANCE.md`](../../data/memphis-tn/PROVENANCE.md)).
- Every dot is a REAL reported incident location, published by MPD at block-level
  (~3-decimal) precision. 98.8% of records map to one of 9 police precincts; the
  rest are counted, disclosed, never invented.
- The long-arc chart joins FBI UCR (through 2019) with MPD's own NIBRS Group A
  records (2020+) at an explicitly labeled measure-change seam — shapes are
  comparable within an era, never across it. The "stacked" chart style shows the
  per-category composition; parts sum exactly to each year's total.
- MPD's source omits sex crimes and juvenile-specific types (an MPD publishing
  decision) — disclosed on screen.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/memphis-tn.mjs           # fetch + normalize + validate
node pipeline/build-trend.mjs memphis-tn       # long-arc series (FBI + city data)
node pipeline/fetch-basemap.mjs memphis-tn     # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs memphis-tn
npx remotion render CrimeStory ../../videos/memphis-tn/out/memphis-tn.mp4 --props=../../videos/memphis-tn/config.json
```

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render (written at render time)
- Data + provenance: [`data/memphis-tn/`](../../data/memphis-tn/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
