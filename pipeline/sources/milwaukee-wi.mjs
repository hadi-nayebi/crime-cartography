// Milwaukee, WI — MPD WIBR (NIBRS) crime data source pipeline (fetch → normalize → validate).
//
// BINDING RULE: never fabricate — every figure written by this script comes
// straight from a queryable public source; every gap is disclosed.
//
// Sources:
//   Incidents  : data.milwaukee.gov (CKAN) — TWO datastore resources, CC-BY,
//                attribution "City of Milwaukee / Milwaukee Police Department":
//                  wibrarchive "NIBRS Crime Data (Historical)"
//                    395db729-a30a-4e53-ab66-faeb5e1899c8  (2005-02 … 2023-12
//                    at fetch; 263 junk pre-window rows disclosed)
//                  wibr        "NIBRS Crime Data (Current)"
//                    87843297-a6fa-46d4-ba5d-cb342fb2d3bb  (2024-01 → current)
//                SQL is POSTed as JSON to datastore_search_sql (WAF-safe, same
//                pattern as boston-ma). One row per incident (Case_Number);
//                `Offense_All` is a SEMICOLON-separated list of NIBRS offense
//                codes — the FIRST code classifies the incident (documented).
//   Polygons   : official City of Milwaukee Neighborhoods layer (190 features,
//                field NEIGHBORHD), CC-BY —
//                milwaukeemaps.milwaukee.gov/arcgis/rest/services/planning/special_districts/MapServer/4
//   History    : FBI Crime Data Explorer (CDE) summarized agency counts,
//                Milwaukee PD ORI WIMPD0000, 1985–2004 annual Violent + Property.
//                (The scouted ORI WI0410100 is Bayside PD — verified wrong; the
//                agency/byStateAbbr lookup gives WIMPD0000, verified plausible.)
//
// Eras (honesty structure):
//   1985–2004  FBI UCR annual citywide totals (no neighborhood detail implied)
//   2005-02 → 2026-05  MPD WIBR incidents, placed into the 190 official
//                neighborhoods by point-in-polygon of the REAL published
//                coordinates (spatial join — the crime file has no
//                neighborhood field). 2026-06/07 are still filling at fetch
//                (supervisor-review lag) — excluded and disclosed.
//
//   node pipeline/sources/milwaukee-wi.mjs        (set FBI_API_KEY to avoid DEMO_KEY limits)
//
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const OUT_DIR = resolve(repoRoot, "data/milwaukee-wi/normalized");
const RAW_DIR = resolve(repoRoot, "data/milwaukee-wi/raw");
const PROV_PATH = resolve(repoRoot, "data/milwaukee-wi/PROVENANCE.md");
const WIKI_PATH = resolve(repoRoot, "wiki/Data-Provenance.md");

const CKAN = "https://data.milwaukee.gov/api/3/action";
const SQL_API = `${CKAN}/datastore_search_sql`;
const HUB_CUR = "https://data.milwaukee.gov/dataset/wibr";
const HUB_ARCH = "https://data.milwaukee.gov/dataset/wibrarchive";
const RES = {
  arch: "395db729-a30a-4e53-ab66-faeb5e1899c8", // wibrarchive (historical)
  cur: "87843297-a6fa-46d4-ba5d-cb342fb2d3bb", // wibr (current)
};
const RES_LABELS = ["arch", "cur"];
const GIS_URL =
  "https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/planning/special_districts/MapServer/4/query?where=1%3D1&outFields=*&f=geojson&outSR=4326";
const GIS_HUB =
  "https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/planning/special_districts/MapServer/4";
const ORI = "WIMPD0000"; // verified: WI0410100 (scouted) is Bayside PD, not MPD
const AGENCY = "Milwaukee Police Department";
const FBI_KEY = process.env.FBI_API_KEY || "DEMO_KEY";

// Granular window: first full month of the archive (2005-01 has only 4 junk
// rows; real data starts 2005-02) → last month MPD has finished filling.
// 2026-06 (2,316 rows vs a ~3,000 trend) and 2026-07 (partial) are still in
// supervisor review at fetch — excluded and disclosed with measured counts.
const YM_START = "2005-02"; // inclusive
const YM_END = "2026-05"; // inclusive
const HIST_FROM = "01-1985";
const HIST_TO = "12-2004";

const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff2e63" },
  property: { label: "Crimes Against Property", color: "#ffc233" },
  society: { label: "Crimes Against Society", color: "#34e0e0" },
  other: { label: "Group B / other offenses (context)", color: "#7486a0" },
};
const CAT_KEYS = ["persons", "property", "society", "other"]; // catIdx order

