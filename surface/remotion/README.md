# Surface — Remotion renderer of record

One parameterized composition (`CrimeStory`) turns a normalized dataset bundle
(`data/<slug>/normalized/`) into a ~5-minute data-honest crime-map video. Grand
Rapids is the first instance; the same surface plugs into any city that produces
the bundle.

## Quick start

```bash
cd surface/remotion
npm install
node scripts/sync-data.mjs grand-rapids-mi   # copy bundle into public/ (gitignored)
npm run dev                                   # Remotion Studio preview
```

## Render

```bash
# from surface/remotion/
node scripts/sync-data.mjs grand-rapids-mi
npx remotion render CrimeStory \
  ../../videos/grand-rapids-mi/out/grand-rapids.mp4 \
  --props=../../videos/grand-rapids-mi/config.json
```

Gate the render on the pipeline validator first (run from repo root):

```bash
node pipeline/validate.mjs grand-rapids-mi
```

## How data flows in

1. `scripts/sync-data.mjs <slug>` copies `data/<slug>/normalized/*` →
   `public/data/<slug>/normalized/`. The repo's `data/` stays the source of
   truth; `public/data/` is gitignored and reproducible.
2. `src/Root.tsx`'s `calculateMetadata` fetches the four JSON files via
   `staticFile()` and attaches them to props as `bundle`; duration is
   `durationSec * fps`.
3. `src/CrimeStory.tsx` derives stable scales/series once (`deriveStats`) and
   renders every layer as a pure function of `frame` (deterministic export).

## Honesty contract (enforced on screen)

- **No individual incidents are plotted.** The GRPD layer carries no
  coordinates, so each symbol is a *per-beat aggregate* at the beat centroid
  (`MapLayer`), sized ∝ √(trailing-window count).
- A persistent **source credit** (`SourceCredit`) names GRPD / City of Grand
  Rapids ArcGIS Hub and states "aggregated per police beat · no individual
  incidents plotted".
- A one-time **method card** (`MethodCard`) explains the aggregation and shows
  the **96.7% coverage** figure and the full category split.
- The **Local / Other** category is always shown and labeled — never recolored
  as violent crime.
- Every **annotation** in `videos/<slug>/config.json` is checkable against
  `timeline.json` (see the values in `data/<slug>/PROVENANCE.md`).

## Adding another city

Produce `data/<slug>/normalized/` via the pipeline, then copy
`videos/grand-rapids-mi/config.json` to `videos/<slug>/config.json`, adjust
`slug` / `datasetDir` / `title` / `annotations`, sync, and render. No surface
code changes needed.

## Layout

```
src/
  theme.ts            palette, category colors/labels, phase boundaries
  data/
    types.ts          bundle + config interfaces (mirror pipeline output)
    load.ts           staticFile fetch, projection fit, aggregation helpers
    derive.ts         deriveStats (stable scales, city series, ranking)
  components/
    MapLayer.tsx      projected beat polygons + choropleth + symbols
    Clock / Counters / Feed / TimelineChart        live HUD (sweep)
    ColdOpen / MethodCard / Annotation / Reveal / Credits   narrative cards
    SourceCredit.tsx  persistent honesty strip
  CrimeStory.tsx      phase sequencing (cold open → method → sweep → reveal → close)
  Root.tsx            Composition + calculateMetadata (loads bundle)
scripts/sync-data.mjs copy dataset bundle into public/
```

---

Built with [Remotion](https://www.remotion.dev). Note Remotion's own license terms
for some entities: https://github.com/remotion-dev/remotion/blob/main/LICENSE.md
