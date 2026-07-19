// Kansas City, MO — KCPD Crime Data source pipeline (fetch → normalize → validate).
//
// BINDING RULE: never fabricate — every figure written by this script comes
// straight from a queryable public source; every gap is disclosed.
//
// Sources:
//   Incidents  : 12 Socrata yearly datasets "KCPD Crime Data <year>" on
//                data.kcmo.org (2015 … 2026, ids discovered via catalog search,
//                listed in YEARS below). 2018+ assets: Public Domain,
//                attribution "KCPD Information Technology"; the 2015–2017
//                assets carry no license field (disclosed).
//   Polygons   : "Kansas City Neighborhood Borders" (Socrata `vq6h-tqrf`,
//                provenance "official"; parent dataset of the official
//                "Kansas City Neighborhood Boundaries" map view `q45j-ejyk`).
//                246 multipolygons: 240 named neighborhoods + 6 unnamed
//                filler areas (nbhid=0) that carry no neighborhood name.
//   History    : FBI Crime Data Explorer (CDE) summarized agency counts,
//                Kansas City Police Department ORI MOKPD0000, 1985–2014
//                annual Violent + Property. (The scout sheet's MO0460100 is
//                Mountain View PD — verified wrong; MOKPD0000 verified via
//                agency/byStateAbbr/MO and a plausible 1985 total.)
//
// Eras (honesty structure):
//   1985–2014  FBI UCR annual citywide totals (no neighborhood detail implied)
//   2015-01 → 2026-06  KCPD incident reports with neighborhood placement via
//                point-in-polygon spatial join (coords → official polygons).
//                2026-07 is partial at fetch time (rows stop 2026-07-13) and
//                is excluded + counted.
//
// PER-INVOLVEMENT rows (spec-mandated DEDUPE): each dataset publishes one row
// per involvement (VIC/SUS/ARR/…) per offense per report — ~1.7–2.5× row
// inflation depending on year. We dedupe GLOBALLY (across all 12 datasets) by
// the report number; independent per-dataset reconciliation: the server's
// COUNT(DISTINCT report) per dataset AND per month must equal the client-side
// pull exactly.
//
// Known SOURCE GAPS / regime changes (disclosed, never patched over):
//   - the final days of December are missing from three yearly snapshots:
//     2016 stops 12-25, 2020 stops 12-27, 2021 stops 12-26 (2018 stops 12-30)
//   - 2018→2019 records-system change: involvement-row structure changes
//     (~2.5× → ~1.8× rows/report), `ibrs` goes from ~0.7% null to ~9–15%
//     null, and location coverage dips ~18–24% null for 2019–2021
//   - the 2022 dataset carries 1,430 rows dated before 2022 (128 junk-dated
//     pre-2015 back to 1923 — excluded + counted; 1,302 dated 2015–2021 —
//     legit late-entered reports, binned in their reported month) and 1 row
//     dated 2023-01
//
//   node pipeline/sources/kansas-city-mo.mjs   (FBI key from .secrets/fbi_api_key or FBI_API_KEY)
//
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const OUT_DIR = resolve(repoRoot, "data/kansas-city-mo/normalized");
const PROV_PATH = resolve(repoRoot, "data/kansas-city-mo/PROVENANCE.md");
const WIKI_PATH = resolve(repoRoot, "wiki/Data-Provenance.md");

const DOMAIN = "https://data.kcmo.org";
// Per-year field mapping (measured — the yearly schemas drift):
//   rep  = report-number field · date = reporting-date field
//   loc  = coordinate carrier: "latlng" (numeric latitude/longitude columns),
//          "locobj" (Socrata location type: {latitude,longitude} strings),
//          "point" (GeoJSON Point {coordinates:[lng,lat]})
const YEARS = [
  { year: 2015, id: "kbzx-7ehe", rep: "report_no", date: "reported_date", loc: "latlng" },
  { year: 2016, id: "wbz8-pdv7", rep: "report_no", date: "reported_date", loc: "latlng" },
  { year: 2017, id: "98is-shjt", rep: "report_no", date: "reported_date", loc: "locobj", locField: "location_1" },
  { year: 2018, id: "dmjw-d28i", rep: "report_no", date: "reported_date", loc: "locobj", locField: "location" },
  { year: 2019, id: "pxaa-ahcm", rep: "report_no", date: "reported_date", loc: "locobj", locField: "location" },
  { year: 2020, id: "vsgj-uufz", rep: "report_no", date: "reported_date", loc: "locobj", locField: "location" },
  { year: 2021, id: "w795-ffu6", rep: "report_no", date: "report_date", loc: "point", locField: "location" },
  { year: 2022, id: "x39y-7d3m", rep: "report_no", date: "report_date", loc: "point", locField: "location" },
  { year: 2023, id: "bfyq-5nh6", rep: "report", date: "report_date", loc: "point", locField: "location" },
  { year: 2024, id: "isbe-v4d8", rep: "report_no", date: "reported_date", loc: "point", locField: "location" },
  { year: 2025, id: "dmnp-9ajg", rep: "report", date: "report_date", loc: "point", locField: "location" },
  { year: 2026, id: "f7wj-ckmw", rep: "report", date: "report_date", loc: "point", locField: "location" },
];
const NBHD_ID = "vq6h-tqrf"; // parent dataset of official map view q45j-ejyk
const NBHD_URL = `${DOMAIN}/resource/${NBHD_ID}.json?$select=nbhname,nbhid,the_geom&$order=objectid&$limit=300`;
const ORI = "MOKPD0000";
const AGENCY = "Kansas City, Missouri Police Department";
const FBI_KEY =
  process.env.FBI_API_KEY ||
  (existsSync(resolve(repoRoot, ".secrets/fbi_api_key"))
    ? readFileSync(resolve(repoRoot, ".secrets/fbi_api_key"), "utf8").trim()
    : "DEMO_KEY");

// Granular window: 2015-01 (first yearly dataset) → 2026-06 (last FULL month;
// July 2026 rows stop 2026-07-13 at fetch — partial, excluded + counted).
const SPAN_START_YM = "2015-01";
const SPAN_END_YM = "2026-06";
const HIST_FROM = "01-1985";
const HIST_TO = "12-2014";

