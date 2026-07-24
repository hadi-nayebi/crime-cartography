# Crime Cartography

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
&nbsp;[![Data: honest](https://img.shields.io/badge/data-sourced%20%C2%B7%20never%20fabricated-2ea44f.svg)](#principles)
&nbsp;[![Production: human-directed agents](https://img.shields.io/badge/production-human--directed%20agents-62dff4.svg)](#human-directed-agentic-production)
&nbsp;[![Renderer: Remotion](https://img.shields.io/badge/render-Remotion-7c5cff.svg)](https://www.remotion.dev/)

**A data-honest video production pipeline that turns *sourced* city crime data into animated map stories—and keeps the public production record behind the dedicated Crime Cartography channel.**

One reusable engine — a full-arc trend chart (always to the present), an evolving neighborhood map with real OSM landmarks and highways, live counters, a dispatch feed of real offenses, and per-neighborhood rankings — plugs into per-city data pipelines and per-city visual styles. Built in [Remotion](https://www.remotion.dev/) for deterministic, frame-exact export.

## Status: 20 inherited drafts entering editorial remake

The inherited production run reached rendered, render-locked drafts for all 20 cities. Each city below has its own sourced data pipeline (`pipeline/sources/<slug>.mjs`), long-arc trend, OSM basemap, config, score, and 5:30 render record (`videos/<slug>/render.lock.json`). Three inherited cuts were previously published on Earth One and were permanently removed on 2026-07-23. They remain part of the production history, not destination releases.

The current phase is an editorial remake for a dedicated Crime Cartography channel. Human reviewers will test claims, chart context, maps, narration, pacing, and visual taste before any new release is approved. The project design and current public-safe production snapshot live on the [Crime Cartography project page](https://hadi-nayebi.github.io/projects/crime-cartography.html).

| City | Video | The hook (verbatim from the video) | Watch |
|------|-------|------------------------------------|-------|
| [Atlanta, GA](videos/atlanta-ga/) | *The Interrupted Fall* | **−70%** — Atlanta crime, from the 1989 peak to 2018 | — |
| [Baltimore, MD](videos/baltimore-md/) | *Down From the Peak* | **−71%** — Baltimore crime, from the 1995 peak to 2020 | — |
| [Boston, MA](videos/boston-ma/) | *Forty Years of Crime* | **−71%** — Boston's reported crime since its 1989 peak | Removed from Earth One\* |
| [Buffalo, NY](videos/buffalo-ny/) | *The Rebound* | **+32%** — Buffalo crime, up sharply off its 2022 low | — |
| [Charlotte, NC](videos/charlotte-nc/) | *The Flat Line* | **±0%** — Charlotte crime, flat for eight years | — |
| [Chicago, IL](videos/chicago-il/) | *Forty Years of Crime* | **−51%** — Chicago's reported crime since 2001 | — |
| [Cincinnati, OH](videos/cincinnati-oh/) | *The Long Slide* | **−45%** — Cincinnati crime, from the 2002 peak to 2019 | — |
| [Dallas, TX](videos/dallas-tx/) | *Two-Thirds Down* | **−68%** — Dallas crime, from the 1988 peak to 2014 | — |
| [Denver, CO](videos/denver-co/) | *The Recent Turn* | **−20%** — Denver crime, down since the 2022 peak | — |
| [Detroit, MI](videos/detroit-mi/) | *The Long Fall* | **−69%** — Detroit crime, from the 1985 peak to 2016 | — |
| [Grand Rapids, MI](videos/grand-rapids-mi/) | *A Quarter-Century of Crime* | **−51%** — Grand Rapids' reported crime since 1985 | Removed from Earth One\* |
| [Kansas City, MO](videos/kansas-city-mo/) | *Halved* | **−51%** — Kansas City crime, from the 1991 peak to 2014 | — |
| [Memphis, TN](videos/memphis-tn/) | *The Wave That Broke* | **−32%** — Memphis crime, down a third from the 2023 peak | — |
| [Milwaukee, WI](videos/milwaukee-wi/) | *Nearly Halved* | **−44%** — Milwaukee crime, down 44% since 2006 | — |
| [Minneapolis, MN](videos/minneapolis-mn/) | *The Fall and the Plateau* | **−52%** — Minneapolis crime, from the 1991 peak to 2018 | — |
| [Nashville, TN](videos/nashville-tn/) | *The Long Slide* | **−40%** — Nashville crime, from the 1996 peak to 2018 | — |
| [Philadelphia, PA](videos/philadelphia-pa/) | *Forty Years of Crime* | **−32%** — Philadelphia's recorded offenses since 2006 | — |
| [San Francisco, CA](videos/san-francisco-ca/) | *Forty Years of Crime* | **−32%** — San Francisco's recorded incidents since 2003 | — |
| [Seattle, WA](videos/seattle-wa/) | *Four Decades of Crime* | **−48%** — Seattle's reported crime, from the 1987 peak to 2007 | — |
| [Washington, DC](videos/washington-dc/) | *Forty Years of Crime* | **−48%** — Washington DC's reported crime, from the 1993 peak to 2007 | Removed from Earth One\* |

\* Historical Earth One upload, permanently deleted by owner direction. The dedicated-channel remake remains unreleased.

Every hook stat above is a *reported/recorded-crime* figure with its measure and caveats stated on screen and in the city's provenance — see [Principles](#principles). Each video directory is a self-contained, reproducible record: `config.json` (every on-screen string and number), `youtube.json` (the exact YouTube listing — the publish pipeline writes the final URL back), `render.lock.json` (commit + dataset date + SHA-256 of the shipped render), and a README that is the video's public landing page.

## Principles

The honesty contract. These are binding — and each one is enforced somewhere in this repo you can read:

1. **Never fabricate.** Every point, count, and label on screen is backed by a real, citable source. Where a source publishes coordinates, every dot is a real reported incident location (block-level, as anonymized by the source). Where it doesn't (Grand Rapids), dots are explicitly disclosed density glyphs — how many, never where.
2. **Every on-screen number is recomputed from the data, not transcribed.** The hook and punchline figures of all 20 videos were independently re-verified against each city's `data/<slug>/normalized/trend.json` before final assignment (recorded in [`experiment/matrix.json`](experiment/matrix.json)), and nothing ships below confidence 100 in the per-video ledger ([`experiment/confidence.json`](experiment/confidence.json)).
3. **Measure seams are explained on screen.** The long-arc chart joins the FBI UCR era to the city's own records era at an explicitly labeled seam, and every one of the 20 configs carries a plain-language `seamExplain` ("The ruler changes here — not the city"). Shapes are comparable within an era, never across it.
4. **Declared gaps stay gaps.** Partial months and years are excluded and disclosed. Years a source cannot support are declared in the trend data (`seamGapYears`, `artifactYears`) and render as labeled gaps — e.g. Atlanta 2019–2020, where the FBI submissions were incomplete — never interpolated.
5. **No data isn't "no crime".** Areas with no mapped records are excluded from "safest area" rankings, and the video says so on screen.
6. **Provenance for everything.** Each dataset carries its source URL, fetch date, license, and field mapping in `data/<slug>/PROVENANCE.md`, indexed in the [Data Provenance wiki](wiki/Data-Provenance.md) — all 20 cities.
7. **Visible attribution.** Every video keeps an on-screen data-source credit; per-dataset license terms are honored (basemaps © OpenStreetMap contributors, ODbL).

## Human-directed agentic production

Claude (Anthropic) assembled the inherited Batch 1 pipeline and drafts. Codex now operates the next production phase. That handoff is part of the record, but neither model is the publisher or final editor.

The operating target is to automate repeatable research, processing, rendering, and assembly while reserving consequential judgment for people. Claims, sources, contextual annotations, narration, visual taste, and release readiness pass through explicit human gates. This repository is the audit trail: pipelines, provenance, configs, render locks, public experiment rules, and corrections. If you find an error or want to challenge the project design, [open a focused project issue](https://github.com/hadi-nayebi/crime-cartography/issues/new?template=project-feedback.yml).

## Inherited Batch 1 was a designed experiment

The 20 inherited cuts are not stylistic clones. Trend chart form, story frame,
palette family, and music family varied per city. That matrix remains useful
design evidence, but no winning level or Batch 2 decision can be inferred from
the deleted Earth One sample. Dedicated-channel remakes must establish their
own evidence. The inherited assignment lives in
[`experiment/DESIGN.md`](experiment/DESIGN.md) and
[`experiment/matrix.json`](experiment/matrix.json). The honesty rules above
remain invariants.

## How it works

```
 official source            pipeline/                    data/<slug>/normalized/        surface/remotion/
┌──────────────┐  fetch    ┌────────────────────┐  emit  ┌─────────────────────────┐  render ┌─────────────┐
│ city portal  │ ────────▶ │ sources/<slug>.mjs │ ─────▶ │ timeline · beats · trend │ ──────▶ │ CrimeStory  │ ─▶ 5:30 video
│ FBI CDE, OSM │           │ build-trend.mjs    │        │ points · feed · basemap  │         │ (per-city   │
└──────────────┘           │ fetch-basemap.mjs  │        │ history · summary        │         │  style)     │
       │                   └────────────────────┘        └─────────────────────────┘         └─────────────┘
  PROVENANCE.md ◀────────────── source link + license recorded ──────────────┘
```

The engine consumes one canonical bundle — **regions** (real polygons) × **monthly time series per region** × **category split**, plus the full-arc annual trend and optional real incident points — so new geographies plug in without touching the renderer. Per-city configs own every string, color, chart style, and annotation.

## Reproduce a video

Every video directory's README carries these exact commands for its city:

```bash
node pipeline/sources/<slug>.mjs           # fetch + normalize + validate
node pipeline/build-trend.mjs <slug>       # long-arc series (FBI history + city data)
node pipeline/fetch-basemap.mjs <slug>     # OSM highways + landmarks (ODbL)
cd surface/remotion && node scripts/sync-data.mjs <slug>
npx remotion render CrimeStory ../../videos/<slug>/out/<slug>.mp4 --props=../../videos/<slug>/config.json
```

Music is regenerated separately (GPU + gated model) — see [`pipeline/audio/README.md`](pipeline/audio/README.md).

## Publish pipeline

```bash
node pipeline/publish/auth-youtube.mjs            # one-time OAuth (channel owner)
node pipeline/publish/upload-youtube.mjs <slug>   # uploads PRIVATE, writes the URL back
```

Uploads are private by default; the channel owner reviews and flips public. `.secrets/` is gitignored.

## Add a city

The most valuable contribution. It's a contained, documented job: [`wiki/Add-a-City.md`](wiki/Add-a-City.md) walks through sourcing a dataset, writing the adapter, and recording provenance; [`CONTRIBUTING.md`](CONTRIBUTING.md) has the ground rules.

## Layout

| Path | What |
|------|------|
| `data/<slug>/` | Normalized bundle + `PROVENANCE.md` per dataset (20 cities) |
| `pipeline/` | Per-city source adapters, trend/basemap builders, validators, publish scripts, music generator |
| `surface/remotion/` | The Remotion engine (renderer of record) |
| `surface/preview/` | Leaflet live preview/scrub tool (not the renderer) |
| `videos/<slug>/` | Per-video record: config, YouTube listing, render lock, landing README |
| `experiment/` | Batch-1 experiment design, feature matrix, per-video confidence ledger |
| `wiki/` | Data provenance index, add-a-city guide |

## License

Code: MIT (see [LICENSE](LICENSE)). The [rights boundary](RIGHTS.md) keeps
rendered media, editorial content, brands, upstream data, and third-party assets
outside that software license unless a specific file says otherwise. Data:
each dataset retains its upstream license, recorded in its `PROVENANCE.md`.
Basemap: © OpenStreetMap contributors (ODbL). Music:
[Stable Audio Open](https://huggingface.co/stabilityai/stable-audio-open-1.0)
under the Stability AI Community License.

---

*Produced by a human-directed agentic workflow. Initial Batch 1 machinery and drafts were assembled with Claude; the current editorial remake is operated with Codex.*
