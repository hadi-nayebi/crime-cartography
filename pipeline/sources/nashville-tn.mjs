// Nashville, TN — Metro Nashville PD (MNPD) incident data source pipeline (fetch → normalize → validate).
//
// BINDING RULE: never fabricate — every figure written by this script comes
// straight from a queryable public source; every gap is disclosed.
//
// Sources:
//   Incidents  : "Metro Nashville Police Department Incidents" hosted ArcGIS view
//                (2019-01-01 → current, refreshed continually), Nashville Open Data.
//                https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Metro_Nashville_Police_Department_Incidents_view/FeatureServer/0
//                Item d747436243e9439e968fce056545016a — licenseInfo EMPTY (no
//                license stated); accessInformation "Metro Nashville Police
//                Department, Information Technology" → attributed accordingly.
//   Polygons   : official Police Precinct Boundaries (same org, 9 precincts,
//                field PrecinctName: CENTRAL, EAST, HERMITAGE, MADISON, MIDTOWN
//                HILLS, NORTH, SOUTH, SOUTHEAST, WEST).
//                https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Police_Precinct_Boundaries_view/FeatureServer/0
//   History    : FBI Crime Data Explorer (CDE) summarized agency counts,
//                Metropolitan Nashville PD ORI TN0190100, 1985–2018 annual
//                Violent + Property ("Offenses" series matched explicitly —
//                the response also carries a "Clearances" series).
//
// Grain & honesty structure (the three headline disclosures):
//   1. OFFENSE×VICTIM-LEVEL ROWS → INCIDENTS. The layer publishes one row per
//      offense×victim within an incident (Primary_Key = <Incident_Number>_<Offense><Victim>);
//      ~911k rows collapse to ~755k incidents. All counts shown are INCIDENTS,
//      deduplicated by Incident_Number; the representative row is the incident's
//      FIRST-LISTED offense (lowest Offense_Number, then Victim_Number, then
//      OBJECTID) — a documented judgment call (MNPD publishes no severity
//      hierarchy), same family as Milwaukee's "first code classifies".
//   2. UNFOUNDED EXCLUDED FROM CRIME CATS. Incident_Status "U — UNFOUNDED"
//      incidents whose representative offense is a NIBRS crime category are
//      EXCLUDED from persons/property/society (FBI UCR/NIBRS practice: unfounded
//      complaints are removed from offense counts) — counted and disclosed,
//      ~1.2% of Group-A rows. Local non-NIBRS "matrix" codes (POLICE INQUIRY,
//      LOST/FOUND PROPERTY, natural death, …) go to `other` (context) with NO
//      status filter — "U" is their routine closing status, not a falsity finding.
//   3. SPATIAL JOIN. Zone/RPA are numeric and ~61% null; the crime file carries
//      no precinct name. Placement is point-in-polygon of the MNPD-published
//      coordinates (rounded to ~2–3 decimals by the source — block-ish grain,
//      disclosed) into the 9 official precinct polygons (holes handled).
//
// Eras:
//   1985–2018  FBI UCR annual citywide totals (no precinct detail implied)
//   2019-01 → 2026-06  MNPD incidents with official-precinct detail. The layer
//              starts exactly at 2019-01-01 local (verified: 0 earlier rows);
//              partial 2026-07 excluded and disclosed.
//
// Dates: Incident_Occurred (when the offense happened, not Incident_Reported)
// is a TRUE UTC instant of the local event time (verified: dataset min =
// 2019-01-01 06:00Z = local CST midnight; UTC hour-of-day low sits at 9–11Z =
// 4–5 AM local). ALL month binning uses America/Chicago local time; month
// boundaries are queried back against the source as exact UTC instants.
//
//   node pipeline/sources/nashville-tn.mjs   (FBI_API_KEY env, else .secrets/fbi_api_key, else DEMO_KEY)
//
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const OUT_DIR = resolve(repoRoot, "data/nashville-tn/normalized");
const RAW_DIR = resolve(repoRoot, "data/nashville-tn/raw");
const PROV_PATH = resolve(repoRoot, "data/nashville-tn/PROVENANCE.md");
const WIKI_PATH = resolve(repoRoot, "wiki/Data-Provenance.md");

const ARC_LAYER =
  "https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Metro_Nashville_Police_Department_Incidents_view/FeatureServer/0";
const ARC = `${ARC_LAYER}/query`;
const PREC_LAYER =
  "https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Police_Precinct_Boundaries_view/FeatureServer/0";
const HUB_ITEM = "https://www.arcgis.com/home/item.html?id=d747436243e9439e968fce056545016a";
const HUB = "https://data.nashville.gov/";
const ORI = "TN0190100";
const AGENCY = "Metropolitan Nashville Police Department";
let FBI_KEY = process.env.FBI_API_KEY || "";
if (!FBI_KEY) {
  const p = resolve(repoRoot, ".secrets/fbi_api_key");
  if (existsSync(p)) FBI_KEY = readFileSync(p, "utf8").trim();
}
if (!FBI_KEY) FBI_KEY = "DEMO_KEY";

// Granular window by LOCAL (America/Chicago) occurrence month.
const YM_START = "2019-01"; // inclusive (layer starts exactly 2019-01-01 local)
const YM_END = "2026-06"; // inclusive — 2026-07 is a partial month at fetch time
const HIST_FROM = "01-1985";
const HIST_TO = "12-2018";

const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff2e63" },
  property: { label: "Crimes Against Property", color: "#ffc233" },
  society: { label: "Crimes Against Society", color: "#34e0e0" },
  other: { label: "Non-NIBRS local / Group B (context)", color: "#7486a0" },
};
const CAT_KEYS = ["persons", "property", "society", "other"]; // catIdx order

// ---- Offense_NIBRS code → { name, cat } ------------------------------------
// TIBRS = Tennessee Incident Based Reporting System (the state NIBRS program
// MNPD reports through). Group A codes map to the FBI crimes-against
// categories; 13D Stalking is a Tennessee Group A crime-against-person code
// (descriptions in-data are all stalking offenses). Group B codes (90-series)
// are arrest-level offenses with no crimes-against category → `other`.
// MNPD local 600/700/800-series "matrix" codes are administrative/non-NIBRS
// event records (police inquiry, lost/found property, natural death, …) →
// `other`, each named from its measured in-data description. 09C justifiable
// homicide is "not a crime" per NIBRS → `other`.
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
  "13D": ["Stalking (TIBRS Tennessee Group A code)", "persons"],
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
  // MNPD local non-NIBRS "matrix" codes (names = measured in-data descriptions)
  620: ["Accidental Injury (MNPD local, non-NIBRS)", "other"],
  680: ["Death — Unnatural / Accidental (MNPD local, non-NIBRS)", "other"],
  685: ["Death — Natural (MNPD local, non-NIBRS)", "other"],
  690: ["Suicide (MNPD local, non-NIBRS)", "other"],
  695: ["Unknown Death (MNPD local, non-NIBRS)", "other"],
  700: ["Escape (MNPD local, non-NIBRS)", "other"],
  715: ["Found Property (MNPD local, non-NIBRS)", "other"],
  730: ["Indecent Exposure (MNPD local, non-NIBRS)", "other"],
  735: ["Civil Case (MNPD local, non-NIBRS)", "other"],
  740: ["Police Inquiry / Transport (MNPD local, non-NIBRS)", "other"],
  760: ["Overdose (MNPD local, non-NIBRS)", "other"],
  780: ["Recovery of Stolen Property (MNPD local, non-NIBRS)", "other"],
  790: ["Riot — Inciting (MNPD local, non-NIBRS)", "other"],
  810: ["Lost Property (MNPD local, non-NIBRS)", "other"],
  850: ["Protection Order Violation (MNPD local, non-NIBRS)", "other"],
};
const unknownCodeSeen = new Map(); // codes outside NIBRS{} → other, disclosed
function catOf(rawCode) {
  const code = rawCode == null ? "" : String(rawCode).trim().toUpperCase();
  if (code === "") return { code: "(null)", name: "No offense code published", cat: "other" };
  const hit = NIBRS[code];
  if (hit) return { code, name: hit[0], cat: hit[1] };
  unknownCodeSeen.set(code, (unknownCodeSeen.get(code) || 0) + 1);
  return { code, name: `Unrecognized code ${code}`, cat: "other" };
}

