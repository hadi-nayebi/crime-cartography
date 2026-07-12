// Boston, MA — BPD Crime Incident Reports source pipeline (fetch → normalize → validate).
//
// BINDING RULE: never fabricate — every figure written by this script comes
// straight from a queryable public source; every gap is disclosed.
//
// Sources:
//   Incidents  : Analyze Boston (CKAN) package
//                "Crime Incident Reports (August 2015 - To Date) (Source: New System)"
//                — 9 datastore resources: yearly CSVs 2015…2022 plus "2023 to Present".
//                License ODC-PDDL, attribution "Boston Police Department via Analyze Boston".
//                https://data.boston.gov/dataset/crime-incident-reports-august-2015-to-date-source-new-system
//                NOTE: the datastore_search_sql endpoint is behind a Cloudflare WAF that
//                403s SQL in a GET query string — this script POSTs the SQL as JSON.
//   Polygons   : Boston police districts (official, 12 features, field DISTRICT)
//                https://gisportal.boston.gov/arcgis/rest/services/PublicSafety/OpenData/MapServer/5
//   Names      : official boston.gov police-district naming (District pages),
//                https://www.boston.gov/departments/police
//   History    : FBI Crime Data Explorer (CDE) summarized agency counts,
//                Boston PD ORI MA0130100, 1985–2015 annual Violent + Property.
//
// Eras (honesty structure):
//   1985–2015  FBI UCR annual citywide totals (no district detail implied)
//   2015-08 → 2026-06  BPD incident reports with district detail. The package is
//                titled "August 2015 to date"; the 2015 file also holds a partial
//                June + July 2015 (new-system ramp-up) — excluded and disclosed.
//                The current month (2026-07, partial) is excluded and disclosed.
//
//   node pipeline/sources/boston-ma.mjs        (set FBI_API_KEY to avoid DEMO_KEY limits)
//
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const OUT_DIR = resolve(repoRoot, "data/boston-ma/normalized");
const PROV_PATH = resolve(repoRoot, "data/boston-ma/PROVENANCE.md");
const WIKI_PATH = resolve(repoRoot, "wiki/Data-Provenance.md");

const CKAN = "https://data.boston.gov/api/3/action";
const PKG = "crime-incident-reports-august-2015-to-date-source-new-system";
const HUB = `https://data.boston.gov/dataset/${PKG}`;
const SQL_API = `${CKAN}/datastore_search_sql`;
const GIS_URL =
  "https://gisportal.boston.gov/arcgis/rest/services/PublicSafety/OpenData/MapServer/5/query?where=1%3D1&outFields=*&f=geojson&outSR=4326";
const NAMES_URL = "https://www.boston.gov/departments/police";
const ORI = "MA0130100";
const AGENCY = "Boston Police Department";
const FBI_KEY = process.env.FBI_API_KEY || "DEMO_KEY";

// Granular window: first full month of the new system per the package title →
// last full month at fetch time.
const YM_START = "2015-08"; // inclusive
const YM_END = "2026-06"; // inclusive
const HIST_FROM = "01-1985";
const HIST_TO = "12-2015";

// Official resident-known district names — source: boston.gov police "Districts"
// pages (https://www.boston.gov/departments/police, e.g. /departments/police/district-a-1).
const DISTRICT_NAMES = {
  A1: "Downtown & Beacon Hill",
  A15: "Charlestown",
  A7: "East Boston",
  B2: "Roxbury",
  B3: "Mattapan",
  C6: "South Boston",
  C11: "Dorchester",
  D4: "South End",
  D14: "Allston/Brighton",
  E5: "West Roxbury",
  E13: "Jamaica Plain",
  E18: "Hyde Park",
};
const DIST_CODES = Object.keys(DISTRICT_NAMES); // 12
// Non-district values seen in the data — disclosed as unplaced, never dropped.
const JUNK_DISTRICTS = new Set([null, undefined, "", " ", "External", "Outside of"]);

const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff4d6d" },
  property: { label: "Crimes Against Property", color: "#38bdf8" },
  society: { label: "Crimes Against Society", color: "#ffd166" },
  other: { label: "Service / non-crime (context)", color: "#64748b" },
};
const CAT_KEYS = ["persons", "property", "society", "other"]; // catIdx order

