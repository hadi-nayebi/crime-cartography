# Provenance — Seattle, WA

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **SPD Crime Data: 2008-Present** (Socrata `tazs-3rd5`) |
| Publisher | Seattle Police Department (SPD), via data.seattle.gov |
| Landing page | https://data.seattle.gov/d/tazs-3rd5 |
| API | https://data.seattle.gov/resource/tazs-3rd5.json |
| Fetched | 2026-07-11T03:30:06.779Z |
| License | Public Domain (Socrata licenseId `PUBLIC_DOMAIN`), attribution "SPD" |
| Records used | 1,542,608 (offense_date 2008-01-01 → 2026-06-30) |
| Source caveat | Only finalized (UCR-approved) reports; dataset updated daily; classifications can change |

### Windowing (disclosed exclusions)
- **2,966 dirty pre-2008 rows** (offense_date back to 1900) are excluded — the dataset is titled "2008-Present" and pre-2008 rows are data-entry artifacts.
- Rows after **2026-06-30** (partial month at fetch time) are excluded; the granular window ends at the last full month.
- The `neighborhood` (MCPP) field is ≈99% "-" before 2017, so the **granular era starts 2017-01**. The 738,885 rows from 2008–2016 are counted in `totalRecords` and disclosed as `unplacedBeats["pre-2017"]` — never silently dropped.

### Fields used
`offense_date` · `nibrs_crime_against_category` · `nibrs_offense_code_description` · `neighborhood` (MCPP) · `block_address` · `latitude`/`longitude` (TEXT) · `precinct`.

### Category mapping (nibrs_crime_against_category → cat)
| Source value | cat | 2008+ window count |
|---|---|--:|
| PERSON | `persons` | 220,727 |
| PROPERTY | `property` | 948,813 |
| SOCIETY | `society` | 128,677 |
| ANY / NOT_A_CRIME / "-" | `other` | 244,391 |

**ANY** is SPD's mixed-target bucket and **NOT_A_CRIME** is non-criminal activity — both are mapped to `other`, labeled "Mixed / non-criminal (context)", and never counted as NIBRS Group A persons/property/society crime.

### Coverage
- Placed (one of the 58 MCPP neighborhoods, 2017-01…2026-06): **790,989** (51.3%)
- Unplaced: 751,619 = 738,885 pre-2017 + 12,734 in-span rows whose neighborhood is "-", UNKNOWN, OOJ, or FK ERROR.
- Identity `placed + unplaced == citywide` validated per month × category in-script.

## Geometry source — MCPP neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **Seattle MCPP (Micro-Community Policing Plans) neighborhoods** — 58 polygons |
| FeatureServer | https://services.arcgis.com/ZOyb2t4B0UYuYNYH/ArcGIS/rest/services/MCPP/FeatureServer/0 |
| Join key | `neighborhood` — matches the crime data's MCPP values **verbatim** (no fuzzy matching) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (`points.json`)

Coordinates in the source are TEXT with sentinels: `REDACTED` (224,493), `-1.0` (172,365), plus a handful of junk values — **≈25.7% of records have no usable location**. Points shown are **real block-snapped offense locations published by SPD** (block_address grain), never synthesized. Client-side gate: parseable lat 47.4–47.8, lng −122.5–−122.2. Deterministic sample: per year 2017–2026, first 1,300 rows in `:id` order with non-redacted coords, bucketed by month, even-stride ≤100/month → **11,142 points ≈ 1 per 61 of the 679,329 placeable rows**. Redacted-location records are still counted in every total — they are only missing from the dot layer, and the video says so.

## Historical source — FBI UCR (1985–2016 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Seattle Police Department — **ORI `WASPD0000`** |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/WASPD0000/violent-crime (and `/property-crime`) |
| Span | 1985–2016, annual Violent + Property (12 reported months verified per year) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set `FBI_API_KEY`) |

UCR Summary (Violent/Property) is a **different taxonomy** than SPD NIBRS categories — the eras are presented as distinct and bridge at 2017; they are never equated. No monthly or neighborhood detail is implied for 1985–2016.

## Long-arc trend (`trend.json`) — citywide incident-era annuals

The incident-era annual totals in `trend.json` are **citywide, queried straight
from the source** (`count(*)` offense rows per `offense_date` year, 2008–2025)
— NOT the sum of the timeline's placed cells. The previous build joined
citywide 2008–2016 annuals to **placed-only** 2017+ annuals inside one era, and
the placed share is not stable: measured at the source (2026-07-19), the
junk/blank-neighborhood rows ("-", UNKNOWN, OOJ, FK ERROR) are **3.28% of
offenses in 2017–2018 but only 0.6–1.2% in 2019–2025**. The placed-only chart
therefore showed 2016→2017 as −0.2% where the source says **+3.2%**,
understated the 2018 peak (89,674 placed vs **92,715 citywide**) and the
2017→2025 decline (−11.5% placed-only vs **−13.3% citywide**). Fixed
2026-07-19: 2017–2025 now come from the same citywide `count(*)` series as
2008–2016 (one measure across the whole era). The map/counter chapters still
use the placed timeline (98.4% coverage of 2017+ rows, disclosed on screen).
Rebuild: `node pipeline/build-trend.mjs seattle-wa`.

## Reproduce

```bash
FBI_API_KEY=… node pipeline/sources/seattle-wa.mjs
node pipeline/build-trend.mjs seattle-wa
```
