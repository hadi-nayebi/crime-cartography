# Provenance — Charlotte, NC

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **CMPD Incidents** (all CMPD incident report types, 2017-present, refreshed daily) |
| Publisher | Charlotte-Mecklenburg Police Department, via City of Charlotte Open Data Portal |
| Landing page | https://www.arcgis.com/home/item.html?id=d22200cd879248fcb2258e6840bd6726 (portal: https://data.charlottenc.gov/) |
| API | https://gis.charlottenc.gov/arcgis/rest/services/CMPD/CMPDIncidents/MapServer/0 |
| Fetched | 2026-07-18T11:53:58.146Z |
| License | Custom City of Charlotte disclaimer (quoted verbatim below); no explicit open license — attribution "Charlotte-Mecklenburg Police Department / City of Charlotte" |
| Records kept | 698,399 in-window (of 854,996 layer rows; exclusions and window accounting enumerated below) |
| Source caveat | "For official crime statistics, please visit CMPD's Crime Statistics page." The layer "includes all CMPD incident report types, both criminal and non-criminal … Each incident is classified based on FBI NIBRS standards by applying a national crime hierarchy to choose the highest offense assigned to each report." Classifications and clearance statuses can change as investigations proceed. |

### License (verbatim, from the ArcGIS item registry — applies to both the incidents and divisions items)

> Although every effort has been made to ensure the accuracy of information, errors and conditions originating from physical sources used to develop the corporate database may be reflected in the data supplied. Users of this data must be aware of data conditions and bear responsibility for the appropriate use of the information with respect to possible errors, original map scale, collection methodology, currency of data, and other conditions specific to certain data. The City of Charlotte makes no warranty, either expressed or implied, as to the accuracy or completeness of any information archived and distributed.

### Exclusions (the headline honesty rule of this dataset)

The source layer mixes criminal and NON-CRIMINAL reports, and includes reports later determined to be
unfounded. Both are **excluded from every count** in this bundle and enumerated here:

**Layer accounting (at fetch):** 854,996 rows = **704,756 kept** + **128,848 non-criminal 800-series** + **21,392 unfounded (non-800)**. (7,962 rows are BOTH 800-series and unfounded — counted once, in the 800-series bucket.)

#### 1. Non-criminal 800-series local report types — 128,848 rows excluded

CMPD uses local 800-series codes for non-criminal report types (missing persons, natural deaths,
recovered out-of-jurisdiction vehicles, …). They are not crimes and are excluded entirely:

| Code | Source description | Rows (whole layer) |
|------|--------------------|-------------------:|
| `899` | Other Unlisted Non-Criminal | 81,036 |
| `800` | Missing Person | 23,210 |
| `802` | Sudden/Natural Death Investigation | 8,554 |
| `809` | Vehicle Recovery | 4,704 |
| `801` | Suicide | 4,669 |
| `803` | Overdose | 4,632 |
| `807` | Public Accident | 1,709 |
| `810` | Fire (Accidental/Non-Arson) | 285 |
| `804` | Dog Bite/Animal Control Incident | 48 |
| `806` | Gas Leak | 1 |

#### 2. Unfounded clearances — 21,392 rows excluded (non-800 rows)

`CLEARANCE_STATUS` values across the whole layer (enumerated at fetch):

| CLEARANCE_STATUS | Rows |
|------------------|-----:|
| Open | 516,237 |
| Exceptionally Cleared | 167,887 |
| Cleared by Arrest | 133,650 |
| Unfounded | 29,354 |
| Cleared by Arrest by Another Agency | 7,868 |

Reports whose status is **"Unfounded"** (complaint determined false/baseless per NIBRS practice) are
excluded. Detail statuses of the excluded non-800 unfounded rows:

| CLEARANCE_DETAIL_STATUS | Rows |
|-------------------------|-----:|
| Unfounded | 19,547 |
| Unfounded-Referred to Other Agency | 1,845 |

