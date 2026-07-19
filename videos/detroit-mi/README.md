# Detroit, MI · 1985–2026 — Crime, Mapped

A 69% fall from the 1985 peak to 2016 under the FBI measure, then the city's own incident record — across all 205 neighborhoods.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see [`data/detroit-mi/PROVENANCE.md`](../../data/detroit-mi/PROVENANCE.md)).
- Every dot is a REAL reported incident location, anonymized to the block by DPD open data. 99.1% of records map to one of 205 neighborhoods; the rest are counted, disclosed, never invented.
- The long-arc chart joins FBI UCR (through 2016) with DPD's own incident data
  (2017+) at an explicitly labeled measure-change seam — shapes are comparable
  within an era, never across it.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/detroit-mi.mjs           # fetch + normalize + validate
node pipeline/build-trend.mjs detroit-mi       # long-arc series (FBI + city data)
node pipeline/fetch-basemap.mjs detroit-mi     # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs detroit-mi
npx remotion render CrimeStory ../../videos/detroit-mi/out/detroit-mi.mp4 --props=../../videos/detroit-mi/config.json
```

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render (written at render time)
- Data + provenance: [`data/detroit-mi/`](../../data/detroit-mi/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
