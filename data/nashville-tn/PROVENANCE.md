# Provenance — Nashville, TN

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **Metro Nashville Police Department Incidents** (hosted ArcGIS view, 2019-01-01 → current) |
| Publisher | Metropolitan Nashville Police Department (MNPD), via Nashville Open Data |
| Landing page | https://www.arcgis.com/home/item.html?id=d747436243e9439e968fce056545016a (portal: https://data.nashville.gov/) |
| API | https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Metro_Nashville_Police_Department_Incidents_view/FeatureServer/0 |
| Fetched | 2026-07-18T11:56:52.811Z |
| License | **Not stated** — the ArcGIS item's licenseInfo is empty. Attributed per the item's accessInformation: "Metro Nashville Police Department, Information Technology". Flagged prominently per the batch-1 contract. |
| Attribution | Metro Nashville Police Department via Nashville Open Data |
| Rows used | 906,703 offense×victim rows (local occurrence dates 2019-01-01 → 2026-06-30) → **744,956 counted incidents** |
| Source caveat | Refreshed continually; investigation status (incl. unfounded determinations) changes as cases proceed |

### ⚠ Offense×victim rows → incident dedupe (headline disclosure 1)
MNPD publishes **one row per offense × victim** within an incident (`Primary_Key` = `<Incident_Number>_<Offense_Number><Victim_Number>`). All counts shown are **incidents**, deduplicated on `Incident_Number`:

- 906,703 window rows → 750,423 incidents (×1.21 row inflation removed).
- The **representative row** is the incident's first-listed offense — lowest `Offense_Number`, then `Victim_Number`, then `OBJECTID` — a documented judgment call (MNPD publishes no severity hierarchy). Its offense code, status, coordinates, and occurrence date classify, gate, place, and bin the incident.
- Within-incident field variation vs the representative row (measured, disclosed): differing status 0, differing occurrence timestamp 0, differing coordinates 0 incidents.
- The layer also contains 146 duplicate `Primary_Key` rows (911,486 rows vs distinct keys) — harmless after incident dedupe, disclosed.

### ⚠ Unfounded exclusion (headline disclosure 2)
`Incident_Status_Code` "U — UNFOUNDED" incidents whose representative offense is a NIBRS crime category are **excluded from persons/property/society** per FBI UCR/NIBRS practice (unfounded complaints are removed from offense counts): **5,467 incidents excluded** (persons 651, property 2,853, society 1,963) — ≈0.7% of all incidents. The `other` context bucket has **no status filter**: "U" is the routine closing status of MNPD's administrative matrix records (e.g. 97% of POLICE INQUIRY rows), not a falsity finding. Caveat: unfounded determinations accumulate as investigations close, so very recent months may still contain reports that will later be unfounded — a small, time-varying, fully disclosed bias inherent to the source.

### Date field & timezone (verified)
`Incident_Occurred` (when the offense happened; `Incident_Reported` exists but is not used — the map animates occurrence). Timestamps are **true UTC instants** of local event times (dataset min = 2019-01-01 06:00Z = local CST midnight; the UTC hour-of-day low sits at 9–11Z = 4–5 AM local). **All month binning uses America/Chicago local time**; every local month boundary is queried back against the source as an exact UTC instant. The layer starts exactly at 2019-01-01 local (0 earlier rows, asserted; 0 null dates). Excluded and disclosed: **4,783** partial-month rows (local ≥ 2026-07-01; 4,136 incidents) — 2026-07 was in progress at fetch time.

### Report_Type enumeration (spec directive — none excluded)

| Report_Type | Source description | Window rows |
|---|---|--:|
| `D` | DISPATCHED | 738,620 |
| `S` | SUSPECT | 91,859 |
| `T` | *(none published)* | 59,045 |
| `W` | WITNESS | 9,792 |
| `O` | *(none published)* | 5,652 |
| `CIR` | *(none published)* | 1,582 |
| *(null)* | *(none published)* | 153 |

