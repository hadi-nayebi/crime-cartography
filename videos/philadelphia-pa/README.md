# Philadelphia, PA · 1985–2026 — Crime, Mapped

The late-'80s peak, the 1999 violent-crime high, and a modern record down by nearly a third across 21 districts.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see [`data/philadelphia-pa/PROVENANCE.md`](../../data/philadelphia-pa/PROVENANCE.md)).
- Every dot is a REAL reported incident location. Retired districts (boundary mergers in 2023/2024) are disclosed, never redistributed — apparent jumps at those seams are boundary changes, not crime waves.
- The long-arc chart joins FBI UCR with the city's own incident data at an
  explicitly labeled measure-change seam — shapes are comparable within an era,
  never across it.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/philadelphia-pa.mjs           # fetch + normalize + validate
node pipeline/build-trend.mjs philadelphia-pa       # long-arc series (FBI + city data)
node pipeline/fetch-basemap.mjs philadelphia-pa     # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs philadelphia-pa
npx remotion render CrimeStory ../../videos/philadelphia-pa/out/philadelphia-pa.mp4 --props=../../videos/philadelphia-pa/config.json
```

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render (written at render time)
- Data + provenance: [`data/philadelphia-pa/`](../../data/philadelphia-pa/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