// ---- OFFENSE_DESCRIPTION → cat (ordered rules, first match wins) -----------
// Boston's new-system file has no NIBRS group field, so categories are derived
// from OFFENSE_DESCRIPTION strings. Rules are ordered: service/procedural
// overrides first (Boston's file is majority non-crime service records), then
// persons / property / society. Unmatched → other (fallback, disclosed).
// The full description→cat table with counts is written to PROVENANCE.md.
const RULES = [
  // --- service / medical / procedural / recovered → other (checked first) ---
  [/SICK|MEDICAL/, "other", "medical assists (incl. drug-related illness)"],
  [/INVESTIGATE|INVESTIGATION/, "other", "investigations (no offense established)"],
  [/TOWED/, "other", "towed vehicles"],
  [/VERBAL DISPUTE/, "other", "verbal disputes"],
  [/MISSING PERSON/, "other", "missing-person reports"],
  [/M\/V ACCIDENT|MOTOR VEHICLE CRASH/, "other", "motor-vehicle accidents"],
  [/LEAVING SCENE/, "other", "leaving-scene reports (traffic context)"],
  [/M\/V PLATES|RECOVERED STOLEN PLATE/, "other", "plates lost/recovered"],
  [/^VAL -|AUTO LAW VIOLATION/, "other", "auto-law violations (traffic citations)"],
  [/RECOVERED/, "other", "recoveries (vehicles/property)"],
  [
    /PROPERTY - LOST|PROPERTY - FOUND|PROPERTY - MISSING|PROPERTY - ACCIDENTAL/,
    "other",
    "lost/found/accidental property",
  ],
  [/WARRANT/, "other", "warrant service (procedural)"],
  [/FUGITIVE FROM JUSTICE/, "other", "fugitive processing (procedural)"],
  [/FIRE REPORT|FIRE ALARM/, "other", "fire reports"],
  [/SUDDEN DEATH|DEATH INVESTIGATION/, "other", "death investigations"],
  [/SUICIDE/, "other", "suicide / attempt (medical, not an offense)"],
  [/SERVICE TO OTHER|LANDLORD - TENANT|REPORT AFFECTING OTHER DEPTS/, "other", "service calls"],
  [/BALLISTICS|EVIDENCE/, "other", "evidence handling"],
  [/FOUND OR CONFISCATED|TURNED IN OR FOUND/, "other", "found/confiscated items"],
  [/FIREARM\/WEAPON - LOST|FIREARM\/WEAPON - ACCIDENTAL/, "other", "lost/accidental weapon reports"],
  [/ANIMAL ABUSE/, "society", "animal cruelty"],
  [/ANIMAL/, "other", "animal incidents"],
  [/AIRCRAFT|HARBOR/, "other", "aircraft/harbor incidents"],
  [/DANGEROUS OR HAZARDOUS/, "other", "hazardous conditions"],
  [/INJURY BICYCLE/, "other", "bicycle injuries (no offense)"],
  [/PRISONER|PROTECTIVE CUSTODY/, "other", "custody/prisoner events"],
  [/TRUANCY|RUNAWAY|CHINS|CHILD REQUIRING ASSISTANCE/, "other", "juvenile status/service"],
  [/CONTRIBUTING TO DELINQUENCY/, "other", "juvenile-related (procedural)"],
  [/CONSPIRACY/, "other", "conspiracy (non-drug)"],
  [/^OTHER OFFENSE$/, "other", "unspecified offense"],
  // --- order violations (before HARASSMENT so prevention orders land here) ---
  [/RESTRAINING ORDER|HARASSMENT PREVENTION ORDER/, "society", "court-order violations"],
  // --- persons ---
  [/HOMICIDE|MURDER|MANSLAUGHTER|KILLING OF FELON/, "persons", "homicide"],
  [/RAPE|SEXUAL ASSAULT/, "persons", "sexual violence (absent from public file — see PROVENANCE)"],
  [/CHILD ABUSE|CHILD ENDANGERMENT|CHILD ABANDONMENT/, "persons", "crimes against children"],
  [/ASSAULT|A&B/, "persons", "assaults"],
  [/KIDNAPPING|ABDUCTION/, "persons", "kidnapping"],
  [/THREAT/, "persons", "threats (incl. bomb/biological threats = intimidation)"],
  [/HARASSMENT|OBSCENE PHONE|ANNOYING AND ACCOSTIN|STALKING|INTIMIDATING WITNESS/, "persons", "harassment/stalking/intimidation"],
  [/HUMAN TRAFFICKING/, "persons", "human trafficking"],
  // --- property ---
  [/LARCENY|SHOPLIFTING/, "property", "larceny/theft"],
  [/ROBBERY/, "property", "robbery"],
  [/BURGLARY|B&E|BREAKING AND ENTERING|BURGLARIOUS/, "property", "burglary/B&E"],
  [/AUTO THEFT/, "property", "auto theft"],
  [/VANDALISM|GRAFFITI/, "property", "vandalism"],
  [/ARSON/, "property", "arson"],
  [/FRAUD|FORGERY|COUNTERFEIT|UTTERING/, "property", "fraud/forgery"],
  [/EMBEZZLE/, "property", "embezzlement"],
  [/STOLEN PROPERTY|RECEIVING STOLEN/, "property", "stolen-property offenses"],
  [/EXTORTION|BLACKMAIL/, "property", "extortion"],
  [/EVADING FARE/, "property", "fare evasion (theft of services)"],
  [/HOME INVASION/, "property", "home invasion"],
  [/PROPERTY - CONCEALING LEASED/, "property", "concealing leased property"],
  // --- society ---
  [/SEX OFFENDER REGISTRATION/, "society", "registration violations"],
  [/DRUGS|NARCOTIC/, "society", "drug offenses"],
  [/WEAPON|FIREARM|EXPLOSIVES/, "society", "weapons offenses"],
  [/PROSTITUT/, "society", "prostitution"],
  [/LIQUOR|DRINKING IN PUBLIC|DRUNKENNESS|\(OUI\)|OPERATING UNDER THE INFLUENCE/, "society", "liquor / OUI"],
  [/GAMBLING|BETTING/, "society", "gambling"],
  [
    /DISORDERLY|DISTURBING THE PEACE|AFFRAY|NOISY PARTY|GATHERING CAUSING ANNOYANCE|DEMONSTRATIONS|RIOT/,
    "society",
    "public order / disorder",
  ],
  [/TRESPASS/, "society", "trespassing"],
  [/OBSCENE MATERIALS|PORNOGRAPHY/, "society", "obscenity"],
  [/LICENSE PREMISE/, "society", "licensed-premise violations"],
  [/VIOLATION - CITY ORDINANCE|HAWKER/, "society", "ordinance violations"],
];
const catCache = new Map();
function catOf(desc) {
  if (catCache.has(desc)) return catCache.get(desc);
  const u = String(desc ?? "").toUpperCase();
  let hit = { cat: "other", rule: "(fallback — unmatched, defaults to other)" };
  for (const [re, cat, rule] of RULES)
    if (re.test(u)) {
      hit = { cat, rule };
      break;
    }
  catCache.set(desc, hit);
  return hit;
}

