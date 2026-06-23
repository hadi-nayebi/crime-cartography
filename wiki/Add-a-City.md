# Add a City

The surface is dataset-agnostic. To ship a new place, produce the normalized
bundle from a **sourced** dataset, then point a config at it. No surface code
changes are required.

## 1. Find a reliable source

Prefer, in order: a city/agency open-data incident layer (ArcGIS Hub, Socrata),
then FBI CDE or state UCR/NIBRS counts. Record the exact layer/endpoint URL —
you will cite it on screen and in provenance.

- Incident-level **with coordinates** → real dot map is possible.
- **Counts only / no coordinates** → aggregate honestly to an area
  (beat/precinct/tract/county) and show it as such. **Never invent dot
  positions.**

## 2. Write a fetch adapter

Add `pipeline/sources/<source>.mjs` that pulls raw records + the matching area
polygons into `data/<slug>/raw/` (gitignored) and writes a `_fetch_meta.json`
sidecar (endpoint, fetch date, record count). Scripts, not manual downloads.

## 3. Normalize + validate

`pipeline/normalize.mjs` maps source fields to the canonical schema and emits the
bundle into `data/<slug>/normalized/`:

```
beats.json  timeline.json  feed.json  summary.json
```

Then gate on the validator — it enforces the honesty invariants (totals
reconcile, every area key is real, coverage is disclosed, etc.):

```bash
node pipeline/validate.mjs <slug>
```

## 4. Record provenance

Create `data/<slug>/PROVENANCE.md` (source URLs, fetch date, license, field
mapping, coverage, honesty notes) and add a row to
[`wiki/Data-Provenance.md`](Data-Provenance.md).

## 5. Configure + render the video

```bash
cp videos/grand-rapids-mi/config.json videos/<slug>/config.json
# edit: slug, datasetDir ("data/<slug>"), title, subtitle, annotations
```

Every `annotation.atMonth` must exist in `timeline.json`, and every annotation
sentence must be **checkable against the counts**. Then:

```bash
cd surface/remotion
node scripts/sync-data.mjs <slug>
npx remotion render CrimeStory \
  ../../videos/<slug>/out/<slug>.mp4 \
  --props=../../videos/<slug>/config.json
```

## 6. Sanity-check on screen

Before publishing, confirm the on-screen honesty holds: persistent source
credit, the method card, the coverage figure, and the labeled Local/Other
category. If a claim isn't supported by the data, cut it.

## Canonical schema reference

```jsonc
// one timeline cell entry, per area per month
{ "persons": 0, "property": 0, "society": 0, "other": 0 }

// one feed item (a real, sampled offense)
{ "date": "YYYY-MM-DD", "title": "...", "place": "block address",
  "beat": "AREA KEY", "cat": "persons|property|society|other" }
```

See [`pipeline/schema.md`](../pipeline/schema.md) for the full contract and the
honesty invariants the validator enforces.
