# Provenance — Atlanta, GA

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **OpenDataWebsite_Crime view** (APD NIBRS crime data, 2021-present) |
| Publisher | Atlanta Police Department (APD), via the APD Open Data hub |
| Landing page | https://www.arcgis.com/home/item.html?id=774475034b694ce68b6d2e887aa96544 (hub: https://atlantapd.hub.arcgis.com/) |
| API | https://services3.arcgis.com/Et5Qfajgiyosiw4d/ArcGIS/rest/services/OpenDataWebsite_Crime_view/FeatureServer/0 |
| Fetched | 2026-07-17T23:49:42.723Z |
| License | **Not stated** — the AGOL item's `licenseInfo` field is blank (verified at fetch time) and APD's legacy open-data portal terms page is offline. The data is published publicly by APD on its ArcGIS Online hub; we attribute "Atlanta Police Department (APD)" and flag the absence of an explicit license here prominently. |
| Attribution | Atlanta Police Department (APD) via APD Open Data (atlantapd.hub.arcgis.com) |
| Records used | 295,360 (OccurredFromDate in NY-local window 2021-01-01 → 2026-06-30; dataset grand total 297,161) |
| Source caveat | Live layer refreshed continuously; classifications can change as investigations proceed |

### Timezone handling (disclosed)
`OccurredFromDate` epochs are **true UTC instants of America/New_York wall-clock times** — verified live: the layer's own `Day_of_the_week` field matches the NY-local rendering for 60/60 sampled rows, and the dataset minimum is exactly 2021-01-01 00:00 EST. All month binning uses NY-local month boundaries converted to UTC (DST-aware). The 2024-03 raw-month cross-check (a DST-transition month) re-verifies the convention end-to-end.

### Windowing (disclosed exclusions)
- Rows occurring on/after **2026-07-01** NY-local (partial month at fetch time): **1,801** excluded.
- Rows occurring before **2021-01-01** NY-local: **0** (the live view starts cleanly at 2021).
- Rows with **no OccurredFromDate**: **0**.
- Accounting: 295,360 + 1,801 + 0 + 0 = 297,161 (asserted in-script). The batch-1 scout measured junk 1015/2124 dates on APD layers; the live view's date bounds are clean, and the sanity window above would exclude any such rows regardless.

### Row grain (disclosed)
Rows are **offense-level** (one row per offense record; multi-offense incidents repeat their `ReportNumber`). Measured in the 2024-03 raw pull: 4,084 rows ↔ 3,982 distinct ReportNumbers → **×1.026 offense-per-incident inflation (~2.6%)**. We count records, consistent with the other cities in this repo, and disclose the grain here.

### Fields used
`OccurredFromDate` · `Crime_Against` · `NibrsUcrCode` · `NIBRS_Offense` · `StreetAddress` (block-level street address) · `NhoodName` (official neighborhood) · `NPU` · `Latitude`/`Longitude` · `ReportNumber`/`IncidentNumber` (grain measurement only).

### Category mapping (Crime_Against → cat)
The four distinct values below are exhaustive (verified live against the whole layer):

| Source value (verbatim) | cat | window count |
|---|---|--:|
| "Property" | `property` | 161,813 |
| "Society" | `society` | 53,907 |
| "Person" | `persons` | 42,383 |
| *(null — NibrsUcrCode `NOT_APPL`)* | `other` | 37,257 |

Rows with a **null `Crime_Against`** all carry `NibrsUcrCode = 'NOT_APPL'` (asserted in-script — any other value fails the run): APD's non-NIBRS/administrative bucket. They are mapped to `other`, labeled "Non-NIBRS / administrative (context)", and **never counted as NIBRS persons/property/society crime**.

### Coverage
- Placed (one of the 242 official neighborhoods, 2021-01…2026-06): **268,210** (90.8%)
- Unplaced: 27,150 = 23,762 in-span rows with a null `NhoodName` + 3,388 rows whose APD neighborhood name has no polygon in the official layer (below).
- Identity `placed + unplaced == citywide` validated per month × category in-script, **plus** one full month (2024-03) re-verified against a paged raw row pull.

