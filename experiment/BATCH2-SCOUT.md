# Batch-2 data-source scouting (live-verified)

Prep for the batch-2 city expansion (ROADMAP.md §2: cluster states to unlock
5-city "state comparative" videos). Each candidate scouted against the hard
selection gates (same bar as batch-1): **incident-level open data · current
through ~mid-2026 · real coordinates high-coverage · resident-known named
areas WITH official polygons · FBI CDE history (ORI) · publishable license.**
The two usual killers are a stale feed and stripped coordinates.

> Every verdict below is a SCOUT signal — before building any city, re-verify
> the live endpoint, coord coverage %, and license yourself (surge doctrine:
> re-verify agent findings). Nothing here has been built.

State targets closest to a 5-city comparative: **TX** (Dallas built), **OH**
(Cincinnati built), NY (Buffalo), CA (San Francisco), TN (Nashville+Memphis).

## Scouted 2026-07-20 — TX cluster (anchor: Dallas)

| City | Verdict | Source / endpoint | Currency | Coords | Named areas + polygons | ORI | License |
|---|---|---|---|---|---|---|---|
| **Fort Worth** | ✅ **GO now** | CFW Police Crime Data (ArcGIS Hub table, 1.45M rows, 1/offense) `services5.arcgis.com/3ddLCBXe1bRt7mzj/.../CFW_Open_Data_Police_Crime_Data_Table_view/FeatureServer/0` | to **2026-07-19** (near-daily, back to 2000) | ~97.9%, but as TEXT in `Location_1` "(lat,lng)" — must parse, drop ~2% nulls | Neighborhood_Boundaries (NEIGHBORHD) + Council Districts + FWPD beats; rows carry Beat/Division/CouncilDistrict | TX2201200 | custom City "AS IS" (publishable w/ credit) |
| **Houston** | 🟡 GO for a **2020–2024** build only | (a) ArcGIS "HPD NIBRS Yearly Cases" FeatureServer w/ point geom+Lat/Lng; (b) monthly NIBRSPublicView CSVs | (a) ends **2024-12-31**; (b) to 2026-06-29 but **no coords** | (a) ~99.97%; (b) none | 88 Super Neighborhoods (SNBNAME) + HPD beats | TXHPD0000 | public-domain / ODC-By |
| **San Antonio** | 🟠 NO-GO for dots (choropleth-only) | SAPD Offenses (Socrata/CKAN, 516k rows) | to 2026-06-30 ✓ | **none** — only Zip + Service_Area | SAPD_Service_Areas match | TXSPD0000 | CC-BY |
| **El Paso** | ❌ NO-GO | no open incident-level geodata (proprietary LexisNexis map + yearly aggregates stale to 2020) | — | none | EPPD regions/districts exist but no counts | TX0710200 | polygons unspecified |

**TX takeaway:** Dallas + Fort Worth + Houston(2020–24) = 3 dot-map cities.
San Antonio joins only if the comparative format accepts a choropleth city; El
Paso is out. To reach 5 dot-map TX cities, scout further agencies (Arlington,
Corpus Christi, Plano; Austin re-check — it removed coords once).

## Scouted 2026-07-20 — OH cluster (anchor: Cincinnati)

| City | Verdict | Source / endpoint | Currency | Coords | Named areas + polygons | ORI | License |
|---|---|---|---|---|---|---|---|
| **Cleveland** | ✅ **GO now** (strongest) | Div. of Police offense reports, ArcGIS Hub `data.clevelandohio.gov`. Split by a Nov-2025 RMS cutover: current `services3.arcgis.com/dty2kHktVXHrqO8i/.../Crime_Incidents_P1RMS/FeatureServer/0` + legacy `.../Crime_Incidents/FeatureServer/0` (2016→2025-11-11) | to **2026-07-19** (daily ~8am) | ~99.2% (LAT/LON + point geom; blockface-masked address, precise point) | 34 Statistical Planning Areas (NEIGHBORHOOD/SPANM) polygons live; wards too | OH0181500 | **ODbL 1.0** (attribution; video is a "Produced Work", share-alike doesn't bind it) |
| **Toledo** | ⚠️ GO for **historical (2019–Jan 2022)** only; NEEDS-DEEPER-CHECK | TPD ArcGIS `y95H5eof6gfZNRUA`: `Crimes_public` (NIBRS 2019–2022, has `nibrscrimeag`=Persons/Property/Society) + `CitywideCrime/FeatureServer/7` (major-crimes subset 2023–2025) | comprehensive frozen **2022-01-19**; subset stalls 2025-09-23; **2022 is a hole** | precise point geom, ~100% sampled | 86+ Neighborhoods polygon layer + Beats/Sectors/Districts | OH0480700 | **UNSTATED** (licenseInfo null) — confirm before publish |
| **Columbus** | ❌ NO-GO | no open incident dataset (portal has only boundary polygons + camera points; incidents only via proprietary LexisNexis Community Crime Map) | — | none | Precincts + "Columbus Communities" polygons are CC0, but nothing to plot | OHCOP0000 | polygons CC0; incidents not open |

⚠️ **Name-collision trap (Columbus):** most "Columbus crime incidents" search
hits are Washington **DC** (`maps2.dcgis.dc.gov/.../MPD/FeatureServer/41`) or
**Louisville KY** (fields `lmpd_beat`) — do not mistake these for Columbus OH.
🚩 Columbus PD also admitted under-reporting ~165k cases to the FBI since 2013
(discovered Oct 2024) → even its FBI aggregate history is known-incomplete.
🚩 Cleveland's Nov-2025 RMS cutover is a real methodology **seam** (legacy vs
new NIBRS highest-offense-per-incident) — a multi-year build must UNION both
services and label 2025-11-11 as a seam (our seamExplain feature already covers
this pattern), and derive `cat` from Statute/UCRdesc (no direct NIBRS group).

**OH takeaway:** Cincinnati + Cleveland = 2 solid; Toledo adds a 3rd only as a
historical-scope video. Reaching ≥5 needs Akron + Dayton scouting (Columbus out).

## Next scouting (not yet run)
NY (Rochester, Syracuse, Yonkers + NYC quarterly re-check), CA (San Diego,
Sacramento, San Jose, Oakland, Long Beach + LA re-check), TN (Knoxville,
Chattanooga, Clarksville → TN already has Nashville+Memphis). Additional TX
(Arlington, Corpus Christi) + OH (Akron, Dayton) to close the ≥5 gaps above.

## Immediate build-ready (both verified GO, current-to-yesterday)
1. **Fort Worth, TX** (TX2201200) — parse `Location_1` text coords.
2. **Cleveland, OH** (OH0181500) — union the two RMS-era services, label the
   2025-11-11 seam, derive `cat` from Statute/UCRdesc.
