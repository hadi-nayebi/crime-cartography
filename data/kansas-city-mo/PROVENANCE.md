# Provenance — Kansas City, MO

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records (12 yearly datasets)

| Field | Value |
|-------|-------|
| Datasets | **KCPD Crime Data 2015 … 2026** — 12 Socrata yearly datasets on data.kcmo.org (table below) |
| Publisher | Kansas City, Missouri Police Department, via data.kcmo.org (attribution "KCPD Information Technology") |
| Fetched | 2026-07-18T11:42:26.842Z |
| License | **Public Domain** on the 2018–2026 assets; the 2015, 2016 and 2017 assets carry **no license field** (disclosed — attributed to KCPD; the city portal publishes them as official KCPD data) |
| Rows used | 1,281,836 per-involvement rows → 638,301 distinct reports → **636,430 in-window incidents** (2015-01-01 → 2026-06-30, binned by reporting date) |

### Yearly datasets (ids discovered via Socrata catalog search)
| Year | Socrata id | rows | distinct reports | row inflation |
|------|-----------|-----:|-----------------:|--------------:|
| 2015 | `kbzx-7ehe` | 121,901 | 50,325 | ×2.42 |
| 2016 | `wbz8-pdv7` | 127,877 | 51,444 | ×2.49 |
| 2017 | `98is-shjt` | 132,139 | 52,554 | ×2.51 |
| 2018 | `dmjw-d28i` | 128,938 | 51,391 | ×2.51 |
| 2019 | `pxaa-ahcm` | 103,772 | 57,557 | ×1.80 |
| 2020 | `vsgj-uufz` | 96,220 | 55,523 | ×1.73 |
| 2021 | `w795-ffu6` | 92,127 | 52,834 | ×1.74 |
| 2022 | `x39y-7d3m` | 101,848 | 58,129 | ×1.75 |
| 2023 | `bfyq-5nh6` | 108,702 | 62,400 | ×1.74 |
| 2024 | `isbe-v4d8` | 110,029 | 61,809 | ×1.78 |
| 2025 | `dmnp-9ajg` | 105,503 | 56,880 | ×1.85 |
| 2026 | `f7wj-ckmw` | 52,780 | 27,623 | ×1.91 |

Schemas drift across years and are handled per-year in the script: the report-number field is `report_no` (2015–2022, 2024) or `report` (2023, 2025, 2026); the reporting-date field is `reported_date` or `report_date`; coordinates arrive as numeric `latitude`/`longitude` columns (2015–2016), a Socrata location object `location_1`/`location` (2017–2020), or a GeoJSON point `location` (2021+).

### Per-involvement rows → incidents (dedupe, disclosed)
The datasets publish **one row per involvement** (victim/suspect/arrestee/…) per report — ×2.01 average row inflation. Following the datasets' own report-number key:
- 1,281,836 rows → **638,301 distinct reports** (global dedupe across all 12 datasets; 166 reports appear in more than one yearly dataset and are counted once)
- 412,496 in-window reports had >1 row; 16,950 spanned multiple NIBRS categories — the kept row is a deterministic minimum that prefers NIBRS-classified rows over unclassified ones, then sorts by (code, description, date, address); 755 spanned months and are binned at the earliest reporting date
- Incident coordinates: the deterministic minimum "lat,lng" over the report's rows that carry usable coordinates (all rows of a report describe the same incident)
- **Independent reconciliation:** the server's `COUNT(DISTINCT report)` equals the client-side pull **for every dataset and every month**, and each dataset's server row count equals the rows pulled — validated in-script on every run

### Windowing (disclosed exclusions)
- **72 junk-dated reports before 2015** (the 2022 dataset carries rows dated back to 1923 — data-entry artifacts) are excluded and counted.
- **1,799 reports dated after 2026-06-30** are excluded: 2026-07 rows stop mid-month at fetch time (last row 2026-07-13) — the granular window ends at the last FULL month, **2026-06** (measured: June has 8,706-row volume in line with May).
- The 2022 dataset also carries 1,302 rows dated 2015–2021 (late-entered reports) — kept, binned in their reported month, and deduped globally.

