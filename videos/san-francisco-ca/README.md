# San Francisco, CA · 1985–2026 — Crime, Mapped

The 1992 peak, the long fall, and five recent years in which nearly every neighborhood declined.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see [`data/san-francisco-ca/PROVENANCE.md`](../../data/san-francisco-ca/PROVENANCE.md)).
- Every dot is a REAL reported incident location (block/intersection level). 2003–2017 incidents are assigned to neighborhoods by their real coordinates against the official polygons.
- The long-arc chart joins FBI UCR with the city's own incident data at an
  explicitly labeled measure-change seam — shapes are comparable within an era,
  never across it.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/san-francisco-ca.mjs           # fetch + normalize + validate
node pipeline/build-trend.mjs san-francisco-ca       # long-arc series (FBI + city data)
node pipeline/fetch-basemap.mjs san-francisco-ca     # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs san-francisco-ca
npx remotion render CrimeStory ../../videos/san-francisco-ca/out/san-francisco-ca.mp4 --props=../../videos/san-francisco-ca/config.json
```

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render (written at render time)
- Data + provenance: [`data/san-francisco-ca/`](../../data/san-francisco-ca/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
