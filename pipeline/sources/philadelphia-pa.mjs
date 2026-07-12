// Philadelphia, PA crime-data source — fetch → normalize → validate, one script.
//
// Data sources (all real, citable):
//   * Incidents:  "Crime Incidents" (PPD INCT system), Carto SQL API, table
//                 incidents_part1_part2 — https://phl.carto.com/api/v2/sql
//                 hub: https://opendataphilly.org/datasets/crime-incidents/
//   * Districts:  PPD police district polygons (21 current districts)
//                 services.arcgis.com/fLeGjb7u4uXqeF9q .../Boundaries_District
//   * Hood names: City of Philadelphia "Neighborhoods" polygon layer (158)
//                 services.arcgis.com/fLeGjb7u4uXqeF9q .../Neighborhoods
//                 (district labels ranked by REAL incident locations — see below)
//   * History:    FBI Crime Data Explorer (CDE), Philadelphia PD ORI PAPEP0000
//                 (UCR summarized violent/property, annual 1985–2005)
//
// HONESTY RULES (binding):
//   * No fabricated numbers or dot positions. Timeline cells are exact Carto
//     aggregation counts. Points are REAL block-level incident locations
//     published by PPD (a deterministic sample, disclosed as such).
//   * The polygon layer has the 21 CURRENT districts. Historic rows tagged to
//     retired districts (04 →2023, 06 →2024, 23 →2013, 92 →2009) have no
//     polygon to join — they are counted and disclosed as unplaced, never
//     guessed into a neighboring district.
//   * District numbers are not resident-known names. Labels use the City's
//     official Neighborhoods polygons, ranked by where each district's REAL
//     sampled incidents fall (approx:true — names describe the district's
//     area; boundaries stay the official district polygons).
//
// Usage:  node pipeline/sources/philadelphia-pa.mjs
//         (env FBI_API_KEY optional; DEMO_KEY fallback with 90s→300s retries)
//
// Outputs: data/philadelphia-pa/normalized/{beats,timeline,feed,summary,
//          history,neighborhoods,points}.json + raw dumps in
//          data/philadelphia-pa/raw/ (gitignored except _fetch_meta.json).

import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const RAW_DIR = resolve(repoRoot, "data/philadelphia-pa/raw");
const NORM_DIR = resolve(repoRoot, "data/philadelphia-pa/normalized");
mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(NORM_DIR, { recursive: true });

// ---------------------------------------------------------------- constants
const CARTO = "https://phl.carto.com/api/v2/sql";
const TABLE = "incidents_part1_part2";
const HUB = "https://opendataphilly.org/datasets/crime-incidents/";
const GEO_URL =
  "https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/Boundaries_District/FeatureServer/0/query?where=1%3D1&outFields=dist_numc&f=geojson";
const HOODS_URL =
  "https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/Neighborhoods/FeatureServer/0/query?where=1%3D1&outFields=NAME,LISTNAME,MAPNAME&f=geojson";
const DISTRICT_LIST_URL = "https://www.phillypolice.com/district/districts-list/";
const ORI = "PAPEP0000";
const FBI_KEY = process.env.FBI_API_KEY || "DEMO_KEY";

// Granular era: 2006-01 .. 2026-06 (last full month; the partial max month is
// dropped). dispatch_date is a 'YYYY-MM-DD' varchar → string comparisons.
const WIN_START = "2006-01-01";
const WIN_END = "2026-07-01"; // exclusive
const DATE_MIN = "2006-01-01";
const DATE_MAX = "2026-06-30";
const BBOX = { latMin: 39.86, latMax: 40.14, lngMin: -75.29, lngMax: -74.95 };

const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff2e63" },
  property: { label: "Crimes Against Property", color: "#ffc233" },
  society: { label: "Crimes Against Society", color: "#34e0e0" },
  other: { label: "Other / non-criminal", color: "#7486a0" },
};
const CAT_IDX = { persons: 0, property: 1, society: 2, other: 3 };

// text_general_code → cat (NIBRS crimes-against convention). All 32 non-null
// values in the live dataset are enumerated below; documented in
// data/philadelphia-pa/PROVENANCE.md.
const CAT_CODES = {
  persons: [
    "Homicide - Criminal", "Homicide - Justifiable", "Homicide - Gross Negligence",
    "Rape", "Other Sex Offenses (Not Commercialized)",
    "Aggravated Assault Firearm", "Aggravated Assault No Firearm",
    "Other Assaults", "Offenses Against Family and Children",
  ],
  property: [
    "Robbery Firearm", "Robbery No Firearm",
    "Burglary Residential", "Burglary Non-Residential",
    "Thefts", "Theft from Vehicle", "Motor Vehicle Theft", "Arson",
    "Vandalism/Criminal Mischief", "Fraud", "Forgery and Counterfeiting",
    "Receiving Stolen Property", "Embezzlement",
  ],
  society: [
    "Narcotic / Drug Law Violations", "Weapon Violations",
    "Prostitution and Commercialized Vice", "Gambling Violations",
    "DRIVING UNDER THE INFLUENCE", "Liquor Law Violations",
    "Public Drunkenness", "Disorderly Conduct", "Vagrancy/Loitering",
  ],
};
const KNOWN_MAPPED = new Set([...CAT_CODES.persons, ...CAT_CODES.property, ...CAT_CODES.society]);
// Codes we EXPECT in the `other` bucket (anything else unrecognized gets logged).
const KNOWN_OTHER = new Set(["All Other Offenses"]);
function mapCat(t) {
  if (t == null) return "other";
  if (CAT_CODES.persons.includes(t)) return "persons";
  if (CAT_CODES.property.includes(t)) return "property";
  if (CAT_CODES.society.includes(t)) return "society";
  return "other";
}