// Valid Davidson County coordinate box. WIDER than the batch-1 scout bbox
// (35.98–36.41 / −87.05…−86.52) — the official precinct polygons extend to
// lat 35.9678–36.4051, lng −87.0549…−86.5116, so the scouted box would clip
// county corners. Measured & documented deviation.
const BBOX = { latMin: 35.96, latMax: 36.41, lngMin: -87.06, lngMax: -86.51 };

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

async function arcCount(where, label, distinctField = null) {
  const params = { f: "json", where, returnCountOnly: "true" };
  if (distinctField) {
    params.returnDistinctValues = "true";
    params.outFields = distinctField;
  }
  const j = await postJSON(ARC, params, { label });
  const n = j.count;
  if (!Number.isFinite(n)) throw new Error(`${label}: bad count response ${JSON.stringify(j)}`);
  return n;
}

// ---- month helpers (America/Chicago local time) ---------------------------
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
const MONTHS = monthRange(YM_START, YM_END); // 90
const MONTH_IDX = new Map(MONTHS.map((m, i) => [m, i]));

const TZ = "America/Chicago";
const dtfParts = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});
function localYmdHour(ms) {
  const p = {};
  for (const { type, value } of dtfParts.formatToParts(new Date(ms))) p[type] = value;
  return { ymd: `${p.year}-${p.month}-${p.day}`, hour: p.hour };
}
const localYmd = (ms) => localYmdHour(ms).ymd;
// UTC instant of local midnight on the 1st of a month (CST=UTC-6 / CDT=UTC-5;
// month boundaries never fall inside a DST transition — asserted anyway).
function utcOfLocalMonthStart(ym) {
  const [y, m] = ym.split("-").map(Number);
  for (const off of [6, 5]) {
    const ms = Date.UTC(y, m - 1, 1, off);
    const { ymd, hour } = localYmdHour(ms);
    if (ymd === `${ym}-01` && hour === "00") return ms;
  }
  fail(`utcOfLocalMonthStart: no CST/CDT offset works for ${ym}`);
}
const nextYm = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const utcLiteral = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

function titleCase(s) {
  return String(s)
    .toLowerCase()
    .replace(/(^|[\s\-/(.])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}
const r6 = (v) => Number(Number(v).toFixed(6));

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
// even-odd ray cast across ALL rings (outer + holes) of all parts — the
// MADISON precinct carries an interior ring, so holes must be handled.
function pointInRings(lng, lat, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
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
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) stack.push([v, `${p}.${k}`]);
  }
}
const zeroCatMonths = () => Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));

