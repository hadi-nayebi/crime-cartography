# Batch-1 builder specs — 12 cities (scouted 2026-07-17)

Common contract for every city (the "seattle contract"): read
`pipeline/sources/seattle-wa.mjs` + `data/seattle-wa/normalized/*` shapes.
One self-contained `pipeline/sources/<slug>.mjs`: fetch → normalize → validate,
exact per-month placed+unplaced == independent citywide reconciliation, feed
~300 representative items (no bias), points.json ≤100/mo real coords, history
via FBI CDE (key in `.secrets/fbi_api_key`; VERIFY the ORI — if the series is
empty, look up via agency/byStateAbbr), PROVENANCE.md + wiki section, real
timestamps, "VALIDATION PASS" printed. Granular timeline ends at the last FULL
month (2026-06 unless the source lags — note actual). Category mapping to
persons/property/society/other documented in full. NEVER fabricate; disclose
every gap.

## atlanta-ga
Main: ArcGIS `services3.arcgis.com/Et5Qfajgiyosiw4d/ArcGIS/rest/services/OpenDataWebsite_Crime_view/FeatureServer/0` (2021+, 100% coords, `NhoodName`+`NPU` on record, `NIBRS_Offense`/`NibrsUcrCode`/`Crime_Against` native). Sibling history layers: `2009_2020CrimeData` + `Crime_Data_1997_2008` (same org — probe; if usable, granular era 2009+; else 2021+). Sanity-bounds date filter (junk 1015/2124 dates measured). License "custom" — cite APD open-data portal terms. ORI GA0600100 (verify). Bbox ~33.62–33.90, −84.56–−84.28.

## detroit-mi
ArcGIS `services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/RMS_Crime_Incidents/FeatureServer/0` (2017+ → current; per-year mirrors exist for chunked pulls). Fields incident_occurred_at, offense_category/description, state_offense_code, `neighborhood` (1.5% null), police_precinct, latitude/longitude (99.7%), crime_id, report_number. DEDUPE offense-level rows by report_number. Drop pre-2017 stragglers + junk dates. License unstated — attribute "Detroit Police Department (DPD)". ORI MI8234900 (verify). Bbox 42.25–42.46, −83.29–−82.91.

## buffalo-ny
Socrata `data.buffalony.gov/resource/d6g9-xbgu.json` (real span 2006+ → ~1-month lag; junk pre-1990 dates → filter). Fields incident_datetime, incident_type_primary, parent_incident_type, latitude/longitude (96.3%, 3-DECIMAL block-level — DISCLOSE), `neighborhood` (94.6%), police_district, case_number. License Public Domain (attr Buffalo PD). ORI NY0140100 (verify). Granular ends at last month the source actually completes (measure — likely 2026-05). Bbox 42.82–42.97, −78.92–−78.79.

## denver-co
ArcGIS `services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_CRIME_OFFENSES_P/FeatureServer/324` — ROLLING window (2021+ → current; disclose "source publishes previous 5 calendar years + YTD"). Filter IS_CRIME=1; DEDUPE by INCIDENT_ID. Fields FIRST_OCCURRENCE_DATE, GEO_LAT/GEO_LON (100%), OFFENSE_CATEGORY_ID/OFFENSE_TYPE_ID, `NEIGHBORHOOD_ID` slugs (0.1% null). Names: polygons `ODC_ADMN_NEIGHBORHOOD_A/FeatureServer/13` `NBHD_NAME` — join slugify(NBHD_NAME); display Title Case names. License: pull item 1e080d3ce2ae4e2698745a0d02345d4a licenseInfo verbatim. ORI CO0160000 (verify). History 1985→2020. Bbox 39.61–39.92, −105.11–−104.60.

## baltimore-md
ArcGIS `services1.arcgis.com/UWYHeuuJISiGmgXx/arcgis/rest/services/NIBRS_GroupA_Crime_Data/FeatureServer/0` (2022-01+ ONLY — live feed; legacy Part1 frozen 2023-02, do NOT use). VICTIM-BASED rows — DEDUPE by CCNumber for incident counts + DISCLOSE "victim-based source, deduplicated to incidents" in PROVENANCE + methodFootnote data. Fields CrimeDateTime, Description, CrimeCode, `Neighborhood` (in-data), New_District, Latitude/Longitude strings (~100%). License unstated — attribute "Baltimore City Police Department". ORI MD3010100 (verify). History 1985→2021. Bbox 39.19–39.38, −76.72–−76.52.

## cincinnati-oh
Socrata PAIR: `data.cincinnati-oh.gov/resource/8xzn-kpn7.json` (before 2024-06-03; use 2020-01+) + `7aqy-xrv9.json` (2024-06-03+ → ~3-week lag). DEDUPE across the pair on incident_no (they overlap Jun–Nov 2024). Fields datereported/datefrom (use datefrom = occurrence), stars_category, type, `cpd_neighborhood` (99.6%), latitude_x/longitude_x (99.7%, 4-dec). Granular 2020-01 → last full month the NEW set completes (measure; likely 2026-05 given lag). License not specified — flag prominently in PROVENANCE; attribute "City of Cincinnati / CPD". ORI OH0310600 (verify). History 1985→2019. Bbox 39.05–39.22, −84.71–−84.37.

