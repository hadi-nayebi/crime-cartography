# Provenance — Minneapolis, MN

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **Crime_Data** (consolidated Police Incidents, 2019-present) |
| Publisher | Minneapolis Police Department, via Open Data Minneapolis |
| Landing page | https://www.arcgis.com/home/item.html?id=dfbae39fd25d45838a649d0fc27be4fb (portal: https://opendata.minneapolismn.gov/) |
| API | https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/Crime_Data/FeatureServer/0 |
| Fetched | 2026-07-12T07:13:42.752Z |
| License | CC0 1.0 — the per-year "Police Incidents" items on Open Data Minneapolis are explicitly CC0 and the polygons item carries the city's copyright waiver; the consolidated item's license field is blank, so we cite the per-year items + portal norm. Contact: PoliceOpenData@minneapolismn.gov |
| Attribution | Minneapolis Police Department via Open Data Minneapolis |
| Records used | 382,475 (Occurred_Date < 2026-07-01; dataset grand total 383,680) |
| Source caveat | Refreshed daily; classifications can change as investigations proceed |

### Date field choice (disclosed)
The layer publishes both `Reported_Date` and `Occurred_Date`. **We use `Occurred_Date`** — the map animates *when offenses happened*, not when paperwork was filed. Consequence: 1,304 rows *occurred* before 2019 (back to 1922) but were *reported* 2019+; they are counted in `totalRecords` and disclosed as `unplacedBeats["occurred-pre-2019"]` — never silently dropped.

### Windowing (disclosed exclusions)
- Rows with Occurred_Date on/after **2026-07-01** (partial month at fetch time): **1,204** excluded.
- Rows with **no Occurred_Date**: **1** excluded.
- Both exclusions are outside `totalRecords` and listed here; everything else in the layer is accounted for (382,475 + 1,204 + 1 = 383,680).

### Fields used
`Occurred_Date` · `NIBRS_Crime_Against` · `Offense_Category` · `Offense` · `Address` (block-level) · `Neighborhood` (official name) · `Latitude`/`Longitude` · `Precinct`.

### Category mapping (NIBRS_Crime_Against → cat)
Source values carry **trailing spaces** (e.g. `"Property "`) — matched exactly, mapped by trimmed value. The five distinct values below are exhaustive (verified live against the whole layer):

| Source value (verbatim) | cat | window count |
|---|---|--:|
| "Property " | `property` | 235,313 |
| "Person " | `persons` | 69,334 |
| "Non NIBRS Data" | `other` | 57,475 |
| "Society " | `society` | 20,343 |
| "Not a Crime " | `other` | 10 |

**"Non NIBRS Data"** is MPD's supplemental bucket — mapped to `other`, labeled "Other / non-criminal (context)", and **never counted as NIBRS persons/property/society**. Its contents in the window (note the "Subset of NIBRS …" rows duplicate offenses already counted in the NIBRS categories, another reason they must stay out of the crime counts):

| Offense_Category inside "Non NIBRS Data" | count |
|---|--:|
| Shots Fired Calls | 45,707 |
| Subset of NIBRS Assault Offenses | 6,935 |
| Gunshot Wound Victims | 2,639 |
| Subset of NIBRS Robbery | 2,194 |

Note: **Shots Fired Calls exist in the layer only from 2020-07-08 onward** — the visible jump in the `other` series at 2020-07 is a data-availability artifact, not a crime trend. `other` is context-only and never mixed into the NIBRS categories.

### Row counting (disclosed)
We count **records** (one row = one published offense record). The layer also carries a `Crime_Count` multiplier field (window sum 394,617 vs 382,475 rows); we do not expand rows by it, so our totals are conservative relative to dashboards that sum `Crime_Count`.

### Coverage
- Placed (one of the 87 official neighborhoods, 2019-01…2026-06): **378,538** (99%)
- Unplaced: 3,937 = 1,304 occurred-pre-2019 + 2,633 in-span rows with a null `Neighborhood`.
- Identity `placed + unplaced == citywide` validated per month × category in-script, **plus** one full month (2023-05) re-verified against a paged raw row pull.

## Geometry source — official neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **Minneapolis_Neighborhoods** — 87 polygons, official city neighborhoods |
| FeatureServer | https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/Minneapolis_Neighborhoods/FeatureServer/0 |
| License | CC0-style waiver ("City of Minneapolis has waived all copyright and related or neighboring rights") |
| Join key | `BDNAME` ↔ crime `Neighborhood` — **exact identity** after trimming: all 87 incident names match all 87 polygon names; the only unmatched incident value is null (disclosed as no-neighborhood) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (`points.json`)

Dots are **real offense locations published by MPD** in the `Latitude`/`Longitude` fields (the source additionally publishes `wgsXAnon`/`wgsYAnon` block-anonymized coordinates; we use the primary fields and note both exist — MPD publishes addresses at block grain, e.g. `0015XX LASALLE AVE`). Missing locations appear as 0,0 and a handful fall outside the city box — **2,434 in-span rows (~0.6%) have no usable location** and are counted in every total but not plotted. Client-side gate: lat 44.89–45.06, lng -93.33–-93.19. Deterministic sample: every in-bbox row of each month fetched (OBJECTID order), even-stride ≤100/month → **9,000 points ≈ 1 per 42 of the 378,737 placeable rows**.

## Historical source — FBI UCR (1991–2018 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Minneapolis Police Department — **ORI `MN0271100`** |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/MN0271100/violent-crime (and `/property-crime`) |
| Span | 1991–2018, annual Violent + Property (12 reported months verified per year) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set `FBI_API_KEY`) |

**Dropped partial years (disclosed):** **1990** (violent 1/12, property 1/12 reported months) — an annual total cannot honestly be built from fewer than 12 reported months.
**Dropped complete-but-noncontiguous years (disclosed):** 1985–1989 — these years are complete in the source but separated from the kept series by the partial-year gap above; they are omitted (not merged across the gap) to keep one contiguous honest series. Raw responses are cached under `data/minneapolis-mn/raw/`.

UCR Summary (Violent/Property) is a **different taxonomy** than MPD NIBRS categories — the eras are presented as distinct and bridge at 2019; they are never equated. No monthly or neighborhood detail is implied for 1991–2018.

## Reproduce

```bash
FBI_API_KEY=… node pipeline/sources/minneapolis-mn.mjs
```