// ---- NIBRS offense-code → crimes-against mapping (documented in full) -------
// KCPD's `ibrs` column carries standard NIBRS offense codes (Group A letter/
// number codes + Group B 90-series). Mapping follows the NIBRS crimes-against
// convention: robbery/arson/extortion/bribery are crimes against PROPERTY;
// all Group B arrest-grade offenses (90A–90Z) have victim type Society in
// NIBRS and map to SOCIETY. 09C (justifiable homicide — not a crime), the
// local non-NIBRS placeholder 999, and null go to OTHER (context bucket).
const NIBRS = {
  // ---- crimes against persons
  "09A": ["persons", "Murder & Nonnegligent Manslaughter"],
  "09B": ["persons", "Negligent Manslaughter"],
  100: ["persons", "Kidnapping/Abduction"],
  "11A": ["persons", "Rape"],
  "11B": ["persons", "Sodomy"],
  "11C": ["persons", "Sexual Assault With An Object"],
  "11D": ["persons", "Fondling"],
  "13A": ["persons", "Aggravated Assault"],
  "13B": ["persons", "Simple Assault"],
  "13C": ["persons", "Intimidation"],
  "36A": ["persons", "Incest"],
  "36B": ["persons", "Statutory Rape"],
  "64A": ["persons", "Human Trafficking — Commercial Sex Acts"],
  "64B": ["persons", "Human Trafficking — Involuntary Servitude"],
  // ---- crimes against property
  120: ["property", "Robbery"],
  200: ["property", "Arson"],
  210: ["property", "Extortion/Blackmail"],
  220: ["property", "Burglary/Breaking & Entering"],
  "23A": ["property", "Pocket-picking"],
  "23B": ["property", "Purse-snatching"],
  "23C": ["property", "Shoplifting"],
  "23D": ["property", "Theft From Building"],
  "23E": ["property", "Theft From Coin-Operated Machine"],
  "23F": ["property", "Theft From Motor Vehicle"],
  "23G": ["property", "Theft of Motor Vehicle Parts"],
  "23H": ["property", "All Other Larceny"],
  240: ["property", "Motor Vehicle Theft"],
  250: ["property", "Counterfeiting/Forgery"],
  "26A": ["property", "False Pretenses/Swindle/Confidence Game"],
  "26B": ["property", "Credit Card/ATM Fraud"],
  "26C": ["property", "Impersonation"],
  "26D": ["property", "Welfare Fraud"],
  "26E": ["property", "Wire Fraud"],
  "26F": ["property", "Identity Theft"],
  "26G": ["property", "Hacking/Computer Invasion"],
  270: ["property", "Embezzlement"],
  280: ["property", "Stolen Property Offenses"],
  290: ["property", "Destruction/Damage/Vandalism"],
  510: ["property", "Bribery"],
  // ---- crimes against society
  "35A": ["society", "Drug/Narcotic Violations"],
  "35B": ["society", "Drug Equipment Violations"],
  370: ["society", "Pornography/Obscene Material"],
  "39A": ["society", "Betting/Wagering"],
  "39B": ["society", "Operating/Promoting/Assisting Gambling"],
  "39C": ["society", "Gambling Equipment Violations"],
  "39D": ["society", "Sports Tampering"],
  "40A": ["society", "Prostitution"],
  "40B": ["society", "Assisting or Promoting Prostitution"],
  "40C": ["society", "Purchasing Prostitution"],
  520: ["society", "Weapon Law Violations"],
  720: ["society", "Animal Cruelty"],
  "90A": ["society", "Bad Checks (Group B)"],
  "90B": ["society", "Curfew/Loitering/Vagrancy (Group B)"],
  "90C": ["society", "Disorderly Conduct (Group B)"],
  "90D": ["society", "Driving Under the Influence (Group B)"],
  "90E": ["society", "Drunkenness (Group B)"],
  "90F": ["society", "Family Offenses, Nonviolent (Group B)"],
  "90G": ["society", "Liquor Law Violations (Group B)"],
  "90H": ["society", "Peeping Tom (Group B)"],
  "90I": ["society", "Runaway (Group B)"],
  "90J": ["society", "Trespass of Real Property (Group B)"],
  "90Z": ["society", "All Other Offenses (Group B catch-all)"],
  // ---- context bucket (never counted as Group A persons/property/society)
  "09C": ["other", "Justifiable Homicide (not a crime per FBI)"],
  "09D": ["other", "DV-Related Suicide (KCPD local extension — not an NIBRS crime)"],
  999: ["other", "KCPD local placeholder code (non-NIBRS)"],
};
const CAT_OF = (code) => (code == null ? "other" : (NIBRS[code] || [])[0]);
const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff2e63" },
  property: { label: "Crimes Against Property", color: "#ffc233" },
  society: { label: "Crimes Against Society", color: "#34e0e0" },
  other: { label: "Unclassified / non-NIBRS (context)", color: "#7486a0" },
};
const CAT_KEYS = ["persons", "property", "society", "other"]; // catIdx order

// Valid Kansas City, MO coordinate box (spec). Source sentinel (0,0) and
// geocode junk are rejected here for the dot layer; neighborhood placement
// itself uses the official polygons, not the box.
const BBOX = { latMin: 38.83, latMax: 39.4, lngMin: -94.77, lngMax: -94.38 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fetchCount = 0;
async function getJSON(url, { retries = 4, retryWait = 5000, label = url } = {}) {
  for (let attempt = 0; ; attempt++) {
    if (fetchCount++ > 0) await sleep(120); // be polite: sequential + delay
    let r;
    try {
      r = await fetch(url);
    } catch (e) {
      if (attempt >= retries) throw new Error(`${label}: ${e.message}`);
      console.warn(`  network error (${label}); retry in ${retryWait}ms…`);
      await sleep(retryWait);
      continue;
    }
    if (r.status === 429 || r.status >= 500) {
      if (attempt >= retries) throw new Error(`${label}: HTTP ${r.status} after ${retries} retries`);
      console.warn(`  HTTP ${r.status} (${label}); retry in ${retryWait}ms…`);
      await sleep(retryWait);
      continue;
    }
    if (!r.ok) throw new Error(`${label}: HTTP ${r.status} ${await r.text()}`);
    return r.json();
  }
}

const soda = (id, params) =>
  `${DOMAIN}/resource/${id}.json?` +
  Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

// ---- month helpers --------------------------------------------------------
function monthRange(fromYm, toYm) {
  const out = [];
  let [y, m] = fromYm.split("-").map(Number);
  const [ty, tm] = toYm.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) (m = 1), y++;
  }
  return out;
}
const MONTHS = monthRange(SPAN_START_YM, SPAN_END_YM); // 138
const MONTH_IDX = new Map(MONTHS.map((m, i) => [m, i]));

