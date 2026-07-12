// San Francisco, CA crime-data source — fetch → normalize → validate, one script.
//
// Data sources (all real, citable — ODC PDDL 1.0, attribution
// "San Francisco Police Department via DataSF"):
//   * Modern:     Socrata "Police Department Incident Reports: 2018 to Present"
//                 https://data.sfgov.org/resource/wg3w-h783.json  (2018-01-01 →)
//   * Historical: Socrata "Police Department Incident Reports: Historical 2003 to May 2018"
//                 https://data.sfgov.org/resource/tmnf-yvry.json  (2003-01-01 → 2018-05-15)
//                 Used ONLY through 2017-12-31; the 2018 overlap is dropped and
//                 disclosed to avoid double counting at the wg3w cutover.
//   * Polygons:   DataSF "Analysis Neighborhoods" (41 official areas, `nhood`)
//                 https://data.sfgov.org/resource/j2bu-swwd.geojson
//   * History:    FBI Crime Data Explorer (CDE), San Francisco PD ORI CA0386000
//                 (UCR summarized violent/property, annual 1985–2002; ORI
//                 verified at fetch time with a CA agency-lookup fallback)
//
// HONESTY RULES (binding):
//   * No fabricated numbers or dot positions. Timeline cells are exact source
//     counts. Points are REAL incident locations (deterministic sample,
//     disclosed as such).
//   * tmnf (2003–2017) has NO neighborhood field → rows are assigned to the 41
//     official Analysis Neighborhoods by POINT-IN-POLYGON on their REAL
//     published coordinates (real coords × official polygons — method
//     disclosed in PROVENANCE.md and neighborhoods.json.method, and spot-
//     checked against DataSF's own analysis_neighborhood assignment).
//   * wg3w rows with a null analysis_neighborhood but valid coordinates are
//     point-in-polygon-assigned the same way; null-neighborhood + no usable
//     coordinates rows are counted and disclosed as unplaced — never guessed.
//   * 2026-07 is a partial month at fetch time → window ends 2026-06 and the
//     remainder is disclosed. tmnf rows geocoded outside the SF bbox are real
//     rows with junk coordinates — counted, never plotted, disclosed.
//
// Usage:  node pipeline/sources/san-francisco-ca.mjs
//         (env FBI_API_KEY optional; DEMO_KEY fallback with 90s→300s backoff)
//
// Outputs: data/san-francisco-ca/normalized/{beats,timeline,feed,summary,
//          history,neighborhoods,points}.json + PROVENANCE.md + wiki section.
//          raw/ keeps small dumps only (gitignored except _fetch_meta.json).

import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const RAW_DIR = resolve(repoRoot, "data/san-francisco-ca/raw");
const NORM_DIR = resolve(repoRoot, "data/san-francisco-ca/normalized");
const PROV_PATH = resolve(repoRoot, "data/san-francisco-ca/PROVENANCE.md");
const WIKI_PATH = resolve(repoRoot, "wiki/Data-Provenance.md");
mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(NORM_DIR, { recursive: true });

// ---------------------------------------------------------------- constants
const SODA_NEW = "https://data.sfgov.org/resource/wg3w-h783.json";
const SODA_OLD = "https://data.sfgov.org/resource/tmnf-yvry.json";
const GEO_URL = "https://data.sfgov.org/resource/j2bu-swwd.geojson";
const HUB_NEW =
  "https://data.sfgov.org/Public-Safety/Police-Department-Incident-Reports-2018-to-Present/wg3w-h783";
const HUB_OLD =
  "https://data.sfgov.org/Public-Safety/Police-Department-Incident-Reports-Historical-2003/tmnf-yvry";
// ORI verified at fetch time via the CDE CA agency lookup: "San Francisco
// Police Department" (City, San Francisco County) = CA0380100. The initially
// suggested CA0386000 returns an EMPTY actuals object — the lookup fallback
// below re-derives the right ORI if this ever drifts.
const ORI_DEFAULT = "CA0380100";
const AGENCY = "San Francisco Police Department";
const FBI_KEY = process.env.FBI_API_KEY || "DEMO_KEY";

// Granular window: 2003-01 .. 2026-06 (2026-07 is partial at fetch time).
// Cutover: tmnf strictly before 2018-01-01, wg3w from 2018-01-01 (tmnf's
// 2018-01-01..2018-05-15 tail is dropped + disclosed to avoid double count).
const WIN_START = "2003-01-01T00:00:00";
const CUTOVER = "2018-01-01T00:00:00";
const WIN_END = "2026-07-01T00:00:00"; // exclusive
const DATE_MIN = "2003-01-01";
const DATE_MAX = "2026-06-30";
const BBOX = { latMin: 37.7, latMax: 37.84, lngMin: -122.52, lngMax: -122.35 };

const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff4d6d" },
  property: { label: "Crimes Against Property", color: "#38bdf8" },
  society: { label: "Crimes Against Society", color: "#ffd166" },
  other: { label: "Other / non-criminal (context)", color: "#64748b" },
};
const CAT_KEYS = ["persons", "property", "society", "other"];
const CAT_IDX = { persons: 0, property: 1, society: 2, other: 3 };

// ---- category mapping (NIBRS crimes-against convention) --------------------
// BOTH source vocabularies were enumerated with $group queries before this
// script was written, and are re-enumerated at RUN time: any distinct value
// not present in these explicit tables is a hard VALIDATION FAIL — nothing is
// ever bucketed silently. Full tables (with window counts) are written to
// data/san-francisco-ca/PROVENANCE.md.
//
// wg3w `incident_category` (2018+). null → other (disclosed).
const MAP_NEW = {
  // crimes against persons
  Homicide: "persons",
  Assault: "persons",
  Rape: "persons",
  "Sex Offense": "persons",
  "Offences Against The Family And Children": "persons",
  "Human Trafficking (A), Commercial Sex Acts": "persons",
  "Human Trafficking (B), Involuntary Servitude": "persons",
  "Human Trafficking, Commercial Sex Acts": "persons",
  // crimes against property (NIBRS counts robbery, bribery, fraud as property)
  "Larceny Theft": "property",
  Burglary: "property",
  Robbery: "property",
  "Motor Vehicle Theft": "property",
  "Motor Vehicle Theft?": "property", // source's own uncertain-label variant of MV theft
  Arson: "property",
  "Malicious Mischief": "property", // vandalism/property damage
  Vandalism: "property",
  Fraud: "property",
  "Forgery And Counterfeiting": "property",
  Embezzlement: "property",
  "Stolen Property": "property",
  // crimes against society
  "Drug Offense": "society",
  "Drug Violation": "society",
  "Weapons Offense": "society",
  "Weapons Offence": "society", // spelling variant in source
  "Weapons Carrying Etc": "society",
  Prostitution: "society",
  "Disorderly Conduct": "society",
  "Liquor Laws": "society",
  Gambling: "society",
  "Traffic Violation Arrest": "society", // incl. DUI-type driving offenses
  // other / non-criminal / administrative (context only)
  "Other Miscellaneous": "other",
  Other: "other",
  "Other Offenses": "other",
  "Non-Criminal": "other",
  "Recovered Vehicle": "other",
  Warrant: "other",
  "Lost Property": "other",
  "Missing Person": "other",
  "Suspicious Occ": "other",
  Suspicious: "other",
  "Miscellaneous Investigation": "other",
  "Case Closure": "other",
  "Courtesy Report": "other",
  "Traffic Collision": "other",
  "Fire Report": "other",
  "Civil Sidewalks": "other",
  "Vehicle Impounded": "other",
  "Vehicle Misplaced": "other",
  Suicide: "other", // not a crime — context only
};
// tmnf `category` (2003–2017).
const MAP_OLD = {
  // crimes against persons
  ASSAULT: "persons", // tmnf has no separate homicide category; homicides are in ASSAULT
  "SEX OFFENSES, FORCIBLE": "persons",
  "SEX OFFENSES, NON FORCIBLE": "persons",
  KIDNAPPING: "persons",
  // crimes against property
  "LARCENY/THEFT": "property",
  "VEHICLE THEFT": "property",
  BURGLARY: "property",
  ROBBERY: "property",
  VANDALISM: "property",
  ARSON: "property",
  FRAUD: "property",
  "FORGERY/COUNTERFEITING": "property",
  "BAD CHECKS": "property",
  EMBEZZLEMENT: "property",
  EXTORTION: "property",
  BRIBERY: "property",
  "STOLEN PROPERTY": "property",
  TRESPASS: "property",
  // crimes against society
  "DRUG/NARCOTIC": "society",
  "WEAPON LAWS": "society",
  PROSTITUTION: "society",
  "DRIVING UNDER THE INFLUENCE": "society",
  DRUNKENNESS: "society",
  "DISORDERLY CONDUCT": "society",
  "LIQUOR LAWS": "society",
  LOITERING: "society",
  GAMBLING: "society",
  "PORNOGRAPHY/OBSCENE MAT": "society",
  // other / non-criminal / administrative
  "OTHER OFFENSES": "other",
  "NON-CRIMINAL": "other",
  WARRANTS: "other",
  "SUSPICIOUS OCC": "other",
  "MISSING PERSON": "other",
  "SECONDARY CODES": "other",
  "RECOVERED VEHICLE": "other",
  SUICIDE: "other",
  TREA: "other", // treason statute code, a handful of administrative rows
};
const mapNew = (v) => (v == null ? "other" : MAP_NEW[v]);
const mapOld = (v) => (v == null ? "other" : MAP_OLD[v]);

