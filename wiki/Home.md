# Crime Cartography — wiki

A repeatable, **data-honest** pipeline that turns sourced city crime data into
engaging ~5-minute animated map videos. One reusable visual **surface**
(heat + symbols over time, counters, dispatch feed, narrative) plugs into many
datasets: cities → counties → states → all-US.

## The binding rule: strict data honesty

Every point, count, and figure shown on screen is **factually sourced** with a
reliable, citable link. We never fabricate or "approximate" positions. When a
dataset only has aggregate counts (no coordinates), we visualize it honestly —
aggregated per area, disclosed on screen — never as invented individual dots.

## How it fits together

```
data/<slug>/          raw pulls (gitignored) + normalized bundle + PROVENANCE.md
pipeline/             fetch (sources/) → normalize → validate  (Node, no manual steps)
surface/remotion/     the renderer of record (deterministic export)
surface/preview/      Leaflet HTML — live preview/scrub only
videos/<slug>/        per-video config.json + rendered out/ (gitignored)
wiki/                 these docs
```

The pipeline emits one **canonical bundle** per dataset:

- `beats.json` — area polygons + centroids + category palette
- `timeline.json` — months[] + per-area per-category counts
- `feed.json` — a sample of real offenses (date, title, block, beat, category)
- `summary.json` — totals, span, coverage %, source links

Both renderers read the same bundle.

## Categories (NIBRS)

| cat | meaning | color |
|-----|---------|-------|
| `persons` | Crimes Against Persons | `#ff2e63` |
| `property` | Crimes Against Property | `#ffc233` |
| `society` | Crimes Against Society | `#34e0e0` |
| `other` | Local / Other ordinance reports | `#7486a0` |

`other` is always shown and labeled — never recolored as violent crime.

## Pages

- **[Data-Provenance](Data-Provenance.md)** — the index of every dataset, its
  source link, license, and field mapping.
- **[Add-a-City](Add-a-City.md)** — how to source a new dataset and render a
  video for it.

## Datasets

| slug | place | status | source |
|------|-------|--------|--------|
| `grand-rapids-mi` | Grand Rapids, MI | ✅ rendered | GRPD via City of Grand Rapids ArcGIS Hub |

Roadmap: more cities → county aggregates → state → all-US, each sourced and
documented before it ships.
