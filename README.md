# Crime Cartography

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
&nbsp;[![Data: honest](https://img.shields.io/badge/data-sourced%20%C2%B7%20never%20fabricated-2ea44f.svg)](#principles)
&nbsp;[![Renderer: Remotion](https://img.shields.io/badge/render-Remotion-7c5cff.svg)](https://www.remotion.dev/)

**A data-honest video production pipeline that turns *sourced* crime data into engaging ~5-minute animated map stories — for any city, county, or state.**

One reusable visual *surface* — evolving choropleth + point-density layers, live counters, a dispatch feed, a per-month trend line, per-neighborhood rankings, and a two-era narrative — that plugs into many real datasets. Built in [Remotion](https://www.remotion.dev/) for deterministic, frame-exact video export, with a Leaflet HTML preview for fast iteration.

> **First production:** Grand Rapids, MI — 25 years of real data (FBI UCR 2000–2022 + GRPD NIBRS 2023–2026) in one 5½-minute animated map.

## Watch

📺 **Grand Rapids · A Quarter-Century of Crime** — _YouTube link coming with publication._

The finished render is produced by `surface/remotion/` from the committed config in `videos/grand-rapids-mi/`. To build it yourself, see [Reproduce](#reproduce).

---

## Principles

1. **Never fabricate.** Every point, count, and label on screen is backed by a real, citable source. We do **not** synthesize or "approximate" incident positions. Where only aggregate counts exist, we show them honestly (counts/choropleth) — we never invent dots. A data-source credit stays visible on screen.
2. **Provenance for everything.** Each dataset carries its source URL, fetch date, license, and field mapping in `data/<slug>/PROVENANCE.md` and the [Data Provenance wiki](wiki/Data-Provenance.md).
3. **Reproducible.** Datasets are produced by scripts in `pipeline/`, not by hand. Configs are committed. Anyone can re-run the build.
4. **Community-growable.** Adding a new city is a documented, contained job — see [Add a City](wiki/Add-a-City.md).

## How it works

```
 reliable source            pipeline/                 canonical schema           surface/
┌──────────────┐   fetch   ┌──────────────┐  normalize ┌──────────────┐  render ┌──────────────┐
│ GRPD ArcGIS  │ ───────▶  │ sources/*.mjs │ ─────────▶ │ data/<city>/  │ ──────▶ │ Remotion +   │ ──▶ 5-min video
│ open data    │           │ validate.mjs  │            │ normalized/   │         │ Leaflet HTML │
└──────────────┘           └──────────────┘            └──────────────┘         └──────────────┘
        │                                                                              │
   PROVENANCE.md  ◀───────────────────── source link + license recorded ──────────────┘
```

**Canonical incident schema** (one object per incident):
```json
{ "date": "2025-11-04", "lat": 42.9637, "lng": -85.6681, "cat": "persons", "type": "Assault", "place": "Heartside" }
```
`cat` ∈ `persons | property | society` (the three NIBRS groups).

## Layout

| Path | What |
|------|------|
| `data/<slug>/` | Normalized incidents + `PROVENANCE.md` per dataset |
| `pipeline/` | `sources/` fetch adapters, `normalize.mjs`, `validate.mjs`, `schema.md` |
| `surface/remotion/` | The Remotion video project (renderer of record) |
| `surface/preview/` | Leaflet HTML preview/scrub tool |
| `videos/<city>/` | Per-video config + render output |
| `wiki/` | Docs: data provenance, add-a-city guide, source catalog |
| `docs/` | Background (data handoff spec) |

## Status

✅ **First video shipped.** The Grand Rapids vertical slice is complete end-to-end — real data fetched, normalized, validated, and rendered to a 5½-minute video with an original score. The pipeline is now ready to generalize to more cities. See [wiki/Home](wiki/Home.md).

## Roadmap

- [x] Repo + pipeline scaffolding, data-honesty contract
- [x] Grand Rapids: fetch real GRPD + FBI UCR data → normalize → validate
- [x] Remotion surface (two-era narrative: choropleth + point-density, counters, trend line, neighborhood rankings)
- [x] Original royalty-free score (Stable Audio Open), arranged to the video's phases
- [x] Render the first 5½-min Grand Rapids video
- [ ] Publish to YouTube + add the link here
- [ ] Generalize: dataset catalog (cities → counties → states → US)

## Reproduce

The full build is scripted — see the [Reproduce block in the Grand Rapids provenance](data/grand-rapids-mi/PROVENANCE.md#reproduce) (fetch → normalize → validate), then render:

```bash
cd surface/remotion
node scripts/sync-data.mjs grand-rapids-mi          # copy normalized data into public/
npx remotion render CrimeStory \
  ../../videos/grand-rapids-mi/out/grand-rapids-v2.mp4 \
  --props=../../videos/grand-rapids-mi/config.json
```

Music is optional and regenerated separately (needs a GPU + a gated model) — see [PROVENANCE → Music / audio](data/grand-rapids-mi/PROVENANCE.md#music--audio-non-data).

## License

Code: MIT (see [LICENSE](LICENSE)). Data: each dataset retains its upstream source's license, recorded in its `PROVENANCE.md`. Music: generated with [Stable Audio Open](https://huggingface.co/stabilityai/stable-audio-open-1.0) under the Stability AI Community License.

---

*Built with [Claude Code](https://claude.com/claude-code).*
