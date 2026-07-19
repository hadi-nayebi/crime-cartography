# Provenance — Baltimore, MD

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **NIBRS Group A Crime Data** (Open Baltimore hosted ArcGIS layer) |
| Publisher | Baltimore Police Department, via Open Baltimore |
| Landing page | https://www.arcgis.com/home/item.html?id=204beefe92a645d79fdf0969957bbdf8 (portal: https://data.baltimorecity.gov/) |
| API | https://services1.arcgis.com/UWYHeuuJISiGmgXx/arcgis/rest/services/NIBRS_GroupA_Crime_Data/FeatureServer/0 |
| Fetched | 2026-07-18T11:37:47.932Z |
| License | **Not stated on the item** — attributed to "Baltimore City Police Department via Open Baltimore" |
| Rows in layer | 261,708 victim-based rows (live feed, 2022-01-01 → present) |
| Records used | **224,602 incidents** (deduplicated; local dates 2022-01-01 → 2026-06-30) |
| Source caveat | Live feed refreshed continuously; classifications and counts can change as investigations proceed. The legacy "Part 1 Crime Data" layer is frozen (last data 2023-02) and is **not** used. |

### ⚠ Victim-based rows → incident dedupe (the headline disclosure)
BPD publishes **one row per victim** (`Total_Incidents` is always 1 per row). All counts shown are **incidents**, obtained by deduplicating on `CCNumber` (the BPD central-complaint number):

- 259,819 in-window victim rows → **224,602 incidents** (×1.157 inflation removed)
- 27,792 incidents (12.4%) have more than one victim row
- Representative row per incident = **lowest RowID** (deterministic, no severity weighting). Consequences, both measured and disclosed: 16,393 incidents (7.3%) carry more than one offense description across their victim rows (the representative's description decides the category), and 0 incidents have victim rows in more than one local month (the representative's date decides the month).
- Victim-row vs incident category totals (context): persons 78,213 → 65,784, property 181,284 → 158,572, society 322 → 246. Persons crimes shrink the most under dedupe — multi-victim incidents are naturally concentrated there.

### Timestamps & windowing (disclosed)
`CrimeDateTime` is a true UTC instant of the local event time (verified: dataset min = 2022-01-01 05:00Z = local EST midnight; the UTC hour-of-day low sits at 10Z = 5–6 AM local). **All month binning uses America/New_York local time.** Excluded and disclosed: **1,889** rows with local dates in the partial month 2026-07 (1,641 tail-only CCNumbers). No rows predate 2022-01-01 local (asserted).

### Fields used
`RowID` · `CCNumber` · `CrimeDateTime` · `Description` · `Neighborhood` (validation only — see below) · `Latitude`/`Longitude` (TEXT, address-level) · `Location` (block address).

### Category mapping (Description → cat) — exhaustive, incident counts
The layer has no native crimes-against field; `Description` (28 distinct values, enumerated live) is mapped to the **official NIBRS crimes-against** assignment of the corresponding Group A offense. Note NIBRS places robbery, arson, vandalism, fraud and extortion under **property**; intimidation and human trafficking under **persons**. "DRUG VIOLOATION" is a source typo variant of "DRUG/NARCOTIC VIOLATIONS" (mapped identically). Every value maps to persons/property/society — the `other` bucket is **0** for Baltimore.

| Description (verbatim) | cat | incidents |
|---|---|--:|
| COMMON ASSAULT | `persons` | 36,624 |
| VANDALISM | `property` | 30,587 |
| AUTO THEFT | `property` | 26,018 |
| LARCENY | `property` | 23,244 |
| AGG. ASSAULT | `persons` | 20,362 |
| LARCENY FROM AUTO | `property` | 17,503 |
| SHOPLIFTING | `property` | 14,005 |
| BURGLARY | `property` | 13,464 |
| FRAUD | `property` | 10,268 |
| ROBBERY | `property` | 9,987 |
| LARCENY OF MOTOR VEHICLE PARTS OR ACCESSORIES | `property` | 9,419 |
| INTIMIDATION | `persons` | 5,553 |
| ROBBERY - CARJACKING | `property` | 1,900 |
| RAPE | `persons` | 1,346 |
| ROBBERY - COMMERCIAL | `property` | 1,093 |
| HOMICIDE | `persons` | 840 |
| SEX OFFENSES | `persons` | 811 |
| ARSON | `property` | 468 |
| STOLEN PROPERTY | `property` | 449 |
| KIDNAPPING | `persons` | 208 |
| EXTORTION | `property` | 167 |
| PORNOGRAPHY | `society` | 128 |
| WEAPON VIOLATIONS | `society` | 56 |
| HUMAN TRAFFICKING | `persons` | 40 |
| ANIMAL CRUELTY | `society` | 32 |
| DRUG/NARCOTIC VIOLATIONS | `society` | 26 |
| DRUG VIOLOATION | `society` | 2 |
| PROSTITUTION | `society` | 2 |

### Neighborhood placement — spatial join (disclosed method choice)
The in-data `Neighborhood` field is **~98.5% blank throughout 2022** and nearly complete from 2023 (incident-level, by representative row):