Caveat (disclosed): clearance status reflects the investigation **as of the fetch date** — a report
currently "Open" may later be unfounded, so re-runs of this pipeline can shift counts slightly. All
other statuses (Open, Cleared by Arrest, Exceptionally Cleared, Cleared by Arrest by Another Agency)
are kept — they are real reported offenses.

### Date field choice (disclosed)

The layer publishes `DATE_REPORTED`, `DATE_INCIDENT_BEGAN`, and `DATE_INCIDENT_END`. **We use
`DATE_INCIDENT_BEGAN`** — the map animates *when incidents began*, not when paperwork was filed.
All values are date-only (EXTRACT(HOUR)=0 across all 854,996 rows, verified live), so server-side
month grouping and client epoch conversion agree exactly. Consequence: 3,540 kept rows *began*
before 2017 (reported 2017+); 67 of them carry junk dates before 1990 (back to year
0200 — obvious data-entry errors on real reports). They fall outside the 2017-01 → 2026-06 window, so
they are **excluded from `totalRecords`** and disclosed as `excludedOutsideWindow["began-pre-2017"]`
— never silently dropped, never mapped, never mixed into the category totals.

### Windowing (disclosed exclusions — OUTSIDE the window, not in `totalRecords`)

- Rows (kept universe) with DATE_INCIDENT_BEGAN before **2017-01-01**: **3,540** excluded and
  disclosed (`excludedOutsideWindow["began-pre-2017"]` — see the date-field section above).
- Rows (kept universe) with DATE_INCIDENT_BEGAN on/after **2026-07-01** (partial month at fetch):
  **2,817** excluded and disclosed (`excludedOutsideWindow["partial-month-2026-07"]`) →
  the granular window ends at the last FULL month, **2026-06**.
- 704,756 kept = 698,399 window + 3,540 began-pre-2017 + 2,817 partial-month.

### Fields used

`DATE_INCIDENT_BEGAN` · `HIGHEST_NIBRS_CODE` / `HIGHEST_NIBRS_DESCRIPTION` ·
`CMPD_PATROL_DIVISION` (+ `DIVISION_ID`) · `LATITUDE_PUBLIC` / `LONGITUDE_PUBLIC` ·
`LOCATION` (block address) · `CLEARANCE_STATUS` / `CLEARANCE_DETAIL_STATUS` ·
`INCIDENT_REPORT_ID` (verified unique — zero duplicates server-side and in the raw-month re-pull;
one row = one incident report, no dedupe needed).

### Category mapping (HIGHEST_NIBRS_CODE → cat)

CMPD applies the FBI NIBRS national hierarchy and publishes ONE highest offense per incident report.
Crimes-against assignment follows the FBI NIBRS offense-code list: Group A → `persons` /
`property` / `society`; **Group B codes (90-series), CMPD local criminal codes `99Y`/`99Z`
(Indecent Exposure, Affray) and `09C` Justifiable Homicide ("not a crime" per NIBRS) → `other`**,
labeled "Group B / local non-NIBRS (context)", never counted as Group A crime. Any code outside the documented table
fails the build. Full in-window table (post-exclusion counts at fetch):