// Police divisions per district, from the official PPD districts list
// (https://www.phillypolice.com/district/districts-list/, fetched 2026-07-12).
const DIVISIONS = {
  "01": "SOUTH", "02": "NORTHEAST", "03": "SOUTH", "05": "NORTHWEST",
  "07": "NORTHEAST", "08": "NORTHEAST", "09": "CENTRAL", "12": "SOUTHWEST",
  "14": "NORTHWEST", "15": "NORTHEAST", "16": "SOUTHWEST", "17": "SOUTH",
  "18": "SOUTHWEST", "19": "SOUTHWEST", "22": "CENTRAL", "24": "EAST",
  "25": "EAST", "26": "EAST", "35": "NORTHWEST", "39": "NORTHWEST",
  "77": "SOUTHWEST",
};

// months 2006-01 .. 2026-06 (246)
const MONTHS = [];
for (let y = 2006; y <= 2026; y++)
  for (let m = 1; m <= 12; m++) {
    if (y === 2026 && m > 6) break;
    MONTHS.push(`${y}-${String(m).padStart(2, "0")}`);
  }
const MONTH_IDX = Object.fromEntries(MONTHS.map((m, i) => [m, i]));

// ------------------------------------------------------------------ helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON(url, { tries = 5, label = "" } = {}) {
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
    const wait = 1500 * (a + 1);
    console.warn(`  retry ${a + 1}/${tries - 1} in ${wait}ms (${label}): ${lastErr.message.slice(0, 120)}`);
    await sleep(wait);
  }
  throw lastErr;
}

function carto(sql) {
  return `${CARTO}?q=${encodeURIComponent(sql)}`;
}
async function cartoRows(sql, label) {
  const j = await fetchJSON(carto(sql), { label });
  if (!Array.isArray(j.rows)) throw new Error(`carto ${label}: no rows array`);
  return j.rows;
}
const sq = (s) => `'${s.replace(/'/g, "''")}'`;
function catWhere(cat) {
  if (cat === "other") {
    const all = [...KNOWN_MAPPED].map(sq).join(",");
    return `(text_general_code NOT IN (${all}) OR text_general_code IS NULL)`;
  }
  return `text_general_code IN (${CAT_CODES[cat].map(sq).join(",")})`;
}
const windowWhere = `dispatch_date >= '${WIN_START}' AND dispatch_date < '${WIN_END}'`;

// '1' / ' 01 ' → '01'; anything non-numeric returned trimmed as-is.
function normDist(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return /^\d+$/.test(s) ? s.padStart(2, "0") : s;
}
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
const r6 = (x) => Math.round(x * 1e6) / 1e6;

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

// --------------------------------------------------- geometry (PIP + centroid)
// rings: number[][][] — even-odd ray casting across ALL rings of a feature
// (outer + holes) so holes are handled correctly.
function pointInRings(rings, x, y) {
  let inside = false;
  for (const r of rings)
    for (let i = 0; i < r.length - 1; i++) {
      const [x1, y1] = r[i], [x2, y2] = r[i + 1];
      if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside;
    }
  return inside;
}
function ringsBbox(rings) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rings)
    for (const [x, y] of r) {
      if (x < x1) x1 = x; if (x > x2) x2 = x;
      if (y < y1) y1 = y; if (y > y2) y2 = y;
    }
  return [x1, y1, x2, y2];
}
function geomParts(g) {
  return g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
}

