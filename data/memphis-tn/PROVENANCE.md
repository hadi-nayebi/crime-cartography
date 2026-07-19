# Provenance — Memphis, TN

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **MPD Public Safety Incidents** |
| Publisher | Memphis Police Department (MPD), via the City of Memphis Open Data Hub |
| Landing page | https://www.arcgis.com/home/item.html?id=12b51ce4d5a14493ab6cc05d32e0c1ee (hub: https://data.memphistn.gov/) |
| API | https://services2.arcgis.com/saWmpKJIUAjyyNVc/arcgis/rest/services/MPD_Public_Safety_Incidents/FeatureServer/0 |
| Fetched | 2026-07-18T11:53:03.601Z |
| License | **Not stated** on the dataset item — used under the city's public open-data publication; attribution "Memphis Police Department via City of Memphis Open Data Hub" |
| Records used | 569,063 incidents (632,453 offense-level rows, deduplicated — see below) |
| Source caveat | Updated each morning by 6:00 am; classifications can change as investigations proceed |

### ⚠ Source omissions (disclosed prominently)
The dataset item description states, verbatim: *"This dataset contains all crime incidents where a police report was taken. Data goes back to 2019 and is updated each morning by 6:00 am. **Note that sex crimes and juvenile-specific crime types are omitted from this dataset.**"* — Memphis totals shown from this source therefore **exclude sex crimes and juvenile-specific crime types** (there is no rape/sex-offense UCR category anywhere in the layer). This is an MPD publishing decision, not a pipeline choice, and it is disclosed on-screen via `summary.sourceOmissions`. Note also: despite the blurb's "back to 2019", the layer's earliest `Offense_Datetime` is exactly **2020-01-01 00:00 Memphis local time** (measured live; the older 2006+ public dataset was retired) — the granular era therefore starts 2020-01.

### Offense-level rows → incidents (dedupe, disclosed)
The layer publishes **offense-level rows**: one incident (`Crime_ID`) can appear as several rows — one per offense on the report (e.g. one FRAUD incident with both IMPERSONATION and CREDIT CARD/ATM FRAUD offense rows). Following the dataset's own `Crime_ID` key:

- 632,453 in-window offense rows → **569,063 distinct incidents** (dedupe by `Crime_ID`, ×1.111 row inflation)
- Kept row per incident = deterministic minimum by (`Offense_Datetime`, `ObjectId`); its category/precinct/coordinates represent the incident
- 55,564 incidents had >1 row; 34,118 spanned crime categories, 0 spanned precincts, 0 spanned months (binned at the earliest row)
- **Independent reconciliation:** the server's `COUNT(DISTINCT Crime_ID)` equals the client-side dedupe **for every one of the 78 months and globally** — validated in-script on every run

### Time semantics (verified, disclosed)
`Offense_Datetime` stores **true UTC instants**: the dataset begins exactly at 2020-01-01T06:00:00Z (= 2020-01-01 00:00 CST) and the hour-of-day histogram dips at 10:00Z = 4–5 AM Memphis local (the universal overnight crime lull) — both incompatible with "local time stored as UTC". All month binning uses **Memphis local time (America/Chicago)**, and every server-side month query uses the matching UTC boundary for local midnight (CST/CDT aware). We bin by `Offense_Datetime` (when the offense happened), not `Reported_Datetime`.

### Windowing (disclosed exclusions)
Dataset grand total 635,371 rows =
- **632,453 in-window rows** (occurred 2020-01-01 → 2026-06-30, Memphis local time) — used
- **0 pre-2020 rows** (none exist — the layer starts exactly at 2020-01-01 local midnight)
- **2,844 partial-month rows** (occurred on/after 2026-07-01 local; 2026-07 was in progress at fetch time) — excluded and disclosed
- **74 null-date rows** — excluded and disclosed

### Fields used
`Offense_Datetime` · `Crime_ID` · `UCR_Category` / `UCR_Description` · `NIBRS_Group` (A/B) · `NIBRS_Offense_Group` (native crimes-against) · `Precinct` (station name) · `Latitude`/`Longitude` (~3-decimal block-level) · `Street_Address` (block-level address).