### Source gaps / regime changes (shown honestly, never patched)
| Span | What the source shows |
|------|----------------------|
| 2016-12-26 … 12-31 | final days missing from the 2016 yearly snapshot (rows stop 12-25) |
| 2018-12-31 | last day missing from the 2018 snapshot (rows stop 12-30) |
| 2020-12-28 … 12-31 | final days missing from the 2020 snapshot (rows stop 12-27) |
| 2021-12-27 … 12-31 | final days missing from the 2021 snapshot (rows stop 12-26) |
| 2018 → 2019 | KCPD records-system change: rows/report drops ~2.5× → ~1.8×, `ibrs` null share jumps ~0.7% → ~9–15% (through 2025), and 2019–2021 rows are ~18–24% missing coordinates. Deduped **incident** counts are the comparable series; the `other` share and unplaced share rise accordingly and are disclosed. |

### Fields used
report number · reporting date · `ibrs` (NIBRS offense code) · `description` · `address` · coordinates (per-year carrier above). Inspected but unused: `offense` (local code), `area` (patrol division), `beat`, involvement/demographic fields.

### Category mapping (`ibrs` NIBRS code → cat) — complete enumeration
Mapping follows the **NIBRS crimes-against convention** (robbery, arson, extortion and bribery are crimes against *property*; all Group B arrest-grade offenses (90A–90Z) carry victim type *Society* in NIBRS and map to `society`). 09C (justifiable homicide — not a crime per FBI), the local placeholder `999`, and null codes map to `other` ("Unclassified / non-NIBRS (context)") and are never counted as Group A persons/property/society crime. Counts are deduped in-window incidents (kept rows); the in-script audit fails loudly on any unmapped code.

| ibrs | NIBRS offense | cat | incidents |
|------|---------------|-----|----------:|
| 13B | Simple Assault | `persons` | 70,498 |
| 240 | Motor Vehicle Theft | `property` | 60,436 |
| NULL | no NIBRS code in source (null) | `other` | 58,743 |
| 290 | Destruction/Damage/Vandalism | `property` | 52,938 |
| 23F | Theft From Motor Vehicle | `property` | 47,564 |
| 13A | Aggravated Assault | `persons` | 41,537 |
| 220 | Burglary/Breaking & Entering | `property` | 38,484 |
| 23C | Shoplifting | `property` | 29,661 |
| 90Z | All Other Offenses (Group B catch-all) | `society` | 28,245 |
| 23H | All Other Larceny | `property` | 26,363 |
| 23G | Theft of Motor Vehicle Parts | `property` | 24,701 |
| 23D | Theft From Building | `property` | 20,887 |
| 120 | Robbery | `property` | 16,035 |
| 90J | Trespass of Real Property (Group B) | `society` | 15,971 |
| 35A | Drug/Narcotic Violations | `society` | 15,063 |
| 13C | Intimidation | `persons` | 11,316 |
| 90D | Driving Under the Influence (Group B) | `society` | 10,742 |
| 26A | False Pretenses/Swindle/Confidence Game | `property` | 6,975 |
| 90C | Disorderly Conduct (Group B) | `society` | 6,504 |
| 26F | Identity Theft | `property` | 6,201 |
| 26B | Credit Card/ATM Fraud | `property` | 6,079 |
| 280 | Stolen Property Offenses | `property` | 4,935 |
| 250 | Counterfeiting/Forgery | `property` | 4,274 |
| 999 | KCPD local placeholder code (non-NIBRS) | `other` | 4,048 |
| 520 | Weapon Law Violations | `society` | 3,555 |
| 11A | Rape | `persons` | 3,325 |
| 90F | Family Offenses, Nonviolent (Group B) | `society` | 2,689 |
| 35B | Drug Equipment Violations | `society` | 2,092 |
| 270 | Embezzlement | `property` | 2,084 |
| 26E | Wire Fraud | `property` | 1,813 |
| 200 | Arson | `property` | 1,682 |
| 11D | Fondling | `persons` | 1,639 |
| 11B | Sodomy | `persons` | 1,582 |
| 09A | Murder & Nonnegligent Manslaughter | `persons` | 1,522 |
| 26C | Impersonation | `property` | 1,241 |
| 40A | Prostitution | `society` | 599 |
| 23A | Pocket-picking | `property` | 561 |
| 100 | Kidnapping/Abduction | `persons` | 534 |
| 90G | Liquor Law Violations (Group B) | `society` | 502 |
| 36B | Statutory Rape | `persons` | 453 |
| 40C | Purchasing Prostitution | `society` | 346 |
| 23B | Purse-snatching | `property` | 324 |
| 370 | Pornography/Obscene Material | `society` | 307 |
| 210 | Extortion/Blackmail | `property` | 233 |
| 26G | Hacking/Computer Invasion | `property` | 190 |
| 26D | Welfare Fraud | `property` | 177 |
| 23E | Theft From Coin-Operated Machine | `property` | 142 |
| 90B | Curfew/Loitering/Vagrancy (Group B) | `society` | 116 |
| 90E | Drunkenness (Group B) | `society` | 80 |
| 40B | Assisting or Promoting Prostitution | `society` | 73 |
| 11C | Sexual Assault With An Object | `persons` | 67 |
| 720 | Animal Cruelty | `society` | 60 |
| 64A | Human Trafficking — Commercial Sex Acts | `persons` | 59 |
| 90A | Bad Checks (Group B) | `society` | 52 |
| 36A | Incest | `persons` | 33 |
| 90I | Runaway (Group B) | `society` | 29 |
| 09C | Justifiable Homicide (not a crime per FBI) | `other` | 13 |
| 64B | Human Trafficking — Involuntary Servitude | `persons` | 12 |
| 90H | Peeping Tom (Group B) | `society` | 10 |
| 09D | DV-Related Suicide (KCPD local extension — not an NIBRS crime) | `other` | 10 |
| 09B | Negligent Manslaughter | `persons` | 8 |
| 39C | Gambling Equipment Violations | `society` | 8 |
| 510 | Bribery | `property` | 3 |
| 39B | Operating/Promoting/Assisting Gambling | `society` | 2 |
| 39A | Betting/Wagering | `society` | 2 |
| 39D | Sports Tampering | `society` | 1 |

