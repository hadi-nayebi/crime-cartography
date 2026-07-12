# Data Provenance — index

Every dataset records its source URL, fetch date, license, and field mapping in
`data/<slug>/PROVENANCE.md`. This page indexes them. **No dataset ships without
a reliable, citable source link.**

## grand-rapids-mi — Grand Rapids, MI

- **Records source:** GRPD Crime Data, City of Grand Rapids ArcGIS Hub
  - Layer: `GRPD_Crime_Data/FeatureServer/0` @
    `services2.arcgis.com/L81TiOwAPO1ZvU9b`
  - Hub: https://grpd-grandrapids.hub.arcgis.com/datasets/grandrapids::grpd-crime-data
- **Beat polygons source:** GRPD Service Area Map
  - Layer: `GRPD_SERVICE_AREA_MAP_NEW/FeatureServer/1`
- **Neighborhood names source:** City of Grand Rapids Neighborhood Areas
  - Layer: `City_of_Grand_Rapids_Neighborhood_Areas/FeatureServer/0` (field `NEBRH`)
  - Each beat centroid → containing neighborhood polygon (point-in-polygon);
    a *locator* label only (`CENTRAL 3` → "Oldtown-Heartside"), not a data change.
- **Deep-history source (2000–2022):** FBI Crime Data Explorer (CDE) — Grand
  Rapids PD, **ORI MI4143600** — real annual Violent + Property counts, 23 full
  years. Shown as a labeled monthly average; UCR taxonomy kept distinct from
  NIBRS. Endpoint: `api.usa.gov/crime/fbi/cde/summarized/agency/MI4143600/...`
- **Span:** 2000–2022 (FBI UCR annual) + 2023-01-01 → 2026-06-01 (GRPD, 42 months)
- **Records:** 210,488 total · 203,480 mapped to a beat (**96.7% coverage**) ·
  7,008 with an unmatched/blank beat code, kept in totals and disclosed.
- **License:** City of Grand Rapids GIS Data Access & Use Constraint Agreement
  (data provided "as is", as a complementary public service).
- **Honesty note:** the records layer has **no coordinates** (`geometryType:
  None`). We therefore animate **per-beat aggregates** at real beat centroids —
  never synthesized individual dots. Most records fall in the **Local / Other**
  bucket (local-ordinance reports); these are shown and labeled, never counted
  as violent crime.
- **Detail:** [`data/grand-rapids-mi/PROVENANCE.md`](../data/grand-rapids-mi/PROVENANCE.md)

### Category mapping (NIBRS_Category → cat)

| NIBRS_Category | cat |
|----------------|-----|
| Crimes Against Person(s) | `persons` |
| Crimes Against Property | `property` |
| Crimes Against Society | `society` |
| Local / Local-DL / All Other / 0 | `other` |

## Seattle, WA (`seattle-wa`)

