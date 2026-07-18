# Provenance — Denver, CO

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — offense records

| Field | Value |
|-------|-------|
| Dataset | **Crime** (ODC_CRIME_OFFENSES_P, layer 324) |
| Publisher | Denver Police Department, via Denver Open Data Catalog (City and County of Denver) |
| Landing page | https://www.arcgis.com/home/item.html?id=1e080d3ce2ae4e2698745a0d02345d4a (portal: https://opendata-geospatialdenver.hub.arcgis.com/) |
| API | https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_CRIME_OFFENSES_P/FeatureServer/324 |
| Fetched | 2026-07-17T23:50:55.731Z |
| License | Custom City and County of Denver use constraints — **verbatim text below** |
| Attribution | Denver Police Department via Denver Open Data Catalog, City and County of Denver |
| Rows used | 370,339 offense rows → **346,864 incidents** after dedupe (layer grand total 370,339; IS_CRIME=1 filter applied — a no-op on this layer, which contains only crimes: 0 rows excluded) |
| Source caveat | Updated Mon–Fri; records are dynamic — added, deleted, and modified as investigations proceed ("Crimes that occurred at least 30 days ago tend to be the most accurate") |

### License (pulled verbatim from the hub item `licenseInfo` at fetch time)

> USE CONSTRAINTS — The City and County of Denver is not responsible and shall not be liable to any user or recipient for damages of any kind arising out of the use of data or information provided by the City and County of Denver, including the installation of the data or information, its use, or the results obtained from its use. ANY DATA OR INFORMATION PROVIDED BY THE City and County of Denver IS PROVIDED AS IS WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESSED OR IMPLIED, AND THE RECIPIENT HEREBY WAIVES ANY AND ALL SUCH WARRANTIES, INCLUDING, BUT NOT LIMITED TO, ANY WARANTY AS TO THE ACCURACY OR COMPLETENESS OF THE INFORMATION AND THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. Data or information provided by the City and County of Denver shall be used and relied upon only at the user's sole risk, and the user agrees to indemnify and hold harmless the City and County of Denver, its officials, officers and employees from any liability arising out of the use, reproduction or dissemination of the data/information provided. NOT FOR ENGINEERING PURPOSES.

### Rolling window (disclosed)

The source publishes a **rolling window**, per the item description (verbatim): "This dataset includes criminal offenses in the City and County of Denver for the previous five calendar years plus the current year to date." At fetch time that window is **2021-01-01 → current** (verified live: minimum FIRST_OCCURRENCE_DATE is exactly 2021-01-01; 0 rows earlier). Consequences:

- The granular era is 2021-01 … 2026-06 (66 months); **2026-07 is a partial month** at fetch time — **2,138 incidents excluded and disclosed**.
- Earlier years cannot be rebuilt from this source later — the window slides. Deep history (1985–2020) comes from the FBI UCR era below, citywide-annual only.
- A re-run in a later year will produce a *different* window; `raw/hub-item.json` snapshots the item as fetched.

### Sex-related crimes are ABSENT from the source (disclosed prominently)

The published point-level dataset contains **no sexual-assault offense category** — the 13 `OFFENSE_CATEGORY_ID` values enumerated below are exhaustive (verified live). The City and County of Denver publishes sex-related crimes only as a separate **aggregated** dataset ("Crime - Sex Related Crimes (aggregated)", no per-incident locations), and the item description states "Certain information is omitted, in accordance with legal requirements". Totals here therefore **undercount crimes against persons** relative to citywide reality, and no sex-crime incidents appear on the map. The FBI UCR history era (which includes rape in its Violent index) is a different taxonomy and is never equated with this era.

### Date field choice (disclosed)

The layer publishes `FIRST_OCCURRENCE_DATE`, `LAST_OCCURRENCE_DATE`, and `REPORTED_DATE`. **We use `FIRST_OCCURRENCE_DATE`** — the map animates *when offenses (first) happened*, not when paperwork was filed. 0 null dates; 0 rows predate the window (the source itself filters on this field). Client epoch→month conversion is verified against server-side `EXTRACT()` grouping (exact match, all cats × months).

### Grain and dedupe (disclosed)