// ============================================================================
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(RAW_DIR, { recursive: true });
  const fetchedAt = new Date().toISOString();
  const monthStartMs = MONTHS.map((ym) => utcOfLocalMonthStart(ym));
  const windowEndMs = utcOfLocalMonthStart(nextYm(YM_END));
  const WINDOW_WHERE = `Incident_Occurred >= TIMESTAMP '${utcLiteral(monthStartMs[0])}' AND Incident_Occurred < TIMESTAMP '${utcLiteral(windowEndMs)}'`;

  // ---- 1. Official precinct polygons ----------------------------------------
  console.log("── MNPD official Police Precinct Boundaries (spatial-join layer)");
  const gj = await postJSON(
    `${PREC_LAYER}/query`,
    { f: "geojson", where: "1=1", outFields: "PrecinctName" },
    { label: "precincts geojson" },
  );
  writeFileSync(resolve(RAW_DIR, "precincts.geojson"), JSON.stringify(gj));
  assert(gj?.type === "FeatureCollection" && Array.isArray(gj.features), "precincts: bad geojson");
  assert(gj.features.length === 9, `precincts: expected 9 features, got ${gj.features.length}`);
  const beats = {};
  const joinFeatures = []; // { key, bbox, rings } — ALL rings incl. holes for PIP
  gj.features.forEach((f, idx) => {
    const raw = f.properties?.PrecinctName;
    assert(typeof raw === "string" && raw.trim().length > 0, `precinct feature ${idx}: missing PrecinctName`);
    const key = raw.trim();
    assert(!beats[key], `precincts: duplicate '${key}'`);
    const g = f.geometry;
    const parts = g.type === "Polygon" ? [g.coordinates] : g.coordinates; // MultiPolygon
    const outerRings = parts.map((p) => p[0].map(([lng, lat]) => [r6(lng), r6(lat)]));
    const allRings = parts.flat().map((ring) => ring.map(([lng, lat]) => [r6(lng), r6(lat)]));
    let A = 0,
      X = 0,
      Y = 0;
    for (const ring of outerRings) {
      const { area, cx, cy } = ringAreaCentroid(ring);
      A += area;
      X += cx * area;
      Y += cy * area;
    }
    assert(A > 0, `precinct '${key}': zero area`);
    let latMin = Infinity,
      latMax = -Infinity,
      lngMin = Infinity,
      lngMax = -Infinity;
    for (const ring of allRings)
      for (const [x, y] of ring) {
        if (y < latMin) latMin = y;
        if (y > latMax) latMax = y;
        if (x < lngMin) lngMin = x;
        if (x > lngMax) lngMax = x;
      }
    beats[key] = {
      key,
      name: titleCase(key),
      servcen: "",
      beat: idx,
      centroid: [r6(X / A), r6(Y / A)],
      polygon: outerRings,
      geomType: g.type,
    };
    joinFeatures.push({ key, bbox: { latMin, latMax, lngMin, lngMax }, rings: allRings });
  });
  const HOODS = Object.keys(beats);
  const holed = gj.features.filter((f) => {
    const parts = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    return parts.some((p) => p.length > 1);
  }).length;
  function placePoint(lng, lat) {
    for (const jf of joinFeatures) {
      const b = jf.bbox;
      if (lat < b.latMin || lat > b.latMax || lng < b.lngMin || lng > b.lngMax) continue;
      if (pointInRings(lng, lat, jf.rings)) return jf.key;
    }
    return null;
  }
  // PIP self-test: every precinct centroid must resolve to its own precinct
  let selfHit = 0;
  for (const k of HOODS) {
    const [cx, cy] = beats[k].centroid;
    if (placePoint(cx, cy) === k) selfHit++;
  }
  assert(selfHit >= 8, `PIP self-test: only ${selfHit}/9 precinct centroids self-resolve`);
  console.log(`  9 precincts (${HOODS.map((k) => beats[k].name).join(", ")})`);
  console.log(`  ${holed} feature(s) carry interior rings (holes handled) · PIP self-test ${selfHit}/9 ✓`);

  // ---- 2. Report_Type enumeration (spec directive) ---------------------------
  console.log("── Report_Type enumeration (window rows)");
  const rtRows = await arcAll(
    {
      where: WINDOW_WHERE,
      groupByFieldsForStatistics: "Report_Type,Report_Type_Description",
      outStatistics: JSON.stringify([
        { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
      ]),
    },
    { label: "Report_Type enum" },
  );
  const reportTypes = rtRows
    .map((f) => ({
      type: f.attributes.Report_Type,
      description: f.attributes.Report_Type_Description,
      n: Number(f.attributes.n),
    }))
    .sort((a, b) => b.n - a.n);
  for (const rt of reportTypes)
    console.log(`  ${JSON.stringify(rt.type)} (${JSON.stringify(rt.description)}): ${rt.n}`);
  // Determination (documented): every value is a report-intake designation on
  // offense×victim rows (D=DISPATCHED, S=SUSPECT, W=WITNESS per the source's own
  // descriptions; T/O/CIR/null carry no source description). None is a separate
  // non-incident record type (no supplement/administrative report class), so NO
  // Report_Type is excluded; dedupe by Incident_Number collapses any
  // multi-report duplication regardless.

  // ---- 3. Full raw pull: every window row, month by exact UTC bounds ---------
  console.log(`── Full raw pull (${MONTHS.length} local months; offense×victim rows; 2000/page)`);
  const preWindowRows = await arcCount(
    `Incident_Occurred < TIMESTAMP '${utcLiteral(monthStartMs[0])}'`,
    "pre-window rows",
  );
  assert(preWindowRows === 0, `expected 0 pre-window rows, got ${preWindowRows}`);
  const tailRows = await arcCount(
    `Incident_Occurred >= TIMESTAMP '${utcLiteral(windowEndMs)}'`,
    "partial-tail rows",
  );
  const tailIncidents = await arcCount(
    `Incident_Occurred >= TIMESTAMP '${utcLiteral(windowEndMs)}'`,
    "partial-tail incidents",
    "Incident_Number",
  );
  const nullDateRows = await arcCount(`Incident_Occurred IS NULL`, "null-date rows");
  assert(nullDateRows === 0, `expected 0 null-date rows, got ${nullDateRows}`);

  const inc = new Map(); // Incident_Number → compact incident record
  const rowsByMonth = MONTHS.map(() => 0);
  const rowCodeTotals = new Map(); // code → window row count (for the independent grouped check)
  let rowsSeen = 0;
  for (let mi = 0; mi < MONTHS.length; mi++) {
    const w = `Incident_Occurred >= TIMESTAMP '${utcLiteral(monthStartMs[mi])}' AND Incident_Occurred < TIMESTAMP '${utcLiteral(
      mi + 1 < MONTHS.length ? monthStartMs[mi + 1] : windowEndMs,
    )}'`;
    const feats = await arcAll(
      {
        where: w,
        outFields:
          "OBJECTID,Incident_Number,Offense_Number,Victim_Number,Incident_Status_Code,Offense_NIBRS,Incident_Occurred,Latitude,Longitude",
        returnGeometry: "false",
        orderByFields: "OBJECTID",
        resultRecordCount: "2000",
      },
      { label: `pull ${MONTHS[mi]}` },
    );
    for (const f of feats) {
      const a = f.attributes;
      rowsSeen++;
      rowsByMonth[mi]++;
      const ymLocal = localYmd(a.Incident_Occurred).slice(0, 7);
      assert(ymLocal === MONTHS[mi], `pull ${MONTHS[mi]}: row local month ${ymLocal} outside query month`);
      const code = a.Offense_NIBRS == null ? "" : String(a.Offense_NIBRS).trim().toUpperCase();
      rowCodeTotals.set(code, (rowCodeTotals.get(code) || 0) + 1);
      const num = a.Incident_Number;
      assert(num !== null && num !== undefined, `pull ${MONTHS[mi]}: null Incident_Number (OBJECTID ${a.OBJECTID})`);
      const off = Number.isFinite(a.Offense_Number) ? a.Offense_Number : 1e9;
      const vic = Number.isFinite(a.Victim_Number) ? a.Victim_Number : 1e9;
      let e = inc.get(num);
      if (!e) {
        e = {
          o: off,
          v: vic,
          i: a.OBJECTID,
          t: a.Incident_Occurred,
          la: a.Latitude,
          ln: a.Longitude,
          c: code,
          s: a.Incident_Status_Code,
          m: mi,
          mx: null, // extra months (array) if rows span >1 local month
          f: 0, // bit flags: 1=status differs, 2=occurred differs, 4=coords differ
        };
        inc.set(num, e);
      } else {
        if ((a.Incident_Status_Code ?? "") !== (e.s ?? "")) e.f |= 1;
        if (a.Incident_Occurred !== e.t) e.f |= 2;
        if ((a.Latitude ?? "") !== (e.la ?? "") || (a.Longitude ?? "") !== (e.ln ?? "")) e.f |= 4;
        if (mi !== e.m && (!e.mx || !e.mx.includes(mi))) (e.mx ||= []).push(mi);
        if (off < e.o || (off === e.o && (vic < e.v || (vic === e.v && a.OBJECTID < e.i)))) {
          e.o = off;
          e.v = vic;
          e.i = a.OBJECTID;
          e.t = a.Incident_Occurred;
          e.la = a.Latitude;
          e.ln = a.Longitude;
          e.c = code;
          e.s = a.Incident_Status_Code;
        }
      }
    }
    if ((mi + 1) % 12 === 0) console.log(`  …through ${MONTHS[mi]} (${rowsSeen} rows, ${inc.size} incidents)`);
  }
  console.log(`  ${rowsSeen} window rows → ${inc.size} incidents (dedupe by Incident_Number)`);
  console.log(
    `  excluded & disclosed: ${tailRows} partial-tail rows (local ≥ ${nextYm(YM_END)}-01; ${tailIncidents} tail incidents)`,
  );

  // ---- 4. Finalize incidents: cat, unfounded gate, spatial join --------------
  console.log("── Incidents → category + unfounded gate + point-in-polygon precinct");
  const cells = {};
  for (const k of HOODS) cells[k] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  const cityByCatMonth = zeroCatMonths(); // counted incidents (post-unfounded-gate)
  const noCoordsByCatMonth = zeroCatMonths();
  const oobByCatMonth = zeroCatMonths();
  const pipMissByCatMonth = zeroCatMonths();
  const unfoundedByMonth = MONTHS.map(() => 0); // NIBRS-cat incidents with rep status U (excluded)
  const unfoundedByCat = { persons: 0, property: 0, society: 0 };
  const incByMonthAll = MONTHS.map(() => 0); // ALL incidents binned by rep month (pre-gate)
  const distinctIncByMonth = MONTHS.map(() => 0); // incidents with ≥1 row in the month (server-checkable)
  const repCodeTotals = new Map(); // rep code → counted-incident totals (PROVENANCE)
  let crossMonthMemberships = 0;
  let diffStatus = 0,
    diffOccurred = 0,
    diffCoords = 0;
  const ptsByMonth = MONTHS.map(() => []); // flat [lng,lat,ci, lng,lat,ci, …] of placed counted incidents

  for (const [num, e] of inc) {
    const binMi = e.mx ? MONTH_IDX.get(localYmd(e.t).slice(0, 7)) : e.m;
    assert(binMi !== undefined, `incident ${num}: rep month outside window`);
    incByMonthAll[binMi]++;
    distinctIncByMonth[e.m]++;
    if (e.mx) {
      crossMonthMemberships += e.mx.length;
      for (const mi of e.mx) distinctIncByMonth[mi]++;
    }
    if (e.f & 1) diffStatus++;
    if (e.f & 2) diffOccurred++;
    if (e.f & 4) diffCoords++;
    const { cat } = catOf(e.c);
    if (cat !== "other" && e.s === "U") {
      unfoundedByMonth[binMi]++;
      unfoundedByCat[cat]++;
      continue; // excluded from all counts — FBI practice for unfounded complaints
    }
    cityByCatMonth[cat][binMi]++;
    repCodeTotals.set(e.c || "(null)", (repCodeTotals.get(e.c || "(null)") || 0) + 1);
    const lat = typeof e.la === "number" ? e.la : NaN;
    const lng = typeof e.ln === "number" ? e.ln : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      noCoordsByCatMonth[cat][binMi]++;
      continue;
    }
    if (lat < BBOX.latMin || lat > BBOX.latMax || lng < BBOX.lngMin || lng > BBOX.lngMax) {
      oobByCatMonth[cat][binMi]++;
      continue;
    }
    const hood = placePoint(lng, lat);
    if (!hood) {
      pipMissByCatMonth[cat][binMi]++;
      continue;
    }
    cells[hood][binMi][cat]++;
    ptsByMonth[binMi].push(r6(lng), r6(lat), CAT_KEYS.indexOf(cat));
  }
  if (unknownCodeSeen.size)
    console.warn(`  codes outside the documented table → other: ${JSON.stringify([...unknownCodeSeen.entries()])}`);
  const unfoundedExcluded = unfoundedByMonth.reduce((a, b) => a + b, 0);
  console.log(
    `  ${inc.size} incidents = counted ${inc.size - unfoundedExcluded} + unfounded-excluded ${unfoundedExcluded}` +
      ` (persons ${unfoundedByCat.persons}, property ${unfoundedByCat.property}, society ${unfoundedByCat.society})`,
  );
  console.log(
    `  within-incident field variation vs representative row (disclosed): status ${diffStatus},` +
      ` occurred ${diffOccurred}, coords ${diffCoords} incidents`,
  );

  // per-month per-cat identity: placed + no-coords + oob + pip-miss == citywide counted
  for (const cat of CAT_KEYS) {
    for (let mi = 0; mi < MONTHS.length; mi++) {
      let placed = 0;
      for (const k of HOODS) placed += cells[k][mi][cat];
      const lhs =
        placed + noCoordsByCatMonth[cat][mi] + oobByCatMonth[cat][mi] + pipMissByCatMonth[cat][mi];
      assert(lhs === cityByCatMonth[cat][mi], `month ${MONTHS[mi]} cat ${cat}: placed+unplaced != citywide`);
    }
  }
  // per-month identity: counted + unfounded == all incidents binned that month
  for (let mi = 0; mi < MONTHS.length; mi++) {
    const counted = CAT_KEYS.reduce((s, c) => s + cityByCatMonth[c][mi], 0);
    assert(
      counted + unfoundedByMonth[mi] === incByMonthAll[mi],
      `month ${MONTHS[mi]}: counted ${counted} + unfounded ${unfoundedByMonth[mi]} != incidents ${incByMonthAll[mi]}`,
    );
  }
  assert(
    incByMonthAll.reduce((a, b) => a + b, 0) === inc.size,
    "incident month binning does not sum to incident count",
  );
  console.log(`  placed + unplaced == citywide counted, all ${MONTHS.length} months × 4 cats ✓`);

  // ---- 5. Independent server-side reconciliation -----------------------------
  // (a) per local month: server row count == client rows-seen
  // (b) per local month: server distinct Incident_Number == client distinct
  // (c) grand: window rows, window distinct incidents, grouped code totals
  console.log("── Reconciliation: 90 months × (row count + distinct incidents) vs source");
  for (let mi = 0; mi < MONTHS.length; mi++) {
    const w = `Incident_Occurred >= TIMESTAMP '${utcLiteral(monthStartMs[mi])}' AND Incident_Occurred < TIMESTAMP '${utcLiteral(
      mi + 1 < MONTHS.length ? monthStartMs[mi + 1] : windowEndMs,
    )}'`;
    const nRows = await arcCount(w, `server rows ${MONTHS[mi]}`);
    assert(nRows === rowsByMonth[mi], `month ${MONTHS[mi]}: server rows ${nRows} != client ${rowsByMonth[mi]}`);
    const nInc = await arcCount(w, `server distinct inc ${MONTHS[mi]}`, "Incident_Number");
    assert(
      nInc === distinctIncByMonth[mi],
      `month ${MONTHS[mi]}: server distinct incidents ${nInc} != client ${distinctIncByMonth[mi]}`,
    );
    if ((mi + 1) % 24 === 0) console.log(`  …through ${MONTHS[mi]} ✓`);
  }
  const serverWindowRows = await arcCount(WINDOW_WHERE, "server window rows");
  assert(serverWindowRows === rowsSeen, `server window rows ${serverWindowRows} != client ${rowsSeen}`);
  const serverWindowInc = await arcCount(WINDOW_WHERE, "server window incidents", "Incident_Number");
  assert(serverWindowInc === inc.size, `server window incidents ${serverWindowInc} != client ${inc.size}`);
  assert(
    distinctIncByMonth.reduce((a, b) => a + b, 0) === inc.size + crossMonthMemberships,
    "Σ monthly distinct incidents != incidents + cross-month memberships",
  );
  const grandRows = await arcCount("1=1", "grand rows");
  const grandPK = await arcCount("1=1", "grand distinct Primary_Key", "Primary_Key");
  const dupPKRows = grandRows - grandPK;
  // the layer is LIVE — new partial-July rows land mid-run, so the tail is
  // re-measured at reconciliation time for the grand identity
  const tailRowsNow = await arcCount(
    `Incident_Occurred >= TIMESTAMP '${utcLiteral(windowEndMs)}'`,
    "partial-tail rows (recheck)",
  );
  assert(grandRows === serverWindowRows + tailRowsNow, "grand != window + tail (new out-of-window rows?)");
  const codeRowsJ = await arcAll(
    {
      where: WINDOW_WHERE,
      groupByFieldsForStatistics: "Offense_NIBRS",
      outStatistics: JSON.stringify([
        { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
      ]),
    },
    { label: "grouped code totals" },
  );
  let groupedSum = 0;
  for (const f of codeRowsJ) {
    const code = f.attributes.Offense_NIBRS == null ? "" : String(f.attributes.Offense_NIBRS).trim().toUpperCase();
    const n = Number(f.attributes.n);
    groupedSum += n;
    assert(
      (rowCodeTotals.get(code) || 0) === n,
      `code ${code || "(null)"}: grouped ${n} != client ${rowCodeTotals.get(code) || 0}`,
    );
  }
  assert(groupedSum === rowsSeen, `grouped code totals ${groupedSum} != window rows ${rowsSeen}`);
  console.log(
    `  all 90 months reconcile exactly (rows AND distinct incidents); window ${serverWindowRows} rows /` +
      ` ${serverWindowInc} incidents; grouped Offense_NIBRS totals match client exactly ✓`,
  );
  console.log(`  duplicate Primary_Key rows in the layer: ${dupPKRows} (grand ${grandRows} − distinct PK ${grandPK}; harmless after incident dedupe, disclosed)`);

  // ---- 6. Dataset-level totals ----------------------------------------------
  const totalRecords = inc.size - unfoundedExcluded; // counted incidents (surface universe)
  let placedRecords = 0;
  for (const k of HOODS)
    for (const cc of cells[k]) placedRecords += cc.persons + cc.property + cc.society + cc.other;
  const sumCM = (o) => CAT_KEYS.reduce((s, c) => s + o[c].reduce((a, b) => a + b, 0), 0);
  const noCoords = sumCM(noCoordsByCatMonth);
  const outOfBbox = sumCM(oobByCatMonth);
  const pipMiss = sumCM(pipMissByCatMonth);
  const unplacedRecords = noCoords + outOfBbox + pipMiss;
  assert(placedRecords + unplacedRecords === totalRecords, "placed+unplaced != counted total");
  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  for (const c of CAT_KEYS) catTotals[c] = cityByCatMonth[c].reduce((a, b) => a + b, 0);
  assert(CAT_KEYS.reduce((s, c) => s + catTotals[c], 0) === totalRecords, "catTotals != counted total");
  const coveragePct = Math.round((placedRecords / totalRecords) * 1000) / 10;
  console.log("── Totals");
  console.log(
    `  counted ${totalRecords} incidents = ${placedRecords} placed + ${noCoords} no-coords + ${outOfBbox} out-of-bbox` +
      ` + ${pipMiss} PIP-miss → coverage ${coveragePct}%`,
  );

  // ---- 7. points.json — deterministic even-stride sample of REAL coords ------
  console.log("── Real incident points (source-published coords; deterministic even-stride ≤100/mo)");
  const pts = ptsByMonth.map((flat) => {
    const nPts = flat.length / 3;
    const take = Math.min(100, nPts);
    const out = [];
    for (let i = 0; i < take; i++) {
      const idx = nPts <= 100 ? i : Math.floor((i * nPts) / 100);
      out.push([flat[idx * 3], flat[idx * 3 + 1], flat[idx * 3 + 2]]);
    }
    return out;
  });
  const ptsKept = pts.reduce((s, a) => s + a.length, 0);
  const sampleRate = Math.round(placedRecords / ptsKept);
  console.log(`  kept ${ptsKept} of ${placedRecords} placed incidents → 1 per ~${sampleRate}`);

  // ---- 8. Dispatch feed: 10 real items/quarter, category-proportional --------
  // Feed items are REAL offense records (the layer's own grain) fetched fresh
  // per quarter × category in OBJECTID order — the 10 quarterly slots follow the
  // quarter's validated citywide counted-incident category mix (largest
  // remainder, deterministic; no seriousness bias). Group-A slots exclude
  // unfounded rows; every item is PIP-placed in a precinct.
  console.log("── Feed: 10 real items per quarter (category-proportional), 2019-Q1 … 2026-Q2");
  const codesOfCat = (cat) =>
    Object.entries(NIBRS)
      .filter(([, v]) => v[1] === cat)
      .map(([k]) => `'${k}'`)
      .join(",");
  const GROUP_A_IN = ["persons", "property", "society"].map((c) => codesOfCat(c)).join(",");
  const CAT_FEED_WHERE = {
    persons: `Offense_NIBRS IN (${codesOfCat("persons")}) AND (Incident_Status_Code <> 'U' OR Incident_Status_Code IS NULL)`,
    property: `Offense_NIBRS IN (${codesOfCat("property")}) AND (Incident_Status_Code <> 'U' OR Incident_Status_Code IS NULL)`,
    society: `Offense_NIBRS IN (${codesOfCat("society")}) AND (Incident_Status_Code <> 'U' OR Incident_Status_Code IS NULL)`,
    other: `(NOT Offense_NIBRS IN (${GROUP_A_IN}) OR Offense_NIBRS IS NULL)`,
  };
  const BBOX_WHERE = `Latitude >= ${BBOX.latMin} AND Latitude <= ${BBOX.latMax} AND Longitude >= ${BBOX.lngMin} AND Longitude <= ${BBOX.lngMax}`;
  const feed = [];
  for (let y = 2019; y <= 2026; y++) {
    for (let q = 0; q < 4; q++) {
      const qMonths = [0, 1, 2]
        .map((k) => MONTH_IDX.get(`${y}-${String(q * 3 + 1 + k).padStart(2, "0")}`))
        .filter((mi) => mi !== undefined);
      if (qMonths.length === 0) continue;
      const startMs = monthStartMs[qMonths[0]];
      const lastMi = qMonths[qMonths.length - 1];
      const endMs = lastMi + 1 < MONTHS.length ? monthStartMs[lastMi + 1] : windowEndMs;
      const catN = CAT_KEYS.map((c) => qMonths.reduce((s, mi) => s + cityByCatMonth[c][mi], 0));
      const catTot = catN.reduce((a, b) => a + b, 0);
      assert(catTot > 0, `feed ${y}Q${q + 1}: empty quarter`);
      const exact = catN.map((n) => (n / catTot) * 10);
      const alloc = exact.map(Math.floor);
      let rem = 10 - alloc.reduce((a, b) => a + b, 0);
      exact
        .map((e, i) => [e - alloc[i], i])
        .sort((a, b) => b[0] - a[0] || a[1] - b[1])
        .slice(0, rem)
        .forEach(([, i]) => alloc[i]++);
      for (let ci = 0; ci < CAT_KEYS.length; ci++) {
        if (alloc[ci] === 0) continue;
        const cat = CAT_KEYS[ci];
        const j = await postJSON(
          ARC,
          {
            f: "json",
            where:
              `Incident_Occurred >= TIMESTAMP '${utcLiteral(startMs)}' AND Incident_Occurred < TIMESTAMP '${utcLiteral(endMs)}'` +
              ` AND ${CAT_FEED_WHERE[cat]} AND ${BBOX_WHERE}`,
            outFields: "OBJECTID,Incident_Number,Offense_NIBRS,Offense_Description,Incident_Location,Incident_Occurred,Latitude,Longitude",
            returnGeometry: "false",
            orderByFields: "OBJECTID",
            resultRecordCount: String(alloc[ci] * 4 + 12),
          },
          { label: `feed ${y}Q${q + 1} ${cat}` },
        );
        let kept = 0;
        const seenInc = new Set();
        for (const f of j.features || []) {
          if (kept >= alloc[ci]) break;
          const a = f.attributes;
          if (seenInc.has(a.Incident_Number)) continue; // one item per incident per slot pool
          const hood = placePoint(a.Longitude, a.Latitude);
          if (!hood) continue;
          const meta = catOf(a.Offense_NIBRS);
          assert(meta.cat === cat, `feed ${y}Q${q + 1}: code ${meta.code} not cat ${cat}`);
          seenInc.add(a.Incident_Number);
          const desc = String(a.Offense_Description ?? "").trim();
          const loc = String(a.Incident_Location ?? "").trim();
          feed.push({
            date: localYmd(a.Incident_Occurred),
            title: desc ? titleCase(desc) : meta.name,
            place: loc ? titleCase(loc) : beats[hood].name,
            beat: hood,
            cat,
          });
          kept++;
        }
        if (kept < alloc[ci])
          console.warn(`  feed ${y}Q${q + 1} ${cat}: only ${kept}/${alloc[ci]} placeable items in fetch window`);
      }
    }
  }
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`  ${feed.length} feed items (chronological, category-proportional, no seriousness bias)`);

  // ---- 9. FBI UCR history 1985–2018 ------------------------------------------
  console.log(`── FBI CDE history (${ORI}, 1985–2018, key=${FBI_KEY === "DEMO_KEY" ? "DEMO_KEY" : "provided"})`);
  async function fetchAnnual(offense) {
    const url = `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/${offense}?from=${HIST_FROM}&to=${HIST_TO}&API_KEY=${FBI_KEY}`;
    const cachePath = resolve(RAW_DIR, `fbi-${ORI}-${offense}.json`);
    const waits = [90000, 300000, 300000, 300000];
    let rateLimitRetries = 0;
    for (let attempt = 0; attempt < 10; attempt++) {
      let j = null;
      if (existsSync(cachePath)) {
        const cached = JSON.parse(readFileSync(cachePath, "utf8"));
        console.log(`  using cached FBI response ${cachePath} (fetched ${cached.fetchedAtUTC})`);
        j = cached.response;
      } else {
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
      // Nashville *Offenses* series explicitly, never Clearances / United States.
      const agKey = Object.keys(actuals).find(
        (k) => /Nashville/i.test(k) && /Offenses/i.test(k) && !/United States/i.test(k),
      );
      if (!agKey)
        throw new Error(
          `FBI ${offense}: no Nashville Offenses series (keys: ${Object.keys(actuals)}) — verify ORI via ` +
            `https://api.usa.gov/crime/fbi/cde/agency/byStateAbbr/TN`,
        );
      const monthly = actuals[agKey] || {};
      if (Object.keys(monthly).length === 0) throw new Error(`FBI ${offense}: empty series for ORI ${ORI}`);
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
      `FBI ${offense}: still rate-limited after extended backoff. Get a free key at https://api.data.gov/signup/ and set FBI_API_KEY.`,
    );
  }
  const violent = await fetchAnnual("violent-crime");
  const property = await fetchAnnual("property-crime");
  // 1985 plausibility gate (COMMON-CONTRACT requirement; the buffalo build found
  // wrong-ORI/Clearances series slip through silently otherwise)
  assert(
    (violent.byYear[1985] || 0) > 1000,
    `1985 violent total ${violent.byYear[1985]} implausible for Nashville — wrong ORI/series?`,
  );
  const droppedYears = [];
  const years = [];
  for (let y = 1985; y <= 2018; y++) {
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
  console.log(`  ${years.length} complete years ${yearMin}–${yearMax} (12 months each verified); 1985 violent=${violent.byYear[1985]}`);

  // ---- Assemble output files -------------------------------------------------
  const timeline = { months: MONTHS, cells };
  const beatsFile = { cats: CATS, beats };
  const fmtN = (n) => n.toLocaleString("en-US");
  const methodFootnote =
    `Offense/victim-level source: MNPD publishes one row per offense×victim within an incident; rows are ` +
    `deduplicated to incidents by Incident_Number (${fmtN(rowsSeen)} rows → ${fmtN(inc.size)} incidents), classified by the ` +
    `incident's first-listed offense. ${fmtN(unfoundedExcluded)} incidents whose offense is a NIBRS crime category but whose ` +
    `status is "UNFOUNDED" are excluded per FBI practice. Precincts assigned by point-in-polygon of MNPD-published ` +
    `coordinates (rounded to ~2–3 decimals by the source) into the 9 official precinct polygons.`;
  const summary = {
    slug: "nashville-tn",
    title: "Nashville · TN",
    source: { records: ARC_LAYER, beats: PREC_LAYER, hub: HUB, hubItem: HUB_ITEM },
    fetchedAt,
    dateMin: "2019-01-01",
    dateMax: "2026-06-30",
    months: MONTHS.length,
    totalRecords,
    offenseVictimRows: rowsSeen,
    incidentsBeforeUnfoundedGate: inc.size,
    unfoundedExcluded,
    methodFootnote,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: { "no-coordinates": noCoords, "out-of-bbox": outOfBbox, "outside-polygons": pipMiss },
    catTotals,
    cats: CATS,
    beatCount: HOODS.length,
    regionNote:
      "Only 9 precinct regions (the official MNPD spatial unit) — leaderboard topN stays 6; quiz unaffected.",
  };
  const history = {
    era: "history",
    taxonomy:
      "FBI UCR Summary (Violent + Property) — a different taxonomy than the MNPD NIBRS/TIBRS categories used from 2019; the two eras bridge at 2019 and are never equated",
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
      `"Clearances" series — and the 1985 violent total is plausibility-gated). UCR Summary (Violent/Property) and MNPD ` +
      `NIBRS/TIBRS are different taxonomies and are presented as distinct eras; precinct-level detail exists only from ` +
      `2019 (the open-data layer starts there), so the story bridges from citywide annual history to per-precinct ` +
      `monthly data at 2019. Reproduce with pipeline/sources/nashville-tn.mjs (set FBI_API_KEY to avoid DEMO_KEY rate limits).` +
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
    source: "MNPD Police Precinct Boundaries (official polygon layer, 9 precincts)",
    sourceUrl: PREC_LAYER,
    hub: HUB,
    fetchedAt,
    license: "not stated on the item — attributed to Metro Nashville Police Department / Nashville Open Data",
    method:
      "spatial join — the crime file names no precinct (Zone/RPA are numeric and ~61% null); every deduplicated " +
      "incident with published coordinates is assigned by point-in-polygon of MNPD's REAL published coordinates " +
      "(rounded to ~2–3 decimals by the source — block-ish grain, disclosed) into the 9 official Police Precinct " +
      "Boundaries polygons (interior rings handled). Incidents without usable coordinates are counted citywide and " +
      "disclosed as unplaced, never guessed onto the map.",
    map: Object.fromEntries(HOODS.map((k) => [k, { name: beats[k].name, approx: false }])),
  };
  const points = {
    mode: "real-sample",
    note:
      "Every dot is a real MNPD-published incident location (Latitude/Longitude fields, rounded to ~2–3 decimals " +
      "by the source — block-ish grain). One dot per deduplicated counted incident (representative row); ~1.4% of " +
      "incidents have no usable coordinates and are counted but not plotted. Deterministic even-stride sample " +
      "(≤100/month) across each full month of placed incidents.",
    sampleRate,
    months: MONTHS,
    pts,
  };

  // ---- VALIDATE (fail loudly) -------------------------------------------------
  console.log("── Validation");
  assert(
    MONTHS.length === 90 && MONTHS[0] === "2019-01" && MONTHS[89] === "2026-06",
    "months not contiguous 2019-01..2026-06",
  );
  for (let i = 1; i < MONTHS.length; i++) {
    const [py, pm] = MONTHS[i - 1].split("-").map(Number);
    const [cy, cm] = MONTHS[i].split("-").map(Number);
    assert(
      (cm === pm + 1 && cy === py) || (cm === 1 && pm === 12 && cy === py + 1),
      `months not contiguous at ${MONTHS[i]}`,
    );
  }
  assert(Object.keys(beats).length === 9, "beatCount != 9");
  let zeroHoods = 0;
  for (const k of HOODS) {
    assert(cells[k], `precinct '${k}' missing from cells`);
    assert(cells[k].length === MONTHS.length, `cells['${k}'] length != ${MONTHS.length}`);
    const t = cells[k].reduce((s, cc) => s + cc.persons + cc.property + cc.society + cc.other, 0);
    if (t === 0) zeroHoods++;
  }
  assert(zeroHoods === 0, `${zeroHoods} precincts have zero incidents across 7+ years — join broken?`);
  for (const k of Object.keys(cells)) assert(beats[k], `cells key '${k}' has no polygon`);
  assert(coveragePct >= 95, `coverage ${coveragePct}% < 95% — spatial join unreliable`);
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
    assert(f.date >= "2019-01-01" && f.date <= "2026-06-30", `feed date out of span ${f.date}`);
    assert(beats[f.beat], `feed beat '${f.beat}' not a precinct`);
    assert(CAT_KEYS.includes(f.cat), `feed bad cat ${f.cat}`);
  }
  assert(feed.length >= 290, `feed has ${feed.length} items < 290`);
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
    ptsKept,
    sampleRate,
    catTotals,
    repCodeTotals,
    rowCodeTotals,
    reportTypes,
    rowsSeen,
    incSize: inc.size,
    unfoundedExcluded,
    unfoundedByCat,
    tailRows,
    tailIncidents,
    noCoords,
    outOfBbox,
    pipMiss,
    dupPKRows,
    grandRows,
    diffStatus,
    diffOccurred,
    diffCoords,
    crossMonthMemberships,
    violent1985: violent.byYear[1985],
  });
  appendWiki({ summary, history, rowsSeen, incSize: inc.size, unfoundedExcluded });

  console.log("\n── Final summary.json");
  console.log(JSON.stringify(summary, null, 2));

  // ---- Story numbers (for the report; all derived from validated data) --------
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
  for (const yr of [2019, 2020, 2021, 2022, 2023, 2024, 2025])
    console.log(`  citywide ${yr}: all=${yearTotal(yr)} · NIBRS-cats only=${yearTotal(yr, true)}`);
  const h1_2025 = MONTHS.reduce(
    (s, m, mi) => (m >= "2025-01" && m <= "2025-06" ? s + CAT_KEYS.reduce((t, c) => t + cityByCatMonth[c][mi], 0) : s),
    0,
  );
  const h1_2026 = MONTHS.reduce(
    (s, m, mi) => (m >= "2026-01" && m <= "2026-06" ? s + CAT_KEYS.reduce((t, c) => t + cityByCatMonth[c][mi], 0) : s),
    0,
  );
  console.log(`  H1 2025=${h1_2025} vs H1 2026=${h1_2026}`);
  const hoodYear = (k, yr) => {
    let s = 0;
    MONTHS.forEach((m, mi) => {
      if (!m.startsWith(String(yr))) return;
      const cc = cells[k][mi];
      s += cc.persons + cc.property + cc.society + cc.other;
    });
    return s;
  };
  const top2025 = HOODS.map((k) => [k, hoodYear(k, 2025)]).sort((a, b) => b[1] - a[1]);
  console.log(`  precincts 2025: ${top2025.map(([k, n]) => `${beats[k].name}=${n}`).join(" · ")}`);
  let hiM = null,
    hiN = -1;
  MONTHS.forEach((m, mi) => {
    let s = 0;
    for (const c of CAT_KEYS) s += cityByCatMonth[c][mi];
    if (s > hiN) (hiN = s), (hiM = m);
  });
  console.log(`  highest month (counted incidents): ${hiM} = ${hiN}`);

  console.log("\nVALIDATION PASS");
}

