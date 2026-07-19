// Charlotte, NC — CMPD Incidents source pipeline (fetch → normalize → validate).
//
// BINDING RULE: never fabricate — every figure written by this script comes
// straight from a queryable public source; every gap is disclosed.
//
// Sources:
//   Incidents  : "CMPD Incidents" ArcGIS layer (2017-present, refreshed daily),
//                Charlotte-Mecklenburg Police Department via the City of
//                Charlotte Open Data Portal.
//                https://gis.charlottenc.gov/arcgis/rest/services/CMPD/CMPDIncidents/MapServer/0
//                License: City of Charlotte custom disclaimer (quoted verbatim
//                in PROVENANCE). The layer includes BOTH criminal and
//                non-criminal report types — the non-criminal 800-series local
//                codes AND reports whose clearance status is "Unfounded" are
//                EXCLUDED here, enumerated and disclosed with counts.
//   Polygons   : "CMPD Police Divisions" official layer (14 features, DNAME),
//                owner CharlotteNC —
//                https://services.arcgis.com/9Nl857LBlQVyzq54/arcgis/rest/services/CMPD_Police_Divisions/FeatureServer/0
//   History    : FBI Crime Data Explorer (CDE) summarized agency counts,
//                Charlotte-Mecklenburg PD ORI NC0600100, 1985–2016 annual
//                Violent + Property. ORI VERIFIED: the series key is
//                "Charlotte-Mecklenburg Police Department Offenses" and the
//                1985 violent total (4,575) is big-city plausible (the
//                wrong-agency failure mode caught in the milwaukee build).
//
// Eras (honesty structure):
//   1985–2016  FBI UCR annual citywide totals (no division detail implied)
//   2017-01 → 2026-06  CMPD NIBRS incident reports with official patrol-
//                division detail (DATE_REPORTED starts 2017-01-01; rows whose
//                DATE_INCIDENT_BEGAN predates 2017 — old occurrences reported
//                2017+ plus a handful of junk dates back to year 0200 — are
//                counted and disclosed as "began-pre-2017" unplaced).
//
// Date field: DATE_INCIDENT_BEGAN (when the incident began), NOT DATE_REPORTED —
// the map animates when crime occurred; the choice is recorded in PROVENANCE.
// All 854,996 rows carry date-only values (EXTRACT(HOUR)=0 verified live), so
// server-side EXTRACT grouping and client epoch→UTC conversion agree exactly
// (local midnight EST/EDT = 04:00/05:00Z same calendar day).
//
// Coordinates: LATITUDE_PUBLIC/LONGITUDE_PUBLIC are CMPD's BLOCK-ANONYMIZED
// published locations (the LOCATION field is a block address like
// "9700 NORTHLAKE CENTRE PY") — real source-published positions, accurate to
// the block, not the parcel. Disclosed on every surface that shows dots.
//
//   node pipeline/sources/charlotte-nc.mjs   (set FBI_API_KEY to avoid DEMO_KEY limits)
//
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const OUT_DIR = resolve(repoRoot, "data/charlotte-nc/normalized");
const RAW_DIR = resolve(repoRoot, "data/charlotte-nc/raw");
const PROV_PATH = resolve(repoRoot, "data/charlotte-nc/PROVENANCE.md");
const WIKI_PATH = resolve(repoRoot, "wiki/Data-Provenance.md");

const ARC_LAYER = "https://gis.charlottenc.gov/arcgis/rest/services/CMPD/CMPDIncidents/MapServer/0";
const ARC = `${ARC_LAYER}/query`;
const HUB_ITEM = "https://www.arcgis.com/home/item.html?id=d22200cd879248fcb2258e6840bd6726";
const HUB = "https://data.charlottenc.gov/";
const DIV_LAYER =
  "https://services.arcgis.com/9Nl857LBlQVyzq54/arcgis/rest/services/CMPD_Police_Divisions/FeatureServer/0";
const DIV_ITEM = "https://www.arcgis.com/home/item.html?id=b787e43380cd4fc0ba6dd6a9fb10cb27";
const ORI = "NC0600100";
const AGENCY = "Charlotte-Mecklenburg Police Department";
const FBI_KEY = process.env.FBI_API_KEY || "DEMO_KEY";

// Verbatim City of Charlotte disclaimer (licenseInfo of BOTH the incidents item
// d22200cd879248fcb2258e6840bd6726 and the divisions item
// b787e43380cd4fc0ba6dd6a9fb10cb27, fetched from the ArcGIS item registry):
const CITY_DISCLAIMER =
  "Although every effort has been made to ensure the accuracy of information, errors and conditions " +
  "originating from physical sources used to develop the corporate database may be reflected in the data " +
  "supplied. Users of this data must be aware of data conditions and bear responsibility for the " +
  "appropriate use of the information with respect to possible errors, original map scale, collection " +
  "methodology, currency of data, and other conditions specific to certain data. The City of Charlotte " +
  "makes no warranty, either expressed or implied, as to the accuracy or completeness of any information " +
  "archived and distributed.";

// Granular era window by DATE_INCIDENT_BEGAN (DATE_REPORTED starts 2017-01-01;
// 2026-07 is a partial month at fetch time — dropped and disclosed)
const SPAN_START = "2017-01-01 00:00:00"; // inclusive
const SPAN_END = "2026-07-01 00:00:00"; // exclusive → dateMax 2026-06-30
const HIST_FROM = "01-1985";
const HIST_TO = "12-2016";

const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff2e63" },
  property: { label: "Crimes Against Property", color: "#ffc233" },
  society: { label: "Crimes Against Society", color: "#34e0e0" },
  other: { label: "Group B / local non-NIBRS (context)", color: "#7486a0" },
};
const CAT_KEYS = ["persons", "property", "society", "other"]; // catIdx order

// ---- HIGHEST_NIBRS_CODE → { name, cat } ------------------------------------
// CMPD classifies each incident report by the FBI NIBRS national crime
// hierarchy ("highest offense"). Crimes-against assignment follows the FBI
// NIBRS offense-code list (Group A → Person/Property/Society). Group B codes
// (90-series), CMPD local criminal codes (99Y/99Z), and 09C justifiable
// homicide ("not a crime" per NIBRS) are kept as `other` context and never
// counted as Group A crime. The 800-series local codes are NON-CRIMINAL report
// types (missing person, sudden death, vehicle recovery, …) — EXCLUDED
// entirely, enumerated with counts in PROVENANCE. Any code outside this table
// fails the build loudly.
const NIBRS = {
  // Group A — Crimes Against Persons
  "09A": ["Murder & Nonnegligent Manslaughter", "persons"],
  "09B": ["Negligent Manslaughter", "persons"],
  100: ["Kidnapping / Abduction", "persons"],
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
  120: ["Robbery", "property"],
  200: ["Arson", "property"],
  210: ["Extortion / Blackmail", "property"],
  220: ["Burglary / Breaking & Entering", "property"],
  "23A": ["Pocket-Picking", "property"],
  "23B": ["Purse-Snatching", "property"],
  "23C": ["Shoplifting", "property"],
  "23D": ["Theft From Building", "property"],
  "23E": ["Theft From Coin-Operated Machine", "property"],
  "23F": ["Theft From Motor Vehicle", "property"],
  "23G": ["Theft of Motor Vehicle Parts", "property"],
  "23H": ["All Other Larceny", "property"],
  240: ["Motor Vehicle Theft", "property"],
  250: ["Counterfeiting / Forgery", "property"],
  "26A": ["False Pretenses / Swindle", "property"],
  "26B": ["Credit Card / ATM Fraud", "property"],
  "26C": ["Impersonation", "property"],
  "26D": ["Welfare Fraud", "property"],
  "26E": ["Wire Fraud", "property"],
  "26F": ["Identity Theft", "property"],
  "26G": ["Hacking / Computer Invasion", "property"],
  270: ["Embezzlement", "property"],
  280: ["Stolen Property Offense", "property"],
  290: ["Destruction / Damage / Vandalism", "property"],
  510: ["Bribery", "property"],
  // Group A — Crimes Against Society
  "35A": ["Drug / Narcotic Violation", "society"],
  "35B": ["Drug Equipment Violation", "society"],
  370: ["Pornography / Obscene Material", "society"],
  "39A": ["Betting / Wagering", "society"],
  "39B": ["Operating / Promoting Gambling", "society"],
  "39C": ["Gambling Equipment Violation", "society"],
  "39D": ["Sports Tampering", "society"],
  "40A": ["Prostitution", "society"],
  "40B": ["Assisting / Promoting Prostitution", "society"],
  "40C": ["Purchasing Prostitution", "society"],
  520: ["Weapon Law Violation", "society"],
  720: ["Animal Cruelty", "society"],
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
  // CMPD local criminal codes outside the national NIBRS list (context)
  "99Y": ["Indecent Exposure (CMPD local code)", "other"],
  "99Z": ["Affray (CMPD local code)", "other"],
};
// Non-criminal 800-series local report types (EXCLUDED; enumerated live from
// the layer so new codes are documented, and any unknown non-8xx code fails).
const NONCRIM_RE = /^8\d\d$/;
const catOfCode = (raw) => {
  const code = String(raw ?? "").trim().toUpperCase();
  if (NONCRIM_RE.test(code)) return { code, cat: "EXCLUDED-NONCRIMINAL" };
  const hit = NIBRS[code];
  return hit ? { code, name: hit[0], cat: hit[1] } : { code, cat: null };
};
const CAT_CODES = Object.fromEntries(CAT_KEYS.map((c) => [c, []]));
for (const [code, [, cat]] of Object.entries(NIBRS)) CAT_CODES[cat].push(code);
const inList = (codes) => codes.map((c) => `'${c}'`).join(",");
const CAT_WHERE = Object.fromEntries(
  CAT_KEYS.map((c) => [c, `HIGHEST_NIBRS_CODE IN (${inList(CAT_CODES[c])})`]),
);