// SoQL IN-lists per cat for wg3w aggregate queries
const sq = (s) => `'${s.replace(/'/g, "''")}'`;
function catWhereNew(cat) {
  const vals = Object.keys(MAP_NEW).filter((k) => MAP_NEW[k] === cat);
  const list = vals.map(sq).join(",");
  if (cat === "other") return `(incident_category in(${list}) OR incident_category IS NULL)`;
  return `incident_category in(${list})`;
}
function catWhereOld(cat) {
  const vals = Object.keys(MAP_OLD).filter((k) => MAP_OLD[k] === cat);
  const list = vals.map(sq).join(",");
  if (cat === "other") return `(category in(${list}) OR category IS NULL)`;
  return `category in(${list})`;
}

// months 2003-01 .. 2026-06 (282)
const MONTHS = [];
for (let y = 2003; y <= 2026; y++)
  for (let m = 1; m <= 12; m++) {
    if (y === 2026 && m > 6) break;
    MONTHS.push(`${y}-${String(m).padStart(2, "0")}`);
  }
const MONTH_IDX = Object.fromEntries(MONTHS.map((m, i) => [m, i]));
const OLD_MONTHS = 180; // 2003-01..2017-12 → idx 0..179 (tmnf era)

// ------------------------------------------------------------------ helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON(url, { tries = 6, label = "" } = {}) {
  let lastErr;
  for (let a = 0; a < tries; a++) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (r.status === 200) return await r.json();
      const body = (await r.text()).slice(0, 300);
      if (r.status === 400 || r.status === 404)
        throw Object.assign(new Error(`HTTP ${r.status} ${label}: ${body}`), { fatal: true });
      lastErr = new Error(`HTTP ${r.status} ${label}: ${body}`);
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = e;
    }
    const wait = 2000 * (a + 1);
    console.warn(`  retry ${a + 1}/${tries - 1} in ${wait}ms (${label}): ${lastErr.message.slice(0, 120)}`);
    await sleep(wait);
  }
  throw lastErr;
}
function soda(base, params) {
  const q = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${base}?${q}`;
}
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const ymOf = (ts) => String(ts).slice(0, 7);

function assert(cond, msg) {
  if (!cond) {
    console.error(`VALIDATION FAIL: ${msg}`);
    process.exit(1);
  }
}
function assertNoNaN(obj, path) {
  const stack = [[obj, path]];
  while (stack.length) {
    const [o, p] = stack.pop();
    if (typeof o === "number") assert(Number.isFinite(o), `non-finite number at ${p}`);
    else if (Array.isArray(o)) o.forEach((v, i) => stack.push([v, `${p}[${i}]`]));
    else if (o && typeof o === "object")
      for (const [k, v] of Object.entries(o)) stack.push([v, `${p}.${k}`]);
  }
}
const zeroCatMonths = () => Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));

// ---------------------------------------------------- point-in-polygon core
// Even-odd ray casting on outer rings (the 41 Analysis Neighborhood parts have
// no holes — asserted at load). A coarse grid index over the SF bbox keeps the
// ~2M-row scan fast.
function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const GRID_N = 128;
function buildPip(hoods) {
  const parts = []; // { hood, ring, bbox }
  for (const [name, h] of Object.entries(hoods)) {
    for (const ring of h.polygon) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y] of ring) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      parts.push({ hood: name, ring, bbox: [x0, y0, x1, y1] });
    }
  }
  const gx = (lng) => Math.max(0, Math.min(GRID_N - 1, Math.floor(((lng - BBOX.lngMin) / (BBOX.lngMax - BBOX.lngMin)) * GRID_N)));
  const gy = (lat) => Math.max(0, Math.min(GRID_N - 1, Math.floor(((lat - BBOX.latMin) / (BBOX.latMax - BBOX.latMin)) * GRID_N)));
  const grid = Array.from({ length: GRID_N * GRID_N }, () => []);
  parts.forEach((p, pi) => {
    const [x0, y0, x1, y1] = p.bbox;
    for (let cy = gy(y0); cy <= gy(y1); cy++)
      for (let cx = gx(x0); cx <= gx(x1); cx++) grid[cy * GRID_N + cx].push(pi);
  });
  return (lng, lat) => {
    for (const pi of grid[gy(lat) * GRID_N + gx(lng)]) {
      const p = parts[pi];
      const [x0, y0, x1, y1] = p.bbox;
      if (lng < x0 || lng > x1 || lat < y0 || lat > y1) continue;
      if (inRing(p.ring, lng, lat)) return p.hood;
    }
    return null;
  };
}

// ------------------------------------------------------- 1. area polygons
async function fetchHoods() {
  console.log("1/9 Analysis Neighborhood polygons…");
  const gj = await fetchJSON(GEO_URL, { label: "geojson" });
  writeFileSync(resolve(RAW_DIR, "analysis_neighborhoods.geojson"), JSON.stringify(gj));
  assert(gj.features?.length === 41, `expected 41 neighborhoods, got ${gj.features?.length}`);
  const hoods = {};
  gj.features.forEach((f, idx) => {
    const name = f.properties?.nhood;
    assert(typeof name === "string" && name.length > 0, `feature ${idx}: missing nhood`);
    assert(!hoods[name], `duplicate nhood '${name}'`);
    const g = f.geometry;
    const parts = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
    for (const part of parts)
      assert(part.length === 1, `'${name}': polygon holes present — PIP must handle holes`);
    const polygon = parts.map((part) => part[0].map(([lng, lat]) => [r6(lng), r6(lat)]));
    // area-weighted centroid across parts (planar shoelace; fine at city scale)
    let AW = 0, cx = 0, cy = 0;
    for (const ring of polygon) {
      let A = 0, sx = 0, sy = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
        const cross = x1 * y2 - x2 * y1;
        A += cross; sx += (x1 + x2) * cross; sy += (y1 + y2) * cross;
      }
      A /= 2;
      if (Math.abs(A) < 1e-12) continue;
      const w = Math.abs(A);
      cx += (sx / (6 * A)) * w; cy += (sy / (6 * A)) * w; AW += w;
    }
    assert(AW > 0, `degenerate polygon for ${name}`);
    hoods[name] = { name, beat: idx, polygon, centroid: [r6(cx / AW), r6(cy / AW)] };
  });
  console.log(`  41 neighborhoods (e.g. ${Object.keys(hoods).slice(0, 3).join(", ")})`);
  return hoods;
}

// ----------------------------- 2. enumerate BOTH category vocabularies first
async function enumerateCategories() {
  console.log("2/9 enumerating distinct categories in both sources (window-filtered)…");
  const newRows = await fetchJSON(
    soda(SODA_NEW, {
      $select: "incident_category,count(*) AS n",
      $where: `incident_datetime >= '${CUTOVER}' AND incident_datetime < '${WIN_END}'`,
      $group: "incident_category", $order: "n DESC", $limit: 1000,
    }),
    { label: "enum wg3w" },
  );
  await sleep(150);
  const oldRows = await fetchJSON(
    soda(SODA_OLD, {
      $select: "category,count(*) AS n",
      $where: `date >= '${WIN_START}' AND date < '${CUTOVER}'`,
      $group: "category", $order: "n DESC", $limit: 1000,
    }),
    { label: "enum tmnf" },
  );
  writeFileSync(resolve(RAW_DIR, "distinct_categories.json"),
    JSON.stringify({ wg3w: newRows, tmnf: oldRows }, null, 2));
  // HARD GATE: every distinct value must be explicitly mapped — nothing silent.
  for (const r of newRows)
    assert(r.incident_category == null || MAP_NEW[r.incident_category],
      `wg3w incident_category '${r.incident_category}' (${r.n} rows) is NOT in the explicit mapping table`);
  for (const r of oldRows)
    assert(r.category == null || MAP_OLD[r.category],
      `tmnf category '${r.category}' (${r.n} rows) is NOT in the explicit mapping table`);
  const newTable = newRows.map((r) => ({ value: r.incident_category ?? null, n: Number(r.n), cat: mapNew(r.incident_category) }));
  const oldTable = oldRows.map((r) => ({ value: r.category ?? null, n: Number(r.n), cat: mapOld(r.category) }));
  console.log(`  wg3w: ${newTable.length} distinct values, all mapped · tmnf: ${oldTable.length} distinct values, all mapped`);
  return { newTable, oldTable };
}

// -------------------------------------------- 3. wg3w era (2018-01..2026-06)
async function fetchModernEra(hoods, pip) {
  console.log("3/9 wg3w timeline: per-cat monthly by analysis_neighborhood…");
  const HOOD_SET = new Set(Object.keys(hoods));
  const cells = {};
  for (const k of HOOD_SET) cells[k] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  const placedByCatMonth = zeroCatMonths(); // via analysis_neighborhood field
  const nullByCatMonth = zeroCatMonths(); // null-neighborhood rows (agg)
  const winWhere = `incident_datetime >= '${CUTOVER}' AND incident_datetime < '${WIN_END}'`;
  for (const cat of CAT_KEYS) {
    const rows = await fetchJSON(
      soda(SODA_NEW, {
        $select: "analysis_neighborhood,date_trunc_ym(incident_datetime) AS ym,count(*) AS n",
        $where: `${catWhereNew(cat)} AND ${winWhere}`,
        $group: "analysis_neighborhood,ym", $order: "ym", $limit: 50000,
      }),
      { label: `wg3w agg:${cat}` },
    );
    assert(rows.length < 50000, `wg3w agg ${cat}: hit $limit`);
    for (const r of rows) {
      const mi = MONTH_IDX[ymOf(r.ym)];
      assert(mi !== undefined && mi >= OLD_MONTHS, `wg3w agg ${cat}: month ${r.ym} outside era`);
      const n = Number(r.n);
      const hood = r.analysis_neighborhood;
      if (hood == null) nullByCatMonth[cat][mi] += n;
      else {
        assert(HOOD_SET.has(hood), `wg3w agg: unexpected analysis_neighborhood '${hood}'`);
        cells[hood][mi][cat] += n;
        placedByCatMonth[cat][mi] += n;
      }
    }
    await sleep(150);
  }

  // null-neighborhood rows: fetch them ALL; PIP the ones with real coords.
  console.log("  wg3w null-neighborhood rows → point-in-polygon on real coords…");
  const pipByCatMonth = zeroCatMonths(); // null-hood rows rescued by PIP
  const unplacedByCatMonth = zeroCatMonths(); // null-hood + no usable coords / PIP miss
  let nullTotal = 0, nullPipPlaced = 0, nullNoCoords = 0, nullPipMiss = 0;
  let offset = 0;
  for (;;) {
    const rows = await fetchJSON(
      soda(SODA_NEW, {
        $select: "incident_datetime,incident_category,latitude,longitude",
        $where: `analysis_neighborhood IS NULL AND ${winWhere}`,
        $order: ":id", $limit: 50000, $offset: offset,
      }),
      { label: `wg3w null-hood@${offset}` },
    );
    for (const r of rows) {
      nullTotal++;
      const mi = MONTH_IDX[ymOf(r.incident_datetime)];
      assert(mi !== undefined, `wg3w null-hood: bad month ${r.incident_datetime}`);
      const cat = mapNew(r.incident_category);
      assert(cat, `wg3w null-hood: unmapped category '${r.incident_category}'`);
      const lat = Number(r.latitude), lng = Number(r.longitude);
      const hasCoords = r.latitude != null && r.longitude != null &&
        Number.isFinite(lat) && Number.isFinite(lng) &&
        lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax;
      const hood = hasCoords ? pip(lng, lat) : null;
      if (hood) {
        cells[hood][mi][cat]++;
        pipByCatMonth[cat][mi]++;
        nullPipPlaced++;
      } else {
        unplacedByCatMonth[cat][mi]++;
        if (hasCoords) nullPipMiss++;
        else nullNoCoords++;
      }
    }
    if (rows.length < 50000) break;
    offset += 50000;
    await sleep(150);
  }
  // exact identity: agg null == pip-placed + unplaced, per cat per month
  for (const cat of CAT_KEYS)
    for (let mi = OLD_MONTHS; mi < MONTHS.length; mi++)
      assert(pipByCatMonth[cat][mi] + unplacedByCatMonth[cat][mi] === nullByCatMonth[cat][mi],
        `wg3w null-hood ${cat} ${MONTHS[mi]}: pip ${pipByCatMonth[cat][mi]} + unplaced ${unplacedByCatMonth[cat][mi]} != agg-null ${nullByCatMonth[cat][mi]}`);
  console.log(`  null-hood rows: ${nullTotal} → ${nullPipPlaced} placed by PIP, ${nullNoCoords} no/junk coords, ${nullPipMiss} PIP miss (outside all 41 polygons)`);

  // independent citywide per-cat monthly (cross-check)
  console.log("  wg3w citywide per-cat monthly (independent cross-check)…");
  const citywide = zeroCatMonths();
  for (const cat of CAT_KEYS) {
    const rows = await fetchJSON(
      soda(SODA_NEW, {
        $select: "date_trunc_ym(incident_datetime) AS ym,count(*) AS n",
        $where: `${catWhereNew(cat)} AND ${winWhere}`,
        $group: "ym", $order: "ym", $limit: 1000,
      }),
      { label: `wg3w citywide:${cat}` },
    );
    for (const r of rows) {
      const mi = MONTH_IDX[ymOf(r.ym)];
      assert(mi !== undefined, `wg3w citywide ${cat}: month outside window`);
      citywide[cat][mi] = Number(r.n);
    }
    await sleep(150);
  }
  for (const cat of CAT_KEYS)
    for (let mi = OLD_MONTHS; mi < MONTHS.length; mi++)
      assert(placedByCatMonth[cat][mi] + nullByCatMonth[cat][mi] === citywide[cat][mi],
        `wg3w ${cat} ${MONTHS[mi]}: placed ${placedByCatMonth[cat][mi]} + null ${nullByCatMonth[cat][mi]} != citywide ${citywide[cat][mi]}`);
  console.log("  placed + null-hood == citywide for all 102 months × 4 cats ✓");
  return { cells, placedByCatMonth, pipByCatMonth, unplacedByCatMonth, citywide,
    nullStats: { nullTotal, nullPipPlaced, nullNoCoords, nullPipMiss } };
}

// ------------------------------ 4. tmnf era (2003-01..2017-12) full PIP scan
async function fetchHistoricEra(hoods, pip) {
  console.log("4/9 tmnf full scan (~1.9M rows, 4 fields, point-in-polygon)…");
  const cells = {};
  for (const k of Object.keys(hoods))
    cells[k] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  const placedByCatMonth = zeroCatMonths();
  const unplacedByCatMonth = zeroCatMonths(); // out-of-bbox or PIP miss
  // representative point pool: keep every 8th bbox-valid row per month (:id order)
  const poolCounter = MONTHS.map(() => 0);
  const pool = MONTHS.map(() => []);
  let scanned = 0, outOfBbox = 0, pipMiss = 0, bboxValid = 0;
  const oldWhere = `date >= '${WIN_START}' AND date < '${CUTOVER}'`;
  let offset = 0;
  for (;;) {
    const rows = await fetchJSON(
      soda(SODA_OLD, {
        $select: "date,category,x,y",
        $where: oldWhere,
        $order: ":id", $limit: 50000, $offset: offset,
      }),
      { label: `tmnf@${offset}` },
    );
    for (const r of rows) {
      scanned++;
      const mi = MONTH_IDX[ymOf(r.date)];
      assert(mi !== undefined && mi < OLD_MONTHS, `tmnf: month ${r.date} outside era`);
      const cat = mapOld(r.category);
      assert(cat, `tmnf: unmapped category '${r.category}'`);
      const lng = Number(r.x), lat = Number(r.y);
      const ok = Number.isFinite(lng) && Number.isFinite(lat) &&
        lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax;
      if (!ok) {
        outOfBbox++;
        unplacedByCatMonth[cat][mi]++;
        continue;
      }
      bboxValid++;
      if (poolCounter[mi]++ % 8 === 0)
        pool[mi].push([r6(lng), r6(lat), CAT_IDX[cat]]); // real coords, ≤~1.8k/mo kept
      const hood = pip(lng, lat);
      if (hood) {
        cells[hood][mi][cat]++;
        placedByCatMonth[cat][mi]++;
      } else {
        pipMiss++;
        unplacedByCatMonth[cat][mi]++;
      }
    }
    offset += rows.length;
    if (offset % 200000 < 50000) console.log(`  …${offset} rows scanned`);
    if (rows.length < 50000) break;
    await sleep(150);
  }
  console.log(`  scanned ${scanned} · bbox-valid ${bboxValid} · out-of-bbox ${outOfBbox} · PIP miss ${pipMiss}`);

  // independent citywide per-cat monthly (cross-check the full scan exactly)
  console.log("  tmnf citywide per-cat monthly (independent cross-check)…");
  const citywide = zeroCatMonths();
  for (const cat of CAT_KEYS) {
    const rows = await fetchJSON(
      soda(SODA_OLD, {
        $select: "date_trunc_ym(date) AS ym,count(*) AS n",
        $where: `${catWhereOld(cat)} AND ${oldWhere}`,
        $group: "ym", $order: "ym", $limit: 1000,
      }),
      { label: `tmnf citywide:${cat}` },
    );
    for (const r of rows) {
      const mi = MONTH_IDX[ymOf(r.ym)];
      assert(mi !== undefined, `tmnf citywide ${cat}: month outside window`);
      citywide[cat][mi] = Number(r.n);
    }
    await sleep(150);
  }
  for (const cat of CAT_KEYS)
    for (let mi = 0; mi < OLD_MONTHS; mi++)
      assert(placedByCatMonth[cat][mi] + unplacedByCatMonth[cat][mi] === citywide[cat][mi],
        `tmnf ${cat} ${MONTHS[mi]}: placed ${placedByCatMonth[cat][mi]} + unplaced ${unplacedByCatMonth[cat][mi]} != citywide ${citywide[cat][mi]}`);
  console.log("  placed + unplaced == citywide for all 180 months × 4 cats ✓");
  return { cells, placedByCatMonth, unplacedByCatMonth, citywide, pool,
    stats: { scanned, bboxValid, outOfBbox, pipMiss } };
}

// -------------- 5. spot-check PIP against DataSF's own neighborhood labeling
// Published wg3w coordinates are anonymized by snapping to the nearest
// intersection; intersections on a boundary street sit exactly ON the polygon
// edge, where DataSF's label (derived from the pre-anonymization location) and
// PIP of the published point can legitimately differ. The honesty gate is
// therefore three-fold: (1) overall agreement ≥90%, (2) EVERY disagreeing row
// must lie within 30 m of the labeled neighborhood's boundary (proving all
// disagreements are boundary-grain ambiguity, not misassignment), (3) a large
// interior-rich neighborhood (Mission) must reconcile within 2%.
function distToHoodM(hoods, name, lng, lat) {
  const kx = 87700, ky = 111000; // m/deg at SF latitude
  let best = Infinity;
  for (const ring of hoods[name].polygon) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
      const dx = (x2 - x1) * kx, dy = (y2 - y1) * ky;
      const px = (lng - x1) * kx, py = (lat - y1) * ky;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(px - t * dx, py - t * dy);
      if (d < best) best = d;
    }
  }
  return best;
}
async function spotCheckPip(hoods, pip) {
  console.log("5/9 spot check: PIP vs DataSF analysis_neighborhood, full month 2019-06…");
  const rows = [];
  let offset = 0;
  for (;;) {
    const page = await fetchJSON(
      soda(SODA_NEW, {
        $select: "analysis_neighborhood,latitude,longitude",
        $where:
          "analysis_neighborhood IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL" +
          " AND incident_datetime >= '2019-06-01T00:00:00' AND incident_datetime < '2019-07-01T00:00:00'",
        $order: ":id", $limit: 50000, $offset: offset,
      }),
      { label: `spotcheck@${offset}` },
    );
    rows.push(...page);
    if (page.length < 50000) break;
    offset += 50000;
  }
  let agree = 0, labeledMission = 0, pipMission = 0, maxDist = 0, farCount = 0;
  const disagreements = [];
  for (const r of rows) {
    const lng = Number(r.longitude), lat = Number(r.latitude);
    const hood = pip(lng, lat);
    if (r.analysis_neighborhood === "Mission") labeledMission++;
    if (hood === "Mission") pipMission++;
    if (hood === r.analysis_neighborhood) agree++;
    else {
      const d = distToHoodM(hoods, r.analysis_neighborhood, lng, lat);
      if (d > maxDist) maxDist = d;
      if (d > 30) farCount++;
      disagreements.push(d);
    }
  }
  const rate = agree / rows.length;
  console.log(`  ${rows.length} labeled rows · exact agreement ${(rate * 100).toFixed(2)}%` +
    ` · ${disagreements.length} disagreements, max ${maxDist.toFixed(1)} m from labeled boundary` +
    ` · Mission: labeled ${labeledMission} vs PIP ${pipMission}`);
  assert(rate >= 0.90, `PIP agreement ${(rate * 100).toFixed(2)}% < 90% — spatial assignment unreliable`);
  assert(farCount === 0,
    `${farCount} PIP disagreements are >30 m from the labeled neighborhood boundary (max ${maxDist.toFixed(1)} m) — not boundary-grain artifacts`);
  assert(labeledMission > 0 && Math.abs(pipMission - labeledMission) / labeledMission <= 0.02,
    `Mission spot-check off by >2%: labeled ${labeledMission} vs PIP ${pipMission}`);
  return { month: "2019-06", rows: rows.length, agreementPct: Math.round(rate * 10000) / 100,
    disagreements: disagreements.length, maxBoundaryDistM: Math.round(maxDist * 10) / 10,
    mission: { labeled: labeledMission, pip: pipMission } };
}

// ------------------------------------------------ 6. sampled REAL points
async function fetchPoints(oldPool) {
  console.log("6/9 real sampled points (≤100/month; tmnf era from full scan, wg3w era per-month queries)…");
  const pts = MONTHS.map(() => []);
  // tmnf era: deterministic stride over the every-8th pool (itself :id-ordered)
  for (let mi = 0; mi < OLD_MONTHS; mi++) {
    const arr = oldPool[mi];
    if (arr.length <= 100) { pts[mi] = arr; continue; }
    for (let i = 0; i < 100; i++) pts[mi].push(arr[Math.floor((i * arr.length) / 100)]);
  }
  // wg3w era: per-month query, row_id order (chronological-ish, not type-clustered)
  let outOfBbox = 0;
  for (let mi = OLD_MONTHS; mi < MONTHS.length; mi++) {
    const [y, m] = MONTHS[mi].split("-").map(Number);
    const start = `${MONTHS[mi]}-01T00:00:00`;
    const end = m === 12 ? `${y + 1}-01-01T00:00:00` : `${y}-${String(m + 1).padStart(2, "0")}-01T00:00:00`;
    const rows = await fetchJSON(
      soda(SODA_NEW, {
        $select: "latitude,longitude,incident_category",
        $where: `latitude IS NOT NULL AND longitude IS NOT NULL AND incident_datetime >= '${start}' AND incident_datetime < '${end}'`,
        $order: "row_id", $limit: 1300,
      }),
      { label: `points:${MONTHS[mi]}` },
    );
    const inBbox = [];
    for (const r of rows) {
      const lat = Number(r.latitude), lng = Number(r.longitude);
      if (!(lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax)) {
        outOfBbox++; continue;
      }
      inBbox.push([r6(lng), r6(lat), CAT_IDX[mapNew(r.incident_category)]]);
    }
    const stride = Math.max(1, Math.floor(inBbox.length / 100));
    for (let i = 0; i < inBbox.length && pts[mi].length < 100; i += stride) pts[mi].push(inBbox[i]);
    if ((mi - OLD_MONTHS + 1) % 24 === 0) console.log(`  …through ${MONTHS[mi]}`);
    await sleep(150);
  }
  const shown = pts.reduce((a, m) => a + m.length, 0);
  console.log(`  ${shown} points kept (${outOfBbox} out-of-bbox wg3w rows excluded)`);
  return { pts, shown };
}

// -------------------------------------------------------------- 7. feed
async function fetchFeed(hoods, pip) {
  console.log("7/9 dispatch feed (3 real incidents per quarter, both eras)…");
  const HOOD_SET = new Set(Object.keys(hoods));
  const feed = [];
  let pipSkipped = 0;
  const tc = (s) => String(s ?? "").toLowerCase().replace(/(^|[\s\-/(.,&])([a-z])/g, (_, p, c) => p + c.toUpperCase());
  for (let y = 2003; y <= 2026; y++) {
    for (let q = 0; q < 4; q++) {
      if (y === 2026 && q > 1) break; // window ends 2026-06
      const sm = q * 3 + 1;
      const start = `${y}-${String(sm).padStart(2, "0")}-01T00:00:00`;
      const end = q === 3 ? `${y + 1}-01-01T00:00:00` : `${y}-${String(sm + 3).padStart(2, "0")}-01T00:00:00`;
      if (y < 2018) {
        const rows = await fetchJSON(
          soda(SODA_OLD, {
            $select: "date,category,descript,address,x,y",
            $where: `date >= '${start}' AND date < '${end}'`,
            $order: ":id", $limit: 3,
          }),
          { label: `feed:${y}Q${q + 1}` },
        );
        for (const r of rows) {
          const hood = pip(Number(r.x), Number(r.y));
          if (!hood) { pipSkipped++; continue; } // real row, coords outside the 41 polygons
          feed.push({
            date: String(r.date).slice(0, 10),
            title: `${tc(r.category)} — ${tc(r.descript)}`,
            place: tc(r.address),
            beat: hood,
            cat: mapOld(r.category),
          });
        }
      } else {
        const rows = await fetchJSON(
          soda(SODA_NEW, {
            $select: "incident_datetime,incident_category,incident_description,intersection,analysis_neighborhood",
            $where: `analysis_neighborhood IS NOT NULL AND incident_datetime >= '${start}' AND incident_datetime < '${end}'`,
            $order: ":id", $limit: 3,
          }),
          { label: `feed:${y}Q${q + 1}` },
        );
        for (const r of rows) {
          assert(HOOD_SET.has(r.analysis_neighborhood), `feed: unexpected hood '${r.analysis_neighborhood}'`);
          feed.push({
            date: String(r.incident_datetime).slice(0, 10),
            title: `${r.incident_category ?? "Unspecified"} — ${r.incident_description ?? ""}`.replace(/ — $/, ""),
            place: r.intersection ? tc(r.intersection.split("\\")[0].trim()) : r.analysis_neighborhood,
            beat: r.analysis_neighborhood,
            cat: mapNew(r.incident_category),
          });
        }
      }
      await sleep(150);
    }
  }
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (pipSkipped) console.log(`  ${pipSkipped} tmnf feed rows skipped (coords outside the 41 polygons)`);
  console.log(`  ${feed.length} feed items`);
  return feed;
}

// ------------------------------------------------------------ 8. bucket counts
async function fetchBuckets() {
  console.log("8/9 disclosure buckets (overlap / partial / out-of-range counts)…");
  const cnt = async (base, where, label) => {
    const [r] = await fetchJSON(soda(base, { $select: "count(*) AS n", $where: where }), { label });
    await sleep(150);
    return Number(r.n);
  };
  const tmnfAll = await cnt(SODA_OLD, "date IS NOT NULL OR date IS NULL", "tmnf all");
  const tmnfPre2003 = await cnt(SODA_OLD, `date < '${WIN_START}'`, "tmnf pre-2003");
  const tmnfOverlap = await cnt(SODA_OLD, `date >= '${CUTOVER}'`, "tmnf 2018 overlap");
  const wg3wAll = await cnt(SODA_NEW, "incident_datetime IS NOT NULL OR incident_datetime IS NULL", "wg3w all");
  const wg3wPre2018 = await cnt(SODA_NEW, `incident_datetime < '${CUTOVER}'`, "wg3w pre-2018");
  const wg3wPartial = await cnt(SODA_NEW, `incident_datetime >= '${WIN_END}'`, "wg3w partial 2026-07");
  console.log(`  tmnf all=${tmnfAll} pre2003=${tmnfPre2003} overlap2018=${tmnfOverlap}` +
    ` · wg3w all=${wg3wAll} pre2018=${wg3wPre2018} partial=${wg3wPartial}`);
  return { tmnfAll, tmnfPre2003, tmnfOverlap, wg3wAll, wg3wPre2018, wg3wPartial };
}

// ------------------------------------------------------------ 9. FBI CDE
async function fbiGet(url, label) {
  // DEMO_KEY is aggressively rate-limited: 90s → 180s → 300s backoff (≤ ~20 min)
  const waits = [90, 180, 300, 300, 300];
  for (let a = 0; ; a++) {
    const r = await fetch(url);
    if (r.status === 429) {
      if (a >= waits.length)
        throw new Error(`FBI ${label}: still rate-limited after ${waits.reduce((x, y) => x + y, 0)}s of backoff (set FBI_API_KEY — free at https://api.data.gov/signup/)`);
      console.warn(`  FBI 429 (${label}); waiting ${waits[a]}s…`);
      await sleep(waits[a] * 1000);
      continue;
    }
    if (r.status >= 500) {
      if (a >= waits.length) throw new Error(`FBI ${label}: HTTP ${r.status}`);
      console.warn(`  FBI HTTP ${r.status} (${label}); waiting 20s…`);
      await sleep(20000);
      continue;
    }
    if (!r.ok) throw new Error(`FBI ${label}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
}
async function fetchFBISeries(ori, offense) {
  const url = `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ori}/${offense}?from=01-1985&to=12-2002&API_KEY=${FBI_KEY}`;
  const j = await fbiGet(url, `${ori}/${offense}`);
  const actuals = j?.offenses?.actuals;
  if (!actuals) return { raw: j, monthly: null };
  const agKey =
    Object.keys(actuals).find((k) => /San Francisco/i.test(k)) ||
    Object.keys(actuals).find((k) => !/United States/i.test(k));
  const monthly = agKey ? actuals[agKey] : null;
  const nonZero = monthly && Object.values(monthly).some((v) => Number(v) > 0);
  return { raw: j, monthly: nonZero ? monthly : null };
}
function extractMonthly(raw) {
  const actuals = raw?.offenses?.actuals;
  if (!actuals) return null;
  const agKey =
    Object.keys(actuals).find((k) => /San Francisco/i.test(k)) ||
    Object.keys(actuals).find((k) => !/United States/i.test(k));
  const monthly = agKey ? actuals[agKey] : null;
  return monthly && Object.values(monthly).some((v) => Number(v) > 0) ? monthly : null;
}
async function fetchHistory() {
  console.log(`9/9 FBI CDE history (${AGENCY}, 1985–2002, key=${FBI_KEY === "DEMO_KEY" ? "DEMO_KEY" : "FBI_API_KEY"})…`);
  // Reuse a previously fetched raw dump if present (DEMO_KEY is heavily
  // rate-limited; the dump carries its own fetchedAt and full raw responses).
  const cachePath = resolve(RAW_DIR, "fbi_cde.json");
  if (existsSync(cachePath)) {
    try {
      const c = JSON.parse(readFileSync(cachePath, "utf8"));
      const vm = extractMonthly(c.violent), pm = extractMonthly(c.property);
      if (c.ori && vm && pm) {
        console.log(`  using cached raw dump data/san-francisco-ca/raw/fbi_cde.json (fetched ${c.fetchedAt}, ORI ${c.ori})`);
        return buildHistoryYears(c.ori, vm, pm);
      }
    } catch { /* fall through to network */ }
  }
  let ori = ORI_DEFAULT;
  let violent = await fetchFBISeries(ori, "violent-crime");
  if (!violent.monthly) {
    // ORI unverified → agency lookup: grep CA agencies for San Francisco PD
    console.warn(`  ORI ${ori}: empty/zero actuals — looking up San Francisco PD in the CA agency list…`);
    const list = await fbiGet(`https://api.usa.gov/crime/fbi/cde/agency/byStateAbbr/CA?API_KEY=${FBI_KEY}`, "agency lookup CA");
    const flat = [];
    (function walk(o) {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === "object") {
        if (o.ori && (o.agency_name || o.agency_type_name)) flat.push(o);
        else Object.values(o).forEach(walk);
      }
    })(list);
    const hit = flat.find((a) => /^San Francisco Police Department$/i.test((a.agency_name || "").trim()));
    assert(hit, "FBI: could not find San Francisco PD in CA agency lookup");
    console.log(`  lookup found: ${hit.agency_name} → ORI ${hit.ori}`);
    ori = hit.ori;
    await sleep(2000);
    violent = await fetchFBISeries(ori, "violent-crime");
    assert(violent.monthly, `FBI: ORI ${ori} also returned empty actuals`);
  }
  await sleep(2000);
  const property = await fetchFBISeries(ori, "property-crime");
  assert(property.monthly, `FBI: property-crime actuals empty for ORI ${ori}`);
  writeFileSync(resolve(RAW_DIR, "fbi_cde.json"),
    JSON.stringify({ ori, fetchedAt: new Date().toISOString(), violent: violent.raw, property: property.raw }));
  return buildHistoryYears(ori, violent.monthly, property.monthly);
}
function buildHistoryYears(ori, violentMonthly, propertyMonthly) {
  const perYear = (monthly, y) => {
    const vals = [];
    for (let m = 1; m <= 12; m++) {
      const k = `${String(m).padStart(2, "0")}-${y}`;
      vals.push(monthly[k] === undefined || monthly[k] === null ? undefined : Number(monthly[k]));
    }
    return vals;
  };
  const years = [], dropped = [];
  for (let y = 1985; y <= 2002; y++) {
    const v = perYear(violentMonthly, y);
    const p = perYear(propertyMonthly, y);
    const complete = v.every((x) => x !== undefined && x > 0) && p.every((x) => x !== undefined && x > 0);
    if (!complete) {
      dropped.push(y);
      assert(years.length === 0, `FBI year ${y} incomplete mid-span — cannot build contiguous history`);
      continue;
    }
    const vy = v.reduce((a, b) => a + b, 0);
    const py = p.reduce((a, b) => a + b, 0);
    years.push({ year: y, violent: vy, property: py, total: vy + py });
  }
  assert(years.length >= 10, `FBI history too short: ${years.length} complete years`);
  if (dropped.length) console.log(`  dropped partial years: ${dropped.join(", ")}`);
  console.log(`  ${years.length} complete years ${years[0].year}–${years.at(-1).year} (12 nonzero months each, both series)`);
  return { ori, years, dropped };
}

