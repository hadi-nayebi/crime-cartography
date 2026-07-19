# Pipeline & data schema

Three stages, one canonical bundle. Every stage is a committed script — reproducible, no manual steps.

```
sources/<slug>.mjs   →  data/<slug>/raw/ + normalized/  (fetch → normalize → in-script
                        validation; newer cities do all three in one builder script.
                        Legacy GR split: sources/grpd.mjs + normalize.mjs)
validate.mjs <slug> [dataRoot]
                     →  generic bundle-contract check, city-agnostic
                        (honesty + integrity invariants; gates a render)
```

Each city builder carries its own source-specific validation (per-month reconciliation
against the source, dedupe identities, exclusion accounting). `validate.mjs` is the
repo-level gate on the **shared bundle contract** — it hardcodes nothing per-city: the
bbox is derived from the city's own `beats.json` geometry and category keys come from
its `summary.json`.

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

**`summary.json`** — totals, span, **coverage %**, per-beat unplaced counts, category totals, source links.
`catTotals` must sum to `totalRecords`; rows excluded from the window (junk dates, partial tail
months, cross-system dedupe drops) belong in `excludedOutsideWindow`, **not** in
`totalRecords`/`unplacedBeats`.

**`history.json`** — sourced annual era (FBI UCR/CDE counts): `{ era, source, sourceUrl,
yearMin, yearMax, cats, years:[{year, <cat>…}] }`, years contiguous.

**`neighborhoods.json`** — resident-name mapping for every beat key:
`{ source, sourceUrl, method, map:{ "<KEY>":{name, approx} } }`.

**`points.json`** — **only when the source publishes real coordinates** (aggregate-only
cities honestly omit it — e.g. grand-rapids-mi): `{ mode, note /*disclosure*/,
sampleRate, months /*== timeline.months*/, pts:[ per month: [[lng,lat,catIdx],…] ] }`.
`catIdx` indexes the `cats` key order.

`trend.json` (build-trend.mjs) and `basemap.json` (fetch-basemap.mjs) are add-ons built
and checked by their own scripts — not part of the validated core bundle.

## Category keys
`persons` (Crimes Against Person) · `property` (Crimes Against Property) · `society` (Crimes Against Society) · `other` (Local / Local-DL / All Other — kept visible, honestly labeled). Mapping is per-source in its `sources/<src>.mjs` + recorded in `PROVENANCE.md`.

## Honesty invariants (`validate.mjs`, all must hold — city-agnostic)
1. required files present + parse (`points.json` only for real-coordinate sources) and `data/<slug>/PROVENANCE.md` exists · 2. summary shape: slug/title/fetchedAt, `source.{records,beats,hub}` links, valid `dateMin ≤ dateMax` · 3. totals reconcile: Σ catTotals == totalRecords, placed + unplaced == total, Σ unplacedBeats == unplacedRecords, coveragePct recomputes from placed/total · 4. beats are real geometry: finite world-range coords, ≥ 4 vertices, centroid inside its own polygon bbox; the **city bbox is derived from this geometry** (nothing hardcoded) · 5. timeline months contiguous, count matches summary and spans dateMin→dateMax months; cells cover exactly the real beat keys, every series length == months, every cell holds all category keys as finite ints ≥ 0, Σ cells == placedRecords · 6. feed non-empty, every item a real date in span + real beat + real cat + verbatim title/place · 7. history years contiguous yearMin→yearMax with finite sourced counts + source links · 8. neighborhoods map names every beat, with source + method · 9. points (when present): months identical to timeline's, per-month triples finite and inside the derived city bbox (+0.05° pad for real edge addresses), valid cat index, disclosure note + sampleRate · 10. no non-finite number anywhere in the bundle.

Warnings (pass, but must be disclosed on screen): coverage < 90% (representativeness), missing `points.json` (fine only when the source truly publishes no coordinates).

A render is only built from a dataset that **passes validate**.

## Adding a source
Write `sources/<slug>.mjs` that pulls real records + the spatial units into `data/<slug>/raw/` with a `_fetch_meta.json`, normalizes to the bundle above with its own source-specific in-script validation, then gate with `node pipeline/validate.mjs <slug>`. See `wiki/Add-a-City.md`.