// ---- NIBRS offense code → { name, cat } ------------------------------------
// The FIRST code of the semicolon-separated `Offense_All` list classifies the
// incident (documented judgment call — MPD publishes no per-incident hierarchy
// beyond list order). Crimes-against assignment follows the FBI NIBRS offense
// code list (Group A → Person/Property/Society). Group B codes (90-series) and
// 09C (justifiable homicide — "not a crime" per NIBRS) are kept as `other`
// context and never counted as Group A crime. Non-NIBRS placeholder codes seen
// in the data (999, ---, 90W/90X/90Y, 11E) → `other`, disclosed with counts.
const NIBRS = {
  // Group A — Crimes Against Persons
  "09A": ["Murder & Nonnegligent Manslaughter", "persons"],
  "09B": ["Negligent Manslaughter", "persons"],
  "100": ["Kidnapping / Abduction", "persons"],
  "11A": ["Rape", "persons"],
  "11B": ["Sodomy", "persons"],
  "11C": ["Sexual Assault With An Object", "persons"],
  "11D": ["Fondling", "persons"],
  "13A": ["Aggravated Assault", "persons"],
  "13B": ["Simple Assault", "persons"],
  "13C": ["Intimidation", "persons"],
  "36A": ["Incest", "persons"],
  "36B": ["Statutory Rape", "persons"],
  "64A": ["Human Trafficking — Commercial Sex Acts", "persons"],
  "64B": ["Human Trafficking — Involuntary Servitude", "persons"],
  // Group A — Crimes Against Property
  "120": ["Robbery", "property"],
  "200": ["Arson", "property"],
  "210": ["Extortion / Blackmail", "property"],
  "220": ["Burglary / Breaking & Entering", "property"],
  "23A": ["Pocket-Picking", "property"],
  "23B": ["Purse-Snatching", "property"],
  "23C": ["Shoplifting", "property"],
  "23D": ["Theft From Building", "property"],
  "23E": ["Theft From Coin-Operated Machine", "property"],
  "23F": ["Theft From Motor Vehicle", "property"],
  "23G": ["Theft of Motor Vehicle Parts", "property"],
  "23H": ["All Other Larceny", "property"],
  "240": ["Motor Vehicle Theft", "property"],
  "250": ["Counterfeiting / Forgery", "property"],
  "26A": ["False Pretenses / Swindle", "property"],
  "26B": ["Credit Card / ATM Fraud", "property"],
  "26C": ["Impersonation", "property"],
  "26D": ["Welfare Fraud", "property"],
  "26E": ["Wire Fraud", "property"],
  "26F": ["Identity Theft", "property"],
  "26G": ["Hacking / Computer Invasion", "property"],
  "270": ["Embezzlement", "property"],
  "280": ["Stolen Property Offense", "property"],
  "290": ["Destruction / Damage / Vandalism", "property"],
  "510": ["Bribery", "property"],
  // Group A — Crimes Against Society
  "35A": ["Drug / Narcotic Violation", "society"],
  "35B": ["Drug Equipment Violation", "society"],
  "370": ["Pornography / Obscene Material", "society"],
  "39A": ["Betting / Wagering", "society"],
  "39B": ["Operating / Promoting Gambling", "society"],
  "39C": ["Gambling Equipment Violation", "society"],
  "39D": ["Sports Tampering", "society"],
  "40A": ["Prostitution", "society"],
  "40B": ["Assisting / Promoting Prostitution", "society"],
  "40C": ["Purchasing Prostitution", "society"],
  "520": ["Weapon Law Violation", "society"],
  "720": ["Animal Cruelty", "society"],
  // NIBRS "not a crime" (Group A form, excluded from crime counts by the FBI)
  "09C": ["Justifiable Homicide (not a crime per NIBRS)", "other"],
  // Group B (arrest-level offenses — no NIBRS crimes-against category; context)
  "90A": ["Bad Checks (Group B)", "other"],
  "90B": ["Curfew / Loitering / Vagrancy (Group B)", "other"],
  "90C": ["Disorderly Conduct (Group B)", "other"],
  "90D": ["Driving Under the Influence (Group B)", "other"],
  "90E": ["Drunkenness (Group B)", "other"],
  "90F": ["Family Offense, Nonviolent (Group B)", "other"],
  "90G": ["Liquor Law Violation (Group B)", "other"],
  "90H": ["Peeping Tom (Group B)", "other"],
  "90I": ["Runaway (Group B — not a crime per NIBRS)", "other"],
  "90J": ["Trespass of Real Property (Group B)", "other"],
  "90Z": ["All Other Offenses (Group B)", "other"],
  // Non-NIBRS placeholders / local codes observed in the data (disclosed)
  "999": ["Unspecified (MPD placeholder code 999)", "other"],
  "---": ["Unspecified (MPD placeholder code ---)", "other"],
  "90W": ["Unrecognized local code 90W", "other"],
  "90X": ["Unrecognized local code 90X", "other"],
  "90Y": ["Unrecognized local code 90Y", "other"],
  "11E": ["Unrecognized local code 11E", "other"],
};
const PLACEHOLDERS = new Set(["999", "---", "90W", "90X", "90Y", "11E"]);
const unknownCodeSeen = new Map(); // codes outside NIBRS{} → other, disclosed
function catOf(rawFirstCode) {
  const code = String(rawFirstCode ?? "").trim().toUpperCase();
  const hit = NIBRS[code];
  if (hit) return { code, name: hit[0], cat: hit[1] };
  unknownCodeSeen.set(code, (unknownCodeSeen.get(code) || 0) + 1);
  return { code, name: `Unrecognized code ${code || "(blank)"}`, cat: "other" };
}
const firstCode = (offenseAll) => String(offenseAll ?? "").split(";")[0];

// Valid Milwaukee coordinate box (Address_Latitude/Address_Longitude are TEXT;
// ~1.5% blank; a handful parse outside the city box — rejected + disclosed).
const BBOX = { latMin: 42.84, latMax: 43.19, lngMin: -88.07, lngMax: -87.86 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fetchCount = 0;
async function getJSON(url, { retries = 4, retryWait = 5000, label = url, post = null } = {}) {
  for (let attempt = 0; ; attempt++) {
    if (fetchCount++ > 0) await sleep(120); // be polite: sequential + delay
    let r;
    try {
      r = await fetch(
        url,
        post
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json", "User-Agent": "crime-cartography-pipeline/1.0" },
              body: JSON.stringify(post),
            }
          : { headers: { "User-Agent": "crime-cartography-pipeline/1.0" } },
      );
    } catch (e) {
      if (attempt >= retries) throw new Error(`${label}: ${e.message}`);
      console.warn(`  network error (${label}); retry in ${retryWait}ms…`);
      await sleep(retryWait);
      continue;
    }
    if (r.status === 429 || r.status >= 500 || r.status === 403) {
      if (attempt >= retries) throw new Error(`${label}: HTTP ${r.status} after ${retries} retries`);
      console.warn(`  HTTP ${r.status} (${label}); retry in ${retryWait}ms…`);
      await sleep(retryWait);
      continue;
    }
    if (!r.ok) throw new Error(`${label}: HTTP ${r.status} ${await r.text()}`);
    const text = await r.text();
    try {
      return JSON.parse(text);
    } catch {
      if (attempt >= retries) throw new Error(`${label}: non-JSON response`);
      console.warn(`  non-JSON response (${label}); retry in ${retryWait}ms…`);
      await sleep(retryWait);
    }
  }
}

// CKAN datastore SQL — POSTed as JSON (same WAF-safe pattern as boston-ma).
async function sql(q, label) {
  const j = await getJSON(SQL_API, { post: { sql: q }, label: label || q.slice(0, 60) });
  if (!j.success) throw new Error(`${label}: CKAN error ${JSON.stringify(j.error).slice(0, 300)}`);
  return j.result.records;
}

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
const MONTHS = monthRange(YM_START, YM_END); // 256
const MONTH_IDX = new Map(MONTHS.map((m, i) => [m, i]));