- **Primary source:** SPD Crime Data: 2008-Present (Socrata `tazs-3rd5`,
  https://data.seattle.gov/d/tazs-3rd5) — Public Domain, attribution "SPD".
  Only finalized (UCR-approved) reports; updated daily.
- **Spatial unit:** the 58 official **MCPP neighborhoods** — the crime data's
  `neighborhood` field matches the MCPP polygon layer verbatim (identity join,
  no approximation). Polygons: ArcGIS `MCPP/FeatureServer/0`.
- **Deep-history source (1985–2016):** FBI Crime Data Explorer (CDE) —
  Seattle PD, **ORI WASPD0000** — real annual Violent + Property counts,
  32 full years (12 reported months each, verified). UCR taxonomy kept
  distinct from NIBRS; eras bridge at 2017.
- **Span:** 1985–2016 (FBI UCR annual) + 2017-01-01 → 2026-06-30 (SPD NIBRS
  with MCPP detail, 114 months). SPD rows 2008–2016 predate the MCPP
  field (≈99% "-") and are disclosed as "pre-2017" unplaced, never hidden.
- **Records:** 1,542,608 total (2008-01 → 2026-06) ·
  790,989 placed in an MCPP neighborhood
  (**51.3% coverage**) · 751,619 unplaced
  (738,885 pre-2017 + 12,734 blank/unknown neighborhood), kept in totals and disclosed.
- **Real dots:** SPD publishes block-snapped coordinates, but ≈25.7% are
  REDACTED/sentinel values — dots are a deterministic ≤100/month sample of
  **real** locations; redacted records are counted but not plotted, and the
  video says so.
- **License:** Public Domain (`PUBLIC_DOMAIN`), attribution "SPD"; MCPP
  polygons public domain (City of Seattle).
- **Detail:** [`data/seattle-wa/PROVENANCE.md`](../data/seattle-wa/PROVENANCE.md)

### Category mapping (nibrs_crime_against_category → cat)

| Source value | cat |
|--------------|-----|
| PERSON | `persons` |
| PROPERTY | `property` |
| SOCIETY | `society` |
| ANY / NOT_A_CRIME / "-" | `other` (mixed / non-criminal, context only — never counted as Group A) |

## chicago-il — Chicago, IL

- **Records source:** "Crimes - 2001 to Present" (CPD CLEAR system), Chicago
  Data Portal, Socrata dataset `ijzp-q8t2`
  - API: `data.cityofchicago.org/resource/ijzp-q8t2.json`
  - Hub: https://data.cityofchicago.org/Public-Safety/Crimes-2001-to-Present/ijzp-q8t2
- **Area polygons source:** Chicago community areas (77 official areas)
  - `data.cityofchicago.org/resource/igwz-8jzy.geojson`
  - Community areas double as the resident-known neighborhood names
    (identity mapping in `neighborhoods.json`).
- **Deep-history source (1986–2002):** FBI Crime Data Explorer (CDE) — Chicago
  PD, **ORI ILCPD0000** — real annual Violent + Property counts summed from
  monthly actuals (every kept year verified to have 12 nonzero months; 1985
  dropped: quarterly lumps with zero months in the CDE). 1991 violent peak:
  86,945. Endpoint: `api.usa.gov/crime/fbi/cde/summarized/agency/ILCPD0000/...`
- **Span:** 1986–2002 (FBI UCR annual) + 2003-01 → 2026-06 (Socrata, 282
  months; 2001–2002 excluded from the map era — `community_area` unreliable
  there; partial month 2026-07 dropped).
- **Records:** 8,590,211 total · 7,615,113 mapped to a community area
  (**88.6% coverage**) · unplaced disclosed: 972,806 pre-2003, 1,594 with
  no/invalid area, 698 in the partial month.
- **Points:** REAL block-level anonymized incident locations (City-anonymized),
  deterministic sample ≤100/month — never synthesized dots.
- **License:** Chicago open data terms; required verbatim City disclaimer
  included in the dataset PROVENANCE. FBI CDE is US-government public domain.
- **Detail:** [`data/chicago-il/PROVENANCE.md`](../data/chicago-il/PROVENANCE.md)

### Category mapping (primary_type → cat)

| primary_type group | cat |
|--------------------|-----|
| BATTERY, ASSAULT, HOMICIDE, CRIM(INAL) SEXUAL ASSAULT, SEX OFFENSE, KIDNAPPING, INTIMIDATION, STALKING, OFFENSE INVOLVING CHILDREN, HUMAN TRAFFICKING, DOMESTIC VIOLENCE | `persons` |
| THEFT, BURGLARY, MOTOR VEHICLE THEFT, ROBBERY, ARSON, CRIMINAL DAMAGE, CRIMINAL TRESPASS, DECEPTIVE PRACTICE | `property` |
| NARCOTICS, OTHER NARCOTIC VIOLATION, PROSTITUTION, GAMBLING, WEAPONS VIOLATION, LIQUOR LAW VIOLATION, PUBLIC PEACE VIOLATION, INTERFERENCE WITH PUBLIC OFFICER, PUBLIC INDECENCY, OBSCENITY, CONCEALED CARRY LICENSE VIOLATION | `society` |
| OTHER OFFENSE, NON-CRIMINAL, RITUALISM, anything unrecognized (NOT-IN complement — nothing dropped) | `other` |

## philadelphia-pa — Philadelphia, PA

- **Records source:** "Crime Incidents" (PPD INCT system), Carto SQL API,
  table `incidents_part1_part2`
  - API: `phl.carto.com/api/v2/sql`
  - Hub: https://opendataphilly.org/datasets/crime-incidents/
- **District polygons source:** PPD police districts (21 current districts)
  - `services.arcgis.com/fLeGjb7u4uXqeF9q/.../Boundaries_District/FeatureServer/0`
    (field `dist_numc`, verbatim 21↔21 join with `dc_dist`)
- **Neighborhood names source:** City of Philadelphia Neighborhoods polygons
  (158 named areas, field `MAPNAME`) + official PPD districts list
  (phillypolice.com/district/districts-list/ — divisions, 77th = Airport).
  District numbers are not resident-known, so each district label lists the
  neighborhoods where its REAL sampled incidents fall (point-in-polygon,
  ranked by count; `approx:true` locator labels, e.g.
  "24th · Richmond / Harrowgate") — the boundaries shown are always the
  official district polygons.
- **Deep-history source (1985–2005):** FBI Crime Data Explorer (CDE) —
  Philadelphia PD, **ORI PAPEP0000** — real annual Violent + Property counts
  summed from monthly actuals (every kept year verified to have 12 nonzero
  months). 1999 violent peak: 23,031. Endpoint:
  `api.usa.gov/crime/fbi/cde/summarized/agency/PAPEP0000/...`
- **Span:** 1985–2005 (FBI UCR annual) + 2006-01 → 2026-06 (Carto, 246
  months; partial month 2026-07 dropped and disclosed).
- **Records:** 3,566,030 total · 3,361,035 mapped to a
  current district (**94.3% coverage**) · unplaced disclosed:
  200,745 in retired districts (4th ended 2023, 6th ended 2024, 23rd ended
  2013, retired special code 92 ended 2009 — no current polygon, never
  guessed into a neighbor), 1 row with null date/district,
  4,249 in the partial month.
- **Trend honesty:** district trends crossing a merger date are partly
  boundary changes — the 9th absorbed the 6th (Oct 2024), the 3rd absorbed
  the 4th (Jul 2023), the 22nd/25th absorbed the 23rd (2013). Citywide
  totals are unaffected; per-district narratives must disclose this.
- **Points:** REAL block-level incident locations (PPD-published,
  hundred-block addresses), deterministic `md5(dc_key)` sample ≤100/month —
  never synthesized dots.
- **License:** City of Philadelphia License (as-is, hold-harmless; see
  dataset PROVENANCE for links). Attribution: City of Philadelphia /
  Philadelphia Police Department via OpenDataPhilly. FBI CDE is US-government
  public domain.
- **Detail:** [`data/philadelphia-pa/PROVENANCE.md`](../data/philadelphia-pa/PROVENANCE.md)

### Category mapping (text_general_code → cat)

| text_general_code group | cat |
|-------------------------|-----|
| Homicide (Criminal / Justifiable / Gross Negligence), Rape, Other Sex Offenses (Not Commercialized), Aggravated Assault (Firearm / No Firearm), Other Assaults, Offenses Against Family and Children | `persons` |
| Robbery (Firearm / No Firearm), Burglary (Residential / Non-Residential), Thefts, Theft from Vehicle, Motor Vehicle Theft, Arson, Vandalism/Criminal Mischief, Fraud, Forgery and Counterfeiting, Receiving Stolen Property, Embezzlement | `property` |
| Narcotic / Drug Law Violations, Weapon Violations, Prostitution and Commercialized Vice, Gambling Violations, DRIVING UNDER THE INFLUENCE, Liquor Law Violations, Public Drunkenness, Disorderly Conduct, Vagrancy/Loitering | `society` |
| All Other Offenses, NULL, anything unrecognized (NOT-IN complement — nothing dropped) | `other` |

## Boston, MA (`boston-ma`)

- **Primary source:** Crime Incident Reports (August 2015 – To Date, Source: New System)
  (CKAN package on Analyze Boston, https://data.boston.gov/dataset/crime-incident-reports-august-2015-to-date-source-new-system) —
  **ODC-PDDL**, attribution "Boston Police Department via Analyze Boston". Nine datastore
  resources (yearly 2015–2022 + "2023 to present", updated daily). SQL must be **POSTed**
  (Cloudflare WAF blocks SQL in GET query strings).
- **Spatial unit:** the 12 official **BPD police districts** — the crime data's `DISTRICT`
  code joins the boston.gov GIS polygon layer (`PublicSafety/OpenData/MapServer/5`)
  **verbatim 12↔12**. Resident-known names are the official boston.gov police-district
  names (Downtown & Beacon Hill, Roxbury, Dorchester, …) per https://www.boston.gov/departments/police.
- **Placement:** rows are placed by `DISTRICT`, not coordinates — the ~4.6% of rows with
  null/zero `Lat/Long` still count in every timeline total; coordinates only gate the
  dot layer.
- **Categories:** the new-system file has **no NIBRS group field**; categories derive from
  `OFFENSE_DESCRIPTION` via ordered keyword rules (full table with counts in
  [`data/boston-ma/PROVENANCE.md`](../data/boston-ma/PROVENANCE.md)). A large share of
  the file is **non-crime service records** (investigations, medical assists, towed
  vehicles, accidents) — mapped to `other` ("Service / non-crime (context)"), never
  counted as crime.
- **Deep-history source (1985–2015):** FBI Crime Data Explorer (CDE) —
  Boston PD, **ORI MA0130100** — real annual Violent + Property counts, 31 full years
  (12 reported months each, verified). UCR taxonomy kept distinct; history runs through
  2015, granular first full year is 2016.
- **Span:** 1985–2015 (FBI UCR annual) + 2015-08-01 → 2026-06-30 (BPD incidents
  with district detail, 131 months). Partial pre-Aug-2015 ramp-up rows and the
  partial current month are excluded and disclosed.
- **Records:** 923,773 in window · 918,079 placed in a district
  (**99.4% coverage**) · 5,694 unplaced (null/"External"/"Outside of"
  district), kept in totals and disclosed.
- **Known gap:** BPD's public file **excludes rape/sexual-assault reports** (privacy) —
  disclosed; the video must not imply those are zero.
- **License:** ODC-PDDL (both incidents and polygons; City of Boston open data).
- **Detail:** [`data/boston-ma/PROVENANCE.md`](../data/boston-ma/PROVENANCE.md)

## Minneapolis, MN (`minneapolis-mn`)

- **Primary source:** Crime_Data — consolidated MPD Police Incidents, 2019-present
  (ArcGIS `Crime_Data/FeatureServer/0`, https://www.arcgis.com/home/item.html?id=dfbae39fd25d45838a649d0fc27be4fb) — CC0 1.0
  (per-year Police Incidents items are explicitly CC0; consolidated item's license
  field is blank, cited per portal norm). Attribution "Minneapolis Police
  Department via Open Data Minneapolis". Refreshed daily.
- **Date field:** `Occurred_Date` (when the offense happened), not
  `Reported_Date` — 1,304 rows occurred pre-2019 (reported later) are
  counted and disclosed as "occurred-pre-2019" unplaced.
- **Spatial unit:** the 87 official **Minneapolis neighborhoods** — the crime
  data's `Neighborhood` field matches the polygon layer's `BDNAME` exactly
  (identity join after trim; only nulls unmatched). Polygons:
  `Minneapolis_Neighborhoods/FeatureServer/0` (CC0 waiver).
- **Deep-history source (1991–2018):** FBI Crime Data Explorer (CDE) —
  Minneapolis PD, **ORI MN0271100** — real annual Violent + Property counts,
  28 full years (12 reported months each, verified). Partial years and
  years cut off by a mid-span reporting gap are dropped and disclosed in
  PROVENANCE. UCR taxonomy kept distinct from NIBRS; eras bridge at 2019.
- **Span:** 1991–2018 (FBI UCR annual) + 2019-01-01 → 2026-06-30 (MPD NIBRS
  with neighborhood detail, 90 months; partial 2026-07 dropped and disclosed).
- **Records:** 382,475 total ·
  378,538 placed in an official neighborhood
  (**99% coverage**) · 3,937 unplaced
  (1,304 occurred-pre-2019 + 2,633 null neighborhood), kept in totals and disclosed.
- **Real dots:** MPD publishes per-record `Latitude`/`Longitude` (plus
  block-anonymized `wgsX/YAnon`); ~0.6% of in-span rows are 0,0/out-of-city —
  dots are a deterministic even-stride ≤100/month sample of **real** locations;
  unlocatable records are counted but not plotted.
- **License:** CC0 1.0 (City of Minneapolis open-data waiver); contact
  PoliceOpenData@minneapolismn.gov.
- **Detail:** [`data/minneapolis-mn/PROVENANCE.md`](../data/minneapolis-mn/PROVENANCE.md)

### Category mapping (NIBRS_Crime_Against → cat; source values carry trailing spaces, matched exactly)

| Source value | cat |
|--------------|-----|
| "Person " | `persons` |
| "Property " | `property` |
| "Society " | `society` |
| "Non NIBRS Data" / "Not a Crime " | `other` (shots-fired calls, gunshot-wound victims, domestic "Subset of NIBRS" duplicate rows, non-crimes — context only, never counted as NIBRS crime) |

## San Francisco, CA (`san-francisco-ca`)

- **Primary sources:** SFPD incident reports via DataSF — modern
  `wg3w-h783` (2018-01 →, updated daily) + historical `tmnf-yvry`
  (2003-01 → 2018-05); cutover at **2018-01-01**, tmnf's 2018 tail
  (43,733 rows) dropped and disclosed to avoid double counting.
- **Spatial unit:** the 41 official **Analysis Neighborhoods** (`j2bu-swwd`,
  `nhood`, verbatim join). 2018+ rows carry the name natively; 2003–2017 rows
  (no neighborhood field) are placed by **point-in-polygon of their real
  published coordinates** against the official polygons — spot-checked against
  DataSF's own labeling for 2019-06: **92.69%
  exact agreement** over 10,950 rows, and ALL disagreements sit
  within 0.3 m of the labeled boundary
  (intersection-snapped points on boundary streets — either side is valid).
  Null-neighborhood rows with coordinates are rescued the same way; the rest
  stay unplaced and disclosed, never guessed.
- **Deep-history source (1985–2002):** FBI Crime Data Explorer —
  San Francisco Police Department, **ORI CA0380100** (verified at fetch) — real annual
  Violent + Property counts, 18 full years (12 nonzero months each, both
  series). UCR taxonomy kept distinct; eras bridge at 2003.
- **Span:** 1985–2002 (FBI UCR annual) + 2003-01-01 → 2026-06-30
  (282 months, per-neighborhood monthly by category).
- **Records:** 3,117,438 total · 3,013,369 placed in a
  neighborhood (**96.7% coverage**) · 104,069 unplaced
  (no-location 58,221 + overlap-dropped
  43,733 + partial-2026-07
  2,115), kept in totals and disclosed.
- **Reconciliation:** placed + unplaced == citywide validated **exactly** per
  month × category for all 282 months against independent per-source counts.
- **Real dots:** deterministic ≤100/month sample of real SFPD-published
  locations; no-coordinate rows counted but never plotted.
- **License:** ODC PDDL 1.0 (public-domain dedication), attribution
  "San Francisco Police Department via DataSF".
- **Detail:** [`data/san-francisco-ca/PROVENANCE.md`](../data/san-francisco-ca/PROVENANCE.md)
  (includes the FULL category→cat tables for both source vocabularies).

### Category mapping (NIBRS crimes-against convention, abridged)

| cat | wg3w `incident_category` (2018+) | tmnf `category` (2003–2017) |
|-----|-----------------------------------|------------------------------|
| `persons` | Homicide, Assault, Rape, Sex Offense, Family/Children, Human Trafficking | ASSAULT (incl. homicide), SEX OFFENSES, KIDNAPPING |
| `property` | Larceny Theft, Burglary, Robbery, MV Theft, Arson, Malicious Mischief/Vandalism, Fraud, Forgery, Embezzlement, Stolen Property | LARCENY/THEFT, VEHICLE THEFT, BURGLARY, ROBBERY, VANDALISM, ARSON, FRAUD, FORGERY, BAD CHECKS, EXTORTION, BRIBERY, STOLEN PROPERTY, TRESPASS |
| `society` | Drug, Weapons, Prostitution, Disorderly Conduct, Liquor, Gambling, Traffic Violation Arrest | DRUG/NARCOTIC, WEAPON LAWS, PROSTITUTION, DUI, DRUNKENNESS, DISORDERLY, LIQUOR, LOITERING, GAMBLING |
| `other` | Non-Criminal, Case Closure, Courtesy Report, Lost Property, Missing Person, Warrant, Recovered Vehicle, Suspicious, … (context only) | OTHER OFFENSES, NON-CRIMINAL, WARRANTS, SUSPICIOUS OCC, MISSING PERSON, SECONDARY CODES, RECOVERED VEHICLE, SUICIDE, TREA |

## washington-dc — Washington, DC

- **Primary source:** Open Data DC "Crime Incidents" — ArcGIS FEEDS/MPD MapServer,
  one layer per year 2008–2026 (https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/MPD/MapServer) —
  **CC BY 4.0**, attribution "Open Data DC / Metropolitan Police Department".
  Finalized Part-I-style incident reports; updated daily.
- **Spatial unit:** the 46 official **Neighborhood Clusters** — the crime data's
  `NEIGHBORHOOD_CLUSTER` field ("Cluster N") matches the Office of Planning
  polygon layer's `NAME` verbatim (identity join, no approximation). Display
  names use the first two resident-known neighborhoods from `NBH_NAMES`
  (full lists kept in `beats.json`).
- **Deep-history source (1985–2007):** FBI Crime Data Explorer (CDE) —
  Metropolitan Police Department, **ORI DCMPD0000** — real annual Violent + Property counts,
  23 full years (12 reported months each, verified). UCR taxonomy kept
  distinct from MPD's offense feed; eras bridge at 2008.
- **Span:** 1985–2007 (FBI UCR annual) + 2008-01-01 → 2026-06-30 (MPD incidents
  with cluster detail, 222 months). The partial month 2026-07 at fetch
  time is dropped and disclosed.
- **Records:** 596,352 total (2008-01 → 2026-06) ·
  591,765 placed in a Neighborhood Cluster
  (**99.2% coverage**) · 4,587 with a blank
  cluster field, kept in totals and disclosed. Placed+unplaced == citywide
  verified exactly per month × category against independent server-side stats.
- **Real dots:** MPD publishes coordinates at **block-midpoint** grain (100%
  of rows carry coords) — dots are a deterministic ≤100/month sample of real
  block-level locations; the block grain is disclosed on screen.
- **Society note:** DC's feed contains **no crimes-against-society offenses**
  (no drug/weapon/vice) — `society` is structurally zero and the video must
  say "not published", never imply zero society crime.
- **License:** CC BY 4.0 (Open Data DC); cluster polygons CC BY 4.0 (Office of Planning).
- **Detail:** [`data/washington-dc/PROVENANCE.md`](../data/washington-dc/PROVENANCE.md)

### Category mapping (OFFENSE → cat)

| OFFENSE | cat |
|---------|-----|
| HOMICIDE, SEX ABUSE, ASSAULT W/DANGEROUS WEAPON | `persons` |
| ROBBERY, BURGLARY, THEFT F/AUTO, THEFT/OTHER, MOTOR VEHICLE THEFT, ARSON | `property` |
| *(none published)* | `society` (structurally zero — disclosed) |
| anything unrecognized | `other` (logged; 0 in current fetch unless noted in PROVENANCE) |

## Ranked source types (for new datasets)

| tier | source | grain | coords? |
|------|--------|-------|---------|
| A | City open-data / ArcGIS Hub incident layers | incident or beat | sometimes |
| B | FBI Crime Data Explorer (CDE) | agency monthly counts | no |
| C | State UCR/NIBRS programs | aggregate counts | no |
| D | FOIA / records requests | varies | sometimes |

Coordinate-level points are best (real dot maps). Count-only sources are still
usable **honestly** as area aggregates/choropleth — never as invented points.