## kansas-city-mo
Socrata yearly: 2026=f7wj-ckmw, 2025=dmnp-9ajg, 2024=isbe-v4d8, … back to 2015 (list the pattern via catalog search; fetch each year). PER-INVOLVEMENT rows — DEDUPE by `report` number (~1.9× inflation measured). Fields report_date, offense, `ibrs` NIBRS code (map via code letter/number → crimes-against), location point (97.2%), area (patrol division), beat. Names: spatial-join "Kansas City Neighborhood Boundaries" q45j-ejyk (official) via coords; rows w/o coords place by… nothing named → unplaced-named but keep in citywide (disclose). License Public Domain (attr KCPD). ORI MO0460100 (verify). History 1985→2014. Bbox 38.83–39.40, −94.77–−94.38.

## milwaukee-wi
CKAN `data.milwaukee.gov` datastore_search_sql (POST if WAF blocks GET): current resource 87843297-a6fa-46d4-ba5d-cb342fb2d3bb (wibr, 2024+) + archive 395db729-a30a-4e53-ab66-faeb5e1899c8 (wibrarchive, 2005-02+). Fields Case_Number, Incident_Date, Police_District, `Offense_All` (comma-list of NIBRS codes — map FIRST code to cat; document), Location_All, Address_Latitude/Address_Longitude (99.5%). Names: spatial-join official Neighborhoods polygons `milwaukeemaps.milwaukee.gov/arcgis/rest/services/planning/special_districts/MapServer/4` field NEIGHBORHD (CC-BY). Jun/Jul 2026 still filling (supervisor review lag) — granular ends 2026-05. License CC-BY (attr City of Milwaukee). ORI WI0410100 (verify). History 1985→2004. Bbox 42.84–43.19, −88.07–−87.86.

## charlotte-nc
ArcGIS `gis.charlottenc.gov/arcgis/rest/services/CMPD/CMPDIncidents/MapServer/0` (2017+ → current). EXCLUDE non-criminal 800-series NIBRS codes AND unfounded clearances (CLEARANCE_STATUS — enumerate values, document exclusions + counts). Fields DATE_REPORTED/DATE_INCIDENT_BEGAN (use began), HIGHEST_NIBRS_CODE/DESCRIPTION, LATITUDE_PUBLIC/LONGITUDE_PUBLIC (100%, block-anonymized — disclose), `CMPD_PATROL_DIVISION` names in-data. License = custom disclaimer (quote in PROVENANCE). ORI NC0600100 (verify). History 1985→2016. Bbox 35.01–35.40, −81.01–−80.66.

## nashville-tn
ArcGIS `services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Metro_Nashville_Police_Department_Incidents_view/FeatureServer/0` (2019+ → current). Fields Incident_Occurred, Offense_NIBRS, Offense_Description, Latitude/Longitude (97.1%), Report_Type (enumerate — exclude non-incident types if present, document). Zone/RPA are NULL — names via spatial-join official Police Precinct Boundaries (same org, 9 precincts: Central, East, Hermitage, Madison…). Only 9 regions — leaderboard topN stays 6, quiz still works; note region count. License unstated — attribute "Metro Nashville PD". ORI TN0190100 (verify). History 1985→2018. Bbox 35.98–36.41, −87.05–−86.52.

## dallas-tx
Socrata `dallasopendata.com/resource/qv6i-rri7.json` (June 2014+ → current). date1 is TEXT — parse carefully; use servyr/month1 for binning sanity. Fields nibrs_crime_category, nibrs_crimeagainst (native crimes-against!), `division` (8 names, 100%), geocoded_column (99.8%). Source EXCLUDES sexual offenses + juvenile cases — DISCLOSE prominently (PROVENANCE + on-screen data note). License ODC-BY (attr Dallas PD). ORI TX0570200 (verify). Granular 2015-01 (first full year) → last full month. History 1985→2014. Bbox 32.62–33.02, −96.99–−96.55.

## memphis-tn
ArcGIS `services2.arcgis.com/saWmpKJIUAjyyNVc/arcgis/rest/services/MPD_Public_Safety_Incidents/FeatureServer/0` (2020+ → current, old 2006+ span retired). Fields Offense_Datetime, UCR_Category/UCR_Description, NIBRS_Group A/B, Latitude/Longitude (98.7%, ~3-dec block-level — disclose), `Precinct` station names in-data (RAINES, TILLMAN, …9). License none stated — attribute "Memphis Police Department via City of Memphis Open Data Hub". ORI TN0790100 (verify). Only 9 regions — same note as Nashville. History 1985→2019. Bbox 34.98–35.27, −90.14–−89.64.
