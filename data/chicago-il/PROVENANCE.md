# Chicago, IL — data provenance

Built by `pipeline/sources/chicago-il.mjs` (fetch → normalize → validate, one
script, no manual steps). Fetched: 2026-07-11T03:32:09Z.

## Sources

| what | source | grain |
|------|--------|-------|
| Incidents | Socrata **"Crimes - 2001 to Present"** (CPD CLEAR system), dataset `ijzp-q8t2` — https://data.cityofchicago.org/resource/ijzp-q8t2.json — hub: https://data.cityofchicago.org/Public-Safety/Crimes-2001-to-Present/ijzp-q8t2 | incident (block-level anonymized coordinates) |
| Community area polygons | https://data.cityofchicago.org/resource/igwz-8jzy.geojson — 77 official Chicago community areas | polygon |
| Deep history 1986–2002 | FBI Crime Data Explorer (CDE) summarized agency counts, Chicago PD **ORI ILCPD0000** — `https://api.usa.gov/crime/fbi/cde/summarized/agency/ILCPD0000/{violent-crime,property-crime}` | agency monthly (summed to annual) |

## Field mapping (Socrata → canonical)

| Socrata field | canonical | notes |
|---------------|-----------|-------|
| `date` | `date` (YYYY-MM-DD) | floating timestamp, truncated |
| `latitude` / `longitude` | `lat` / `lng` | **block-level anonymized by the City**; ~1.1% null |
| `primary_type` | `cat` | via the table below |
| `community_area` | beat key | joined to polygon `area_numbe`/`area_num_1` → community NAME |
| `block` | `place` | anonymized block address |
| `primary_type — description` | feed `title` | |

## Category mapping (primary_type → cat, NIBRS crimes-against convention)

| cat | primary_type values |
|-----|---------------------|
| `persons` | BATTERY · ASSAULT · HOMICIDE · CRIM SEXUAL ASSAULT · CRIMINAL SEXUAL ASSAULT (same offense, two spellings — merged) · SEX OFFENSE · KIDNAPPING · INTIMIDATION · STALKING · OFFENSE INVOLVING CHILDREN · HUMAN TRAFFICKING · DOMESTIC VIOLENCE |
| `property` | THEFT · BURGLARY · MOTOR VEHICLE THEFT · ROBBERY · ARSON · CRIMINAL DAMAGE · CRIMINAL TRESPASS · DECEPTIVE PRACTICE |
| `society` | NARCOTICS · OTHER NARCOTIC VIOLATION · PROSTITUTION · GAMBLING · WEAPONS VIOLATION · LIQUOR LAW VIOLATION · PUBLIC PEACE VIOLATION · INTERFERENCE WITH PUBLIC OFFICER · PUBLIC INDECENCY · OBSCENITY · CONCEALED CARRY LICENSE VIOLATION |
| `other` | OTHER OFFENSE · NON-CRIMINAL (all spellings) · RITUALISM · anything unrecognized (implemented as NOT IN the three lists above, so nothing is ever dropped) |

Unrecognized `primary_type` values found at fetch time (all counted in `other`):
none — all 34 primary_type values in the live dataset are covered by the table above.

## Coverage & honesty notes

- **Full dataset**: **8,590,211** records, 2001-01-01 → present.
- **Granular era = 2003-01 → 2026-06** (last FULL month; the partial max month
  is dropped). `community_area` is unreliable in 2001–2002 (~612k rows null
  there, <250/yr from 2003) — those years are **excluded from the map era**,
  counted, and disclosed, never guessed.
- **Placed**: **7,615,113** records mapped to one of the 77 community areas
  (**88.6% of the full dataset**). Unplaced, disclosed in
  `summary.json → unplacedBeats`: pre-2003 = 972,806, no/invalid
  community area within the window = 1,594 (includes community_area = "0"), partial month 2026-07
  = 698.
- **Timeline cells are exact Socrata aggregation counts** (server-side
  `$group=community_area,date_trunc_ym(date)` per category). Validated:
  placed + unplaced equals independent citywide monthly counts with **0
  tolerance**, per category per month.
- **Points are REAL incident locations** (block-level anonymized by the City
  of Chicago) — a deterministic sample of ≤100/month. Sampling deviation from
  first plan: per-month query ordered by `case_number` with a fixed stride,
  because `$order=:id` proved type-clustered in the source (early-loaded
  homicide records first) and would have painted a non-representative map.
  No coordinates are ever synthesized. Rows geocoded outside the Chicago
  bbox (41.6–42.05, −87.95–−87.5) are excluded from the sample (6 such
  rows encountered).
- **Feed**: 4 real incidents per quarter in `:id` order (deterministic, no
  seriousness cherry-picking), `title = primary_type — description`,
  `place = block` (anonymized by the City).
- **History era 1986–2002**: FBI CDE UCR summarized counts for ORI ILCPD0000,
  summed from monthly actuals; every kept year verified to have 12 nonzero
  months. **1985 dropped**: the CDE reports most 1985 months as 0 with
  quarterly lumps (quarterly reporting, not monthly) — start at 1986. UCR
  Summary taxonomy (violent/property) is kept distinct from the 2003+
  incident categories; the eras bridge at 2003 and are never mixed.
- Community areas double as the resident-known neighborhood names
  (`neighborhoods.json`, identity mapping).

## License / terms

Chicago open data terms: https://www.chicago.gov/city/en/narr/foia/data_disclaimer.html
Required verbatim disclaimer for derivative works:

> This site provides applications using data that has been modified for use
> from its original source, www.cityofchicago.org, the official website of the
> City of Chicago. The City of Chicago makes no claims as to the content,
> accuracy, timeliness, or completeness of any of the data provided at this
> site. The data provided at this site is subject to change at any time. It is
> understood that the data provided at this site is being used at one's own
> risk.

FBI CDE data is US-government public domain (api.usa.gov / api.data.gov).

## Reproduce

```bash
node pipeline/sources/chicago-il.mjs   # env FBI_API_KEY optional
```

Raw pulls land in `data/chicago-il/raw/` (gitignored except
`_fetch_meta.json`); normalized bundle in `data/chicago-il/normalized/`.
The script validates everything listed above and exits nonzero on any
mismatch ("VALIDATION PASS" printed on success).

## Long-arc trend — placed-share audit (verified 2026-07-19)

Incident-era annuals (2003–2025 from the timeline; 2001–2002 citywide at build
time) re-checked against a fresh citywide `count(*)` per year at the source:
every year matches within 0.06% (largest gap 254 records in 2008 ≈ the 1,594
in-span no-community-area rows plus post-fetch source revisions). Worst-case
single-year bias bound: 1,594 ⁄ 209,679 ≈ 0.76 pp. Certified immaterial; not
rebuilt.