// ------------------------------------------------------- 1. district polygons
async function fetchDistricts() {
  console.log("1/8 police district polygons…");
  const gj = await fetchJSON(GEO_URL, { label: "districts-geojson" });
  writeFileSync(resolve(RAW_DIR, "districts.geojson"), JSON.stringify(gj));
  assert(gj.features?.length === 21, `expected 21 districts, got ${gj.features?.length}`);
  const dists = {}; // code -> { code, polygon (outer rings), centroid }
  for (const f of gj.features) {
    const code = normDist(f.properties.dist_numc);
    assert(/^\d{2}$/.test(code), `bad dist_numc ${f.properties.dist_numc}`);
    assert(!dists[code], `duplicate district ${code}`);
    const parts = geomParts(f.geometry);
    // outer rings only, for rendering (matches chicago beats.json shape)
    const polygon = parts.map((part) => part[0].map(([lng, lat]) => [r6(lng), r6(lat)]));
    // area-weighted centroid across parts (planar shoelace; fine at city scale)
    let AW = 0, cx = 0, cy = 0;
    for (const ring of parts.map((part) => part[0])) {
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
    assert(AW > 0, `degenerate polygon for district ${code}`);
    dists[code] = { code, polygon, centroid: [r6(cx / AW), r6(cy / AW)] };
  }
  assert(Object.keys(dists).length === 21, "duplicate district codes in geojson");
  for (const code of Object.keys(dists))
    assert(DIVISIONS[code], `district ${code} missing from DIVISIONS table`);
  return dists;
}

// ------------------------------------------------------ 2. neighborhood layer
async function fetchHoods() {
  console.log("2/8 neighborhood polygons (City of Philadelphia layer)…");
  const gj = await fetchJSON(HOODS_URL, { label: "hoods-geojson" });
  writeFileSync(resolve(RAW_DIR, "neighborhoods.geojson"), JSON.stringify(gj));
  assert(gj.features?.length > 100, `expected 150+ neighborhoods, got ${gj.features?.length}`);
  return gj.features.map((f) => {
    const name = String(f.properties.MAPNAME).trim();
    const rings = geomParts(f.geometry).flat(); // all rings, holes included
    return { name, rings, bbox: ringsBbox(rings) };
  });
}

// ----------------------------------- 3. full-dataset totals by offense code
async function fetchTotals() {
  console.log("3/8 full-dataset counts by text_general_code…");
  const rows = await cartoRows(
    `SELECT text_general_code, count(*) AS n FROM ${TABLE} GROUP BY text_general_code ORDER BY n DESC`,
    "by_code",
  );
  writeFileSync(resolve(RAW_DIR, "by_text_general_code.json"), JSON.stringify(rows, null, 2));
  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  const unrecognized = [];
  for (const r of rows) {
    const t = r.text_general_code;
    const cat = mapCat(t);
    catTotals[cat] += Number(r.n);
    if (cat === "other" && t != null && !KNOWN_OTHER.has(t)) unrecognized.push(`${t} (${r.n})`);
  }
  if (unrecognized.length)
    console.log(`  unrecognized text_general_code → other: ${unrecognized.join("; ")}`);
  const total = Object.values(catTotals).reduce((a, b) => a + b, 0);
  await sleep(150);
  const [cnt] = await cartoRows(`SELECT count(*) AS n FROM ${TABLE}`, "total_count");
  assert(Number(cnt.n) === total, `count(*)=${cnt.n} != sum-by-code=${total}`);
  await sleep(150);
  const [pre] = await cartoRows(
    `SELECT count(*) AS n FROM ${TABLE} WHERE dispatch_date < '${WIN_START}' OR dispatch_date IS NULL`,
    "pre_window_count",
  );
  await sleep(150);
  const [post] = await cartoRows(
    `SELECT count(*) AS n FROM ${TABLE} WHERE dispatch_date >= '${WIN_END}'`,
    "post_window_count",
  );
  console.log(`  total=${total}  pre-2006=${pre.n}  partial-2026-07=${post.n}`);
  return { catTotals, total, preWindow: Number(pre.n), postWindow: Number(post.n), unrecognized };
}

// ------------------------------- 4. per-cat monthly-by-district timeline cells
async function fetchTimeline(dists) {
  console.log("4/8 timeline: per-cat monthly counts by district…");
  const cells = {};
  for (const code of Object.keys(dists))
    cells[code] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  const placedByCatMonth = {}; // cat -> number[246]
  const unplacedByCatMonth = {};
  const unplacedByDist = {}; // raw dc_dist value -> count (window, no polygon)
  let unplacedTotal = 0;
  for (const cat of Object.keys(CATS)) {
    placedByCatMonth[cat] = MONTHS.map(() => 0);
    unplacedByCatMonth[cat] = MONTHS.map(() => 0);
    const rows = await cartoRows(
      `SELECT left(dispatch_date,7) AS ym, dc_dist, count(*) AS n FROM ${TABLE} ` +
        `WHERE ${catWhere(cat)} AND ${windowWhere} GROUP BY 1,2 ORDER BY 1,2`,
      `agg:${cat}`,
    );
    for (const r of rows) {
      const mi = MONTH_IDX[r.ym];
      assert(mi !== undefined, `agg ${cat}: month ${r.ym} outside window`);
      const n = Number(r.n);
      const code = normDist(r.dc_dist);
      if (code != null && cells[code]) {
        cells[code][mi][cat] += n;
        placedByCatMonth[cat][mi] += n;
      } else {
        unplacedByCatMonth[cat][mi] += n;
        unplacedTotal += n;
        const k = code == null ? "(null)" : code;
        unplacedByDist[k] = (unplacedByDist[k] || 0) + n;
      }
    }
    console.log(`  ${cat}: ${rows.length} agg rows`);
    await sleep(150);
  }
  console.log(`  unplaced (no current-district polygon): ${JSON.stringify(unplacedByDist)}`);
  return { cells, placedByCatMonth, unplacedByCatMonth, unplacedByDist, unplacedTotal };
}

// --------------------------------------- 5. citywide per-cat monthly checks
async function fetchCitywide() {
  console.log("5/8 citywide per-cat monthly (independent cross-check)…");
  const cw = {};
  for (const cat of Object.keys(CATS)) {
    const rows = await cartoRows(
      `SELECT left(dispatch_date,7) AS ym, count(*) AS n FROM ${TABLE} ` +
        `WHERE ${catWhere(cat)} AND ${windowWhere} GROUP BY 1 ORDER BY 1`,
      `citywide:${cat}`,
    );
    cw[cat] = MONTHS.map(() => 0);
    for (const r of rows) {
      const mi = MONTH_IDX[r.ym];
      assert(mi !== undefined, `citywide ${cat}: month ${r.ym} outside window`);
      cw[cat][mi] = Number(r.n);
    }
    await sleep(150);
  }
  return cw;
}

// ----------------------------------------------- 6. sampled REAL points
// One query per month, ordered by md5(dc_key) — deterministic pseudo-random,
// type- and district-representative (plain :id/cartodb_id order risks
// load-order clustering; dc_key order would cluster by district). Every kept
// dot is a REAL block-level incident location published by PPD.
// The same fetched rows also feed the district→neighborhood ranking (labels).
async function fetchPoints(dists, hoods) {
  console.log("6/8 real sampled points (block-level, ≤100/month, 246 monthly queries)…");
  const pts = MONTHS.map(() => []);
  const hoodTally = {}; // district code -> { hoodName: count }
  for (const code of Object.keys(dists)) hoodTally[code] = {};
  let outOfBbox = 0, tallied = 0;
  for (let mi = 0; mi < MONTHS.length; mi++) {
    const [y, m] = MONTHS[mi].split("-").map(Number);
    const start = `${MONTHS[mi]}-01`;
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const rows = await cartoRows(
      `SELECT point_x, point_y, text_general_code, dc_dist FROM ${TABLE} ` +
        `WHERE point_x IS NOT NULL AND point_y IS NOT NULL ` +
        `AND dispatch_date >= '${start}' AND dispatch_date < '${end}' ` +
        `ORDER BY md5(coalesce(dc_key::text, cartodb_id::text)) LIMIT 500`,
      `points:${MONTHS[mi]}`,
    );
    const inBbox = [];
    for (const r of rows) {
      const lat = Number(r.point_y), lng = Number(r.point_x);
      if (!(lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax)) {
        outOfBbox++; continue; // real but geocoded outside the city bbox — excluded, counted
      }
      inBbox.push([r6(lng), r6(lat), CAT_IDX[mapCat(r.text_general_code)]]);
      const code = normDist(r.dc_dist);
      if (code != null && hoodTally[code]) {
        for (const h of hoods) {
          const [x1, y1, x2, y2] = h.bbox;
          if (lng >= x1 && lng <= x2 && lat >= y1 && lat <= y2 && pointInRings(h.rings, lng, lat)) {
            hoodTally[code][h.name] = (hoodTally[code][h.name] || 0) + 1;
            tallied++;
            break;
          }
        }
      }
    }
    const stride = Math.max(1, Math.floor(inBbox.length / 100));
    for (let i = 0; i < inBbox.length && pts[mi].length < 100; i += stride) pts[mi].push(inBbox[i]);
    if ((mi + 1) % 24 === 0) console.log(`  …through ${MONTHS[mi]}`);
    await sleep(150);
  }
  const shown = pts.reduce((a, m) => a + m.length, 0);
  console.log(`  ${shown} points kept (${outOfBbox} out-of-bbox rows excluded; ${tallied} rows in hood tally)`);
  return { pts, shown, outOfBbox, hoodTally };
}

// ---------------------------------------- resident-known district labels
// "24th · Richmond / Harrowgate" — top neighborhoods by REAL sampled incident
// locations inside each district (approx: names describe the district's area).
function abbrevHood(n) {
  return n
    .replace(/\bWest\b/g, "W").replace(/\bEast\b/g, "E")
    .replace(/\bNorth\b/g, "N").replace(/\bSouth\b/g, "S")
    .replace(/\bSquare\b/g, "Sq").replace(/\bMount\b/g, "Mt");
}
function buildLabels(dists, hoodTally) {
  const labels = {}; // code -> { name, top: [{name, pct}] }
  for (const code of Object.keys(dists)) {
    const tally = hoodTally[code];
    const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    assert(ranked.length > 0, `district ${code}: no sampled incidents matched a neighborhood`);
    const sum = ranked.reduce((a, [, n]) => a + n, 0);
    const top = ranked.slice(0, 6).map(([name, n]) => ({ name, pct: Math.round((n / sum) * 1000) / 10 }));
    const ord = ordinal(Number(code));
    const a = ranked[0][0].split(" - ")[0];
    // second name: only a REAL share (≥15% of sampled incidents, keeps
    // misgeocode noise out), first partner that fits the 28-char budget
    const cands = [];
    for (const [nm, n] of ranked.slice(1, 4)) {
      if ((n / sum) * 100 < 15) break;
      const b = nm.split(" - ")[0];
      cands.push(`${ord} · ${a} / ${b}`, `${ord} · ${abbrevHood(a)} / ${abbrevHood(b)}`);
    }
    cands.push(`${ord} · ${a}`, `${ord} · ${abbrevHood(a)}`);
    let name = cands.find((c) => c.length <= 28);
    if (!name) name = cands.at(-1).slice(0, 28);
    labels[code] = { name, top };
  }
  return labels;
}

// -------------------------------------------------------------- 7. feed
async function fetchFeed(dists) {
  console.log("7/8 dispatch feed (4 real incidents per quarter)…");
  const distIn = Object.keys(dists).map(sq).join(",");
  const feed = [];
  for (let y = 2006; y <= 2026; y++) {
    for (let q = 0; q < 4; q++) {
      if (y === 2026 && q > 1) break; // window ends 2026-06
      const sm = q * 3 + 1;
      const start = `${y}-${String(sm).padStart(2, "0")}-01`;
      const end = q === 3 ? `${y + 1}-01-01` : `${y}-${String(sm + 3).padStart(2, "0")}-01`;
      const rows = await cartoRows(
        `SELECT dispatch_date, text_general_code, location_block, dc_dist FROM ${TABLE} ` +
          `WHERE dc_dist IN (${distIn}) AND text_general_code IS NOT NULL ` +
          `AND location_block IS NOT NULL ` +
          `AND dispatch_date >= '${start}' AND dispatch_date < '${end}' ` +
          `ORDER BY cartodb_id LIMIT 4`,
        `feed:${y}Q${q + 1}`,
      );
      for (const r of rows) {
        feed.push({
          date: String(r.dispatch_date).slice(0, 10),
          title: r.text_general_code,
          place: r.location_block,
          beat: normDist(r.dc_dist),
          cat: mapCat(r.text_general_code),
        });
      }
      await sleep(150);
    }
  }
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`  ${feed.length} feed items`);
  return feed;
}

