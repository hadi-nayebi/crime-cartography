# Provenance — Milwaukee, WI

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Datasets | **wibr — NIBRS Crime Data (Current)** (resource `87843297-a6fa-46d4-ba5d-cb342fb2d3bb`) + **wibrarchive — NIBRS Crime Data (Historical)** (resource `395db729-a30a-4e53-ab66-faeb5e1899c8`) |
| Publisher | Milwaukee Police Department, via data.milwaukee.gov (CKAN) |
| Landing pages | https://data.milwaukee.gov/dataset/wibr · https://data.milwaukee.gov/dataset/wibrarchive |
| API | https://data.milwaukee.gov/api/3/action/datastore_search_sql (SQL **POSTed as JSON** — WAF-safe, same pattern as boston-ma) |
| Fetched | 2026-07-18T11:36:52.831Z |
| License | **CC-BY** (Creative Commons Attribution) — attribute "City of Milwaukee / Milwaukee Police Department" |
| Records used | 1,189,202 (Incident_Date 2005-02-01 → 2026-05-31) |
| Source caveat | Rows appear only after review by an MPD supervisor and the Records Management Division — "this approval process can take a few weeks from the reported date of the crime" (dataset notes). Recent months fill in late. |

### Resource seam (measured at fetch)

| Resource | Span (measured) | Rows |
|----------|-----------------|-----:|
| wibrarchive | 2005-02 … 2023-12 (plus 263 junk-dated rows, below) | 1,091,568 |
| wibr | 2024-01 → 2026-07 (partial) | 100,855 |

The two resources meet at a clean seam — the archive ends 2023-12-31 and the current file begins 2024-01-01; no overlap, no cross-resource dedupe needed. One incident (C2510110140×2) is published twice in wibr at fetch time (same case/date/location, re-edited offense-list order) — **1 extra row**, counted and disclosed rather than silently patched.

### Windowing (disclosed exclusions)

- **Pre-window (263 rows):** the archive contains junk-dated rows back to 1991 (259 rows across 1991–2004) plus 4 rows dated 2005-01; real coverage starts **2005-02** (3,726 rows) — the window starts there.
- **Still-filling months (2,958 rows):** because of the supervisor-review lag, 2026-06 (2,316 rows at fetch, ≈25% below the ~3,000/month 2026 trend) and 2026-07 (642 rows, partial month) are excluded; the granular window ends at **2026-05**, the last month the source has finished filling.
- Full out-of-window tally: 1991-01 (4), 1991-04 (1), 1991-06 (1), 1991-07 (1), 1991-08 (1), 1991-10 (1), 1991-12 (1), 1992-01 (2), 1992-02 (1), 1993-01 (2), 1993-07 (1), 1993-09 (1), 1994-03 (1), 1994-06 (1), 1994-09 (1), 1995-01 (1), 1995-06 (1), 1995-08 (1), 1995-10 (1), 1995-11 (2), 1996-03 (1), 1996-06 (1), 1996-12 (1), 1997-01 (1), 1997-03 (1), 1998-01 (3), 1998-06 (1), 1998-09 (1), 1999-01 (2), 1999-05 (1), 1999-06 (1), 1999-08 (1), 1999-11 (1), 1999-12 (3), 2000-01 (6), 2000-03 (1), 2000-05 (1), 2000-07 (1), 2000-08 (3), 2000-09 (2), 2000-11 (1), 2000-12 (2), 2001-01 (7), 2001-02 (1), 2001-03 (2), 2001-05 (2), 2001-06 (5), 2001-07 (3), 2001-09 (1), 2001-10 (3), 2001-11 (2), 2001-12 (1), 2002-01 (8), 2002-02 (11), 2002-03 (22), 2002-04 (7), 2002-05 (12), 2002-06 (19), 2002-07 (9), 2002-08 (13), 2002-09 (11), 2002-10 (11), 2002-11 (8), 2002-12 (8), 2003-01 (4), 2003-03 (2), 2003-05 (1), 2003-06 (1), 2003-07 (3), 2003-08 (1), 2003-09 (1), 2003-10 (3), 2003-12 (1), 2004-01 (3), 2004-02 (1), 2004-04 (2), 2004-05 (1), 2004-07 (1), 2004-09 (1), 2004-10 (2), 2004-12 (3), 2005-01 (4), 2026-06 (2,316), 2026-07 (642).

### Fields used

`Case_Number` · `Incident_Date` · `Offense_All` · `Location_All` · `Address_Latitude`/`Address_Longitude` (TEXT). `Police_District` is ~75% null in the archive and is not used; placement is a spatial join (below).

### Offense classification (`Offense_All` FIRST code → cat)