// -------------------------------------------------------------------- main
async function main() {
  const t0 = Date.now();
  const fetchedAt = new Date().toISOString();

  const hoods = await fetchHoods();
  const pip = buildPip(hoods);
  const catTables = await enumerateCategories();
  const modern = await fetchModernEra(hoods, pip);
  const historic = await fetchHistoricEra(hoods, pip);
  const spotCheck = await spotCheckPip(hoods, pip);
  const pointsRes = await fetchPoints(historic.pool);
  const feed = await fetchFeed(hoods, pip);
  const buckets = await fetchBuckets();
  const fbi = await fetchHistory(); // LAST — DEMO_KEY rate limits

  // ----------------------------------------------------------- assemble
  const HOOD_NAMES = Object.keys(hoods);
  // merge the two eras' cells (disjoint month ranges)
  const cells = {};
  for (const k of HOOD_NAMES)
    cells[k] = MONTHS.map((_, mi) =>
      mi < OLD_MONTHS ? historic.cells[k][mi] : modern.cells[k][mi]);
  const citywide = zeroCatMonths();
  for (const cat of CAT_KEYS)
    for (let mi = 0; mi < MONTHS.length; mi++)
      citywide[cat][mi] = mi < OLD_MONTHS ? historic.citywide[cat][mi] : modern.citywide[cat][mi];
  const unplacedByCatMonth = zeroCatMonths();
  for (const cat of CAT_KEYS)
    for (let mi = 0; mi < MONTHS.length; mi++)
      unplacedByCatMonth[cat][mi] =
        mi < OLD_MONTHS ? historic.unplacedByCatMonth[cat][mi] : modern.unplacedByCatMonth[cat][mi];

  // ----------------------------------------------------------- validation
  console.log("validating…");
  assert(MONTHS.length === 282 && MONTHS[0] === "2003-01" && MONTHS[281] === "2026-06",
    `months array wrong (${MONTHS.length}, ${MONTHS[0]}..${MONTHS.at(-1)})`);
  for (let i = 1; i < MONTHS.length; i++) {
    const [py, pm] = MONTHS[i - 1].split("-").map(Number);
    const [cy, cm] = MONTHS[i].split("-").map(Number);
    assert((pm === 12 && cy === py + 1 && cm === 1) || (cy === py && cm === pm + 1),
      `months not contiguous at ${MONTHS[i]}`);
  }
  assert(HOOD_NAMES.length === 41 && new Set(HOOD_NAMES).size === 41, "must have exactly 41 unique neighborhoods");
  for (const [name, series] of Object.entries(cells))
    assert(series.length === MONTHS.length, `cells[${name}] length ${series.length} != ${MONTHS.length}`);
  assert(Object.keys(cells).length === 41, "cells must cover all 41 neighborhoods");

  // exact reconciliation: placed + unplaced == citywide, per cat per month
  let placedRecords = 0, windowCitywide = 0, unplacedNoLoc = 0;
  for (const cat of CAT_KEYS)
    for (let mi = 0; mi < MONTHS.length; mi++) {
      let placed = 0;
      for (const k of HOOD_NAMES) placed += cells[k][mi][cat];
      assert(placed + unplacedByCatMonth[cat][mi] === citywide[cat][mi],
        `${cat} ${MONTHS[mi]}: placed ${placed} + unplaced ${unplacedByCatMonth[cat][mi]} != citywide ${citywide[cat][mi]}`);
      placedRecords += placed;
      unplacedNoLoc += unplacedByCatMonth[cat][mi];
      windowCitywide += citywide[cat][mi];
    }
  assert(placedRecords + unplacedNoLoc === windowCitywide, "window partition mismatch");

  // full-dataset identities against independent total counts
  let tmnfWindow = 0, wg3wWindow = 0;
  for (const cat of CAT_KEYS) {
    for (let mi = 0; mi < OLD_MONTHS; mi++) tmnfWindow += historic.citywide[cat][mi];
    for (let mi = OLD_MONTHS; mi < MONTHS.length; mi++) wg3wWindow += modern.citywide[cat][mi];
  }
  assert(buckets.tmnfPre2003 + tmnfWindow + buckets.tmnfOverlap === buckets.tmnfAll,
    `tmnf partition: ${buckets.tmnfPre2003}+${tmnfWindow}+${buckets.tmnfOverlap} != ${buckets.tmnfAll}`);
  assert(buckets.wg3wPre2018 + wg3wWindow + buckets.wg3wPartial === buckets.wg3wAll,
    `wg3w partition: ${buckets.wg3wPre2018}+${wg3wWindow}+${buckets.wg3wPartial} != ${buckets.wg3wAll}`);
  assert(historic.stats.scanned === tmnfWindow, `tmnf scan ${historic.stats.scanned} != citywide ${tmnfWindow}`);

  const totalRecords = buckets.tmnfAll + buckets.wg3wAll - buckets.tmnfPre2003 - buckets.wg3wPre2018;
  const unplacedRecords = totalRecords - placedRecords;
  assert(unplacedRecords === unplacedNoLoc + buckets.tmnfOverlap + buckets.wg3wPartial,
    "unplaced buckets don't sum");
  const coveragePct = Math.round((placedRecords / totalRecords) * 1000) / 10;

  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  for (const cat of CAT_KEYS) catTotals[cat] = citywide[cat].reduce((a, b) => a + b, 0);
  assert(CAT_KEYS.reduce((s, c) => s + catTotals[c], 0) === windowCitywide, "catTotals != windowCitywide");

  // points
  assert(pointsRes.pts.length === MONTHS.length, "points months misaligned");
  for (let mi = 0; mi < pointsRes.pts.length; mi++)
    for (const [lng, lat, ci] of pointsRes.pts[mi]) {
      assert(lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax,
        `point out of bbox in ${MONTHS[mi]}: ${lng},${lat}`);
      assert(Number.isInteger(ci) && ci >= 0 && ci <= 3, `bad catIdx ${ci}`);
      assert(pointsRes.pts[mi].length <= 100, `>100 points in ${MONTHS[mi]}`);
    }
  // feed
  for (const it of feed) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(it.date), `feed bad date ${it.date}`);
    assert(it.date >= DATE_MIN && it.date <= DATE_MAX, `feed date ${it.date} outside window`);
    assert(HOOD_NAMES.includes(it.beat), `feed beat ${it.beat} unknown`);
    assert(CATS[it.cat], `feed cat ${it.cat} invalid`);
  }
  assert(feed.length >= 250 && feed.length <= 350, `feed size ${feed.length} not ~300`);
  // history contiguity
  fbi.years.forEach((y, i) => assert(y.year === fbi.years[0].year + i, `history not contiguous at ${y.year}`));

  // ------------------------------------------------------------- outputs
  const beats = { cats: CATS, beats: {} };
  for (const [name, h] of Object.entries(hoods)) {
    beats.beats[name] = {
      key: name, name, servcen: "SF", beat: h.beat,
      centroid: h.centroid, polygon: h.polygon, geomType: "MultiPolygon",
    };
  }
  const timeline = { months: MONTHS, cells };
  const tmnfPlaceable = historic.stats.bboxValid;
  const [wg3wCoordRow] = await fetchJSON(
    soda(SODA_NEW, {
      $select: "count(*) AS n",
      $where: `latitude IS NOT NULL AND incident_datetime >= '${CUTOVER}' AND incident_datetime < '${WIN_END}'`,
    }),
    { label: "wg3w placeable count" },
  );
  const placeable = tmnfPlaceable + Number(wg3wCoordRow.n);
  const sampleRate = Math.round(placeable / pointsRes.shown);
  const points = {
    mode: "real-sample",
    note:
      "Every dot is a real reported incident location published by SFPD via DataSF (block/intersection grain). " +
      "Deterministic sample (≤100/month). Rows without usable coordinates are counted in every total but not plotted.",
    sampleRate,
    months: MONTHS,
    pts: pointsRes.pts,
  };
  const summary = {
    slug: "san-francisco-ca",
    title: "San Francisco · CA",
    source: { records: SODA_NEW, recordsHistorical: SODA_OLD, beats: GEO_URL, hub: HUB_NEW, hubHistorical: HUB_OLD },
    fetchedAt,
    dateMin: DATE_MIN,
    dateMax: DATE_MAX,
    months: MONTHS.length,
    totalRecords,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: {
      "no-location": unplacedNoLoc,
      "tmnf-2018-overlap-dropped": buckets.tmnfOverlap,
      "partial-2026-07": buckets.wg3wPartial,
    },
    catTotals,
    cats: CATS,
    beatCount: 41,
  };
  const historyJson = {
    era: "history",
    taxonomy: "FBI UCR Summary (Violent + Property) — a different taxonomy than the SFPD incident categories used from 2003; the eras bridge at 2003 and are never equated",
    agency: AGENCY,
    ori: fbi.ori,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${fbi.ori}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      `Annual totals are real UCR Summary counts fetched from the FBI CDE summarized agency endpoint for ORI ${fbi.ori}, ` +
      "summed from monthly actuals (every kept year verified to have 12 nonzero months in both series). " +
      "UCR Summary (Violent/Property) is a different taxonomy from the incident-level categories used for 2003+; " +
      "the two eras bridge at 2003 and are never mixed on one axis. " +
      "Reproduce with pipeline/sources/san-francisco-ca.mjs (set FBI_API_KEY to avoid DEMO_KEY limits)." +
      (fbi.dropped.length ? ` Dropped partial years: ${fbi.dropped.join(", ")}.` : ""),
    yearMin: fbi.years[0].year,
    yearMax: fbi.years.at(-1).year,
    cats: {
      violent: { label: "UCR Violent (murder, rape, robbery, agg. assault)", color: "#ff4d6d" },
      property: { label: "UCR Property (burglary, larceny, MV theft)", color: "#38bdf8" },
    },
    years: fbi.years,
  };
  const neighborhoods = {
    source: "DataSF Analysis Neighborhoods (official, 41 areas)",
    sourceUrl: GEO_URL,
    hub: "https://data.sfgov.org/",
    fetchedAt,
    license: "ODC PDDL 1.0 (public-domain dedication)",
    method:
      "identity for 2018+ (wg3w rows carry the official analysis_neighborhood name verbatim). " +
      "2003–2017 (tmnf) has no neighborhood field: rows are assigned by point-in-polygon of their REAL published " +
      "coordinates against the official Analysis Neighborhood polygons — real coords, official boundaries, nothing " +
      "synthesized. The same point-in-polygon rescues 2018+ rows that have coordinates but a null neighborhood. " +
      `Method spot-checked against DataSF's own labeling for ${spotCheck.month}: ${spotCheck.agreementPct}% exact ` +
      `agreement over ${spotCheck.rows} rows; every one of the ${spotCheck.disagreements} disagreements lies within ` +
      `${spotCheck.maxBoundaryDistM} m of the labeled neighborhood's boundary — published coordinates are snapped to ` +
      "intersections, so points on boundary streets sit exactly on the polygon edge where either side is a valid " +
      `assignment (Mission reconciles ${spotCheck.mission.labeled} labeled vs ${spotCheck.mission.pip} PIP). ` +
      "Rows with no usable coordinates stay unplaced and are disclosed.",
    map: Object.fromEntries(HOOD_NAMES.map((n) => [n, { name: n, approx: false }])),
  };

  const outputs = { "beats.json": beats, "timeline.json": timeline, "feed.json": feed,
    "summary.json": summary, "history.json": historyJson, "neighborhoods.json": neighborhoods,
    "points.json": points };
  for (const [f, obj] of Object.entries(outputs)) {
    assertNoNaN(obj, f);
    const pretty = ["summary.json", "history.json", "neighborhoods.json"].includes(f);
    writeFileSync(resolve(NORM_DIR, f), JSON.stringify(obj, null, pretty ? 2 : undefined));
    const kb = statSync(resolve(NORM_DIR, f)).size / 1024;
    assert(kb < 4096, `${f} exceeds 4MB (${Math.round(kb)} KB)`);
  }
  writeFileSync(resolve(RAW_DIR, "_fetch_meta.json"), JSON.stringify({
    fetchedAt, script: "pipeline/sources/san-francisco-ca.mjs",
    sources: { modern: SODA_NEW, historical: SODA_OLD, polygons: GEO_URL,
      fbi: `api.usa.gov/crime/fbi/cde/summarized/agency/${fbi.ori}` },
    window: `${DATE_MIN}..${DATE_MAX}`, cutover: "2018-01-01",
    totalRecords, buckets, tmnfStats: historic.stats, wg3wNullStats: modern.nullStats,
    spotCheck,
    note: "tmnf raw pages (1.9M rows × 4 fields) were streamed through point-in-polygon in memory and are not stored.",
  }, null, 2));

  writeProvenance({ fetchedAt, summary, historyJson, fbi, catTables, buckets,
    historic, modern, spotCheck, pointsRes, placeable, sampleRate, feed });
  appendWiki({ summary, historyJson, fbi, spotCheck });

  // -------------------------------------------------------- story numbers
  const size = (f) => `${(statSync(resolve(NORM_DIR, f)).size / 1024).toFixed(1)} KB`;
  const hoodYear = (name, y) => {
    let t = 0;
    for (let mi = 0; mi < MONTHS.length; mi++)
      if (MONTHS[mi].startsWith(`${y}-`)) {
        const c = cells[name][mi];
        t += c.persons + c.property + c.society + c.other;
      }
    return t;
  };
  const cwMonth = MONTHS.map((_, mi) => CAT_KEYS.reduce((s, c) => s + citywide[c][mi], 0));
  const cwYear = (y) => MONTHS.reduce((s, m, mi) => (m.startsWith(`${y}-`) ? s + cwMonth[mi] : s), 0);
  const by2025 = HOOD_NAMES.map((n) => ({ name: n, y2025: hoodYear(n, 2025) })).sort((a, b) => b.y2025 - a.y2025);
  const change = HOOD_NAMES
    .map((n) => {
      const a = hoodYear(n, 2022), b = hoodYear(n, 2025);
      return { name: n, y2022: a, y2025: b, pct: a >= 300 ? Math.round(((b - a) / a) * 1000) / 10 : null };
    })
    .filter((x) => x.pct !== null)
    .sort((x, y) => x.pct - y.pct);
  let hiMi = MONTHS.indexOf("2021-07");
  for (let mi = hiMi; mi < MONTHS.length; mi++) if (cwMonth[mi] > cwMonth[hiMi]) hiMi = mi;
  const peak = fbi.years.reduce((a, b) => (b.total > a.total ? b : a));
  const y2020 = MONTHS.map((m, mi) => (m.startsWith("2020-") ? { m, n: cwMonth[mi] } : null)).filter(Boolean);

  console.log(JSON.stringify({
    totalRecords, placedRecords, unplacedRecords, coveragePct,
    unplacedBeats: summary.unplacedBeats, catTotals,
    months: MONTHS.length, feedItems: feed.length, pointsShown: pointsRes.shown, sampleRate,
    spotCheck,
    fbi: { ori: fbi.ori, span: `${historyJson.yearMin}-${historyJson.yearMax}`,
      y1985: fbi.years[0], peak, y2002: fbi.years.at(-1) },
    citywide2003: cwYear(2003), citywide2025: cwYear(2025),
    top2025: by2025.slice(0, 5), bottom2025: by2025.slice(-5),
    biggestDrops2022to2025: change.slice(0, 5), biggestRises2022to2025: change.slice(-5),
    highestMonthLast5y: { month: MONTHS[hiMi], n: cwMonth[hiMi] },
    months2020: y2020,
    sizes: Object.fromEntries(Object.keys(outputs).map((f) => [f, size(f)])),
    elapsedSec: Math.round((Date.now() - t0) / 1000),
  }, null, 2));
  console.log("VALIDATION PASS");
}

