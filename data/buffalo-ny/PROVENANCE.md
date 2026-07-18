# Provenance — Buffalo, NY

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **Crime Incidents** (Socrata `d6g9-xbgu`) |
| Publisher | Buffalo Police Department (BPD), via data.buffalony.gov |
| Landing page | https://data.buffalony.gov/d/d6g9-xbgu |
| API | https://data.buffalony.gov/resource/d6g9-xbgu.json |
| Fetched | 2026-07-17T23:48:04.879Z |
| License | **Public Domain U.S. Government** (Socrata licenseId `USGOV_WORKS`, https://www.usa.gov/government-works), attribution "Buffalo Police Department" |
| Records used | 333,672 (incident_datetime 2006-01-01 → 2026-05-31) |
| Source caveat | Preliminary report data ("very preliminary information … further investigation may be necessary"); updated daily with a ~1-month publication lag |

### Windowing (disclosed exclusions)
Whole dataset at fetch time: **334,761 rows** = 633 junk-dated + 333,672 window + 456 partial-month (identity validated in-script).
- **633 junk-dated rows before 2006** (incident_datetime back to 1910 — data-entry artifacts; the real span begins 2006) are excluded and counted here.
- **456 rows after 2026-05-31** are excluded: the source lags ~1 month and June 2026 rows stop mid-month (last row 2026-06-16 at fetch) — the granular window ends at the last FULL month, **2026-05** (measured, not assumed).

### Source gaps (shown honestly, never interpolated)
| Span | What the source shows |
|------|----------------------|
| 2006-02 … 2006-04 | thin ramp-in months (335–1,053 rows vs ~1,500–2,000 typical) |
| 2008-01 … 2008-05 | near-empty months (17–262 rows) — a gap in the source records system |

These dips are real properties of the published data and appear as-is in the timeline; comparisons in the video avoid 2006 and 2008 as baseline years.

### Fields used
`incident_datetime` · `parent_incident_type` · `incident_type_primary` · `neighborhood` (official city neighborhood name, in-data) · `address_1` · `latitude`/`longitude` (TEXT, 3-decimal) · `case_number` (verified unique in-window — incident-level data, no dedupe needed).

### Category mapping (parent_incident_type → cat) — complete enumeration
| Source value | cat | window count |
|---|---|--:|
| Theft | `property` | 147,988 |
| Assault | `persons` | 66,392 |
| Breaking & Entering | `property` | 58,560 |
| Theft of Vehicle | `property` | 33,381 |
| Robbery | `property` | 20,091 |
| Sexual Assault | `persons` | 2,448 |
| Other Sexual Offense | `persons` | 2,169 |
| Sexual Offense | `persons` | 1,514 |
| Homicide | `persons` | 1,126 |
| SODOMY | `persons` | 3 |

Mapping follows the NIBRS crimes-against convention (robbery is a crime against **property**; all sexual offenses and homicide against **persons**). **SCOPE LIMIT (disclosed on-screen):** BPD publishes only these 10 major-crime types — no drug, weapon, or vice offenses — so **Crimes Against Society is structurally zero** (0) and `other` is empty (0). The in-script audit fails loudly if the source ever adds an unmapped type.

### Coverage
- Placed (one of the 35 official neighborhoods, 2006-01…2026-05): **326,828** (97.9%)
- Unplaced: 6,844 in-span rows whose neighborhood is blank or "UNKNOWN" — kept in every citywide total and disclosed.
- Identity `placed + unplaced == citywide` validated per month × category in-script, plus an independent per-month all-rows reconciliation proving the category lists are exhaustive.

## Geometry source — official neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **City of Buffalo planning Neighborhood Boundaries** — 35 polygons, field `NbhdName` |
| FeatureServer | https://gis.buffalony.gov/server/rest/services/BaseFiles/Neighborhood_Boundaries/FeatureServer/0 |
| Publisher | City of Buffalo GIS (gis.buffalony.gov, the city's own server; referenced by the city's "Planning Neighborhoods and Sectors" web map) |
| Join key | `NbhdName` — matches the crime data's `neighborhood` values **verbatim, all 35 of 35** (identity join, no fuzzy matching) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (`points.json`)

Coordinates in the source are TEXT and **rounded by BPD to 3 decimal places (~80–110 m) — block-level, DISCLOSED**: every dot is a real reported incident's block, never an exact address and never synthesized. Sentinels rejected: `UNKNOWN` (~5.3k rows), null (~2.5k rows), plus out-of-city geocode errors outside lat 42.8–42.99, lng -78.95–-78.78. Deterministic sample: per year 2006–2026, first 1,500 rows in `:id` order with usable coords, bucketed by month, even-stride ≤100/month → **20,706 points ≈ 1 per 16 of the 325,935 placeable rows**. Records without usable coordinates are still counted in every total — they are only missing from the dot layer, and the video says so.

## Historical source — FBI UCR (1985–2005 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Buffalo Police Department — **ORI `NY0140100`** (verified: returns "Buffalo Police Department Offenses" series) |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/NY0140100/violent-crime (and `/property-crime`) |
| Span | 1985–2005, annual Violent + Property (12 reported months verified per year) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set `FBI_API_KEY`) |

UCR Summary (Violent/Property) is a **different taxonomy** than the BPD incident types — the eras are presented as distinct and bridge at 2006; they are never equated. No monthly or neighborhood detail is implied for 1985–2005.

## Reproduce

```bash
FBI_API_KEY=… node pipeline/sources/buffalo-ny.mjs
```
