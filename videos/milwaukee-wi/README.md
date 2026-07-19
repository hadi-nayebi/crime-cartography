# Milwaukee, WI · 1985–2026 — Crime, Mapped

Group A crime nearly halved — down 44% from 2006 to 2025 — across all 190 neighborhoods.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see [`data/milwaukee-wi/PROVENANCE.md`](../../data/milwaukee-wi/PROVENANCE.md)).
- Every dot is a REAL reported offense location, anonymized to the block by MPD open data. 98.8% of records map to one of 190 neighborhoods; the rest are counted, disclosed, never invented.
- The city's incident archive begins February 2005, so the FBI history is extended to 2005 — a real full FBI UCR year, never interpolated — to meet the incident era at 2006.
- The long-arc chart joins FBI UCR (through 2005) with MPD NIBRS Group A
  (2006+) at an explicitly labeled measure-change seam — shapes are comparable
  within an era, never across it. Group B / context records are excluded from the trend.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/milwaukee-wi.mjs         # fetch + normalize + validate
node pipeline/build-trend.mjs milwaukee-wi     # long-arc series (FBI + city data)
node pipeline/fetch-basemap.mjs milwaukee-wi   # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs milwaukee-wi
npx remotion render CrimeStory ../../videos/milwaukee-wi/out/milwaukee-wi.mp4 --props=../../videos/milwaukee-wi/config.json
```

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render (written at render time)
- Data + provenance: [`data/milwaukee-wi/`](../../data/milwaukee-wi/)

Data © City of Milwaukee (CC BY). Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