// ---- PROVENANCE.md ---------------------------------------------------------------
function writeProvenance(x) {
  const n = (v) => v.toLocaleString("en-US");
  const rtRows = x.reportTypes
    .map(
      (r) =>
        `| ${r.type === null ? "*(null)*" : `\`${r.type}\``} | ${r.description === null ? "*(none published)*" : r.description} | ${n(r.n)} |`,
    )
    .join("\n");
  const codeRows = [...x.rowCodeTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, c]) => {
      const key = code === "" ? "(null)" : code;
      const hit = NIBRS[code];
      const name = code === "" ? "No offense code published" : hit ? hit[0] : `Unrecognized code ${code}`;
      const cat = code === "" ? "other" : hit ? hit[1] : "other";
      const repN = x.repCodeTotals.get(key) || 0;
      return `| \`${key}\` | ${name} | \`${cat}\` | ${n(c)} | ${n(repN)} |`;
    })
    .join("\n");
  const md = `# Provenance — Nashville, TN

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **Metro Nashville Police Department Incidents** (hosted ArcGIS view, 2019-01-01 → current) |
| Publisher | Metropolitan Nashville Police Department (MNPD), via Nashville Open Data |
| Landing page | ${HUB_ITEM} (portal: ${HUB}) |
| API | ${ARC_LAYER} |
| Fetched | ${x.fetchedAt} |
| License | **Not stated** — the ArcGIS item's licenseInfo is empty. Attributed per the item's accessInformation: "Metro Nashville Police Department, Information Technology". Flagged prominently per the batch-1 contract. |
| Attribution | Metro Nashville Police Department via Nashville Open Data |
| Rows used | ${n(x.rowsSeen)} offense×victim rows (local occurrence dates 2019-01-01 → 2026-06-30) → **${n(x.summary.totalRecords)} counted incidents** |
| Source caveat | Refreshed continually; investigation status (incl. unfounded determinations) changes as cases proceed |

### ⚠ Offense×victim rows → incident dedupe (headline disclosure 1)
MNPD publishes **one row per offense × victim** within an incident (\`Primary_Key\` = \`<Incident_Number>_<Offense_Number><Victim_Number>\`). All counts shown are **incidents**, deduplicated on \`Incident_Number\`:

- ${n(x.rowsSeen)} window rows → ${n(x.incSize)} incidents (×${(x.rowsSeen / x.incSize).toFixed(2)} row inflation removed).
- The **representative row** is the incident's first-listed offense — lowest \`Offense_Number\`, then \`Victim_Number\`, then \`OBJECTID\` — a documented judgment call (MNPD publishes no severity hierarchy). Its offense code, status, coordinates, and occurrence date classify, gate, place, and bin the incident.
- Within-incident field variation vs the representative row (measured, disclosed): differing status ${n(x.diffStatus)}, differing occurrence timestamp ${n(x.diffOccurred)}, differing coordinates ${n(x.diffCoords)} incidents.
- The layer also contains ${n(x.dupPKRows)} duplicate \`Primary_Key\` rows (${n(x.grandRows)} rows vs distinct keys) — harmless after incident dedupe, disclosed.

### ⚠ Unfounded exclusion (headline disclosure 2)
\`Incident_Status_Code\` "U — UNFOUNDED" incidents whose representative offense is a NIBRS crime category are **excluded from persons/property/society** per FBI UCR/NIBRS practice (unfounded complaints are removed from offense counts): **${n(x.unfoundedExcluded)} incidents excluded** (persons ${n(x.unfoundedByCat.persons)}, property ${n(x.unfoundedByCat.property)}, society ${n(x.unfoundedByCat.society)}) — ≈${((x.unfoundedExcluded / x.incSize) * 100).toFixed(1)}% of all incidents. The \`other\` context bucket has **no status filter**: "U" is the routine closing status of MNPD's administrative matrix records (e.g. 97% of POLICE INQUIRY rows), not a falsity finding. Caveat: unfounded determinations accumulate as investigations close, so very recent months may still contain reports that will later be unfounded — a small, time-varying, fully disclosed bias inherent to the source.

### Date field & timezone (verified)
\`Incident_Occurred\` (when the offense happened; \`Incident_Reported\` exists but is not used — the map animates occurrence). Timestamps are **true UTC instants** of local event times (dataset min = 2019-01-01 06:00Z = local CST midnight; the UTC hour-of-day low sits at 9–11Z = 4–5 AM local). **All month binning uses America/Chicago local time**; every local month boundary is queried back against the source as an exact UTC instant. The layer starts exactly at 2019-01-01 local (0 earlier rows, asserted; 0 null dates). Excluded and disclosed: **${n(x.tailRows)}** partial-month rows (local ≥ 2026-07-01; ${n(x.tailIncidents)} incidents) — 2026-07 was in progress at fetch time.

### Report_Type enumeration (spec directive — none excluded)

| Report_Type | Source description | Window rows |
|---|---|--:|
${rtRows}

Determination: every value is a report-intake designation on offense×victim rows (the source's own descriptions where published: D = DISPATCHED, S = SUSPECT, W = WITNESS; \`T\`, \`O\`, \`CIR\`, and null carry **no source description**). None is a separate non-incident record class (no supplement/administrative report type), so **no Report_Type is excluded**; dedupe by \`Incident_Number\` collapses any multi-report duplication regardless.

### Fields used
\`Incident_Number\` · \`Primary_Key\` (dedupe audit) · \`Offense_Number\`/\`Victim_Number\` (representative-row order) · \`Incident_Occurred\` · \`Offense_NIBRS\` · \`Offense_Description\` (feed titles) · \`Incident_Location\` (feed places) · \`Incident_Status_Code\` · \`Latitude\`/\`Longitude\` · \`Report_Type\` (enumeration). \`Zone\`/\`RPA\` are numeric codes, ~61% null (the batch-1 scout note said fully null — measured 38.8% populated), with no published name mapping — not used; placement is a spatial join (below).

### Category mapping (Offense_NIBRS → cat)
MNPD reports through **TIBRS** (Tennessee's NIBRS program). Group A codes map to the FBI crimes-against categories; \`13D\` Stalking is a Tennessee Group A crime-against-person code (in-data descriptions are all stalking offenses). Group B 90-series codes (no crimes-against category), \`09C\` justifiable homicide ("not a crime" per NIBRS), MNPD local 600/700/800-series administrative "matrix" codes (police inquiry, lost/found property, deaths, overdose, …), and null codes → \`other\`, labeled "${CATS.other.label}", **never counted as NIBRS crime**.

| cat | Counted incidents |
|-----|------------------:|
| \`persons\` | ${n(x.catTotals.persons)} |
| \`property\` | ${n(x.catTotals.property)} |
| \`society\` | ${n(x.catTotals.society)} |
| \`other\` | ${n(x.catTotals.other)} |

#### Full code table (window counts at fetch time)

| Code | Offense | cat | Rows | Counted incidents (representative) |
|------|---------|-----|-----:|-----------------------------------:|
${codeRows}

### Placement = spatial join of REAL coordinates (headline disclosure 3)
The crime file names no precinct. Every counted incident with usable published coordinates is assigned by **point-in-polygon** (even-odd ray casting across all rings — the MADISON precinct carries an interior ring) into the **9 official MNPD Police Precinct Boundaries** polygons. Coordinates are MNPD's published \`Latitude\`/\`Longitude\` values, **rounded by the source to ~2–3 decimal places** (≈100 m–1 km block grain) — real published data, coarse by design, disclosed; a rounded point near a boundary can sit on the wrong side of a precinct line.

- Placed: **${n(x.summary.placedRecords)}** (${x.summary.coveragePct}%)
- Unplaced — no/zero coordinates: ${n(x.noCoords)} · outside the county bbox: ${n(x.outOfBbox)} · inside the bbox but outside all 9 polygons: ${n(x.pipMiss)} — total ${n(x.summary.unplacedRecords)}, **counted in every citywide total** and disclosed, never guessed onto the map.
- Identity \`placed + unplaced == citywide counted\` validated per month × category in-script, **and** the client-side full pull is reconciled against the source: per-local-month server row counts AND server distinct-\`Incident_Number\` counts (90 × 2 queries, exact UTC month-boundary instants) all match exactly; Σ monthly distinct incidents = ${n(x.incSize)} incidents + ${n(x.crossMonthMemberships)} cross-month memberships (incidents whose rows straddle a month boundary); server-side grouped \`Offense_NIBRS\` row totals match the client tally code-for-code.
- Coordinate gate: lat ${BBOX.latMin}–${BBOX.latMax}, lng ${BBOX.lngMin}–${BBOX.lngMax} — **wider than the batch-1 scout bbox** (35.98–36.41 / −87.05…−86.52), which would clip the county corners (official precinct extent reaches lat 35.9678 / lng −87.0549 / −86.5116). Measured deviation, documented.

## Geometry source — official precinct polygons

| Field | Value |
|-------|-------|
| Dataset | **Police Precinct Boundaries** — 9 polygons, field \`PrecinctName\` (official MNPD layer, same Nashville Open Data org) |
| FeatureServer | ${PREC_LAYER} |
| License | not stated — attributed to Metro Nashville Police Department / Nashville Open Data |
| Join | point-in-polygon of published incident coordinates (above) |
| Centroids | Area-weighted centroid across outer rings (shoelace formula) — for symbol placement only |
| Region count | **Only 9 regions** (CENTRAL, EAST, HERMITAGE, MADISON, MIDTOWN HILLS, NORTH, SOUTH, SOUTHEAST, WEST) — leaderboard topN stays 6; quiz unaffected |

## Real incident points (\`points.json\`)
One dot per placed counted incident (representative row), coordinates exactly as published by MNPD (**source-rounded to ~2–3 decimals** — block-ish grain; a handful of same-block incidents can stack on identical coordinates). ${n(x.incSize - x.unfoundedExcluded - x.summary.placedRecords)} counted incidents (~${(((x.incSize - x.unfoundedExcluded - x.summary.placedRecords) / (x.incSize - x.unfoundedExcluded)) * 100).toFixed(1)}%) have no usable location and are counted but not plotted. Deterministic even-stride sample across each full month: **${n(x.ptsKept)} points ≈ 1 per ${x.sampleRate} of the ${n(x.summary.placedRecords)} placed incidents**.

## Dispatch feed (\`feed.json\`)
10 real items per quarter, slots allocated across categories in proportion to the quarter's validated counted-incident mix (largest remainder, deterministic — no seriousness bias). Items are real offense records fetched in \`OBJECTID\` order (one per incident per slot pool, PIP-placed, Group-A slots exclude unfounded rows); titles/places are the source's \`Offense_Description\`/\`Incident_Location\` (title-cased), dates are local occurrence dates.

## Historical source — FBI UCR (${x.history.yearMin}–${x.history.yearMax} deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | ${AGENCY} — **ORI \`${ORI}\`** (verified: returns the "Metropolitan Nashville Police Department Offenses" series) |
| Endpoint | ${x.history.sourceUrl} (and \`/property-crime\`) |
| Span | ${x.history.yearMin}–${x.history.yearMax}, annual Violent + Property (12 reported months verified per year)${x.droppedYears.length ? ` — dropped partial years: ${x.droppedYears.map((d) => d.year).join(", ")}` : " — no partial years"} |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set \`FBI_API_KEY\` or \`.secrets/fbi_api_key\`) |

The CDE response carries both an "… Offenses" and an "… Clearances" series — the script matches the **Offenses** series explicitly and gates on a plausible 1985 violent-crime total (fetched: ${n(x.violent1985)}). UCR Summary (Violent/Property) is a **different taxonomy** than MNPD NIBRS/TIBRS — the eras are presented as distinct and bridge at 2019; they are never equated. No monthly or precinct detail is implied for ${x.history.yearMin}–${x.history.yearMax}. Raw responses cached under \`data/nashville-tn/raw/\`.

## Reproduce

\`\`\`bash
FBI_API_KEY=… node pipeline/sources/nashville-tn.mjs
\`\`\`
`;
  writeFileSync(PROV_PATH, md);
  console.log(`  wrote data/nashville-tn/PROVENANCE.md`);
}

