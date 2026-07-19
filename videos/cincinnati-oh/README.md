# Cincinnati, OH · 1999–2026 — Crime, Mapped

A 45% fall from the 2002 peak to 2019 under the FBI measure, then the city's own incident record — roughly level since 2020 — across all 50 neighborhoods.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see [`data/cincinnati-oh/PROVENANCE.md`](../../data/cincinnati-oh/PROVENANCE.md)).
- Every dot is a REAL reported incident location — block-masked addresses published by CPD. 94.9% of incidents map to one of 50 neighborhoods; the rest are counted, disclosed, never invented.
- The long-arc chart joins FBI UCR (1999–2019; earlier FBI years are broken or
  non-contiguous in the archive and are omitted, never interpolated) with CPD's
  own STARS incident data (2020+) at an explicitly labeled measure-change seam —
  shapes are comparable within an era, never across it. Long-arc annual totals
  are citywide from the source pair, deduplicated by incident number (the share
  of incidents never mapped to a neighborhood collapses at the June 2024 RMS
  cutover, so placed-only annuals would tilt the recent shape — disclosed in provenance).
- CPD's Part 1 / Part 2 taxonomy is kept as published — robbery stays in Part 1
  Violent; "Part 2 · All Other Offenses" is the source's own bucket, never
  presented as NIBRS.
- The datasets carry no explicit license — used with attribution to the City of
  Cincinnati / CPD (flagged prominently in provenance).
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/cincinnati-oh.mjs        # fetch + normalize + validate
node pipeline/build-trend.mjs cincinnati-oh    # long-arc series (FBI + citywide CPD data)
node pipeline/fetch-basemap.mjs cincinnati-oh  # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs cincinnati-oh
npx remotion render CrimeStory ../../videos/cincinnati-oh/out/cincinnati-oh.mp4 --props=../../videos/cincinnati-oh/config.json
```

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render (written at render time)
- Data + provenance: [`data/cincinnati-oh/`](../../data/cincinnati-oh/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