// ---- polygon geometry -----------------------------------------------------
function ringAreaCentroid(ring) {
  let a = 0,
    cx = 0,
    cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  a /= 2;
  if (a === 0) return { area: 0, cx: ring[0][0], cy: ring[0][1] };
  return { area: Math.abs(a), cx: cx / (6 * a), cy: cy / (6 * a) };
}
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1],
      xj = ring[j][0],
      yj = ring[j][1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// even-odd across ALL rings (outer + holes) of all parts: inside iff the point
// is inside an odd number of rings (outer only → in; outer+hole → out).
function pointInMultiPolygon(lng, lat, parts) {
  let n = 0;
  for (const part of parts) for (const ring of part) if (pointInRing(lng, lat, ring)) n++;
  return n % 2 === 1;
}

function fail(msg) {
  console.error(`\nVALIDATION FAIL: ${msg}`);
  process.exit(1);
}
function assert(cond, msg) {
  if (!cond) fail(msg);
}
function scanFinite(obj, path = "$") {
  if (typeof obj === "number") {
    if (!Number.isFinite(obj)) fail(`non-finite number at ${path}`);
  } else if (Array.isArray(obj)) obj.forEach((v, i) => scanFinite(v, `${path}[${i}]`));
  else if (obj && typeof obj === "object")
    for (const [k, v] of Object.entries(obj)) scanFinite(v, `${path}.${k}`);
}
const fmt = (n) => Number(n).toLocaleString("en-US");

// ============================================================================
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const fetchedAt = new Date().toISOString();

  // ---- 1. Official neighborhood polygons + spatial index -------------------
  console.log("── Kansas City Neighborhood Borders polygons (official, vq6h-tqrf)");
  const rowsGeo = await getJSON(NBHD_URL, { label: "neighborhood polygons" });
  assert(Array.isArray(rowsGeo) && rowsGeo.length === 246, `polygons: expected 246 rows, got ${rowsGeo.length}`);
  const unnamed = rowsGeo.filter((r) => r.nbhname == null);
  assert(unnamed.length === 6, `polygons: expected 6 unnamed filler areas, got ${unnamed.length}`);
  const named = rowsGeo.filter((r) => r.nbhname != null);

  const beats = {};
  const joinPolys = []; // [{key, parts(all rings, full precision), bbox}]
  named.forEach((r, idx) => {
    const key = String(r.nbhname).trim();
    assert(key.length > 0, `polygon ${idx}: empty nbhname`);
    assert(!beats[key], `polygons: duplicate nbhname '${key}'`);
    const g = r.the_geom;
    assert(g?.type === "MultiPolygon" && Array.isArray(g.coordinates), `polygon '${key}': bad geometry`);
    const parts = g.coordinates; // [part][ring][vertex][lng,lat]
    let A = 0,
      X = 0,
      Y = 0;
    let latMin = 90,
      latMax = -90,
      lngMin = 180,
      lngMax = -180;
    for (const part of parts)
      for (const ring of part)
        for (const [x, y] of ring) {
          if (y < latMin) latMin = y;
          if (y > latMax) latMax = y;
          if (x < lngMin) lngMin = x;
          if (x > lngMax) lngMax = x;
        }
    const outerRings = parts.map((p) => p[0]);
    for (const ring of outerRings) {
      const { area, cx, cy } = ringAreaCentroid(ring);
      A += area;
      X += cx * area;
      Y += cy * area;
    }
    assert(A > 0, `polygon '${key}': zero area`);
    beats[key] = {
      key,
      name: key, // official layer already carries resident-friendly names
      servcen: "",
      beat: Number(r.nbhid),
      centroid: [Number((X / A).toFixed(6)), Number((Y / A).toFixed(6))],
      polygon: outerRings.map((ring) => ring.map(([x, y]) => [Number(x.toFixed(6)), Number(y.toFixed(6))])),
      geomType: "MultiPolygon",
    };
    joinPolys.push({ key, parts, bbox: { latMin, latMax, lngMin, lngMax } });
  });
  joinPolys.sort((a, b) => (a.key < b.key ? -1 : 1)); // deterministic first-match order
  const HOODS = new Set(Object.keys(beats));
  assert(HOODS.size === 240, `expected 240 named neighborhoods, got ${HOODS.size}`);
  // global polygon extent sanity
  const ext = joinPolys.reduce(
    (e, p) => ({
      latMin: Math.min(e.latMin, p.bbox.latMin),
      latMax: Math.max(e.latMax, p.bbox.latMax),
      lngMin: Math.min(e.lngMin, p.bbox.lngMin),
      lngMax: Math.max(e.lngMax, p.bbox.lngMax),
    }),
    { latMin: 90, latMax: -90, lngMin: 180, lngMax: -180 },
  );
  assert(
    ext.latMin > 38.7 && ext.latMax < 39.5 && ext.lngMin > -95.0 && ext.lngMax < -94.2,
    `polygon extent implausible: ${JSON.stringify(ext)}`,
  );
  console.log(
    `  ${HOODS.size} named neighborhoods + ${unnamed.length} unnamed filler areas (no neighborhood name — ` +
      `points there stay unplaced); extent lat ${ext.latMin.toFixed(3)}…${ext.latMax.toFixed(3)}, ` +
      `lng ${ext.lngMin.toFixed(3)}…${ext.lngMax.toFixed(3)}`,
  );

  // coarse grid index (0.005° cells) over the polygon extent → candidate polys
  const CELL = 0.005;
  const grid = new Map();
  const cellOf = (lng, lat) => `${Math.floor(lng / CELL)}:${Math.floor(lat / CELL)}`;
  joinPolys.forEach((p, pi) => {
    for (let gx = Math.floor(p.bbox.lngMin / CELL); gx <= Math.floor(p.bbox.lngMax / CELL); gx++)
      for (let gy = Math.floor(p.bbox.latMin / CELL); gy <= Math.floor(p.bbox.latMax / CELL); gy++) {
        const k = `${gx}:${gy}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(pi);
      }
  });
  function hoodOf(lng, lat) {
    const cand = grid.get(cellOf(lng, lat));
    if (!cand) return null;
    for (const pi of cand) {
      const p = joinPolys[pi];
      if (lat < p.bbox.latMin || lat > p.bbox.latMax || lng < p.bbox.lngMin || lng > p.bbox.lngMax) continue;
      if (pointInMultiPolygon(lng, lat, p.parts)) return p.key;
    }
    return null;
  }
  // spatial-join sanity probes (well-known KCMO locations, block-level coords)
  assert(hoodOf(-94.5786, 39.0997) !== null, "join sanity: downtown KC point not placed");
  assert(hoodOf(-94.5, 38.2) === null, "join sanity: far-south point wrongly placed");

  // ---- 2. ibrs pre-audit per dataset (fail on any unmapped code) -----------
  console.log("── ibrs code audit (per dataset, exhaustive)");
  const ibrsRowTotals = new Map(); // code|NULL → row count across all datasets
  for (const d of YEARS) {
    const rows = await getJSON(
      soda(d.id, { $select: "ibrs, count(*) AS n", $group: "ibrs", $order: "ibrs", $limit: "500" }),
      { label: `ibrs audit ${d.year}` },
    );
    for (const r of rows) {
      const code = r.ibrs == null ? null : String(r.ibrs).trim().toUpperCase();
      assert(code === null || CAT_OF(code), `ibrs audit ${d.year}: unmapped code '${r.ibrs}' — extend NIBRS map`);
      const k = code ?? "NULL";
      ibrsRowTotals.set(k, (ibrsRowTotals.get(k) || 0) + Number(r.n));
    }
  }
  console.log(`  ${ibrsRowTotals.size - (ibrsRowTotals.has("NULL") ? 1 : 0)} distinct NIBRS codes, all mapped ✓` +
    ` (null-ibrs rows: ${fmt(ibrsRowTotals.get("NULL") || 0)} — mapped to 'other', disclosed)`);

  // ---- 3. Full pull (12 yearly datasets) + GLOBAL dedupe by report ---------
  console.log("── Full pull of all 12 yearly datasets + global dedupe by report number");
  // incidents: report → compact record
  //   ymd     = earliest report_date (bin month)
  //   maxYm   = latest row month (cross-month disclosure)
  //   n       = row count · dsMask/catMask = datasets/categories seen (bits)
  //   kept-row rule (deterministic, content-only): prefer rows whose ibrs maps
  //   to a real category over 'other'; then lexicographic min (ibrs, desc,
  //   ymd, addr). coordKey = min "lat,lng" string over rows with usable coords
  //   (all rows of a report describe the same incident; taking the
  //   deterministic minimum maximizes honest placement).
  const incidents = new Map();
  const dsStats = []; // per dataset: {year, rows, distinct, monthly Map}
  let pulledRows = 0;

  const parseCoords = (d, r) => {
    let lat, lng;
    if (d.loc === "latlng") {
      lat = Number(r.latitude);
      lng = Number(r.longitude);
    } else if (d.loc === "locobj") {
      lat = Number(r.loc?.latitude);
      lng = Number(r.loc?.longitude);
    } else {
      const c = r.loc?.coordinates;
      lng = Number(c?.[0]);
      lat = Number(c?.[1]);
    }
    // usable = finite and in a generous KC-region sanity window (rejects the
    // (0,0) sentinel and gross geocode junk; fine placement is the polygons')
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < 38.4 || lat > 39.8 || lng < -95.3 || lng > -93.9) return null;
    return `${lat.toFixed(6)},${lng.toFixed(6)}`;
  };

  for (const d of YEARS) {
    const sel =
      `${d.rep} AS rep,${d.date} AS dt,ibrs,description,address` +
      (d.loc === "latlng" ? ",latitude,longitude" : `,${d.locField} AS loc`);
    const monthly = new Map(); // ym → Set(rep) — mirrors server per-month DISTINCT
    let dsRows = 0;
    const dsReps = new Set();
    for (let offset = 0; ; offset += 50000) {
      const page = await getJSON(
        soda(d.id, { $select: sel, $order: ":id", $limit: "50000", $offset: String(offset) }),
        { label: `pull ${d.year} @${offset}` },
      );
      for (const r of page) {
        dsRows++;
        const rep = String(r.rep ?? "").trim();
        assert(rep.length > 0, `pull ${d.year}: missing report number`);
        const ymd = String(r.dt ?? "").slice(0, 10);
        assert(/^\d{4}-\d{2}-\d{2}$/.test(ymd), `pull ${d.year}: bad date '${r.dt}'`);
        const ym = ymd.slice(0, 7);
        const code = r.ibrs == null ? null : String(r.ibrs).trim().toUpperCase();
        const cat = CAT_OF(code) ?? fail(`pull ${d.year}: unmapped ibrs '${r.ibrs}'`);
        const desc = r.description == null ? "" : String(r.description).trim();
        const addr = r.address == null ? "" : String(r.address).replace(/\s+/g, " ").trim();
        const coordKey = parseCoords(d, r);
        dsReps.add(rep);
        if (!monthly.has(ym)) monthly.set(ym, new Set());
        monthly.get(ym).add(rep);

        const catBit = 1 << CAT_KEYS.indexOf(cat);
        const dsBit = 1 << (d.year - 2015);
        const rankOther = cat === "other" ? 1 : 0;
        const cur = incidents.get(rep);
        if (!cur) {
          incidents.set(rep, {
            ymd,
            maxYm: ym,
            n: 1,
            dsMask: dsBit,
            catMask: catBit,
            kOther: rankOther,
            kIbrs: code ?? "~",
            kDesc: desc,
            kYmd: ymd,
            kAddr: addr,
            kCat: cat,
            coordKey,
          });
        } else {
          cur.n++;
          cur.dsMask |= dsBit;
          cur.catMask |= catBit;
          if (ymd < cur.ymd) cur.ymd = ymd;
          if (ym > cur.maxYm) cur.maxYm = ym;
          if (coordKey !== null && (cur.coordKey === null || coordKey < cur.coordKey)) cur.coordKey = coordKey;
          // deterministic kept row: (other-last, ibrs, desc, ymd, addr) minimum
          const ib = code ?? "~";
          const better =
            rankOther < cur.kOther ||
            (rankOther === cur.kOther &&
              (ib < cur.kIbrs ||
                (ib === cur.kIbrs &&
                  (desc < cur.kDesc ||
                    (desc === cur.kDesc && (ymd < cur.kYmd || (ymd === cur.kYmd && addr < cur.kAddr)))))));
          if (better) {
            cur.kOther = rankOther;
            cur.kIbrs = ib;
            cur.kDesc = desc;
            cur.kYmd = ymd;
            cur.kAddr = addr;
            cur.kCat = cat;
          }
        }
      }
      if (page.length < 50000) break;
    }
    pulledRows += dsRows;
    // INDEPENDENT per-dataset reconciliation: server row count + per-month
    // COUNT(DISTINCT report) must equal the client pull exactly.
    const [{ n: srvRows }] = await getJSON(soda(d.id, { $select: "count(*) AS n" }), {
      label: `count ${d.year}`,
    });
    assert(Number(srvRows) === dsRows, `${d.year}: server rows ${srvRows} != pulled ${dsRows}`);
    const srvMonthly = await getJSON(
      soda(d.id, {
        $select: `date_trunc_ym(${d.date}) AS m, count(distinct ${d.rep}) AS n`,
        $group: "m",
        $order: "m",
        $limit: "2000",
      }),
      { label: `distinct ${d.year}` },
    );
    assert(srvMonthly.length === monthly.size, `${d.year}: month-group count mismatch`);
    for (const r of srvMonthly) {
      const ym = String(r.m).slice(0, 7);
      const clientN = monthly.get(ym)?.size ?? -1;
      assert(Number(r.n) === clientN, `${d.year} ${ym}: server distinct ${r.n} != client ${clientN}`);
    }
    dsStats.push({ year: d.year, id: d.id, rows: dsRows, distinct: dsReps.size });
    console.log(
      `  ${d.year} (${d.id}): ${fmt(dsRows)} rows → ${fmt(dsReps.size)} distinct reports ` +
        `(×${(dsRows / dsReps.size).toFixed(2)}) — server row+distinct reconciliation ✓`,
    );
  }
  // union arithmetic: Σ per-dataset distinct == Σ over reports of #datasets seen
  const popcount = (x) => {
    let c = 0;
    while (x) (c += x & 1), (x >>>= 1);
    return c;
  };
  let dsAppearances = 0,
    crossDatasetReports = 0;
  for (const v of incidents.values()) {
    const p = popcount(v.dsMask);
    dsAppearances += p;
    if (p > 1) crossDatasetReports++;
  }
  const sumDistinct = dsStats.reduce((s, d) => s + d.distinct, 0);
  assert(sumDistinct === dsAppearances, `union arithmetic: Σdistinct ${sumDistinct} != Σappearances ${dsAppearances}`);
  console.log(
    `  ${fmt(pulledRows)} rows total → ${fmt(incidents.size)} globally deduped reports ` +
      `(×${(pulledRows / incidents.size).toFixed(2)} inflation; ${fmt(crossDatasetReports)} reports appear in >1 yearly dataset)`,
  );

  // ---- 4. Window partition (junk-dated / in-window / partial month) --------
  console.log("── Window partition (bin month = earliest report_date)");
  let junkIncidents = 0,
    postIncidents = 0;
  const windowIncidents = [];
  for (const [rep, v] of incidents.entries()) {
    const ym = v.ymd.slice(0, 7);
    if (ym < SPAN_START_YM) junkIncidents++;
    else if (ym > SPAN_END_YM) postIncidents++;
    else windowIncidents.push({ rep, ...v });
  }
  const totalRecords = windowIncidents.length;
  assert(junkIncidents + totalRecords + postIncidents === incidents.size, "incident partition != union");
  // dedupe disclosure stats (window)
  let multiRowReports = 0,
    crossCatReports = 0,
    crossMonthReports = 0;
  for (const v of windowIncidents) {
    if (v.n > 1) multiRowReports++;
    if (popcount(v.catMask) > 1) crossCatReports++;
    if (v.maxYm !== v.ymd.slice(0, 7)) crossMonthReports++;
  }
  console.log(
    `  union ${fmt(incidents.size)} = ${fmt(junkIncidents)} junk-dated pre-2015 + ${fmt(totalRecords)} in-window + ` +
      `${fmt(postIncidents)} partial-2026-07`,
  );
  console.log(
    `  dedupe: ${fmt(multiRowReports)} reports had >1 involvement row; ${fmt(crossCatReports)} spanned categories ` +
      `(kept: prefer-classified deterministic min), ${fmt(crossMonthReports)} spanned months (binned at earliest)`,
  );

  // ---- 5. Spatial join + timeline binning ----------------------------------
  console.log("── Spatial join (point-in-polygon vs official neighborhoods) + timeline binning");
  const cells = {};
  for (const k of HOODS)
    cells[k] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  const junkByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  const cityByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  const keptCodeTotals = new Map(); // kept ibrs code|NULL → incident count
  let noCoords = 0,
    coordsOutsidePolys = 0;
  for (const v of windowIncidents) {
    const mi = MONTH_IDX.get(v.ymd.slice(0, 7));
    assert(mi !== undefined, `bin: month ${v.ymd} outside span`);
    const cat = v.kCat;
    cityByCatMonth[cat][mi]++;
    catTotals[cat]++;
    const codeKey = v.kIbrs === "~" ? "NULL" : v.kIbrs;
    keptCodeTotals.set(codeKey, (keptCodeTotals.get(codeKey) || 0) + 1);
    let hood = null;
    if (v.coordKey === null) noCoords++;
    else {
      const [lat, lng] = v.coordKey.split(",").map(Number);
      hood = hoodOf(lng, lat);
      if (hood === null) coordsOutsidePolys++;
    }
    v.hood = hood;
    v.mi = mi;
    if (hood !== null) cells[hood][mi][cat]++;
    else junkByCatMonth[cat][mi]++;
  }
  // Identity: placed + unplaced == citywide, per cat per month
  for (const cat of CAT_KEYS) {
    for (let mi = 0; mi < MONTHS.length; mi++) {
      let placed = 0;
      for (const k of HOODS) placed += cells[k][mi][cat];
      assert(
        placed + junkByCatMonth[cat][mi] === cityByCatMonth[cat][mi],
        `month ${MONTHS[mi]} cat ${cat}: placed+unplaced != citywide`,
      );
    }
  }
  assert(CAT_KEYS.reduce((s, c) => s + catTotals[c], 0) === totalRecords, "catTotals != totalRecords");
  console.log(`  placed + unplaced == citywide for all ${MONTHS.length} months × 4 cats ✓`);

  let placedRecords = 0;
  for (const k of HOODS)
    for (const cc of cells[k]) placedRecords += cc.persons + cc.property + cc.society + cc.other;
  const noNeighborhood = CAT_KEYS.reduce((s, c) => s + junkByCatMonth[c].reduce((a, b) => a + b, 0), 0);
  const unplacedRecords = noNeighborhood;
  assert(placedRecords + unplacedRecords === totalRecords, "placed+unplaced != total");
  assert(noCoords + coordsOutsidePolys === unplacedRecords, "unplaced decomposition mismatch");
  assert(placedRecords / totalRecords > 0.5, "spatial join broke: <50% placement");
  const coveragePct = Math.round((placedRecords / totalRecords) * 1000) / 10;
  console.log(
    `  total ${fmt(totalRecords)} incidents = placed ${fmt(placedRecords)} + unplaced ${fmt(unplacedRecords)} ` +
      `(${fmt(noCoords)} without coords + ${fmt(coordsOutsidePolys)} coords outside any named polygon) → coverage ${coveragePct}%`,
  );

  // ---- 6. Sampled REAL points ----------------------------------------------
  console.log("── Real incident points (KCPD block-level addresses; deterministic sample)");
  const sorted = windowIncidents
    .slice()
    .sort((a, b) => (a.ymd < b.ymd ? -1 : a.ymd > b.ymd ? 1 : a.rep < b.rep ? -1 : 1));
  const byMonth = MONTHS.map(() => []);
  let placeableCount = 0,
    outOfBbox = 0;
  for (const v of sorted) {
    if (v.coordKey === null) continue;
    const [lat, lng] = v.coordKey.split(",").map(Number);
    if (lat < BBOX.latMin || lat > BBOX.latMax || lng < BBOX.lngMin || lng > BBOX.lngMax) {
      outOfBbox++;
      continue;
    }
    placeableCount++;
    byMonth[v.mi].push([Number(lng.toFixed(6)), Number(lat.toFixed(6)), CAT_KEYS.indexOf(v.kCat)]);
  }
  const pts = byMonth.map((arr) => {
    if (arr.length <= 100) return arr;
    const out = [];
    for (let i = 0; i < 100; i++) out.push(arr[Math.floor((i * arr.length) / 100)]);
    return out;
  });
  const ptsKept = pts.reduce((s, a) => s + a.length, 0);
  const sampleRate = Math.round(placeableCount / ptsKept);
  console.log(
    `  ${fmt(placeableCount)} incidents with in-box coords (${fmt(noCoords)} no-coords, ${fmt(outOfBbox)} outside ` +
      `plot box — counted, not plotted), kept ${fmt(ptsKept)} → 1 per ~${sampleRate}`,
  );

  // ---- 7. Dispatch feed ------------------------------------------------------
  // 8 real incidents per quarter, deterministic even-stride across the
  // quarter's chronologically-sorted PLACED incidents (no severity bias).
  console.log("── Feed: 8 real incidents per quarter, 2015-Q1 … 2026-Q2 (even-stride)");
  const feed = [];
  for (let y = 2015; y <= 2026; y++) {
    for (let q = 0; q < 4; q++) {
      const qMonths = [0, 1, 2].map((k) => `${y}-${String(q * 3 + 1 + k).padStart(2, "0")}`);
      if (MONTH_IDX.get(qMonths[0]) === undefined) continue;
      const pool = sorted.filter((v) => v.hood != null && qMonths.includes(v.ymd.slice(0, 7)));
      assert(pool.length >= 8, `feed ${y}Q${q + 1}: only ${pool.length} placed incidents`);
      for (let i = 0; i < 8; i++) {
        const v = pool[Math.floor((i * pool.length) / 8)];
        const nibrsName = v.kIbrs !== "~" ? NIBRS[v.kIbrs]?.[1] : null;
        feed.push({
          date: v.ymd,
          title: v.kDesc || nibrsName || "OFFENSE (unspecified)",
          place: v.kAddr || v.hood,
          beat: v.hood,
          cat: v.kCat,
        });
      }
    }
  }
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`  ${feed.length} feed items (chronological, no seriousness bias)`);

  // ---- 8. FBI UCR history 1985–2014 -----------------------------------------
  console.log(
    `── FBI CDE history (${ORI}, 1985–2014, key=${FBI_KEY === "DEMO_KEY" ? "DEMO_KEY" : "FBI_API_KEY"})`,
  );
  async function fetchAnnual(offense) {
    const url = `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/${offense}?from=${HIST_FROM}&to=${HIST_TO}&API_KEY=${FBI_KEY}`;
    let rateLimitRetries = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      const r = await fetch(url);
      if (r.status === 429) {
        if (rateLimitRetries++ >= 2) break;
        console.warn(`  429 rate-limited (${offense}); waiting 60s…`);
        await sleep(60000);
        continue;
      }
      if (r.status >= 500) {
        console.warn(`  HTTP ${r.status} (${offense}); waiting 20s…`);
        await sleep(20000);
        continue;
      }
      if (!r.ok) throw new Error(`FBI ${offense}: HTTP ${r.status}`);
      const j = await r.json();
      const actuals = j?.offenses?.actuals;
      if (!actuals) throw new Error(`FBI ${offense}: no actuals in response`);
      // The response has BOTH "… Offenses" and "… Clearances" series — take
      // the agency's Offenses series, never Clearances or United States.
      const agKey = Object.keys(actuals).find(
        (k) => /Kansas City/i.test(k) && /Offenses/i.test(k) && !/United States/i.test(k),
      );
      if (!agKey)
        throw new Error(`FBI ${offense}: no Kansas City Offenses series (keys: ${Object.keys(actuals)})`);
      const monthly = actuals[agKey] || {};
      const byYear = {},
        monthsSeen = {};
      for (const [mk, v] of Object.entries(monthly)) {
        if (v === null || v === undefined) continue;
        const y = Number(mk.split("-")[1]);
        byYear[y] = (byYear[y] || 0) + Number(v);
        monthsSeen[y] = (monthsSeen[y] || 0) + 1;
      }
      return { byYear, monthsSeen };
    }
    throw new Error(
      `FBI ${offense}: still rate-limited after 2 retries. Get a free key at https://api.data.gov/signup/ and set FBI_API_KEY.`,
    );
  }
  const violent = await fetchAnnual("violent-crime");
  const property = await fetchAnnual("property-crime");
  const droppedYears = [];
  const years = [];
  for (let y = 1985; y <= 2014; y++) {
    const vm = violent.monthsSeen[y] || 0,
      pm = property.monthsSeen[y] || 0;
    if (vm !== 12 || pm !== 12) {
      droppedYears.push({ year: y, violentMonths: vm, propertyMonths: pm });
      continue;
    }
    const v = violent.byYear[y],
      p = property.byYear[y];
    years.push({ year: y, violent: v, property: p, total: v + p });
  }
  assert(years.length > 0, "FBI history: no complete years");
  const yearMin = years[0].year,
    yearMax = years[years.length - 1].year;
  years.forEach((yr, i) => {
    assert(yr.year === yearMin + i, `FBI history: gap at ${yearMin + i} (partial year mid-span?)`);
  });
  if (droppedYears.length) console.warn(`  dropped partial years: ${JSON.stringify(droppedYears)}`);
  console.log(`  ${years.length} complete years ${yearMin}–${yearMax} (12 months each verified)`);
  // plausibility tripwire for the Offenses-vs-Clearances trap
  assert(years[0].total > 20000, `1st history year total ${years[0].total} implausibly low — wrong series?`);

  // ---- Assemble output files -------------------------------------------------
  const sourceGaps = [
    { span: "2016-12-26 … 2016-12-31", note: "final days of December missing from the 2016 yearly snapshot (rows stop 2016-12-25)" },
    { span: "2018-12-31", note: "last day of 2018 missing from the 2018 yearly snapshot (rows stop 2018-12-30)" },
    { span: "2020-12-28 … 2020-12-31", note: "final days of December missing from the 2020 yearly snapshot (rows stop 2020-12-27)" },
    { span: "2021-12-27 … 2021-12-31", note: "final days of December missing from the 2021 yearly snapshot (rows stop 2021-12-26)" },
    {
      span: "2018 → 2019 boundary",
      note:
        "KCPD records-system change: involvement-row structure changes (~2.5× → ~1.8× rows/report), ibrs completeness drops " +
        "(~0.7% → ~9–15% null through 2025), and 2019–2021 rows are ~18–24% missing coordinates — deduped incident counts are " +
        "the comparable series; the 'other' category and unplaced share rise accordingly and are disclosed, never patched",
    },
  ];
  const timeline = { months: MONTHS, cells };
  const beatsFile = { cats: CATS, beats };
  const summary = {
    slug: "kansas-city-mo",
    title: "Kansas City · MO",
    source: {
      records: `${DOMAIN}/resource/${YEARS[YEARS.length - 1].id}.json`,
      beats: NBHD_URL,
      hub: `${DOMAIN}/d/${YEARS[YEARS.length - 1].id}`,
    },
    yearlyDatasets: Object.fromEntries(YEARS.map((d) => [d.year, d.id])),
    fetchedAt,
    dateMin: "2015-01-01",
    dateMax: "2026-06-30",
    months: MONTHS.length,
    totalRecords,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: { "no-coordinates": noCoords, "coords-outside-named-neighborhoods": coordsOutsidePolys },
    excludedOutsideWindow: { "junk-dated-pre-2015": junkIncidents, "partial-2026-07": postIncidents },
    dedupe: {
      method: "report number (global across all 12 yearly datasets)",
      involvementRows: pulledRows,
      incidents: incidents.size,
      windowIncidents: totalRecords,
      crossDatasetReports,
      note:
        "source rows are per-involvement (VIC/SUS/ARR/…); incidents are distinct report numbers " +
        "(server COUNT DISTINCT == client dedupe, verified per dataset and per month)",
    },
    sourceGaps,
    catTotals,
    cats: CATS,
    beatCount: Object.keys(beats).length,
  };
  const history = {
    era: "history",
    taxonomy:
      "FBI UCR Summary (Violent + Property) — a different taxonomy than the KCPD NIBRS-coded incidents used from 2015; the two eras bridge at 2015 and are never equated",
    agency: AGENCY,
    ori: ORI,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      `Annual totals are real UCR Summary counts fetched from the FBI CDE summarized agency endpoint for ORI ${ORI} ` +
      `(12 reported months verified per year; the "Offenses" series is matched explicitly — the response also carries a ` +
      `"Clearances" series). UCR Summary (Violent/Property) and KCPD NIBRS codes are different taxonomies and are presented ` +
      `as distinct eras; neighborhood-level detail exists only from 2015 (the yearly open datasets begin there), so the ` +
      `story bridges from citywide annual history to per-neighborhood monthly data at 2015. Reproduce with ` +
      `pipeline/sources/kansas-city-mo.mjs (set FBI_API_KEY or .secrets/fbi_api_key).` +
      (droppedYears.length ? ` Dropped partial years: ${droppedYears.map((d) => d.year).join(", ")}.` : ""),
    yearMin,
    yearMax,
    cats: {
      violent: { label: "UCR Violent (murder, rape, robbery, agg. assault)", color: "#ff2e63" },
      property: { label: "UCR Property (burglary, larceny, MV theft)", color: "#ffc233" },
    },
    years,
  };
  const neighborhoods = {
    source: "Kansas City Neighborhood Borders (official, 240 named polygons)",
    sourceUrl: NBHD_URL,
    hub: `${DOMAIN}/d/q45j-ejyk`,
    fetchedAt,
    license: "not stated on the asset (Socrata provenance 'official') — attribution City of Kansas City, Missouri",
    method:
      "spatial join — each incident's KCPD-published block-level coordinates are point-in-polygon tested (even-odd, holes honored) " +
      "against the official neighborhood polygons; incidents without usable coordinates or outside every named polygon stay " +
      "unplaced and are disclosed (6 unnamed filler areas in the source layer carry no neighborhood name)",
    map: Object.fromEntries(Object.keys(beats).map((k) => [k, { name: k, approx: false }])),
  };
  const points = {
    mode: "real-sample",
    note:
      "Every dot is a real reported incident location as published by KCPD (block-level addresses geocoded by the source; " +
      "the exact block is shown, never an exact address and never synthesized). Incidents without usable coordinates " +
      "(~20% of 2019–2021 rows, ~0–3% other years, plus the (0,0) sentinel) are counted in every total but not plotted. " +
      "One dot per deduped incident, deterministic even-stride sample (≤100/month).",
    coordPrecision: "block-level source geocoding (4–6 decimal places depending on year)",
    sampleRate,
    months: MONTHS,
    pts,
  };

  // ---- VALIDATE (fail loudly) -------------------------------------------------
  console.log("── Validation");
  assert(
    MONTHS.length === 138 && MONTHS[0] === "2015-01" && MONTHS[137] === "2026-06",
    "months not contiguous 2015-01..2026-06",
  );
  for (let i = 1; i < MONTHS.length; i++) {
    const [py, pm] = MONTHS[i - 1].split("-").map(Number);
    const [cy, cm] = MONTHS[i].split("-").map(Number);
    assert(
      (cm === pm + 1 && cy === py) || (cm === 1 && pm === 12 && cy === py + 1),
      `months not contiguous at ${MONTHS[i]}`,
    );
  }
  assert(Object.keys(beats).length === 240, "beatCount != 240");
  for (const k of Object.keys(cells)) {
    assert(beats[k], `cells key '${k}' has no beat polygon`);
    assert(cells[k].length === MONTHS.length, `cells['${k}'] length != ${MONTHS.length}`);
  }
  for (const k of Object.keys(beats)) assert(cells[k], `beat '${k}' missing from cells`);
  assert(pts.length === MONTHS.length, "points.pts not aligned with months");
  for (const monthArr of pts)
    for (const [lng, lat, ci] of monthArr) {
      assert(
        lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax,
        `point out of bbox: ${lng},${lat}`,
      );
      assert(ci >= 0 && ci <= 3, `bad catIdx ${ci}`);
    }
  assert(history.years.length === yearMax - yearMin + 1, "history years not contiguous");
  for (const f of feed) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(f.date), `feed bad date ${f.date}`);
    assert(f.date >= "2015-01-01" && f.date <= "2026-06-30", `feed date out of span ${f.date}`);
    assert(HOODS.has(f.beat), `feed beat '${f.beat}' not a neighborhood`);
  }
  const recomputedCoverage = Math.round((placedRecords / totalRecords) * 1000) / 10;
  assert(recomputedCoverage === summary.coveragePct, "coveragePct mismatch on recompute");
  for (const [name, obj] of Object.entries({
    timeline,
    beatsFile,
    summary,
    history,
    neighborhoods,
    points,
    feed,
  }))
    scanFinite(obj, name);

  // ---- Write ------------------------------------------------------------------
  const files = {
    "beats.json": beatsFile,
    "timeline.json": timeline,
    "feed.json": feed,
    "summary.json": summary,
    "history.json": history,
    "neighborhoods.json": neighborhoods,
    "points.json": points,
  };
  for (const [name, obj] of Object.entries(files)) {
    const p = resolve(OUT_DIR, name);
    writeFileSync(
      p,
      name === "summary.json" || name === "history.json" || name === "neighborhoods.json"
        ? JSON.stringify(obj, null, 2)
        : JSON.stringify(obj),
    );
    const kb = Math.round(readFileSync(p).length / 1024);
    console.log(`  wrote normalized/${name} (${kb} KB)`);
    assert(kb < 4096, `${name} exceeds 4MB`);
  }

  writeProvenance({
    fetchedAt,
    summary,
    history,
    droppedYears,
    placeableCount,
    outOfBbox,
    noCoords,
    coordsOutsidePolys,
    ptsKept,
    sampleRate,
    catTotals,
    keptCodeTotals,
    dsStats,
    junkIncidents,
    postIncidents,
    pulledRows,
    incidentsUnion: incidents.size,
    crossDatasetReports,
    multiRowReports,
    crossCatReports,
    crossMonthReports,
  });
  appendWiki({ summary, history });

  console.log("\n── Final summary.json");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nVALIDATION PASS");
}

