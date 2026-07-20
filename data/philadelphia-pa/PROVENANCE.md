# Philadelphia, PA — data provenance

Built by `pipeline/sources/philadelphia-pa.mjs` (fetch → normalize → validate,
one script, no manual steps). Fetched: 2026-07-12T07:07:04Z.

## Sources

| what | source | grain |
|------|--------|-------|
| Incidents | **"Crime Incidents"** (PPD INCT system), Carto SQL API, table `incidents_part1_part2` — `https://phl.carto.com/api/v2/sql` — hub: https://opendataphilly.org/datasets/crime-incidents/ | incident (block-level coordinates; addresses generalized to the hundred block) |
| District polygons | PPD police districts (21 current districts), City of Philadelphia ArcGIS — `services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/Boundaries_District/FeatureServer/0` (field `dist_numc`) | polygon |
| Neighborhood names | City of Philadelphia **Neighborhoods** polygon layer (158 named areas) — `services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/Neighborhoods/FeatureServer/0` (field `MAPNAME`) | polygon |
| District divisions / 77th = Airport | Official PPD districts list — https://www.phillypolice.com/district/districts-list/ (fetched 2026-07-12) | reference |
| Deep history 1985–2005 | FBI Crime Data Explorer (CDE) summarized agency counts, Philadelphia PD **ORI PAPEP0000** — `https://api.usa.gov/crime/fbi/cde/summarized/agency/PAPEP0000/{violent-crime,property-crime}` | agency monthly (summed to annual) |

## Field mapping (Carto → canonical)

| Carto field | canonical | notes |
|-------------|-----------|-------|
| `dispatch_date` | `date` (YYYY-MM-DD) | varchar in source; string-compared |
| `point_y` / `point_x` | `lat` / `lng` | **block-level** (addresses shown as "1900 BLOCK …"); ~1.6% null |
| `text_general_code` | `cat` | via the table below |
| `dc_dist` | beat key | two-digit district code, joined verbatim to polygon `dist_numc` |
| `location_block` | `place` | hundred-block anonymized address |
| `text_general_code` | feed `title` | |

## Category mapping (text_general_code → cat, NIBRS crimes-against convention)

All 32 non-null values present in the live dataset are covered; nothing is dropped.

| cat | text_general_code values |
|-----|--------------------------|
| `persons` | Homicide - Criminal · Homicide - Justifiable · Homicide - Gross Negligence · Rape · Other Sex Offenses (Not Commercialized) · Aggravated Assault Firearm · Aggravated Assault No Firearm · Other Assaults · Offenses Against Family and Children |
| `property` | Robbery Firearm · Robbery No Firearm · Burglary Residential · Burglary Non-Residential · Thefts · Theft from Vehicle · Motor Vehicle Theft · Arson · Vandalism/Criminal Mischief · Fraud · Forgery and Counterfeiting · Receiving Stolen Property · Embezzlement |
| `society` | Narcotic / Drug Law Violations · Weapon Violations · Prostitution and Commercialized Vice · Gambling Violations · DRIVING UNDER THE INFLUENCE · Liquor Law Violations · Public Drunkenness · Disorderly Conduct · Vagrancy/Loitering |
| `other` | All Other Offenses · NULL (1 row) · anything unrecognized (implemented as NOT-IN the three lists above, so nothing is ever dropped) |

Unrecognized `text_general_code` values found at fetch time (counted in `other`):
none — all 32 non-null values in the live dataset are covered by the table above.

## Coverage & honesty notes

- **Full dataset**: **3,566,030** records, 2006-01-01 → present (updated daily).
- **Granular era = 2006-01 → 2026-06** (last FULL month; the partial month
  2026-07 is dropped, counted, and disclosed).
- **Placed**: **3,361,035** records mapped to one of the 21 current
  police districts (**94.3% of the full dataset**).