### Incident neighborhood names with no official polygon (disclosed, kept in totals)
These APD-entered names do not appear in the 242-polygon official layer. They are **counted in every citywide figure** and disclosed as `unplacedBeats["unmatched-name"]` — never guessed onto the map:

| APD name | rows |
|---|--:|
| Historic Westin Heights/Bankhead | 2,425 |
| Baker Hills at Campbellton | 414 |
| West Cascade | 214 |
| Bonnybrook Estates | 103 |
| Emory | 97 |
| Continental Colony | 70 |
| Peyton Heights | 36 |
| Edmund Park | 19 |
| South Oakes at Cascade | 10 |

## Geometry source — official neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **neighborhood** — 242 polygons, official City of Atlanta neighborhoods with NPU letters |
| FeatureServer | https://services3.arcgis.com/Et5Qfajgiyosiw4d/ArcGIS/rest/services/neighborhood/FeatureServer/0 |
| License | Not stated on the AGOL item (blank `licenseInfo`, verified) — attributed to APD / City of Atlanta |
| Join key | `NhoodName` ↔ crime `NhoodName` — **exact identity** after trimming; 239/242 polygon names appear in the incident data (Bankhead, Englewood Manor, Midwest Cascade have polygons but no 2021+ named incidents under those exact names); the 9 unmatched incident names are tabled above |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Sibling legacy layers — probed and NOT used (disclosed)

| Layer | Finding |
|---|---|
| `2009_2020CrimeData/FeatureServer/0` | 366,824 rows but **Part 1 (COBRA) offenses only** — exactly 7 crime types (Larceny-From Vehicle, Larceny-Non Vehicle, Burglary, Auto Theft, Agg Assault, Robbery, Homicide). This is a fundamentally narrower taxonomy than the 2021+ full-NIBRS layer (which also carries drugs, fraud, simple assault, weapons, etc.); splicing them into one granular timeline would fabricate an apparent 2021 crime explosion. The layer's `Occur_Date` is also a **string** field with junk values (min "0220-11-01", literal "NULL"). |
| `Crime_Data_1997_2008/FeatureServer/0` | Legacy UCR extract (~579k rows, 1997–2008), same Part-1-style scope, string dates. |

Per the spec's probe-then-decide instruction, the granular era therefore honestly starts **2021-01**, and deep history comes from the FBI UCR series below. The legacy layers are cited here so the decision is reproducible.

## Real incident points (`points.json`)

Dots are **real offense locations published by APD** in the `Latitude`/`Longitude` fields (100% populated doubles). A small number of rows fall outside the city sanity box (lat 33.62–33.9, lng -84.56–-84.28) — **192 in-span rows (~0.07%)** are counted in every total but not plotted. Deterministic sample: every in-bbox row of each NY-local month fetched (OBJECTID order), even-stride ≤100/month → **6,600 points ≈ 1 per 45 of the 295,168 placeable rows**.

## Historical source — FBI UCR (1985–2018 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Atlanta Police Department — **ORI `GAAPD0000`** (verified live; the batch-spec's guess `GA0600100` resolves to **College Park PD** and was corrected) |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/GAAPD0000/violent-crime (and `/property-crime`) |
| Span | 1985–2018, annual Violent + Property (12 reported months verified per year) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set `FBI_API_KEY`) — raw responses cached under `data/atlanta-ga/raw/` |

**Dropped partial years (disclosed):** **2019** (violent 9/12, property 9/12 reported months), **2020** (violent 3/12, property 3/12 reported months) — an annual total cannot honestly be built from fewer than 12 reported months. These are APD's NIBRS-transition years.

**The 2019–2020 gap is real and disclosed:** APD's FBI submissions for 2019–2020 are partial and the APD open-data NIBRS layer starts 2021 — no honest citywide series exists for those two years, so they appear in neither era and are never interpolated.

UCR Summary (Violent/Property) is a **different taxonomy** than APD NIBRS categories — the eras are presented as distinct and are never equated. No monthly or neighborhood detail is implied for 1985–2018.

## Reproduce

```bash
FBI_API_KEY=… node pipeline/sources/atlanta-ga.mjs
```