// ---- PROVENANCE.md -----------------------------------------------------------
function writeProvenance({
  fetchedAt,
  summary,
  history,
  droppedYears,
  placeableCount,
  outOfBbox,
  noCoords,
  coordsOutsidePolys,
  ptsKept,
  sampleRate,
  catTotals,
  keptCodeTotals,
  dsStats,
  junkIncidents,
  postIncidents,
  pulledRows,
  incidentsUnion,
  crossDatasetReports,
  multiRowReports,
  crossCatReports,
  crossMonthReports,
}) {
  const dsTable = dsStats
    .map(
      (d) =>
        `| ${d.year} | \`${d.id}\` | ${fmt(d.rows)} | ${fmt(d.distinct)} | ×${(d.rows / d.distinct).toFixed(2)} |`,
    )
    .join("\n");
  const codeRows = [...keptCodeTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => {
      const [cat, name] = code === "NULL" ? ["other", "no NIBRS code in source (null)"] : NIBRS[code];
      return `| ${code} | ${name} | \`${cat}\` | ${fmt(n)} |`;
    })
    .join("\n");
  const md = `# Provenance — Kansas City, MO

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records (12 yearly datasets)

| Field | Value |
|-------|-------|
| Datasets | **KCPD Crime Data 2015 … 2026** — 12 Socrata yearly datasets on data.kcmo.org (table below) |
| Publisher | Kansas City, Missouri Police Department, via data.kcmo.org (attribution "KCPD Information Technology") |
| Fetched | ${fetchedAt} |
| License | **Public Domain** on the 2018–2026 assets; the 2015, 2016 and 2017 assets carry **no license field** (disclosed — attributed to KCPD; the city portal publishes them as official KCPD data) |
| Rows used | ${fmt(pulledRows)} per-involvement rows → ${fmt(incidentsUnion)} distinct reports → **${fmt(summary.totalRecords)} in-window incidents** (2015-01-01 → 2026-06-30, binned by reporting date) |

### Yearly datasets (ids discovered via Socrata catalog search)
| Year | Socrata id | rows | distinct reports | row inflation |
|------|-----------|-----:|-----------------:|--------------:|
${dsTable}

Schemas drift across years and are handled per-year in the script: the report-number field is \`report_no\` (2015–2022, 2024) or \`report\` (2023, 2025, 2026); the reporting-date field is \`reported_date\` or \`report_date\`; coordinates arrive as numeric \`latitude\`/\`longitude\` columns (2015–2016), a Socrata location object \`location_1\`/\`location\` (2017–2020), or a GeoJSON point \`location\` (2021+).

### Per-involvement rows → incidents (dedupe, disclosed)
The datasets publish **one row per involvement** (victim/suspect/arrestee/…) per report — ×${(pulledRows / incidentsUnion).toFixed(2)} average row inflation. Following the datasets' own report-number key:
- ${fmt(pulledRows)} rows → **${fmt(incidentsUnion)} distinct reports** (global dedupe across all 12 datasets; ${fmt(crossDatasetReports)} reports appear in more than one yearly dataset and are counted once)
- ${fmt(multiRowReports)} in-window reports had >1 row; ${fmt(crossCatReports)} spanned multiple NIBRS categories — the kept row is a deterministic minimum that prefers NIBRS-classified rows over unclassified ones, then sorts by (code, description, date, address); ${fmt(crossMonthReports)} spanned months and are binned at the earliest reporting date
- Incident coordinates: the deterministic minimum "lat,lng" over the report's rows that carry usable coordinates (all rows of a report describe the same incident)
- **Independent reconciliation:** the server's \`COUNT(DISTINCT report)\` equals the client-side pull **for every dataset and every month**, and each dataset's server row count equals the rows pulled — validated in-script on every run

### Windowing (disclosed exclusions)
- **${fmt(junkIncidents)} junk-dated reports before 2015** (the 2022 dataset carries rows dated back to 1923 — data-entry artifacts) are excluded and counted.
- **${fmt(postIncidents)} reports dated after 2026-06-30** are excluded: 2026-07 rows stop mid-month at fetch time (last row 2026-07-13) — the granular window ends at the last FULL month, **2026-06** (measured: June has ${fmt(8706)}-row volume in line with May).
- The 2022 dataset also carries 1,302 rows dated 2015–2021 (late-entered reports) — kept, binned in their reported month, and deduped globally.

### Source gaps / regime changes (shown honestly, never patched)
| Span | What the source shows |
|------|----------------------|
| 2016-12-26 … 12-31 | final days missing from the 2016 yearly snapshot (rows stop 12-25) |
| 2018-12-31 | last day missing from the 2018 snapshot (rows stop 12-30) |
| 2020-12-28 … 12-31 | final days missing from the 2020 snapshot (rows stop 12-27) |
| 2021-12-27 … 12-31 | final days missing from the 2021 snapshot (rows stop 12-26) |
| 2018 → 2019 | KCPD records-system change: rows/report drops ~2.5× → ~1.8×, \`ibrs\` null share jumps ~0.7% → ~9–15% (through 2025), and 2019–2021 rows are ~18–24% missing coordinates. Deduped **incident** counts are the comparable series; the \`other\` share and unplaced share rise accordingly and are disclosed. |

### Fields used
report number · reporting date · \`ibrs\` (NIBRS offense code) · \`description\` · \`address\` · coordinates (per-year carrier above). Inspected but unused: \`offense\` (local code), \`area\` (patrol division), \`beat\`, involvement/demographic fields.

### Category mapping (\`ibrs\` NIBRS code → cat) — complete enumeration
Mapping follows the **NIBRS crimes-against convention** (robbery, arson, extortion and bribery are crimes against *property*; all Group B arrest-grade offenses (90A–90Z) carry victim type *Society* in NIBRS and map to \`society\`). 09C (justifiable homicide — not a crime per FBI), the local placeholder \`999\`, and null codes map to \`other\` ("${CATS.other.label}") and are never counted as Group A persons/property/society crime. Counts are deduped in-window incidents (kept rows); the in-script audit fails loudly on any unmapped code.

| ibrs | NIBRS offense | cat | incidents |
|------|---------------|-----|----------:|
${codeRows}

| cat totals | |
|---|--:|
| \`persons\` | ${fmt(catTotals.persons)} |
| \`property\` | ${fmt(catTotals.property)} |
| \`society\` | ${fmt(catTotals.society)} |
| \`other\` | ${fmt(catTotals.other)} |

### Coverage
- Placed (one of the 240 named official neighborhoods, 2015-01…2026-06): **${fmt(summary.placedRecords)}** (${summary.coveragePct}%)
- Unplaced: ${fmt(summary.unplacedRecords)} = ${fmt(noCoords)} incidents without usable coordinates + ${fmt(coordsOutsidePolys)} whose coordinates fall outside every named neighborhood polygon (the official layer contains 6 unnamed filler areas, and KCPD serves areas at the city edge) — kept in every citywide total and disclosed.
- Identity \`placed + unplaced == citywide\` validated per month × category in-script.

## Geometry source — official neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **Kansas City Neighborhood Borders** (Socrata \`vq6h-tqrf\`, provenance "official") — parent dataset of the official "Kansas City Neighborhood Boundaries" map view \`q45j-ejyk\` |
| API | ${DOMAIN}/resource/vq6h-tqrf.json |
| Features | 246 multipolygons = **240 named neighborhoods** (\`nbhname\`, all unique) + 6 unnamed filler areas (\`nbhid\` 0) that carry no neighborhood name |
| Join method | **spatial join** — point-in-polygon (even-odd rule, holes honored, full-precision rings, deterministic first-match by sorted name) of each incident's KCPD-published coordinates |
| Centroids | Area-weighted centroid across outer rings (shoelace formula) — for symbol placement only |
| License | not stated on the asset — attributed to the City of Kansas City, Missouri |

## Real incident points (\`points.json\`)

Dots are **real incident locations published by KCPD** — the source geocodes block-level addresses (e.g. "5200 EUCLID AVE"), so every dot marks a real reported incident's block, never an exact address and never synthesized. One dot per deduped incident. **${fmt(noCoords)} in-window incidents (~${Math.round((noCoords / summary.totalRecords) * 1000) / 10}%) have no usable coordinates** (null location or the (0,0) sentinel — concentrated in 2019–2021, ~18–24% of those years' rows) and ${fmt(outOfBbox)} more fall outside the plot box (lat ${BBOX.latMin}–${BBOX.latMax}, lng ${BBOX.lngMin}–${BBOX.lngMax}); all are counted in every total but not plotted, and the video says so. Deterministic sample: incidents sorted by (date, report number), even-stride ≤100/month → **${fmt(ptsKept)} points ≈ 1 per ${sampleRate} of the ${fmt(placeableCount)} placeable incidents**.

## Historical source — FBI UCR (${history.yearMin}–${history.yearMax} deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | ${AGENCY} — **ORI \`${ORI}\`** (verified via CDE agency lookup; the scout sheet's MO0460100 resolves to Mountain View PD and was rejected) |
| Endpoint | ${history.sourceUrl} (and \`/property-crime\`) |
| Series | the "Kansas City Police Department **Offenses**" series is matched explicitly — the response also carries a "Clearances" series that must never be picked |
| Span | ${history.yearMin}–${history.yearMax}, annual Violent + Property (12 reported months verified per year)${droppedYears.length ? ` — dropped partial years: ${droppedYears.map((d) => d.year).join(", ")}` : ""} |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set \`FBI_API_KEY\` or \`.secrets/fbi_api_key\`) |

UCR Summary (Violent/Property) is a **different taxonomy** than KCPD's NIBRS codes — the eras are presented as distinct and bridge at 2015; they are never equated. No monthly or neighborhood detail is implied for ${history.yearMin}–${history.yearMax}.

## Reproduce

\`\`\`bash
FBI_API_KEY=… node pipeline/sources/kansas-city-mo.mjs
\`\`\`
`;
  writeFileSync(PROV_PATH, md);
  console.log(`  wrote data/kansas-city-mo/PROVENANCE.md`);
}

