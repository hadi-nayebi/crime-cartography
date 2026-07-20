# Provenance — Detroit, MI

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **RMS Crime Incidents** (2017-present) |
| Publisher | Detroit Police Department (DPD), via the City of Detroit Open Data Portal |
| Landing page | https://data.detroitmi.gov/datasets/rms-crime-incidents (portal: https://data.detroitmi.gov/) |
| API | https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/RMS_Crime_Incidents/FeatureServer/0 |
| Fetched | 2026-07-17T23:49:23.509Z |
| License | **Not stated** on the dataset item — used under the portal's public open-data publication; attribution "Detroit Police Department (DPD) via City of Detroit Open Data Portal" |
| Records used | 733,923 incidents (799,080 offense-level rows, deduplicated — see below) |
| Source caveat | Refreshed daily; classifications can change as investigations proceed |

### Offense-level rows → incidents (dedupe, disclosed)
The layer publishes **offense-level rows**: one police report (incident) can appear as several rows — additional offenses on the same report and outright duplicate rows. Following the dataset's own `report_number` key:

- 799,080 in-window offense rows → **733,923 distinct incidents** (dedupe by `report_number`, ×1.089 row inflation)
- Kept row per report = deterministic minimum by (`incident_occurred_at`, `crime_id`, `ESRI_OID`); its category/neighborhood/coordinates represent the incident
- 58,881 reports had >1 row; 37,474 spanned crime categories, 72 spanned neighborhoods, 6 spanned months (binned at the earliest row)
- **Independent reconciliation:** the server's `COUNT(DISTINCT report_number)` equals the client-side dedupe **for every one of the 114 months and globally** — validated in-script on every run

### Time semantics (verified, disclosed)
`incident_occurred_at` stores **true UTC instants**: converting with the America/Detroit timezone reproduces the source's own local `incident_time` field exactly (verified on EST and EDT samples). All month binning uses **Detroit local time**, and every server-side month query uses the matching UTC boundary for local midnight (DST-aware). Per the source's field description, when an incident occurred over a period the timestamp is the **beginning** of that period.

### Windowing (disclosed exclusions)
Dataset grand total 811,047 rows =
- **799,080 in-window rows** (occurred 2017-01-01 → 2026-06-30, Detroit local time) — used
- **8,409 pre-2017 rows** — junk/straggler occurred-dates back to 1915 in a dataset framed as 2017-present; excluded and disclosed
- **3,558 partial-month rows** (occurred on/after 2026-07-01 local, partial month at fetch time) — excluded and disclosed
- **0 null-date rows**

### Fields used
`incident_occurred_at` · `offense_category` · `offense_description` · `state_offense_code` (inspected) · `report_number` · `crime_id` · `neighborhood` (official name) · `police_precinct` (inspected) · `nearest_intersection` · `latitude`/`longitude`.

### Category mapping (offense_category → cat), in full
DPD's RMS categories carry no native NIBRS crimes-against flag, so each `offense_category` is mapped once, following the **NIBRS crimes-against convention** (robbery counts against **property**; Group-B-style offenses count against **society**; non-crimes and unclassifiable buckets go to `other`). The 32 values below are exhaustive (any new value fails the run loudly). Counts are deduped incidents (kept rows) in the window:

| offense_category (verbatim) | cat | incidents |
|---|---|--:|
| ASSAULT | `persons` | 139,770 |
| AGGRAVATED ASSAULT | `persons` | 69,871 |
| HOMICIDE | `persons` | 2,120 |
| SEXUAL ASSAULT | `persons` | 6,239 |
| SEX OFFENSES | `persons` | 9,658 |
| KIDNAPPING | `persons` | 1,303 |
| ROBBERY | `property` | 15,520 |
| LARCENY | `property` | 112,057 |
| BURGLARY | `property` | 51,893 |
| STOLEN VEHICLE | `property` | 68,690 |
| STOLEN PROPERTY | `property` | 16,333 |
| DAMAGE TO PROPERTY | `property` | 90,482 |
| FRAUD | `property` | 64,938 |
| FORGERY | `property` | 1,847 |
| EXTORTION | `property` | 545 |
| ARSON | `property` | 5,483 |
| WEAPONS OFFENSES | `society` | 26,321 |
| DANGEROUS DRUGS | `society` | 11,643 |
| OUIL | `society` | 2,376 |
| LIQUOR | `society` | 623 |
| GAMBLING | `society` | 15 |
| SOLICITATION | `society` | 73 |
| DISORDERLY CONDUCT | `society` | 2,241 |
| OBSTRUCTING THE POLICE | `society` | 8,075 |
| OBSTRUCTING JUDICIARY | `society` | 9,350 |
| HEALTH AND SAFETY | `society` | 284 |
| FAMILY OFFENSE | `society` | 4,837 |
| INVASION OF PRIVACY -OTHER | `society` | 1,016 |
| RUNAWAY | `other` | 5,969 |
| MISCELLANEOUS | `other` | 2,349 |
| OTHER | `other` | 1,797 |
| JUSTIFIABLE HOMICIDE | `other` | 205 |