| Code | Source description | cat | Window count |
|------|--------------------|-----|-------------:|
| `23F` | Theft From Motor Vehicle | `property` | 82,492 |
| `90Z` | All Other Offenses | `other` | 80,638 |
| `13B` | Simple Assault | `persons` | 72,839 |
| `23H` | All Other Thefts | `property` | 68,532 |
| `23C` | Shoplifting | `property` | 51,896 |
| `290` | Damage/Vandalism Of Property | `property` | 48,271 |
| `220` | Burglary/B&E | `property` | 39,237 |
| `240` | Motor Vehicle Theft | `property` | 38,812 |
| `35A` | Drug/Narcotic Violations | `society` | 31,915 |
| `13C` | Intimidation | `persons` | 26,753 |
| `13A` | Aggravated Assault | `persons` | 25,450 |
| `26A` | False Pretenses/Swindle | `property` | 14,797 |
| `120` | Robbery | `property` | 13,758 |
| `23G` | Theft of Motor Vehicle Parts from Vehicle | `property` | 13,427 |
| `23D` | Theft From Building | `property` | 9,017 |
| `26B` | Credit Card/Teller Fraud | `property` | 8,965 |
| `26F` | Identity Theft | `property` | 7,799 |
| `520` | Weapon Law Violations | `society` | 7,218 |
| `280` | Stolen Property Offenses | `property` | 6,314 |
| `90J` | Trespass Of Real Property | `other` | 6,003 |
| `250` | Counterfeiting/Forgery | `property` | 4,856 |
| `35B` | Drug Equipment Violations | `society` | 4,612 |
| `90D` | Driving Under The Influence | `other` | 4,564 |
| `26C` | Impersonation | `property` | 4,412 |
| `11D` | Forcible Fondling | `persons` | 3,559 |
| `270` | Embezzlement | `property` | 2,553 |
| `370` | Pornography/Obscene Material | `society` | 2,530 |
| `99Z` | Affray | `other` | 1,954 |
| `11A` | Forcible Rape | `persons` | 1,733 |
| `210` | Extortion/Blackmail | `property` | 1,565 |
| `100` | Kidnapping | `persons` | 1,518 |
| `23A` | Pocket-Picking | `property` | 1,415 |
| `200` | Arson | `property` | 1,212 |
| `23B` | Purse-Snatching | `property` | 1,145 |
| `99Y` | Indecent Exposure | `other` | 1,027 |
| `09A` | Murder | `persons` | 828 |
| `90C` | Disorderly Conduct | `other` | 781 |
| `26G` | Hacking/Computer Invasion | `property` | 553 |
| `90F` | Family Offenses; Nonviolent | `other` | 430 |
| `90G` | Liquor Law Violations | `other` | 413 |
| `11B` | Forcible Sodomy | `persons` | 411 |
| `26E` | Wire Fraud | `property` | 396 |
| `720` | Animal Cruelty | `society` | 295 |
| `23E` | Theft From Coin-Operated Machine Or Device | `property` | 272 |
| `36B` | Statutory Rape | `persons` | 246 |
| `90H` | Peeping Tom | `other` | 227 |
| `90B` | Curfew/Loitering/Vagrancy Violations | `other` | 144 |
| `09C` | Justifiable Homicide | `other` | 110 |
| `90A` | Worthless Check: Felony (over $2000) | `other` | 95 |
| `40A` | Prostitution | `society` | 91 |
| `11C` | Sexual Assault With Object | `persons` | 79 |
| `64B` | Human Trafficking, Involuntary Servitude | `persons` | 57 |
| `09B` | Negligent Manslaughter | `persons` | 34 |
| `39B` | Assisting Gambling | `society` | 32 |
| `39C` | Gambling Equipment Violations | `society` | 27 |
| `64A` | Human Trafficking, Commercial Sex Acts | `persons` | 25 |
| `36A` | Incest | `persons` | 20 |
| `40B` | Assisting Prostitution | `society` | 14 |
| `39A` | Betting/Wagering | `society` | 12 |
| `26D` | Welfare Fraud | `property` | 11 |
| `40C` | Purchasing Prostitution | `society` | 5 |
| `510` | Bribery | `property` | 3 |

| cat | Window count |
|-----|-------------:|
| `persons` | 133,552 |
| `property` | 421,710 |
| `society` | 46,751 |
| `other` | 96,386 |

### Placement — official patrol divisions carried in-data

Every record carries `CMPD_PATROL_DIVISION`; the 14 official divisions match the polygon layer's
`DNAME` (minus the " Division" suffix) exactly, keyed by identical division codes — an identity
join, no spatial approximation. Records tagged to areas outside CMPD's 14 patrol divisions (served
towns / mutual-aid codes) are **counted citywide and disclosed as unplaced**:

| CMPD_PATROL_DIVISION (in-window) | Rows |
|----------------------------------|-----:|
| "NA" | 498 |
| "Huntersville" | 386 |
| "Davidson" | 10 |
| "Unknown" | 1 |

- Placed: **697,504** (99.9% of the 698,399 in-window records)
- Unplaced (in-window): 895 outside the 14 divisions.
- Excluded outside the window (disclosed above, NOT in the totals): 3,540 began-pre-2017 + 2,817 partial-2026-07.
- Identity `placed + unplaced == citywide` validated per month × category in-script against an
  independent citywide grouped query (698,399 in-span rows), **plus** one full month
  (2023-05) re-verified row-by-row against a paged raw pull (dates, filters, categories, divisions,
  and report-ID uniqueness all re-checked client-side).

## Geometry source — official CMPD Police Divisions

| Field | Value |
|-------|-------|
| Dataset | **CMPD Police Divisions** — 14 polygons, official City of Charlotte layer (owner CharlotteNC) |
| FeatureServer | https://services.arcgis.com/9Nl857LBlQVyzq54/arcgis/rest/services/CMPD_Police_Divisions/FeatureServer/0 |
| Item | https://www.arcgis.com/home/item.html?id=b787e43380cd4fc0ba6dd6a9fb10cb27 |
| License | Same verbatim City of Charlotte disclaimer as above |
| Join key | `DIVISION` code ↔ incident `DIVISION_ID`; `DNAME` minus " Division" ↔ `CMPD_PATROL_DIVISION` — exact identity (verified) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |
| Note | Interior rings (independent towns surrounded by a division, e.g. inside Steele Creek) are dropped for display only — placement is by in-data division name, so no count is affected |

## Real incident points (`points.json`)

Dots are **real incident locations published by CMPD** in `LATITUDE_PUBLIC`/`LONGITUDE_PUBLIC` —
**block-anonymized by the source** (the `LOCATION` field is a block address like
"9700 NORTHLAKE CENTRE PY"): accurate to the block, not the parcel, and disclosed wherever dots are
shown. Coordinate coverage is 100% (no nulls/zeros in the layer); a small share falls outside the
division-polygon extent used as the map frame (lat 35–35.53, lng -81.06–-80.55;
includes lat/lng-swapped junk) — those rows are **counted in every total but not plotted**.
Deterministic sample: every in-bbox kept row of each month fetched (OBJECTID order), even-stride
≤100/month → **11,400 points ≈ 1 per 61 of the 698,374 placeable rows**.

## Historical source — FBI UCR (1985–2016 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Charlotte-Mecklenburg Police Department — **ORI `NC0600100`** (verified: returns the "Charlotte-Mecklenburg Police Department Offenses" series; 1985 violent total 4,575 passes the big-city plausibility gate that caught a wrong-agency ORI in the milwaukee build) |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/NC0600100/violent-crime (and `/property-crime`) |
| Span | 1985–2016, annual Violent + Property (12 reported months verified per year) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set `FBI_API_KEY`) |

The CDE response carries both an "… Offenses" and an "… Clearances" series — the script matches the
**Offenses** series explicitly. Raw responses are cached under `data/charlotte-nc/raw/`. UCR Summary
(Violent/Property) is a **different taxonomy** than CMPD NIBRS — the eras are presented as distinct
and bridge at 2017; they are never equated. No monthly or division detail is implied for
1985–2016. Note: CMPD was formed in 1993 by the merger of the Charlotte Police
Department and the Mecklenburg County Police Department; the CDE series for ORI NC0600100 covers the
agency and its predecessor reporting under that ORI.

## Reproduce

```bash
FBI_API_KEY=… node pipeline/sources/charlotte-nc.mjs
```
