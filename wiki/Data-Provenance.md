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

## Ranked source types (for new datasets)

| tier | source | grain | coords? |
|------|--------|-------|---------|
| A | City open-data / ArcGIS Hub incident layers | incident or beat | sometimes |
| B | FBI Crime Data Explorer (CDE) | agency monthly counts | no |
| C | State UCR/NIBRS programs | aggregate counts | no |
| D | FOIA / records requests | varies | sometimes |

Coordinate-level points are best (real dot maps). Count-only sources are still
usable **honestly** as area aggregates/choropleth — never as invented points.
