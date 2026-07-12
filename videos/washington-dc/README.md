# Washington, DC · 1985–2026 — Crime, Mapped

From the violent early-'90s peak (1993: 68,146 crimes) to a transformed city — mapped across 46 neighborhood clusters.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see [`data/washington-dc/PROVENANCE.md`](../../data/washington-dc/PROVENANCE.md)).
- Every dot is a REAL reported incident location, anonymized to the block by MPD. DC publishes only major (Part I-style) offenses — drug/vice categories are not published, not zero.
- The long-arc chart joins FBI UCR with the city's own incident data at an
  explicitly labeled measure-change seam — shapes are comparable within an era,
  never across it.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/washington-dc.mjs           # fetch + normalize + validate
node pipeline/build-trend.mjs washington-dc       # long-arc series (FBI + city data)
node pipeline/fetch-basemap.mjs washington-dc     # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs washington-dc
npx remotion render CrimeStory ../../videos/washington-dc/out/washington-dc.mp4 --props=../../videos/washington-dc/config.json
```

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render (written at render time)
- Data + provenance: [`data/washington-dc/`](../../data/washington-dc/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