// ---- wiki/Data-Provenance.md append -------------------------------------------
function appendWiki({ summary, history }) {
  if (!existsSync(WIKI_PATH)) return;
  const cur = readFileSync(WIKI_PATH, "utf8");
  if (cur.includes("## Kansas City, MO")) {
    console.log("  wiki/Data-Provenance.md already has a Kansas City section — skipped");
    return;
  }
  const section = `
## Kansas City, MO (\`kansas-city-mo\`)

- **Primary source:** **12 Socrata yearly datasets** "KCPD Crime Data 2015 …
  2026" on data.kcmo.org (ids in \`summary.yearlyDatasets\`; discovered via
  catalog search) — Public Domain on the 2018+ assets, no license field on
  2015–2017 (disclosed); attribution "KCPD Information Technology". Schemas
  drift by year (report/date/location field names) and are mapped per-year.
- **Per-involvement rows, deduped:** one row per victim/suspect/arrestee per
  report — ${fmt(summary.dedupe.involvementRows)} rows → **${fmt(summary.dedupe.incidents)} distinct reports**
  (×${(summary.dedupe.involvementRows / summary.dedupe.incidents).toFixed(2)} inflation), deduped globally across the 12 datasets
  (${fmt(summary.dedupe.crossDatasetReports)} reports span datasets). Server \`COUNT(DISTINCT report)\`
  == client dedupe per dataset **and per month**, validated in-script.
- **Spatial unit:** the **240 named official Kansas City neighborhoods**
  ("Kansas City Neighborhood Borders" \`vq6h-tqrf\`, parent of the official
  boundaries map \`q45j-ejyk\`) — placement by **point-in-polygon spatial
  join** of KCPD's block-level coordinates (holes honored; 6 unnamed filler
  areas in the layer stay nameless and unplaced).
- **Deep-history source (${history.yearMin}–${history.yearMax}):** FBI Crime Data Explorer (CDE) —
  **ORI ${ORI}** (verified via agency lookup; the scouted MO0460100 was
  Mountain View PD — wrong) — real annual Violent + Property counts,
  ${history.years.length} full years (12 reported months each, verified; "Offenses" series
  matched explicitly, never "Clearances"). Eras bridge at 2015.
- **Span:** ${history.yearMin}–${history.yearMax} (FBI UCR annual) + 2015-01-01 → 2026-06-30 (KCPD
  incidents, ${summary.months} months; 2026-07 is partial at the source and excluded).
- **Records:** ${fmt(summary.totalRecords)} in-window incidents · ${fmt(summary.placedRecords)} placed in a named
  neighborhood (**${summary.coveragePct}% coverage**) · ${fmt(summary.unplacedRecords)} unplaced
  (${fmt(summary.unplacedBeats["no-coordinates"])} without coordinates — concentrated in 2019–2021 — plus
  ${fmt(summary.unplacedBeats["coords-outside-named-neighborhoods"])} outside every named polygon), kept in totals and disclosed.
  ${fmt(summary.excludedOutsideWindow["junk-dated-pre-2015"])} junk-dated pre-2015 reports (back to 1923) excluded + disclosed.
- **Source gaps disclosed:** final December days missing from the 2016 / 2018 /
  2020 / 2021 snapshots; 2018→2019 records-system change (row structure, ibrs
  completeness, coordinate coverage) — shown as-is, never interpolated.
- **Real dots:** KCPD geocodes **block-level addresses** — dots are a
  deterministic ≤100/month sample of real block locations; no-coordinate
  incidents are counted but not plotted.
- **License:** Public Domain (2018+ assets; earlier years unstated —
  disclosed); polygons from the city's official layer (no license stated).
- **Detail:** [\`data/kansas-city-mo/PROVENANCE.md\`](../data/kansas-city-mo/PROVENANCE.md)

### Category mapping (\`ibrs\` NIBRS code → cat)

| Source value | cat |
|--------------|-----|
| 09A/09B, 100, 11A–11D, 13A–13C, 36A/36B, 64A/64B | \`persons\` |
| 120, 200, 210, 220, 23A–23H, 240, 250, 26A–26G, 270, 280, 290, 510 | \`property\` (robbery/arson/extortion/bribery = crimes against property per NIBRS) |
| 35A/35B, 370, 39A–39D, 40A–40C, 520, 720, 90A–90Z | \`society\` (Group B offenses carry victim type Society in NIBRS) |
| 09C (justifiable homicide — not a crime), 999 (local placeholder), null | \`other\` (context only — never counted as Group A) |
`;
  const marker = "## Ranked source types";
  const idx = cur.indexOf(marker);
  const next =
    idx >= 0 ? cur.slice(0, idx) + section.trimStart() + "\n" + cur.slice(idx) : cur + section;
  writeFileSync(WIKI_PATH, next);
  console.log("  appended Kansas City section to wiki/Data-Provenance.md");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