| cat totals | |
|---|--:|
| `persons` | 132,585 |
| `property` | 353,983 |
| `society` | 87,048 |
| `other` | 62,814 |

### Coverage
- Placed (one of the 240 named official neighborhoods, 2015-01…2026-06): **552,567** (86.8%)
- Unplaced: 83,863 = 58,439 incidents without usable coordinates + 25,424 whose coordinates fall outside every named neighborhood polygon (the official layer contains 6 unnamed filler areas, and KCPD serves areas at the city edge) — kept in every citywide total and disclosed.
- Identity `placed + unplaced == citywide` validated per month × category in-script.

## Geometry source — official neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **Kansas City Neighborhood Borders** (Socrata `vq6h-tqrf`, provenance "official") — parent dataset of the official "Kansas City Neighborhood Boundaries" map view `q45j-ejyk` |
| API | https://data.kcmo.org/resource/vq6h-tqrf.json |
| Features | 246 multipolygons = **240 named neighborhoods** (`nbhname`, all unique) + 6 unnamed filler areas (`nbhid` 0) that carry no neighborhood name |
| Join method | **spatial join** — point-in-polygon (even-odd rule, holes honored, full-precision rings, deterministic first-match by sorted name) of each incident's KCPD-published coordinates |
| Centroids | Area-weighted centroid across outer rings (shoelace formula) — for symbol placement only |
| License | not stated on the asset — attributed to the City of Kansas City, Missouri |

## Real incident points (`points.json`)

Dots are **real incident locations published by KCPD** — the source geocodes block-level addresses (e.g. "5200 EUCLID AVE"), so every dot marks a real reported incident's block, never an exact address and never synthesized. One dot per deduped incident. **58,439 in-window incidents (~9.2%) have no usable coordinates** (null location or the (0,0) sentinel — concentrated in 2019–2021, ~18–24% of those years' rows) and 1,176 more fall outside the plot box (lat 38.83–39.4, lng -94.77–-94.38); all are counted in every total but not plotted, and the video says so. Deterministic sample: incidents sorted by (date, report number), even-stride ≤100/month → **13,800 points ≈ 1 per 42 of the 576,815 placeable incidents**.

## Historical source — FBI UCR (1985–2014 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Kansas City, Missouri Police Department — **ORI `MOKPD0000`** (verified via CDE agency lookup; the scout sheet's MO0460100 resolves to Mountain View PD and was rejected) |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/MOKPD0000/violent-crime (and `/property-crime`) |
| Series | the "Kansas City Police Department **Offenses**" series is matched explicitly — the response also carries a "Clearances" series that must never be picked |
| Span | 1985–2014, annual Violent + Property (12 reported months verified per year) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set `FBI_API_KEY` or `.secrets/fbi_api_key`) |

UCR Summary (Violent/Property) is a **different taxonomy** than KCPD's NIBRS codes — the eras are presented as distinct and bridge at 2015; they are never equated. No monthly or neighborhood detail is implied for 1985–2014.

## Reproduce

```bash
FBI_API_KEY=… node pipeline/sources/kansas-city-mo.mjs
```
