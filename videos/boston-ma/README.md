# Boston, MA · 1985–2026 — Crime, Mapped

A 71% fall from the 1989 peak, continuing in the modern record — mapped by the district names residents actually use.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see [`data/boston-ma/PROVENANCE.md`](../../data/boston-ma/PROVENANCE.md)).
- Every dot is a REAL reported incident location. BPD's public file excludes sexual-assault records for privacy — a gap, not zero — and mixes service records with crime; the trend counts crime only.
- The long-arc chart joins FBI UCR with the city's own incident data at an
  explicitly labeled measure-change seam — shapes are comparable within an era,
  never across it.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/boston-ma.mjs           # fetch + normalize + validate
node pipeline/build-trend.mjs boston-ma       # long-arc series (FBI + city data)
node pipeline/fetch-basemap.mjs boston-ma     # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs boston-ma
npx remotion render CrimeStory ../../videos/boston-ma/out/boston-ma.mp4 --props=../../videos/boston-ma/config.json
```

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render (written at render time)
- Data + provenance: [`data/boston-ma/`](../../data/boston-ma/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
