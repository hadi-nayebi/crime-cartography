# Nashville, TN · 1985–2026 — Crime, Mapped

A 40% fall from the 1996 peak to 2018 under the FBI measure — then the city's own broader incident record, across all 9 police precincts.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see [`data/nashville-tn/PROVENANCE.md`](../../data/nashville-tn/PROVENANCE.md)).
- Every dot is a REAL reported incident location, published by MNPD and rounded by the source to block scale. 98.6% of records map to one of 9 police precincts; the rest are counted, disclosed, never invented.
- MNPD publishes one row per offense and victim — rows are deduplicated to incidents (906,703 → 750,423), and 5,467 reports cleared as unfounded are excluded per FBI practice; both disclosed with counts.
- The long-arc chart joins FBI UCR (through 2018) with MNPD's own NIBRS incident
  reports (2019+) at an explicitly labeled measure-change seam — shapes are
  comparable within an era, never across it.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/nashville-tn.mjs         # fetch + normalize + validate
node pipeline/build-trend.mjs nashville-tn     # long-arc series (FBI + city data)
node pipeline/fetch-basemap.mjs nashville-tn   # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs nashville-tn
npx remotion render CrimeStory ../../videos/nashville-tn/out/nashville-tn.mp4 --props=../../videos/nashville-tn/config.json
```

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render (written at render time)
- Data + provenance: [`data/nashville-tn/`](../../data/nashville-tn/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
