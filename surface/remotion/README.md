# Surface — Remotion renderer of record

One parameterized composition (`CrimeStory`) turns a normalized dataset bundle
(`data/<slug>/normalized/`) into a ~5½-minute data-honest crime-map video with a
**two-era narrative**: an FBI UCR history sweep (annual, 2000–2022) that hands
off to a granular GRPD NIBRS era (per-month, per-beat, 2023–2026). Grand Rapids
is the first instance; the same surface plugs into any city that produces the
bundle.

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
  ../../videos/grand-rapids-mi/out/grand-rapids-v2.mp4 \
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
2. `src/Root.tsx`'s `calculateMetadata` fetches the bundle's six JSON files via
   `staticFile()` — `beats`, `timeline`, `feed`, `summary`, `history` (FBI UCR
   annual), `neighborhoods` (beat→neighborhood locator) — and attaches them to
   props as `bundle`; duration is `durationSec * fps`.
3. `src/CrimeStory.tsx` derives stable scales/series once (`deriveStats`) and
   renders every layer as a pure function of `frame` (deterministic export).

## Honesty contract (enforced on screen)

- **No individual incidents are plotted.** The GRPD layer carries no
  coordinates. Dots (`DotLayer`) are **density glyphs** — count-accurate dots
  scattered *within* each real beat polygon by seeded point-in-polygon sampling,
  disclosed on screen as "1 dot ≈ N incidents · density, not a location."
  Symbols/choropleth (`MapLayer`) are per-beat aggregates at real beat centroids.
- A persistent **source credit** (`SourceCredit`) names GRPD / City of Grand
  Rapids ArcGIS Hub and states "no individual incidents plotted".
- A one-time **method card** (`MethodCard`) explains both eras (UCR annual vs
  NIBRS monthly — different taxonomies), the density disclosure, the **96.7%
  coverage** figure, and the full category split.
- The **Local / Other** category is always shown and labeled separately — never
  recolored as NIBRS Group A crime.
- "**Safest**" (Quiz/Reveal) is defined on screen as *fewest reported Group A
  incidents* — report counts only, not adjusted for population or area.
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
    MapLayer.tsx      projected beat polygons + choropleth + centroid symbols
    DotLayer.tsx      seeded point-in-polygon density dots (not locations)
    TrendArrows.tsx   per-beat ▲/▼ vs prior 3-month window
    HistoryEra.tsx    Era 1 — FBI UCR per-year stacked bars (2000–2022)
    EraTransition.tsx UCR→NIBRS bridge ("the map comes alive", unit conversion)
    Counters / TimelineChart / Feed / Clock        live HUD (granular era)
    Leaderboard / Quiz / Reveal   neighborhood rankings + "safest" payoff
    PhaseTitle / Legend / MapAnnotation   on-screen guidance
    ColdOpen / MethodCard / Credits   narrative cards
    SourceCredit.tsx  persistent honesty strip
  CrimeStory.tsx      phase sequencing (cold open → method → UCR history →
                      transition → granular sweep → reveal → credits)
  Root.tsx            Composition + calculateMetadata (loads 6-file bundle)
scripts/sync-data.mjs copy dataset bundle into public/
```

---

Built with [Remotion](https://www.remotion.dev). Note Remotion's own license terms
for some entities: https://github.com/remotion-dev/remotion/blob/main/LICENSE.md
