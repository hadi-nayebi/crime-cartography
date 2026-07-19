# Provenance — Cincinnati, OH

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

> **LICENSE FLAG (prominent, per batch spec):** neither Socrata dataset declares a license
> (no `licenseId` in the portal metadata). The data is published on the City of Cincinnati's
> official open-data portal and is used with attribution **"City of Cincinnati / Cincinnati
> Police Department (CPD)"**. CPD/OPDA banner statements about this data: https://insights.cincinnati-oh.gov/stories/s/Banner-Statements-for-Reported-Crime/tcg6-ci6n/

## Primary source — a PAIR of incident datasets (RMS cutover 2024-06-03)

| Field | Legacy set | Current set |
|-------|-----------|-------------|
| Dataset | **Reported Crime (STARS Category Offenses) before 6/3/2024** (`8xzn-kpn7`) | **Reported Crime (STARS Category Offenses) on or after 6/3/2024** (`7aqy-xrv9`) |
| Landing page | https://data.cincinnati-oh.gov/d/8xzn-kpn7 | https://data.cincinnati-oh.gov/d/7aqy-xrv9 |
| API | https://data.cincinnati-oh.gov/resource/8xzn-kpn7.json | https://data.cincinnati-oh.gov/resource/7aqy-xrv9.json |
| Publisher | City of Cincinnati (attribution "City of Cincinnati") | City of Cincinnati |
| License | **not specified** (see flag above) | **not specified** (see flag above) |
| Reports span | 2020-01 → 2024-11-08 (legacy RMS; frozen) | 2024-06-03 → present (~3-week lag; loaded through 2026-06-23 at fetch) |
| Rows fetched (window) | 109,902 | 50,870 |
| Fetched | 2026-07-18T11:43:05.286Z | 2026-07-18T11:43:05.286Z |

The city split its published crime feed when CPD changed records-management systems on
**2024-06-03**. During the **Jun–Nov 2024 transition the sets OVERLAP**: 14
incidents carry the same legacy incident number in both sets and are counted **once** (see dedupe below).

### Windowing (disclosed exclusions; identities validated in-script per set)
- Window: `datefrom` (occurrence date) **2020-01-01 → 2026-05-31**. The **last FULL month was
  measured, not assumed**: the current set is loaded through **2026-06-23** (~3-week lag +
  update cadence), so June 2026 is partial — **1,516 rows** after 2026-05-31 are excluded.
- Legacy set: whole 110,665 = 0 null-datefrom + 763 datefrom before 2020 (junk/old occurrences back to 1989, reported 2020+) + 109,902 in-window + 0 post-window.
- Current set: whole 52,500 = 4 null-datefrom + 110 datefrom before 2020 (junk dates back to year 1024) + 50,870 in-window + 1,516 partial-June-2026.
- `datefrom` is the **occurrence** date (per spec); `datereported` is used only for lag
  measurement and deterministic tie-breaks.

### Dedupe — offense-level rows → incidents (disclosed method)
Both sets publish **offense-level rows**: one incident can repeat its `incident_no` with a
different STARS category (e.g. Auto Theft + Theft from Auto + Part 2 rows for one incident),
and transition-era incidents appear in **both** sets under the same legacy number.

| Step | Rows |
|------|-----:|
| Offense-level rows fetched (window, both sets) | 160,772 |
| − legacy rows for incidents also present in the current set (cross-pair overlap, current system preferred) | 15 |
| − extra offense rows collapsed within one incident (highest STARS severity kept: Part 1 Violent > Part 1 Property > Part 2 — the UCR hierarchy convention) | 6,297 |
| = **incidents** (rows without an `incident_no`: 0 — kept 1:1, undedupable) | **154,460** |

The identity `rows == incidents + cross-pair dropped + within-set collapsed` is asserted
in-script, and every count below is **incident-level**.

### Reconciliation chain (all asserted in-script, exact)
1. **Fetch completeness:** rows fetched per set == independent server-side `count(*)` for the
   same window, and the whole-set partition (null + pre + in + post = whole) holds per set.
2. **Local == server:** local per-month × STARS-rollup × set tallies of the raw rows match the
   server's independent `$group` aggregation **exactly** (every cell, both directions).
3. **Placed + unplaced == citywide** per month × category over the deduped incidents
   (two separate aggregation passes).

### Fields used
`incident_no` (dedupe key) · `datefrom` (occurrence) · `datereported` (lag/tie-breaks) ·
`stars_category` (legacy: rollup; current: specific STARS type) · `type` (current: rollup) ·
`sna_neighborhood` (official SNA name, in-data, both sets) · `latitude_x`/`longitude_x`
(TEXT, 4-decimal) · `address_x` (block-masked). The legacy `offense`/`ucr` fields are
suppressed ("X") for every window row and unusable; the spec's `cpd_neighborhood` exists
**only** in the current set, so the pair-consistent `sna_neighborhood` is used instead (a
disclosed deviation from the batch scout note).