- **Unplaced, disclosed in `summary.json → unplacedBeats`**: the polygon layer
  carries only the 21 CURRENT districts. Rows tagged to **retired districts**
  have no polygon to join and are counted as unplaced, never guessed into a
  neighbor: 4th District (merged into the 3rd, last row 2023-07; 27,987 rows),
  6th District (merged into the 9th, last row 2024-10; 144,961 rows),
  23rd District (split between 22nd/25th, last row 2013-07; 26,306 rows),
  district code 92 (retired special code, no polygon in the current layer,
  last row 2009-04; 1,491 rows).
  Plus 1 row(s) with null date/district and
  4,249 rows in the partial month 2026-07.
- **Timeline cells are exact Carto aggregation counts** (server-side
  `GROUP BY left(dispatch_date,7), dc_dist` per category). Validated:
  placed + unplaced equals independent citywide monthly counts with **0
  tolerance**, per category per month; the three-way partition
  pre-window + window + partial-month == full-table count(*) is also exact.
- **Points are REAL incident locations** (block-level, published by PPD) — a
  deterministic sample of ≤100/month ordered by `md5(dc_key)` (pseudo-random,
  so type- and district-representative; plain insertion order risks
  clustering). No coordinates are ever synthesized. Rows geocoded outside the
  city bbox (39.86–40.14, −75.29–−74.95) are excluded from the sample and
  counted (22 such rows).
- **Feed**: 4 real incidents per quarter in `cartodb_id` order (deterministic,
  no seriousness cherry-picking), `title = text_general_code`,
  `place = location_block` (hundred-block anonymized by PPD).
- **Resident-known district names**: PPD district numbers are not
  resident-known. The current phillypolice.com district pages no longer list
  the neighborhoods each district serves (verified 2026-07-12, including
  Wayback snapshots), so labels are built **from data**: each district's REAL
  sampled incident locations are point-in-polygon matched against the City's
  official Neighborhoods layer and ranked by count
  (`neighborhoods.json → map[dist].hoods`, with per-hood shares). Labels like
  "24th · Richmond / Harrowgate" are marked `approx:true` — the names describe
  the district's area; the boundaries shown are always the official district
  polygons. The 77th District is the Airport district (per the PPD districts
  list). Police-division tags (`servcen`) come from the same PPD list.
- **Trend honesty — district mergers**: when a district retires, its
  workload moves to the absorbing district(s), so single-district trends that
  cross a merger date are partly **boundary changes, not crime changes**. In
  particular the 9th District's post-2024 rise largely reflects absorbing the
  6th (Center City East) in Oct 2024, and the 3rd absorbed the 4th in
  Jul 2023. Citywide totals are unaffected. Any narrative comparing
  district-level numbers across 2013/2023/2024 must say so.
- **History era 1985–2005**: FBI CDE UCR summarized counts for ORI PAPEP0000,
  summed from monthly actuals; every kept year verified to have 12 nonzero
  months. UCR Summary taxonomy (violent/property) is kept distinct from the
  2006+ incident categories; the eras bridge at 2006 and are never mixed.

## License / terms

- Incidents, district polygons, neighborhoods: **City of Philadelphia
  License** — data are provided "as-is" without warranty of any kind, and the
  user agrees to hold the City of Philadelphia harmless (summary; see the
  official terms). Terms: https://metadata.phila.gov/#help/help-faqs/what-are-the-terms-of-use/
  — dataset listing: https://opendataphilly.org/datasets/crime-incidents/
- Attribution: **City of Philadelphia / Philadelphia Police Department via
  OpenDataPhilly**.
- FBI CDE data is US-government public domain (api.usa.gov / api.data.gov).

## Reproduce

```bash
node pipeline/sources/philadelphia-pa.mjs   # env FBI_API_KEY optional
```

Raw pulls land in `data/philadelphia-pa/raw/` (gitignored except
`_fetch_meta.json`); normalized bundle in `data/philadelphia-pa/normalized/`.
The script validates everything listed above and exits nonzero on any
mismatch ("VALIDATION PASS" printed on success).

## Long-arc trend — audit note (verified 2026-07-19)

Incident-era annuals in `trend.json` were already **citywide from the source**
(carto SQL `count(*)` per dispatch year, including districts retired in later
boundary mergers) — not sums of the timeline's placed cells. Certified
CITYWIDE; no placed-share bias applies.