// ---- PROVENANCE.md -----------------------------------------------------------
function writeProvenance({ fetchedAt, summary, historyJson, fbi, catTables, buckets,
  historic, modern, spotCheck, pointsRes, placeable, sampleRate, feed }) {
  const n = (x) => Number(x).toLocaleString("en-US");
  const catTable = (rows) =>
    "| Source value | cat | window count |\n|---|---|--:|\n" +
    rows.map((r) => `| ${r.value === null ? "*(null)*" : r.value} | \`${r.cat}\` | ${n(r.n)} |`).join("\n");
  const md = `# Provenance — San Francisco, CA

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary sources — incident records (two eras, one cutover)

| Field | Value |
|-------|-------|
| Modern dataset | **Police Department Incident Reports: 2018 to Present** (Socrata \`wg3w-h783\`) |
| Historical dataset | **Police Department Incident Reports: Historical 2003 to May 2018** (Socrata \`tmnf-yvry\`) |
| Publisher | San Francisco Police Department, via DataSF (data.sfgov.org) |
| Landing pages | ${HUB_NEW} · ${HUB_OLD} |
| APIs | ${SODA_NEW} · ${SODA_OLD} |
| Fetched | ${fetchedAt} |
| License | **ODC PDDL 1.0** (public-domain dedication) — attribution "San Francisco Police Department via DataSF" |
| Records used | ${n(summary.totalRecords)} (tmnf 2003-01-01 → 2017-12-31 + wg3w 2018-01-01 → 2026-06-30) |

### Cutover & windowing (disclosed exclusions)
- **Cutover at 2018-01-01**: tmnf is used strictly through **2017-12-31**; its 2018-01-01 → 2018-05-15 tail (${n(buckets.tmnfOverlap)} rows) overlaps wg3w and is **dropped and disclosed** (\`unplacedBeats["tmnf-2018-overlap-dropped"]\`) to avoid double counting.
- Rows after **2026-06-30** (${n(buckets.wg3wPartial)} rows, partial month at fetch time) are excluded and disclosed (\`unplacedBeats["partial-2026-07"]\`).
- tmnf rows before 2003-01-01: ${n(buckets.tmnfPre2003)}. wg3w rows before 2018-01-01: ${n(buckets.wg3wPre2018)}.
- Full-dataset identities validated in-script: tmnf pre-2003 + window + overlap == ${n(buckets.tmnfAll)} (dataset total); wg3w pre-2018 + window + partial == ${n(buckets.wg3wAll)} (dataset total).

### Fields used
wg3w: \`incident_datetime\` · \`incident_category\` · \`incident_description\` · \`analysis_neighborhood\` · \`latitude\`/\`longitude\` · \`intersection\` · \`row_id\`.
tmnf: \`date\` · \`category\` · \`descript\` · \`address\` · \`x\` (lng) / \`y\` (lat).

## Neighborhood placement (the honesty-critical part)

Spatial unit: the **41 official DataSF Analysis Neighborhoods** (resident-known names), polygons from \`j2bu-swwd\` (property \`nhood\`, joined verbatim).

- **2018+ (wg3w):** rows carry the official \`analysis_neighborhood\` name — identity join, no approximation. ${n(modern.nullStats.nullTotal)} in-window rows (≈5.5%) have a **null** neighborhood: the ${n(modern.nullStats.nullPipPlaced)} of them that have real published coordinates inside the city are placed by **point-in-polygon** against the official polygons; the remaining ${n(modern.nullStats.nullNoCoords + modern.nullStats.nullPipMiss)} (${n(modern.nullStats.nullNoCoords)} without usable coordinates + ${n(modern.nullStats.nullPipMiss)} whose coordinates fall outside all 41 polygons) stay **unplaced and disclosed** — never guessed.
- **2003–2017 (tmnf):** the dataset has **no neighborhood field**, but every row has coordinates. Rows are assigned by **point-in-polygon of their real published coordinates** against the same official polygons — real coords × official boundaries, nothing synthesized, method disclosed here and in \`neighborhoods.json.method\`. ${n(historic.stats.outOfBbox)} rows carry junk coordinates outside the SF bounding box and ${n(historic.stats.pipMiss)} fall inside the bbox but outside all 41 polygons (piers/water/boundary artifacts) — all counted, disclosed as unplaced, never plotted.
- **Spot check:** the point-in-polygon assignment was validated against DataSF's own labeling for the full month ${spotCheck.month}: **${spotCheck.agreementPct}% exact agreement** over ${n(spotCheck.rows)} labeled rows. All ${n(spotCheck.disagreements)} disagreements lie within **${spotCheck.maxBoundaryDistM} m** of the labeled neighborhood's boundary (validated in-script; >30 m would fail the run): published coordinates are anonymized by snapping to the nearest intersection, so points on boundary streets sit exactly on the polygon edge, where DataSF's label (from the pre-anonymization location) and PIP of the published point can legitimately differ — either side is a valid assignment at the published grain. Interior-rich neighborhoods reconcile (Mission: ${n(spotCheck.mission.labeled)} labeled vs ${n(spotCheck.mission.pip)} PIP).
- **Reconciliation:** \`placed + unplaced == citywide\` holds **exactly** per month × category for all 282 months, with citywide counts taken from independent aggregate queries per source.

### Coverage
- Placed in one of the 41 neighborhoods: **${n(summary.placedRecords)}** (${summary.coveragePct}%)
- Unplaced: ${n(summary.unplacedRecords)} = ${n(summary.unplacedBeats["no-location"])} no-location/outside-polygons + ${n(buckets.tmnfOverlap)} tmnf-2018-overlap-dropped + ${n(buckets.wg3wPartial)} partial-2026-07.

## Category mapping (NIBRS crimes-against convention)

Both source vocabularies were **fully enumerated at fetch time**; any value missing from the explicit tables below is a hard validation failure — nothing is bucketed silently. Robbery, fraud, bribery and extortion follow NIBRS as crimes against **property**; suicide, missing persons, recovered vehicles, warrants and case-closure/courtesy rows are **other** (context only, never counted as Group A crime).

### wg3w \`incident_category\` (2018-01 → 2026-06)

${catTable(catTables.newTable)}

### tmnf \`category\` (2003-01 → 2017-12)

${catTable(catTables.oldTable)}

*tmnf has no separate homicide category — homicides are inside ASSAULT in that vocabulary. "Motor Vehicle Theft?" is the source's own uncertain-label variant. "Traffic Violation Arrest" (incl. DUI-type driving offenses) is mapped to \`society\`.*

## Real incident points (\`points.json\`)

Every dot is a **real reported incident location** published by SFPD (block/intersection grain), never synthesized. Client gate: lat ${BBOX.latMin}–${BBOX.latMax}, lng ${BBOX.lngMin}–${BBOX.lngMax}. Deterministic sample ≤100/month: the tmnf era samples from the full 1.9M-row scan (every-8th row pool in \`:id\` order, then even stride); the wg3w era queries each month in \`row_id\` order (chronological, not type-clustered) and stride-samples. **${n(pointsRes.shown)} points ≈ 1 per ${sampleRate} of ${n(placeable)} placeable rows.** Rows without usable coordinates are counted in every total — they are only missing from the dot layer.

## Dispatch feed (\`feed.json\`)

${feed.length} real incidents, 3 per quarter 2003-Q1 → 2026-Q2, \`:id\` order (no seriousness bias). Title = source category + description verbatim; place = published block address / intersection; neighborhood via the same placement rules as the timeline.

## Historical source — FBI UCR (${historyJson.yearMin}–${historyJson.yearMax} deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | ${AGENCY} — **ORI \`${fbi.ori}\`** (verified at fetch: non-empty, nonzero actuals${fbi.ori === ORI_DEFAULT ? "" : "; found via CA agency lookup"}) |
| Endpoint | ${historyJson.sourceUrl} (and \`/property-crime\`) |
| Span | ${historyJson.yearMin}–${historyJson.yearMax}, annual Violent + Property (12 nonzero reported months verified per year, both series)${fbi.dropped.length ? ` — dropped partial years: ${fbi.dropped.join(", ")}` : ""} |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set \`FBI_API_KEY\`) |

UCR Summary (Violent/Property) is a **different taxonomy** than the SFPD incident categories — the eras are presented as distinct and bridge at 2003; they are never equated. No monthly or neighborhood detail is implied for ${historyJson.yearMin}–${historyJson.yearMax}.

## Reproduce

\`\`\`bash
FBI_API_KEY=… node pipeline/sources/san-francisco-ca.mjs
\`\`\`
`;
  writeFileSync(PROV_PATH, md);
  console.log("  wrote data/san-francisco-ca/PROVENANCE.md");
}

