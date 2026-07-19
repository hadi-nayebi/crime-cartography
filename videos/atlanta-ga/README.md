# Atlanta, GA · 1985–2026 — Crime, Mapped

A 70% fall from the 1989 peak (88,536 index crimes) to 2018 (26,995) under the FBI measure, two transition years with no comparable data (2019–2020, shown as a gap), then APD's own NIBRS record — across all 242 official neighborhoods.

**Watch:** _upload pending — link will be recorded here by the publish pipeline_

## This video was made by an AI
Claude (Anthropic) produced this video end-to-end: it located the official data
sources, wrote and ran the fetch → normalize → validate pipeline, verified every
on-screen figure against the data, designed the visuals, and rendered the result.
This directory is the complete, reproducible record of that work.

## Honesty contract
- Every number on screen traces to an official source (see [`data/atlanta-ga/PROVENANCE.md`](../../data/atlanta-ga/PROVENANCE.md)).
- Every dot is a REAL recorded offense location published by APD (block-level
  addresses). 90.8% of records map to one of 242 official neighborhoods; the
  rest are counted, disclosed, never invented.
- The long-arc chart joins FBI UCR (through 2018) with APD's own NIBRS records
  (2021+) at an explicitly labeled measure-change seam **with a declared
  2019–2020 gap** (APD's FBI submissions were incomplete during its NIBRS
  transition — those years are omitted, never shown at a false low, never
  interpolated). No hook or punchline bridges the gap; every claim stays within
  one era. The "stacked" chart style shows per-category composition; parts sum
  exactly to each year's total.
- The November 2024 one-month tripling of 'crimes against society' (411 in
  October → 1,270 in November, sustained after) is flagged on screen as a
  recording-pattern change, not presented as a street-level crime wave.
- Three neighborhoods (Bankhead, Englewood Manor, Midwest Cascade) show zero
  mapped offenses because APD records use variant names with no official
  polygon — those records are counted, disclosed, never guessed onto the map.
- Partial years/months are excluded, gaps disclosed, nothing interpolated.

## Reproduce this exact video
```bash
node pipeline/sources/atlanta-ga.mjs           # fetch + normalize + validate
node pipeline/build-trend.mjs atlanta-ga       # long-arc series (FBI + city data)
node pipeline/fetch-basemap.mjs atlanta-ga     # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs atlanta-ga
npx remotion render CrimeStory ../../videos/atlanta-ga/out/atlanta-ga.mp4 --props=../../videos/atlanta-ga/config.json
```

## Files
- `config.json` — every on-screen string, color, annotation and phase for this video
- `youtube.json` — the YouTube listing (mirrored both ways by the publish pipeline)
- `render.lock.json` — reproducibility record of the shipped render (written at render time)
- Data + provenance: [`data/atlanta-ga/`](../../data/atlanta-ga/)

Basemap: © OpenStreetMap contributors (ODbL). Music: Stable Audio Open (Stability AI).