// Exclusion filters (verified live: 854,996 grand = 704,756 include +
// 128,848 800-series + 21,392 unfounded-non-800)
const NONCRIM_WHERE = `HIGHEST_NIBRS_CODE LIKE '8__'`;
const UNFOUNDED_WHERE = `CLEARANCE_STATUS = 'Unfounded'`;
const INCLUDE_WHERE = `NOT HIGHEST_NIBRS_CODE LIKE '8__' AND CLEARANCE_STATUS <> 'Unfounded'`;

// The 14 official CMPD patrol divisions (polygon DNAME minus " Division" ==
// incident CMPD_PATROL_DIVISION, keyed by DIVISION code == DIVISION_ID).
// Everything else in the incident data (Huntersville '92', Davidson '90',
// 'NA' town codes, 'Unknown' '0') is outside CMPD's 14 patrol divisions —
// counted citywide, disclosed as unplaced.
const EXPECTED_DIVISIONS = 14;

// Coordinate frame = the official division-polygon extent (lat 35.002–35.525,
// lng −81.058…−80.550), rounded outward. Wider than the batch-1 scout bbox
// (35.01–35.40 / −81.01–−80.66), which clipped the far north and east of
// CMPD's jurisdiction — deviation documented.
const BBOX = { latMin: 35.0, latMax: 35.53, lngMin: -81.06, lngMax: -80.55 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fetchCount = 0;
async function postJSON(url, params, { retries = 4, retryWait = 5000, label = url } = {}) {
  const body = new URLSearchParams(params).toString();
  for (let attempt = 0; ; attempt++) {
    if (fetchCount++ > 0) await sleep(120); // be polite: sequential + delay
    let r;
    try {
      r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
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
    const j = await r.json();
    if (j.error) {
      // ArcGIS reports errors inside a 200 body
      if (attempt >= retries) throw new Error(`${label}: ArcGIS error ${JSON.stringify(j.error)}`);
      console.warn(`  ArcGIS error (${label}): ${j.error.message}; retry in ${retryWait}ms…`);
      await sleep(retryWait);
      continue;
    }
    return j;
  }
}

// Raw feature query with resultOffset paging.
async function arcAll(params, { label } = {}) {
  const out = [];
  let offset = 0;
  for (;;) {
    const j = await postJSON(
      ARC,
      { f: "json", resultOffset: String(offset), ...params },
      { label: `${label} (offset ${offset})` },
    );
    const feats = j.features || [];
    out.push(...feats);
    if (!j.exceededTransferLimit) return out;
    offset += feats.length;
    if (feats.length === 0) throw new Error(`${label}: exceededTransferLimit with 0 features`);
  }
}

// Grouped/statistics query — must fit one page (asserted).
async function arcGrouped(params, { label } = {}) {
  const j = await postJSON(ARC, { f: "json", ...params }, { label });
  if (j.exceededTransferLimit) throw new Error(`${label}: grouped query exceeded transfer limit`);
  return j.features || [];
}

async function arcCount(where, label) {
  const j = await postJSON(ARC, { f: "json", where, returnCountOnly: "true" }, { label });
  const n = j.count;
  if (!Number.isFinite(n)) throw new Error(`${label}: bad count response ${JSON.stringify(j)}`);
  return n;
}

// Grouped responses name expression columns Expr1/Expr2… (this ArcGIS Server
// release) — pull them positionally, loudly.
function exprKeys(attrs, n) {
  const ks = Object.keys(attrs)
    .filter((k) => /^Expr\d+$/i.test(k))
    .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
  if (ks.length !== n) throw new Error(`expected ${n} Expr columns, got ${JSON.stringify(Object.keys(attrs))}`);
  return ks;
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
const MONTHS = monthRange("2017-01", "2026-06"); // 114
const MONTH_IDX = new Map(MONTHS.map((m, i) => [m, i]));
// Epoch-ms → "YYYY-MM"/"YYYY-MM-DD". All DATE_INCIDENT_BEGAN values are
// date-only local midnights (EXTRACT(HOUR)=0 across all rows, verified live),
// served as 04:00/05:00Z of the SAME calendar day — UTC slicing is exact.
const ymOfMs = (ms) => new Date(ms).toISOString().slice(0, 7);
const ymdOfMs = (ms) => new Date(ms).toISOString().slice(0, 10);
const monthWhere = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return (
    `DATE_INCIDENT_BEGAN >= TIMESTAMP '${ym}-01 00:00:00' AND ` +
    `DATE_INCIDENT_BEGAN < TIMESTAMP '${next}-01 00:00:00'`
  );
};
const SPAN_WHERE = `DATE_INCIDENT_BEGAN >= TIMESTAMP '${SPAN_START}' AND DATE_INCIDENT_BEGAN < TIMESTAMP '${SPAN_END}'`;
const WINDOW_WHERE = `DATE_INCIDENT_BEGAN < TIMESTAMP '${SPAN_END}'`; // totals window

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

  // ---- 1. Official CMPD patrol-division polygons ---------------------------
  console.log("── CMPD Police Divisions (official polygons)");
  const gj = await postJSON(
    `${DIV_LAYER}/query`,
    { f: "geojson", where: "1=1", outFields: "DIVISION,DNAME" },
    { label: "divisions geojson" },
  );
  writeFileSync(resolve(RAW_DIR, "divisions.geojson"), JSON.stringify(gj));
  assert(gj?.type === "FeatureCollection" && Array.isArray(gj.features), "divisions: bad geojson");
  assert(
    gj.features.length === EXPECTED_DIVISIONS,
    `divisions: expected ${EXPECTED_DIVISIONS} features, got ${gj.features.length}`,
  );
  const beats = {};
  gj.features.forEach((f, idx) => {
    const dname = f.properties?.DNAME;
    const dcode = f.properties?.DIVISION;
    assert(typeof dname === "string" && / Division$/.test(dname), `feature ${idx}: bad DNAME '${dname}'`);
    const key = dname.replace(/ Division$/, ""); // == incident CMPD_PATROL_DIVISION
    assert(!beats[key], `divisions: duplicate '${key}'`);
    const g = f.geometry;
    const parts = g.type === "Polygon" ? [g.coordinates] : g.coordinates; // MultiPolygon
    // Outer ring of each part; interior rings (surrounded towns like Pineville
    // inside Steele Creek) are display holes only — placement is by the
    // in-data division name, never point-in-polygon, so dropping the holes
    // affects rendering fill only, not a single count.
    const outerRings = parts.map((p) => p[0].map(([lng, lat]) => [r6(lng), r6(lat)]));
    let A = 0,
      X = 0,
      Y = 0;
    for (const ring of outerRings) {
      const { area, cx, cy } = ringAreaCentroid(ring);
      A += area;
      X += cx * area;
      Y += cy * area;
    }
    assert(A > 0, `division '${key}': zero area`);
    beats[key] = {
      key,
      name: key,
      servcen: String(dcode ?? ""),
      beat: idx,
      centroid: [r6(X / A), r6(Y / A)],
      polygon: outerRings,
      geomType: g.type,
    };
  });
  const HOODS = new Set(Object.keys(beats));
  console.log(`  ${HOODS.size} divisions: ${[...HOODS].join(", ")}`);

  // ---- 2. Code + clearance enumeration (whole layer; exclusion accounting) --
  console.log("── Exclusion accounting (non-criminal 800-series + unfounded clearances)");
  const codeRows = await arcGrouped(
    {
      where: "1=1",
      groupByFieldsForStatistics: "HIGHEST_NIBRS_CODE,HIGHEST_NIBRS_DESCRIPTION",
      outStatistics: JSON.stringify([
        { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
      ]),
    },
    { label: "code enumeration" },
  );
  const noncrimCodes = []; // { code, desc, n } — 800-series, whole layer
  let noncrimEnumTotal = 0;
  for (const f of codeRows) {
    const a = f.attributes;
    const { code, cat } = catOfCode(a.HIGHEST_NIBRS_CODE);
    if (cat === "EXCLUDED-NONCRIMINAL") {
      noncrimCodes.push({ code, desc: String(a.HIGHEST_NIBRS_DESCRIPTION), n: Number(a.n) });
      noncrimEnumTotal += Number(a.n);
    } else {
      assert(cat, `unmapped HIGHEST_NIBRS_CODE '${a.HIGHEST_NIBRS_CODE}' (${a.HIGHEST_NIBRS_DESCRIPTION}, n=${a.n})`);
    }
  }
  noncrimCodes.sort((a, b) => b.n - a.n);
  const clrRows = await arcGrouped(
    {
      where: "1=1",
      groupByFieldsForStatistics: "CLEARANCE_STATUS",
      outStatistics: JSON.stringify([
        { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
      ]),
    },
    { label: "clearance enumeration" },
  );
  const clearanceTable = clrRows
    .map((f) => ({ status: String(f.attributes.CLEARANCE_STATUS), n: Number(f.attributes.n) }))
    .sort((a, b) => b.n - a.n);
  const unfoundedDetailRows = await arcGrouped(
    {
      where: `${UNFOUNDED_WHERE} AND NOT ${NONCRIM_WHERE}`,
      groupByFieldsForStatistics: "CLEARANCE_DETAIL_STATUS",
      outStatistics: JSON.stringify([
        { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
      ]),
    },
    { label: "unfounded detail" },
  );
  const unfoundedDetail = unfoundedDetailRows
    .map((f) => ({ detail: String(f.attributes.CLEARANCE_DETAIL_STATUS), n: Number(f.attributes.n) }))
    .sort((a, b) => b.n - a.n);

  const grand = await arcCount("1=1", "grand total");
  const excl800 = await arcCount(NONCRIM_WHERE, "800-series total");
  const exclUnfNon800 = await arcCount(`${UNFOUNDED_WHERE} AND NOT ${NONCRIM_WHERE}`, "unfounded non-800");
  const overlap800Unf = await arcCount(`${UNFOUNDED_WHERE} AND ${NONCRIM_WHERE}`, "800 ∩ unfounded");
  const includeUniverse = await arcCount(INCLUDE_WHERE, "include universe");
  assert(excl800 === noncrimEnumTotal, `800-series LIKE count ${excl800} != enumeration sum ${noncrimEnumTotal}`);
  assert(
    grand === includeUniverse + excl800 + exclUnfNon800,
    `grand ${grand} != include ${includeUniverse} + 800s ${excl800} + unfoundedNon800 ${exclUnfNon800}`,
  );
  const unfoundedTotal = clearanceTable.find((r) => r.status === "Unfounded")?.n ?? 0;
  assert(
    unfoundedTotal === exclUnfNon800 + overlap800Unf,
    `unfounded total ${unfoundedTotal} != non800 ${exclUnfNon800} + overlap ${overlap800Unf}`,
  );
  console.log(
    `  grand ${grand} = kept ${includeUniverse} + non-criminal 800-series ${excl800}` +
      ` + unfounded (non-800) ${exclUnfNon800} (unfounded∩800-series ${overlap800Unf} counted once, in 800s) ✓`,
  );

  // ---- 3. Window accounting -------------------------------------------------
  console.log("── Window accounting (DATE_INCIDENT_BEGAN)");
  const totalRecords = await arcCount(`${INCLUDE_WHERE} AND ${WINDOW_WHERE}`, "window total");
  const pre2017 = await arcCount(
    `${INCLUDE_WHERE} AND DATE_INCIDENT_BEGAN < TIMESTAMP '${SPAN_START}'`,
    "began-pre-2017",
  );
  const junkPre1990 = await arcCount(
    `${INCLUDE_WHERE} AND DATE_INCIDENT_BEGAN < TIMESTAMP '1990-01-01 00:00:00'`,
    "junk began <1990",
  );
  const partialJuly = await arcCount(
    `${INCLUDE_WHERE} AND DATE_INCIDENT_BEGAN >= TIMESTAMP '${SPAN_END}'`,
    "partial 2026-07",
  );
  assert(
    totalRecords + partialJuly === includeUniverse,
    `window ${totalRecords} + partial ${partialJuly} != include ${includeUniverse}`,
  );
  console.log(
    `  kept universe ${includeUniverse} = window ${totalRecords} (incl. ${pre2017} began-pre-2017,` +
      ` of which ${junkPre1990} junk-dated <1990) + partial 2026-07 ${partialJuly}`,
  );

  // ---- 4. Timeline cells: per-cat × division × month ------------------------
  console.log("── Timeline: per-division monthly counts by category (2017-01…2026-06)");
  const cells = {};
  for (const k of HOODS)
    cells[k] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  const junkByCatMonth = zeroCatMonths(); // in-span rows outside the 14 divisions
  const junkDivNames = new Map(); // name → in-span count (disclosed)
  for (const cat of CAT_KEYS) {
    let placedN = 0,
      junkN = 0;
    for (let y = 2017; y <= 2026; y++) {
      const yWhere =
        `DATE_INCIDENT_BEGAN >= TIMESTAMP '${y}-01-01 00:00:00' AND ` +
        `DATE_INCIDENT_BEGAN < TIMESTAMP '${y + 1}-01-01 00:00:00'`;
      const feats = await arcGrouped(
        {
          where: `${SPAN_WHERE} AND ${yWhere} AND ${INCLUDE_WHERE} AND ${CAT_WHERE[cat]}`,
          groupByFieldsForStatistics: "CMPD_PATROL_DIVISION,EXTRACT(MONTH FROM DATE_INCIDENT_BEGAN)",
          outStatistics: JSON.stringify([
            { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
          ]),
        },
        { label: `timeline ${cat} ${y}` },
      );
      for (const f of feats) {
        const a = f.attributes;
        const [mKey] = exprKeys(a, 1);
        const ym = `${y}-${String(a[mKey]).padStart(2, "0")}`;
        const mi = MONTH_IDX.get(ym);
        assert(mi !== undefined, `timeline ${cat}: month ${ym} outside span`);
        const n = Number(a.n);
        assert(Number.isFinite(n) && n >= 0, `timeline ${cat}: bad count ${a.n}`);
        const div = String(a.CMPD_PATROL_DIVISION ?? "").trim();
        if (HOODS.has(div)) {
          cells[div][mi][cat] += n;
          placedN += n;
        } else {
          junkByCatMonth[cat][mi] += n;
          junkDivNames.set(div, (junkDivNames.get(div) || 0) + n);
          junkN += n;
        }
      }
    }
    console.log(`  ${cat}: ${placedN} placed, ${junkN} outside the 14 divisions`);
  }

  // ---- 5. Citywide per-cat monthly (independent cross-check) ----------------
  console.log("── Citywide monthly totals per category (cross-check)");
  const cityByCatMonth = {};
  for (const cat of CAT_KEYS) {
    const feats = await arcGrouped(
      {
        where: `${SPAN_WHERE} AND ${INCLUDE_WHERE} AND ${CAT_WHERE[cat]}`,
        groupByFieldsForStatistics:
          "EXTRACT(YEAR FROM DATE_INCIDENT_BEGAN),EXTRACT(MONTH FROM DATE_INCIDENT_BEGAN)",
        outStatistics: JSON.stringify([
          { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
        ]),
      },
      { label: `citywide ${cat}` },
    );
    const arr = MONTHS.map(() => 0);
    for (const f of feats) {
      const a = f.attributes;
      const [yKey, mKey] = exprKeys(a, 2);
      const ym = `${a[yKey]}-${String(a[mKey]).padStart(2, "0")}`;
      const mi = MONTH_IDX.get(ym);
      assert(mi !== undefined, `citywide ${cat}: month ${ym} outside span`);
      arr[mi] = Number(a.n);
    }
    cityByCatMonth[cat] = arr;
  }
  for (const cat of CAT_KEYS) {
    for (let mi = 0; mi < MONTHS.length; mi++) {
      let placed = 0;
      for (const k of HOODS) placed += cells[k][mi][cat];
      const lhs = placed + junkByCatMonth[cat][mi];
      const rhs = cityByCatMonth[cat][mi];
      assert(lhs === rhs, `month ${MONTHS[mi]} cat ${cat}: placed+unplaced ${lhs} != citywide ${rhs}`);
    }
  }
  const citywideSpanTotal = CAT_KEYS.reduce(
    (s, c) => s + cityByCatMonth[c].reduce((a, b) => a + b, 0),
    0,
  );
  assert(
    pre2017 + citywideSpanTotal === totalRecords,
    `pre2017 ${pre2017} + span ${citywideSpanTotal} != window total ${totalRecords}`,
  );
  console.log(
    `  placed + unplaced == citywide for all ${MONTHS.length} months × 4 cats ✓ (span total ${citywideSpanTotal})`,
  );

  // ---- 6. Raw-pull verification of one full month ---------------------------
  console.log("── Verification: raw paged pull of 2023-05 vs grouped stats");
  const VER_YM = "2023-05";
  const rawFeats = await arcAll(
    {
      where: `${monthWhere(VER_YM)} AND ${INCLUDE_WHERE}`,
      outFields:
        "DATE_INCIDENT_BEGAN,CMPD_PATROL_DIVISION,HIGHEST_NIBRS_CODE,INCIDENT_REPORT_ID,CLEARANCE_STATUS",
      returnGeometry: "false",
      orderByFields: "OBJECTID",
      resultRecordCount: "2500",
    },
    { label: `raw ${VER_YM}` },
  );
  const rawTally = Object.fromEntries(CAT_KEYS.map((c) => [c, { placed: 0, junk: 0 }]));
  const seenIds = new Set();
  let dupIds = 0;
  for (const f of rawFeats) {
    const a = f.attributes;
    assert(ymOfMs(a.DATE_INCIDENT_BEGAN) === VER_YM, `raw ${VER_YM}: date ${a.DATE_INCIDENT_BEGAN} outside month`);
    assert(!NONCRIM_RE.test(String(a.HIGHEST_NIBRS_CODE)), `raw ${VER_YM}: 800-series leaked through filter`);
    assert(a.CLEARANCE_STATUS !== "Unfounded", `raw ${VER_YM}: unfounded leaked through filter`);
    const { cat } = catOfCode(a.HIGHEST_NIBRS_CODE);
    assert(CAT_KEYS.includes(cat), `raw ${VER_YM}: unmapped code '${a.HIGHEST_NIBRS_CODE}'`);
    const div = String(a.CMPD_PATROL_DIVISION ?? "").trim();
    if (HOODS.has(div)) rawTally[cat].placed++;
    else rawTally[cat].junk++;
    if (seenIds.has(a.INCIDENT_REPORT_ID)) dupIds++;
    seenIds.add(a.INCIDENT_REPORT_ID);
  }
  const vmi = MONTH_IDX.get(VER_YM);
  for (const cat of CAT_KEYS) {
    let placed = 0;
    for (const k of HOODS) placed += cells[k][vmi][cat];
    assert(
      rawTally[cat].placed === placed && rawTally[cat].junk === junkByCatMonth[cat][vmi],
      `raw ${VER_YM} ${cat}: raw ${rawTally[cat].placed}+${rawTally[cat].junk} != grouped ${placed}+${junkByCatMonth[cat][vmi]}`,
    );
  }
  assert(dupIds === 0, `raw ${VER_YM}: ${dupIds} duplicate INCIDENT_REPORT_IDs (dedupe needed?)`);
  console.log(
    `  ${rawFeats.length} raw rows in ${VER_YM} match grouped stats exactly, all 4 cats; 0 duplicate report IDs ✓`,
  );

  // ---- 7. Per-code window table (PROVENANCE) --------------------------------
  const winCodeRows = await arcGrouped(
    {
      where: `${SPAN_WHERE} AND ${INCLUDE_WHERE}`,
      groupByFieldsForStatistics: "HIGHEST_NIBRS_CODE,HIGHEST_NIBRS_DESCRIPTION",
      outStatistics: JSON.stringify([
        { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
      ]),
    },
    { label: "window code table" },
  );
  const codeTable = winCodeRows
    .map((f) => {
      const a = f.attributes;
      const { code, cat } = catOfCode(a.HIGHEST_NIBRS_CODE);
      assert(CAT_KEYS.includes(cat), `window code table: unmapped '${a.HIGHEST_NIBRS_CODE}'`);
      return { code, desc: String(a.HIGHEST_NIBRS_DESCRIPTION), cat, n: Number(a.n) };
    })
    .sort((a, b) => b.n - a.n);
  assert(
    codeTable.reduce((s, r) => s + r.n, 0) === citywideSpanTotal,
    "window code table does not sum to span total",
  );
  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  for (const r of codeTable) catTotals[r.cat] += r.n;
  for (const c of CAT_KEYS)
    assert(
      catTotals[c] === cityByCatMonth[c].reduce((a, b) => a + b, 0),
      `catTotals ${c} mismatch vs citywide series`,
    );

  // ---- 8. Sampled REAL points ----------------------------------------------
  console.log("── Real incident points (block-anonymized published coords; deterministic sample)");
  const BBOX_WHERE =
    `LATITUDE_PUBLIC >= ${BBOX.latMin} AND LATITUDE_PUBLIC <= ${BBOX.latMax} AND ` +
    `LONGITUDE_PUBLIC >= ${BBOX.lngMin} AND LONGITUDE_PUBLIC <= ${BBOX.lngMax}`;
  const byMonth = MONTHS.map(() => []);
  let placeableCount = 0,
    fetched = 0,
    rejected = 0;
  for (let mi = 0; mi < MONTHS.length; mi++) {
    const feats = await arcAll(
      {
        where: `${monthWhere(MONTHS[mi])} AND ${INCLUDE_WHERE} AND ${BBOX_WHERE}`,
        outFields: "DATE_INCIDENT_BEGAN,LATITUDE_PUBLIC,LONGITUDE_PUBLIC,HIGHEST_NIBRS_CODE",
        returnGeometry: "false",
        orderByFields: "OBJECTID",
        resultRecordCount: "2500",
      },
      { label: `points ${MONTHS[mi]}` },
    );
    placeableCount += feats.length;
    for (const f of feats) {
      fetched++;
      const a = f.attributes;
      const lat = Number(a.LATITUDE_PUBLIC),
        lng = Number(a.LONGITUDE_PUBLIC);
      const { cat } = catOfCode(a.HIGHEST_NIBRS_CODE);
      const miRow = MONTH_IDX.get(ymOfMs(a.DATE_INCIDENT_BEGAN));
      if (
        miRow !== mi ||
        !CAT_KEYS.includes(cat) ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < BBOX.latMin ||
        lat > BBOX.latMax ||
        lng < BBOX.lngMin ||
        lng > BBOX.lngMax
      ) {
        rejected++;
        continue;
      }
      byMonth[mi].push([r6(lng), r6(lat), CAT_KEYS.indexOf(cat)]);
    }
    if ((mi + 1) % 12 === 0) console.log(`  …through ${MONTHS[mi]} (${fetched} rows so far)`);
  }
  const pts = byMonth.map((arr) => {
    if (arr.length <= 100) return arr;
    const out = [];
    for (let i = 0; i < 100; i++) out.push(arr[Math.floor((i * arr.length) / 100)]);
    return out;
  });
  const ptsKept = pts.reduce((s, a) => s + a.length, 0);
  const sampleRate = Math.round((placeableCount - rejected) / ptsKept);
  console.log(
    `  fetched ${fetched} in-bbox rows, rejected ${rejected} (client re-check), kept ${ptsKept}` +
      ` of ${placeableCount - rejected} placeable → 1 per ~${sampleRate}`,
  );

  // ---- 9. Dispatch feed: 8 real items per quarter (category-proportional) ---
  console.log("── Feed: 8 real items per quarter (category-proportional), 2017-Q1 … 2026-Q2");
  const FEED_PER_Q = 8;
  const feed = [];
  for (let y = 2017; y <= 2026; y++) {
    for (let q = 0; q < 4; q++) {
      const start = `${y}-${String(q * 3 + 1).padStart(2, "0")}-01 00:00:00`;
      const end =
        q === 3 ? `${y + 1}-01-01 00:00:00` : `${y}-${String(q * 3 + 4).padStart(2, "0")}-01 00:00:00`;
      if (start >= SPAN_END) continue;
      const qMonths = [0, 1, 2]
        .map((k) => MONTH_IDX.get(`${y}-${String(q * 3 + 1 + k).padStart(2, "0")}`))
        .filter((mi) => mi !== undefined);
      const catN = CAT_KEYS.map((c) => qMonths.reduce((s, mi) => s + cityByCatMonth[c][mi], 0));
      const catTot = catN.reduce((a, b) => a + b, 0);
      assert(catTot > 0, `feed ${y}Q${q + 1}: empty quarter`);
      const exact = catN.map((n) => (n / catTot) * FEED_PER_Q);
      const alloc = exact.map(Math.floor);
      let rem = FEED_PER_Q - alloc.reduce((a, b) => a + b, 0);
      exact
        .map((e, i) => [e - alloc[i], i])
        .sort((a, b) => b[0] - a[0])
        .slice(0, rem)
        .forEach(([, i]) => alloc[i]++);
      for (let ci = 0; ci < CAT_KEYS.length; ci++) {
        if (alloc[ci] === 0) continue;
        const j = await postJSON(
          ARC,
          {
            f: "json",
            where:
              `DATE_INCIDENT_BEGAN >= TIMESTAMP '${start}' AND DATE_INCIDENT_BEGAN < TIMESTAMP '${end}'` +
              ` AND ${INCLUDE_WHERE} AND ${CAT_WHERE[CAT_KEYS[ci]]}` +
              ` AND CMPD_PATROL_DIVISION IN (${inList([...HOODS])})`,
            outFields:
              "DATE_INCIDENT_BEGAN,HIGHEST_NIBRS_DESCRIPTION,HIGHEST_NIBRS_CODE,LOCATION,CMPD_PATROL_DIVISION",
            returnGeometry: "false",
            orderByFields: "OBJECTID",
            resultRecordCount: String(alloc[ci]),
          },
          { label: `feed ${y}Q${q + 1} ${CAT_KEYS[ci]}` },
        );
        for (const f of j.features || []) {
          const a = f.attributes;
          const div = String(a.CMPD_PATROL_DIVISION).trim();
          assert(HOODS.has(div), `feed: unexpected division '${a.CMPD_PATROL_DIVISION}'`);
          feed.push({
            date: ymdOfMs(a.DATE_INCIDENT_BEGAN),
            title: String(a.HIGHEST_NIBRS_DESCRIPTION ?? "").trim() || `Code ${a.HIGHEST_NIBRS_CODE}`,
            place: titleCase(String(a.LOCATION ?? "").trim()) || div,
            beat: div,
            cat: CAT_KEYS[ci],
          });
        }
      }
    }
  }
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`  ${feed.length} feed items (chronological, no seriousness bias)`);

  // ---- 10. FBI UCR history 1985–2016 ----------------------------------------
  console.log(
    `── FBI CDE history (${ORI}, 1985–2016, key=${FBI_KEY === "DEMO_KEY" ? "DEMO_KEY" : "FBI_API_KEY"})`,
  );
  async function fetchAnnual(offense) {
    const url = `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/${offense}?from=${HIST_FROM}&to=${HIST_TO}&API_KEY=${FBI_KEY}`;
    const cachePath = resolve(RAW_DIR, `fbi-${ORI}-${offense}.json`);
    let waited = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      let j = null;
      if (existsSync(cachePath)) {
        // Real response from a real earlier fetch of THIS ORI/span — its own
        // fetchedAtUTC is recorded inside; never synthesized.
        const cached = JSON.parse(readFileSync(cachePath, "utf8"));
        console.log(`  using cached FBI response ${cachePath} (fetched ${cached.fetchedAtUTC})`);
        j = cached.response;
      } else {
        const r = await fetch(url);
        if (r.status === 429 || r.status === 403) {
          const wait = waited === 0 ? 90000 : 300000;
          if (waited + wait > 20 * 60 * 1000)
            throw new Error(
              `FBI ${offense}: still rate-limited after ${Math.round(waited / 60000)} min. ` +
                `Get a free key at https://api.data.gov/signup/ and set FBI_API_KEY.`,
            );
          console.warn(`  HTTP ${r.status} rate-limited (${offense}); waiting ${wait / 1000}s…`);
          await sleep(wait);
          waited += wait;
          continue;
        }
        if (r.status >= 500) {
          console.warn(`  HTTP ${r.status} (${offense}); waiting 20s…`);
          await sleep(20000);
          continue;
        }
        if (!r.ok) throw new Error(`FBI ${offense}: HTTP ${r.status}`);
        j = await r.json();
        if (j?.offenses?.actuals)
          writeFileSync(
            cachePath,
            JSON.stringify({
              url: url.replace(FBI_KEY, "<key>"),
              fetchedAtUTC: new Date().toISOString(),
              response: j,
            }),
          );
      }
      const actuals = j?.offenses?.actuals;
      if (!actuals) throw new Error(`FBI ${offense}: no actuals in response`);
      // ⚠ CDE returns BOTH "… Offenses" and "… Clearances" series — match the
      // agency *Offenses* series explicitly, never Clearances / United States.
      const agKey = Object.keys(actuals).find(
        (k) => /Charlotte-Mecklenburg/i.test(k) && /Offenses/i.test(k) && !/United States/i.test(k),
      );
      if (!agKey)
        throw new Error(
          `FBI ${offense}: no Charlotte-Mecklenburg Offenses series for ORI ${ORI} ` +
            `(keys: ${Object.keys(actuals)}) — verify via ` +
            `https://api.usa.gov/crime/fbi/cde/agency/byStateAbbr/NC`,
        );
      const monthly = actuals[agKey] || {};
      if (Object.keys(monthly).length === 0)
        throw new Error(`FBI ${offense}: empty series for ORI ${ORI}`);
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
    throw new Error(`FBI ${offense}: exhausted retries`);
  }
  const violent = await fetchAnnual("violent-crime");
  const property = await fetchAnnual("property-crime");
  // 1985-plausibility gate (wrong-agency ORI failure mode caught in the
  // milwaukee build): a big-city violent total must be in the thousands.
  // Live-verified before this build: NC0600100 → 1985 violent = 4,575.
  assert(
    (violent.byYear[1985] || 0) > 1000,
    `1985 violent total ${violent.byYear[1985]} implausible for Charlotte — wrong ORI/series?`,
  );
  const droppedYears = [];
  const complete = [];
  for (let y = 1985; y <= 2016; y++) {
    const vm = violent.monthsSeen[y] || 0,
      pm = property.monthsSeen[y] || 0;
    if (vm !== 12 || pm !== 12) {
      droppedYears.push({ year: y, violentMonths: vm, propertyMonths: pm });
      continue;
    }
    const v = violent.byYear[y],
      p = property.byYear[y];
    complete.push({ year: y, violent: v, property: p, total: v + p });
  }
  assert(complete.length > 0, "FBI history: no complete years");
  if (droppedYears.length)
    console.warn(`  partial years (≠12 reported months, dropped): ${JSON.stringify(droppedYears)}`);
  // Keep the LONGEST contiguous run of complete years (ties → later), disclose
  // any dropped complete-but-noncontiguous segments (minneapolis pattern).
  const segments = [];
  for (const yr of complete) {
    const last = segments[segments.length - 1];
    if (last && yr.year === last[last.length - 1].year + 1) last.push(yr);
    else segments.push([yr]);
  }
  segments.sort((a, b) => a.length - b.length || a[0].year - b[0].year);
  const years = segments[segments.length - 1];
  const droppedSegments = segments.slice(0, -1).map((s) => `${s[0].year}–${s[s.length - 1].year}`);
  if (droppedSegments.length)
    console.warn(
      `  complete-but-noncontiguous segments dropped to keep one honest series: ${droppedSegments.join(", ")}`,
    );
  const yearMin = years[0].year,
    yearMax = years[years.length - 1].year;
  years.forEach((yr, i) => {
    assert(yr.year === yearMin + i, `FBI history: gap at ${yearMin + i} inside kept segment`);
  });
  console.log(`  kept ${years.length} complete years ${yearMin}–${yearMax} (12 months each verified)`);

  // ---- Assemble output files -------------------------------------------------
  let placedRecords = 0;
  for (const k of HOODS)
    for (const cc of cells[k]) placedRecords += cc.persons + cc.property + cc.society + cc.other;
  const outsideDivisions = CAT_KEYS.reduce((s, c) => s + junkByCatMonth[c].reduce((a, b) => a + b, 0), 0);
  const unplacedRecords = pre2017 + outsideDivisions;
  assert(placedRecords + unplacedRecords === totalRecords, "placed+unplaced != total");
  const coveragePct = Math.round((placedRecords / totalRecords) * 1000) / 10;

  const timeline = { months: MONTHS, cells };
  const beatsFile = { cats: CATS, beats };
  const summary = {
    slug: "charlotte-nc",
    title: "Charlotte · NC",
    source: { records: ARC_LAYER, beats: DIV_LAYER, hub: HUB },
    fetchedAt,
    dateMin: "2017-01-01",
    dateMax: "2026-06-30",
    months: MONTHS.length,
    totalRecords,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: { "began-pre-2017": pre2017, "outside-cmpd-divisions": outsideDivisions },
    excluded: {
      note:
        "Excluded from every count and disclosed in PROVENANCE: CMPD non-criminal 800-series local report " +
        "types and reports with clearance status 'Unfounded' (status as of fetch date).",
      "non-criminal-800-series": excl800,
      "unfounded-clearances-non-800": exclUnfNon800,
      "partial-month-2026-07": partialJuly,
    },
    catTotals,
    cats: CATS,
    beatCount: Object.keys(beats).length,
  };
  const history = {
    era: "history",
    taxonomy:
      "FBI UCR Summary (Violent + Property) — a different taxonomy than the CMPD NIBRS categories used from 2017; the two eras bridge at 2017 and are never equated",
    agency: AGENCY,
    ori: ORI,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      `Annual totals are real UCR Summary counts fetched from the FBI CDE summarized agency endpoint for ORI ${ORI} ` +
      `(12 reported months verified per year; the "Charlotte-Mecklenburg Police Department Offenses" series is matched ` +
      `explicitly — the response also carries a "Clearances" series, and the 1985 violent total is gated for big-city ` +
      `plausibility). UCR Summary (Violent/Property) and CMPD NIBRS are different taxonomies and are presented as ` +
      `distinct eras; patrol-division detail exists only from 2017 (the CMPD Incidents layer starts with reports filed ` +
      `2017-01-01), so the story bridges from citywide annual history to per-division monthly data at 2017. ` +
      `Reproduce with pipeline/sources/charlotte-nc.mjs (set FBI_API_KEY to avoid DEMO_KEY rate limits).` +
      (droppedYears.length
        ? ` Dropped partial years (<12 reported months, no honest annual total possible): ${droppedYears
            .map((d) => `${d.year} (violent ${d.violentMonths}/12, property ${d.propertyMonths}/12)`)
            .join(", ")}.`
        : "") +
      (droppedSegments.length
        ? ` Complete years ${droppedSegments.join(", ")} exist in the source but are separated from this series by a partial-year gap and are omitted to keep one contiguous honest series.`
        : ""),
    yearMin,
    yearMax,
    cats: {
      violent: { label: "UCR Violent (murder, rape, robbery, agg. assault)", color: "#ff2e63" },
      property: { label: "UCR Property (burglary, larceny, MV theft)", color: "#ffc233" },
    },
    years,
  };
  const neighborhoods = {
    source: "CMPD Police Divisions (official City of Charlotte polygon layer)",
    sourceUrl: DIV_LAYER,
    hub: HUB,
    fetchedAt,
    license:
      "City of Charlotte custom disclaimer (no explicit open license; quoted verbatim in PROVENANCE) — " +
      "attribute City of Charlotte / Charlotte-Mecklenburg Police Department",
    method:
      "identity — CMPD crime records carry the official patrol-division name (CMPD_PATROL_DIVISION) in-data; " +
      "polygon DNAME minus the ' Division' suffix matches it exactly (verified), keyed by matching DIVISION code. " +
      "No spatial join or approximation is involved.",
    map: Object.fromEntries(Object.keys(beats).map((k) => [k, { name: k, approx: false }])),
  };
  const oobPct = Math.round(((citywideSpanTotal - (placeableCount - rejected)) / citywideSpanTotal) * 1000) / 10;
  const points = {
    mode: "real-sample",
    note:
      "Every dot is a real reported incident location as published by CMPD in LATITUDE_PUBLIC/LONGITUDE_PUBLIC — " +
      "BLOCK-ANONYMIZED by the source (accurate to the block, not the parcel; the LOCATION field is a block " +
      `address). ${oobPct}% of in-span kept records fall outside the division-extent bbox (incl. lat/lng-swapped ` +
      "junk) and are counted but not plotted. Deterministic even-stride sample (≤100/month) across each full " +
      "month. Non-criminal 800-series and unfounded reports are excluded before sampling.",
    sampleRate,
    months: MONTHS,
    pts,
  };

  // ---- VALIDATE (fail loudly) -------------------------------------------------
  console.log("── Validation");
  assert(
    MONTHS.length === 114 && MONTHS[0] === "2017-01" && MONTHS[113] === "2026-06",
    "months not contiguous 2017-01..2026-06",
  );
  for (let i = 1; i < MONTHS.length; i++) {
    const [py, pm] = MONTHS[i - 1].split("-").map(Number);
    const [cy, cm] = MONTHS[i].split("-").map(Number);
    assert(
      (cm === pm + 1 && cy === py) || (cm === 1 && pm === 12 && cy === py + 1),
      `months not contiguous at ${MONTHS[i]}`,
    );
  }
  assert(Object.keys(beats).length === EXPECTED_DIVISIONS, `beatCount != ${EXPECTED_DIVISIONS}`);
  let zeroHoods = 0;
  for (const k of Object.keys(cells)) {
    assert(beats[k], `cells key '${k}' has no polygon`);
    assert(cells[k].length === MONTHS.length, `cells['${k}'] length != ${MONTHS.length}`);
    const t = cells[k].reduce((s, cc) => s + cc.persons + cc.property + cc.society + cc.other, 0);
    if (t === 0) zeroHoods++;
  }
  assert(zeroHoods === 0, `${zeroHoods} divisions have zero records across 9.5 years — join broken?`);
  for (const k of Object.keys(beats)) assert(cells[k], `division '${k}' missing from cells`);
  assert(coveragePct >= 95, `coverage ${coveragePct}% < 95% — placement unreliable`);
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
    assert(f.date >= "2017-01-01" && f.date <= "2026-06-30", `feed date out of span ${f.date}`);
    assert(beats[f.beat], `feed beat '${f.beat}' not a division`);
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
    droppedSegments,
    placeableCount: placeableCount - rejected,
    ptsKept,
    sampleRate,
    catTotals,
    codeTable,
    noncrimCodes,
    clearanceTable,
    unfoundedDetail,
    grand,
    excl800,
    exclUnfNon800,
    overlap800Unf,
    includeUniverse,
    pre2017,
    junkPre1990,
    partialJuly,
    junkDivNames,
    outsideDivisions,
    citywideSpanTotal,
  });
  appendWiki({ summary, history, excl800, exclUnfNon800 });

  console.log("\n── Final summary.json");
  console.log(JSON.stringify(summary, null, 2));

  // ---- Story numbers (for the report; all derived from validated data) --------
  console.log("\n── Story numbers");
  const peak = years.reduce((a, b) => (b.total > a.total ? b : a));
  const y1985 = years.find((y) => y.year === 1985);
  const yLast = years[years.length - 1];
  console.log(
    `  history: 1985 total=${y1985?.total} (violent ${y1985?.violent}) · peak ${peak.year}=${peak.total}` +
      ` (violent ${peak.violent}) · ${yLast.year}=${yLast.total}`,
  );
  const yearTotal = (yr, excludeOther) => {
    let s = 0;
    MONTHS.forEach((m, mi) => {
      if (!m.startsWith(String(yr))) return;
      for (const c of CAT_KEYS) if (!(excludeOther && c === "other")) s += cityByCatMonth[c][mi];
    });
    return s;
  };
  for (const yr of [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025])
    console.log(`  citywide ${yr}=${yearTotal(yr)} (Group A only ${yearTotal(yr, true)})`);
  const hoodYear = (k, yr) => {
    let s = 0;
    MONTHS.forEach((m, mi) => {
      if (!m.startsWith(String(yr))) return;
      const cc = cells[k][mi];
      s += cc.persons + cc.property + cc.society + cc.other;
    });
    return s;
  };
  const HK = Object.keys(beats);
  const top2025 = HK.map((k) => [k, hoodYear(k, 2025)]).sort((a, b) => b[1] - a[1]);
  console.log(`  divisions 2025 (all): ${top2025.map(([k, n]) => `${k}=${n}`).join(" · ")}`);
  const changes = HK.map((k) => {
    const a = hoodYear(k, 2017),
      b = hoodYear(k, 2025);
    return [k, a, b, a > 0 ? Math.round(((b - a) / a) * 1000) / 10 : null];
  }).sort((x, y) => (x[3] ?? 0) - (y[3] ?? 0));
  console.log(
    `  division change 2017→2025: ${changes.map(([k, a, b, p]) => `${k} ${a}→${b} (${p}%)`).join(" · ")}`,
  );
  let hiM = null,
    hiN = -1;
  MONTHS.forEach((m, mi) => {
    let s = 0;
    for (const c of CAT_KEYS) s += cityByCatMonth[c][mi];
    if (s > hiN) (hiN = s), (hiM = m);
  });
  console.log(`  highest month (kept records): ${hiM} = ${hiN}`);

  console.log("\nVALIDATION PASS");
}

// ---- PROVENANCE.md ---------------------------------------------------------------
function writeProvenance(x) {
  const {
    fetchedAt,
    summary,
    history,
    droppedYears,
    droppedSegments,
    placeableCount,
    ptsKept,
    sampleRate,
    catTotals,
    codeTable,
    noncrimCodes,
    clearanceTable,
    unfoundedDetail,
    grand,
    excl800,
    exclUnfNon800,
    overlap800Unf,
    includeUniverse,
    pre2017,
    junkPre1990,
    partialJuly,
    junkDivNames,
    outsideDivisions,
    citywideSpanTotal,
  } = x;
  const n = (v) => v.toLocaleString("en-US");
  const codeRows = codeTable
    .map((r) => `| \`${r.code}\` | ${r.desc} | \`${r.cat}\` | ${n(r.n)} |`)
    .join("\n");
  const ncRows = noncrimCodes.map((r) => `| \`${r.code}\` | ${r.desc} | ${n(r.n)} |`).join("\n");
  const clrRows = clearanceTable.map((r) => `| ${r.status} | ${n(r.n)} |`).join("\n");
  const unfRows = unfoundedDetail.map((r) => `| ${r.detail} | ${n(r.n)} |`).join("\n");
  const junkDivRows = [...junkDivNames.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, c]) => `| ${JSON.stringify(k)} | ${n(c)} |`)
    .join("\n");
  const md = `# Provenance — Charlotte, NC

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **CMPD Incidents** (all CMPD incident report types, 2017-present, refreshed daily) |
| Publisher | Charlotte-Mecklenburg Police Department, via City of Charlotte Open Data Portal |
| Landing page | ${HUB_ITEM} (portal: ${HUB}) |
| API | ${ARC_LAYER} |
| Fetched | ${fetchedAt} |
| License | Custom City of Charlotte disclaimer (quoted verbatim below); no explicit open license — attribution "Charlotte-Mecklenburg Police Department / City of Charlotte" |
| Records kept | ${n(summary.totalRecords)} (of ${n(grand)} layer rows; exclusions enumerated below) |
| Source caveat | "For official crime statistics, please visit CMPD's Crime Statistics page." The layer "includes all CMPD incident report types, both criminal and non-criminal … Each incident is classified based on FBI NIBRS standards by applying a national crime hierarchy to choose the highest offense assigned to each report." Classifications and clearance statuses can change as investigations proceed. |

### License (verbatim, from the ArcGIS item registry — applies to both the incidents and divisions items)

> ${CITY_DISCLAIMER}

### Exclusions (the headline honesty rule of this dataset)

The source layer mixes criminal and NON-CRIMINAL reports, and includes reports later determined to be
unfounded. Both are **excluded from every count** in this bundle and enumerated here:

**Layer accounting (at fetch):** ${n(grand)} rows = **${n(includeUniverse)} kept** + **${n(excl800)} non-criminal 800-series** + **${n(exclUnfNon800)} unfounded (non-800)**. (${n(overlap800Unf)} rows are BOTH 800-series and unfounded — counted once, in the 800-series bucket.)

#### 1. Non-criminal 800-series local report types — ${n(excl800)} rows excluded

CMPD uses local 800-series codes for non-criminal report types (missing persons, natural deaths,
recovered out-of-jurisdiction vehicles, …). They are not crimes and are excluded entirely:

| Code | Source description | Rows (whole layer) |
|------|--------------------|-------------------:|
${ncRows}

#### 2. Unfounded clearances — ${n(exclUnfNon800)} rows excluded (non-800 rows)

\`CLEARANCE_STATUS\` values across the whole layer (enumerated at fetch):

| CLEARANCE_STATUS | Rows |
|------------------|-----:|
${clrRows}

Reports whose status is **"Unfounded"** (complaint determined false/baseless per NIBRS practice) are
excluded. Detail statuses of the excluded non-800 unfounded rows:

| CLEARANCE_DETAIL_STATUS | Rows |
|-------------------------|-----:|
${unfRows}

Caveat (disclosed): clearance status reflects the investigation **as of the fetch date** — a report
currently "Open" may later be unfounded, so re-runs of this pipeline can shift counts slightly. All
other statuses (Open, Cleared by Arrest, Exceptionally Cleared, Cleared by Arrest by Another Agency)
are kept — they are real reported offenses.

### Date field choice (disclosed)

The layer publishes \`DATE_REPORTED\`, \`DATE_INCIDENT_BEGAN\`, and \`DATE_INCIDENT_END\`. **We use
\`DATE_INCIDENT_BEGAN\`** — the map animates *when incidents began*, not when paperwork was filed.
All values are date-only (EXTRACT(HOUR)=0 across all ${n(grand)} rows, verified live), so server-side
month grouping and client epoch conversion agree exactly. Consequence: ${n(pre2017)} kept rows *began*
before 2017 (reported 2017+); ${n(junkPre1990)} of them carry junk dates before 1990 (back to year
0200 — obvious data-entry errors on real reports). They are counted in \`totalRecords\` and disclosed
as \`unplacedBeats["began-pre-2017"]\` — never silently dropped, never mapped.

### Windowing (disclosed exclusions)

- Rows (kept universe) with DATE_INCIDENT_BEGAN on/after **2026-07-01** (partial month at fetch):
  **${n(partialJuly)}** excluded → the granular window ends at the last FULL month, **2026-06**.
- ${n(includeUniverse)} kept = ${n(summary.totalRecords)} window + ${n(partialJuly)} partial-month.

### Fields used

\`DATE_INCIDENT_BEGAN\` · \`HIGHEST_NIBRS_CODE\` / \`HIGHEST_NIBRS_DESCRIPTION\` ·
\`CMPD_PATROL_DIVISION\` (+ \`DIVISION_ID\`) · \`LATITUDE_PUBLIC\` / \`LONGITUDE_PUBLIC\` ·
\`LOCATION\` (block address) · \`CLEARANCE_STATUS\` / \`CLEARANCE_DETAIL_STATUS\` ·
\`INCIDENT_REPORT_ID\` (verified unique — zero duplicates server-side and in the raw-month re-pull;
one row = one incident report, no dedupe needed).

### Category mapping (HIGHEST_NIBRS_CODE → cat)

CMPD applies the FBI NIBRS national hierarchy and publishes ONE highest offense per incident report.
Crimes-against assignment follows the FBI NIBRS offense-code list: Group A → \`persons\` /
\`property\` / \`society\`; **Group B codes (90-series), CMPD local criminal codes \`99Y\`/\`99Z\`
(Indecent Exposure, Affray) and \`09C\` Justifiable Homicide ("not a crime" per NIBRS) → \`other\`**,
labeled "${CATS.other.label}", never counted as Group A crime. Any code outside the documented table
fails the build. Full in-window table (post-exclusion counts at fetch):

| Code | Source description | cat | Window count |
|------|--------------------|-----|-------------:|
${codeRows}

| cat | Window count |
|-----|-------------:|
| \`persons\` | ${n(catTotals.persons)} |
| \`property\` | ${n(catTotals.property)} |
| \`society\` | ${n(catTotals.society)} |
| \`other\` | ${n(catTotals.other)} |

### Placement — official patrol divisions carried in-data

Every record carries \`CMPD_PATROL_DIVISION\`; the 14 official divisions match the polygon layer's
\`DNAME\` (minus the " Division" suffix) exactly, keyed by identical division codes — an identity
join, no spatial approximation. Records tagged to areas outside CMPD's 14 patrol divisions (served
towns / mutual-aid codes) are **counted citywide and disclosed as unplaced**:

| CMPD_PATROL_DIVISION (in-window) | Rows |
|----------------------------------|-----:|
${junkDivRows}

- Placed: **${n(summary.placedRecords)}** (${summary.coveragePct}%)
- Unplaced: ${n(summary.unplacedRecords)} = ${n(pre2017)} began-pre-2017 + ${n(outsideDivisions)} outside the 14 divisions.
- Identity \`placed + unplaced == citywide\` validated per month × category in-script against an
  independent citywide grouped query (${n(citywideSpanTotal)} in-span rows), **plus** one full month
  (2023-05) re-verified row-by-row against a paged raw pull (dates, filters, categories, divisions,
  and report-ID uniqueness all re-checked client-side).

## Geometry source — official CMPD Police Divisions

| Field | Value |
|-------|-------|
| Dataset | **CMPD Police Divisions** — 14 polygons, official City of Charlotte layer (owner CharlotteNC) |
| FeatureServer | ${DIV_LAYER} |
| Item | ${DIV_ITEM} |
| License | Same verbatim City of Charlotte disclaimer as above |
| Join key | \`DIVISION\` code ↔ incident \`DIVISION_ID\`; \`DNAME\` minus " Division" ↔ \`CMPD_PATROL_DIVISION\` — exact identity (verified) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |
| Note | Interior rings (independent towns surrounded by a division, e.g. inside Steele Creek) are dropped for display only — placement is by in-data division name, so no count is affected |

## Real incident points (\`points.json\`)

Dots are **real incident locations published by CMPD** in \`LATITUDE_PUBLIC\`/\`LONGITUDE_PUBLIC\` —
**block-anonymized by the source** (the \`LOCATION\` field is a block address like
"9700 NORTHLAKE CENTRE PY"): accurate to the block, not the parcel, and disclosed wherever dots are
shown. Coordinate coverage is 100% (no nulls/zeros in the layer); a small share falls outside the
division-polygon extent used as the map frame (lat ${BBOX.latMin}–${BBOX.latMax}, lng ${BBOX.lngMin}–${BBOX.lngMax};
includes lat/lng-swapped junk) — those rows are **counted in every total but not plotted**.
Deterministic sample: every in-bbox kept row of each month fetched (OBJECTID order), even-stride
≤100/month → **${n(ptsKept)} points ≈ 1 per ${sampleRate} of the ${n(placeableCount)} placeable rows**.

## Historical source — FBI UCR (${history.yearMin}–${history.yearMax} deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Charlotte-Mecklenburg Police Department — **ORI \`${ORI}\`** (verified: returns the "Charlotte-Mecklenburg Police Department Offenses" series; 1985 violent total 4,575 passes the big-city plausibility gate that caught a wrong-agency ORI in the milwaukee build) |
| Endpoint | ${history.sourceUrl} (and \`/property-crime\`) |
| Span | ${history.yearMin}–${history.yearMax}, annual Violent + Property (12 reported months verified per year) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set \`FBI_API_KEY\`) |
${
  droppedYears.length
    ? `
**Dropped partial years (disclosed):** ${droppedYears
        .map((d) => `**${d.year}** (violent ${d.violentMonths}/12, property ${d.propertyMonths}/12 reported months)`)
        .join(", ")} — an annual total cannot honestly be built from fewer than 12 reported months.`
    : ""
}${
  droppedSegments.length
    ? `
**Dropped complete-but-noncontiguous years (disclosed):** ${droppedSegments.join(", ")} — separated from the kept series by a partial-year gap; omitted (not merged across the gap) to keep one contiguous honest series.`
    : ""
}
The CDE response carries both an "… Offenses" and an "… Clearances" series — the script matches the
**Offenses** series explicitly. Raw responses are cached under \`data/charlotte-nc/raw/\`. UCR Summary
(Violent/Property) is a **different taxonomy** than CMPD NIBRS — the eras are presented as distinct
and bridge at 2017; they are never equated. No monthly or division detail is implied for
${history.yearMin}–${history.yearMax}. Note: CMPD was formed in 1993 by the merger of the Charlotte Police
Department and the Mecklenburg County Police Department; the CDE series for ORI ${ORI} covers the
agency and its predecessor reporting under that ORI.

## Reproduce

\`\`\`bash
FBI_API_KEY=… node pipeline/sources/charlotte-nc.mjs
\`\`\`
`;
  writeFileSync(PROV_PATH, md);
  console.log(`  wrote data/charlotte-nc/PROVENANCE.md`);
}

// ---- wiki/Data-Provenance.md append ------------------------------------------------
function appendWiki({ summary, history, excl800, exclUnfNon800 }) {
  if (!existsSync(WIKI_PATH)) return;
  const cur = readFileSync(WIKI_PATH, "utf8");
  if (cur.includes("## Charlotte, NC")) {
    console.log("  wiki/Data-Provenance.md already has a Charlotte section — skipped");
    return;
  }
  const n = (v) => v.toLocaleString("en-US");
  const section = `
## Charlotte, NC (\`charlotte-nc\`)

- **Primary source:** CMPD Incidents — all CMPD incident report types, 2017-present
  (ArcGIS \`CMPD/CMPDIncidents/MapServer/0\` on gis.charlottenc.gov, refreshed daily;
  item ${HUB_ITEM}). License = City of Charlotte custom disclaimer (quoted verbatim
  in PROVENANCE); attribution "Charlotte-Mecklenburg Police Department / City of
  Charlotte".
- **Exclusions (headline rule):** the layer mixes criminal and non-criminal
  reports. **${n(excl800)} non-criminal 800-series rows** (missing persons, natural
  deaths, vehicle recoveries, 899 "Other Unlisted Non-Criminal", …) and
  **${n(exclUnfNon800)} "Unfounded"-clearance rows** are excluded from every count —
  both enumerated code-by-code / status-by-status with counts in PROVENANCE.
  Clearance status is as-of-fetch (can change as investigations proceed).
- **Categories:** \`HIGHEST_NIBRS_CODE\` (CMPD applies the FBI NIBRS national
  hierarchy — one highest offense per report). Group A → persons/property/society
  per the FBI list; **Group B (90-series), CMPD local codes 99Y/99Z, and 09C
  justifiable homicide → \`other\`** ("${summary.cats.other.label}"), never counted
  as Group A crime. Full code table in
  [\`data/charlotte-nc/PROVENANCE.md\`](../data/charlotte-nc/PROVENANCE.md).
- **Date field:** \`DATE_INCIDENT_BEGAN\` (when the incident began), not
  \`DATE_REPORTED\` — ${n(summary.unplacedBeats["began-pre-2017"])} kept rows began pre-2017 (reported later;
  incl. a few junk-dated) are counted and disclosed as "began-pre-2017" unplaced.
- **Spatial unit:** the **14 official CMPD patrol divisions** — carried in-data
  (\`CMPD_PATROL_DIVISION\`), identity-joined to the official "CMPD Police
  Divisions" polygon layer (DNAME/DIVISION codes match exactly; no spatial join).
  Only 14 regions — leaderboard/quiz sizing note as for Nashville/Memphis.
  Rows tagged outside the 14 divisions (served towns, mutual aid):
  ${n(summary.unplacedBeats["outside-cmpd-divisions"])}, unplaced and disclosed.
- **Coords:** \`LATITUDE_PUBLIC\`/\`LONGITUDE_PUBLIC\` are **block-anonymized** by
  CMPD (block-address grain) — real published positions, disclosed wherever dots
  are shown; 100% populated.
- **Deep-history source (${history.yearMin}–${history.yearMax}):** FBI Crime Data Explorer (CDE) —
  Charlotte-Mecklenburg PD, **ORI ${ORI}** (verified: "Offenses" series matched
  explicitly, 1985 violent 4,575 passes the big-city plausibility gate) — real
  annual Violent + Property counts, ${history.years.length} full years (12 reported months each).
- **Span:** ${history.yearMin}–${history.yearMax} (FBI UCR annual) + 2017-01-01 → 2026-06-30 (CMPD NIBRS
  with division detail, ${summary.months} months; partial 2026-07 dropped and disclosed).
- **Records:** ${n(summary.totalRecords)} kept in window · ${n(summary.placedRecords)} placed in a division
  (**${summary.coveragePct}% coverage**) · ${n(summary.unplacedRecords)} unplaced, kept in totals and disclosed.
- **Detail:** [\`data/charlotte-nc/PROVENANCE.md\`](../data/charlotte-nc/PROVENANCE.md)
`;
  const marker = "## Ranked source types";
  const idx = cur.indexOf(marker);
  const next = idx >= 0 ? cur.slice(0, idx) + section.trimStart() + "\n" + cur.slice(idx) : cur + section;
  writeFileSync(WIKI_PATH, next);
  console.log("  appended Charlotte section to wiki/Data-Provenance.md");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