// ---- wiki/Data-Provenance.md append -------------------------------------------
function appendWiki({ summary, historyJson, fbi, spotCheck }) {
  if (!existsSync(WIKI_PATH)) return;
  const cur = readFileSync(WIKI_PATH, "utf8");
  if (cur.includes("## san-francisco-ca") || cur.includes("## San Francisco, CA")) {
    console.log("  wiki/Data-Provenance.md already has a San Francisco section — skipped");
    return;
  }
  const n = (x) => Number(x).toLocaleString("en-US");
  const section = `## San Francisco, CA (\`san-francisco-ca\`)

- **Primary sources:** SFPD incident reports via DataSF — modern
  \`wg3w-h783\` (2018-01 →, updated daily) + historical \`tmnf-yvry\`
  (2003-01 → 2018-05); cutover at **2018-01-01**, tmnf's 2018 tail
  (${n(summary.unplacedBeats["tmnf-2018-overlap-dropped"])} rows) dropped and disclosed to avoid double counting.
- **Spatial unit:** the 41 official **Analysis Neighborhoods** (\`j2bu-swwd\`,
  \`nhood\`, verbatim join). 2018+ rows carry the name natively; 2003–2017 rows
  (no neighborhood field) are placed by **point-in-polygon of their real
  published coordinates** against the official polygons — spot-checked against
  DataSF's own labeling for ${spotCheck.month}: **${spotCheck.agreementPct}%
  exact agreement** over ${n(spotCheck.rows)} rows, and ALL disagreements sit
  within ${spotCheck.maxBoundaryDistM} m of the labeled boundary
  (intersection-snapped points on boundary streets — either side is valid).
  Null-neighborhood rows with coordinates are rescued the same way; the rest
  stay unplaced and disclosed, never guessed.
- **Deep-history source (${historyJson.yearMin}–${historyJson.yearMax}):** FBI Crime Data Explorer —
  ${AGENCY}, **ORI ${fbi.ori}** (verified at fetch) — real annual
  Violent + Property counts, ${fbi.years.length} full years (12 nonzero months each, both
  series). UCR taxonomy kept distinct; eras bridge at 2003.
- **Span:** ${historyJson.yearMin}–${historyJson.yearMax} (FBI UCR annual) + 2003-01-01 → 2026-06-30
  (${summary.months} months, per-neighborhood monthly by category).
- **Records:** ${n(summary.totalRecords)} total · ${n(summary.placedRecords)} placed in a
  neighborhood (**${summary.coveragePct}% coverage**) · ${n(summary.unplacedRecords)} unplaced
  (no-location ${n(summary.unplacedBeats["no-location"])} + overlap-dropped
  ${n(summary.unplacedBeats["tmnf-2018-overlap-dropped"])} + partial-2026-07
  ${n(summary.unplacedBeats["partial-2026-07"])}), kept in totals and disclosed.
- **Reconciliation:** placed + unplaced == citywide validated **exactly** per
  month × category for all 282 months against independent per-source counts.
- **Real dots:** deterministic ≤100/month sample of real SFPD-published
  locations; no-coordinate rows counted but never plotted.
- **License:** ODC PDDL 1.0 (public-domain dedication), attribution
  "San Francisco Police Department via DataSF".
- **Detail:** [\`data/san-francisco-ca/PROVENANCE.md\`](../data/san-francisco-ca/PROVENANCE.md)
  (includes the FULL category→cat tables for both source vocabularies).

### Category mapping (NIBRS crimes-against convention, abridged)

| cat | wg3w \`incident_category\` (2018+) | tmnf \`category\` (2003–2017) |
|-----|-----------------------------------|------------------------------|
| \`persons\` | Homicide, Assault, Rape, Sex Offense, Family/Children, Human Trafficking | ASSAULT (incl. homicide), SEX OFFENSES, KIDNAPPING |
| \`property\` | Larceny Theft, Burglary, Robbery, MV Theft, Arson, Malicious Mischief/Vandalism, Fraud, Forgery, Embezzlement, Stolen Property | LARCENY/THEFT, VEHICLE THEFT, BURGLARY, ROBBERY, VANDALISM, ARSON, FRAUD, FORGERY, BAD CHECKS, EXTORTION, BRIBERY, STOLEN PROPERTY, TRESPASS |
| \`society\` | Drug, Weapons, Prostitution, Disorderly Conduct, Liquor, Gambling, Traffic Violation Arrest | DRUG/NARCOTIC, WEAPON LAWS, PROSTITUTION, DUI, DRUNKENNESS, DISORDERLY, LIQUOR, LOITERING, GAMBLING |
| \`other\` | Non-Criminal, Case Closure, Courtesy Report, Lost Property, Missing Person, Warrant, Recovered Vehicle, Suspicious, … (context only) | OTHER OFFENSES, NON-CRIMINAL, WARRANTS, SUSPICIOUS OCC, MISSING PERSON, SECONDARY CODES, RECOVERED VEHICLE, SUICIDE, TREA |

`;
  const marker = "## Ranked source types";
  const idx = cur.indexOf(marker);
  const next = idx >= 0 ? cur.slice(0, idx) + section + cur.slice(idx) : cur + "\n" + section;
  writeFileSync(WIKI_PATH, next);
  console.log("  appended San Francisco section to wiki/Data-Provenance.md");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