### Category mapping (NIBRS_Offense_Group → cat; UCR_Category × NIBRS_Group documented in full)
The source carries a **native NIBRS crimes-against field** (`NIBRS_Offense_Group`) plus the offense's NIBRS Group (A/B) — each incident is mapped by its own crimes-against value, keyed by trimmed string (several source values carry trailing spaces): CRIMES AGAINST PERSONS/PERSON → `persons`, CRIMES AGAINST PROPERTY → `property`, CRIMES AGAINST SOCIETY → `society`, and "PERSON, PROPERTY, OR SOCIETY" (the Group B **ALL OTHER OFFENSES** catch-all, which NIBRS itself does not assign to one bucket) → `other`. Verified live: each `UCR_Category` maps to exactly one (`NIBRS_Offense_Group`, `NIBRS_Group`) pair across the whole layer; any new value fails the run loudly. One single row in the layer (`UCR_Incident_Code` 850) has null classification fields → `other`, shown as "(unclassified)" below. Counts are deduped incidents (kept rows) in the window:

| UCR_Category (verbatim, trimmed) | NIBRS_Group | cat | incidents |
|---|---|---|--:|
| LARCENY/THEFT | A | `property` | 160,265 |
| ASSAULT | A | `persons` | 121,280 |
| DEST/DAM/VAND OF PROPERTY | A | `property` | 76,305 |
| MOTOR VEHICLE THEFT | A | `property` | 51,892 |
| AGGRAVATED ASSAULT | A | `persons` | 37,707 |
| BURG/BREAK & ENTER | A | `property` | 33,079 |
| FRAUD | A | `property` | 19,291 |
| DRUG/NARCOTIC | A | `society` | 17,562 |
| WEAPON LAW VIOLATION | A | `society` | 12,690 |
| ROBBERY | A | `property` | 12,054 |
| COUNTERFEITING/FORGERY | A | `property` | 4,235 |
| KIDNAPPING/ABDUCTION | A | `persons` | 2,946 |
| TRESPASS OF REAL PROPERTY | B | `society` | 2,790 |
| EMBEZZLEMENT | A | `property` | 2,514 |
| ALL OTHER OFFENSES | B | `other` | 2,299 |
| STOLEN PROPERTY | A | `property` | 2,204 |
| ARSON | A | `property` | 2,172 |
| DRIVING UNDER THE INFLUENCE | B | `society` | 1,552 |
| HOMICIDE | A | `persons` | 1,181 |
| PORNOGRAPHY/OBSCN MAT | A | `society` | 1,113 |
| PROSTITUTION | A | `society` | 1,026 |
| DISORDERLY CONDUCT | B | `society` | 762 |
| ANIMAL CRUELTY | A | `society` | 676 |
| EXTORTION/BLACKMAIL | A | `property` | 501 |
| DRUNKENNESS | B | `society` | 469 |
| GAMBLING | A | `society` | 234 |
| FAMILY OFFENSES, NONVIOLENT | B | `persons` | 141 |
| CURFEW/LOITERING/VAGRANCY VIOLATIONS | B | `society` | 82 |
| PEEPING TOM | B | `society` | 17 |
| LIQUOR LAW VIOLATIONS | B | `society` | 11 |
| BRIBERY | A | `property` | 9 |
| BAD CHECKS | B | `property` | 3 |
| (unclassified) | — | `other` | 1 |

