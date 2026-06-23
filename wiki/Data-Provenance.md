# Data Provenance — index

Every dataset records its source URL, fetch date, license, and field mapping in
`data/<slug>/PROVENANCE.md`. This page indexes them. **No dataset ships without
a reliable, citable source link.**

## grand-rapids-mi — Grand Rapids, MI

- **Records source:** GRPD Crime Data, City of Grand Rapids ArcGIS Hub
  - Layer: `GRPD_Crime_Data/FeatureServer/0` @
    `services2.arcgis.com/L81TiOwAPO1ZvU9b`
  - Hub: https://grpd-grandrapids.hub.arcgis.com/datasets/grandrapids::grpd-crime-data
- **Beat polygons source:** GRPD Service Area Map
  - Layer: `GRPD_SERVICE_AREA_MAP_NEW/FeatureServer/1`
- **Deep-history source (2000–2022):** FBI Crime Data Explorer (CDE) — Grand
  Rapids PD, **ORI MI4143600** — real annual Violent + Property counts, 23 full
  years. Shown as a labeled monthly average; UCR taxonomy kept distinct from
  NIBRS. Endpoint: `api.usa.gov/crime/fbi/cde/summarized/agency/MI4143600/...`
- **Span:** 2000–2022 (FBI UCR annual) + 2023-01-01 → 2026-06-01 (GRPD, 42 months)
- **Records:** 210,488 total · 203,480 mapped to a beat (**96.7% coverage**) ·
  7,008 with an unmatched/blank beat code, kept in totals and disclosed.
- **License:** City of Grand Rapids GIS Data Access & Use Constraint Agreement
  (data provided "as is", as a complementary public service).
- **Honesty note:** the records layer has **no coordinates** (`geometryType:
  None`). We therefore animate **per-beat aggregates** at real beat centroids —
  never synthesized individual dots. Most records fall in the **Local / Other**
  bucket (local-ordinance reports); these are shown and labeled, never counted
  as violent crime.
- **Detail:** [`data/grand-rapids-mi/PROVENANCE.md`](../data/grand-rapids-mi/PROVENANCE.md)

### Category mapping (NIBRS_Category → cat)

| NIBRS_Category | cat |
|----------------|-----|
| Crimes Against Person(s) | `persons` |
| Crimes Against Property | `property` |
| Crimes Against Society | `society` |
| Local / Local-DL / All Other / 0 | `other` |

## Ranked source types (for new datasets)

| tier | source | grain | coords? |
|------|--------|-------|---------|
| A | City open-data / ArcGIS Hub incident layers | incident or beat | sometimes |
| B | FBI Crime Data Explorer (CDE) | agency monthly counts | no |
| C | State UCR/NIBRS programs | aggregate counts | no |
| D | FOIA / records requests | varies | sometimes |

Coordinate-level points are best (real dot maps). Count-only sources are still
usable **honestly** as area aggregates/choropleth — never as invented points.
