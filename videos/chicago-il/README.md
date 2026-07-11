# Chicago, IL · 1986–2026 — Crime, Mapped

Forty years, one arc: reported crime halved since 2001, and every one of the 77 community areas fell.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see `../..//data/chicago-il/PROVENANCE.md`).
- Every dot is a REAL reported incident location, anonymized to the block by the City of Chicago.
- The long-arc chart joins FBI UCR with the city's own incident data at an
  explicitly labeled measure-change seam — shapes are comparable within an era,
  never across it.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/chicago-il.mjs      # fetch + normalize + validate
node pipeline/build-trend.mjs chicago-il       # long-arc series (FBI + city data)
node pipeline/fetch-basemap.mjs chicago-il     # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs chicago-il
npx remotion render CrimeStory ../../videos/chicago-il/out/chicago-il.mp4 --props=../../videos/chicago-il/config.json
```
`render.lock.json` records the commit, dataset fetch date, and sha256 of the
shipped render. `youtube.json` is the exact YouTube listing (title, description,
chapters) — the upload pipeline writes the final URL back here.

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render
- Data + provenance: [`data/chicago-il/`](../../data/chicago-il/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