### Category mapping (STARS rollup → cat slot) — complete enumeration
| STARS rollup (source value) | cat slot | incident count |
|---|---|--:|
| Part 1 Violent | `persons` | 12,149 |
| Part 1 Property | `property` | 76,858 |
| Part 2 | `society` | 65,453 |
| (nothing else in source) | `other` | 0 |

**Taxonomy honesty:** CPD publishes the UCR-style **STARS** taxonomy, not NIBRS
crimes-against. **Part 1 Violent includes robbery and strangulation** (robbery is a crime
against *property* under NIBRS — here it stays where the source puts it). **Part 2 is the
source's own "everything else" bucket** (drugs, vandalism, fraud, simple assault, …); it is
carried in the surface's third slot with the honest on-screen label
"Part 2 · All Other Offenses" and is never presented as NIBRS "Crimes Against Society".
The current set's specific `stars_category` values (Auto Theft, Robbery, Rape, Homicide,
Strangulation, Agg Assault, Burglary/BE, Theft from Auto, Personal/Other Theft) roll up to
these three exactly (verified in-data); multi-offense incidents take the highest-severity
rollup. The in-script audit fails loudly on any unmapped value.

### Coverage
- Placed (one of the 50 official SNAs, 2020-01…2026-05): **146,628** (94.9%)
- Unplaced: 7,832 in-window incidents with a blank `sna_neighborhood` — kept in every citywide total and disclosed.

## Geometry source — official SNA polygons

| Field | Value |
|-------|-------|
| Dataset | **Cincinnati Statistical Neighborhood Approximations (2020) — Open Data** — 50 polygons, field `SNA_NAME` |
| FeatureServer | https://services.arcgis.com/JyZag7oO4NteHGiq/arcgis/rest/services/Open_Data/FeatureServer/15 |
| Item page | https://www.arcgis.com/home/item.html?id=6bb28a3fa5c64d41a4b2557d976b0127 |
| Publisher | CAGIS (Cincinnati Area GIS) Open Data, owner `cagisopendata` — the city/county's own GIS consortium |
| License | public open data with an as-is disclaimer (no warranty); attribution CAGIS / City of Cincinnati |
| Join key | `SNA_NAME` — matches the crime data's `sna_neighborhood` values **verbatim, all 50 of 50, in both datasets** (identity join, no fuzzy matching). The layer's merged SNAs ("English Woods_North Fairmount", "Lower Price Hill_Queensgate", "Riverside_Sedamsville") are exactly the merged values the crime data uses. |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (`points.json`)

Coordinates are TEXT at **4-decimal precision (~11 m)** attached to **block-masked addresses**
("25XX BURNET AV") — block-level locations published by CPD, never exact addresses, never
synthesized. **Source artifact (disclosed):** the legacy dataset publishes `latitude_x`/`longitude_x`
**reversed** (latitude_x holds −84.x longitudes); orientation is normalized per-row by value
range — 98,587 incidents swapped back, deterministic. Of 154,460 incidents:
146,633 placeable, 7,319 without usable coordinates, 508 outside the strict
city bbox (lat 39.05–39.22, lng -84.71–-84.37) — all counted in every total, only
missing from the dot layer, and the video says so. Deterministic even-stride sample ≤100/month →
**7,700 points ≈ 1 per 19 placeable incidents**.

## Historical source — FBI UCR (1999–2019 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Cincinnati Police Department — **ORI `OHCIP0000`** (verified: returns "Cincinnati Police Department Offenses" series; the batch scout's `OH0310600` resolves to **Cleves PD** and was corrected via the CDE `agency/byStateAbbr/OH` lookup) |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/OHCIP0000/violent-crime (and `/property-crime`) |
| Span | 1999–2019, annual Violent + Property (12 reported months verified per year) |
| Dropped | Partial years **1997** (<12 reported months) · zero-reported years **1998** (every month zero — a CDE non-reporting artifact; a big city has no true zero-crime year, so showing it would fabricate one) · complete-but-noncontiguous segment **1985–1996** (longest-contiguous-run rule). Nothing is interpolated. |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set `FBI_API_KEY`) |

UCR Summary (Violent/Property) is a **different taxonomy** than CPD STARS — the eras are
presented as distinct and bridge at 2020; they are never equated. No monthly or neighborhood
detail is implied for 1999–2019.

## Reproduce

```bash
FBI_API_KEY=… node pipeline/sources/cincinnati-oh.mjs
```
