# Provenance — San Francisco, CA

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary sources — incident records (two eras, one cutover)

| Field | Value |
|-------|-------|
| Modern dataset | **Police Department Incident Reports: 2018 to Present** (Socrata `wg3w-h783`) |
| Historical dataset | **Police Department Incident Reports: Historical 2003 to May 2018** (Socrata `tmnf-yvry`) |
| Publisher | San Francisco Police Department, via DataSF (data.sfgov.org) |
| Landing pages | https://data.sfgov.org/Public-Safety/Police-Department-Incident-Reports-2018-to-Present/wg3w-h783 · https://data.sfgov.org/Public-Safety/Police-Department-Incident-Reports-Historical-2003/tmnf-yvry |
| APIs | https://data.sfgov.org/resource/wg3w-h783.json · https://data.sfgov.org/resource/tmnf-yvry.json |
| Fetched | 2026-07-12T07:10:56.058Z |
| License | **ODC PDDL 1.0** (public-domain dedication) — attribution "San Francisco Police Department via DataSF" |
| Records used | 3,117,438 (tmnf 2003-01-01 → 2017-12-31 + wg3w 2018-01-01 → 2026-06-30) |

### Cutover & windowing (disclosed exclusions)
- **Cutover at 2018-01-01**: tmnf is used strictly through **2017-12-31**; its 2018-01-01 → 2018-05-15 tail (43,733 rows) overlaps wg3w and is **dropped and disclosed** (`unplacedBeats["tmnf-2018-overlap-dropped"]`) to avoid double counting.
- Rows after **2026-06-30** (2,115 rows, partial month at fetch time) are excluded and disclosed (`unplacedBeats["partial-2026-07"]`).
- tmnf rows before 2003-01-01: 0. wg3w rows before 2018-01-01: 0.
- Full-dataset identities validated in-script: tmnf pre-2003 + window + overlap == 2,071,736 (dataset total); wg3w pre-2018 + window + partial == 1,045,702 (dataset total).

### Fields used
wg3w: `incident_datetime` · `incident_category` · `incident_description` · `analysis_neighborhood` · `latitude`/`longitude` · `intersection` · `row_id`.
tmnf: `date` · `category` · `descript` · `address` · `x` (lng) / `y` (lat).

## Neighborhood placement (the honesty-critical part)

Spatial unit: the **41 official DataSF Analysis Neighborhoods** (resident-known names), polygons from `j2bu-swwd` (property `nhood`, joined verbatim).

- **2018+ (wg3w):** rows carry the official `analysis_neighborhood` name — identity join, no approximation. 57,250 in-window rows (≈5.5%) have a **null** neighborhood: the 0 of them that have real published coordinates inside the city are placed by **point-in-polygon** against the official polygons; the remaining 57,250 (56,950 without usable coordinates + 300 whose coordinates fall outside all 41 polygons) stay **unplaced and disclosed** — never guessed.
- **2003–2017 (tmnf):** the dataset has **no neighborhood field**, but every row has coordinates. Rows are assigned by **point-in-polygon of their real published coordinates** against the same official polygons — real coords × official boundaries, nothing synthesized, method disclosed here and in `neighborhoods.json.method`. 138 rows carry junk coordinates outside the SF bounding box and 833 fall inside the bbox but outside all 41 polygons (piers/water/boundary artifacts) — all counted, disclosed as unplaced, never plotted.
- **Spot check:** the point-in-polygon assignment was validated against DataSF's own labeling for the full month 2019-06: **92.69% exact agreement** over 10,950 labeled rows. All 800 disagreements lie within **0.3 m** of the labeled neighborhood's boundary (validated in-script; >30 m would fail the run): published coordinates are anonymized by snapping to the nearest intersection, so points on boundary streets sit exactly on the polygon edge, where DataSF's label (from the pre-anonymization location) and PIP of the published point can legitimately differ — either side is a valid assignment at the published grain. Interior-rich neighborhoods reconcile (Mission: 1,189 labeled vs 1,189 PIP).
- **Reconciliation:** `placed + unplaced == citywide` holds **exactly** per month × category for all 282 months, with citywide counts taken from independent aggregate queries per source.

### Coverage
- Placed in one of the 41 neighborhoods: **3,013,369** (96.7%)
- Unplaced: 104,069 = 58,221 no-location/outside-polygons + 43,733 tmnf-2018-overlap-dropped + 2,115 partial-2026-07.

## Category mapping (NIBRS crimes-against convention)

Both source vocabularies were **fully enumerated at fetch time**; any value missing from the explicit tables below is a hard validation failure — nothing is bucketed silently. Robbery, fraud, bribery and extortion follow NIBRS as crimes against **property**; suicide, missing persons, recovered vehicles, warrants and case-closure/courtesy rows are **other** (context only, never counted as Group A crime).

### wg3w `incident_category` (2018-01 → 2026-06)

