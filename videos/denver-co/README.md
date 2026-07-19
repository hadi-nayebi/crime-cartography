# Denver, CO · 1985–2026 — Crime, Mapped

The long FBI-era swings, then a real recent decline — down 20% from the 2022 peak, across all 78 neighborhoods.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see [`data/denver-co/PROVENANCE.md`](../../data/denver-co/PROVENANCE.md)).
- Every dot is a REAL reported incident location, anonymized to the block by DPD open data. 99.9% of records map to one of 78 neighborhoods; the rest are counted, disclosed, never invented.
- Denver's open data publishes a rolling five-year window plus year-to-date and omits sex offenses — disclosed on screen and in provenance.
- The long-arc chart joins FBI UCR (through 2020) with DPD's own incident data
  (2021+) at an explicitly labeled measure-change seam — shapes are comparable
  within an era, never across it.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/denver-co.mjs            # fetch + normalize + validate
node pipeline/build-trend.mjs denver-co        # long-arc series (FBI + city data)
node pipeline/fetch-basemap.mjs denver-co      # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs denver-co
npx remotion render CrimeStory ../../videos/denver-co/out/denver-co.mp4 --props=../../videos/denver-co/config.json
```

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render (written at render time)
- Data + provenance: [`data/denver-co/`](../../data/denver-co/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