| Year | named | blank |
|---|--:|--:|
| 2022 | 710 | 45,164 (98.5%) |
| 2023 | 56,303 | 1,646 (2.8%) |
| 2024 | 50,041 | 306 (0.6%) |
| 2025 | 47,223 | 17 (0%) |
| 2026 | 23,183 | 9 (0%) |

An identity join on that field would erase 2022 from the map and put a method seam exactly where the story compares 2022→2025. Instead **every incident is placed the same way**: point-in-polygon (even-odd, holes honored) of the BPD-published coordinates into the 278 official neighborhood polygons.

Validation against the in-data name where one exists and matches an official polygon name: **99.1% agreement** (173,508 of 175,030 placed incidents; 1,522 boundary disagreements — BPD's own assignment vs point-in-polygon differ along shared edges). 2,414 incidents carry BPD area names that are not in the official 2010 polygon set (e.g. HARBOR EAST, BALTIMORE PENINSULA) — their coordinates still place them in an official polygon.

### Coverage
- Placed (one of the 278 official neighborhoods): **224,310** (99.9%)
- Unplaced 292 = 236 no-coordinates + 2 out-of-city-bbox + 54 in-bbox but outside every polygon (piers, harbor water, edge artifacts) — all counted in every total, never hidden.
- Identity `placed + unplaced == citywide` validated per month × category in-script.

### Independent server reconciliation (all 54 months)
For every local month, the exact UTC boundary instants were queried back against the source: server victim-row counts **and** server distinct-`CCNumber` counts both match the client tallies exactly, and Σ monthly distinct CCNumbers = 224,602 incidents + 0 cross-month memberships (incidents whose victim rows straddle a month boundary) — the identity is asserted, not assumed.

## Geometry source — official neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **Neighborhoods** (2010 neighborhood statistical areas) — 278 polygons, field `Name` |
| FeatureServer | https://services1.arcgis.com/UWYHeuuJISiGmgXx/arcgis/rest/services/Neighborhoods_bndy/FeatureServer/0 |
| Item | https://www.arcgis.com/home/item.html?id=9a800dc1d0fc42b697bb79a4e63488b2 |
| License | Not stated — attributed to City of Baltimore |
| Join method | point-in-polygon of incident coordinates (see above) — **not** a name join |
| Centroids | Area-weighted centroid across outer rings (shoelace formula) — for symbol placement only |
| Geometry precision | 5 decimals (~1 m) as served by `geometryPrecision=5` |

## Real incident points (`points.json`)

Dots are **real incident locations published by BPD** (`Latitude`/`Longitude`, address-level strings, one per deduplicated incident's representative row). 238 incidents (~0.1%) have blank or out-of-city coordinates — counted in every total, absent only from the dot layer. Client-side gate: lat 39.19–39.38, lng -76.72–-76.52. Deterministic sample: per month, incidents in RowID order, even-stride ≤100/month → **5,400 points ≈ 1 per 42 of the 224,364 placeable incidents**.

## Historical source — FBI UCR (1985–2020 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Baltimore Police Department — **ORI `MDBPD0000`** |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/MDBPD0000/violent-crime (and `/property-crime`) |
| Span | 1985–2020, annual Violent + Property (12 reported months verified per year) |
| Auth | api.data.gov key (read from `.secrets/fbi_api_key`; `FBI_API_KEY` env overrides) |
| Raw responses | cached under `data/baltimore-md/raw/` |

**ORI correction (disclosed):** the scouted ORI MD3010100 returns an *empty* series on the CDE; the agency roster (`agency/byStateAbbr/MD`) identifies Baltimore Police Department as **MDBPD0000**, whose series was used and sanity-checked (1985 violent = 15,498 — big-city scale, and the `… Offenses` series is matched explicitly so the `… Clearances` series can never be picked up by accident).

**Dropped partial years (disclosed):** **2021** (violent 7/12, property 7/12 reported months) — an annual total cannot honestly be built from fewer than 12 reported months. 2021 is BPD's NIBRS-transition year; it is presented as a **gap year** between the eras, never interpolated.

UCR Summary (Violent/Property) is a **different taxonomy** than BPD NIBRS categories — the eras are presented as distinct and bridge at 2022 across the disclosed 2021 gap; they are never equated. No monthly or neighborhood detail is implied for 1985–2020.

### Trend seam decision (producer, 2026-07-19)

The FBI UCR era ends **2020** and the BPD open NIBRS incident feed begins **2022-01**. Baltimore has a documented FBI/NIBRS reporting gap in **2021**: CDE returns only a partial-year total for `MDBPD0000` (≈ 13,200 vs 2020 ≈ 28,000), so no comparable full-year figure exists. Resolution (in `pipeline/build-trend.mjs`, `allowSeamGap`): **2021 is omitted** (recorded as `seamGapYears:[2021]` with a verbatim `seamGapReason`) rather than shown at a false low or interpolated. `trend.json` runs FBI 1985–2020 then incident 2022–2025, with the one-year hole disclosed on the chart's seam explainer and in the era legend. Nothing is invented; the gap is shown as a gap.

## Reproduce

```bash
node pipeline/sources/baltimore-md.mjs   # reads .secrets/fbi_api_key; FBI_API_KEY env overrides
```
