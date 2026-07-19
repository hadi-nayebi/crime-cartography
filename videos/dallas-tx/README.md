# Dallas, TX · 1985–2026 — Crime, Mapped

A 68% fall from the 1988 peak to 2014 under the FBI measure — then the city's own incident record, falling again since 2022, across all 8 police divisions.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see [`data/dallas-tx/PROVENANCE.md`](../../data/dallas-tx/PROVENANCE.md)).
- Every dot is a REAL incident location, geocoded and published by DPD open data. 99.9% of records map to one of 8 police divisions; the rest are counted, disclosed, never invented.
- DPD filters its public dataset before release: sexually oriented offenses and juvenile-involved cases never appear, so every total undercounts actual reported crime — disclosed on screen, in the listing, and in provenance.
- Victim-level rows are deduplicated to incidents (1,437,644 → 1,200,698), verified per-month against the source's own distinct-incident counts.
- The long-arc chart joins FBI UCR (through 2014) with DPD's own incident records
  (2015+) at an explicitly labeled measure-change seam — shapes are comparable
  within an era, never across it.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.
- License: DPD data is ODC-BY 1.0 — attribution "Dallas Police Department" carried on screen, here, and in the listing.

## Reproduce this exact video
```bash
node pipeline/sources/dallas-tx.mjs            # fetch + normalize + validate
node pipeline/build-trend.mjs dallas-tx        # long-arc series (FBI + city data)
node pipeline/fetch-basemap.mjs dallas-tx      # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs dallas-tx
npx remotion render CrimeStory ../../videos/dallas-tx/out/dallas-tx.mp4 --props=../../videos/dallas-tx/config.json
```

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render (written at render time)
- Data + provenance: [`data/dallas-tx/`](../../data/dallas-tx/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI). Data © Dallas Police Department (ODC-BY 1.0).
