# Grand Rapids, MI · 1985–2026 — Crime, Mapped

How reported crime fell by half since 1985, and where it happens today — beat by beat.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see `../..//data/grand-rapids-mi/PROVENANCE.md`).
- The GRPD source publishes no incident coordinates, so dots are DENSITY GLYPHS spread inside real police beats (disclosed on screen) — how many, never where.
- The long-arc chart joins FBI UCR with the city's own incident data at an
  explicitly labeled measure-change seam — shapes are comparable within an era,
  never across it.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/grpd.mjs grand-rapids-mi      # fetch raw GRPD records + beat polygons
node pipeline/sources/fbi-ucr.mjs                   # FBI UCR history
node pipeline/normalize.mjs grand-rapids-mi         # normalized bundle
node pipeline/normalize-history.mjs grand-rapids-mi # history.json
node pipeline/sources/gr-neighborhoods.mjs          # resident-known names
node pipeline/validate.mjs grand-rapids-mi          # 10 invariants must PASS
node pipeline/build-trend.mjs grand-rapids-mi       # long-arc series (FBI + NIBRS)
node pipeline/fetch-basemap.mjs grand-rapids-mi     # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs grand-rapids-mi
npx remotion render CrimeStory ../../videos/grand-rapids-mi/out/grand-rapids-mi.mp4 --props=../../videos/grand-rapids-mi/config.json
```
`render.lock.json` records the commit, dataset fetch date, and sha256 of the
shipped render. `youtube.json` is the exact YouTube listing (title, description,
chapters) — the upload pipeline writes the final URL back here.

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render
- Data + provenance: [`data/grand-rapids-mi/`](../../data/grand-rapids-mi/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
