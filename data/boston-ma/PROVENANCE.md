# Provenance — Boston, MA

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **Crime Incident Reports (August 2015 – To Date) (Source: New System)** — CKAN package `crime-incident-reports-august-2015-to-date-source-new-system` |
| Publisher | Boston Police Department, via Analyze Boston (data.boston.gov) |
| Landing page | https://data.boston.gov/dataset/crime-incident-reports-august-2015-to-date-source-new-system |
| API | https://data.boston.gov/api/3/action/datastore_search_sql (SQL **POSTed as JSON** — the Cloudflare WAF 403s SQL in GET query strings) |
| Fetched | 2026-07-12T07:05:46.795Z |
| License | **ODC-PDDL** (Open Data Commons Public Domain Dedication and License) — attribute "Boston Police Department via Analyze Boston" |
| Records used | 923,773 (OCCURRED_ON_DATE 2015-08-01 → 2026-06-30) |
| Source caveat | Reports can be reclassified/updated by BPD; the 2023-to-present resource updates daily |

### Resources (one CKAN datastore resource per period)

| Period | Resource id | Rows (all, at fetch) |
|--------|-------------|---------------------:|
| 2015 | `792031bf-b9bb-467c-b118-fe795befdf00` | 53,597 |
| 2016 | `b6c4e2c3-7b1e-4f4a-b019-bef8c6a0e882` | 99,430 |
| 2017 | `64ad0053-842c-459b-9833-ff53d568f2e3` | 101,338 |
| 2018 | `e86f8e38-a23c-4c1a-8455-c8f94210a8f1` | 98,888 |
| 2019 | `34e0ae6b-8c94-4998-ae9e-1b51551fe9ba` | 87,184 |
| 2020 | `be047094-85fe-4104-a480-4fa3d03f9623` | 70,894 |
| 2021 | `f4495ee9-c42c-4019-82c1-d067f07e45d2` | 71,721 |
| 2022 | `313e56df-6d77-49d2-9c49-ee411f10cf58` | 73,852 |
| 2023 → present | `b973d8cb-eeb2-4e7e-99da-c92938efc9c0` | 281,187 |

Row totals per resource were independently verified: the paged grouped aggregation used for the timeline sums exactly to `COUNT(*)` for every resource (guards against silent pagination truncation).

### Windowing (disclosed exclusions)

- **12,569 rows before 2015-08** are excluded: the package is titled "August 2015 to date", but the 2015 file also contains a partial June + July 2015 from the new records system's ramp-up. Excluded months at fetch: 2015-06 (4,200), 2015-07 (8,369).
- **1,749 rows in the partial current month** (2026-07, 1,749 rows at fetch) are excluded; the window ends at the last full month.
- 2023-to-present timestamps carry a `+00` suffix (e.g. `2023-01-27 22:44:00+00`); earlier files are plain local timestamps. Dates are used **as published** (first 10 characters); no timezone conversion is applied.

### Fields used

`OCCURRED_ON_DATE` · `OFFENSE_DESCRIPTION` · `DISTRICT` · `STREET` · `Lat`/`Long` (TEXT) · `INCIDENT_NUMBER`/`OFFENSE_CODE` (inspection only). The legacy `OFFENSE_CODE_GROUP`/`UCR_PART` fields are null from 2020 on, so categories are derived from `OFFENSE_DESCRIPTION` (below).

### Placement = DISTRICT (not coordinates)

Timeline counts place rows by the **`DISTRICT` code** (verbatim, no spatial join). Coordinates gate only the dot layer (`points.json`). Rows with a non-district value are **unplaced** and disclosed: `(null)` 4,761 · `External` 931 · `Outside of` 2 — total 5,694 (0.6% of the window).

### Districts (official resident-known names)