Determination: every value is a report-intake designation on offense×victim rows (the source's own descriptions where published: D = DISPATCHED, S = SUSPECT, W = WITNESS; `T`, `O`, `CIR`, and null carry **no source description**). None is a separate non-incident record class (no supplement/administrative report type), so **no Report_Type is excluded**; dedupe by `Incident_Number` collapses any multi-report duplication regardless.

### Fields used
`Incident_Number` · `Primary_Key` (dedupe audit) · `Offense_Number`/`Victim_Number` (representative-row order) · `Incident_Occurred` · `Offense_NIBRS` · `Offense_Description` (feed titles) · `Incident_Location` (feed places) · `Incident_Status_Code` · `Latitude`/`Longitude` · `Report_Type` (enumeration). `Zone`/`RPA` are numeric codes, ~61% null (the batch-1 scout note said fully null — measured 38.8% populated), with no published name mapping — not used; placement is a spatial join (below).

### Category mapping (Offense_NIBRS → cat)
MNPD reports through **TIBRS** (Tennessee's NIBRS program). Group A codes map to the FBI crimes-against categories; `13D` Stalking is a Tennessee Group A crime-against-person code (in-data descriptions are all stalking offenses). Group B 90-series codes (no crimes-against category), `09C` justifiable homicide ("not a crime" per NIBRS), MNPD local 600/700/800-series administrative "matrix" codes (police inquiry, lost/found property, deaths, overdose, …), and null codes → `other`, labeled "Non-NIBRS local / Group B (context)", **never counted as NIBRS crime**.

| cat | Counted incidents |
|-----|------------------:|
| `persons` | 126,492 |
| `property` | 287,691 |
| `society` | 27,463 |
| `other` | 303,310 |

#### Full code table (window counts at fetch time)

| Code | Offense | cat | Rows | Counted incidents (representative) |
|------|---------|-----|-----:|-----------------------------------:|
| `740` | Police Inquiry / Transport (MNPD local, non-NIBRS) | `other` | 194,996 | 190,711 |
| `23F` | Theft From Motor Vehicle | `property` | 78,405 | 59,783 |
| `13B` | Simple Assault | `persons` | 77,086 | 64,937 |
| `290` | Destruction / Damage / Vandalism | `property` | 55,695 | 34,006 |
| `13A` | Aggravated Assault | `persons` | 40,614 | 30,722 |
| `23C` | Shoplifting | `property` | 36,298 | 35,266 |
| `13C` | Intimidation | `persons` | 33,034 | 28,392 |
| `715` | Found Property (MNPD local, non-NIBRS) | `other` | 32,460 | 22,384 |
| `240` | Motor Vehicle Theft | `property` | 31,815 | 27,889 |
| `810` | Lost Property (MNPD local, non-NIBRS) | `other` | 31,667 | 31,062 |
| `220` | Burglary / Breaking & Entering | `property` | 29,430 | 22,972 |
| `520` | Weapon Law Violation | `society` | 28,622 | 4,274 |
| `780` | Recovery of Stolen Property (MNPD local, non-NIBRS) | `other` | 28,033 | 24,551 |
| `23H` | All Other Larceny | `property` | 25,141 | 22,409 |
| `35A` | Drug / Narcotic Violation | `society` | 24,414 | 18,261 |
| `23D` | Theft From Building | `property` | 21,004 | 18,168 |
| `26A` | False Pretenses / Swindle | `property` | 16,725 | 14,570 |
| `35B` | Drug Equipment Violation | `society` | 15,172 | 4,202 |
| `26B` | Credit Card / ATM Fraud | `property` | 14,272 | 12,697 |
| `120` | Robbery | `property` | 13,610 | 9,694 |
| `23G` | Theft of Motor Vehicle Parts | `property` | 12,835 | 12,206 |
| `90Z` | All Other Offenses (Group B) | `other` | 9,089 | 8,166 |
| `90F` | Family Offense, Nonviolent (Group B) | `other` | 6,266 | 5,026 |
| `26C` | Impersonation | `property` | 5,752 | 5,374 |
| `685` | Death — Natural (MNPD local, non-NIBRS) | `other` | 4,959 | 4,943 |
| `250` | Counterfeiting / Forgery | `property` | 3,788 | 1,992 |
| `90J` | Trespass of Real Property (Group B) | `other` | 3,405 | 2,475 |
| `850` | Protection Order Violation (MNPD local, non-NIBRS) | `other` | 3,391 | 2,844 |
| `23A` | Pocket-Picking | `property` | 3,072 | 2,828 |
| `735` | Civil Case (MNPD local, non-NIBRS) | `other` | 2,801 | 1,758 |
| `270` | Embezzlement | `property` | 2,700 | 2,649 |
| `26E` | Wire Fraud | `property` | 2,586 | 2,405 |
| `760` | Overdose (MNPD local, non-NIBRS) | `other` | 2,482 | 2,318 |
| `680` | Death — Unnatural / Accidental (MNPD local, non-NIBRS) | `other` | 2,076 | 2,026 |
| `210` | Extortion / Blackmail | `property` | 1,719 | 1,632 |
| `620` | Accidental Injury (MNPD local, non-NIBRS) | `other` | 1,663 | 1,568 |
| `100` | Kidnapping / Abduction | `persons` | 1,610 | 654 |
| `13D` | Stalking (TIBRS Tennessee Group A code) | `persons` | 1,330 | 1,183 |
| `695` | Unknown Death (MNPD local, non-NIBRS) | `other` | 1,293 | 1,265 |
| `690` | Suicide (MNPD local, non-NIBRS) | `other` | 1,014 | 996 |
| `200` | Arson | `property` | 636 | 450 |
| `09A` | Murder & Nonnegligent Manslaughter | `persons` | 620 | 580 |
| `90C` | Disorderly Conduct (Group B) | `other` | 433 | 360 |
| `370` | Pornography / Obscene Material | `society` | 417 | 382 |
| `90A` | Bad Checks (Group B) | `other` | 324 | 323 |
| `40A` | Prostitution | `society` | 269 | 237 |
| `23E` | Theft From Coin-Operated Machine | `property` | 265 | 232 |
| `90D` | Driving Under the Influence (Group B) | `other` | 263 | 247 |
| `26G` | Hacking / Computer Invasion | `property` | 243 | 211 |
| `23B` | Purse-Snatching | `property` | 242 | 216 |
| `90E` | Drunkenness (Group B) | `other` | 158 | 119 |
| `280` | Stolen Property Offense | `property` | 74 | 24 |
| `09C` | Justifiable Homicide (not a crime per NIBRS) | `other` | 72 | 69 |
| `(null)` | No offense code published | `other` | 67 | 50 |
| `39C` | Gambling Equipment Violation | `society` | 63 | 30 |
| `40C` | Purchasing Prostitution | `society` | 51 | 35 |
| `40B` | Assisting / Promoting Prostitution | `society` | 29 | 18 |
| `90G` | Liquor Law Violation (Group B) | `other` | 28 | 20 |
| `11A` | Rape | `persons` | 22 | 16 |
| `700` | Escape (MNPD local, non-NIBRS) | `other` | 18 | 15 |
| `39B` | Operating / Promoting Gambling | `society` | 18 | 14 |
| `39A` | Betting / Wagering | `society` | 13 | 9 |
| `730` | Indecent Exposure (MNPD local, non-NIBRS) | `other` | 11 | 11 |
| `26D` | Welfare Fraud | `property` | 10 | 8 |
| `26F` | Identity Theft | `property` | 9 | 4 |
| `510` | Bribery | `property` | 7 | 6 |
| `64B` | Human Trafficking — Involuntary Servitude | `persons` | 6 | 6 |
| `790` | Riot — Inciting (MNPD local, non-NIBRS) | `other` | 4 | 2 |
| `11B` | Sodomy | `persons` | 2 | 0 |
| `39D` | Sports Tampering | `society` | 2 | 1 |
| `09B` | Negligent Manslaughter | `persons` | 2 | 2 |
| `90H` | Peeping Tom (Group B) | `other` | 1 | 1 |

### Placement = spatial join of REAL coordinates (headline disclosure 3)
The crime file names no precinct. Every counted incident with usable published coordinates is assigned by **point-in-polygon** (even-odd ray casting across all rings — the MADISON precinct carries an interior ring) into the **9 official MNPD Police Precinct Boundaries** polygons. Coordinates are MNPD's published `Latitude`/`Longitude` values, **rounded by the source to ~2–3 decimal places** (≈100 m–1 km block grain) — real published data, coarse by design, disclosed; a rounded point near a boundary can sit on the wrong side of a precinct line.

- Placed: **734,327** (98.6%)
- Unplaced — no/zero coordinates: 9,812 · outside the county bbox: 21 · inside the bbox but outside all 9 polygons: 796 — total 10,629, **counted in every citywide total** and disclosed, never guessed onto the map.
- Identity `placed + unplaced == citywide counted` validated per month × category in-script, **and** the client-side full pull is reconciled against the source: per-local-month server row counts AND server distinct-`Incident_Number` counts (90 × 2 queries, exact UTC month-boundary instants) all match exactly; Σ monthly distinct incidents = 750,423 incidents + 0 cross-month memberships (incidents whose rows straddle a month boundary); server-side grouped `Offense_NIBRS` row totals match the client tally code-for-code.
- Coordinate gate: lat 35.96–36.41, lng -87.06–-86.51 — **wider than the batch-1 scout bbox** (35.98–36.41 / −87.05…−86.52), which would clip the county corners (official precinct extent reaches lat 35.9678 / lng −87.0549 / −86.5116). Measured deviation, documented.

## Geometry source — official precinct polygons

| Field | Value |
|-------|-------|
| Dataset | **Police Precinct Boundaries** — 9 polygons, field `PrecinctName` (official MNPD layer, same Nashville Open Data org) |
| FeatureServer | https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Police_Precinct_Boundaries_view/FeatureServer/0 |
| License | not stated — attributed to Metro Nashville Police Department / Nashville Open Data |
| Join | point-in-polygon of published incident coordinates (above) |
| Centroids | Area-weighted centroid across outer rings (shoelace formula) — for symbol placement only |
| Region count | **Only 9 regions** (CENTRAL, EAST, HERMITAGE, MADISON, MIDTOWN HILLS, NORTH, SOUTH, SOUTHEAST, WEST) — leaderboard topN stays 6; quiz unaffected |

## Real incident points (`points.json`)
One dot per placed counted incident (representative row), coordinates exactly as published by MNPD (**source-rounded to ~2–3 decimals** — block-ish grain; a handful of same-block incidents can stack on identical coordinates). 10,629 counted incidents (~1.4%) have no usable location and are counted but not plotted. Deterministic even-stride sample across each full month: **9,000 points ≈ 1 per 82 of the 734,327 placed incidents**.

## Dispatch feed (`feed.json`)
10 real items per quarter, slots allocated across categories in proportion to the quarter's validated counted-incident mix (largest remainder, deterministic — no seriousness bias). Items are real offense records fetched in `OBJECTID` order (one per incident per slot pool, PIP-placed, Group-A slots exclude unfounded rows); titles/places are the source's `Offense_Description`/`Incident_Location` (title-cased), dates are local occurrence dates.

## Historical source — FBI UCR (1985–2018 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Metropolitan Nashville Police Department — **ORI `TN0190100`** (verified: returns the "Metropolitan Nashville Police Department Offenses" series) |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/TN0190100/violent-crime (and `/property-crime`) |
| Span | 1985–2018, annual Violent + Property (12 reported months verified per year) — no partial years |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set `FBI_API_KEY` or `.secrets/fbi_api_key`) |

The CDE response carries both an "… Offenses" and an "… Clearances" series — the script matches the **Offenses** series explicitly and gates on a plausible 1985 violent-crime total (fetched: 3,376). UCR Summary (Violent/Property) is a **different taxonomy** than MNPD NIBRS/TIBRS — the eras are presented as distinct and bridge at 2019; they are never equated. No monthly or precinct detail is implied for 1985–2018. Raw responses cached under `data/nashville-tn/raw/`.

## Long-arc trend (`trend.json`) — citywide incident-era annuals

The incident-era annual totals in `trend.json` are **citywide, queried straight
from the source**: `COUNT(DISTINCT Incident_Number)` per Nashville-local year
(2019–2025), minus incidents recorded Unfounded on a NIBRS Group A code (the
same FBI convention the granular timeline applies) — NOT the sum of the
timeline's placed cells. Measured at the source (2026-07-19): the share of
counted incidents **without usable published coordinates grows across the era**
— 0.0–0.8% in 2019–2021, 1.4–1.7% in 2022–2024, **2.5% in 2025** — so
placed-only annuals flipped the era's peak (placed peaks 2024: 105,071 >
104,905; **citywide peaks 2023: 106,719 > 106,445**) and overstated the
2024→2025 decline (−9.3% placed-only vs **−8.2% citywide**). Fixed 2026-07-19
with server-side distinct-incident counts (verified to match the timeline's
placed+unplaced counted totals within 0.06% every year). The map/counter
chapters still use the placed timeline (98.6% coverage, disclosed on screen).
Rebuild: `node pipeline/build-trend.mjs nashville-tn`.

## Reproduce

```bash
FBI_API_KEY=… node pipeline/sources/nashville-tn.mjs
node pipeline/build-trend.mjs nashville-tn
```
