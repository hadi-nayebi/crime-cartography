# Crime Cartography — wiki

A repeatable, **data-honest** pipeline that turns sourced city crime data into
engaging ~5½-minute animated map videos, published to the **Earth One** YouTube
channel (playlist: "US Cities · Crime, Mapped"). One reusable visual **surface**
(long-arc trend chart, evolving neighborhood map, counters, dispatch feed,
rankings) plugs into many datasets: cities → counties → states → all-US.

**Current status: batch 1 — 20 US cities — is fully produced** (sourced
pipeline, audited long-arc trend, verified config, render-locked 5:30 video for
every city). Three videos are uploaded so far (private, pending the channel
owner's public flip): Boston, Grand Rapids, and Washington DC.

## The binding rule: strict data honesty

Every point, count, and figure shown on screen is **factually sourced** with a
reliable, citable link. We never fabricate or "approximate" positions. When a
dataset only has aggregate counts (no coordinates), we visualize it honestly —
aggregated per area, disclosed on screen — never as invented individual dots.
Measure seams between eras are labeled and explained on screen; partial periods
are excluded; declared gaps stay gaps; areas with no mapped records are excluded
from "safest" rankings ("no data isn't no crime").

## How it fits together

```
data/<slug>/          raw pulls (gitignored) + normalized bundle + PROVENANCE.md
pipeline/             fetch (sources/) → normalize → validate → trend → basemap  (Node, no manual steps)
surface/remotion/     the renderer of record (deterministic export)
surface/preview/      Leaflet HTML — live preview/scrub only
videos/<slug>/        per-video config.json + youtube.json + render.lock.json + landing README
experiment/           batch-1 experiment design, feature matrix, confidence ledger
wiki/                 these docs
```

The pipeline emits one **canonical bundle** per dataset in
`data/<slug>/normalized/`:

- `beats.json` — official area polygons + centroids
- `neighborhoods.json` — resident-known display names for those areas
- `timeline.json` — months[] + per-area per-category counts
- `trend.json` — the full-arc annual series (eras, seam year, declared
  `seamGapYears`/`artifactYears`)
- `history.json` — the FBI UCR deep-history era (agency ORI, source URL,
  annual counts, taxonomy note)
- `points.json` — deterministic sample of **real** published incident
  locations (only where the source publishes coordinates)
- `feed.json` — a sample of real offenses (date, title, block, area, category)
- `basemap.json` — OSM roads, landmarks, water (ODbL)
- `summary.json` — totals, span, coverage %, source links

Both renderers read the same bundle.

## Categories (NIBRS crimes-against convention)

| cat | meaning |
|-----|---------|
| `persons` | Crimes Against Persons |
| `property` | Crimes Against Property |
| `society` | Crimes Against Society |
| `other` | Local / Group B / non-crime context records |

`other` is always shown and labeled — never counted as persons/property/society
crime. The exact source-field → cat mapping is documented per city in
[Data-Provenance](Data-Provenance.md) (some sources publish no society-type
offenses at all — that is disclosed, never shown as zero crime). Display colors
are set per city in each video config's `theme.catColors`.

## Pages

- **[Data-Provenance](Data-Provenance.md)** — the index of all 20 datasets:
  source links, licenses, spans, coverage, and field mappings.
- **[Add-a-City](Add-a-City.md)** — how to source a new dataset and render a
  video for it.

## Datasets (batch 1 — 20 cities)

Every city pairs a granular city-records era with FBI Crime Data Explorer (UCR)
deep history. Spans, record counts, coverage %, licenses, and every caveat live
in [Data-Provenance](Data-Provenance.md); the per-city detail files are at
`data/<slug>/PROVENANCE.md`.

| slug | place | city-records source | status |
|------|-------|---------------------|--------|
| `atlanta-ga` | Atlanta, GA | APD NIBRS (APD Open Data / ArcGIS) | ✅ rendered |
| `baltimore-md` | Baltimore, MD | BPD NIBRS Group A (Open Baltimore) | ✅ rendered |
| `boston-ma` | Boston, MA | BPD incident reports (Analyze Boston) | ✅ rendered · uploaded (private) |
| `buffalo-ny` | Buffalo, NY | BPD Crime Incidents (data.buffalony.gov) | ✅ rendered |
| `charlotte-nc` | Charlotte, NC | CMPD Incidents (City of Charlotte GIS) | ✅ rendered |
| `chicago-il` | Chicago, IL | CPD "Crimes — 2001 to Present" (Chicago Data Portal) | ✅ rendered |
| `cincinnati-oh` | Cincinnati, OH | CPD STARS Reported Crime pair (data.cincinnati-oh.gov) | ✅ rendered |
| `dallas-tx` | Dallas, TX | DPD Police Incidents (Dallas OpenData) | ✅ rendered |
| `denver-co` | Denver, CO | DPD Crime (Denver Open Data Catalog) | ✅ rendered |
| `detroit-mi` | Detroit, MI | DPD RMS Crime Incidents (Detroit Open Data) | ✅ rendered |
| `grand-rapids-mi` | Grand Rapids, MI | GRPD Crime Data (City ArcGIS Hub) | ✅ rendered · uploaded (private) |
| `kansas-city-mo` | Kansas City, MO | KCPD Crime Data, 12 yearly sets (data.kcmo.org) | ✅ rendered |
| `memphis-tn` | Memphis, TN | MPD Public Safety Incidents (Memphis Open Data Hub) | ✅ rendered |
| `milwaukee-wi` | Milwaukee, WI | MPD WIBR NIBRS (data.milwaukee.gov) | ✅ rendered |
| `minneapolis-mn` | Minneapolis, MN | MPD Crime Data (Open Data Minneapolis) | ✅ rendered |
| `nashville-tn` | Nashville, TN | MNPD Incidents (Nashville Open Data) | ✅ rendered |
| `philadelphia-pa` | Philadelphia, PA | PPD Crime Incidents (OpenDataPhilly / Carto) | ✅ rendered |
| `san-francisco-ca` | San Francisco, CA | SFPD incident reports (DataSF) | ✅ rendered |
| `seattle-wa` | Seattle, WA | SPD Crime Data (data.seattle.gov) | ✅ rendered |
| `washington-dc` | Washington, DC | MPD Crime Incidents (Open Data DC) | ✅ rendered · uploaded (private) |

Batch 1 is a **designed experiment** (`experiment/DESIGN.md`,
`experiment/matrix.json`): trend chart form, story frame, palette family, and
music family vary per city so audience results can be attributed, not guessed.
The honesty rules are invariants — never experiment variables.

Roadmap: batch 2 (cities 21–40) from batch-1's winning levels → county
aggregates → state → all-US, each sourced and documented before it ships.