// ---- wiki/Data-Provenance.md append ------------------------------------------------
function appendWiki({ summary, history, rowsSeen, incSize, unfoundedExcluded }) {
  if (!existsSync(WIKI_PATH)) return;
  const cur = readFileSync(WIKI_PATH, "utf8");
  if (cur.includes("## Nashville, TN")) {
    console.log("  wiki/Data-Provenance.md already has a Nashville section — skipped");
    return;
  }
  const n = (v) => v.toLocaleString("en-US");
  const section = `
## Nashville, TN (\`nashville-tn\`)

- **Primary source:** Metro Nashville Police Department Incidents — hosted ArcGIS
  view on Nashville Open Data (2019-01-01 → current). **License not stated**
  (item licenseInfo empty) — attributed "Metro Nashville Police Department via
  Nashville Open Data" per the item's accessInformation.
- **Grain → dedupe:** the layer publishes one row per **offense × victim**
  (\`Primary_Key\` = incident_offense/victim); ${n(rowsSeen)} rows collapse to
  ${n(incSize)} incidents by \`Incident_Number\` (representative = the incident's
  first-listed offense; documented judgment call).
- **Unfounded excluded:** ${n(unfoundedExcluded)} NIBRS-category incidents with
  status "U — UNFOUNDED" are excluded per FBI practice (disclosed; the \`other\`
  context bucket keeps its routine-"U" administrative records).
- **Categories:** \`Offense_NIBRS\` per TIBRS (Tennessee NIBRS): Group A →
  persons/property/society; \`13D\` Stalking (TIBRS TN Group A) → persons;
  Group B 90-series, \`09C\`, MNPD local 600/700/800 "matrix" codes (police
  inquiry, lost/found property, deaths, overdose, …), and nulls → \`other\`
  ("${summary.cats.other.label}"), never counted as NIBRS crime. Full code
  table in [\`data/nashville-tn/PROVENANCE.md\`](../data/nashville-tn/PROVENANCE.md).
- **Report_Type:** enumerated (D/S/T/W/O/CIR/null — intake designations; T, O,
  CIR have no source description); none is a non-incident record class → none
  excluded; incident dedupe absorbs multi-report duplication.
- **Spatial unit:** the **9 official MNPD Police Precinct Boundaries**
  (\`PrecinctName\`; same org). Zone/RPA are numeric, ~61% null, unmapped — the
  placement is a **spatial join**: point-in-polygon of MNPD's published
  coordinates (source-rounded to ~2–3 decimals — block-ish grain, disclosed;
  MADISON's interior ring handled). Only 9 regions — leaderboard topN stays 6.
- **Dates:** \`Incident_Occurred\` true-UTC instants; **binning in
  America/Chicago local time**, month boundaries reconciled against the source
  as exact UTC instants (90 months × row + distinct-incident counts, exact).
- **Deep-history source (${history.yearMin}–${history.yearMax}):** FBI Crime Data Explorer (CDE) —
  ${AGENCY}, **ORI ${ORI}** (verified; "Offenses" series matched explicitly,
  1985 plausibility-gated) — real annual Violent + Property counts,
  ${history.years.length} full years (12 reported months each, verified).
- **Span:** ${history.yearMin}–${history.yearMax} (FBI UCR annual) + 2019-01-01 → 2026-06-30 (MNPD
  incidents with precinct detail, ${summary.months} months; partial 2026-07 dropped and
  disclosed).
- **Records:** ${n(summary.totalRecords)} counted incidents ·
  ${n(summary.placedRecords)} placed in a precinct (**${summary.coveragePct}% coverage**) ·
  ${n(summary.unplacedRecords)} unplaced (no coords / out-of-bbox / outside polygons),
  kept in totals and disclosed.
- **License:** not stated (both layers) — attributed to Metro Nashville PD.
- **Detail:** [\`data/nashville-tn/PROVENANCE.md\`](../data/nashville-tn/PROVENANCE.md)
`;
  const marker = "## Ranked source types";
  const idx = cur.indexOf(marker);
  const next = idx >= 0 ? cur.slice(0, idx) + section.trimStart() + "\n" + cur.slice(idx) : cur + section;
  writeFileSync(WIKI_PATH, next);
  console.log("  appended Nashville section to wiki/Data-Provenance.md");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
