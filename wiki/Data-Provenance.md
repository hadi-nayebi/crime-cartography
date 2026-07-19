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

## Buffalo, NY (`buffalo-ny`)

- **Primary source:** Crime Incidents (Socrata `d6g9-xbgu`, https://data.buffalony.gov/d/d6g9-xbgu) —
  **Public Domain U.S. Government** (`USGOV_WORKS`), attribution "Buffalo
  Police Department". Preliminary report data; updated daily, ~1-month lag.
- **Spatial unit:** the **35 official City of Buffalo planning neighborhoods**
  — the crime data's `neighborhood` field matches the city GIS polygon layer
  (`Neighborhood_Boundaries/FeatureServer/0`, field `NbhdName`) verbatim,
  35 of 35 (identity join, no approximation).
- **Deep-history source (1985–2005):** FBI Crime Data Explorer (CDE) —
  Buffalo PD, **ORI NY0140100** (verified) — real annual Violent + Property counts,
  21 full years (12 reported months each, verified). UCR taxonomy kept
  distinct from the incident data; eras bridge at 2006.
- **Span:** 1985–2005 (FBI UCR annual) + 2006-01-01 → 2026-05-31 (BPD
  incidents with neighborhood detail, 245 months; last FULL month measured
  — June 2026 is partial at the source and excluded).
- **Records:** 333,672 in-window · 326,828 placed in an official
  neighborhood (**97.9% coverage**) · 6,844 unplaced
  (blank/"UNKNOWN" neighborhood), kept in totals and disclosed. 633 junk-dated
  pre-2006 rows (back to 1910) excluded + disclosed.
- **Source gaps disclosed:** 2006-02…04 thin ramp-in; 2008-01…05 near-empty
  (records-system gap) — shown as-is, never interpolated; baselines avoid them.
- **Real dots:** BPD publishes **3-decimal (~block-level, ~80–110 m) coords**
  for ~97.7% of rows — DISCLOSED; dots are a deterministic ≤100/month sample of
  real block locations; no-coordinate records are counted but not plotted.
- **Scope limit (disclosed):** only 10 major-crime types published (no
  drug/weapon/vice offenses) → Crimes Against Society is structurally zero.
- **License:** Public Domain U.S. Government (`USGOV_WORKS`); polygons from
  the City of Buffalo's own GIS server (attribution City of Buffalo).
- **Detail:** [`data/buffalo-ny/PROVENANCE.md`](../data/buffalo-ny/PROVENANCE.md)

### Category mapping (parent_incident_type → cat)

| Source value | cat |
|--------------|-----|
| Assault · Homicide · Sexual Assault · Sexual Offense · Other Sexual Offense · SODOMY | `persons` |
| Theft · Breaking & Entering · Theft of Vehicle · Robbery | `property` (robbery = crime against property per NIBRS) |
| — | `society` structurally 0 — BPD publishes no society-type offenses |

## Atlanta, GA (`atlanta-ga`)

- **Primary source:** OpenDataWebsite_Crime view — APD NIBRS crime data,
  2021-present (ArcGIS `OpenDataWebsite_Crime_view/FeatureServer/0`,
  https://www.arcgis.com/home/item.html?id=774475034b694ce68b6d2e887aa96544) — **no explicit license stated**
  (AGOL `licenseInfo` blank, verified; flagged in PROVENANCE). Attribution
  "Atlanta Police Department (APD) via APD Open Data" (https://atlantapd.hub.arcgis.com/).
- **Timezone:** `OccurredFromDate` epochs are true UTC instants of
  America/New_York wall-clock times (verified against the layer's own
  `Day_of_the_week`); month binning is NY-local, DST-aware.
- **Spatial unit:** the 242 official **City of Atlanta neighborhoods**
  (NhoodName, with NPU letters) — the crime data's `NhoodName` matches the
  polygon layer verbatim (identity join). 9 APD name variants without a
  polygon (3,388 rows) are disclosed as unmatched-name unplaced.
- **Legacy layers probed, not used:** `2009_2020CrimeData` +
  `Crime_Data_1997_2008` are Part-1-only (7 offense types) with junk string
  dates — splicing them onto the full-NIBRS 2021+ layer would fabricate a 2021
  jump, so the granular era honestly starts 2021 (reasons in PROVENANCE).
- **Deep-history source (1985–2018):** FBI Crime Data Explorer (CDE) —
  Atlanta PD, **ORI GAAPD0000** (verified live; the scouted guess GA0600100 is
  College Park PD) — real annual Violent + Property counts, 34 full years
  (12 reported months each, verified). **2019–2020 are a disclosed gap**: APD's
  FBI submissions are partial (NIBRS transition) and the open-data layer starts
  2021 — never interpolated.
- **Span:** 1985–2018 (FBI UCR annual) + 2021-01-01 → 2026-06-30 (APD NIBRS
  with neighborhood detail, 66 months; partial 2026-07 dropped and disclosed).
- **Records:** 295,360 total ·
  268,210 placed in an official neighborhood
  (**90.8% coverage**) · 27,150 unplaced
  (23,762 null NhoodName + 3,388 unmatched-name), kept in totals and disclosed.
- **Real dots:** APD publishes per-record `Latitude`/`Longitude` (100%
  populated); a handful fall outside the city box and are counted but not
  plotted — dots are a deterministic even-stride ≤100/month sample of **real**
  locations.
- **Row grain:** offense-level rows (~2.6% multi-offense inflation, measured);
  we count records and disclose the grain.
- **License:** not stated by APD — attribution given, absence flagged.
- **Detail:** [`data/atlanta-ga/PROVENANCE.md`](../data/atlanta-ga/PROVENANCE.md)

### Category mapping (Crime_Against → cat)

| Source value | cat |
|--------------|-----|
| Person | `persons` |
| Property | `property` |
| Society | `society` |
| *(null — NibrsUcrCode `NOT_APPL`)* | `other` (non-NIBRS/administrative, context only — never counted as NIBRS crime) |

## Denver, CO (`denver-co`)

- **Primary source:** Crime — DPD offense records, **rolling window** ("previous
  five calendar years plus the current year to date" = 2021-01 → current at
  fetch) (ArcGIS `ODC_CRIME_OFFENSES_P/FeatureServer/324`, https://www.arcgis.com/home/item.html?id=1e080d3ce2ae4e2698745a0d02345d4a) —
  custom City and County of Denver use constraints, quoted verbatim in
  PROVENANCE. Attribution "Denver Police Department via Denver Open Data
  Catalog". Updated Mon–Fri; records are dynamic.
- **Grain/dedupe:** source is offense-level; **deduped by `INCIDENT_ID`**
  (344,726 in-window incidents; representative offense =
  persons > property > society > other, tie lowest `OFFENSE_ID`). Both grains
  reconciled exactly against server-side grouped and COUNT(DISTINCT) queries,
  per month.
- **Sex crimes absent:** the source publishes **no sexual-assault category**
  (sex-related crimes exist only as a separate aggregated dataset) — persons
  totals undercount citywide reality; disclosed prominently.
- **Date field:** `FIRST_OCCURRENCE_DATE` (when the offense first happened),
  not `REPORTED_DATE`.
- **Spatial unit:** the 78 official **Denver statistical neighborhoods** — crime
  `NEIGHBORHOOD_ID` slugs join `slugify(NBHD_NAME)` of the official polygon
  layer `ODC_ADMN_NEIGHBORHOOD_A/FeatureServer/13` exactly 78/78 both
  directions (only nulls unmatched); display names verbatim from polygons.
- **Deep-history source (1985–2020):** FBI Crime Data Explorer (CDE) —
  Denver Police Department, **ORI CODPD0000** (not CO0160000 = Sheriff's Office,
  empty series) — real annual Violent + Property counts, 36 full years
  (12 reported months each, verified). UCR taxonomy kept distinct; eras bridge
  at 2021.
- **Span:** 1985–2020 (FBI UCR annual) + 2021-01-01 → 2026-06-30 (DPD
  offenses with neighborhood detail, 66 months; partial 2026-07 dropped and
  disclosed).
- **Records:** 344,726 in-window incidents ·
  344,388 placed in an official neighborhood
  (**99.9% coverage**) · 338 unplaced (null
  neighborhood), kept in totals and disclosed.
- **Real dots:** DPD publishes per-record `GEO_LAT`/`GEO_LON` (block-level
  addresses); dots are a deterministic even-stride ≤100/month sample of
  **real** locations; incidents without usable coords are counted but not
  plotted.
- **License:** custom Denver use constraints (verbatim in PROVENANCE) — "AS IS",
  liability waiver, "NOT FOR ENGINEERING PURPOSES".
- **Detail:** [`data/denver-co/PROVENANCE.md`](../data/denver-co/PROVENANCE.md)

### Category mapping (OFFENSE_CATEGORY_ID → cat; 13 source values, exhaustive)

| Source categories | cat |
|-------------------|-----|
| murder, aggravated-assault, other-crimes-against-persons | `persons` |
| robbery (NIBRS: crime against property), burglary, larceny, theft-from-motor-vehicle, auto-theft, arson, white-collar-crime | `property` |
| drug-alcohol, public-disorder (closest crimes-against-society bucket; contains some persons-adjacent types — category-grain mapping disclosed) | `society` |
| all-other-crimes | `other` (mixed catch-all — context only, never counted as persons/property/society) |

## Detroit, MI (`detroit-mi`)

- **Primary source:** RMS Crime Incidents — DPD offense-level records, 2017-present
  (ArcGIS `RMS_Crime_Incidents/FeatureServer/0`, https://data.detroitmi.gov/datasets/rms-crime-incidents) —
  license **not stated** on the item; attributed "Detroit Police Department (DPD)
  via City of Detroit Open Data Portal". Refreshed daily.
- **Dedupe:** the layer is offense-level — deduplicated by `report_number` to
  **incidents** (799,080 rows → 733,923 incidents).
  Independent server-side `COUNT(DISTINCT report_number)` equals the client
  dedupe for every month and globally (validated in-script).
- **Time:** `incident_occurred_at` is a true UTC instant (verified against the
  source's local `incident_time`); all binning is Detroit local time with
  DST-aware month boundaries.
- **Spatial unit:** the 205 official **Current City of Detroit Neighborhoods** —
  the crime data's `neighborhood` field matches the polygon layer's
  `nhood_name` exactly (identity join, 205/205 verbatim; only nulls unmatched).
- **Deep-history source (1985–2016):** FBI Crime Data Explorer (CDE) —
  Detroit PD, **ORI MI8234900** — real annual Violent + Property counts,
  32 full years (12 reported months each, verified; the CDE's "Offenses"
  series, never "Clearances"). UCR taxonomy kept distinct from DPD RMS
  categories; eras bridge at 2017.
- **Span:** 1985–2016 (FBI UCR annual) + 2017-01-01 → 2026-06-30 (DPD RMS
  with neighborhood detail, 114 months; junk pre-2017 straggler dates and
  partial 2026-07 dropped and disclosed).
- **Records:** 733,923 incidents ·
  727,483 placed in an official neighborhood
  (**99.1% coverage**) · 6,440 unplaced
  (null neighborhood), kept in totals and disclosed.
- **Real dots:** DPD publishes per-record `latitude`/`longitude` at the
  nearest-intersection grain; ~0.1% of incidents have no usable coordinates —
  dots are a deterministic even-stride ≤100/month sample of **real** locations;
  unlocatable incidents are counted but not plotted.
- **License:** not stated (open-data portal publication) — flagged; attribute DPD.
- **Detail:** [`data/detroit-mi/PROVENANCE.md`](../data/detroit-mi/PROVENANCE.md)

### Category mapping (offense_category → cat, NIBRS crimes-against convention)

| cat | offense_category values |
|-----|------------------------|
| `persons` | ASSAULT, AGGRAVATED ASSAULT, HOMICIDE, SEXUAL ASSAULT, SEX OFFENSES, KIDNAPPING |
| `property` | ROBBERY (NIBRS: property), LARCENY, BURGLARY, STOLEN VEHICLE, STOLEN PROPERTY, DAMAGE TO PROPERTY, FRAUD, FORGERY, EXTORTION, ARSON |
| `society` | WEAPONS OFFENSES, DANGEROUS DRUGS, OUIL, LIQUOR, GAMBLING, SOLICITATION, DISORDERLY CONDUCT, OBSTRUCTING THE POLICE, OBSTRUCTING JUDICIARY, HEALTH AND SAFETY, FAMILY OFFENSE, INVASION OF PRIVACY -OTHER |
| `other` | RUNAWAY (status offense), MISCELLANEOUS, OTHER, JUSTIFIABLE HOMICIDE (not a crime in NIBRS) — context only, never counted as crime |

## Milwaukee, WI (`milwaukee-wi`)

- **Primary source:** MPD WIBR NIBRS crime data on data.milwaukee.gov (CKAN) —
  a two-resource pair: **wibrarchive** "NIBRS Crime Data (Historical)"
  (2005-02 … 2023-12) + **wibr** "NIBRS Crime Data (Current)" (2024-01 → now),
  clean seam, no overlap. **CC-BY**, attribution "City of Milwaukee / Milwaukee
  Police Department". SQL **POSTed** to datastore_search_sql (WAF-safe).
  Rows appear only after MPD supervisor + Records review (a few weeks' lag) —
  the granular window therefore ends at the last *filled* month, 2026-05.
- **Categories:** `Offense_All` is a **semicolon-separated** NIBRS code list;
  the FIRST code classifies the incident (documented judgment call). Group A
  codes map to persons/property/society per the FBI NIBRS list; **Group B
  (90-series) and placeholder codes → `other`** ("Group B / other offenses
  (context)"), never counted as Group A crime. Full code table with counts in
  [`data/milwaukee-wi/PROVENANCE.md`](../data/milwaukee-wi/PROVENANCE.md).
- **Spatial unit:** the **190 official City of Milwaukee neighborhoods**
  (planning layer `special_districts/MapServer/4`, field `NEIGHBORHD`, CC-BY).
  The crime file has no neighborhood field — placement is a **spatial join**:
  point-in-polygon of MPD's real published address coordinates (~98.4% usable)
  into the official polygons. Coordinate-less rows are counted citywide and
  disclosed as unplaced, never guessed.
- **Deep-history source (1985–2004):** FBI Crime Data Explorer (CDE) —
  Milwaukee PD, **ORI WIMPD0000** (verified; the scouted `WI0410100` is Bayside PD
  and was rejected) — real annual Violent + Property counts, 20 full years
  (12 reported months each, verified; "Offenses" series matched explicitly).
- **Span:** 1985–2004 (FBI UCR annual) + 2005-02-01 → 2026-05-31 (WIBR
  with neighborhood detail, 256 months). 263 junk-dated pre-window rows and
  the still-filling 2026-06/07 months are excluded and disclosed.
- **Records:** 1,189,202 in window · 1,174,365 placed in a neighborhood
  (**98.8% coverage**) · 14,837 unplaced (no coords / out-of-bbox /
  outside all polygons), kept in totals and disclosed.
- **License:** CC-BY (incidents and polygons; City of Milwaukee).
- **Detail:** [`data/milwaukee-wi/PROVENANCE.md`](../data/milwaukee-wi/PROVENANCE.md)

## Baltimore, MD (`baltimore-md`)

- **Primary source:** NIBRS Group A Crime Data — live BPD feed, 2022-01-01+
  (ArcGIS `NIBRS_GroupA_Crime_Data/FeatureServer/0`, https://www.arcgis.com/home/item.html?id=204beefe92a645d79fdf0969957bbdf8).
  License not stated — attributed "Baltimore City Police Department via Open
  Baltimore". The legacy Part 1 layer (frozen 2023-02) is **not** used.
- **⚠ Victim-based rows, deduplicated to incidents:** BPD publishes one row per
  victim; every count shown is incidents deduped by `CCNumber`
  (259,819 victim rows → 224,602 incidents, ×1.16).
  Representative row = lowest RowID (deterministic); multi-description and
  cross-month incidents measured and disclosed in PROVENANCE.
- **Spatial unit:** the 278 official **2010 neighborhood statistical areas**.
  The in-data `Neighborhood` field is ~98.5% blank in 2022, so every incident
  is placed by **point-in-polygon of BPD's own coordinates** (uniform method,
  holes honored); where the in-data name exists it agrees 99.1% —
  published as validation, not used as the join.
- **Timestamps:** `CrimeDateTime` is a true UTC instant; months are binned in
  **America/New_York local time**, and all 54 months are reconciled against
  server-side row counts AND distinct-CCNumber counts at exact UTC boundaries.
- **Deep-history source (1985–2020):** FBI Crime Data Explorer (CDE) —
  Baltimore PD, **ORI MDBPD0000** (the scouted MD3010100 is empty — corrected via
  the CDE agency roster) — real annual Violent + Property counts, 36 full
  years (12 reported months each, verified; the `… Offenses` series matched
  explicitly, never `… Clearances`). **2021 = disclosed gap year** (7/12
  months, NIBRS transition) — the eras bridge 2020 → 2022.
- **Span:** 1985–2020 (FBI UCR annual) + 2022-01-01 → 2026-06-30 (BPD NIBRS
  incidents, 54 months; partial 2026-07 dropped and disclosed).
- **Records:** 224,602 incidents · 224,310 placed in an official
  neighborhood (**99.9% coverage**) · 292 unplaced
  (no/bad coordinates or outside every polygon), kept in totals and disclosed.
- **Real dots:** BPD publishes address-level `Latitude`/`Longitude` per row —
  dots are a deterministic even-stride ≤100/month sample of **real** deduped
  incident locations; unlocatable incidents are counted but not plotted.
- **License:** not stated by the source — attribution "Baltimore City Police
  Department"; polygons City of Baltimore.
- **Detail:** [`data/baltimore-md/PROVENANCE.md`](../data/baltimore-md/PROVENANCE.md)

### Category mapping (Description → cat, official NIBRS crimes-against)

| Source values | cat |
|--------------|-----|
| COMMON ASSAULT · AGG. ASSAULT · HOMICIDE · RAPE · SEX OFFENSES · INTIMIDATION · KIDNAPPING · HUMAN TRAFFICKING | `persons` |
| VANDALISM · AUTO THEFT · LARCENY (all variants) · SHOPLIFTING · BURGLARY · ROBBERY (all variants) · FRAUD · ARSON · STOLEN PROPERTY · EXTORTION | `property` |
| WEAPON VIOLATIONS · DRUG/NARCOTIC VIOLATIONS (+ "DRUG VIOLOATION" typo) · PROSTITUTION · PORNOGRAPHY · ANIMAL CRUELTY | `society` |
| — | `other` (empty for Baltimore — every offense maps to a NIBRS category) |

## Cincinnati, OH (`cincinnati-oh`)

- **Primary source — a PAIR:** Reported Crime (STARS Category Offenses)
  **before 6/3/2024** (Socrata `8xzn-kpn7`, https://data.cincinnati-oh.gov/d/8xzn-kpn7) + **on or after
  6/3/2024** (`7aqy-xrv9`, https://data.cincinnati-oh.gov/d/7aqy-xrv9) — the city split the feed at CPD's
  2024-06-03 RMS cutover. **No license specified on either dataset**
  (flagged); attribution "City of Cincinnati / CPD".
- **Dedupe (disclosed):** both sets are offense-level and OVERLAP Jun–Nov 2024
  — 160,772 rows → **154,460 incidents** on `incident_no`
  (15 legacy rows for 14 incidents present in both sets dropped, current
  system preferred; 6,297 multi-offense rows collapsed at highest STARS
  severity). All counts are incident-level.
- **Spatial unit:** the **50 official SNA neighborhoods** (CAGIS "Statistical
  Neighborhood Approximations 2020" polygons, field `SNA_NAME`) — the crime
  data's `sna_neighborhood` matches verbatim, 50 of 50 in both sets
  (identity join, no approximation).
- **Taxonomy (disclosed):** UCR-style **STARS** rollups, not NIBRS —
  Part 1 Violent → `persons` slot (includes robbery, unlike NIBRS),
  Part 1 Property → `property`, and the source's own **Part 2 "everything
  else" bucket** → third slot labeled "Part 2 · All Other Offenses";
  never presented as NIBRS Crimes Against Society.
- **Deep-history source (1999–2019):** FBI CDE — Cincinnati PD,
  **ORI OHCIP0000** (the scout's OH0310600 = Cleves PD; corrected via byStateAbbr
  and verified) — real annual Violent + Property counts, 21 full years.
  1997–1998 are non-reporting years the CDE publishes as zeros (dropped as
  artifacts, never shown as "zero crime") and the complete 1985–1996 segment
  is noncontiguous with the kept run — all dropped and disclosed.
- **Span:** 1999–2019 (FBI UCR annual) + 2020-01-01 → 2026-05-31 (CPD
  STARS incidents, 77 months; last FULL month measured — the current set
  is loaded through 2026-06-23, so June 2026 is partial and excluded).
- **Records:** 154,460 in-window incidents · 146,628 placed in an official
  SNA (**94.9% coverage**) · 7,832 unplaced (blank neighborhood), kept
  in totals and disclosed.
- **Real dots:** CPD publishes 4-decimal (~11 m) coords against block-masked
  addresses — block-level, DISCLOSED; the legacy set's lat/lng columns are
  REVERSED at the source and are swapped back deterministically (disclosed).
  Dots are a deterministic ≤100/month sample; no-coordinate incidents are
  counted but not plotted.
- **License:** none specified (crime pair — flagged prominently); SNA polygons
  public open data from CAGIS with as-is disclaimer.
- **Detail:** [`data/cincinnati-oh/PROVENANCE.md`](../data/cincinnati-oh/PROVENANCE.md)

### Category mapping (STARS rollup → cat slot)

| Source value | cat |
|--------------|-----|
| Part 1 Violent (homicide, rape, robbery, agg. assault, strangulation) | `persons` (UCR keeps robbery here — disclosed vs NIBRS) |
| Part 1 Property (burglary/B&E, thefts, auto theft) | `property` |
| Part 2 (all other offenses — drugs, vandalism, fraud, simple assault, …) | `society` slot, labeled "Part 2 · All Other Offenses" |
| — | `other` structurally 0 (audited) |

## Kansas City, MO (`kansas-city-mo`)

- **Primary source:** **12 Socrata yearly datasets** "KCPD Crime Data 2015 …
  2026" on data.kcmo.org (ids in `summary.yearlyDatasets`; discovered via
  catalog search) — Public Domain on the 2018+ assets, no license field on
  2015–2017 (disclosed); attribution "KCPD Information Technology". Schemas
  drift by year (report/date/location field names) and are mapped per-year.
- **Per-involvement rows, deduped:** one row per victim/suspect/arrestee per
  report — 1,281,836 rows → **638,301 distinct reports**
  (×2.01 inflation), deduped globally across the 12 datasets
  (166 reports span datasets). Server `COUNT(DISTINCT report)`
  == client dedupe per dataset **and per month**, validated in-script.
- **Spatial unit:** the **240 named official Kansas City neighborhoods**
  ("Kansas City Neighborhood Borders" `vq6h-tqrf`, parent of the official
  boundaries map `q45j-ejyk`) — placement by **point-in-polygon spatial
  join** of KCPD's block-level coordinates (holes honored; 6 unnamed filler
  areas in the layer stay nameless and unplaced).
- **Deep-history source (1985–2014):** FBI Crime Data Explorer (CDE) —
  **ORI MOKPD0000** (verified via agency lookup; the scouted MO0460100 was
  Mountain View PD — wrong) — real annual Violent + Property counts,
  30 full years (12 reported months each, verified; "Offenses" series
  matched explicitly, never "Clearances"). Eras bridge at 2015.
- **Span:** 1985–2014 (FBI UCR annual) + 2015-01-01 → 2026-06-30 (KCPD
  incidents, 138 months; 2026-07 is partial at the source and excluded).
- **Records:** 636,430 in-window incidents · 552,567 placed in a named
  neighborhood (**86.8% coverage**) · 83,863 unplaced
  (58,439 without coordinates — concentrated in 2019–2021 — plus
  25,424 outside every named polygon), kept in totals and disclosed.
  72 junk-dated pre-2015 reports (back to 1923) excluded + disclosed.
- **Source gaps disclosed:** final December days missing from the 2016 / 2018 /
  2020 / 2021 snapshots; 2018→2019 records-system change (row structure, ibrs
  completeness, coordinate coverage) — shown as-is, never interpolated.
- **Real dots:** KCPD geocodes **block-level addresses** — dots are a
  deterministic ≤100/month sample of real block locations; no-coordinate
  incidents are counted but not plotted.
- **License:** Public Domain (2018+ assets; earlier years unstated —
  disclosed); polygons from the city's official layer (no license stated).
- **Detail:** [`data/kansas-city-mo/PROVENANCE.md`](../data/kansas-city-mo/PROVENANCE.md)

### Category mapping (`ibrs` NIBRS code → cat)

| Source value | cat |
|--------------|-----|
| 09A/09B, 100, 11A–11D, 13A–13C, 36A/36B, 64A/64B | `persons` |
| 120, 200, 210, 220, 23A–23H, 240, 250, 26A–26G, 270, 280, 290, 510 | `property` (robbery/arson/extortion/bribery = crimes against property per NIBRS) |
| 35A/35B, 370, 39A–39D, 40A–40C, 520, 720, 90A–90Z | `society` (Group B offenses carry victim type Society in NIBRS) |
| 09C (justifiable homicide — not a crime), 999 (local placeholder), null | `other` (context only — never counted as Group A) |

## Dallas, TX (`dallas-tx`)

- **Primary source:** Police Incidents (Socrata `qv6i-rri7`, https://www.dallasopendata.com/d/qv6i-rri7) —
  **ODC-BY** (Open Data Commons Attribution), attribution "Dallas Police
  Department". RMS incidents June 2014 → current; preliminary classifications;
  published "for research purposes only".
- **⚠ Source scope filter (disclosed prominently, on-screen too):** DPD
  excludes **sexually oriented offenses** and **offenses where juveniles or
  children (under 17) are the victim or suspect** (plus evidence property
  lists, Social Service Referrals, some vehicle info) before publication —
  sex crimes never appear and all totals undercount actual reported crime.
- **Row grain:** victim/involvement-level (one row per person, `servnumid`);
  deduplicated to incidents by `incidentnum` keeping the first service-number
  row — 1,437,644 rows → 1,200,698 incidents, reconciled per month
  against server-side `count(distinct incidentnum)` (exact, 138/138).
- **Spatial unit:** the **8 official DPD divisions** (Central, Northeast,
  Southeast, Southwest, Northwest, North Central, South Central, CBD) — the
  crime data's `division` (uppercased) matches the official DPD Crime
  Analysis Unit polygon layer field `DIVISION` verbatim, 8 of 8 (identity
  join). Only 8 regions — leaderboard top-6 note as in Nashville/Memphis.
- **Categories:** native `nibrs_crimeagainst` (2017+); for 2015–2016 the
  source's NIBRS fields are blank, so categories derive from a **documented
  complete 49-value `ucr_offense` mapping** (crimes-against convention);
  DPD's mixed "PERSON, PROPERTY, OR SOCIETY" + "MISCELLANEOUS" buckets and
  unclassified rows → `other` (context, never Group A). Seam disclosed.
- **date1 is TEXT** — verified 0 null/0 malformed; lexicographic windowing;
  month binning sanity-checked against the source's `year1`/`month1`.
- **Deep-history source (1985–2014):** FBI CDE — Dallas PD **ORI TXDPD0000**
  (the scouted TX0570200 was Balch Springs PD — corrected via byStateAbbr
  lookup; 1985 total ≈130k asserted big-city-plausible). Annual Violent +
  Property, 30 full years. UCR includes rape; the modern era excludes
  sexual offenses — eras bridge at 2015 and are never numerically compared.
- **Span:** 1985–2014 (FBI UCR annual) + 2015-01-01 → 2026-06-30 (DPD RMS
  with division detail, 138 months; last FULL month measured).
- **Records:** 1,200,698 incidents in-window · 1,199,851 placed in an
  official division (**99.9% coverage**) · 847 unplaced
  (blank division), kept in totals and disclosed.
- **Real dots:** DPD-geocoded street addresses (`geocoded_column`, 99.8%
  coverage) — deterministic ≤100/month sample of real locations; no-coordinate
  incidents counted but not plotted.
- **License:** ODC-BY (records); DPD CAU public ArcGIS layer (polygons,
  graphical-representation disclaimer, Texas H.B. 1147).
- **Detail:** [`data/dallas-tx/PROVENANCE.md`](../data/dallas-tx/PROVENANCE.md)

### Category mapping (nibrs_crimeagainst → cat, native 2017+)

| Source value | cat |
|--------------|-----|
| PERSON | `persons` |
| PROPERTY | `property` |
| SOCIETY | `society` |
| PERSON, PROPERTY, OR SOCIETY · MISCELLANEOUS · (blank) | `other` (mixed / non-criminal / unclassified — context only) |

2015–2016 rows (blank NIBRS fields) use the complete 49-value `ucr_offense`
fallback table in `data/dallas-tx/PROVENANCE.md`.

## Memphis, TN (`memphis-tn`)

- **Primary source:** MPD Public Safety Incidents — offense-level records
  (ArcGIS `MPD_Public_Safety_Incidents/FeatureServer/0`, https://www.arcgis.com/home/item.html?id=12b51ce4d5a14493ab6cc05d32e0c1ee) —
  license **not stated** on the item; attributed "Memphis Police Department via
  City of Memphis Open Data Hub" (https://data.memphistn.gov/). Updated each morning by 6:00 am.
- **⚠ Source omissions (disclosed):** per the item description, **sex crimes
  and juvenile-specific crime types are omitted** by MPD — no sex-offense UCR
  category exists in the layer. Disclosed in PROVENANCE and
  `summary.sourceOmissions` for on-screen use.
- **Span:** 1985–2019 (FBI UCR annual) + 2020-01-01 → 2026-06-30 (MPD NIBRS
  with precinct detail, 78 months). The layer starts exactly at 2020-01-01
  local midnight (measured; the item blurb's "back to 2019" has no 2019 rows;
  the old 2006+ dataset was retired). Partial 2026-07 dropped and disclosed.
- **Dedupe:** the layer is offense-level — deduplicated by `Crime_ID` to
  **incidents** (632,453 rows → 569,063 incidents).
  Independent server-side `COUNT(DISTINCT Crime_ID)` equals the client dedupe
  for every month and globally (validated in-script).
- **Time:** `Offense_Datetime` is a true UTC instant (dataset starts exactly
  2020-01-01T06:00Z = local midnight CST; hour histogram dips 4–5 AM local);
  all binning is Memphis local time (America/Chicago) with DST-aware month
  boundaries.
- **Spatial unit:** the **9 official MPD precinct (station) areas** — polygon
  layer `MPD_Station_Areas/FeatureServer/1` ("MPD Precinct Areas"), joined by
  normalized station name (MT MORIAH ↔ Mt. Moriah, 9/9 exact). Only 9 regions
  (like Nashville): leaderboard topN stays 6, quiz still works. Special-unit
  values (OCU = Organized Crime Unit, etc.) are unplaced and disclosed.
- **Records:** 569,063 incidents ·
  562,385 placed in a precinct area
  (**98.8% coverage**) · 6,678 unplaced
  (special-unit/missing precinct), kept in totals and disclosed.
- **Real dots:** MPD publishes per-record `Latitude`/`Longitude` at
  **~3 decimal places (block-level)** — disclosed; dots mark blocks, not exact
  addresses. Missing locations are 0,0 sentinels — counted, not plotted.
- **Deep-history source (1985–2019):** FBI Crime Data Explorer (CDE) —
  Memphis PD, **ORI TNMPD0000** — real annual Violent + Property counts,
  35 full years (12 reported months each, verified; the CDE's "Offenses"
  series, never "Clearances"). **The scouted ORI TN0790100 was Collierville PD
  (1985 violent = 20, implausible) — rejected by the 1985 plausibility gate;**
  TNMPD0000 found via `agency/byStateAbbr/TN`. UCR taxonomy kept distinct;
  eras bridge at 2020 (and FBI-era violent totals include rape while the MPD
  source omits sex crimes — eras never numerically compared).
- **License:** not stated (open-data hub publication) — flagged; attribute MPD.
- **Detail:** [`data/memphis-tn/PROVENANCE.md`](../data/memphis-tn/PROVENANCE.md)

### Category mapping (native `NIBRS_Offense_Group` → cat; `UCR_Category` × `NIBRS_Group` table in PROVENANCE)

| Source value (trimmed) | cat |
|--------------|-----|
| CRIMES AGAINST PERSONS / CRIMES AGAINST PERSON | `persons` |
| CRIMES AGAINST PROPERTY | `property` |
| CRIMES AGAINST SOCIETY | `society` |
| "PERSON, PROPERTY, OR SOCIETY" (= ALL OTHER OFFENSES, NIBRS Group B catch-all) + 1 unclassified row | `other` (context only, never counted as NIBRS crime) |

## Charlotte, NC (`charlotte-nc`)

- **Primary source:** CMPD Incidents — all CMPD incident report types, 2017-present
  (ArcGIS `CMPD/CMPDIncidents/MapServer/0` on gis.charlottenc.gov, refreshed daily;
  item https://www.arcgis.com/home/item.html?id=d22200cd879248fcb2258e6840bd6726). License = City of Charlotte custom disclaimer (quoted verbatim
  in PROVENANCE); attribution "Charlotte-Mecklenburg Police Department / City of
  Charlotte".
- **Exclusions (headline rule):** the layer mixes criminal and non-criminal
  reports. **128,848 non-criminal 800-series rows** (missing persons, natural
  deaths, vehicle recoveries, 899 "Other Unlisted Non-Criminal", …) and
  **21,392 "Unfounded"-clearance rows** are excluded from every count —
  both enumerated code-by-code / status-by-status with counts in PROVENANCE.
  Clearance status is as-of-fetch (can change as investigations proceed).
- **Categories:** `HIGHEST_NIBRS_CODE` (CMPD applies the FBI NIBRS national
  hierarchy — one highest offense per report). Group A → persons/property/society
  per the FBI list; **Group B (90-series), CMPD local codes 99Y/99Z, and 09C
  justifiable homicide → `other`** ("Group B / local non-NIBRS (context)"), never counted
  as Group A crime. Full code table in
  [`data/charlotte-nc/PROVENANCE.md`](../data/charlotte-nc/PROVENANCE.md).
- **Date field:** `DATE_INCIDENT_BEGAN` (when the incident began), not
  `DATE_REPORTED` — 3,540 kept rows began pre-2017 (reported later;
  incl. a few junk-dated) are counted and disclosed as "began-pre-2017" unplaced.
- **Spatial unit:** the **14 official CMPD patrol divisions** — carried in-data
  (`CMPD_PATROL_DIVISION`), identity-joined to the official "CMPD Police
  Divisions" polygon layer (DNAME/DIVISION codes match exactly; no spatial join).
  Only 14 regions — leaderboard/quiz sizing note as for Nashville/Memphis.
  Rows tagged outside the 14 divisions (served towns, mutual aid):
  895, unplaced and disclosed.
- **Coords:** `LATITUDE_PUBLIC`/`LONGITUDE_PUBLIC` are **block-anonymized** by
  CMPD (block-address grain) — real published positions, disclosed wherever dots
  are shown; 100% populated.
- **Deep-history source (1985–2016):** FBI Crime Data Explorer (CDE) —
  Charlotte-Mecklenburg PD, **ORI NC0600100** (verified: "Offenses" series matched
  explicitly, 1985 violent 4,575 passes the big-city plausibility gate) — real
  annual Violent + Property counts, 32 full years (12 reported months each).
- **Span:** 1985–2016 (FBI UCR annual) + 2017-01-01 → 2026-06-30 (CMPD NIBRS
  with division detail, 114 months; partial 2026-07 dropped and disclosed).
- **Records:** 701,939 kept in window · 697,504 placed in a division
  (**99.4% coverage**) · 4,435 unplaced, kept in totals and disclosed.
- **Detail:** [`data/charlotte-nc/PROVENANCE.md`](../data/charlotte-nc/PROVENANCE.md)

## Nashville, TN (`nashville-tn`)

- **Primary source:** Metro Nashville Police Department Incidents — hosted ArcGIS
  view on Nashville Open Data (2019-01-01 → current). **License not stated**
  (item licenseInfo empty) — attributed "Metro Nashville Police Department via
  Nashville Open Data" per the item's accessInformation.
- **Grain → dedupe:** the layer publishes one row per **offense × victim**
  (`Primary_Key` = incident_offense/victim); 906,703 rows collapse to
  750,423 incidents by `Incident_Number` (representative = the incident's
  first-listed offense; documented judgment call).
- **Unfounded excluded:** 5,467 NIBRS-category incidents with
  status "U — UNFOUNDED" are excluded per FBI practice (disclosed; the `other`
  context bucket keeps its routine-"U" administrative records).
- **Categories:** `Offense_NIBRS` per TIBRS (Tennessee NIBRS): Group A →
  persons/property/society; `13D` Stalking (TIBRS TN Group A) → persons;
  Group B 90-series, `09C`, MNPD local 600/700/800 "matrix" codes (police
  inquiry, lost/found property, deaths, overdose, …), and nulls → `other`
  ("Non-NIBRS local / Group B (context)"), never counted as NIBRS crime. Full code
  table in [`data/nashville-tn/PROVENANCE.md`](../data/nashville-tn/PROVENANCE.md).
- **Report_Type:** enumerated (D/S/T/W/O/CIR/null — intake designations; T, O,
  CIR have no source description); none is a non-incident record class → none
  excluded; incident dedupe absorbs multi-report duplication.
- **Spatial unit:** the **9 official MNPD Police Precinct Boundaries**
  (`PrecinctName`; same org). Zone/RPA are numeric, ~61% null, unmapped — the
  placement is a **spatial join**: point-in-polygon of MNPD's published
  coordinates (source-rounded to ~2–3 decimals — block-ish grain, disclosed;
  MADISON's interior ring handled). Only 9 regions — leaderboard topN stays 6.
- **Dates:** `Incident_Occurred` true-UTC instants; **binning in
  America/Chicago local time**, month boundaries reconciled against the source
  as exact UTC instants (90 months × row + distinct-incident counts, exact).
- **Deep-history source (1985–2018):** FBI Crime Data Explorer (CDE) —
  Metropolitan Nashville Police Department, **ORI TN0190100** (verified; "Offenses" series matched explicitly,
  1985 plausibility-gated) — real annual Violent + Property counts,
  34 full years (12 reported months each, verified).
- **Span:** 1985–2018 (FBI UCR annual) + 2019-01-01 → 2026-06-30 (MNPD
  incidents with precinct detail, 90 months; partial 2026-07 dropped and
  disclosed).
- **Records:** 744,956 counted incidents ·
  734,327 placed in a precinct (**98.6% coverage**) ·
  10,629 unplaced (no coords / out-of-bbox / outside polygons),
  kept in totals and disclosed.
- **License:** not stated (both layers) — attributed to Metro Nashville PD.
- **Detail:** [`data/nashville-tn/PROVENANCE.md`](../data/nashville-tn/PROVENANCE.md)

## Ranked source types (for new datasets)

| tier | source | grain | coords? |
|------|--------|-------|---------|
| A | City open-data / ArcGIS Hub incident layers | incident or beat | sometimes |
| B | FBI Crime Data Explorer (CDE) | agency monthly counts | no |
| C | State UCR/NIBRS programs | aggregate counts | no |
| D | FOIA / records requests | varies | sometimes |

Coordinate-level points are best (real dot maps). Count-only sources are still
usable **honestly** as area aggregates/choropleth — never as invented points.
