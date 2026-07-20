# Provenance — Washington, DC

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **Crime Incidents** (Open Data DC, one ArcGIS layer per year 2008–2026) |
| Publisher | Metropolitan Police Department (MPD), via Open Data DC |
| Landing pages | https://opendata.dc.gov/ (search "Crime Incidents in <year>") |
| API | https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/MPD/MapServer (yearly layers; ids discovered from the service directory) |
| Fetched | 2026-07-12T07:11:49.150Z |
| License | CC BY 4.0 — attribution: Open Data DC / Metropolitan Police Department |
| Records used | 596,352 (REPORT_DAT 2008-01-01 → 2026-06-30) |
| Source caveat | MPD publishes only finalized Part-I-style incident reports; the feed is updated daily and classifications can change |

### Windowing (disclosed exclusions)
- Rows after **2026-06-30** (651 rows in the partial month 2026-07 at fetch time) are excluded; the granular window ends at the last full month.
- Dates come from `REPORT_DAT` (report date, epoch ms — a true UTC instant). MPD partitions the yearly layers **in DC local wall-clock time** (America/New_York), and the ArcGIS server evaluates `TIMESTAMP` filters/statistics the same way, so month bucketing uses DC local time; layer partitioning, server-side statistics, and client-side bucketing then agree exactly (asserted in-script).

### Fields used
`REPORT_DAT` · `OFFENSE` · `METHOD` · `BLOCK` · `NEIGHBORHOOD_CLUSTER` · `LATITUDE`/`LONGITUDE`.

### Category mapping (OFFENSE → cat, NIBRS crimes-against convention)
| OFFENSE | cat | window count |
|---|---|--:|
| HOMICIDE, SEX ABUSE, ASSAULT W/DANGEROUS WEAPON | `persons` | 42,394 |
| ROBBERY, BURGLARY, THEFT F/AUTO, THEFT/OTHER, MOTOR VEHICLE THEFT, ARSON | `property` | 553,958 |
| *(none — see below)* | `society` | 0 |
| unrecognized OFFENSE values | `other` | 0 |

**`society` is structurally zero for DC**: MPD's open-data feed publishes only the nine Part-I-style offenses above — no drug, weapon, or vice offenses are released in this dataset, so "Crimes Against Society" cannot be shown for DC and the video must say the category is not published, not that it is zero.

All distinct OFFENSE values in the fetched window were covered by the mapping; `other` is 0.

### Coverage
- Placed (one of the 46 official Neighborhood Clusters, 2008-01…2026-06): **591,765** (99.2%)
- Unplaced: 4,587 rows whose `NEIGHBORHOOD_CLUSTER` is blank/null (mostly older years) — kept in every total, disclosed as `unplacedBeats["no-cluster"]`, never silently dropped.
- Identity `placed + unplaced == citywide` validated **exactly** per month × category in-script, where the citywide side is an independent server-side statistics query (groupBy OFFENSE per month, no cluster involved).

## Geometry source — Neighborhood Cluster polygons

| Field | Value |
|-------|-------|
| Dataset | **DC Neighborhood Clusters** (Office of Planning) — 46 polygons |
| MapServer | https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Administrative_Other_Boundaries_WebMercator/MapServer/17 |
| Join key | `NAME` ("Cluster N") — matches the crime data's `NEIGHBORHOOD_CLUSTER` values **verbatim** (no fuzzy matching) |
| Display names | first two resident-known neighborhood names from `NBH_NAMES` (e.g. Cluster 17 → "Takoma / Brightwood"); the full comma-separated list is kept verbatim in `beats.json` (`beats[key].desc`) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (`points.json`)

MPD publishes coordinates at **block-midpoint grain** (anonymized to the block) — every dot is a real reported offense location as released, never synthesized, and the block grain is disclosed on screen. Client-side gate: lat 38.79–39, lng -77.12–-76.9; 0 rows failed it and are counted but not plotted. Deterministic even-stride sample ≤100/month → **22,200 points ≈ 1 per 27 of the 596,352 placeable rows**.

## Dispatch feed (`feed.json`)

First 4 rows per quarter in OBJECTID order (2008-Q1 … 2026-Q2) with a cluster and a block — **no seriousness bias**; title is `OFFENSE` plus `METHOD` when it is GUN or KNIFE (METHOD "OTHERS" is MPD's catch-all and is omitted from titles).

## Historical source — FBI UCR (1985–2007 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Metropolitan Police Department — **ORI `DCMPD0000`** |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/DCMPD0000/violent-crime (and `/property-crime`) |
| Span | 1985–2007, annual Violent + Property (12 reported months verified per year) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set `FBI_API_KEY`) |

UCR Summary (Violent/Property) is a **different taxonomy** than MPD's published offense feed — the eras are presented as distinct and bridge at 2008; they are never equated. No monthly or neighborhood detail is implied for 1985–2007.

## Reproduce

```bash
FBI_API_KEY=… node pipeline/sources/washington-dc.mjs
```

## Long-arc trend — placed-share audit (verified 2026-07-19)

Incident-era annuals (2008–2025) are sums of the timeline's placed (clustered)
cells. Measured at the source per yearly layer: placed share is 98.38–98.91% in
2008–2017 and 99.99–100% from 2018 (the no-cluster rows are concentrated in the
early years, 407–546/yr); replication exact (placed = trend every year, one
2024 record revised at the source since fetch). Drift 1.6 pp across the era —
under the bar, and conservative: the chart's 2008→2025 decline is −28.5%
placed-only vs −29.6% citywide. Certified immaterial; not rebuilt.