function titleCase(s) {
  return String(s)
    .toLowerCase()
    .replace(/(^|[\s\-/(.])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}
const r6 = (v) => Number(Number(v).toFixed(6));

// ---- polygon geometry (area-weighted centroid, shoelace) ------------------
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

// ---- point-in-polygon core (even-odd ray casting + coarse grid index) ------
// Same approach as san-francisco-ca.mjs; the 190 neighborhood features carry
// no interior rings (asserted at load), so outer-ring testing is exact.
function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const GRID_N = 128;
function buildPip(beats) {
  const parts = [];
  for (const [name, h] of Object.entries(beats)) {
    for (const ring of h.polygon) {
      let x0 = Infinity,
        x1 = -Infinity,
        y0 = Infinity,
        y1 = -Infinity;
      for (const [x, y] of ring) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      parts.push({ hood: name, ring, bbox: [x0, y0, x1, y1] });
    }
  }
  const gx = (lng) =>
    Math.max(0, Math.min(GRID_N - 1, Math.floor(((lng - BBOX.lngMin) / (BBOX.lngMax - BBOX.lngMin)) * GRID_N)));
  const gy = (lat) =>
    Math.max(0, Math.min(GRID_N - 1, Math.floor(((lat - BBOX.latMin) / (BBOX.latMax - BBOX.latMin)) * GRID_N)));
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

function fail(msg) {
  console.error(`\nVALIDATION FAIL: ${msg}`);
  process.exit(1);
}
function assert(cond, msg) {
  if (!cond) fail(msg);
}
function scanFinite(root, rootPath = "$") {
  const stack = [[root, rootPath]];
  while (stack.length) {
    const [o, p] = stack.pop();
    if (typeof o === "number") {
      if (!Number.isFinite(o)) fail(`non-finite number at ${p}`);
    } else if (Array.isArray(o)) o.forEach((v, i) => stack.push([v, `${p}[${i}]`]));
    else if (o && typeof o === "object")
      for (const [k, v] of Object.entries(o)) stack.push([v, `${p}.${k}`]);
  }
}
const zeroCatMonths = () => Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));

// ============================================================================
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(RAW_DIR, { recursive: true });
  const fetchedAt = new Date().toISOString();

  // ---- 0. Package metadata: license + resource wiring (loud on change) ------
  console.log("── CKAN packages (wibr + wibrarchive)");
  const pkgCur = await getJSON(`${CKAN}/package_show?id=wibr`, { label: "package_show wibr" });
  const pkgArch = await getJSON(`${CKAN}/package_show?id=wibrarchive`, { label: "package_show wibrarchive" });
  assert(pkgCur.success && pkgArch.success, "package_show failed");
  assert(pkgCur.result.license_id === "cc-by", `wibr license changed: ${pkgCur.result.license_id}`);
  assert(pkgArch.result.license_id === "cc-by", `wibrarchive license changed: ${pkgArch.result.license_id}`);
  assert(
    pkgCur.result.resources.some((r) => r.id === RES.cur && r.datastore_active),
    "wibr datastore resource id changed",
  );
  assert(
    pkgArch.result.resources.some((r) => r.id === RES.arch && r.datastore_active),
    "wibrarchive datastore resource id changed",
  );
  console.log(`  wibr="${pkgCur.result.title}" · wibrarchive="${pkgArch.result.title}" · license cc-by ✓`);

  // ---- 1. Neighborhood polygons (official, CC-BY) --------------------------
  console.log("── City of Milwaukee neighborhood polygons (spatial-join layer)");
  const gj = await getJSON(GIS_URL, { label: "neighborhoods geojson" });
  writeFileSync(resolve(RAW_DIR, "neighborhoods.geojson"), JSON.stringify(gj));
  assert(gj?.type === "FeatureCollection" && Array.isArray(gj.features), "neighborhoods: bad geojson");
  assert(gj.features.length === 190, `neighborhoods: expected 190 features, got ${gj.features.length}`);
  const beats = {};
  gj.features.forEach((f, idx) => {
    const key = f.properties?.NEIGHBORHD;
    assert(typeof key === "string" && key.length > 0, `feature ${idx}: missing NEIGHBORHD`);
    assert(!beats[key], `neighborhoods: duplicate '${key}'`);
    const g = f.geometry;
    const parts = g.type === "Polygon" ? [g.coordinates] : g.coordinates; // MultiPolygon
    for (const part of parts)
      assert(part.length === 1, `'${key}': interior ring present — PIP must handle holes`);
    const polygon = parts.map((part) => part[0].map(([lng, lat]) => [r6(lng), r6(lat)]));
    let A = 0,
      X = 0,
      Y = 0;
    for (const ring of polygon) {
      const { area, cx, cy } = ringAreaCentroid(ring);
      A += area;
      X += cx * area;
      Y += cy * area;
    }
    assert(A > 0, `neighborhood '${key}': zero area`);
    beats[key] = {
      key,
      name: titleCase(key),
      servcen: "",
      beat: idx,
      centroid: [r6(X / A), r6(Y / A)],
      polygon,
      geomType: g.type,
    };
  });
  const HOODS = Object.keys(beats);
  const pip = buildPip(beats);
  // PIP self-test: every neighborhood must be reachable — probe each feature's
  // first ring vertex nudged toward the centroid (guaranteed-interior is hard
  // for concave shapes; centroid + vertex-nudge together must hit ≥ 95%).
  let selfHit = 0;
  for (const k of HOODS) {
    const [cx, cy] = beats[k].centroid;
    if (pip(cx, cy) === k) {
      selfHit++;
      continue;
    }
    const [vx, vy] = beats[k].polygon[0][0];
    if (pip(vx + (cx - vx) * 1e-3, vy + (cy - vy) * 1e-3) === k) selfHit++;
  }
  assert(selfHit >= HOODS.length * 0.95, `PIP self-test: only ${selfHit}/${HOODS.length} hoods self-resolve`);
  console.log(`  ${HOODS.length} neighborhoods · PIP self-test ${selfHit}/${HOODS.length} ✓`);

  // ---- 2. Full-row scan of both resources (client-side PIP placement) -------
  console.log("── Full scan: every row → month × firstCode(cat) × PIP(neighborhood)");
  const cells = {};
  for (const k of HOODS)
    cells[k] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  const cityByCatMonth = zeroCatMonths(); // client tally — cross-checked in step 3
  const noCoordsByCatMonth = zeroCatMonths();
  const oobByCatMonth = zeroCatMonths(); // parseable but outside the city bbox
  const pipMissByCatMonth = zeroCatMonths(); // in-bbox but outside all 190 polygons
  const codeTotals = new Map(); // first code → window count (PROVENANCE table)
  const scanTotalByRes = { arch: 0, cur: 0 }; // all rows seen (incl. out-of-window)
  const outOfWindowMonths = new Map(); // ym → count (junk pre-window + still-filling)
  let preWindow = 0,
    postWindow = 0;
  const ptCandidates = MONTHS.map(() => []); // first ≤150 bbox-valid rows per month
  let bboxValidCount = 0;

  const PAGE = 30000;
  for (const label of RES_LABELS) {
    let lastId = 0,
      pages = 0;
    for (;;) {
      const rows = await sql(
        `SELECT "_id", substr("Incident_Date",1,7) AS ym, split_part("Offense_All",';',1) AS code, ` +
          `"Address_Latitude" AS lat, "Address_Longitude" AS lng FROM "${RES[label]}" ` +
          `WHERE "_id" > ${lastId} ORDER BY "_id" LIMIT ${PAGE}`,
        `scan ${label} p${pages}`,
      );
      pages++;
      for (const r of rows) {
        lastId = r._id;
        scanTotalByRes[label]++;
        const mi = MONTH_IDX.get(r.ym);
        if (mi === undefined) {
          if (r.ym < YM_START) preWindow++;
          else postWindow++;
          outOfWindowMonths.set(r.ym, (outOfWindowMonths.get(r.ym) || 0) + 1);
          continue;
        }
        const { code, cat } = catOf(r.code);
        codeTotals.set(code, (codeTotals.get(code) || 0) + 1);
        cityByCatMonth[cat][mi]++;
        const lat = r.lat === null || r.lat === "" ? NaN : Number(r.lat);
        const lng = r.lng === null || r.lng === "" ? NaN : Number(r.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          noCoordsByCatMonth[cat][mi]++;
          continue;
        }
        if (lat < BBOX.latMin || lat > BBOX.latMax || lng < BBOX.lngMin || lng > BBOX.lngMax) {
          oobByCatMonth[cat][mi]++;
          continue;
        }
        bboxValidCount++;
        const hood = pip(lng, lat);
        if (hood) cells[hood][mi][cat]++;
        else pipMissByCatMonth[cat][mi]++;
        if (ptCandidates[mi].length < 150)
          ptCandidates[mi].push([r6(lng), r6(lat), CAT_KEYS.indexOf(cat)]);
      }
      if (rows.length < PAGE) break;
      if (pages % 10 === 0) console.log(`  ${label}: …${scanTotalByRes[label]} rows so far`);
    }
    console.log(`  ${label}: ${scanTotalByRes[label]} rows scanned in ${pages} page(s)`);
  }
  assert(unknownCodeSeen.size === 0 || [...unknownCodeSeen.values()].reduce((a, b) => a + b, 0) < 1000,
    `unexpected unknown NIBRS codes: ${JSON.stringify([...unknownCodeSeen.entries()])}`);
  if (unknownCodeSeen.size)
    console.warn(`  unknown codes → other: ${JSON.stringify([...unknownCodeSeen.entries()])}`);

  // ---- 3. Independent reconciliation ----------------------------------------
  // (a) COUNT(*) per resource must equal the scan totals (no dropped pages).
  // (b) A server-side grouped ym×code aggregation must reproduce the client
  //     per-month per-cat citywide tallies exactly.
  console.log("── Reconciliation vs independent server-side aggregation");
  for (const label of RES_LABELS) {
    const [{ count }] = await sql(`SELECT count(*) AS count FROM "${RES[label]}"`, `count ${label}`);
    assert(
      Number(count) === scanTotalByRes[label],
      `resource ${label}: scan total ${scanTotalByRes[label]} != COUNT(*) ${count}`,
    );
    console.log(`  ${label}: COUNT(*) ${count} == scan total ✓`);
  }
  const indepByCatMonth = zeroCatMonths();
  let indepPre = 0,
    indepPost = 0;
  for (const label of RES_LABELS) {
    const rows = await sql(
      `SELECT substr("Incident_Date",1,7) AS ym, split_part("Offense_All",';',1) AS code, count(*) AS n ` +
        `FROM "${RES[label]}" GROUP BY 1,2 ORDER BY 1,2 LIMIT 32000`,
      `grouped ${label}`,
    );
    assert(rows.length < 32000, `grouped ${label}: hit the 32k page cap — page this query`);
    for (const r of rows) {
      const n = Number(r.n);
      assert(Number.isFinite(n) && n > 0, `grouped ${label}: bad count ${r.n}`);
      const mi = MONTH_IDX.get(r.ym);
      if (mi === undefined) {
        if (r.ym < YM_START) indepPre += n;
        else indepPost += n;
        continue;
      }
      indepByCatMonth[catOf(r.code).cat][mi] += n;
    }
  }
  assert(indepPre === preWindow, `pre-window mismatch: grouped ${indepPre} != scan ${preWindow}`);
  assert(indepPost === postWindow, `post-window mismatch: grouped ${indepPost} != scan ${postWindow}`);
  for (const cat of CAT_KEYS)
    for (let mi = 0; mi < MONTHS.length; mi++)
      assert(
        indepByCatMonth[cat][mi] === cityByCatMonth[cat][mi],
        `month ${MONTHS[mi]} cat ${cat}: grouped ${indepByCatMonth[cat][mi]} != scan ${cityByCatMonth[cat][mi]}`,
      );
  // per-month per-cat identity: placed + no-coords + out-of-bbox + PIP-miss == citywide
  for (const cat of CAT_KEYS) {
    for (let mi = 0; mi < MONTHS.length; mi++) {
      let placed = 0;
      for (const k of HOODS) placed += cells[k][mi][cat];
      const lhs =
        placed + noCoordsByCatMonth[cat][mi] + oobByCatMonth[cat][mi] + pipMissByCatMonth[cat][mi];
      assert(lhs === cityByCatMonth[cat][mi], `month ${MONTHS[mi]} cat ${cat}: placed+unplaced != citywide`);
    }
  }
  console.log(`  placed + unplaced == citywide == independent grouped counts, all ${MONTHS.length} months × 4 cats ✓`);

  // ---- 4. Dataset-level totals ----------------------------------------------
  const totalRecords = scanTotalByRes.arch + scanTotalByRes.cur - preWindow - postWindow;
  let placedRecords = 0;
  for (const k of HOODS)
    for (const cc of cells[k]) placedRecords += cc.persons + cc.property + cc.society + cc.other;
  const sumCM = (o) => CAT_KEYS.reduce((s, c) => s + o[c].reduce((a, b) => a + b, 0), 0);
  const noCoords = sumCM(noCoordsByCatMonth);
  const outOfBbox = sumCM(oobByCatMonth);
  const pipMiss = sumCM(pipMissByCatMonth);
  const unplacedRecords = noCoords + outOfBbox + pipMiss;
  assert(placedRecords + unplacedRecords === totalRecords, "placed+unplaced != window total");
  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  for (const c of CAT_KEYS) catTotals[c] = cityByCatMonth[c].reduce((a, b) => a + b, 0);
  assert(CAT_KEYS.reduce((s, c) => s + catTotals[c], 0) === totalRecords, "catTotals != window total");
  const coveragePct = Math.round((placedRecords / totalRecords) * 1000) / 10;
  console.log(
    `  window ${YM_START}…${YM_END}: ${totalRecords} rows = ${placedRecords} placed + ${noCoords} no-coords` +
      ` + ${outOfBbox} out-of-bbox + ${pipMiss} PIP-miss → coverage ${coveragePct}%`,
  );
  console.log(
    `  excluded out-of-window: ${preWindow} pre (junk dates) + ${postWindow} still-filling/partial` +
      ` (${[...outOfWindowMonths.entries()].sort().map(([m, n]) => `${m}:${n}`).join(", ")})`,
  );
  // duplicate Case_Number check (measured: exactly one duplicated case in wibr)
  const dupRows = await sql(
    `SELECT "Case_Number" AS c, count(*) AS n FROM "${RES.cur}" GROUP BY 1 HAVING count(*) > 1 LIMIT 100`,
    "dupe cases cur",
  );
  const dupRowsArch = await sql(
    `SELECT "Case_Number" AS c, count(*) AS n FROM "${RES.arch}" GROUP BY 1 HAVING count(*) > 1 LIMIT 100`,
    "dupe cases arch",
  );
  const dupExtra = dupRows.concat(dupRowsArch).reduce((s, r) => s + Number(r.n) - 1, 0);
  assert(dupExtra <= 5, `duplicate Case_Numbers grew: ${JSON.stringify(dupRows.concat(dupRowsArch))}`);
  const dupNote = dupRows
    .concat(dupRowsArch)
    .map((r) => `${r.c}×${r.n}`)
    .join(", ");
  console.log(`  duplicate Case_Numbers: ${dupNote || "none"} (${dupExtra} extra row(s) — counted, disclosed)`);

  // ---- 5. points.json — deterministic ≤100/month sample of REAL coordinates --
  console.log("── Real incident points (published address coordinates; deterministic sample)");
  const pts = ptCandidates.map((arr) => {
    if (arr.length <= 100) return arr;
    const out = [];
    for (let i = 0; i < 100; i++) out.push(arr[Math.floor((i * arr.length) / 100)]);
    return out;
  });
  const ptsKept = pts.reduce((s, a) => s + a.length, 0);
  const sampleRate = Math.round(bboxValidCount / ptsKept);
  console.log(`  kept ${ptsKept} of ${bboxValidCount} bbox-valid rows → 1 per ~${sampleRate}`);

  // ---- 6. Dispatch feed: 4 real items per quarter ----------------------------
  console.log("── Feed: 4 real items per quarter, 2005-Q1 … 2026-Q2");
  const feed = [];
  for (let y = 2005; y <= 2026; y++) {
    for (let q = 0; q < 4; q++) {
      const qStart = `${y}-${String(q * 3 + 1).padStart(2, "0")}`;
      const qEnd = `${y}-${String(q * 3 + 3).padStart(2, "0")}`;
      const start = qStart < YM_START ? YM_START : qStart;
      const end = qEnd > YM_END ? YM_END : qEnd;
      if (start > end || qEnd < YM_START || qStart > YM_END) continue;
      const resId = start >= "2024-01" ? RES.cur : RES.arch;
      const rows = await sql(
        `SELECT "Incident_Date" AS dt, "Offense_All" AS off, "Location_All" AS loc, ` +
          `"Address_Latitude" AS lat, "Address_Longitude" AS lng FROM "${resId}" ` +
          `WHERE substr("Incident_Date",1,7) >= '${start}' AND substr("Incident_Date",1,7) <= '${end}' ` +
          `ORDER BY "_id" LIMIT 16`,
        `feed ${y}Q${q + 1}`,
      );
      let kept = 0;
      for (const r of rows) {
        if (kept >= 4) break;
        const lat = Number(r.lat),
          lng = Number(r.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (lat < BBOX.latMin || lat > BBOX.latMax || lng < BBOX.lngMin || lng > BBOX.lngMax) continue;
        const hood = pip(lng, lat);
        if (!hood) continue;
        const { name, cat } = catOf(firstCode(r.off));
        feed.push({
          date: String(r.dt).slice(0, 10),
          title: name,
          place: r.loc ? titleCase(r.loc) : "",
          beat: hood,
          cat,
        });
        kept++;
      }
    }
  }
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`  ${feed.length} feed items (chronological, no seriousness bias)`);

  // ---- 7. FBI UCR history 1985–2004 (LAST: DEMO_KEY is aggressively limited) --
  console.log(`── FBI CDE history (${ORI}, 1985–2004, key=${FBI_KEY === "DEMO_KEY" ? "DEMO_KEY" : "FBI_API_KEY"})`);
  async function fetchAnnual(offense) {
    const url = `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/${offense}?from=${HIST_FROM}&to=${HIST_TO}&API_KEY=${FBI_KEY}`;
    const waits = [90000, 300000, 300000, 300000];
    let rateLimitRetries = 0;
    for (let attempt = 0; attempt < 10; attempt++) {
      const r = await fetch(url);
      if (r.status === 429) {
        if (rateLimitRetries >= waits.length) break;
        const w = waits[rateLimitRetries++];
        console.warn(`  429 rate-limited (${offense}); waiting ${w / 1000}s…`);
        await sleep(w);
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
      // ⚠ CDE returns BOTH "… Offenses" and "… Clearances" series — match the
      // Milwaukee *Offenses* series explicitly, never Clearances / United States.
      const agKey = Object.keys(actuals).find(
        (k) => /Milwaukee Police Department/i.test(k) && /Offenses/i.test(k) && !/United States/i.test(k),
      );
      if (!agKey)
        throw new Error(`FBI ${offense}: no Milwaukee PD Offenses series (keys: ${Object.keys(actuals)})`);
      const monthly = actuals[agKey] || {};
      const byYear = {},
        monthsSeen = {};
      for (const [mk, v] of Object.entries(monthly)) {
        if (v === null || v === undefined) continue;
        const y = Number(mk.split("-")[1]);
        byYear[y] = (byYear[y] || 0) + Number(v);
        monthsSeen[y] = (monthsSeen[y] || 0) + 1;
      }
      return { byYear, monthsSeen, monthly };
    }
    throw new Error(
      `FBI ${offense}: still rate-limited after extended backoff. Get a free key at https://api.data.gov/signup/ and set FBI_API_KEY.`,
    );
  }
  const violent = await fetchAnnual("violent-crime");
  const property = await fetchAnnual("property-crime");
  // plausibility gate (found in the buffalo build): 1985 violent must be a big-city
  // figure — the Bayside PD series (wrong ORI) totals ~1/1000 of this.
  assert(
    (violent.byYear[1985] || 0) > 1000,
    `1985 violent total ${violent.byYear[1985]} implausible for Milwaukee — wrong ORI/series?`,
  );
  const droppedYears = [];
  const years = [];
  for (let y = 1985; y <= 2004; y++) {
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

  // ---- Assemble output files -------------------------------------------------
  const timeline = { months: MONTHS, cells };
  const beatsFile = { cats: CATS, beats };
  const summary = {
    slug: "milwaukee-wi",
    title: "Milwaukee · WI",
    source: { records: SQL_API, beats: GIS_URL, hub: HUB_CUR, hubArchive: HUB_ARCH },
    fetchedAt,
    dateMin: "2005-02-01",
    dateMax: "2026-05-31",
    months: MONTHS.length,
    totalRecords,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: { "no-coords": noCoords, "out-of-bbox": outOfBbox, "pip-miss": pipMiss },
    catTotals,
    cats: CATS,
    beatCount: HOODS.length,
  };
  const history = {
    era: "history",
    taxonomy:
      "FBI UCR Summary (Violent + Property) — a different taxonomy than the MPD WIBR/NIBRS categories used from Feb 2005; the two eras bridge at 2005 and are never equated",
    agency: AGENCY,
    ori: ORI,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      `Annual totals are real UCR Summary counts fetched from the FBI CDE summarized agency endpoint for ORI ${ORI} ` +
      `(12 reported months verified per year; the "Offenses" series is matched explicitly — the response also carries ` +
      `a "Clearances" series). The commonly-listed ORI WI0410100 resolves to Bayside PD and was rejected after ` +
      `verification. UCR Summary (Violent/Property) and MPD WIBR/NIBRS are different taxonomies and are presented as ` +
      `distinct eras; neighborhood-level detail exists only from Feb 2005 (start of the WIBR archive), so the story ` +
      `bridges from citywide annual history to per-neighborhood monthly data at 2005. Reproduce with ` +
      `pipeline/sources/milwaukee-wi.mjs (set FBI_API_KEY to avoid DEMO_KEY rate limits).` +
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
    source: "City of Milwaukee Neighborhoods (official polygon layer)",
    sourceUrl: GIS_HUB,
    hub: "https://data.milwaukee.gov/",
    fetchedAt,
    license: "CC-BY (Creative Commons Attribution) — City of Milwaukee",
    method:
      "spatial join — the crime file has no neighborhood field; every record with published coordinates is assigned " +
      "by point-in-polygon of its REAL address-level coordinates into the 190 official City of Milwaukee " +
      "neighborhood polygons (NEIGHBORHD). Records without usable coordinates are counted citywide and disclosed as " +
      "unplaced, never guessed onto the map.",
    map: Object.fromEntries(HOODS.map((k) => [k, { name: titleCase(k), approx: false }])),
  };
  const points = {
    mode: "real-sample",
    note:
      "Every dot is a real reported incident address published by MPD (WIBR address-level coordinates); ~1.6% of " +
      "records have no usable coordinates and are counted but not plotted. Deterministic sample (≤100/month).",
    sampleRate,
    months: MONTHS,
    pts,
  };

  // ---- VALIDATE (fail loudly) -------------------------------------------------
  console.log("── Validation");
  assert(
    MONTHS.length === 256 && MONTHS[0] === "2005-02" && MONTHS[255] === "2026-05",
    "months not contiguous 2005-02..2026-05",
  );
  for (let i = 1; i < MONTHS.length; i++) {
    const [py, pm] = MONTHS[i - 1].split("-").map(Number);
    const [cy, cm] = MONTHS[i].split("-").map(Number);
    assert(
      (cm === pm + 1 && cy === py) || (cm === 1 && pm === 12 && cy === py + 1),
      `months not contiguous at ${MONTHS[i]}`,
    );
  }
  assert(Object.keys(beats).length === 190, "beatCount != 190");
  let zeroHoods = 0;
  for (const k of HOODS) {
    assert(cells[k], `neighborhood '${k}' missing from cells`);
    assert(cells[k].length === MONTHS.length, `cells['${k}'] length != ${MONTHS.length}`);
    const t = cells[k].reduce((s, cc) => s + cc.persons + cc.property + cc.society + cc.other, 0);
    if (t === 0) zeroHoods++;
  }
  assert(zeroHoods === 0, `${zeroHoods} neighborhoods have zero records across 21+ years — join broken?`);
  for (const k of Object.keys(cells)) assert(beats[k], `cells key '${k}' has no polygon`);
  assert(coveragePct >= 90, `coverage ${coveragePct}% < 90% — spatial join unreliable`);
  assert(pts.length === MONTHS.length, "points.pts not aligned with months");
  for (const monthArr of pts) {
    assert(monthArr.length <= 100, "points month exceeds 100");
    for (const [lng, lat, ci] of monthArr) {
      assert(
        lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax,
        `point out of bbox: ${lng},${lat}`,
      );
      assert(ci >= 0 && ci <= 3, `bad catIdx ${ci}`);
    }
  }
  assert(history.years.length === yearMax - yearMin + 1, "history years not contiguous");
  for (const f of feed) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(f.date), `feed bad date ${f.date}`);
    assert(f.date >= "2005-02-01" && f.date <= "2026-05-31", `feed date out of span ${f.date}`);
    assert(beats[f.beat], `feed beat '${f.beat}' not a neighborhood`);
    assert(CAT_KEYS.includes(f.cat), `feed bad cat ${f.cat}`);
  }
  assert(feed.length >= 300, `feed has ${feed.length} items < 300`);
  const recomputedCoverage = Math.round((placedRecords / totalRecords) * 1000) / 10;
  assert(recomputedCoverage === summary.coveragePct, "coveragePct mismatch on recompute");
  for (const [name, obj] of Object.entries({ timeline, beatsFile, summary, history, neighborhoods, points, feed }))
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
    bboxValidCount,
    ptsKept,
    sampleRate,
    catTotals,
    codeTotals,
    scanTotalByRes,
    preWindow,
    postWindow,
    outOfWindowMonths,
    noCoords,
    outOfBbox,
    pipMiss,
    dupNote,
    dupExtra,
  });
  appendWiki({ summary, history });

  console.log("\n── Final summary.json");
  console.log(JSON.stringify(summary, null, 2));

  // ---- Story numbers (for the report; all derived from validated data) ----------
  console.log("\n── Story numbers");
  const peak = years.reduce((a, b) => (b.total > a.total ? b : a));
  const y1985 = years.find((y) => y.year === 1985);
  const yLast = years[years.length - 1];
  console.log(`  history: 1985 total=${y1985?.total} · peak ${peak.year}=${peak.total} · ${yLast.year}=${yLast.total}`);
  const yearTotal = (yr, excludeOther) => {
    let s = 0;
    MONTHS.forEach((m, mi) => {
      if (!m.startsWith(String(yr))) return;
      for (const c of CAT_KEYS) if (!(excludeOther && c === "other")) s += cityByCatMonth[c][mi];
    });
    return s;
  };
  console.log(
    `  citywide 2006=${yearTotal(2006)} vs 2025=${yearTotal(2025)} (all rows); Group A only (excl. other): ` +
      `2006=${yearTotal(2006, true)} vs 2025=${yearTotal(2025, true)}`,
  );
  for (const yr of [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025])
    console.log(`  citywide ${yr}=${yearTotal(yr)}`);
  const hoodYear = (k, yr) => {
    let s = 0;
    MONTHS.forEach((m, mi) => {
      if (!m.startsWith(String(yr))) return;
      const cc = cells[k][mi];
      s += cc.persons + cc.property + cc.society + cc.other;
    });
    return s;
  };
  const top2025 = HOODS.map((k) => [k, hoodYear(k, 2025)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  console.log(`  top neighborhoods 2025: ${top2025.map(([k, n]) => `${beats[k].name}=${n}`).join(" · ")}`);
  let hiM = null,
    hiN = -1;
  MONTHS.forEach((m, mi) => {
    let s = 0;
    for (const c of CAT_KEYS) s += cityByCatMonth[c][mi];
    if (s > hiN) (hiN = s), (hiM = m);
  });
  console.log(`  highest month (whole window, all rows): ${hiM} = ${hiN}`);

  console.log("\nVALIDATION PASS");
}

// ---- PROVENANCE.md ---------------------------------------------------------------
function writeProvenance(x) {
  const {
    fetchedAt,
    summary,
    history,
    droppedYears,
    bboxValidCount,
    ptsKept,
    sampleRate,
    catTotals,
    codeTotals,
    scanTotalByRes,
    preWindow,
    postWindow,
    outOfWindowMonths,
    noCoords,
    outOfBbox,
    pipMiss,
    dupNote,
    dupExtra,
  } = x;
  const n = (v) => v.toLocaleString("en-US");
  const codeRows = [...codeTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, c]) => {
      const hit = NIBRS[code];
      const name = hit ? hit[0] : `Unrecognized code ${code}`;
      const cat = hit ? hit[1] : "other";
      return `| \`${code}\` | ${name} | \`${cat}\` | ${n(c)} |`;
    })
    .join("\n");
  const oow = [...outOfWindowMonths.entries()].sort();
  const md = `# Provenance — Milwaukee, WI

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Datasets | **wibr — NIBRS Crime Data (Current)** (resource \`${RES.cur}\`) + **wibrarchive — NIBRS Crime Data (Historical)** (resource \`${RES.arch}\`) |
| Publisher | Milwaukee Police Department, via data.milwaukee.gov (CKAN) |
| Landing pages | ${HUB_CUR} · ${HUB_ARCH} |
| API | ${SQL_API} (SQL **POSTed as JSON** — WAF-safe, same pattern as boston-ma) |
| Fetched | ${fetchedAt} |
| License | **CC-BY** (Creative Commons Attribution) — attribute "City of Milwaukee / Milwaukee Police Department" |
| Records used | ${n(summary.totalRecords)} (Incident_Date ${summary.dateMin} → ${summary.dateMax}) |
| Source caveat | Rows appear only after review by an MPD supervisor and the Records Management Division — "this approval process can take a few weeks from the reported date of the crime" (dataset notes). Recent months fill in late. |

### Resource seam (measured at fetch)

| Resource | Span (measured) | Rows |
|----------|-----------------|-----:|
| wibrarchive | 2005-02 … 2023-12 (plus ${n(preWindow)} junk-dated rows, below) | ${n(scanTotalByRes.arch)} |
| wibr | 2024-01 → 2026-07 (partial) | ${n(scanTotalByRes.cur)} |

The two resources meet at a clean seam — the archive ends 2023-12-31 and the current file begins 2024-01-01; no overlap, no cross-resource dedupe needed. One incident (${dupNote || "none"}) is published twice in wibr at fetch time (same case/date/location, re-edited offense-list order) — **${dupExtra} extra row**, counted and disclosed rather than silently patched.

### Windowing (disclosed exclusions)

- **Pre-window (${n(preWindow)} rows):** the archive contains junk-dated rows back to 1991 (259 rows across 1991–2004) plus 4 rows dated 2005-01; real coverage starts **2005-02** (3,726 rows) — the window starts there.
- **Still-filling months (${n(postWindow)} rows):** because of the supervisor-review lag, 2026-06 (${n(outOfWindowMonths.get("2026-06") || 0)} rows at fetch, ≈25% below the ~3,000/month 2026 trend) and 2026-07 (${n(outOfWindowMonths.get("2026-07") || 0)} rows, partial month) are excluded; the granular window ends at **2026-05**, the last month the source has finished filling.
- Full out-of-window tally: ${oow.map(([m, c]) => `${m} (${n(c)})`).join(", ")}${oow.length > 12 ? "" : ""}.

### Fields used

\`Case_Number\` · \`Incident_Date\` · \`Offense_All\` · \`Location_All\` · \`Address_Latitude\`/\`Address_Longitude\` (TEXT). \`Police_District\` is ~75% null in the archive and is not used; placement is a spatial join (below).

### Offense classification (\`Offense_All\` FIRST code → cat)

\`Offense_All\` is a **semicolon-separated** list of NIBRS offense codes for all offenses in the incident (the batch-1 scout note said comma — the measured delimiter is \`;\`). MPD publishes no per-incident offense hierarchy, so the **first listed code classifies the incident** — a documented judgment call applied uniformly to all ${n(summary.totalRecords)} rows. Crimes-against assignment follows the FBI NIBRS offense-code list:

- **Group A** codes → \`persons\` / \`property\` / \`society\` per the FBI classification.
- **Group B** codes (90-series: disorderly conduct, DUI, trespass, "all other offenses", …) have **no NIBRS crimes-against category** (they are arrest-level offenses) — mapped to \`other\`, labeled "${CATS.other.label}", never counted as Group A crime.
- \`09C\` justifiable homicide is "not a crime" per NIBRS → \`other\`.
- Non-NIBRS placeholder codes observed (\`999\`, \`---\`, \`90W\`, \`90X\`, \`90Y\`, \`11E\`) → \`other\`, disclosed below.

| cat | Window count |
|-----|-------------:|
| \`persons\` | ${n(catTotals.persons)} |
| \`property\` | ${n(catTotals.property)} |
| \`society\` | ${n(catTotals.society)} |
| \`other\` | ${n(catTotals.other)} |

#### Full first-code table (window counts at fetch time)

| Code | NIBRS offense | cat | Count |
|------|---------------|-----|------:|
${codeRows}

### Placement = spatial join of REAL coordinates (\`NEIGHBORHD\`)

The crime file has **no neighborhood field**. Every row with usable published coordinates is assigned by **point-in-polygon** (even-odd ray casting, exact — the polygon layer has no interior rings) into the 190 official City of Milwaukee neighborhood polygons. Nothing is approximated: the coordinates are MPD's published address-level values and the polygons are the city's official layer.

- Placed: **${n(summary.placedRecords)}** (${summary.coveragePct}%)
- Unplaced — no/blank coordinates: ${n(noCoords)} · parseable but outside the city bbox: ${n(outOfBbox)} · inside the bbox but outside all 190 polygons (rivers, port, freeway ramps, edge cases): ${n(pipMiss)} — total ${n(summary.unplacedRecords)}, **counted in every citywide total** and disclosed, never guessed onto the map.
- Identity \`placed + unplaced == citywide\` validated per month × category in-script, **and** the client-side scan is reconciled against an independent server-side grouped aggregation (month × first code) plus per-resource \`COUNT(*)\` — all three agree exactly.

## Geometry source — City of Milwaukee neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **Neighborhoods** — 190 polygons, field \`NEIGHBORHD\` (official City of Milwaukee planning layer) |
| MapServer | ${GIS_HUB} |
| License | CC-BY — City of Milwaukee (copyright text: "Milwaukee DOA.ITMD.GIS, Milwaukee DCD") |
| Join | point-in-polygon of published incident coordinates (above) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (\`points.json\`)

Coordinates are TEXT in the source; ≈1.6% of window rows are blank/unusable and get no dot — but they are still counted in every citywide total. Points shown are **real incident addresses published by MPD**, never synthesized. Client-side gate: parseable lat ${BBOX.latMin}–${BBOX.latMax}, lng ${BBOX.lngMin}–${BBOX.lngMax}. Deterministic sample: per month, first 150 bbox-valid rows in \`_id\` order, even-stride ≤100/month → **${n(ptsKept)} points ≈ 1 per ${sampleRate} of the ${n(bboxValidCount)} bbox-valid rows**.

## Historical source — FBI UCR (${history.yearMin}–${history.yearMax} deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Milwaukee Police Department — **ORI \`${ORI}\`** (verified: returns the "Milwaukee Police Department Offenses" series; the scouted ORI \`WI0410100\` resolves to **Bayside PD** and was rejected) |
| Endpoint | ${history.sourceUrl} (and \`/property-crime\`) |
| Span | ${history.yearMin}–${history.yearMax}, annual Violent + Property (12 reported months verified per year)${droppedYears.length ? ` — dropped partial years: ${droppedYears.map((d) => d.year).join(", ")}` : ""} |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set \`FBI_API_KEY\`) |

The CDE response carries both an "… Offenses" and an "… Clearances" series — the script matches the **Offenses** series explicitly and gates on a plausible 1985 violent-crime total. UCR Summary (Violent/Property) is a **different taxonomy** than MPD WIBR/NIBRS — the eras are presented as distinct and bridge at 2005; they are never equated. No monthly or neighborhood detail is implied for ${history.yearMin}–${history.yearMax}.

## Reproduce

\`\`\`bash
FBI_API_KEY=… node pipeline/sources/milwaukee-wi.mjs
\`\`\`
`;
  writeFileSync(PROV_PATH, md);
  console.log(`  wrote data/milwaukee-wi/PROVENANCE.md`);
}

