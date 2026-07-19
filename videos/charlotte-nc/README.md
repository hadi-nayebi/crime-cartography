# Charlotte, NC · 1985–2026 — Crime, Mapped

The FBI-era climb to the 2007 peak and the fall after it — then eight years of CMPD's own count that end almost exactly where they began (75,042 → 75,179, +0.2%), while the map underneath keeps moving, across 14 police divisions.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see [`data/charlotte-nc/PROVENANCE.md`](../../data/charlotte-nc/PROVENANCE.md)).
- Every dot is a REAL reported incident location, anonymized to the block by CMPD open data. 99.9% of records map to one of 14 police divisions; the rest are counted, disclosed, never invented.
- CMPD's public dataset excludes non-criminal 800-series report types (128,848 records) and reports cleared as unfounded (21,392) — disclosed on screen and in provenance, with counts.
- The long-arc chart joins FBI UCR (through 2016) with CMPD's own NIBRS incident
  reports (2017+) at an explicitly labeled measure-change seam — shapes are
  comparable within an era, never across it.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/charlotte-nc.mjs         # fetch + normalize + validate
node pipeline/build-trend.mjs charlotte-nc     # long-arc series (FBI + city data)
node pipeline/fetch-basemap.mjs charlotte-nc   # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs charlotte-nc
npx remotion render CrimeStory ../../videos/charlotte-nc/out/charlotte-nc.mp4 --props=../../videos/charlotte-nc/config.json
```

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render (written at render time)
- Data + provenance: [`data/charlotte-nc/`](../../data/charlotte-nc/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
