# Pipeline & data schema

Three stages, one canonical bundle. Every stage is a committed script — reproducible, no manual steps.

```
sources/<src>.mjs   →  data/<slug>/raw/        (verbatim source pull + _fetch_meta.json)
normalize.mjs <slug> →  data/<slug>/normalized/ (compact, video-ready bundle)
validate.mjs <slug>  →  honesty + integrity invariants (gates a render)
```

## Raw (`data/<slug>/raw/`, git-ignored except samples)
Whatever the source returns, untouched, plus `_fetch_meta.json`:
`{ fetchedAt, completedAt, source:{records,beats,hub}, recordCount, beatFeatureCount, dateMin, dateMax }`.

## Normalized bundle (`data/<slug>/normalized/`, committed)

**`beats.json`** — real spatial units.
```jsonc
{ "cats": { "<key>": { "label", "color" } },
  "beats": { "<KEY>": { "key","name","servcen","beat",
                        "centroid":[lng,lat],         // area-weighted polygon centroid
                        "polygon":[…GeoJSON coords…], "geomType" } } }
```

**`timeline.json`** — the animation spine.
```jsonc
{ "months": ["2023-01", …],                 // contiguous YYYY-MM
  "cells":  { "<KEY>": [ {persons,property,society,other}, … ] } }  // one obj per month, same order
```

**`feed.json`** — chronological sample of real incidents for the on-screen dispatch feed.
```jsonc
[ { "date":"YYYY-MM-DD", "title", "place"/*block address, verbatim*/, "beat":"<KEY>", "cat" } ]
```

**`summary.json`** — totals, span, **coverage %**, per-beat unplaced counts, category totals, source links. `totalRecords` counts **in-window** records only, so Σ `catTotals` == `totalRecords` and `placed + unplaced == total`; rows dropped by windowing (partial tail months, cross-dataset overlap, junk-dated) go in a separate **`excludedOutsideWindow`** map — disclosed, never mixed into `totalRecords`/`unplacedBeats`.

## Category keys
`persons` (Crimes Against Person) · `property` (Crimes Against Property) · `society` (Crimes Against Society) · `other` (Local / Local-DL / All Other — kept visible, honestly labeled). Mapping is per-source in its `sources/<src>.mjs` + recorded in `PROVENANCE.md`.

## Honesty invariants (`validate.mjs`, all must hold)
1. category totals sum == total records · 2. placed + unplaced == total · 3. Σ timeline cells == placed records · 4. every timeline beat is a real polygon · 5. cell arrays length == months · 6. months count matches summary · 7. every centroid inside its own beat polygon's bbox + plausible US range · 8. feed dates/beats/cats valid · 9. coverage ≥ 90% (else representativeness is questionable) · 10. provenance links present.

A render is only built from a dataset that **passes validate**.

## Adding a source
Write `sources/<src>.mjs` that pulls real records + the spatial units into `data/<slug>/raw/` with a `_fetch_meta.json`; extend `normalize.mjs`'s category/spatial mapping if the source's fields differ; run validate. See `wiki/Add-a-City.md`.