| Source value | cat | window count |
|---|---|--:|
| Larceny Theft | `property` | 302,321 |
| Other Miscellaneous | `other` | 72,183 |
| Malicious Mischief | `property` | 70,836 |
| Assault | `persons` | 68,090 |
| Burglary | `property` | 57,732 |
| Motor Vehicle Theft | `property` | 56,418 |
| Recovered Vehicle | `other` | 41,279 |
| Non-Criminal | `other` | 39,802 |
| Warrant | `other` | 36,133 |
| Fraud | `property` | 35,566 |
| Drug Offense | `society` | 35,225 |
| Lost Property | `other` | 32,314 |
| Missing Person | `other` | 23,749 |
| Robbery | `property` | 23,219 |
| Suspicious Occ | `other` | 22,341 |
| Disorderly Conduct | `society` | 19,823 |
| Offences Against The Family And Children | `persons` | 14,306 |
| Miscellaneous Investigation | `other` | 13,862 |
| Traffic Violation Arrest | `society` | 9,782 |
| Other | `other` | 9,059 |
| Other Offenses | `other` | 9,033 |
| Weapons Offense | `society` | 7,604 |
| Weapons Carrying Etc | `society` | 6,127 |
| Stolen Property | `property` | 5,181 |
| Case Closure | `other` | 4,367 |
| Forgery And Counterfeiting | `property` | 4,060 |
| Courtesy Report | `other` | 3,347 |
| Arson | `property` | 3,056 |
| Traffic Collision | `other` | 3,045 |
| Vandalism | `property` | 2,388 |
| *(null)* | `other` | 1,686 |
| Fire Report | `other` | 1,598 |
| Embezzlement | `property` | 1,339 |
| Sex Offense | `persons` | 1,150 |
| Prostitution | `society` | 1,081 |
| Civil Sidewalks | `other` | 1,012 |
| Vehicle Impounded | `other` | 948 |
| Suicide | `other` | 487 |
| Vehicle Misplaced | `other` | 464 |
| Drug Violation | `society` | 366 |
| Rape | `persons` | 279 |
| Homicide | `persons` | 256 |
| Liquor Laws | `society` | 156 |
| Suspicious | `other` | 136 |
| Human Trafficking (A), Commercial Sex Acts | `persons` | 130 |
| Motor Vehicle Theft? | `property` | 103 |
| Gambling | `society` | 84 |
| Human Trafficking, Commercial Sex Acts | `persons` | 30 |
| Weapons Offence | `society` | 29 |
| Human Trafficking (B), Involuntary Servitude | `persons` | 5 |

### tmnf `category` (2003-01 → 2017-12)

| Source value | cat | window count |
|---|---|--:|
| LARCENY/THEFT | `property` | 464,365 |
| OTHER OFFENSES | `other` | 296,411 |
| NON-CRIMINAL | `other` | 175,226 |
| ASSAULT | `persons` | 163,158 |
| VEHICLE THEFT | `property` | 124,759 |
| DRUG/NARCOTIC | `society` | 116,352 |
| VANDALISM | `property` | 111,933 |
| WARRANTS | `other` | 98,234 |
| BURGLARY | `property` | 88,971 |
| SUSPICIOUS OCC | `other` | 77,392 |
| ROBBERY | `property` | 53,417 |
| MISSING PERSON | `other` | 43,297 |
| FRAUD | `property` | 40,540 |
| FORGERY/COUNTERFEITING | `property` | 22,800 |
| SECONDARY CODES | `other` | 21,905 |
| WEAPON LAWS | `society` | 20,397 |
| TRESPASS | `property` | 18,681 |
| PROSTITUTION | `society` | 16,453 |
| STOLEN PROPERTY | `property` | 11,193 |
| DISORDERLY CONDUCT | `society` | 9,838 |
| DRUNKENNESS | `society` | 9,676 |
| RECOVERED VEHICLE | `other` | 8,688 |
| SEX OFFENSES, FORCIBLE | `persons` | 8,471 |
| DRIVING UNDER THE INFLUENCE | `society` | 5,560 |
| KIDNAPPING | `persons` | 4,228 |
| ARSON | `property` | 3,778 |
| EMBEZZLEMENT | `property` | 2,939 |
| LIQUOR LAWS | `society` | 2,826 |
| LOITERING | `society` | 2,386 |
| SUICIDE | `other` | 1,273 |
| BAD CHECKS | `property` | 915 |
| BRIBERY | `property` | 779 |
| EXTORTION | `property` | 717 |
| GAMBLING | `society` | 334 |
| PORNOGRAPHY/OBSCENE MAT | `society` | 54 |
| SEX OFFENSES, NON FORCIBLE | `persons` | 43 |
| TREA | `other` | 14 |

*tmnf has no separate homicide category — homicides are inside ASSAULT in that vocabulary. "Motor Vehicle Theft?" is the source's own uncertain-label variant. "Traffic Violation Arrest" (incl. DUI-type driving offenses) is mapped to `society`.*

## Real incident points (`points.json`)

Every dot is a **real reported incident location** published by SFPD (block/intersection grain), never synthesized. Client gate: lat 37.7–37.84, lng -122.52–-122.35. Deterministic sample ≤100/month: the tmnf era samples from the full 1.9M-row scan (every-8th row pool in `:id` order, then even stride); the wg3w era queries each month in `row_id` order (chronological, not type-clustered) and stride-samples. **28,200 points ≈ 1 per 107 of 3,014,502 placeable rows.** Rows without usable coordinates are counted in every total — they are only missing from the dot layer.

## Dispatch feed (`feed.json`)

282 real incidents, 3 per quarter 2003-Q1 → 2026-Q2, `:id` order (no seriousness bias). Title = source category + description verbatim; place = published block address / intersection; neighborhood via the same placement rules as the timeline.

## Historical source — FBI UCR (1985–2002 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | San Francisco Police Department — **ORI `CA0380100`** (verified at fetch: non-empty, nonzero actuals) |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/CA0380100/violent-crime (and `/property-crime`) |
| Span | 1985–2002, annual Violent + Property (12 nonzero reported months verified per year, both series) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set `FBI_API_KEY`) |

UCR Summary (Violent/Property) is a **different taxonomy** than the SFPD incident categories — the eras are presented as distinct and bridge at 2003; they are never equated. No monthly or neighborhood detail is implied for 1985–2002.

## Reproduce

```bash
FBI_API_KEY=… node pipeline/sources/san-francisco-ca.mjs
```
