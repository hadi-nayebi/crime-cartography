# Crime Cartography

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
&nbsp;[![Data: honest](https://img.shields.io/badge/data-sourced%20%C2%B7%20never%20fabricated-2ea44f.svg)](#principles)
&nbsp;[![Made by: Claude](https://img.shields.io/badge/made%20by-Claude%20(Anthropic)-d97706.svg)](#made-by-an-ai)
&nbsp;[![Renderer: Remotion](https://img.shields.io/badge/render-Remotion-7c5cff.svg)](https://www.remotion.dev/)

**A data-honest video production pipeline that turns *sourced* crime data into ~5-minute animated map stories — for any city, county, or state.**

One reusable engine — a full-arc trend chart (always to the present), an evolving neighborhood map with real OSM landmarks and highways, live counters, a dispatch feed of real offenses, and per-neighborhood rankings — that plugs into per-city data pipelines and per-city visual styles. Built in [Remotion](https://www.remotion.dev/) for deterministic, frame-exact export.

## The videos

| City | Span | The story | Directory |
|------|------|-----------|-----------|
| **Chicago, IL** | 1986–2026 | Reported crime **halved** since 2001 — every one of the 77 community areas fell | [`videos/chicago-il/`](videos/chicago-il/) |
| **Seattle, WA** | 1985–2026 | −48% from the 1987 peak, the 2010s plateau, and Capitol Hill overtaking Downtown | [`videos/seattle-wa/`](videos/seattle-wa/) |
| **Grand Rapids, MI** | 1985–2026 | Reported crime **halved** since 1985, mapped beat by beat since 2023 | [`videos/grand-rapids-mi/`](videos/grand-rapids-mi/) |

Each directory is a self-contained, reproducible record: `config.json` (every on-screen string and number), `youtube.json` (the exact YouTube listing — the publish pipeline writes the final URL back), `render.lock.json` (commit + dataset date + sha256 of the shipped render), and a README that is the video's public landing page.

## Made by an AI

These videos are produced **end-to-end by Claude (Anthropic)**: it locates the official data sources, writes and runs the fetch → normalize → validate pipelines, verifies every on-screen figure against the data, designs and renders the visuals, and generates the score. This repo *is* the audit trail. If you find an error, [open an issue](../../issues) — corrections are part of the record.

## Principles

1. **Never fabricate.** Every point, count, and label on screen is backed by a real, citable source. Where a source publishes coordinates (Chicago, Seattle), every dot is a real reported incident location (block-level, as anonymized by the source). Where it doesn't (Grand Rapids), dots are explicitly disclosed density glyphs — how many, never where.
2. **Provenance for everything.** Each dataset carries its source URL, fetch date, license, and field mapping in `data/<slug>/PROVENANCE.md` and the [Data Provenance wiki](wiki/Data-Provenance.md).
3. **Honest seams.** The long-arc chart joins FBI UCR with each city's own incident data at an explicitly labeled measure-change seam — shapes are comparable within an era, never across it. Partial years are excluded, gaps disclosed, nothing interpolated.
4. **Reproducible.** Datasets are produced by scripts in `pipeline/`, not by hand. Configs are committed. Anyone can re-run the build (see any video directory's README).

## How it works

```
 official source            pipeline/                    data/<slug>/normalized/        surface/remotion/
┌──────────────┐  fetch    ┌────────────────────┐  emit  ┌─────────────────────────┐  render ┌─────────────┐
│ city portal  │ ────────▶ │ sources/<city>.mjs │ ─────▶ │ timeline · beats · trend │ ──────▶ │ CrimeStory  │ ─▶ 5:30 video
│ FBI CDE, OSM │           │ build-trend.mjs    │        │ points · feed · basemap  │         │ (per-city   │
└──────────────┘           │ fetch-basemap.mjs  │        │ history · summary        │         │  style)     │
       │                   └────────────────────┘        └─────────────────────────┘         └─────────────┘
  PROVENANCE.md ◀────────────── source link + license recorded ──────────────┘
```

The engine consumes one canonical bundle — **regions** (real polygons) × **monthly time series per region** × **category split**, plus the full-arc annual trend and optional real incident points — so new geographies plug in without touching the renderer. Per-city configs own every string, color, chart style, and annotation.

## Publish pipeline

```bash
node pipeline/publish/auth-youtube.mjs        # one-time OAuth (channel owner)
node pipeline/publish/upload-youtube.mjs <slug>   # uploads PRIVATE, writes the URL back
```

Uploads are private by default; the channel owner reviews and flips public. `.secrets/` is gitignored.

## Layout

| Path | What |
|------|------|
| `data/<slug>/` | Normalized bundle + `PROVENANCE.md` per dataset |
| `pipeline/` | Per-city source adapters, trend/basemap builders, validators, publish scripts, music generator |
| `surface/remotion/` | The Remotion engine (renderer of record) |
| `videos/<slug>/` | Per-video record: config, YouTube listing, render lock, landing README |
| `wiki/` | Data provenance index, add-a-city guide |

## Reproduce

Every video directory's README carries its exact reproduce commands (fetch → normalize → validate → trend → basemap → render). Example:

```bash
cd surface/remotion
node scripts/sync-data.mjs chicago-il
npx remotion render CrimeStory ../../videos/chicago-il/out/chicago-il.mp4 \
  --props=../../videos/chicago-il/config.json
```

Music is regenerated separately (GPU + gated model) — see `pipeline/audio/README.md`.

## License

Code: MIT (see [LICENSE](LICENSE)). Data: each dataset retains its upstream license, recorded in its `PROVENANCE.md`. Basemap: © OpenStreetMap contributors (ODbL). Music: [Stable Audio Open](https://huggingface.co/stabilityai/stable-audio-open-1.0) under the Stability AI Community License.

---

*Produced end-to-end with [Claude Code](https://claude.com/claude-code).*