// ------------------------------------------------------------ 8. FBI CDE
// LAST in the run. Primary endpoint is the official FBI CDE host
// (cde.ucr.cjis.gov — same service the public Crime Data Explorer webapp
// uses; no api.data.gov key required). The keyed api.usa.gov mirror is the
// fallback — DEMO_KEY there allows only 10 requests/DAY for CDE, so it is
// only useful with a real FBI_API_KEY. 90s→300s backoff on 429.
async function fetchFBI(offense) {
  const q = `${offense}?from=01-1985&to=12-2005`;
  const endpoints = [
    `https://cde.ucr.cjis.gov/LATEST/summarized/agency/${ORI}/${q}`,
    `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/${q}&API_KEY=${FBI_KEY}`,
  ];
  const waits = [90000, 300000, 300000, 300000];
  let lastErr;
  for (let a = 0; a <= waits.length; a++) {
    for (const url of endpoints) {
      let r;
      try {
        r = await fetch(url, { headers: { accept: "application/json" } });
      } catch (e) {
        lastErr = e;
        continue;
      }
      if (r.status === 429) {
        lastErr = new Error(`FBI ${offense}: 429 at ${new URL(url).host}`);
        continue;
      }
      if (r.status !== 200) {
        lastErr = new Error(`FBI ${offense}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
        continue;
      }
      const j = await r.json();
      const actuals = j?.offenses?.actuals;
      if (!actuals) throw new Error(`FBI ${offense}: no offenses.actuals in response`);
      // agency "Offenses" series only — never Clearances, never the US series
      const agKey =
        Object.keys(actuals).find((k) => /Philadelphia/i.test(k) && /Offenses$/.test(k)) ||
        Object.keys(actuals).find((k) => !/United States|Clearances/i.test(k));
      if (!agKey) throw new Error(`FBI ${offense}: no agency series found (${Object.keys(actuals)})`);
      console.log(`  ${offense}: series "${agKey}" via ${new URL(url).host}`);
      return { raw: j, monthly: actuals[agKey] || {} }; // { "MM-YYYY": n }
    }
    if (a === waits.length) break;
    console.warn(`  FBI retry ${a + 1}/${waits.length} in ${waits[a] / 1000}s: ${lastErr?.message?.slice(0, 120)}`);
    await sleep(waits[a]);
  }
  throw lastErr ?? new Error(`FBI ${offense}: exhausted retries`);
}

async function fetchHistory() {
  console.log(`8/8 FBI CDE history (${ORI}, 1985–2005 monthly → annual)…`);
  const violent = await fetchFBI("violent-crime");
  await sleep(1000);
  const property = await fetchFBI("property-crime");
  writeFileSync(
    resolve(RAW_DIR, "fbi_cde.json"),
    JSON.stringify({ ori: ORI, fetchedAt: new Date().toISOString(), violent: violent.raw, property: property.raw }),
  );
  const perYear = (monthly, y) => {
    const vals = [];
    for (let m = 1; m <= 12; m++) {
      const k = `${String(m).padStart(2, "0")}-${y}`;
      vals.push(monthly[k] === undefined ? undefined : Number(monthly[k]));
    }
    return vals;
  };
  const years = [];
  const dropped = [];
  for (let y = 1985; y <= 2005; y++) {
    const v = perYear(violent.monthly, y);
    const p = perYear(property.monthly, y);
    const complete =
      v.every((x) => x !== undefined && x > 0) && p.every((x) => x !== undefined && x > 0);
    if (!complete) {
      const badV = v.map((x, i) => (x === undefined || x <= 0 ? i + 1 : null)).filter(Boolean);
      const badP = p.map((x, i) => (x === undefined || x <= 0 ? i + 1 : null)).filter(Boolean);
      dropped.push(`${y} (violent months missing/zero: [${badV}], property: [${badP}])`);
      // only LEADING years may be dropped — a hole inside the era is a hard fail
      assert(years.length === 0, `FBI year ${y} incomplete inside the era — cannot build contiguous history`);
      continue;
    }
    const vy = v.reduce((a, b) => a + b, 0);
    const py = p.reduce((a, b) => a + b, 0);
    years.push({ year: y, violent: vy, property: py, total: vy + py });
  }
  if (dropped.length) console.log(`  dropped partial years: ${dropped.join("; ")}`);
  assert(years.length > 0, "FBI history: no complete years");
  return { years, dropped };
}

// -------------------------------------------------------------------- main
async function main() {
  const t0 = Date.now();
  const fetchedAt = new Date().toISOString();

  const dists = await fetchDistricts();
  const hoods = await fetchHoods();
  const totals = await fetchTotals();
  const tl = await fetchTimeline(dists);
  const cw = await fetchCitywide();
  const pointsRes = await fetchPoints(dists, hoods);
  const labels = buildLabels(dists, pointsRes.hoodTally);
  const feed = await fetchFeed(dists);
  const history = await fetchHistory(); // FBI last (rate limits)

  // ----------------------------------------------------------- validation
  console.log("validating…");
  assert(MONTHS.length === 246 && MONTHS[0] === "2006-01" && MONTHS[245] === "2026-06",
    `months array wrong (${MONTHS.length}, ${MONTHS[0]}..${MONTHS.at(-1)})`);
  for (let i = 1; i < MONTHS.length; i++) {
    const [py, pm] = MONTHS[i - 1].split("-").map(Number);
    const [cy, cm2] = MONTHS[i].split("-").map(Number);
    assert((pm === 12 && cy === py + 1 && cm2 === 1) || (cy === py && cm2 === pm + 1),
      `months not contiguous at ${MONTHS[i]}`);
  }
  const codes = Object.keys(dists).sort();
  assert(codes.length === 21, `expected 21 district codes, got ${codes.length}`);
  for (const [code, series] of Object.entries(tl.cells)) {
    assert(series.length === MONTHS.length, `cells[${code}] length ${series.length} != ${MONTHS.length}`);
    assert(dists[code], `cells key ${code} not a district`);
  }
  assert(Object.keys(tl.cells).length === 21, "cells must cover all 21 districts");
  // every district must actually appear in the data
  for (const code of codes) {
    const tot = tl.cells[code].reduce(
      (a, c) => a + c.persons + c.property + c.society + c.other, 0);
    assert(tot > 0, `district ${code} has zero placed records`);
  }
  // labels: unique, non-empty, ≤28 chars
  const labelNames = codes.map((c) => labels[c].name);
  assert(new Set(labelNames).size === 21, "duplicate district labels");
  for (const n of labelNames) assert(n.length > 0 && n.length <= 28, `label bad length: "${n}"`);
  // placed + unplaced == citywide, per cat per month, 0 tolerance
  let placedRecords = 0, windowCitywide = 0;
  for (const cat of Object.keys(CATS)) {
    for (let mi = 0; mi < MONTHS.length; mi++) {
      const placed = tl.placedByCatMonth[cat][mi];
      const unplaced = tl.unplacedByCatMonth[cat][mi];
      assert(placed + unplaced === cw[cat][mi],
        `${cat} ${MONTHS[mi]}: placed ${placed} + unplaced ${unplaced} != citywide ${cw[cat][mi]}`);
      placedRecords += placed;
      windowCitywide += cw[cat][mi];
    }
  }
  // cross-check cells sum == placedRecords
  let cellsSum = 0;
  for (const series of Object.values(tl.cells))
    for (const c of series) cellsSum += c.persons + c.property + c.society + c.other;
  assert(cellsSum === placedRecords, `cells sum ${cellsSum} != placed ${placedRecords}`);
  const noDistrict = windowCitywide - placedRecords;
  assert(noDistrict === tl.unplacedTotal, `unplaced mismatch ${noDistrict} != ${tl.unplacedTotal}`);
  const unplacedByDistSum = Object.values(tl.unplacedByDist).reduce((a, b) => a + b, 0);
  assert(unplacedByDistSum === noDistrict, `unplacedByDist sum ${unplacedByDistSum} != ${noDistrict}`);
  // full-dataset identity: pre + window + post == total
  assert(totals.preWindow + windowCitywide + totals.postWindow === totals.total,
    `partition mismatch: ${totals.preWindow}+${windowCitywide}+${totals.postWindow} != ${totals.total}`);
  const unplacedRecords = totals.total - placedRecords;
  const coveragePct = Math.round((placedRecords / totals.total) * 1000) / 10;
  // points
  assert(pointsRes.pts.length === MONTHS.length, "points months misaligned");
  for (let mi = 0; mi < pointsRes.pts.length; mi++)
    for (const [lng, lat, ci] of pointsRes.pts[mi]) {
      assert(lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax,
        `point out of bbox in ${MONTHS[mi]}: ${lng},${lat}`);
      assert(Number.isInteger(ci) && ci >= 0 && ci <= 3, `bad catIdx ${ci}`);
    }
  // feed
  for (const it of feed) {
    assert(dists[it.beat], `feed beat ${it.beat} unknown`);
    assert(it.date >= DATE_MIN && it.date <= DATE_MAX, `feed date ${it.date} outside window`);
    assert(CATS[it.cat], `feed cat ${it.cat} invalid`);
    assert(typeof it.title === "string" && it.title.length > 0, "feed title empty");
  }
  // history: contiguous years ending 2005
  const yearMin = history.years[0].year, yearMax = history.years.at(-1).year;
  assert(yearMax === 2005, `history must end at 2005, got ${yearMax}`);
  history.years.forEach((y, i) => assert(y.year === yearMin + i, `history not contiguous at ${y.year}`));

  // ------------------------------------------------------------- outputs
  const beats = { cats: CATS, beats: {} };
  for (const code of codes) {
    beats.beats[code] = {
      key: code, name: labels[code].name, servcen: DIVISIONS[code], beat: Number(code),
      centroid: dists[code].centroid, polygon: dists[code].polygon, geomType: "MultiPolygon",
    };
  }
  const timeline = { months: MONTHS, cells: tl.cells };
  const sampleRate = Math.round((windowCitywide / pointsRes.shown) * 10) / 10;
  const points = {
    mode: "real-sample",
    note: "Every dot is a real reported incident location, published block-level by the Philadelphia Police Department (addresses are generalized to the hundred block). A deterministic sample (≤100/month, md5(dc_key) order) is shown.",
    sampleRate,
    months: MONTHS,
    pts: pointsRes.pts,
  };
  const summary = {
    slug: "philadelphia-pa",
    title: "Philadelphia · PA",
    source: { records: `${CARTO}?q=SELECT * FROM ${TABLE}`, beats: GEO_URL.split("/query")[0], hub: HUB },
    fetchedAt,
    dateMin: DATE_MIN,
    dateMax: DATE_MAX,
    months: MONTHS.length,
    totalRecords: totals.total,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: {
      "retired-districts": noDistrict - (tl.unplacedByDist["(null)"] || 0),
      "no-district": (tl.unplacedByDist["(null)"] || 0) + totals.preWindow,
      "partial-2026-07": totals.postWindow,
    },
    unplacedByDist: tl.unplacedByDist,
    catTotals: totals.catTotals,
    cats: CATS,
    beatCount: 21,
  };
  const historyJson = {
    era: "history",
    taxonomy: "FBI UCR Summary (Violent + Property) — distinct from the NIBRS-style categories used from 2006",
    agency: "Philadelphia Police Department",
    ori: ORI,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      "Annual totals are real UCR counts fetched from the FBI CDE summarized agency endpoint for ORI PAPEP0000, " +
      "summed from monthly actuals (every kept year verified to have 12 nonzero months). UCR Summary " +
      "(violent/property) is a different taxonomy from the incident-level categories used for 2006+; the two eras " +
      "bridge at 2006 and are never mixed on one axis. Reproduce with pipeline/sources/philadelphia-pa.mjs " +
      "(set FBI_API_KEY to avoid DEMO_KEY limits)." +
      (history.dropped.length ? ` Dropped partial years: ${history.dropped.join("; ")}.` : ""),
    yearMin,
    yearMax,
    cats: {
      violent: { label: "UCR Violent (murder, rape, robbery, agg. assault)", color: "#ff2e63" },
      property: { label: "UCR Property (burglary, larceny, MV theft)", color: "#ffc233" },
    },
    years: history.years,
  };
  const neighborhoods = {
    source:
      "City of Philadelphia Neighborhoods polygons, ranked per district by REAL sampled incident locations (PPD block-level points)",
    sourceUrl: HOODS_URL.split("/query")[0],
    hub: DISTRICT_LIST_URL,
    fetchedAt,
    license: "City of Philadelphia License (see PROVENANCE)",
    method:
      "approx — PPD district numbers are not resident-known names. Each district label lists the neighborhoods " +
      "where its real sampled incidents fall (point-in-polygon against the City's official Neighborhoods layer, " +
      "ranked by count; deterministic md5(dc_key) sample). Names describe the district's area; the boundaries " +
      "shown are always the official district polygons. The 77th District is the Airport district (per the PPD " +
      "districts list).",
    map: Object.fromEntries(
      codes.map((c) => [c, {
        name: labels[c].name,
        approx: true,
        ordinal: `${ordinal(Number(c))} District`,
        division: DIVISIONS[c],
        hoods: labels[c].top,
      }]),
    ),
  };

  const outputs = { "beats.json": beats, "timeline.json": timeline, "feed.json": feed,
    "summary.json": summary, "history.json": historyJson, "neighborhoods.json": neighborhoods,
    "points.json": points };
  for (const [f, obj] of Object.entries(outputs)) {
    assertNoNaN(obj, f);
    writeFileSync(resolve(NORM_DIR, f), JSON.stringify(obj));
  }
  writeFileSync(
    resolve(RAW_DIR, "_fetch_meta.json"),
    JSON.stringify({
      fetchedAt, script: "pipeline/sources/philadelphia-pa.mjs",
      sources: {
        records: `${CARTO} (table ${TABLE})`, hub: HUB,
        districts: GEO_URL, neighborhoods: HOODS_URL,
        districtList: DISTRICT_LIST_URL,
        fbi: `api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}`,
      },
      totalRecords: totals.total, window: `${DATE_MIN}..${DATE_MAX}`,
      unrecognizedCodes: totals.unrecognized,
      unplacedByDist: tl.unplacedByDist,
      outOfBboxPoints: pointsRes.outOfBbox,
    }, null, 2),
  );

  // ------------------------------------------------------------- report
  const size = (f) => `${(statSync(resolve(NORM_DIR, f)).size / 1024).toFixed(1)} KB`;
  const yearTotal = (code, y) => {
    const s = tl.cells[code];
    let t = 0;
    for (let mi = 0; mi < MONTHS.length; mi++)
      if (MONTHS[mi].startsWith(`${y}-`)) t += s[mi].persons + s[mi].property + s[mi].society + s[mi].other;
    return t;
  };
  const cwYear = (y) => {
    let t = 0;
    for (const cat of Object.keys(CATS))
      for (let mi = 0; mi < MONTHS.length; mi++)
        if (MONTHS[mi].startsWith(`${y}-`)) t += cw[cat][mi];
    return t;
  };
  const named = (code) => `${code} ${labels[code].name}`;
  const falls0625 = codes
    .map((c) => {
      const a = yearTotal(c, 2006), b = yearTotal(c, 2025);
      return { d: named(c), y2006: a, y2025: b, pct: a > 0 ? Math.round(((b - a) / a) * 1000) / 10 : null };
    })
    .sort((x, y) => (x.pct ?? 0) - (y.pct ?? 0));
  const falls2225 = codes
    .map((c) => {
      const a = yearTotal(c, 2022), b = yearTotal(c, 2025);
      return { d: named(c), y2022: a, y2025: b, pct: a > 0 ? Math.round(((b - a) / a) * 1000) / 10 : null };
    })
    .sort((x, y) => (x.pct ?? 0) - (y.pct ?? 0));
  const by2025 = codes
    .map((c) => ({ d: named(c), y2025: yearTotal(c, 2025) }))
    .sort((x, y) => y.y2025 - x.y2025);
  // highest citywide month in the last 5 years (2021-07..2026-06)
  let hiMonth = null, hiVal = -1;
  for (let mi = MONTH_IDX["2021-07"]; mi < MONTHS.length; mi++) {
    const v = Object.keys(CATS).reduce((a, cat) => a + cw[cat][mi], 0);
    if (v > hiVal) { hiVal = v; hiMonth = MONTHS[mi]; }
  }
  const peak = history.years.reduce((a, b) => (b.violent > a.violent ? b : a));
  const cw2006 = cwYear(2006), cw2025 = cwYear(2025);

  console.log(JSON.stringify({
    totalRecords: totals.total, placedRecords, unplacedRecords, coveragePct,
    unplacedBeats: summary.unplacedBeats, unplacedByDist: tl.unplacedByDist,
    catTotals: totals.catTotals,
    months: MONTHS.length, feedItems: feed.length, pointsShown: pointsRes.shown,
    outOfBbox: pointsRes.outOfBbox, sampleRate,
    historyYears: `${yearMin}-${yearMax}`,
    history1985: history.years.find((y) => y.year === 1985) ?? null,
    fbiViolentPeak: { year: peak.year, violent: peak.violent },
    history2005: history.years.find((y) => y.year === 2005) ?? null,
    citywide2006: cw2006, citywide2025: cw2025,
    change2006to2025Pct: Math.round(((cw2025 - cw2006) / cw2006) * 1000) / 10,
    biggestFalls2006to2025: falls0625.slice(0, 5),
    smallestFalls2006to2025: falls0625.slice(-3),
    changes2022to2025: { biggestFalls: falls2225.slice(0, 5), biggestRises: falls2225.slice(-3) },
    everyDistrictFell2022to2025: falls2225.every((x) => (x.pct ?? 0) < 0),
    highestMonthLast5y: { month: hiMonth, records: hiVal },
    top2025: by2025.slice(0, 3), bottom2025: by2025.slice(-3),
    labels: Object.fromEntries(codes.map((c) => [c, labels[c].name])),
    sizes: Object.fromEntries(Object.keys(outputs).map((f) => [f, size(f)])),
    elapsedSec: Math.round((Date.now() - t0) / 1000),
  }, null, 2));
  console.log("VALIDATION PASS");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
