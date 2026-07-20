# Provenance — Grand Rapids, MI

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **GRPD Crime Data** |
| Publisher | City of Grand Rapids Police Department (GRPD), via the City's ArcGIS Hub |
| Landing page | https://grpd-grandrapids.hub.arcgis.com/datasets/grandrapids::grpd-crime-data |
| ArcGIS item | `fe14480243ca4760a9ca446a0c1afb79` |
| FeatureServer (records) | https://services2.arcgis.com/L81TiOwAPO1ZvU9b/arcgis/rest/services/GRPD_Crime_Data/FeatureServer/0 |
| Records | 210,488 |
| Temporal span | 2023-01-01 → 2026-06-01 (`DATEOFOFFENSE`) |
| Geometry | **None** — records carry no coordinates; spatial unit is **Beat** (38 beat codes in the source; **33** carry incidents and are mapped) / Service Area, plus block address as free text |
| Layer "modified" | 2026-06-05 |

### Fields used
`DATEOFOFFENSE` (date) · `NIBRS_Category` (Crimes Against Person/Property/Society, Local, Local-DL, All Other) · `NIBRS_GRP` · `Offense_Description` · `OFFENSETITLE` · `Beat__` (e.g. `C3`) · `Service_Area` · `BLOCK_ADDRESS__INCIDENT_LOCATIO` (free text) · `Weapon_Type` · `Day_of_the_Week`.

### Category mapping (NIBRS_Category → surface key)
| Source value | Key | Count |
|---|---|--:|
| Crimes Against Person | `persons` | 19,575 |
| Crimes Against Property | `property` | 26,017 |
| Crimes Against Society | `society` | 9,278 |
| Local / Local-DL / All Other / 0 | `other` | 155,618 |

`other` is the largest bucket — it is local-ordinance / non-NIBRS-Group-A activity (e.g. "Sound of Gunshots"). It is kept **visible and honestly labeled**, never hidden or relabeled as crime. NIBRS Group A total (persons+property+society) ≈ 54,870.

## Geometry source — beat polygons

| Field | Value |
|-------|-------|
| Dataset | **GRPD ServiceArea Beats 2025** |
| Landing page | https://grpd-grandrapids.hub.arcgis.com/datasets/grandrapids::grpd-servicearea-beats-2025 |
| FeatureServer | https://services2.arcgis.com/L81TiOwAPO1ZvU9b/arcgis/rest/services/GRPD_SERVICE_AREA_MAP_NEW/FeatureServer/1 |
| Geometry | Polygon; join key `BEAT` |

Incident counts are joined to these **real** beat polygons by `Beat__` = `BEAT`. Proportional symbols are drawn at each beat's polygon **centroid** and represent the beat's *aggregate count for the time window* — never an individual incident location.

## Historical source — FBI UCR (2000–2022 deep-history era)

| Field | Value |
|-------|-------|
| Dataset | **FBI Crime Data Explorer (CDE)** — summarized agency offense counts |
| Agency | Grand Rapids Police Department — **ORI `MI4143600`** (verified via CDE `agency/byStateAbbr/MI`) |
| Endpoint | https://api.usa.gov/crime/fbi/cde/summarized/agency/MI4143600/violent-crime (and `/property-crime`) |
| CDE explorer | https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend |
| Span | 2000–2022 (23 full years, no reporting gaps) |
| Series | Annual **Violent** (39,659 total) and **Property** (168,196 total) offense counts |
| Auth | api.data.gov key (DEMO_KEY rate-limited ~30/hr; set `FBI_API_KEY` for a free key) |

These are **real annual UCR counts**. The video animates them as a **monthly average (annual ÷ 12)** and labels them as such on screen — no monthly or beat-level detail is implied for 2000–2022. UCR Summary categories (Violent/Property) are a **different taxonomy** than the NIBRS categories used from 2023; the two are presented as distinct eras, never equated. Three on-screen history captions (2013/2018/2020) are each checkable against `normalized/history.json`.

## Locator source — neighborhood names

| Field | Value |
|-------|-------|
| Dataset | **City of Grand Rapids Neighborhood Areas** |
| Publisher | City of Grand Rapids, via the City's ArcGIS Hub |
| ArcGIS item | `a59c2c3795c442b3af86071c5ee2d74a` |
| FeatureServer | https://services2.arcgis.com/L81TiOwAPO1ZvU9b/arcgis/rest/services/City_of_Grand_Rapids_Neighborhood_Areas/FeatureServer/0 |
| Field used | `NEBRH` (official neighborhood name) — 40 polygons in the source layer; the 33 incident-bearing beats fall into 35 distinct neighborhood names |