Mapping rationale for the judgment calls (NIBRS convention, per the source's own field):
- **ROBBERY → `property`** — NIBRS classifies robbery as a crime against property.
- **DRUG/NARCOTIC, WEAPON LAW VIOLATION, PROSTITUTION, PORNOGRAPHY/OBSCN MAT, GAMBLING, ANIMAL CRUELTY → `society`** — NIBRS Group A crimes against society.
- **Group B offenses** (TRESPASS, DUI, DISORDERLY CONDUCT, DRUNKENNESS, LIQUOR LAW, CURFEW/LOITERING, PEEPING TOM, BAD CHECKS, FAMILY OFFENSES NONVIOLENT) carry their source-assigned crimes-against value (society, property, or persons).
- **ALL OTHER OFFENSES (Group B catch-all) → `other`** — the source itself labels it "PERSON, PROPERTY, OR SOCIETY"; it cannot honestly be assigned to one bucket.

`other` is labeled "Other / unclassified (context)" and is never counted as persons/property/society crime.

### Coverage (9 precincts — small-region note)
Memphis MPD publishes the **precinct station area** as the spatial unit — only **9 regions** (Austin Peay (AUSTIN PEAY), Raines (RAINES), Mt. Moriah (MT MORIAH), Crump (CRUMP), Tillman (TILLMAN), North Main (NORTH MAIN), Airways (AIRWAYS), Appling Farms (APPLING FARMS), Ridgeway (RIDGEWAY)), like Nashville's 9 police precincts. Leaderboards cap at top 6 and the quiz still works; the small region count is disclosed here and in the wiki.

- Placed (one of the 9 precinct areas): **562,385** (98.8%)
- Unplaced: 6,678 incidents whose kept row carries a special-unit or missing `Precinct` value instead of a station area — counted in every total and disclosed, never dropped. Verbatim values:

| Precinct value (non-geographic) | incidents |
|---|--:|
| OCU | 6,077 |
| (null) | 336 |
| STIS | 223 |
| MOTORS | 17 |
| MEM | 14 |
| (blank) | 5 |
| ARL | 1 |
| LAK | 1 |
| 005 | 1 |
| 001 | 1 |
| 003 | 1 |
| 008 | 1 |

(OCU = MPD Organized Crime Unit; STIS/MEM/MOTORS/ARL/LAK and numeric codes are special units or data-entry stragglers — none correspond to a station polygon.)

- Identity `placed + unplaced == citywide` validated per month × category in-script, on top of the independent server-side distinct-count reconciliation above.

## Geometry source — official precinct polygons

| Field | Value |
|-------|-------|
| Dataset | **MPD Precinct Areas** (`MPD_Station_Areas/FeatureServer/1`) — 9 polygons, official MPD precinct/station areas |
| FeatureServer | https://services2.arcgis.com/saWmpKJIUAjyyNVc/arcgis/rest/services/MPD_Station_Areas/FeatureServer/1 |
| Landing page | https://www.arcgis.com/home/item.html?id=0334e3fb182a4460ac075b17ae8a1126 |
| License | Not stated on the item — City of Memphis ArcGIS org; attributed to the City of Memphis |
| Join key | polygon `precinct` (proper case, e.g. "Mt. Moriah") ↔ crime `Precinct` (uppercase, e.g. "MT MORIAH") — joined by uppercase/punctuation-normalized name; **all 9 match exactly**; every unmatched incident value is a special unit or null (disclosed above) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (`points.json`)

Dots are **real incident locations published by MPD** in the `Latitude`/`Longitude` fields. **MPD publishes coordinates at ~3 decimal places (≈110 m — block-level anonymization)**, matching the block-level `Street_Address` field (e.g. "1900 GRAHAM ST"); dots therefore mark blocks, not exact addresses — the positions are still the source's own published values, never synthesized. Missing locations are published as **0,0** and a handful of coords fall outside the city box — **10,986 incidents (~1.9%) have no usable coordinates** and are counted in every total but not plotted (client-side gate: lat 34.98–35.27, lng -90.14–-89.64). Deterministic sample: incidents sorted by (occurred-at, Crime_ID), even-stride ≤100/month → **7,800 points ≈ 1 per 72 of the 558,077 placeable incidents**.

## Historical source — FBI UCR (1985–2019 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Memphis Police Department — **ORI `TNMPD0000`** (verified live) |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/TNMPD0000/violent-crime (and `/property-crime`) |
| Span | 1985–2019, annual Violent + Property (12 reported months verified per year) |
| Series | The CDE returns both "Offenses" and "Clearances" series for this agency — the **Offenses** series is used (matched explicitly) |
| ORI verification | The scouted ORI **TN0790100 is the Collierville Police Department** (1985 violent = 20 — implausible for Memphis) and was **rejected**; TNMPD0000 was found via the CDE `agency/byStateAbbr/TN` list and passes the in-script 1985 plausibility gate (violent 9,738, property 50,935) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set `FBI_API_KEY`) |

Raw CDE responses are cached under `data/memphis-tn/raw/`. UCR Summary (Violent/Property) is a **different taxonomy** than MPD NIBRS categories — the eras are presented as distinct and bridge at 2020; they are never equated. No monthly or precinct detail is implied for 1985–2019. Note the FBI-era totals INCLUDE rape (UCR Violent) while the 2020+ MPD source omits sex crimes — one more reason the eras are never numerically compared.

## Reproduce

```bash
FBI_API_KEY=… node pipeline/sources/memphis-tn.mjs
```