The source is **offense-level**: one row per offense within an incident (`OFFENSE_ID` = `INCIDENT_ID` + offense code). We **dedupe by `INCIDENT_ID`** so every on-screen count is an **incident** count: 370,339 offense rows → 346,864 incidents (23,475 extra offense rows, ×1.068 inflation removed). Representative offense per incident (deterministic): highest category priority **persons > property > society > other**, tie-broken by lowest `OFFENSE_ID` — an incident that includes any crime against a person counts as `persons`. 14,092 incidents span more than one mapped category; 0 span more than one `NEIGHBORHOOD_ID` value (the representative row's value is used); 0 extra month-appearances from incidents whose offense rows carry different first-occurrence months.

Reconciliation against independent server-side queries, all exact:
- offense grain: server grouped count per category × year × month == client tally (67 months × 4 cats);
- incident grain: server `COUNT(DISTINCT INCIDENT_ID)` == client, **overall and for every month**;
- placed + unplaced == citywide, per category per month.

### Fields used

`INCIDENT_ID` · `OFFENSE_ID` · `FIRST_OCCURRENCE_DATE` · `OFFENSE_CATEGORY_ID` · `OFFENSE_TYPE_ID` · `INCIDENT_ADDRESS` (block-level, e.g. "3000 BLK STOUT ST") · `GEO_LAT`/`GEO_LON` · `NEIGHBORHOOD_ID` (official statistical-neighborhood slug) · `IS_CRIME`.

### Category mapping (OFFENSE_CATEGORY_ID → cat) — documented in full

Denver publishes offense **categories**, not native NIBRS crimes-against groups; each category is mapped to the NIBRS crimes-against group of the offenses it contains. The 13 values below are exhaustive (verified live):

| Source category | cat |
|---|---|
| `murder` | `persons` |
| `aggravated-assault` | `persons` |
| `other-crimes-against-persons` | `persons` |
| `robbery` | `property` |
| `burglary` | `property` |
| `larceny` | `property` |
| `theft-from-motor-vehicle` | `property` |
| `auto-theft` | `property` |
| `arson` | `property` |
| `white-collar-crime` | `property` |
| `drug-alcohol` | `society` |
| `public-disorder` | `society` |
| `all-other-crimes` | `other` |

Notes: **robbery** maps to `property` because NIBRS classifies robbery as a crime against property. **public-disorder** (criminal mischief, disorderly conduct, weapons, prostitution…) maps to `society` as the closest crimes-against-society bucket, though it contains some persons-adjacent types (e.g. harassment) — the mapping is at category grain, coarser than NIBRS offense-level assignment. **all-other-crimes** is a mixed catch-all (criminal trespass, traffic-related criminal offenses, probation violations…) mapped to `other` ("All-other-crimes (mixed, context)") and never counted as persons/property/society.

Window totals at incident grain: persons 30,034 · property 214,009 · society 67,337 · other 33,346 (offense-row grain for comparison: 30,860 / 217,188 / 77,450 / 44,841).

### Coverage

- Placed (one of the 78 official statistical neighborhoods, 2021-01…2026-06): **344,388** (99.9%)
- Unplaced: 338 incidents with a null `NEIGHBORHOOD_ID` — kept in every citywide total and disclosed.
- Excluded & disclosed: 2,138 incidents in partial month 2026-07.

## Geometry source — official neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **ODC_ADMN_NEIGHBORHOOD_A** (layer 13) — 78 official statistical neighborhoods |
| FeatureServer | https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_ADMN_NEIGHBORHOOD_A/FeatureServer/13 |
| License | Same publisher and use constraints as the crime dataset (City and County of Denver) |
| Join key | `slugify(NBHD_NAME)` ↔ crime `NEIGHBORHOOD_ID` — **exact 78/78 both directions** (lowercase, non-alphanumeric runs → hyphen); the only unmatched incident value is null (disclosed as no-neighborhood) |
| Display names | `NBHD_NAME` verbatim from the polygon layer (proper names residents use, e.g. "Capitol Hill", "Five Points", "CBD") |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (`points.json`)

Dots are **real offense locations published by DPD** (`GEO_LAT`/`GEO_LON`; addresses are block-level, e.g. "3000 BLK STOUT ST"). **178 in-window incidents have missing or out-of-city coordinates** — counted in every total, never plotted. Client-side gate: lat 39.61–39.92, lng -105.11–-104.6. Deterministic sample: even-stride ≤100/month over each month's placeable incidents → **6,600 points ≈ 1 per 52 of the 344,548 placeable incidents**.

## Historical source — FBI UCR (1985–2020 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Denver Police Department — **ORI `CODPD0000`** (⚠ NOT `CO0160000`: that ORI is the Denver County **Sheriff's Office** and returns an empty series — verified via the CDE state agency list) |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/CODPD0000/violent-crime (and `/property-crime`) |
| Span | 1985–2020, annual Violent + Property (12 reported months verified per year) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set `FBI_API_KEY`) |

All 36 years in the span reported 12 months for both series — no years dropped.

Raw responses are cached under `data/denver-co/raw/`. UCR Summary (Violent/Property) is a **different taxonomy** than DPD offense categories — the eras are presented as distinct and bridge at 2021; they are never equated. No monthly or neighborhood detail is implied for 1985–2020. Note: UCR Violent *includes* rape, which the granular era's source omits — one more reason the eras must never be compared directly.

## Reproduce

```bash
FBI_API_KEY=… node pipeline/sources/denver-co.mjs
```