// ---- wiki/Data-Provenance.md append ------------------------------------------------
function appendWiki({ summary, history }) {
  if (!existsSync(WIKI_PATH)) return;
  const cur = readFileSync(WIKI_PATH, "utf8");
  if (cur.includes("## Milwaukee, WI")) {
    console.log("  wiki/Data-Provenance.md already has a Milwaukee section — skipped");
    return;
  }
  const n = (v) => v.toLocaleString("en-US");
  const section = `
## Milwaukee, WI (\`milwaukee-wi\`)

- **Primary source:** MPD WIBR NIBRS crime data on data.milwaukee.gov (CKAN) —
  a two-resource pair: **wibrarchive** "NIBRS Crime Data (Historical)"
  (2005-02 … 2023-12) + **wibr** "NIBRS Crime Data (Current)" (2024-01 → now),
  clean seam, no overlap. **CC-BY**, attribution "City of Milwaukee / Milwaukee
  Police Department". SQL **POSTed** to datastore_search_sql (WAF-safe).
  Rows appear only after MPD supervisor + Records review (a few weeks' lag) —
  the granular window therefore ends at the last *filled* month, 2026-05.
- **Categories:** \`Offense_All\` is a **semicolon-separated** NIBRS code list;
  the FIRST code classifies the incident (documented judgment call). Group A
  codes map to persons/property/society per the FBI NIBRS list; **Group B
  (90-series) and placeholder codes → \`other\`** ("Group B / other offenses
  (context)"), never counted as Group A crime. Full code table with counts in
  [\`data/milwaukee-wi/PROVENANCE.md\`](../data/milwaukee-wi/PROVENANCE.md).
- **Spatial unit:** the **190 official City of Milwaukee neighborhoods**
  (planning layer \`special_districts/MapServer/4\`, field \`NEIGHBORHD\`, CC-BY).
  The crime file has no neighborhood field — placement is a **spatial join**:
  point-in-polygon of MPD's real published address coordinates (~98.4% usable)
  into the official polygons. Coordinate-less rows are counted citywide and
  disclosed as unplaced, never guessed.
- **Deep-history source (${history.yearMin}–${history.yearMax}):** FBI Crime Data Explorer (CDE) —
  Milwaukee PD, **ORI ${ORI}** (verified; the scouted \`WI0410100\` is Bayside PD
  and was rejected) — real annual Violent + Property counts, ${history.years.length} full years
  (12 reported months each, verified; "Offenses" series matched explicitly).
- **Span:** ${history.yearMin}–${history.yearMax} (FBI UCR annual) + 2005-02-01 → 2026-05-31 (WIBR
  with neighborhood detail, ${summary.months} months). 263 junk-dated pre-window rows and
  the still-filling 2026-06/07 months are excluded and disclosed.
- **Records:** ${n(summary.totalRecords)} in window · ${n(summary.placedRecords)} placed in a neighborhood
  (**${summary.coveragePct}% coverage**) · ${n(summary.unplacedRecords)} unplaced (no coords / out-of-bbox /
  outside all polygons), kept in totals and disclosed.
- **License:** CC-BY (incidents and polygons; City of Milwaukee).
- **Detail:** [\`data/milwaukee-wi/PROVENANCE.md\`](../data/milwaukee-wi/PROVENANCE.md)
`;
  const marker = "## Ranked source types";
  const idx = cur.indexOf(marker);
  const next = idx >= 0 ? cur.slice(0, idx) + section.trimStart() + "\n" + cur.slice(idx) : cur + section;
  writeFileSync(WIKI_PATH, next);
  console.log("  appended Milwaukee section to wiki/Data-Provenance.md");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
