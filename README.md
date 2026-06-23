# Crime Cartography

**A data-honest video production pipeline that turns *sourced* crime data into engaging ~5-minute animated map stories — for any city, county, or state.**

One reusable visual *surface* — evolving heat maps, animated incident points, live counters, a dispatch feed, and a growing timeline chart — that plugs into many real datasets. Built in [Remotion](https://www.remotion.dev/) for deterministic, frame-exact video export, with a Leaflet HTML preview for fast iteration.

> **First production:** Grand Rapids, MI — from real GRPD open data to a finished 5-minute video.

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

🚧 Early build. Grand Rapids vertical slice in progress. See [wiki/Home](wiki/Home.md) and the [roadmap](#roadmap).

## Roadmap

- [x] Repo + pipeline scaffolding, data-honesty contract
- [ ] Grand Rapids: fetch real GRPD incidents → normalize → validate
- [ ] Remotion surface (heat + points + counters + chart + narrative)
- [ ] Render & publish the first 5-min Grand Rapids video
- [ ] Generalize: dataset catalog (cities → counties → states → US)

## License

Code: MIT (see [LICENSE](LICENSE)). Data: each dataset retains its upstream source's license, recorded in its `PROVENANCE.md`.

---

*Built with [Claude Code](https://claude.com/claude-code).*
