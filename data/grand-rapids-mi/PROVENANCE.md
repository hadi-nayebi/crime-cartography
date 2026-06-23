# Provenance — Grand Rapids, MI

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **GRPD Crime Data** |
| Publisher | City of Grand Rapids Police Department (GRPD), via the City's ArcGIS Hub |
| Landing page | https://grpd-grandrapids.hub.arcgis.com/datasets/grandrapids::grpd-crime-data |
| ArcGIS item | `fe14480243ca4760a9ca446a0c1afb79` |
| FeatureServer (records) | https://services2.arcgis.com/L81TiOwAPO1ZvU9b/arcgis/rest/services/GRPD_Crime_Data/FeatureServer/0 |
| Records | 210,488 |
| Temporal span | 2023-01-01 → 2026-06-01 (`DATEOFOFFENSE`) |
| Geometry | **None** — records carry no coordinates; spatial unit is **Beat** (38) / Service Area, plus block address as free text |
| Layer "modified" | 2026-06-05 |

### Fields used
`DATEOFOFFENSE` (date) · `NIBRS_Category` (Crimes Against Person/Property/Society, Local, Local-DL, All Other) · `NIBRS_GRP` · `Offense_Description` · `OFFENSETITLE` · `Beat__` (e.g. `C3`) · `Service_Area` · `BLOCK_ADDRESS__INCIDENT_LOCATIO` (free text) · `Weapon_Type` · `Day_of_the_Week`.

### Category mapping (NIBRS_Category → surface key)
| Source value | Key | Count |
|---|---|--:|
| Crimes Against Person | `persons` | 19,575 |
| Crimes Against Property | `property` | 26,017 |
| Crimes Against Society | `society` | 9,278 |
| Local / Local-DL / All Other / 0 | `other` | 155,618 |

`other` is the largest bucket — it is local-ordinance / non-NIBRS-Group-A activity (e.g. "Sound of Gunshots"). It is kept **visible and honestly labeled**, never hidden or relabeled as crime. NIBRS Group A total (persons+property+society) ≈ 54,870.

## Geometry source — beat polygons

| Field | Value |
|-------|-------|
| Dataset | **GRPD ServiceArea Beats 2025** |
| Landing page | https://grpd-grandrapids.hub.arcgis.com/datasets/grandrapids::grpd-servicearea-beats-2025 |
| FeatureServer | https://services2.arcgis.com/L81TiOwAPO1ZvU9b/arcgis/rest/services/GRPD_SERVICE_AREA_MAP_NEW/FeatureServer/1 |
| Geometry | Polygon; join key `BEAT` |

Incident counts are joined to these **real** beat polygons by `Beat__` = `BEAT`. Proportional symbols are drawn at each beat's polygon **centroid** and represent the beat's *aggregate count for the time window* — never an individual incident location.

## Honesty notes
- No per-incident coordinates exist publicly, so this project does **not** plot individual incident dots. It animates real per-beat aggregates over time.
- Block addresses are shown verbatim in the incident feed as recorded (block-level, not exact addresses).
- Crime data reflects **reported** incidents and police activity; it is not a measure of conviction or individual guilt, and reporting/recording practices vary.

## License / terms
City of Grand Rapids **GIS Data Access and Use Constraint Agreement** — data provided "as is" as a complementary public service. Approximate; not for site-specific or financial decisions; once downloaded, not controlled by the City. Full text on each dataset's ArcGIS item page. This repository redistributes only **aggregated** counts + the published beat polygons, with attribution to GRPD / City of Grand Rapids.

## Reproduce
```bash
node pipeline/sources/grpd.mjs       # fetch records + beat polygons → data/grand-rapids-mi/raw/
node pipeline/normalize.mjs grand-rapids-mi   # → data/grand-rapids-mi/normalized/
node pipeline/validate.mjs grand-rapids-mi    # invariants + provenance checks
```
Fetched: see `data/grand-rapids-mi/raw/_fetch_meta.json` for the exact run timestamp and record count.
