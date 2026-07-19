# Provenance — Dallas, TX

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## ⚠ SOURCE SCOPE FILTER — read first

**DPD filters this public dataset before release.** Quoting the dataset description ("Among the exclusions are"):

> 1.) Sexually oriented offenses
> 2.) Offenses where juveniles or children (individuals under 17 years of age) are the victim or suspect
> 3.) Listing of property items that are considered evidence
> 4.) Social Service Referral offenses
> 5.) Identifying vehicle information in certain offenses

**Sexual offenses and juvenile-involved cases never appear in this data.** Every count, map, and trend below therefore **undercounts actual reported crime**, and rape/sexual-assault categories are structurally absent. This is disclosed on-screen (data note) and in `summary.scopeNote`. The city also states the dataset is published "for research purposes only" and that the authoritative source is DPD's Crime Analytics Dashboard.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **Police Incidents** (Socrata `qv6i-rri7`) |
| Publisher | Dallas Police Department (DPD), via dallasopendata.com |
| Landing page | https://www.dallasopendata.com/d/qv6i-rri7 |
| API | https://www.dallasopendata.com/resource/qv6i-rri7.json |
| Fetched | 2026-07-18T11:54:51.914Z |
| License | **ODC-BY** (Open Data Commons Attribution, http://opendatacommons.org/licenses/by/1.0/), attribution "Dallas Police Department" |
| Span | RMS incidents June 1, 2014 → current; **granular window 2015-01-01 → 2026-06-30** (first full calendar year → last full month, measured) |
| Records used | 1,437,644 victim-level rows → **1,200,698 incidents** (deduplicated, see below) |
| Source caveat | Preliminary classifications, may change with investigation; DPD explicitly does not guarantee accuracy/completeness and warns against over-time comparison — trends are shown with this caveat |

### Row grain + dedupe (disclosed method)
The source is **victim/involvement-level**: one row per involved person, `servnumid` = `incidentnum` + per-person suffix (`-01`, `-02`, …). Measured 1,437,644 rows → 1,200,698 distinct incidents in-window (~1.20× inflation). Dedupe rule: keep the row with the **lexicographically smallest servnumid** (the source's first service number, normally `-01`) — deterministic, no seriousness bias. Validation: the client-side dedupe is reconciled **per month** against an independent server-side `count(distinct incidentnum)` — exact match required for all 138 months. Among the 236,946 dropped extra-victim rows, 32,907 carry a different category and 1 a different division than the kept row (an incident with a murdered victim and an assaulted victim counts once, under the first service number's offense).

### Windowing (disclosed exclusions)
Whole dataset at fetch time: **1,502,297 rows** = 59,203 pre-2015 + 1,437,644 window + 5,450 post-window (identity validated in-script).
- **59,203 rows dated before 2015-01-01** are excluded from the granular era: the source starts 2014-06-01 (2014 is a partial year) and carries a thin tail of old occurrence dates back to 1967 (incidents reported long after the fact — real records, not junk, but outside the honest monthly window).
- **5,450 rows dated 2026-07-01+** (partial July at fetch) are excluded; the window ends at the last FULL month, 2026-06 (measured: June ~10.5k rows vs May ~11k — complete; July mid-month).

### date1 parsing (TEXT column — handled deliberately)
`date1` ("Date1 of Occurrence") is **TEXT** ("YYYY-MM-DD HH:MM:SS.NNNNNNN"), verified **0 null and 0 malformed** across the whole dataset; window filters use lexicographic comparison, month binning uses the "YYYY-MM" prefix. Sanity check against DPD's own `year1`/`month1` occurrence fields: **0 mismatched + 0 missing of 1,437,644 rows** (<0.5%, asserted in-script).

### Fields used
`incidentnum` · `servnumid` · `date1` (TEXT) · `year1`/`month1` (binning sanity) · `division` · `nibrs_crimeagainst` · `ucr_offense` · `offincident` · `geocoded_column` (Socrata location).

### Category mapping — two documented bases (counts per basis)
| Basis | Incidents | Rule |
|-------|----------:|------|
| **Native NIBRS** (2017+) | 704,338 | `nibrs_crimeagainst`: PERSON→persons, PROPERTY→property, SOCIETY→society |
| Native mixed/misc → other | 317,739 | "PERSON, PROPERTY, OR SOCIETY" (DPD's mixed-target bucket: ~62% ALL OTHER OFFENSES + ~38% traffic) and "MISCELLANEOUS" — context only, never counted as Group A crime |
| **UCR fallback** (2015–2016) | 175,201 | The source's NIBRS fields are blank before 2017 (>99.9% of 2015–2016 rows); categories derive from `ucr_offense` — 49 values, fully enumerated below |
| Unclassified → other | 3,420 | Neither field populated (mostly ~1k/yr recent rows) — counted, shown as `other` |

**The 2015–2016 and 2017+ segments therefore classify by different source fields** — both follow the same FBI crimes-against convention, and the seam is disclosed here rather than hidden.

#### UCR fallback table (complete, 49 values — audit fails loudly on anything new)
| cat | ucr_offense values |
|-----|--------------------|
| `persons` | ASSAULT · AGG ASSAULT - NFV · MURDER · TERRORISTIC THREAT · OFFENSE AGAINST CHILD · KIDNAPPING · INTOXICATION MANSLAUGHTER |
| `property` | THEFT/BMV · UUMV · VANDALISM & CRIM MISCHIEF · BURGLARY-RESIDENCE · OTHER THEFTS · BURGLARY-BUSINESS · ROBBERY-INDIVIDUAL · ROBBERY-BUSINESS · THEFT/SHOPLIFT · THEFT ORG RETAIL · FRAUD · FORGE & COUNTERFEIT · FORGERY & COUNTERFEITING · EMBEZZLEMENT · ARSON (robbery + fraud + arson are crimes against property per NIBRS) |
| `society` | DRUNK & DISORDERLY · DISORDERLY CONDUCT · DWI · NARCOTICS & DRUGS · WEAPONS · LIQUOR OFFENSE · GAMBLING · ORGANIZED CRIME · ORANIZED CRIME · CRIMINAL TRESPASS · EVADING · RESIST ARREST · FAIL TO ID · ESCAPE (NIBRS Group B offenses are designated crimes against society; "ORANIZED CRIME" is a source typo variant) |
| `other` | FOUND · LOST · ACCIDENT MV · MOTOR VEHICLE ACCIDENT · TRAFFIC FATALITY · TRAFFIC VIOLATION · SUDDEN DEATH&FOUND BODIES · INJURED PUBLIC · INJURED HOME · INJURED FIREARM · INJURED OCCUPA · ANIMAL BITE · OTHERS (non-offense reports: found/lost property, accidents, injured-person, death investigations, catch-all "OTHERS") |

#### Window totals by cat
| cat | incidents |
|---|--:|
| persons | 76,856 |
| property | 663,172 |
| society | 106,470 |
| other (mixed / non-criminal / unclassified) | 354,200 |

### Coverage
- Placed (one of the 8 official DPD divisions): **1,199,851** (99.9%)
- Unplaced: 847 incidents with a blank `division` — kept in every citywide total and disclosed.
- Identities validated in-script: per-month client dedupe == server `count(distinct incidentnum)` (independent reconciliation, 138/138 months); cells+unplaced == citywide per month; row partition pre+window+post == whole dataset.

## Geometry source — official DPD division polygons

| Field | Value |
|-------|-------|
| Dataset | **Dallas Police Divisions** — 8 polygons (Central, Northeast, Southeast, Southwest, Northwest, North Central, South Central, CBD), field `DIVISION` |
| FeatureServer | https://services1.arcgis.com/In9TiV3Fv4nmmrag/arcgis/rest/services/Division/FeatureServer/0 |
| Publisher | DPD Crime Analysis Unit (ArcGIS Online item `3ce570ceaeaf470d974f0d8695271bcf`, owner `dwight.beaty_DPDCAU`) |
| Join key | `DIVISION` — matches the crime data's uppercased `division` values **verbatim, 8 of 8** (identity join; ≈550 mixed-case crime-data variants like "NorthEast" normalize to the same keys) |
| Disclaimer (verbatim) | "This data is to be used for graphical representation only. The accuracy is not to be taken/used as data produced by a Registered Professional Land Surveyor (RPLS) for the State of Texas. … (State of Texas: H.B. 1147)" |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

Only **8 regions** — the leaderboard shows top 6 and the region quiz still works (same note as Nashville/Memphis in the batch spec). "CBD" is displayed as "Downtown (CBD)".

## Real incident points (`points.json`)

Every dot is a real incident location **geocoded and published by DPD** (street-address grain, Socrata `geocoded_column`), never synthesized. In-window: 1,193,023 incidents (99.8%) have usable in-bbox coordinates; 7,034 lack coordinates and 641 carry out-of-bbox/junk coordinates (gate: lat 32.62–33.02, lng -96.99–-96.55) — all still counted in every total, only missing from the dot layer. Deterministic sample: per month, even-stride ≤100 from fetch order → **13,800 points ≈ 1 per 86**. Remember the scope filter: sexual offenses and juvenile-involved cases can never appear as dots because DPD excludes them at the source.

## Historical source — FBI UCR (1985–2014 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Dallas Police Department — **ORI `TXDPD0000`** (verified: returns "Dallas Police Department Offenses" series) |
| ⚠ ORI correction | The batch-spec scouted ORI `TX0570200` is **wrong** — CDE returns *Balch Springs PD* for it. Corrected via the CDE `agency/byStateAbbr/TX` lookup; 1985 plausibility asserted in-script (1985 total ≈130k offenses — big-city scale, vs ~2–3k for a suburb) |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/TXDPD0000/violent-crime (and `/property-crime`) |
| Span | 1985–2014, annual Violent + Property (12 reported months verified per year) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set `FBI_API_KEY`) |

UCR Summary (Violent/Property) is a **different taxonomy** than the DPD RMS data — the eras are presented as distinct and bridge at 2015; they are never equated. Extra reason here: UCR Violent **includes rape**, while the modern DPD dataset **excludes all sexual offenses** — a direct numeric comparison would be dishonest and is never made. No monthly or division detail is implied for 1985–2014.

## Reproduce

```bash
FBI_API_KEY=… node pipeline/sources/dallas-tx.mjs
```
