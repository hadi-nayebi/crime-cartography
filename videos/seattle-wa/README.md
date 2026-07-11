# Seattle, WA · 1985–2026 — Crime, Mapped

The fall from the 1987 peak, the 2010s plateau, and the last five years in which Capitol Hill overtook Downtown.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see `../..//data/seattle-wa/PROVENANCE.md`).
- Every dot is a REAL reported offense location, anonymized to the block by SPD; redacted locations are counted, never plotted.
- The long-arc chart joins FBI UCR with the city's own incident data at an
  explicitly labeled measure-change seam — shapes are comparable within an era,
  never across it.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/seattle-wa.mjs      # fetch + normalize + validate
node pipeline/build-trend.mjs seattle-wa       # long-arc series (FBI + city data)
node pipeline/fetch-basemap.mjs seattle-wa     # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs seattle-wa
npx remotion render CrimeStory ../../videos/seattle-wa/out/seattle-wa.mp4 --props=../../videos/seattle-wa/config.json
```
`render.lock.json` records the commit, dataset fetch date, and sha256 of the
shipped render. `youtube.json` is the exact YouTube listing (title, description,
chapters) — the upload pipeline writes the final URL back here.

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render
- Data + provenance: [`data/seattle-wa/`](../../data/seattle-wa/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
