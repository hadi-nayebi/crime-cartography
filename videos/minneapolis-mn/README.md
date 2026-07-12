# Minneapolis, MN · 1991–2026 — Crime, Mapped

A 52% fall from the 1991 peak, then five turbulent flat years since 2019 — across all 87 neighborhoods.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see [`data/minneapolis-mn/PROVENANCE.md`](../../data/minneapolis-mn/PROVENANCE.md)).
- Every dot is a REAL reported offense location. MPD did not report 1990 to the FBI (chart starts 1991); Shots-Fired call data exists only from July 2020 and is never counted as crime.
- The long-arc chart joins FBI UCR with the city's own incident data at an
  explicitly labeled measure-change seam — shapes are comparable within an era,
  never across it.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/minneapolis-mn.mjs           # fetch + normalize + validate
node pipeline/build-trend.mjs minneapolis-mn       # long-arc series (FBI + city data)
node pipeline/fetch-basemap.mjs minneapolis-mn     # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs minneapolis-mn
npx remotion render CrimeStory ../../videos/minneapolis-mn/out/minneapolis-mn.mp4 --props=../../videos/minneapolis-mn/config.json
```

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render (written at render time)
- Data + provenance: [`data/minneapolis-mn/`](../../data/minneapolis-mn/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