`Offense_All` is a **semicolon-separated** list of NIBRS offense codes for all offenses in the incident (the batch-1 scout note said comma — the measured delimiter is `;`). MPD publishes no per-incident offense hierarchy, so the **first listed code classifies the incident** — a documented judgment call applied uniformly to all 1,189,202 rows. Crimes-against assignment follows the FBI NIBRS offense-code list:

- **Group A** codes → `persons` / `property` / `society` per the FBI classification.
- **Group B** codes (90-series: disorderly conduct, DUI, trespass, "all other offenses", …) have **no NIBRS crimes-against category** (they are arrest-level offenses) — mapped to `other`, labeled "Group B / other offenses (context)", never counted as Group A crime.
- `09C` justifiable homicide is "not a crime" per NIBRS → `other`.
- Non-NIBRS placeholder codes observed (`999`, `---`, `90W`, `90X`, `90Y`, `11E`) → `other`, disclosed below.

| cat | Window count |
|-----|-------------:|
| `persons` | 196,082 |
| `property` | 685,975 |
| `society` | 95,200 |
| `other` | 211,945 |

#### Full first-code table (window counts at fetch time)

| Code | NIBRS offense | cat | Count |
|------|---------------|-----|------:|
| `90Z` | All Other Offenses (Group B) | `other` | 169,841 |
| `240` | Motor Vehicle Theft | `property` | 122,443 |
| `290` | Destruction / Damage / Vandalism | `property` | 110,356 |
| `220` | Burglary / Breaking & Entering | `property` | 99,900 |
| `23F` | Theft From Motor Vehicle | `property` | 94,765 |
| `13B` | Simple Assault | `persons` | 77,856 |
| `13A` | Aggravated Assault | `persons` | 75,618 |
| `23G` | Theft of Motor Vehicle Parts | `property` | 70,311 |
| `23H` | All Other Larceny | `property` | 64,690 |
| `520` | Weapon Law Violation | `society` | 56,653 |
| `120` | Robbery | `property` | 51,415 |
| `35A` | Drug / Narcotic Violation | `society` | 32,206 |
| `23D` | Theft From Building | `property` | 24,743 |
| `13C` | Intimidation | `persons` | 23,735 |
| `90C` | Disorderly Conduct (Group B) | `other` | 18,129 |
| `23C` | Shoplifting | `property` | 12,849 |
| `90F` | Family Offense, Nonviolent (Group B) | `other` | 9,987 |
| `280` | Stolen Property Offense | `property` | 7,779 |
| `90I` | Runaway (Group B — not a crime per NIBRS) | `other` | 6,489 |
| `26A` | False Pretenses / Swindle | `property` | 5,685 |
| `200` | Arson | `property` | 5,315 |
| `11D` | Fondling | `persons` | 5,203 |
| `11A` | Rape | `persons` | 4,574 |
| `90J` | Trespass of Real Property (Group B) | `other` | 3,802 |
| `250` | Counterfeiting / Forgery | `property` | 3,283 |
| `35B` | Drug Equipment Violation | `society` | 2,716 |
| `40A` | Prostitution | `society` | 2,716 |
| `23B` | Purse-Snatching | `property` | 2,436 |
| `26F` | Identity Theft | `property` | 2,241 |
| `26C` | Impersonation | `property` | 2,208 |
| `09A` | Murder & Nonnegligent Manslaughter | `persons` | 2,177 |
| `11B` | Sodomy | `persons` | 2,161 |
| `26B` | Credit Card / ATM Fraud | `property` | 2,149 |
| `100` | Kidnapping / Abduction | `persons` | 2,057 |
| `999` | Unspecified (MPD placeholder code 999) | `other` | 1,774 |
| `270` | Embezzlement | `property` | 1,677 |
| `36B` | Statutory Rape | `persons` | 1,663 |
| `---` | Unspecified (MPD placeholder code ---) | `other` | 1,000 |
| `23A` | Pocket-Picking | `property` | 987 |
| `370` | Pornography / Obscene Material | `society` | 671 |
| `11C` | Sexual Assault With An Object | `persons` | 610 |
| `23E` | Theft From Coin-Operated Machine | `property` | 456 |
| `90D` | Driving Under the Influence (Group B) | `other` | 343 |
| `90A` | Bad Checks (Group B) | `other` | 265 |
| `64A` | Human Trafficking — Commercial Sex Acts | `persons` | 243 |
| `09C` | Justifiable Homicide (not a crime per NIBRS) | `other` | 234 |
| `210` | Extortion / Blackmail | `property` | 158 |
| `40B` | Assisting / Promoting Prostitution | `society` | 130 |
| `09B` | Negligent Manslaughter | `persons` | 121 |
| `720` | Animal Cruelty | `society` | 100 |
| `26E` | Wire Fraud | `property` | 72 |
| `36A` | Incest | `persons` | 53 |
| `90W` | Unrecognized local code 90W | `other` | 31 |
| `26G` | Hacking / Computer Invasion | `property` | 22 |
| `510` | Bribery | `property` | 19 |
| `26D` | Welfare Fraud | `property` | 16 |
| `90X` | Unrecognized local code 90X | `other` | 14 |
| `90B` | Curfew / Loitering / Vagrancy (Group B) | `other` | 11 |
| `64B` | Human Trafficking — Involuntary Servitude | `persons` | 11 |
| `90E` | Drunkenness (Group B) | `other` | 8 |
| `90Y` | Unrecognized local code 90Y | `other` | 7 |
| `11E` | Unrecognized local code 11E | `other` | 6 |
| `39A` | Betting / Wagering | `society` | 5 |
| `90G` | Liquor Law Violation (Group B) | `other` | 4 |
| `40C` | Purchasing Prostitution | `society` | 2 |
| `39C` | Gambling Equipment Violation | `society` | 1 |