The 12 BPD district codes map to the official **boston.gov police-district names** (source: https://www.boston.gov/departments/police — the "Districts" pages):

| Code | Name | Code | Name |
|------|------|------|------|
| A1 | Downtown & Beacon Hill | C11 | Dorchester |
| A15 | Charlestown | D4 | South End |
| A7 | East Boston | D14 | Allston/Brighton |
| B2 | Roxbury | E5 | West Roxbury |
| B3 | Mattapan | E13 | Jamaica Plain |
| C6 | South Boston | E18 | Hyde Park |

### Known content gap (disclosed, not fixable from this source)

BPD's public incident file **excludes rape and sexual-assault reports** (privacy protection). The script verifies no such descriptions exist in the data and the video must not imply those crimes are zero — they are simply not published at incident level.

### Category mapping (OFFENSE_DESCRIPTION → cat)

The new-system file has **no NIBRS group field**. Categories are derived from `OFFENSE_DESCRIPTION` via ordered keyword rules (service/procedural overrides first, then persons / property / society; first match wins; unmatched → `other`). Explicit rules cover **100%** of window rows (91 rows fall through to `other`). Boston's file includes a large share of **non-crime service records** (investigations, medical assists, towed vehicles, accidents…) — these are mapped to `other`, labeled "Service / non-crime (context)", and never counted as crime.

| cat | Window count |
|-----|-------------:|
| `persons` | 101,744 |
| `property` | 229,433 |
| `society` | 59,424 |
| `other` | 533,172 |

Judgment calls (documented): leaving-scene and auto-law (VAL) records → `other` (traffic context); warrant/fugitive processing → `other` (procedural); recovered vehicles/property → `other`; drug-related **sick assists** → `other` (medical response, not an offense); restraining/harassment-prevention **order violations** → `society`; OUI → `society`; trespassing → `society`; robbery → `property` (NIBRS crime-against-property).

#### Full description table (window counts at fetch time)

| OFFENSE_DESCRIPTION (verbatim) | Count | cat | rule |
|---|--:|---|---|
| INVESTIGATE PERSON | 73,859 | `other` | investigations (no offense established) |
| M/V - LEAVING SCENE - PROPERTY DAMAGE | 51,622 | `other` | leaving-scene reports (traffic context) |
| SICK ASSIST | 41,660 | `other` | medical assists (incl. drug-related illness) |
| VANDALISM | 38,470 | `property` | vandalism |
| INVESTIGATE PROPERTY | 38,179 | `other` | investigations (no offense established) |
| TOWED MOTOR VEHICLE | 36,861 | `other` | towed vehicles |
| SICK/INJURED/MEDICAL - PERSON | 35,826 | `other` | medical assists (incl. drug-related illness) |
| LARCENY SHOPLIFTING | 30,654 | `property` | larceny/theft |
| VERBAL DISPUTE | 29,383 | `other` | verbal disputes |
| LARCENY THEFT FROM MV - NON-ACCESSORY | 24,424 | `property` | larceny/theft |
| LARCENY THEFT FROM BUILDING | 24,021 | `property` | larceny/theft |
| THREATS TO DO BODILY HARM | 23,363 | `persons` | threats (incl. bomb/biological threats = intimidation) |
| ASSAULT - SIMPLE | 21,722 | `persons` | assaults |
| M/V ACCIDENT - PROPERTY DAMAGE | 21,173 | `other` | motor-vehicle accidents |
| ASSAULT SIMPLE - BATTERY | 19,668 | `persons` | assaults |
| LARCENY ALL OTHERS | 18,649 | `property` | larceny/theft |
| PROPERTY - LOST/ MISSING | 16,842 | `other` | lost/found/accidental property |
| ASSAULT - AGGRAVATED | 14,685 | `persons` | assaults |
| M/V ACCIDENT - OTHER | 13,988 | `other` | motor-vehicle accidents |
| MISSING PERSON - LOCATED | 13,759 | `other` | missing-person reports |
| FRAUD - FALSE PRETENSE / SCHEME | 13,387 | `property` | fraud/forgery |
| M/V ACCIDENT - PERSONAL INJURY | 12,740 | `other` | motor-vehicle accidents |
| DRUGS - POSSESSION/ SALE/ MANUFACTURING/ USE | 12,700 | `society` | drug offenses |
| PROPERTY - LOST | 11,802 | `other` | lost/found/accidental property |
| PROPERTY - FOUND | 11,270 | `other` | lost/found/accidental property |
| AUTO THEFT | 10,653 | `property` | auto theft |
| WARRANT ARREST | 10,029 | `other` | warrant service (procedural) |
| HARASSMENT/ CRIMINAL HARASSMENT | 7,862 | `persons` | harassment/stalking/intimidation |
| VAL - VIOLATION OF AUTO LAW | 7,742 | `other` | auto-law violations (traffic citations) |
| LARCENY THEFT OF BICYCLE | 7,364 | `property` | larceny/theft |
| FRAUD - CREDIT CARD / ATM FRAUD | 7,127 | `property` | fraud/forgery |
| TRESPASSING | 6,585 | `society` | trespassing |
| ASSAULT - AGGRAVATED - BATTERY | 6,350 | `persons` | assaults |
| MISSING PERSON | 6,024 | `other` | missing-person reports |
| VAL - OPERATING AFTER REV/SUSP. | 5,839 | `other` | auto-law violations (traffic citations) |
| HARASSMENT | 5,640 | `persons` | harassment/stalking/intimidation |
| SUDDEN DEATH | 5,224 | `other` | death investigations |
| SICK ASSIST - DRUG RELATED ILLNESS | 5,184 | `other` | medical assists (incl. drug-related illness) |
| LARCENY THEFT OF MV PARTS & ACCESSORIES | 5,082 | `property` | larceny/theft |
| ROBBERY | 4,925 | `property` | robbery |
| SICK/INJURED/MEDICAL - POLICE | 4,742 | `other` | medical assists (incl. drug-related illness) |
| BURGLARY - RESIDENTIAL | 4,726 | `property` | burglary/B&E |
| LICENSE PREMISE VIOLATION | 4,388 | `society` | licensed-premise violations |
| FRAUD - IMPERSONATION | 4,156 | `property` | fraud/forgery |
| FORGERY / COUNTERFEITING | 3,820 | `property` | fraud/forgery |
| M/V - LEAVING SCENE - PERSONAL INJURY | 3,744 | `other` | leaving-scene reports (traffic context) |
| ROBBERY - STREET | 3,697 | `property` | robbery |
| DEATH INVESTIGATION | 3,623 | `other` | investigations (no offense established) |
| SERVICE TO OTHER PD INSIDE OF MA. | 3,530 | `other` | service calls |
| M/V ACCIDENT - INVOLVING PEDESTRIAN - INJURY | 3,452 | `other` | motor-vehicle accidents |
| VAL - VIOLATION OF AUTO LAW - OTHER | 3,268 | `other` | auto-law violations (traffic citations) |
| DRUGS - POSS CLASS B - COCAINE, ETC. | 3,170 | `society` | drug offenses |
| BURGLARY - RESIDENTIAL - FORCE | 2,970 | `property` | burglary/B&E |
| WARRANT ARREST - OUTSIDE OF BOSTON WARRANT | 2,930 | `other` | warrant service (procedural) |
| FIRE REPORT | 2,862 | `other` | fire reports |
| DRUGS - POSS CLASS B - INTENT TO MFR DIST DISP | 2,849 | `society` | drug offenses |
| AUTO THEFT - MOTORCYCLE / SCOOTER | 2,844 | `property` | auto theft |
| MISSING PERSON - NOT REPORTED - LOCATED | 2,842 | `other` | missing-person reports |
| PROPERTY - ACCIDENTAL DAMAGE | 2,824 | `other` | lost/found/accidental property |
| RECOVERED - MV RECOVERED IN BOSTON (STOLEN OUTSIDE BOSTON) | 2,804 | `other` | recoveries (vehicles/property) |
| BURGLARY - RESIDENTIAL - NO FORCE | 2,802 | `property` | burglary/B&E |
| BALLISTICS EVIDENCE/FOUND | 2,790 | `other` | evidence handling |
| M/V ACCIDENT - POLICE VEHICLE | 2,676 | `other` | motor-vehicle accidents |
| SERVICE TO OTHER AGENCY | 2,621 | `other` | service calls |
| M/V ACCIDENT - OTHER CITY VEHICLE | 2,619 | `other` | motor-vehicle accidents |
| M/V ACCIDENT - INVOLVING BICYCLE - INJURY | 2,572 | `other` | motor-vehicle accidents |
| BURGLARY - COMMERICAL | 2,541 | `property` | burglary/B&E |
| DRUGS - SALE / MANUFACTURING | 2,472 | `society` | drug offenses |
| VAL - OPERATING WITHOUT LICENSE | 2,362 | `other` | auto-law violations (traffic citations) |
| LANDLORD - TENANT | 2,343 | `other` | service calls |
| STOLEN PROPERTY - BUYING / RECEIVING / POSSESSING | 2,150 | `property` | stolen-property offenses |
| M/V ACCIDENT INVOLVING PEDESTRIAN - INJURY | 2,073 | `other` | motor-vehicle accidents |
| WEAPON VIOLATION - CARRY/ POSSESSING/ SALE/ TRAFFICKING/ OTHER | 2,041 | `society` | weapons offenses |
| SEARCH WARRANT | 2,038 | `other` | warrant service (procedural) |
| FIREARM/WEAPON - FOUND OR CONFISCATED | 2,009 | `other` | found/confiscated items |
| FRAUD - WIRE | 1,960 | `property` | fraud/forgery |
| DRUGS - POSS CLASS A - HEROIN, ETC.  | 1,838 | `society` | drug offenses |
| M/V PLATES - LOST | 1,687 | `other` | plates lost/recovered |
| DRUGS - POSS CLASS A - INTENT TO MFR DIST DISP | 1,627 | `society` | drug offenses |
| FIRE REPORT - HOUSE, BUILDING, ETC. | 1,607 | `other` | fire reports |
| DISORDERLY CONDUCT | 1,582 | `society` | public order / disorder |
| VIOL. OF RESTRAINING ORDER W NO ARREST | 1,426 | `society` | court-order violations |
| DRUGS - SICK ASSIST - HEROIN | 1,419 | `other` | medical assists (incl. drug-related illness) |
| ANIMAL INCIDENTS (DOG BITES, LOST DOG, ETC) | 1,415 | `other` | animal incidents |
| M/V ACCIDENT - INVOLVING PEDESTRIAN - NO INJURY | 1,374 | `other` | motor-vehicle accidents |
| DRUGS - OTHER | 1,370 | `society` | drug offenses |
| FRAUD - WELFARE | 1,330 | `property` | fraud/forgery |
| LANDLORD - TENANT SERVICE | 1,260 | `other` | service calls |
| DISTURBING THE PEACE/ DISORDERLY CONDUCT/ GATHERING CAUSING ANNOYANCE/ NOISY PAR | 1,252 | `society` | public order / disorder |
| VAL - OPERATING UNREG/UNINS CAR | 1,249 | `other` | auto-law violations (traffic citations) |
| NOISY PARTY/RADIO-NO ARREST | 1,247 | `society` | public order / disorder |
| LIQUOR - DRINKING IN PUBLIC | 1,200 | `society` | liquor / OUI |
| WEAPON - FIREARM - CARRYING / POSSESSING, ETC | 1,169 | `society` | weapons offenses |
| PROPERTY - MISSING | 1,164 | `other` | lost/found/accidental property |
| M/V ACCIDENT - INVOLVING BICYCLE - NO INJURY | 1,132 | `other` | motor-vehicle accidents |
| DRUGS - POSS CLASS D - INTENT TO MFR DIST DISP | 1,126 | `society` | drug offenses |
| AUTO THEFT - LEASED/RENTED VEHICLE | 1,086 | `property` | auto theft |
| BURGLARY - COMMERICAL - FORCE | 1,078 | `property` | burglary/B&E |
| VAL - OPERATING W/O AUTHORIZATION LAWFUL | 1,058 | `other` | auto-law violations (traffic citations) |
| VIOLATION - CITY ORDINANCE | 1,049 | `society` | ordinance violations |
| EXTORTION OR BLACKMAIL | 1,036 | `property` | extortion |
| LARCENY PICK-POCKET | 965 | `property` | larceny/theft |
| DRUGS - POSS CLASS D | 957 | `society` | drug offenses |
| OTHER OFFENSE | 917 | `other` | unspecified offense |
| DISTURBING THE PEACE | 910 | `society` | public order / disorder |
| GRAFFITI | 811 | `property` | vandalism |
| BURGLARY - RESIDENTIAL - ATTEMPT | 801 | `property` | burglary/B&E |
| WEAPON - OTHER - CARRYING / POSSESSING, ETC | 758 | `society` | weapons offenses |
| PROPERTY - STOLEN THEN RECOVERED | 735 | `other` | recoveries (vehicles/property) |
| ROBBERY - OTHER | 734 | `property` | robbery |
| EMBEZZLEMENT | 725 | `property` | embezzlement |
| SUICIDE / SUICIDE ATTEMPT | 723 | `other` | suicide / attempt (medical, not an offense) |
| DANGEROUS OR HAZARDOUS CONDITION | 705 | `other` | hazardous conditions |
| EVADING FARE | 705 | `property` | fare evasion (theft of services) |
| ROBBERY - COMMERCIAL | 670 | `property` | robbery |
| HARBOR INCIDENT / VIOLATION | 637 | `other` | aircraft/harbor incidents |
| FIRE REPORT - CAR, BRUSH, ETC. | 635 | `other` | fire reports |
| PROPERTY - LOST THEN LOCATED | 625 | `other` | lost/found/accidental property |
| LIQUOR/ALCOHOL - DRINKING IN PUBLIC | 618 | `society` | liquor / OUI |
| DRUGS - POSS CLASS E | 617 | `society` | drug offenses |
| OPERATING UNDER THE INFLUENCE (OUI) ALCOHOL | 609 | `society` | liquor / OUI |
| OPERATING UNDER THE INFLUENCE ALCOHOL | 598 | `society` | liquor / OUI |
| WARRANT ARREST - BOSTON WARRANT (MUST BE SUPPLEMENTAL) | 565 | `other` | warrant service (procedural) |
| DRUGS - POSS CLASS C | 544 | `society` | drug offenses |
| FUGITIVE FROM JUSTICE | 536 | `other` | fugitive processing (procedural) |
| INTIMIDATING WITNESS | 476 | `persons` | harassment/stalking/intimidation |
| AFFRAY | 472 | `society` | public order / disorder |
| ANIMAL CONTROL - DOG BITES - ETC. | 469 | `other` | animal incidents |
| FIRE REPORT/ALARM - FALSE | 439 | `other` | fire reports |
| LIQUOR LAW VIOLATION | 406 | `society` | liquor / OUI |
| BURGLARY - COMMERICAL - NO FORCE | 380 | `property` | burglary/B&E |
| DRUGS - SICK ASSIST - OTHER HARMFUL DRUG | 374 | `other` | medical assists (incl. drug-related illness) |
| ANIMAL INCIDENTS | 368 | `other` | animal incidents |
| DRUGS - SICK ASSIST - OTHER NARCOTIC | 338 | `other` | medical assists (incl. drug-related illness) |
| MURDER, NON-NEGLIGIENT MANSLAUGHTER | 337 | `persons` | homicide |
| VIOL. OF RESTRAINING ORDER W ARREST | 324 | `society` | court-order violations |
| DEMONSTRATIONS/RIOT | 317 | `society` | public order / disorder |
| BURGLARY - OTHER - FORCE | 277 | `property` | burglary/B&E |
| ARSON | 268 | `property` | arson |
| CHILD ENDANGERMENT | 268 | `persons` | crimes against children |
| INVESTIGATION FOR ANOTHER AGENCY | 267 | `other` | investigations (no offense established) |
| DRUGS - POSS CLASS C - INTENT TO MFR DIST DISP | 267 | `society` | drug offenses |
| WEAPON - FIREARM - OTHER VIOLATION | 262 | `society` | weapons offenses |
| POSSESSION OF BURGLARIOUS TOOLS | 258 | `property` | burglary/B&E |
| DRUGS - CLASS B TRAFFICKING OVER 18 GRAMS | 257 | `society` | drug offenses |
| BOMB THREAT | 255 | `persons` | threats (incl. bomb/biological threats = intimidation) |
| SERVICE TO OTHER PD OUTSIDE OF MA. | 241 | `other` | service calls |
| PROSTITUTION - SOLICITING | 240 | `society` | prostitution |
| DRUGS - POSSESSION OF DRUG PARAPHANALIA | 233 | `society` | drug offenses |
| BURGLARY - OTHER - NO FORCE | 220 | `property` | burglary/B&E |
| LARCENY PURSE SNATCH - NO FORCE  | 212 | `property` | larceny/theft |
| REPORT AFFECTING OTHER DEPTS. | 211 | `other` | service calls |
| ANIMAL ABUSE | 210 | `society` | animal cruelty |
| DRUGS - CLASS A TRAFFICKING OVER 18 GRAMS | 206 | `society` | drug offenses |
| VIOLATION - RESTRAINING ORDER (NO ARREST) | 205 | `society` | court-order violations |
| AIRCRAFT INCIDENTS | 203 | `other` | aircraft/harbor incidents |
| ROBBERY - BANK | 201 | `property` | robbery |
| BREAKING AND ENTERING (B&E) MOTOR VEHICLE | 194 | `property` | burglary/B&E |
| RECOVERED - MV RECOVERED IN BOSTON (STOLEN IN BOSTON) MUST BE SUPPLEMENTAL | 194 | `other` | recoveries (vehicles/property) |
| INJURY BICYCLE NO M/V INVOLVED | 184 | `other` | bicycle injuries (no offense) |
| CHILD ENDANGERMENT (NO ASSAULT) | 177 | `persons` | crimes against children |
| DRUGS - POSS CLASS E - INTENT TO MFR DIST DISP | 169 | `society` | drug offenses |
| WEAPON - OTHER - OTHER VIOLATION | 161 | `society` | weapons offenses |
| DRUGS - POSSESSION | 155 | `society` | drug offenses |
| CRIMINAL HARASSMENT | 144 | `persons` | harassment/stalking/intimidation |
| BURGLARY - COMMERICAL - ATTEMPT | 137 | `property` | burglary/B&E |
| LARCENY PURSE SNATCH - NO FORCE | 126 | `property` | larceny/theft |
| ANNOYING AND ACCOSTING | 125 | `persons` | harassment/stalking/intimidation |
| ROBBERY - HOME INVASION | 123 | `property` | robbery |
| MURDER, NON-NEGLIGENT MANSLAUGHTER | 122 | `persons` | homicide |
| BREAKING AND ENTERING (B&E) MOTOR VEHICLE (NO PROPERTY STOLEN) | 108 | `property` | burglary/B&E |
| OBSCENE MATERIALS - PORNOGRAPHY | 103 | `society` | obscenity |
| OPERATING UNDER THE INFLUENCE DRUGS | 100 | `society` | drug offenses |
| ROBBERY - CAR JACKING | 99 | `property` | robbery |
| TRUANCY / RUNAWAY | 95 | `other` | juvenile status/service |
| DRUGS - CONSP TO VIOL CONTROLLED SUBSTANCE | 91 | `society` | drug offenses |
| HOME INVASION | 84 | `property` | home invasion |
| VIOLATION - HARASSMENT PREVENTION ORDER | 82 | `society` | court-order violations |
| RECOVERED STOLEN PLATE | 80 | `other` | plates lost/recovered |
| PRISONER - SUICIDE / SUICIDE ATTEMPT | 75 | `other` | suicide / attempt (medical, not an offense) |
| KIDNAPPING/CUSTODIAL KIDNAPPING/ ABDUCTION | 64 | `persons` | kidnapping |
| STALKING | 63 | `persons` | harassment/stalking/intimidation |
| Migrated Report - Other Larceny | 63 | `property` | larceny/theft |
| KIDNAPPING - ENTICING OR ATTEMPTED | 61 | `persons` | kidnapping |
| Migrated Report - Other Part III | 60 | `other` | (fallback — unmatched, defaults to other) |
| OBSCENE PHONE CALLS | 57 | `persons` | harassment/stalking/intimidation |
| KIDNAPPING/CUSTODIAL KIDNAPPING | 55 | `persons` | kidnapping |
| CHILD ABANDONMENT (NO ASSAULT) | 53 | `persons` | crimes against children |
| OPERATING UNDER THE INFLUENCE (OUI) DRUGS | 53 | `society` | drug offenses |
| PROTECTIVE CUSTODY / SAFEKEEPING | 52 | `other` | custody/prisoner events |
| Migrated Report - Aggravated Assault/Aggravated Assault & Battery | 52 | `persons` | assaults |
| Migrated Report - Drugs - Possession/Manufacturing/Distribute | 52 | `society` | drug offenses |
| FIREARM/WEAPON - LOST | 51 | `other` | lost/accidental weapon reports |
| CHILD REQUIRING ASSISTANCE (FOMERLY CHINS) | 48 | `other` | juvenile status/service |
| PROSTITUTION | 47 | `society` | prostitution |
| VIOLATION - CITY ORDINANCE CONSTRUCTION PERMIT | 47 | `society` | ordinance violations |
| EXPLOSIVES - POSSESSION OR USE | 46 | `society` | weapons offenses |
| BURGLARY - OTHER - ATTEMPT | 43 | `property` | burglary/B&E |
| PROPERTY - CONCEALING LEASED | 40 | `property` | concealing leased property |
| LARCENY THEFT FROM COIN-OP MACHINE | 39 | `property` | larceny/theft |
| Migrated Report - Assault/Assault & Battery | 39 | `persons` | assaults |
| DRUNKENNESS | 39 | `society` | liquor / OUI |
| CHINS | 38 | `other` | juvenile status/service |
| EXPLOSIVES - TURNED IN OR FOUND | 38 | `other` | found/confiscated items |
| NOISY PARTY/RADIO-ARREST | 34 | `society` | public order / disorder |
| FIREARM/WEAPON - ACCIDENTAL INJURY / DEATH | 32 | `other` | lost/accidental weapon reports |
| Migrated Report - Other Part II | 31 | `other` | (fallback — unmatched, defaults to other) |
| GATHERING CAUSING ANNOYANCE | 26 | `society` | public order / disorder |
| VIOLATION - HAWKER AND PEDDLER | 26 | `society` | ordinance violations |
| Migrated Report - Burglary/Breaking and Entering | 26 | `property` | burglary/B&E |
| CONSPIRACY EXCEPT DRUG LAW | 24 | `other` | conspiracy (non-drug) |
| Migrated Report - Motor Vehicle Crash | 19 | `other` | motor-vehicle accidents |
| ASSAULT & BATTERY | 17 | `persons` | assaults |
| MANSLAUGHTER - VEHICLE - NEGLIGENCE | 17 | `persons` | homicide |
| Migrated Report - Death Investigation | 17 | `other` | investigations (no offense established) |
| WEAPON - FIREARM - SALE / TRAFFICKING | 16 | `society` | weapons offenses |
| Migrated Report - Vandalism/Destruction of Property | 16 | `property` | vandalism |
| PROSTITUTION - COMMON NIGHTWALKER | 13 | `society` | prostitution |
| LARCENY IN A BUILDING $200 & OVER | 13 | `property` | larceny/theft |
| DRUGS - CLASS D TRAFFICKING OVER 50 GRAMS | 12 | `society` | drug offenses |
| LARCENY OTHER $200 & OVER | 11 | `property` | larceny/theft |
| Migrated Report - Fraud | 11 | `property` | fraud/forgery |
| Migrated Report - Robbery | 11 | `property` | robbery |
| Migrated Report - Investigate Property | 11 | `other` | investigations (no offense established) |
| ABDUCTION - INTICING | 10 | `persons` | kidnapping |
| LARCENY SHOPLIFTING $200 & OVER | 10 | `property` | larceny/theft |
| Migrated Report - Investigate Person | 10 | `other` | investigations (no offense established) |
| Migrated Report - Weapons Violation | 10 | `society` | weapons offenses |
| ASSAULT & BATTERY D/W - OTHER | 9 | `persons` | assaults |
| Migrated Report - Auto Theft | 9 | `property` | auto theft |
| CUSTODIAL KIDNAPPING | 8 | `persons` | kidnapping |
| LARCENY BICYCLE $200 & OVER | 8 | `property` | larceny/theft |
| CONTRIBUTING TO DELINQUENCY OF MINOR | 8 | `other` | juvenile-related (procedural) |
| GAMBLING - BETTING / WAGERING | 8 | `society` | gambling |
| DRUGS - POSS CLASS A - HEROIN, ETC. | 8 | `society` | drug offenses |
| HUMAN TRAFFICKING - COMMERCIAL SEX ACTS | 8 | `persons` | human trafficking |
| A&B ON POLICE OFFICER | 7 | `persons` | assaults |
| PRISONER ESCAPE / ESCAPE & RECAPTURE | 7 | `other` | custody/prisoner events |
| PROSTITUTION - ASSISTING OR PROMOTING | 7 | `society` | prostitution |
| Migrated Report - Auto Law Violation | 7 | `other` | auto-law violations (traffic citations) |
| Migrated Report - Larceny From MV | 7 | `property` | larceny/theft |
| LARCENY SHOPLIFTING UNDER $50 | 6 | `property` | larceny/theft |
| FIREARM/WEAPON - POSSESSION OF DANGEROUS | 5 | `society` | weapons offenses |
| B&E NON-RESIDENCE DAY - FORCIBLE | 5 | `property` | burglary/B&E |
| ROBBERY - UNARMED - STREET | 5 | `property` | robbery |
| ROBBERY - UNARMED - CHAIN STORE | 5 | `property` | robbery |
| Migrated Report - Criminal Homicide | 5 | `persons` | homicide |
| AUTO THEFT - RECOVERED IN BY POLICE | 4 | `other` | recoveries (vehicles/property) |
| PROPERTY - RECEIVING STOLEN | 4 | `property` | stolen-property offenses |
| Migrated Report - Counterfeiting/Forgery | 4 | `property` | fraud/forgery |
| ANNOYING AND ACCOSTIN | 3 | `persons` | harassment/stalking/intimidation |
| B&E RESIDENCE NIGHT - ATTEMPT FORCE | 3 | `property` | burglary/B&E |
| LARCENY SHOPLIFTING $50 TO $199 | 3 | `property` | larceny/theft |
| FORGERY OR UTTERING | 3 | `property` | fraud/forgery |
| B&E RESIDENCE DAY - NO PROP TAKEN | 3 | `property` | burglary/B&E |
| LARCENY OTHER $50 TO $199 | 3 | `property` | larceny/theft |
| LARCENY NON-ACCESSORY FROM VEH. UNDER $50 | 3 | `property` | larceny/theft |
| BIOLOGICAL THREATS | 3 | `persons` | threats (incl. bomb/biological threats = intimidation) |
| LARCENY IN A BUILDING UNDER $50 | 3 | `property` | larceny/theft |
| Migrated Report - Stolen Property | 3 | `property` | stolen-property offenses |
| Justifiable Homicide | 3 | `persons` | homicide |
| ROBBERY ATTEMPT - KNIFE - BANK | 2 | `property` | robbery |
| COUNTERFEITING | 2 | `property` | fraud/forgery |
| ASSAULT D/W - OTHER | 2 | `persons` | assaults |
| B&E NON-RESIDENCE DAY - NO FORCE | 2 | `property` | burglary/B&E |
| B&E NON-RESIDENCE DAY - NO PROP TAKEN | 2 | `property` | burglary/B&E |
| DRUGS - POSS CLASS D - MARIJUANA, ETC. | 2 | `society` | drug offenses |
| DRUGS - POSS CLASS E INTENT TO MF DIST DISP | 2 | `society` | drug offenses |
| LARCENY NON-ACCESSORY FROM VEH. $50 TO $199 | 2 | `property` | larceny/theft |
| ASSAULT & BATTERY D/W - KNIFE | 2 | `persons` | assaults |
| LARCENY IN A BUILDING $50 TO $199 | 2 | `property` | larceny/theft |
| PROSTITUTE - COMMON NIGHTWALKER | 2 | `society` | prostitution |
| ROBBERY - UNARMED - RESIDENCE | 2 | `property` | robbery |
| MANSLAUGHTER - NON-VEHICLE - NEGLIGENCE | 2 | `persons` | homicide |
| HUMAN TRAFFICKING - INVOLUNTARY SERVITUDE | 2 | `persons` | human trafficking |
| LARCENY NON-ACCESSORY FROM VEH. $200 & OVER | 2 | `property` | larceny/theft |
| DRUGS - POSS CLASS D - INTENT MFR DIST DISP | 2 | `society` | drug offenses |
| Migrated Report - Affray/Disturbing the Peace/Disorderly Conduct | 2 | `society` | public order / disorder |
| MANSLAUGHTER - NEGLIGENCE | 2 | `persons` | homicide |
| ASSAULT D/W - KNIFE ON POLICE OFFICER | 1 | `persons` | assaults |
| ROBBERY - KNIFE - STREET | 1 | `property` | robbery |
| CHILD ABUSE | 1 | `persons` | crimes against children |
| FRAUDS - ALL OTHER | 1 | `property` | fraud/forgery |
| FIREARM/WEAPON - CARRY - SELL - RENT | 1 | `society` | weapons offenses |
| B&E RESIDENCE DAY - NO FORCE | 1 | `property` | burglary/B&E |
| KILLING OF FELON BY POLICE | 1 | `persons` | homicide |
| FRAUD - FALSE PRETENSE | 1 | `property` | fraud/forgery |
| AUTO THEFT LEASE/RENT VEHICLE | 1 | `property` | auto theft |
| A&B HANDS, FEET, ETC.  - MED. ATTENTION REQ. | 1 | `persons` | assaults |
| AUTO THEFT OTHER | 1 | `property` | auto theft |
| AUTO THEFT - OUTSIDE - RECOVERED IN BOSTON | 1 | `other` | recoveries (vehicles/property) |
| DRUGS - GLUE INHALATION | 1 | `society` | drug offenses |
| VIOLATION - RESTRAINING ORDER | 1 | `society` | court-order violations |
| ASSAULT & BATTERY D/W - OTHER ON POLICE OFFICER | 1 | `persons` | assaults |
| PRISONER ATTEMPT TO RESCUE | 1 | `other` | custody/prisoner events |
| Migrated Report - Embezzlement | 1 | `property` | embezzlement |
| Migrated Report - Injured/Medical/Sick Assist | 1 | `other` | medical assists (incl. drug-related illness) |
| Migrated Report - Kidnapping | 1 | `persons` | kidnapping |
| Evidence Tracker Incidents | 1 | `other` | evidence handling |

### Coverage

- Placed (one of the 12 districts, 2015-08-01…2026-06-30): **918,079** (99.4%)
- Unplaced (non-district DISTRICT values, disclosed above): 5,694
- Identity `placed + unplaced == citywide` validated per month × category in-script; per-resource grouped sums verified against independent `COUNT(*)`.

## Geometry source — BPD district polygons

| Field | Value |
|-------|-------|
| Dataset | **Boston Police Districts** — 12 polygons (official City of Boston GIS) |
| MapServer | https://gisportal.boston.gov/arcgis/rest/services/PublicSafety/OpenData/MapServer/5 |
| Join key | `DISTRICT` — matches the crime data's district codes **verbatim 12↔12** (no fuzzy matching) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (`points.json`)

`Lat`/`Long` are TEXT in the source; **47,775 window rows (5.2%) are null-or-zero** and get no dot — but they are still counted in every timeline total via `DISTRICT`. Points shown are **real incident coordinates published by BPD**, never synthesized. Client-side gate: parseable lat 42.22–42.4, lng -71.19–-70.95. Deterministic sample: per month, first 150 rows in `_id` order with non-null/non-zero coords, gated, even-stride ≤100/month → **13,100 points ≈ 1 per 67 of the 875,998 placeable rows** (placeable = textual not-null/not-zero filter; the bbox gate re-rejects residual junk client-side).

## Historical source — FBI UCR (1985–2015 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Boston Police Department — **ORI `MA0130100`** |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/MA0130100/violent-crime (and `/property-crime`) |
| Span | 1985–2015, annual Violent + Property (12 reported months verified per year) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set `FBI_API_KEY`) |

UCR Summary (Violent/Property) is a **different taxonomy** than the BPD incident categories — the eras are presented as distinct; history runs through 2015 and the granular era's first full calendar year is 2016. No monthly or district detail is implied for 1985–2015.

## Reproduce

```bash
FBI_API_KEY=… node pipeline/sources/boston-ma.mjs
```

## Long-arc trend — placed-share audit (verified 2026-07-19)

Incident-era annuals (2016–2025, crime cats only) are sums of the timeline's
placed (district) cells. Measured at the source (grouped by year × offense ×
district, same RULES mapping): placed share ranges 98.43–99.70% (dips: 2019 =
98.96%, 2021 = 98.43%), drift ≤1.3 pp; replication exact. Story check:
2016→2025 = −36.03% placed vs −36.12% citywide; 2022 stays the era minimum in
both series. Certified immaterial; not rebuilt.