// Valid Boston coordinate box (source Lat/Long are TEXT; ~4.6% null-or-zero —
// those rows still count in the timeline via DISTRICT, they just get no dot).
const BBOX = { latMin: 42.22, latMax: 42.4, lngMin: -71.19, lngMax: -70.95 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fetchCount = 0;
async function getJSON(url, { retries = 3, retryWait = 5000, label = url, post = null } = {}) {
  for (let attempt = 0; ; attempt++) {
    if (fetchCount++ > 0) await sleep(150); // be polite: sequential + 150ms delay
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
      // 403 = Cloudflare WAF hiccup (HTML body); treat as retryable
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

// CKAN datastore SQL — POSTed because the Cloudflare WAF 403s SQL in GET URLs.
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
const MONTHS = monthRange(YM_START, YM_END); // 131
const MONTH_IDX = new Map(MONTHS.map((m, i) => [m, i]));

function titleCase(s) {
  return String(s)
    .toLowerCase()
    .replace(/(^|[\s\-/(.])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

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
function scanFinite(obj, path = "$") {
  if (typeof obj === "number") {
    if (!Number.isFinite(obj)) fail(`non-finite number at ${path}`);
  } else if (Array.isArray(obj)) obj.forEach((v, i) => scanFinite(v, `${path}[${i}]`));
  else if (obj && typeof obj === "object")
    for (const [k, v] of Object.entries(obj)) scanFinite(v, `${path}.${k}`);
}

// ============================================================================
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const fetchedAt = new Date().toISOString();

  // ---- 0. Resolve the 9 datastore resources from the CKAN package ----------
  console.log("── CKAN package resources");
  const pkg = await getJSON(`${CKAN}/package_show?id=${PKG}`, { label: "package_show" });
  assert(pkg.success, "package_show failed");
  assert(pkg.result.license_id === "odc-pddl", `license changed: ${pkg.result.license_id}`);
  const RES = {}; // label ("2015"…"2022","2023p") → resource id
  for (const r of pkg.result.resources) {
    if (!r.datastore_active || r.format !== "CSV") continue;
    let m;
    if (r.name === "Crime Incident Reports - 2023 to Present") RES["2023p"] = r.id;
    else if ((m = /^Crime Incident Reports - (20\d\d)$/.exec(r.name || ""))) RES[m[1]] = r.id;
  }
  const RES_LABELS = ["2015", "2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023p"];
  for (const l of RES_LABELS) assert(RES[l], `missing datastore resource for ${l}`);
  // cross-check against independently verified ids (loud failure if the package is restructured)
  assert(RES["2023p"] === "b973d8cb-eeb2-4e7e-99da-c92938efc9c0", "2023-to-present resource id changed");
  assert(RES["2022"] === "313e56df-6d77-49d2-9c49-ee411f10cf58", "2022 resource id changed");
  assert(RES["2015"] === "792031bf-b9bb-467c-b118-fe795befdf00", "2015 resource id changed");
  console.log(`  ${RES_LABELS.length} datastore resources: ${RES_LABELS.map((l) => `${l}=${RES[l].slice(0, 8)}…`).join(" ")}`);
  const ownerOf = (ym) => (Number(ym.slice(0, 4)) >= 2023 ? RES["2023p"] : RES[ym.slice(0, 4)]);

  // ---- 1. District polygons -------------------------------------------------
  console.log("── BPD district polygons");
  const gj = await getJSON(GIS_URL, { label: "district geojson" });
  assert(gj?.type === "FeatureCollection" && Array.isArray(gj.features), "districts: bad geojson");
  assert(gj.features.length === 12, `districts: expected 12 features, got ${gj.features.length}`);
  const beats = {};
  gj.features.forEach((f, idx) => {
    const key = f.properties?.DISTRICT;
    assert(DISTRICT_NAMES[key], `district feature ${idx}: unexpected DISTRICT '${key}'`);
    assert(!beats[key], `districts: duplicate '${key}'`);
    const g = f.geometry;
    const parts = g.type === "Polygon" ? [g.coordinates] : g.coordinates; // MultiPolygon
    const outerRings = parts.map((p) => p[0]);
    let A = 0,
      X = 0,
      Y = 0;
    for (const ring of outerRings) {
      const { area, cx, cy } = ringAreaCentroid(ring);
      A += area;
      X += cx * area;
      Y += cy * area;
    }
    assert(A > 0, `district '${key}': zero area`);
    beats[key] = {
      key,
      name: DISTRICT_NAMES[key],
      servcen: f.properties?.BPDGIS_GIS ?? "",
      beat: idx,
      centroid: [Number((X / A).toFixed(6)), Number((Y / A).toFixed(6))],
      polygon: outerRings,
      geomType: g.type,
    };
  });
  for (const code of DIST_CODES) assert(beats[code], `district '${code}' missing from polygon layer`);
  console.log(`  12 districts, verbatim 12↔12 join (${DIST_CODES.join(", ")})`);

  // ---- 2. Exhaustive aggregation: (month × description × district) ----------
  // One grouped fetch per resource, paged. Categories are derived client-side
  // from the same mapping everywhere, so placed + unplaced == citywide is exact
  // by construction; step 3 independently verifies row totals per resource.
  console.log("── Grouped counts per resource: month × OFFENSE_DESCRIPTION × DISTRICT");
  const cells = {};
  for (const code of DIST_CODES)
    cells[code] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  const junkByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  const cityByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  const descTotals = new Map(); // desc → window count (for the PROVENANCE table)
  const junkDistrictSeen = new Map(); // junk district value → window count
  const groupedTotalByRes = {}; // resource label → total rows (incl. out-of-window)
  let preWindow = 0,
    postWindow = 0;
  const outOfWindowMonths = new Map();

  const PAGE = 20000;
  for (const label of RES_LABELS) {
    let offset = 0,
      resTotal = 0,
      pages = 0;
    for (;;) {
      const rows = await sql(
        `SELECT substr("OCCURRED_ON_DATE",1,7) AS ym, "OFFENSE_DESCRIPTION" AS d, "DISTRICT" AS dist, count(*) AS n ` +
          `FROM "${RES[label]}" GROUP BY 1,2,3 ORDER BY 1,2,3 LIMIT ${PAGE} OFFSET ${offset}`,
        `grouped ${label} p${pages}`,
      );
      pages++;
      for (const r of rows) {
        const n = Number(r.n);
        assert(Number.isFinite(n) && n > 0, `grouped ${label}: bad count ${r.n}`);
        resTotal += n;
        const mi = MONTH_IDX.get(r.ym);
        if (mi === undefined) {
          if (r.ym < YM_START) preWindow += n;
          else postWindow += n;
          outOfWindowMonths.set(r.ym, (outOfWindowMonths.get(r.ym) || 0) + n);
          continue;
        }
        const { cat } = catOf(r.d);
        descTotals.set(r.d, (descTotals.get(r.d) || 0) + n);
        cityByCatMonth[cat][mi] += n;
        if (DISTRICT_NAMES[r.dist]) cells[r.dist][mi][cat] += n;
        else {
          assert(JUNK_DISTRICTS.has(r.dist), `grouped ${label}: unexpected DISTRICT '${r.dist}'`);
          junkByCatMonth[cat][mi] += n;
          junkDistrictSeen.set(r.dist ?? "(null)", (junkDistrictSeen.get(r.dist ?? "(null)") || 0) + n);
        }
      }
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
    groupedTotalByRes[label] = resTotal;
    console.log(`  ${label}: ${resTotal} rows via ${pages} grouped page(s)`);
  }

  // ---- 3. Independent verification: COUNT(*) per resource -------------------
  console.log("── Reconciliation: grouped sums vs independent COUNT(*) per resource");
  let sourceTotalAllRows = 0;
  for (const label of RES_LABELS) {
    const [{ count }] = await sql(`SELECT count(*) AS count FROM "${RES[label]}"`, `count ${label}`);
    const c = Number(count);
    assert(
      c === groupedTotalByRes[label],
      `resource ${label}: grouped sum ${groupedTotalByRes[label]} != COUNT(*) ${c} (truncated page?)`,
    );
    sourceTotalAllRows += c;
    console.log(`  ${label}: ${c} == grouped sum ✓`);
  }

  // ---- 4. Dataset-level totals ----------------------------------------------
  const totalRecords = sourceTotalAllRows - preWindow - postWindow; // window rows
  let placedRecords = 0;
  for (const code of DIST_CODES)
    for (const cc of cells[code]) placedRecords += cc.persons + cc.property + cc.society + cc.other;
  const noDistrict = CAT_KEYS.reduce((s, c) => s + junkByCatMonth[c].reduce((a, b) => a + b, 0), 0);
  const unplacedRecords = noDistrict;
  assert(placedRecords + unplacedRecords === totalRecords, "placed+unplaced != window total");
  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  for (const c of CAT_KEYS) catTotals[c] = cityByCatMonth[c].reduce((a, b) => a + b, 0);
  assert(CAT_KEYS.reduce((s, c) => s + catTotals[c], 0) === totalRecords, "catTotals != window total");
  const coveragePct = Math.round((placedRecords / totalRecords) * 1000) / 10;
  console.log(
    `  window ${YM_START}…${YM_END}: ${totalRecords} rows = ${placedRecords} placed + ${noDistrict} no-district` +
      ` → coverage ${coveragePct}% · excluded out-of-window: ${preWindow} pre + ${postWindow} partial-current` +
      ` (${[...outOfWindowMonths.entries()].map(([m, n]) => `${m}:${n}`).join(", ")})`,
  );
  // mapping coverage: explicit rules must cover ≥95% of window rows
  let fallbackCount = 0;
  for (const [d, n] of descTotals) if (catOf(d).rule.startsWith("(fallback")) fallbackCount += n;
  const explicitPct = Math.round(((totalRecords - fallbackCount) / totalRecords) * 1000) / 10;
  assert(explicitPct >= 95, `explicit mapping covers ${explicitPct}% < 95%`);
  console.log(`  category mapping: explicit rules cover ${explicitPct}% (fallback→other: ${fallbackCount} rows)`);
  // BPD publishes no rape/sexual-assault records — verify absence, disclose (never imply zero sex crimes)
  const sexDescs = [...descTotals.keys()].filter((d) => /RAPE|SEXUAL ASSAULT/i.test(String(d)));
  console.log(
    sexDescs.length
      ? `  NOTE: sexual-violence descriptions present: ${sexDescs.join("; ")}`
      : "  confirmed: no rape/sexual-assault descriptions in the public file (BPD privacy exclusion — disclosed)",
  );

  // ---- 5. Sampled REAL points ------------------------------------------------
  console.log("── Real incident points (source Lat/Long; deterministic ≤100/month sample)");
  const pts = [];
  let fetched = 0,
    rejected = 0;
  for (const ym of MONTHS) {
    const rows = await sql(
      `SELECT "OCCURRED_ON_DATE" AS dt, "Lat" AS lat, "Long" AS lng, "OFFENSE_DESCRIPTION" AS d ` +
        `FROM "${ownerOf(ym)}" WHERE substr("OCCURRED_ON_DATE",1,7) = '${ym}' ` +
        `AND "Lat" IS NOT NULL AND "Lat" NOT IN ('', '0', '0.0') ORDER BY "_id" LIMIT 150`,
      `points ${ym}`,
    );
    const monthPts = [];
    for (const r of rows) {
      fetched++;
      const lat = Number(r.lat),
        lng = Number(r.lng);
      if (
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
      monthPts.push([Number(lng.toFixed(6)), Number(lat.toFixed(6)), CAT_KEYS.indexOf(catOf(r.d).cat)]);
    }
    if (monthPts.length > 100) {
      const out = [];
      for (let i = 0; i < 100; i++) out.push(monthPts[Math.floor((i * monthPts.length) / 100)]);
      pts.push(out);
    } else pts.push(monthPts);
  }
  const ptsKept = pts.reduce((s, a) => s + a.length, 0);
  // placeable rows in window (textual not-null-not-zero filter; bbox gate is client-side)
  let placeableCount = 0;
  for (const label of RES_LABELS) {
    const [{ count }] = await sql(
      `SELECT count(*) AS count FROM "${RES[label]}" WHERE substr("OCCURRED_ON_DATE",1,7) >= '${YM_START}' ` +
        `AND substr("OCCURRED_ON_DATE",1,7) <= '${YM_END}' AND "Lat" IS NOT NULL AND "Lat" NOT IN ('', '0', '0.0')`,
      `placeable ${label}`,
    );
    placeableCount += Number(count);
  }
  const coordlessCount = totalRecords - placeableCount;
  const coordlessPct = Math.round((coordlessCount / totalRecords) * 1000) / 10;
  const sampleRate = Math.round(placeableCount / ptsKept);
  console.log(
    `  fetched ${fetched} candidates, rejected ${rejected} (unparseable/out-of-bbox), kept ${ptsKept}` +
      ` of ${placeableCount} placeable (1 per ~${sampleRate}); ${coordlessCount} rows (${coordlessPct}%) have` +
      ` null/zero coords — still counted in the timeline via DISTRICT`,
  );

  // ---- 6. Dispatch feed --------------------------------------------------------
  console.log("── Feed: 8 real items per quarter, 2015-Q3 … 2026-Q2");
  const feed = [];
  const distList = DIST_CODES.map((c) => `'${c}'`).join(",");
  for (let y = 2015; y <= 2026; y++) {
    for (let q = 0; q < 4; q++) {
      const qStart = `${y}-${String(q * 3 + 1).padStart(2, "0")}`;
      const qEnd = `${y}-${String(q * 3 + 3).padStart(2, "0")}`;
      const start = qStart < YM_START ? YM_START : qStart;
      const end = qEnd > YM_END ? YM_END : qEnd;
      if (start > end || qEnd < YM_START || qStart > YM_END) continue;
      const rows = await sql(
        `SELECT "OCCURRED_ON_DATE" AS dt, "OFFENSE_DESCRIPTION" AS d, "STREET" AS st, "DISTRICT" AS dist ` +
          `FROM "${ownerOf(start)}" WHERE substr("OCCURRED_ON_DATE",1,7) >= '${start}' ` +
          `AND substr("OCCURRED_ON_DATE",1,7) <= '${end}' AND "DISTRICT" IN (${distList}) ORDER BY "_id" LIMIT 8`,
        `feed ${y}Q${q + 1}`,
      );
      for (const r of rows) {
        assert(DISTRICT_NAMES[r.dist], `feed: unexpected district '${r.dist}'`);
        feed.push({
          date: String(r.dt).slice(0, 10),
          title: r.d ? titleCase(r.d) : "Offense (unspecified)",
          place: r.st ? titleCase(r.st) : "",
          beat: r.dist,
          cat: catOf(r.d).cat,
        });
      }
    }
  }
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`  ${feed.length} feed items (chronological, no seriousness bias)`);

  // ---- 7. FBI UCR history 1985–2015 (LAST: DEMO_KEY is aggressively limited) ---
  console.log(`── FBI CDE history (${ORI}, 1985–2015, key=${FBI_KEY === "DEMO_KEY" ? "DEMO_KEY" : "FBI_API_KEY"})`);
  async function fetchAnnual(offense) {
    const url = `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/${offense}?from=${HIST_FROM}&to=${HIST_TO}&API_KEY=${FBI_KEY}`;
    const waits = [90000, 300000, 300000, 300000]; // 90s → 300s, ≤ ~20 min total
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
      const agKey =
        Object.keys(actuals).find((k) => /Boston/i.test(k) && /Offenses/i.test(k)) ||
        Object.keys(actuals).find((k) => /Boston/i.test(k)) ||
        Object.keys(actuals).find((k) => !/United States/i.test(k) && /Offenses/i.test(k));
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
  if (violent.monthly["01-1985"] !== undefined && Number(violent.monthly["01-1985"]) !== 832)
    console.warn(`  note: Jan-1985 violent=${violent.monthly["01-1985"]} (expected 832 from prior verification)`);
  const droppedYears = [];
  const years = [];
  for (let y = 1985; y <= 2015; y++) {
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

  // ---- Assemble output files ---------------------------------------------------
  const timeline = { months: MONTHS, cells };
  const beatsFile = { cats: CATS, beats };
  const summary = {
    slug: "boston-ma",
    title: "Boston · MA",
    source: { records: SQL_API, beats: GIS_URL, hub: HUB },
    fetchedAt,
    dateMin: "2015-08-01",
    dateMax: "2026-06-30",
    months: MONTHS.length,
    totalRecords,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: { "no-district": noDistrict },
    catTotals,
    cats: CATS,
    beatCount: Object.keys(beats).length,
  };
  const history = {
    era: "history",
    taxonomy:
      "FBI UCR Summary (Violent + Property) — a different taxonomy than the BPD incident categories used from Aug 2015; the two eras bridge at 2016 and are never equated",
    agency: AGENCY,
    ori: ORI,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      `Annual totals are real UCR Summary counts fetched from the FBI CDE summarized agency endpoint for ORI ${ORI} ` +
      `(12 reported months verified per year). UCR Summary (Violent/Property) and BPD incident records are different ` +
      `taxonomies and are presented as distinct eras; district-level detail exists only from Aug 2015 (BPD's new ` +
      `records system), so the story bridges from citywide annual history (through 2015) to per-district monthly data ` +
      `whose first full calendar year is 2016. Reproduce with pipeline/sources/boston-ma.mjs (set FBI_API_KEY to ` +
      `avoid DEMO_KEY rate limits).` +
      (droppedYears.length ? ` Dropped partial years: ${droppedYears.map((d) => d.year).join(", ")}.` : ""),
    yearMin,
    yearMax,
    cats: {
      violent: { label: "UCR Violent (murder, rape, robbery, agg. assault)", color: "#ff4d6d" },
      property: { label: "UCR Property (burglary, larceny, MV theft)", color: "#38bdf8" },
    },
    years,
  };
  const neighborhoods = {
    source: "Boston Police Department districts (official)",
    sourceUrl: GIS_URL,
    hub: "https://data.boston.gov/",
    fetchedAt,
    license: "ODC-PDDL (Open Data Commons Public Domain Dedication and License)",
    method:
      "identity — BPD crime records carry the official district code (A1…E18) verbatim; polygons join 12↔12 on the " +
      `DISTRICT field with no spatial approximation. Resident-known district names are the official boston.gov ` +
      `police-district names (${NAMES_URL}).`,
    map: Object.fromEntries(DIST_CODES.map((c) => [c, { name: DISTRICT_NAMES[c], approx: false }])),
  };
  const points = {
    mode: "real-sample",
    note:
      `Every dot is a real reported incident location published by BPD; ${coordlessPct}% of records have null/zero ` +
      `coordinates and are counted in the timeline (placed by DISTRICT) but not plotted. Deterministic sample (≤100/month).`,
    sampleRate,
    months: MONTHS,
    pts,
  };

  // ---- VALIDATE (fail loudly) ----------------------------------------------------
  console.log("── Validation");
  assert(
    MONTHS.length === 131 && MONTHS[0] === "2015-08" && MONTHS[130] === "2026-06",
    "months not contiguous 2015-08..2026-06",
  );
  for (let i = 1; i < MONTHS.length; i++) {
    const [py, pm] = MONTHS[i - 1].split("-").map(Number);
    const [cy, cm] = MONTHS[i].split("-").map(Number);
    assert(
      (cm === pm + 1 && cy === py) || (cm === 1 && pm === 12 && cy === py + 1),
      `months not contiguous at ${MONTHS[i]}`,
    );
  }
  assert(Object.keys(beats).length === 12, "beatCount != 12");
  for (const code of DIST_CODES) {
    assert(beats[code], `district '${code}' has no polygon`);
    assert(cells[code], `district '${code}' missing from cells`);
    assert(cells[code].length === MONTHS.length, `cells['${code}'] length != ${MONTHS.length}`);
    const t = cells[code].reduce((s, cc) => s + cc.persons + cc.property + cc.society + cc.other, 0);
    assert(t > 0, `district '${code}' has zero records across the whole window`);
  }
  for (const k of Object.keys(cells)) assert(beats[k], `cells key '${k}' has no beat polygon`);
  // identity per month × cat: placed + unplaced == citywide
  for (const cat of CAT_KEYS) {
    for (let mi = 0; mi < MONTHS.length; mi++) {
      let placed = 0;
      for (const code of DIST_CODES) placed += cells[code][mi][cat];
      assert(
        placed + junkByCatMonth[cat][mi] === cityByCatMonth[cat][mi],
        `month ${MONTHS[mi]} cat ${cat}: placed+unplaced != citywide`,
      );
    }
  }
  console.log("  placed + unplaced == citywide for all 131 months × 4 cats ✓");
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
    assert(f.date >= "2015-08-01" && f.date <= "2026-06-30", `feed date out of span ${f.date}`);
    assert(DISTRICT_NAMES[f.beat], `feed beat '${f.beat}' not a district`);
  }
  const recomputedCoverage = Math.round((placedRecords / totalRecords) * 1000) / 10;
  assert(recomputedCoverage === summary.coveragePct, "coveragePct mismatch on recompute");
  for (const [name, obj] of Object.entries({ timeline, beatsFile, summary, history, neighborhoods, points, feed }))
    scanFinite(obj, name);

  // ---- Write --------------------------------------------------------------------
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
    coordlessCount,
    coordlessPct,
    ptsKept,
    sampleRate,
    catTotals,
    descTotals,
    junkDistrictSeen,
    groupedTotalByRes,
    RES,
    RES_LABELS,
    preWindow,
    postWindow,
    outOfWindowMonths,
    explicitPct,
    fallbackCount,
  });
  appendWiki({ summary, history });

  console.log("\n── Final summary.json");
  console.log(JSON.stringify(summary, null, 2));

  // ---- Story numbers (for the report; all derived from validated data) ----------
  console.log("\n── Story numbers");
  const peak = years.reduce((a, b) => (b.total > a.total ? b : a));
  const y1985 = years.find((y) => y.year === 1985);
  const y2015 = years.find((y) => y.year === 2015);
  console.log(`  history: 1985 total=${y1985?.total} · peak ${peak.year}=${peak.total} · 2015=${y2015?.total}`);
  const yearTotal = (yr, excludeOther) => {
    let s = 0;
    MONTHS.forEach((m, mi) => {
      if (!m.startsWith(String(yr))) return;
      for (const c of CAT_KEYS) if (!(excludeOther && c === "other")) s += cityByCatMonth[c][mi];
    });
    return s;
  };
  console.log(
    `  citywide 2016=${yearTotal(2016)} vs 2025=${yearTotal(2025)} (all rows); crime-only (excl. other): 2016=${yearTotal(2016, true)} vs 2025=${yearTotal(2025, true)}`,
  );
  const distYear = (code, yr) => {
    let s = 0;
    MONTHS.forEach((m, mi) => {
      if (!m.startsWith(String(yr))) return;
      const cc = cells[code][mi];
      s += cc.persons + cc.property + cc.society + cc.other;
    });
    return s;
  };
  const d2025 = DIST_CODES.map((c) => [c, distYear(c, 2025)]).sort((a, b) => b[1] - a[1]);
  console.log(`  districts 2025: ${d2025.map(([c, n]) => `${DISTRICT_NAMES[c]} (${c})=${n}`).join(" · ")}`);
  const delta = DIST_CODES.map((c) => {
    const a = distYear(c, 2022),
      b = distYear(c, 2025);
    return [c, a, b, a ? Math.round(((b - a) / a) * 1000) / 10 : null];
  }).sort((x, y) => Math.abs(y[3]) - Math.abs(x[3]));
  console.log(
    `  2022→2025 changes: ${delta.map(([c, a, b, p]) => `${DISTRICT_NAMES[c]}: ${a}→${b} (${p > 0 ? "+" : ""}${p}%)`).join(" · ")}`,
  );
  let hiM = null,
    hiN = -1;
  MONTHS.forEach((m, mi) => {
    if (m < "2021-07") return;
    let s = 0;
    for (const c of CAT_KEYS) s += cityByCatMonth[c][mi];
    if (s > hiN) (hiN = s), (hiM = m);
  });
  console.log(`  highest month (last 5 yrs, all rows): ${hiM} = ${hiN}`);

  console.log("\nVALIDATION PASS");
}

// ---- PROVENANCE.md ---------------------------------------------------------------
function writeProvenance(x) {
  const {
    fetchedAt,
    summary,
    history,
    droppedYears,
    placeableCount,
    coordlessCount,
    coordlessPct,
    ptsKept,
    sampleRate,
    catTotals,
    descTotals,
    junkDistrictSeen,
    groupedTotalByRes,
    RES,
    RES_LABELS,
    preWindow,
    postWindow,
    outOfWindowMonths,
    explicitPct,
    fallbackCount,
  } = x;
  const n = (v) => v.toLocaleString("en-US");
  const mappingRows = [...descTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([d, c]) => {
      const { cat, rule } = catOf(d);
      return `| ${String(d).replace(/\|/g, "\\|")} | ${n(c)} | \`${cat}\` | ${rule} |`;
    })
    .join("\n");
  const md = `# Provenance — Boston, MA

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **Crime Incident Reports (August 2015 – To Date) (Source: New System)** — CKAN package \`${PKG}\` |
| Publisher | Boston Police Department, via Analyze Boston (data.boston.gov) |
| Landing page | ${HUB} |
| API | ${SQL_API} (SQL **POSTed as JSON** — the Cloudflare WAF 403s SQL in GET query strings) |
| Fetched | ${fetchedAt} |
| License | **ODC-PDDL** (Open Data Commons Public Domain Dedication and License) — attribute "Boston Police Department via Analyze Boston" |
| Records used | ${n(summary.totalRecords)} (OCCURRED_ON_DATE ${summary.dateMin} → ${summary.dateMax}) |
| Source caveat | Reports can be reclassified/updated by BPD; the 2023-to-present resource updates daily |

### Resources (one CKAN datastore resource per period)

| Period | Resource id | Rows (all, at fetch) |
|--------|-------------|---------------------:|
${RES_LABELS.map((l) => `| ${l === "2023p" ? "2023 → present" : l} | \`${RES[l]}\` | ${n(groupedTotalByRes[l])} |`).join("\n")}

Row totals per resource were independently verified: the paged grouped aggregation used for the timeline sums exactly to \`COUNT(*)\` for every resource (guards against silent pagination truncation).

### Windowing (disclosed exclusions)

- **${n(preWindow)} rows before 2015-08** are excluded: the package is titled "August 2015 to date", but the 2015 file also contains a partial June + July 2015 from the new records system's ramp-up. Excluded months at fetch: ${[...outOfWindowMonths.entries()].filter(([m]) => m < "2015-08").map(([m, c]) => `${m} (${n(c)})`).join(", ")}.
- **${n(postWindow)} rows in the partial current month** (${[...outOfWindowMonths.entries()].filter(([m]) => m > "2026-06").map(([m, c]) => `${m}, ${n(c)} rows at fetch`).join("; ")}) are excluded; the window ends at the last full month.
- 2023-to-present timestamps carry a \`+00\` suffix (e.g. \`2023-01-27 22:44:00+00\`); earlier files are plain local timestamps. Dates are used **as published** (first 10 characters); no timezone conversion is applied.

### Fields used

\`OCCURRED_ON_DATE\` · \`OFFENSE_DESCRIPTION\` · \`DISTRICT\` · \`STREET\` · \`Lat\`/\`Long\` (TEXT) · \`INCIDENT_NUMBER\`/\`OFFENSE_CODE\` (inspection only). The legacy \`OFFENSE_CODE_GROUP\`/\`UCR_PART\` fields are null from 2020 on, so categories are derived from \`OFFENSE_DESCRIPTION\` (below).

### Placement = DISTRICT (not coordinates)

Timeline counts place rows by the **\`DISTRICT\` code** (verbatim, no spatial join). Coordinates gate only the dot layer (\`points.json\`). Rows with a non-district value are **unplaced** and disclosed: ${[...junkDistrictSeen.entries()].map(([k, v]) => `\`${k}\` ${n(v)}`).join(" · ")} — total ${n(summary.unplacedRecords)} (${(100 - summary.coveragePct).toFixed(1)}% of the window).

### Districts (official resident-known names)

The 12 BPD district codes map to the official **boston.gov police-district names** (source: ${NAMES_URL} — the "Districts" pages):

| Code | Name | Code | Name |
|------|------|------|------|
| A1 | Downtown & Beacon Hill | C11 | Dorchester |
| A15 | Charlestown | D4 | South End |
| A7 | East Boston | D14 | Allston/Brighton |
| B2 | Roxbury | E5 | West Roxbury |
| B3 | Mattapan | E13 | Jamaica Plain |
| C6 | South Boston | E18 | Hyde Park |

### Known content gap (disclosed, not fixable from this source)

BPD's public incident file **excludes rape and sexual-assault reports** (privacy protection). The script verifies no such descriptions exist in the data and the video must not imply those crimes are zero — they are simply not published at incident level.

### Category mapping (OFFENSE_DESCRIPTION → cat)

The new-system file has **no NIBRS group field**. Categories are derived from \`OFFENSE_DESCRIPTION\` via ordered keyword rules (service/procedural overrides first, then persons / property / society; first match wins; unmatched → \`other\`). Explicit rules cover **${explicitPct}%** of window rows (${n(fallbackCount)} rows fall through to \`other\`). Boston's file includes a large share of **non-crime service records** (investigations, medical assists, towed vehicles, accidents…) — these are mapped to \`other\`, labeled "${CATS.other.label}", and never counted as crime.

| cat | Window count |
|-----|-------------:|
| \`persons\` | ${n(catTotals.persons)} |
| \`property\` | ${n(catTotals.property)} |
| \`society\` | ${n(catTotals.society)} |
| \`other\` | ${n(catTotals.other)} |

Judgment calls (documented): leaving-scene and auto-law (VAL) records → \`other\` (traffic context); warrant/fugitive processing → \`other\` (procedural); recovered vehicles/property → \`other\`; drug-related **sick assists** → \`other\` (medical response, not an offense); restraining/harassment-prevention **order violations** → \`society\`; OUI → \`society\`; trespassing → \`society\`; robbery → \`property\` (NIBRS crime-against-property).

#### Full description table (window counts at fetch time)

| OFFENSE_DESCRIPTION (verbatim) | Count | cat | rule |
|---|--:|---|---|
${mappingRows}

### Coverage

- Placed (one of the 12 districts, ${summary.dateMin}…${summary.dateMax}): **${n(summary.placedRecords)}** (${summary.coveragePct}%)
- Unplaced (non-district DISTRICT values, disclosed above): ${n(summary.unplacedRecords)}
- Identity \`placed + unplaced == citywide\` validated per month × category in-script; per-resource grouped sums verified against independent \`COUNT(*)\`.

## Geometry source — BPD district polygons

| Field | Value |
|-------|-------|
| Dataset | **Boston Police Districts** — 12 polygons (official City of Boston GIS) |
| MapServer | https://gisportal.boston.gov/arcgis/rest/services/PublicSafety/OpenData/MapServer/5 |
| Join key | \`DISTRICT\` — matches the crime data's district codes **verbatim 12↔12** (no fuzzy matching) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (\`points.json\`)

\`Lat\`/\`Long\` are TEXT in the source; **${n(coordlessCount)} window rows (${coordlessPct}%) are null-or-zero** and get no dot — but they are still counted in every timeline total via \`DISTRICT\`. Points shown are **real incident coordinates published by BPD**, never synthesized. Client-side gate: parseable lat ${BBOX.latMin}–${BBOX.latMax}, lng ${BBOX.lngMin}–${BBOX.lngMax}. Deterministic sample: per month, first 150 rows in \`_id\` order with non-null/non-zero coords, gated, even-stride ≤100/month → **${n(ptsKept)} points ≈ 1 per ${sampleRate} of the ${n(placeableCount)} placeable rows** (placeable = textual not-null/not-zero filter; the bbox gate re-rejects residual junk client-side).

## Historical source — FBI UCR (${history.yearMin}–${history.yearMax} deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Boston Police Department — **ORI \`${ORI}\`** |
| Endpoint | ${history.sourceUrl} (and \`/property-crime\`) |
| Span | ${history.yearMin}–${history.yearMax}, annual Violent + Property (12 reported months verified per year)${droppedYears.length ? ` — dropped partial years: ${droppedYears.map((d) => d.year).join(", ")}` : ""} |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set \`FBI_API_KEY\`) |

UCR Summary (Violent/Property) is a **different taxonomy** than the BPD incident categories — the eras are presented as distinct; history runs through 2015 and the granular era's first full calendar year is 2016. No monthly or district detail is implied for ${history.yearMin}–${history.yearMax}.

## Reproduce

\`\`\`bash
FBI_API_KEY=… node pipeline/sources/boston-ma.mjs
\`\`\`
`;
  writeFileSync(PROV_PATH, md);
  console.log(`  wrote data/boston-ma/PROVENANCE.md`);
}

// ---- wiki/Data-Provenance.md append ------------------------------------------------
function appendWiki({ summary, history }) {
  if (!existsSync(WIKI_PATH)) return;
  const cur = readFileSync(WIKI_PATH, "utf8");
  if (cur.includes("## Boston, MA")) {
    console.log("  wiki/Data-Provenance.md already has a Boston section — skipped");
    return;
  }
  const n = (v) => v.toLocaleString("en-US");
  const section = `
## Boston, MA (\`boston-ma\`)

- **Primary source:** Crime Incident Reports (August 2015 – To Date, Source: New System)
  (CKAN package on Analyze Boston, ${HUB}) —
  **ODC-PDDL**, attribution "Boston Police Department via Analyze Boston". Nine datastore
  resources (yearly 2015–2022 + "2023 to present", updated daily). SQL must be **POSTed**
  (Cloudflare WAF blocks SQL in GET query strings).
- **Spatial unit:** the 12 official **BPD police districts** — the crime data's \`DISTRICT\`
  code joins the boston.gov GIS polygon layer (\`PublicSafety/OpenData/MapServer/5\`)
  **verbatim 12↔12**. Resident-known names are the official boston.gov police-district
  names (Downtown & Beacon Hill, Roxbury, Dorchester, …) per ${NAMES_URL}.
- **Placement:** rows are placed by \`DISTRICT\`, not coordinates — the ~4.6% of rows with
  null/zero \`Lat/Long\` still count in every timeline total; coordinates only gate the
  dot layer.
- **Categories:** the new-system file has **no NIBRS group field**; categories derive from
  \`OFFENSE_DESCRIPTION\` via ordered keyword rules (full table with counts in
  [\`data/boston-ma/PROVENANCE.md\`](../data/boston-ma/PROVENANCE.md)). A large share of
  the file is **non-crime service records** (investigations, medical assists, towed
  vehicles, accidents) — mapped to \`other\` ("Service / non-crime (context)"), never
  counted as crime.
- **Deep-history source (${history.yearMin}–${history.yearMax}):** FBI Crime Data Explorer (CDE) —
  Boston PD, **ORI ${ORI}** — real annual Violent + Property counts, ${history.years.length} full years
  (12 reported months each, verified). UCR taxonomy kept distinct; history runs through
  2015, granular first full year is 2016.
- **Span:** ${history.yearMin}–${history.yearMax} (FBI UCR annual) + 2015-08-01 → 2026-06-30 (BPD incidents
  with district detail, ${summary.months} months). Partial pre-Aug-2015 ramp-up rows and the
  partial current month are excluded and disclosed.
- **Records:** ${n(summary.totalRecords)} in window · ${n(summary.placedRecords)} placed in a district
  (**${summary.coveragePct}% coverage**) · ${n(summary.unplacedRecords)} unplaced (null/"External"/"Outside of"
  district), kept in totals and disclosed.
- **Known gap:** BPD's public file **excludes rape/sexual-assault reports** (privacy) —
  disclosed; the video must not imply those are zero.
- **License:** ODC-PDDL (both incidents and polygons; City of Boston open data).
- **Detail:** [\`data/boston-ma/PROVENANCE.md\`](../data/boston-ma/PROVENANCE.md)
`;
  const marker = "## Ranked source types";
  const idx = cur.indexOf(marker);
  const next = idx >= 0 ? cur.slice(0, idx) + section.trimStart() + "\n" + cur.slice(idx) : cur + section;
  writeFileSync(WIKI_PATH, next);
  console.log("  appended Boston section to wiki/Data-Provenance.md");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