Beats carry opaque codes (`CENTRAL 3`) that residents don't use. To label them
with recognizable names, each beat **centroid** is matched to the official City
neighborhood polygon that **contains** it (point-in-polygon). All 33 beats fall
inside a neighborhood (0 nearest-fallbacks). This is a *locator*, not a
re-aggregation of the source data: `CENTRAL 3` → "Oldtown-Heartside". Where two
beats share a neighborhood, the leaderboard/reveal sum those beats — so
"neighborhood" rankings are honest sums of member beats, while the map stays
per-beat. Output: `normalized/neighborhoods.json`. The one source typo
("ken-O-Sha Park") is shown title-cased; names are otherwise verbatim.

## Honesty notes
- No per-incident coordinates exist publicly, so this project does **not** plot individual incident dots at real locations. From 2023 it renders **dot-density**: dots are spread *within* each beat to show *how many* incidents, disclosed on screen as density (not location). Pre-2023 it shows FBI annual totals as a labeled monthly average.
- Block addresses are shown verbatim in the incident feed as recorded (block-level, not exact addresses).
- Crime data reflects **reported** incidents and police activity; it is not a measure of conviction or individual guilt, and reporting/recording practices vary.

## Music / audio (non-data)
The background score is **not data** — it carries no figures and makes no factual claim. It is generated locally with **Stable Audio Open 1.0** (`stabilityai/stable-audio-open-1.0`), an open-weights text-to-audio model, prompted per video phase and arranged to 5:30 by `pipeline/audio/gen_stable_audio.py`. Output: `surface/remotion/public/audio/grand-rapids-music-sao.wav` (gitignored, like other media). A purely procedural fallback bed (`pipeline/audio/gen_music.py`, numpy synthesis) is also kept in-repo.
- **License:** Stability AI **Community License** — free use including commercial use for individuals/organizations under **$1M USD annual revenue**; see https://stability.ai/license. Model card: https://huggingface.co/stabilityai/stable-audio-open-1.0 (gated; accept terms + `hf auth login` before generating).
- The model is trained on royalty-free / appropriately-licensed audio (CC0, Freesound, Free Music Archive) per Stability's model card; generated output is original synthesis, not a sample of any existing recording.

## License / terms
City of Grand Rapids **GIS Data Access and Use Constraint Agreement** — data provided "as is" as a complementary public service. Approximate; not for site-specific or financial decisions; once downloaded, not controlled by the City. Full text on each dataset's ArcGIS item page. This repository redistributes only **aggregated** counts + the published beat polygons, with attribution to GRPD / City of Grand Rapids.

## Reproduce
```bash
node pipeline/sources/grpd.mjs                # fetch records + beat polygons → data/grand-rapids-mi/raw/
node pipeline/sources/fbi-ucr.mjs             # fetch FBI UCR 2000–2022 annual → raw/fbi_ucr.json
node pipeline/normalize.mjs grand-rapids-mi   # GRPD → normalized/{beats,timeline,feed,summary}.json
node pipeline/normalize-history.mjs grand-rapids-mi  # FBI → normalized/history.json
node pipeline/sources/gr-neighborhoods.mjs    # beat centroid → neighborhood → normalized/neighborhoods.json
node pipeline/validate.mjs grand-rapids-mi    # invariants + provenance checks
# music (optional, non-data): needs the venv + HF gated-model access (see Music / audio)
~/.venvs/stableaudio/bin/python pipeline/audio/gen_stable_audio.py --steps 150  # → public/audio/grand-rapids-music-sao.wav
```
Fetched: see `data/grand-rapids-mi/raw/_fetch_meta.json` (GRPD) and `raw/fbi_ucr.json` (FBI UCR) for run timestamps and counts.

## Long-arc trend — placed-share audit (verified 2026-07-19)

The incident-era annuals (2023–2025) are sums of the timeline's placed cells.
Audited against the raw snapshot (same fetch the timeline was built from),
citywide Group A per year vs placed: 2023 = 16,925 vs 16,449 (97.19% placed),
2024 = 15,894 vs 15,361 (96.65%), 2025 = 15,890 vs 15,265 (96.07%) — placed
share drifts 1.1 pp across the era, under the ~2–3 pp materiality bar. Story
check: 2023→2025 is −7.2% placed-only vs −6.1% citywide (same shape; 2024→2025
is −0.6% placed vs −0.03% citywide — both read as flat on the chart). Certified
immaterial; not rebuilt.