Mapping rationale for the judgment calls:
- **ROBBERY → `property`** — NIBRS classifies robbery as a crime against property.
- **SEX OFFENSES / SEXUAL ASSAULT → `persons`** — NIBRS classifies sex offenses as crimes against persons.
- **OBSTRUCTING THE POLICE / OBSTRUCTING JUDICIARY / OUIL / DISORDERLY CONDUCT / LIQUOR / FAMILY OFFENSE / HEALTH AND SAFETY / SOLICITATION / INVASION OF PRIVACY -OTHER → `society`** — Group-B-style offenses; NIBRS treats Group B offenses as crimes against society.
- **JUSTIFIABLE HOMICIDE → `other`** — not a crime in NIBRS.
- **RUNAWAY → `other`** — status offense, not a crime.
- **MISCELLANEOUS / OTHER → `other`** — unclassifiable source buckets, kept as context only.

`other` is labeled "Other / non-criminal (context)" and is never counted as persons/property/society crime.

### Coverage
- Placed (one of the 205 official neighborhoods): **727,483** (99.1%)
- Unplaced: 6,440 incidents whose kept row has a null `neighborhood` — counted in every total and disclosed, never dropped.
- Identity `placed + unplaced == citywide` validated per month × category in-script, on top of the independent server-side distinct-count reconciliation above.

## Geometry source — official neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **Current City of Detroit Neighborhoods** — 205 polygons, official city neighborhoods |
| FeatureServer | https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/Current_City_of_Detroit_Neighborhoods/FeatureServer/0 |
| License | Not stated on the item — City of Detroit Open Data Portal; attributed to the City of Detroit |
| Join key | `nhood_name` ↔ crime `neighborhood` — **exact identity**: all 205 distinct incident values match all 205 polygon names verbatim (verified live); the only unmatched incident value is null (disclosed as no-neighborhood) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (`points.json`)

Dots are **real incident locations published by DPD** in the `latitude`/`longitude` fields (DPD anonymizes to the `nearest_intersection` grain). One dot per deduped incident. **801 incidents (~0.1%) have no usable coordinates** (null lat/lng) and are counted in every total but not plotted; zero in-window rows fall outside the city bounding box (lat 42.25–42.46, lng -83.29–-82.91). Deterministic sample: incidents sorted by (occurred-at, crime_id), even-stride ≤100/month → **11,400 points ≈ 1 per 64 of the 733,122 placeable incidents**.

## Historical source — FBI UCR (1985–2016 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Detroit Police Department — **ORI `MI8234900`** (verified live: full series returned) |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/MI8234900/violent-crime (and `/property-crime`) |
| Span | 1985–2016, annual Violent + Property (12 reported months verified per year) |
| Series | The CDE returns both "Offenses" and "Clearances" series for this agency — the **Offenses** series is used (matched explicitly) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set `FBI_API_KEY`) |

Raw CDE responses are cached under `data/detroit-mi/raw/`. UCR Summary (Violent/Property) is a **different taxonomy** than DPD RMS offense categories — the eras are presented as distinct and bridge at 2017; they are never equated. No monthly or neighborhood detail is implied for 1985–2016.

## Reproduce

```bash
FBI_API_KEY=… node pipeline/sources/detroit-mi.mjs
```

## Long-arc trend — placed-share audit (verified 2026-07-19)

Incident-era annuals (2017–2025) are sums of the timeline's placed cells
(deduped incidents with a neighborhood). Measured at the source with
COUNT(DISTINCT report_number) per local year, total vs null-neighborhood:
placed share 98.45–99.40% (low years: 2017 = 98.92%, 2024 = 98.80%, 2025 =
98.45%), drift ≤0.95 pp; replication exact mod ≤16-record post-fetch revisions.
Story check: 2017→2025 = −4.51% placed vs −4.05% citywide (same shape).
Certified immaterial; not rebuilt.