### Placement = spatial join of REAL coordinates (`NEIGHBORHD`)

The crime file has **no neighborhood field**. Every row with usable published coordinates is assigned by **point-in-polygon** (even-odd ray casting, exact — the polygon layer has no interior rings) into the 190 official City of Milwaukee neighborhood polygons. Nothing is approximated: the coordinates are MPD's published address-level values and the polygons are the city's official layer.

- Placed: **1,174,365** (98.8%)
- Unplaced — no/blank coordinates: 10,895 · parseable but outside the city bbox: 521 · inside the bbox but outside all 190 polygons (rivers, port, freeway ramps, edge cases): 3,421 — total 14,837, **counted in every citywide total** and disclosed, never guessed onto the map.
- Identity `placed + unplaced == citywide` validated per month × category in-script, **and** the client-side scan is reconciled against an independent server-side grouped aggregation (month × first code) plus per-resource `COUNT(*)` — all three agree exactly.

## Geometry source — City of Milwaukee neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **Neighborhoods** — 190 polygons, field `NEIGHBORHD` (official City of Milwaukee planning layer) |
| MapServer | https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/planning/special_districts/MapServer/4 |
| License | CC-BY — City of Milwaukee (copyright text: "Milwaukee DOA.ITMD.GIS, Milwaukee DCD") |
| Join | point-in-polygon of published incident coordinates (above) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (`points.json`)

Coordinates are TEXT in the source; ≈1.6% of window rows are blank/unusable and get no dot — but they are still counted in every citywide total. Points shown are **real incident addresses published by MPD**, never synthesized. Client-side gate: parseable lat 42.84–43.19, lng -88.07–-87.86. Deterministic sample: per month, first 150 bbox-valid rows in `_id` order, even-stride ≤100/month → **25,600 points ≈ 1 per 46 of the 1,177,786 bbox-valid rows**.

## Historical source — FBI UCR (1985–2004 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Milwaukee Police Department — **ORI `WIMPD0000`** (verified: returns the "Milwaukee Police Department Offenses" series; the scouted ORI `WI0410100` resolves to **Bayside PD** and was rejected) |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/WIMPD0000/violent-crime (and `/property-crime`) |
| Span | 1985–2004, annual Violent + Property (12 reported months verified per year) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set `FBI_API_KEY`) |

The CDE response carries both an "… Offenses" and an "… Clearances" series — the script matches the **Offenses** series explicitly and gates on a plausible 1985 violent-crime total. UCR Summary (Violent/Property) is a **different taxonomy** than MPD WIBR/NIBRS — the eras are presented as distinct and bridge at 2005; they are never equated. No monthly or neighborhood detail is implied for 1985–2004.

### Trend seam decision (producer, 2026-07-19)

The city's WIBR incident archive begins **2005-02** (there is no January 2005 in the source), so the first *complete* incident year is **2006**. FBI history stopped at 2004, which left a one-year hole at 2005 and blocked a contiguous long-arc trend. Resolution (in `pipeline/build-trend.mjs`, `extendFbi`): the FBI UCR era is extended by one **real full FBI year** — 2005 = violent **6,027** + property **33,377** = **39,404** (CDE `WIMPD0000`, same series/ORI as 1985–2004, so magnitudes are directly comparable; it sits naturally between 2004 = 36,968 and 2006 = 46,443). The incident era then runs **2006 → 2025**, fully contiguous with the FBI era. Nothing is interpolated; the added year is a sourced FBI count. `trend.json` span is 1985–2025, seam 2006.

## Reproduce

```bash
FBI_API_KEY=… node pipeline/sources/milwaukee-wi.mjs
```
