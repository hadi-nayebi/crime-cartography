// Denver, CO — DPD Crime dataset source pipeline (fetch → normalize → validate).
//
// BINDING RULE: never fabricate — every figure written by this script comes
// straight from a queryable public source; every gap is disclosed.
//
// Sources:
//   Incidents  : "Crime" (ODC_CRIME_OFFENSES_P layer 324), Denver Police
//                Department via Denver Open Data Catalog (ArcGIS Hub).
//                https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_CRIME_OFFENSES_P/FeatureServer/324
//                ROLLING WINDOW: the source publishes "the previous five
//                calendar years plus the current year to date" (item snippet,
//                verbatim) — at fetch time that is 2021-01-01 → current.
//                License: custom City and County of Denver use constraints —
//                item licenseInfo pulled VERBATIM at runtime and recorded.
//   Polygons   : ODC_ADMN_NEIGHBORHOOD_A layer 13 (official 78 statistical
//                neighborhoods, NBHD_NAME) — same org. Crime rows carry
//                NEIGHBORHOOD_ID slugs; join = slugify(NBHD_NAME) — verified
//                exact 78/78 both directions (only nulls unmatched).
//   History    : FBI Crime Data Explorer (CDE) summarized agency counts,
//                Denver Police Department ORI CODPD0000 (NOT CO0160000 — that
//                ORI is the Denver County Sheriff's Office with an empty
//                series; verified via agency/byStateAbbr/CO), 1985–2020
//                annual Violent + Property.
//
// Eras (honesty structure):
//   1985–2020  FBI UCR annual citywide totals (no neighborhood detail implied)
//   2021-01 → 2026-06  DPD NIBRS-based offenses with official-neighborhood
//                detail (rolling window; 2026-07 partial month dropped and
//                disclosed).
//
// Grain (disclosed): the source is OFFENSE-level (one row per offense within
// an incident; OFFENSE_ID = INCIDENT_ID + offense code). We DEDUPE BY
// INCIDENT_ID so every on-screen count is an incident count. Representative
// offense per incident is chosen deterministically: highest category priority
// persons > property > society > other, tie-broken by lowest OFFENSE_ID.
// Both grains are reconciled against independent server-side queries.
//
// Date field: FIRST_OCCURRENCE_DATE (when the offense first occurred), NOT
// REPORTED_DATE — the map animates when crime occurred.
//
//   node pipeline/sources/denver-co.mjs   (set FBI_API_KEY to avoid DEMO_KEY limits)
//
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const OUT_DIR = resolve(repoRoot, "data/denver-co/normalized");
const RAW_DIR = resolve(repoRoot, "data/denver-co/raw");
const PROV_PATH = resolve(repoRoot, "data/denver-co/PROVENANCE.md");
const WIKI_PATH = resolve(repoRoot, "wiki/Data-Provenance.md");

const ARC_LAYER =
  "https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_CRIME_OFFENSES_P/FeatureServer/324";
const ARC = `${ARC_LAYER}/query`;
const NBHD =
  "https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_ADMN_NEIGHBORHOOD_A/FeatureServer/13";
const HUB_ITEM_ID = "1e080d3ce2ae4e2698745a0d02345d4a";
const HUB_ITEM = `https://www.arcgis.com/home/item.html?id=${HUB_ITEM_ID}`;
const HUB = "https://opendata-geospatialdenver.hub.arcgis.com/";
const ORI = "CODPD0000";
const ORI_WRONG = "CO0160000"; // Denver County Sheriff's Office — empty series (documented)
const AGENCY = "Denver Police Department";
const FBI_KEY = process.env.FBI_API_KEY || "DEMO_KEY";

// Rolling-window granular era by FIRST_OCCURRENCE_DATE. Source publishes the
// previous 5 calendar years + YTD; verified live: min date is exactly
// 2021-01-01, max mid-July 2026. Last FULL month = 2026-06.
const SPAN_START = "2021-01-01";
const MONTHS = monthRange("2021-01", "2026-06"); // 66
const PARTIAL_MONTH = "2026-07"; // partial at fetch time — excluded & disclosed
const HIST_FROM = "01-1985";
const HIST_TO = "12-2020";

// OFFENSE_CATEGORY_ID → cat. Denver publishes offense CATEGORIES, not native
// NIBRS crimes-against; we map each category to the NIBRS crimes-against group
// of the offenses it contains (documented in full in PROVENANCE):
//   persons  — murder, aggravated-assault, other-crimes-against-persons
//              (simple assault, threats, child/elder abuse, harassment…)
//   property — robbery (NIBRS counts robbery as a crime against PROPERTY),
//              burglary, larceny, theft-from-motor-vehicle, auto-theft,
//              arson, white-collar-crime
//   society  — drug-alcohol, public-disorder (disorderly conduct, weapons,
//              criminal mischief, prostitution — closest crimes-against-
//              society bucket; contains some persons-adjacent types, mapped
//              at category grain and disclosed)
//   other    — all-other-crimes (mixed catch-all: traffic-related criminal
//              offenses, trespass, probation violations… context only)
// NOTE: the source publishes NO sexual-assault category — Denver omits
// sex-related crimes from the point-level dataset (published separately as an
// aggregated table). Disclosed prominently.
const CAT_OF = {
  murder: "persons",
  "aggravated-assault": "persons",
  "other-crimes-against-persons": "persons",
  robbery: "property",
  burglary: "property",
  larceny: "property",
  "theft-from-motor-vehicle": "property",
  "auto-theft": "property",
  arson: "property",
  "white-collar-crime": "property",
  "drug-alcohol": "society",
  "public-disorder": "society",
  "all-other-crimes": "other",
};
const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff2e63" },
  property: { label: "Crimes Against Property", color: "#ffc233" },
  society: { label: "Crimes Against Society", color: "#34e0e0" },
  other: { label: "All-other-crimes (mixed, context)", color: "#7486a0" },
};
const CAT_KEYS = ["persons", "property", "society", "other"]; // catIdx order
const CAT_PRIORITY = { persons: 0, property: 1, society: 2, other: 3 }; // dedupe rule

// Valid Denver coordinate box (GEO_LAT/GEO_LON are doubles; city extends far
// east to DIA). Out-of-box/missing coords are counted, disclosed, not plotted.
const BBOX = { latMin: 39.61, latMax: 39.92, lngMin: -105.11, lngMax: -104.6 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fetchCount = 0;
async function postJSON(url, params, { retries = 3, retryWait = 5000, label = url } = {}) {
  const body = new URLSearchParams(params).toString();
  for (let attempt = 0; ; attempt++) {
    if (fetchCount++ > 0) await sleep(150); // be polite: sequential + 150ms delay
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

async function arcCount(where, label) {
  const j = await postJSON(ARC, { f: "json", where, returnCountOnly: "true" }, { label });
  const n = j.count;
  if (!Number.isFinite(n)) throw new Error(`${label}: bad count response`);
  return n;
}

async function arcDistinctIncidents(where, label) {
  const j = await postJSON(
    ARC,
    {
      f: "json",
      where,
      returnDistinctValues: "true",
      outFields: "INCIDENT_ID",
      returnCountOnly: "true",
    },
    { label },
  );
  const n = j.count;
  if (!Number.isFinite(n)) throw new Error(`${label}: bad distinct count response`);
  return n;
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
const MONTH_IDX = new Map(MONTHS.map((m, i) => [m, i]));
const ALL_MONTHS = [...MONTHS, PARTIAL_MONTH]; // for reconciliation only
// Epoch-ms → "YYYY-MM"/"YYYY-MM-DD". The service stores local wall-clock time
// as if UTC (verified in-run: server-side EXTRACT() grouping reconciles
// exactly with this client-side conversion, all cats × months).
const ymOfMs = (ms) => new Date(ms).toISOString().slice(0, 7);
const ymdOfMs = (ms) => new Date(ms).toISOString().slice(0, 10);
const monthWhere = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return (
    `FIRST_OCCURRENCE_DATE >= TIMESTAMP '${ym}-01 00:00:00' AND ` +
    `FIRST_OCCURRENCE_DATE < TIMESTAMP '${next}-01 00:00:00'`
  );
};

// slugify(NBHD_NAME) → NEIGHBORHOOD_ID (verified exact 78/78 both ways):
// lowercase, every non-alphanumeric run → single hyphen, trim hyphens.
const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// "criminal-mischief-other" → "Criminal Mischief Other" (feed display)
const humanize = (s) =>
  String(s)
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

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
  mkdirSync(RAW_DIR, { recursive: true });
  const fetchedAt = new Date().toISOString();

  // ---- 0. Hub item: license text VERBATIM ---------------------------------
  console.log("── Hub item (license pulled verbatim)");
  const itemR = await fetch(`https://www.arcgis.com/sharing/rest/content/items/${HUB_ITEM_ID}?f=json`);
  assert(itemR.ok, `hub item: HTTP ${itemR.status}`);
  const item = await itemR.json();
  assert(!item.error, `hub item: ${JSON.stringify(item.error)}`);
  const licenseText = String(item.licenseInfo || "").trim();
  const rollingSnippet = String(item.snippet || "").trim();
  assert(licenseText.length > 100, "hub item licenseInfo missing/short");
  assert(
    /previous five calendar years plus the current year to date/i.test(rollingSnippet),
    "hub item snippet no longer states the 5-year rolling window — re-verify",
  );
  writeFileSync(
    resolve(RAW_DIR, "hub-item.json"),
    JSON.stringify({ url: HUB_ITEM, fetchedAtUTC: fetchedAt, response: item }, null, 2),
  );
  console.log(`  title "${item.title}" · owner ${item.owner} · license ${licenseText.length} chars`);

  // ---- 1. Official neighborhood polygons ----------------------------------
  console.log("── Denver official statistical neighborhoods (polygons)");
  const gj = await postJSON(
    `${NBHD}/query`,
    { f: "geojson", where: "1=1", outFields: "NBHD_NAME,NBHD_ID" },
    { label: "neighborhoods geojson" },
  );
  assert(gj?.type === "FeatureCollection" && Array.isArray(gj.features), "NBHD: bad geojson");
  assert(gj.features.length === 78, `NBHD: expected 78 features, got ${gj.features.length}`);

  const beats = {};
  gj.features.forEach((f, idx) => {
    const raw = f.properties?.NBHD_NAME;
    assert(typeof raw === "string" && raw.trim().length > 0, `NBHD feature ${idx}: missing NBHD_NAME`);
    const name = raw.trim();
    const key = slugify(name);
    assert(key.length > 0, `NBHD '${name}': empty slug`);
    assert(!beats[key], `NBHD: duplicate slug '${key}'`);
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
    assert(A > 0, `NBHD '${name}': zero area`);
    beats[key] = {
      key,
      name, // resident-facing proper name from the polygon layer (Title Case / official acronyms)
      servcen: String(f.properties?.NBHD_ID ?? ""),
      beat: idx,
      centroid: [Number((X / A).toFixed(6)), Number((Y / A).toFixed(6))],
      polygon: outerRings,
      geomType: g.type,
    };
  });
  const HOODS = new Set(Object.keys(beats));
  console.log(`  ${HOODS.size} neighborhoods (e.g. ${[...HOODS].slice(0, 3).join(", ")})`);

  // ---- 2. Raw pull of EVERY offense row (IS_CRIME=1) ----------------------
  // The whole layer is IS_CRIME=1 (traffic accidents live in a sibling layer);
  // the filter is still applied defensively and its no-op nature disclosed.
  console.log("── Raw paged pull of every offense row (IS_CRIME=1)");
  const grandTotal = await arcCount("1=1", "grand total");
  const crimeRows = await arcCount("IS_CRIME=1", "IS_CRIME=1 total");
  const nonCrimeRows = grandTotal - crimeRows;
  console.log(`  server: ${grandTotal} rows total, ${crimeRows} with IS_CRIME=1 (${nonCrimeRows} excluded by filter)`);
  const preWindow = await arcCount(
    `IS_CRIME=1 AND FIRST_OCCURRENCE_DATE < TIMESTAMP '${SPAN_START} 00:00:00'`,
    "pre-window count",
  );
  assert(preWindow === 0, `expected 0 rows before ${SPAN_START} (rolling window), got ${preWindow}`);
  const nullDate = await arcCount("IS_CRIME=1 AND FIRST_OCCURRENCE_DATE IS NULL", "null-date count");
  assert(nullDate === 0, `expected 0 null FIRST_OCCURRENCE_DATE rows, got ${nullDate}`);

  const rawFeats = await arcAll(
    {
      where: "IS_CRIME=1",
      outFields:
        "INCIDENT_ID,OFFENSE_ID,OFFENSE_TYPE_ID,OFFENSE_CATEGORY_ID,FIRST_OCCURRENCE_DATE," +
        "INCIDENT_ADDRESS,GEO_LAT,GEO_LON,NEIGHBORHOOD_ID",
      returnGeometry: "false",
      orderByFields: "OBJECTID",
      resultRecordCount: "2000",
    },
    { label: "raw pull" },
  );
  assert(rawFeats.length === crimeRows, `raw pull ${rawFeats.length} != server count ${crimeRows}`);
  console.log(`  pulled ${rawFeats.length} offense rows`);

  // ---- 3. Client offense-grain tallies + incident dedupe ------------------
  console.log("── Client aggregation (offense grain) + dedupe by INCIDENT_ID");
  const AM_IDX = new Map(ALL_MONTHS.map((m, i) => [m, i]));
  // offense-grain: cat × month (incl. partial month, for server reconciliation)
  const rowTally = Object.fromEntries(CAT_KEYS.map((c) => [c, ALL_MONTHS.map(() => 0)]));
  /** @type {Map<string, any>} */
  const incidents = new Map();
  for (const f of rawFeats) {
    const a = f.attributes;
    const catSrc = String(a.OFFENSE_CATEGORY_ID ?? "");
    const cat = CAT_OF[catSrc];
    assert(cat, `unmapped OFFENSE_CATEGORY_ID '${catSrc}'`);
    const ym = ymOfMs(a.FIRST_OCCURRENCE_DATE);
    const ami = AM_IDX.get(ym);
    assert(ami !== undefined, `row month ${ym} outside ${ALL_MONTHS[0]}…${PARTIAL_MONTH}`);
    rowTally[cat][ami]++;
    const id = String(a.INCIDENT_ID);
    const offId = String(a.OFFENSE_ID);
    const prio = CAT_PRIORITY[cat];
    let inc = incidents.get(id);
    if (!inc) {
      inc = {
        prio,
        offId,
        cat,
        ms: a.FIRST_OCCURRENCE_DATE,
        type: a.OFFENSE_TYPE_ID,
        addr: a.INCIDENT_ADDRESS,
        lat: a.GEO_LAT,
        lng: a.GEO_LON,
        hood: a.NEIGHBORHOOD_ID == null ? null : String(a.NEIGHBORHOOD_ID),
        months: new Set([ym]),
        cats: new Set([cat]),
        hoods: new Set([a.NEIGHBORHOOD_ID == null ? "∅" : String(a.NEIGHBORHOOD_ID)]),
        nRows: 1,
      };
      incidents.set(id, inc);
    } else {
      inc.nRows++;
      inc.months.add(ym);
      inc.cats.add(cat);
      inc.hoods.add(a.NEIGHBORHOOD_ID == null ? "∅" : String(a.NEIGHBORHOOD_ID));
      // representative = highest category priority, tie → lowest OFFENSE_ID
      if (prio < inc.prio || (prio === inc.prio && offId < inc.offId)) {
        inc.prio = prio;
        inc.offId = offId;
        inc.cat = cat;
        inc.ms = a.FIRST_OCCURRENCE_DATE;
        inc.type = a.OFFENSE_TYPE_ID;
        inc.addr = a.INCIDENT_ADDRESS;
        inc.lat = a.GEO_LAT;
        inc.lng = a.GEO_LON;
        inc.hood = a.NEIGHBORHOOD_ID == null ? null : String(a.NEIGHBORHOOD_ID);
      }
    }
  }
  let multiCat = 0,
    multiMonthExtra = 0,
    multiHood = 0,
    dupRows = 0;
  for (const inc of incidents.values()) {
    if (inc.cats.size > 1) multiCat++;
    if (inc.months.size > 1) multiMonthExtra += inc.months.size - 1;
    if (inc.hoods.size > 1) multiHood++;
    dupRows += inc.nRows - 1;
  }
  console.log(
    `  ${incidents.size} incidents from ${rawFeats.length} offense rows ` +
      `(${dupRows} extra offense rows deduped; ${multiCat} incidents span >1 category, ` +
      `${multiHood} span >1 neighborhood value, ${multiMonthExtra} extra month-appearances)`,
  );

  // ---- 4. Independent server reconciliation -------------------------------
  // 4a. offense grain: server grouped cat × year × month == client tallies
  console.log("── Reconciliation A: server grouped counts vs client rows (offense grain)");
  const grouped = await arcAll(
    {
      where: "IS_CRIME=1",
      groupByFieldsForStatistics:
        "OFFENSE_CATEGORY_ID,EXTRACT(YEAR FROM FIRST_OCCURRENCE_DATE),EXTRACT(MONTH FROM FIRST_OCCURRENCE_DATE)",
      outStatistics: JSON.stringify([
        { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
      ]),
    },
    { label: "grouped cat×month" },
  );
  const serverTally = Object.fromEntries(CAT_KEYS.map((c) => [c, ALL_MONTHS.map(() => 0)]));
  for (const f of grouped) {
    const a = f.attributes;
    const cat = CAT_OF[String(a.OFFENSE_CATEGORY_ID)];
    assert(cat, `grouped: unmapped category '${a.OFFENSE_CATEGORY_ID}'`);
    const ym = `${a.EXPR_1}-${String(a.EXPR_2).padStart(2, "0")}`;
    const ami = AM_IDX.get(ym);
    assert(ami !== undefined, `grouped: month ${ym} outside expected span`);
    serverTally[cat][ami] += Number(a.n);
  }
  for (const cat of CAT_KEYS)
    for (let i = 0; i < ALL_MONTHS.length; i++)
      assert(
        serverTally[cat][i] === rowTally[cat][i],
        `offense-grain mismatch ${ALL_MONTHS[i]} ${cat}: server ${serverTally[cat][i]} != client ${rowTally[cat][i]}`,
      );
  console.log(`  server EXTRACT() grouping == client date conversion for all ${ALL_MONTHS.length} months × ${CAT_KEYS.length} cats ✓`);

  // 4b. incident grain: server COUNT(DISTINCT INCIDENT_ID) — total and per month
  console.log("── Reconciliation B: server distinct-incident counts (incident grain)");
  const serverDistinctTotal = await arcDistinctIncidents("IS_CRIME=1", "distinct total");
  assert(
    serverDistinctTotal === incidents.size,
    `distinct incidents: server ${serverDistinctTotal} != client ${incidents.size}`,
  );
  let presenceSum = 0;
  for (const ym of ALL_MONTHS) {
    const serverN = await arcDistinctIncidents(`IS_CRIME=1 AND ${monthWhere(ym)}`, `distinct ${ym}`);
    let clientN = 0;
    for (const inc of incidents.values()) if (inc.months.has(ym)) clientN++;
    assert(serverN === clientN, `distinct incidents ${ym}: server ${serverN} != client ${clientN}`);
    presenceSum += serverN;
  }
  assert(
    presenceSum === incidents.size + multiMonthExtra,
    `presence sum ${presenceSum} != incidents ${incidents.size} + multi-month extras ${multiMonthExtra}`,
  );
  console.log(
    `  ${serverDistinctTotal} distinct incidents server==client; per-month distinct verified for all ${ALL_MONTHS.length} months ✓`,
  );

  // ---- 5. Incident-grain timeline (dedupe applied) ------------------------
  console.log("── Timeline: per-neighborhood monthly incident counts by category");
  const cells = {};
  for (const k of HOODS)
    cells[k] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  const unplacedByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  const cityByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  let partialIncidents = 0;
  const matchedNames = new Set();
  for (const inc of incidents.values()) {
    const ym = ymOfMs(inc.ms);
    if (ym === PARTIAL_MONTH) {
      partialIncidents++;
      continue; // excluded & disclosed: representative date in the partial month
    }
    const mi = MONTH_IDX.get(ym);
    assert(mi !== undefined, `incident month ${ym} outside span`);
    cityByCatMonth[inc.cat][mi]++;
    if (inc.hood !== null && HOODS.has(inc.hood)) {
      cells[inc.hood][mi][inc.cat]++;
      matchedNames.add(inc.hood);
    } else {
      // verified live: the ONLY incident NEIGHBORHOOD_ID absent from the
      // slugified polygon names is null — anything else is a hard failure
      assert(inc.hood === null, `unexpected NEIGHBORHOOD_ID '${inc.hood}'`);
      unplacedByCatMonth[inc.cat][mi]++;
    }
  }
  // identity: placed + unplaced == citywide, per cat per month
  for (const cat of CAT_KEYS)
    for (let mi = 0; mi < MONTHS.length; mi++) {
      let placed = 0;
      for (const k of HOODS) placed += cells[k][mi][cat];
      assert(
        placed + unplacedByCatMonth[cat][mi] === cityByCatMonth[cat][mi],
        `month ${MONTHS[mi]} cat ${cat}: placed+unplaced != citywide`,
      );
    }
  const totalRecords = CAT_KEYS.reduce((s, c) => s + cityByCatMonth[c].reduce((a, b) => a + b, 0), 0);
  assert(totalRecords + partialIncidents === incidents.size, "window + partial != all incidents");
  let placedRecords = 0;
  for (const k of HOODS)
    for (const cc of cells[k]) placedRecords += cc.persons + cc.property + cc.society + cc.other;
  const noNeighborhood = CAT_KEYS.reduce(
    (s, c) => s + unplacedByCatMonth[c].reduce((a, b) => a + b, 0),
    0,
  );
  const unplacedRecords = noNeighborhood;
  assert(placedRecords + unplacedRecords === totalRecords, "placed+unplaced != total");
  const catTotals = Object.fromEntries(
    CAT_KEYS.map((c) => [c, cityByCatMonth[c].reduce((a, b) => a + b, 0)]),
  );
  const coveragePct = Math.round((placedRecords / totalRecords) * 1000) / 10;
  console.log(
    `  join: ${matchedNames.size}/${HOODS.size} polygon neighborhoods appear in incident data (slugify join)`,
  );
  console.log(
    `  window total ${totalRecords} incidents = placed ${placedRecords} + no-neighborhood ${noNeighborhood}` +
      ` → coverage ${coveragePct}% (excluded & disclosed: ${partialIncidents} partial ${PARTIAL_MONTH} incidents)`,
  );

  // ---- 6. Sampled REAL points ---------------------------------------------
  console.log("── Real incident points (source-published coords; deterministic sample)");
  const byMonth = MONTHS.map(() => []);
  let placeableCount = 0,
    noCoords = 0;
  for (const inc of incidents.values()) {
    const ym = ymOfMs(inc.ms);
    if (ym === PARTIAL_MONTH) continue;
    const mi = MONTH_IDX.get(ym);
    const lat = Number(inc.lat),
      lng = Number(inc.lng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < BBOX.latMin ||
      lat > BBOX.latMax ||
      lng < BBOX.lngMin ||
      lng > BBOX.lngMax
    ) {
      noCoords++;
      continue;
    }
    placeableCount++;
    byMonth[mi].push([Number(lng.toFixed(6)), Number(lat.toFixed(6)), CAT_KEYS.indexOf(inc.cat)]);
  }
  // ≤100/month, deterministic even-stride pick across the whole month
  // (incidents in source OBJECTID order of their representative first row)
  const pts = byMonth.map((arr) => {
    if (arr.length <= 100) return arr;
    const out = [];
    for (let i = 0; i < 100; i++) out.push(arr[Math.floor((i * arr.length) / 100)]);
    return out;
  });
  const ptsKept = pts.reduce((s, a) => s + a.length, 0);
  const sampleRate = Math.round(placeableCount / ptsKept);
  console.log(
    `  ${placeableCount} in-bbox incidents, ${noCoords} without usable coords (counted, not plotted), ` +
      `kept ${ptsKept} → 1 per ~${sampleRate}`,
  );

  // ---- 7. Dispatch feed ----------------------------------------------------
  // 14 real incidents per quarter (2021-Q1 … 2026-Q2 = 22 quarters → 308),
  // slots allocated across categories in proportion to the quarter's REAL
  // citywide category mix (largest remainder, deterministic); within each
  // category an even-stride pick across the quarter's chronologically-ordered
  // placed incidents. Every item is a real record.
  console.log("── Feed: 14 real incidents per quarter (category-proportional)");
  const FEED_PER_Q = 14;
  // bucket placed in-window incidents by quarter (deterministic order: date, then id)
  const qKeyOf = (ym) => `${ym.slice(0, 4)}-Q${Math.floor((Number(ym.slice(5, 7)) - 1) / 3) + 1}`;
  const qBuckets = new Map(); // qKey -> {cat -> [inc]}
  for (const [id, inc] of incidents) {
    const ym = ymOfMs(inc.ms);
    if (ym === PARTIAL_MONTH) continue;
    if (inc.hood === null) continue; // feed items anchor at a neighborhood centroid
    const qk = qKeyOf(ym);
    if (!qBuckets.has(qk)) qBuckets.set(qk, Object.fromEntries(CAT_KEYS.map((c) => [c, []])));
    qBuckets.get(qk)[inc.cat].push({ id, ...inc });
  }
  const feed = [];
  const qKeys = [...qBuckets.keys()].sort();
  assert(qKeys.length === 22, `expected 22 quarters, got ${qKeys.length}`);
  for (const qk of qKeys) {
    const buckets = qBuckets.get(qk);
    for (const c of CAT_KEYS)
      buckets[c].sort((x, y) => x.ms - y.ms || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    // real citywide category mix of the quarter (incl. unplaced — honest mix)
    const [qy, qq] = [Number(qk.slice(0, 4)), Number(qk.slice(6))];
    const qMonths = [0, 1, 2]
      .map((k) => MONTH_IDX.get(`${qy}-${String((qq - 1) * 3 + 1 + k).padStart(2, "0")}`))
      .filter((mi) => mi !== undefined);
    const catN = CAT_KEYS.map((c) => qMonths.reduce((s, mi) => s + cityByCatMonth[c][mi], 0));
    const catTot = catN.reduce((a, b) => a + b, 0);
    assert(catTot > 0, `feed ${qk}: empty quarter`);
    const exact = catN.map((n) => (n / catTot) * FEED_PER_Q);
    const alloc = exact.map(Math.floor);
    let rem = FEED_PER_Q - alloc.reduce((a, b) => a + b, 0);
    exact
      .map((e, i) => [e - alloc[i], i])
      .sort((a, b) => b[0] - a[0] || a[1] - b[1])
      .slice(0, rem)
      .forEach(([, i]) => alloc[i]++);
    for (let ci = 0; ci < CAT_KEYS.length; ci++) {
      const pool = buckets[CAT_KEYS[ci]];
      const take = Math.min(alloc[ci], pool.length);
      for (let i = 0; i < take; i++) {
        const inc = pool[Math.floor((i * pool.length) / take)];
        const type = String(inc.type ?? "").trim();
        const catg = String(
          CAT_KEYS[ci] === "other" ? "all-other-crimes" : "",
        );
        const title = type ? humanize(type) : humanize(catg || "offense-unspecified");
        feed.push({
          date: ymdOfMs(inc.ms),
          title,
          place: String(inc.addr ?? "").trim() || beats[inc.hood].name,
          beat: inc.hood,
          cat: inc.cat,
        });
      }
    }
  }
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`  ${feed.length} feed items (chronological, category-proportional, no seriousness bias)`);

  // ---- 8. FBI UCR history 1985–2020 ---------------------------------------
  console.log(
    `── FBI CDE history (${ORI}, 1985–2020, key=${FBI_KEY === "DEMO_KEY" ? "DEMO_KEY" : "FBI_API_KEY"})`,
  );
  async function fetchAnnual(offense, ori = ORI) {
    const url = `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ori}/${offense}?from=${HIST_FROM}&to=${HIST_TO}&API_KEY=${FBI_KEY}`;
    const cachePath = resolve(RAW_DIR, `fbi-${ori}-${offense}.json`);
    let waited = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      let j = null;
      if (existsSync(cachePath)) {
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
      const agKey =
        Object.keys(actuals).find((k) => /Denver Police/i.test(k) && !/Clearance/i.test(k)) ||
        Object.keys(actuals).find((k) => !/United States|Clearance/i.test(k));
      const monthly = actuals[agKey] || {};
      if (Object.keys(monthly).length === 0)
        throw new Error(
          `FBI ${offense}: empty series for ORI ${ori} — verify via ` +
            `https://api.usa.gov/crime/fbi/cde/agency/byStateAbbr/CO (grep Denver)`,
        );
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
  const droppedYears = [];
  const complete = [];
  for (let y = 1985; y <= 2020; y++) {
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
  // keep the longest contiguous run of complete years (ties → later), disclose the rest
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

  // ---- Assemble output files ----------------------------------------------
  const timeline = { months: MONTHS, cells };
  const beatsFile = { cats: CATS, beats };
  const summary = {
    slug: "denver-co",
    title: "Denver · CO",
    source: {
      records: ARC_LAYER,
      beats: `${NBHD}/query?where=1=1&outFields=*&f=geojson`,
      hub: HUB_ITEM,
    },
    fetchedAt,
    dateMin: "2021-01-01",
    dateMax: "2026-06-30",
    months: MONTHS.length,
    totalRecords,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: { "no-neighborhood": noNeighborhood },
    catTotals,
    cats: CATS,
    beatCount: Object.keys(beats).length,
  };
  const history = {
    era: "history",
    taxonomy:
      "FBI UCR Summary (Violent + Property) — a different taxonomy than the DPD NIBRS-based offense categories used from 2021; the two eras bridge at 2021 and are never equated",
    agency: AGENCY,
    ori: ORI,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      `Annual totals are real UCR Summary counts fetched from the FBI CDE summarized agency endpoint for ORI ${ORI} ` +
      `(Denver Police Department; NOT ${ORI_WRONG}, which is the Denver County Sheriff's Office and returns an empty ` +
      `series — verified). 12 reported months verified per kept year. UCR Summary (Violent/Property) and DPD offense ` +
      `categories are different taxonomies and are presented as distinct eras; neighborhood-level detail exists only ` +
      `from 2021 (the source publishes a rolling window of the previous five calendar years plus the current year to ` +
      `date), so the story bridges from citywide annual history to per-neighborhood monthly data at 2021. Reproduce ` +
      `with pipeline/sources/denver-co.mjs (set FBI_API_KEY to avoid DEMO_KEY rate limits).` +
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
    source: "Denver official statistical neighborhoods (City and County of Denver)",
    sourceUrl: `${NBHD}/query?where=1=1&outFields=*&f=geojson`,
    hub: HUB,
    fetchedAt,
    license:
      "City and County of Denver open data use constraints (same publisher/terms as the crime dataset — see PROVENANCE)",
    method:
      "slugify join — DPD crime records carry NEIGHBORHOOD_ID slugs of the official statistical neighborhoods; slugify(NBHD_NAME) from the official polygon layer matches all 78 both directions (only nulls unmatched); no spatial approximation involved",
    map: Object.fromEntries(Object.entries(beats).map(([k, b]) => [k, { name: b.name, approx: false }])),
  };
  const points = {
    mode: "real-sample",
    note:
      "Every dot is a real reported offense location as published by DPD (GEO_LAT/GEO_LON, block-level addresses). " +
      `${noCoords} in-window incidents (~${Math.round((noCoords / totalRecords) * 1000) / 10}%) have missing/out-of-city coords and are counted but not plotted. ` +
      "Deterministic even-stride sample (≤100/month) across each full month. Sex-related crimes are absent from the source entirely (published separately as aggregates only).",
    sampleRate,
    months: MONTHS,
    pts,
  };

  // ---- VALIDATE (fail loudly) ---------------------------------------------
  console.log("── Validation");
  assert(
    MONTHS.length === 66 && MONTHS[0] === "2021-01" && MONTHS[65] === "2026-06",
    "months not contiguous 2021-01..2026-06",
  );
  for (let i = 1; i < MONTHS.length; i++) {
    const [py, pm] = MONTHS[i - 1].split("-").map(Number);
    const [cy, cm] = MONTHS[i].split("-").map(Number);
    assert(
      (cm === pm + 1 && cy === py) || (cm === 1 && pm === 12 && cy === py + 1),
      `months not contiguous at ${MONTHS[i]}`,
    );
  }
  assert(Object.keys(beats).length === 78, "beatCount != 78");
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
    assert(f.date >= "2021-01-01" && f.date <= "2026-06-30", `feed date out of span ${f.date}`);
    assert(beats[f.beat], `feed beat '${f.beat}' not a beats key`);
  }
  assert(
    CAT_KEYS.reduce((s, c) => s + catTotals[c], 0) === totalRecords,
    "catTotals do not sum to totalRecords",
  );
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

  // ---- Write ---------------------------------------------------------------
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
    licenseText,
    rollingSnippet,
    droppedYears,
    droppedSegments,
    crimeRows,
    grandTotal,
    nonCrimeRows,
    dupRows,
    multiCat,
    multiHood,
    multiMonthExtra,
    partialIncidents,
    incidentCount: incidents.size,
    placeableCount,
    noCoords,
    ptsKept,
    sampleRate,
    catTotals,
    rowCatTotals: Object.fromEntries(
      CAT_KEYS.map((c) => [c, rowTally[c].reduce((a, b) => a + b, 0)]),
    ),
  });
  appendWiki({ summary, history });

  console.log("\n── Final summary.json");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nVALIDATION PASS");
}

// ---- PROVENANCE.md ----------------------------------------------------------
function writeProvenance(v) {
  const fmt = (n) => n.toLocaleString("en-US");
  const catRows = Object.entries(CAT_OF)
    .map(([src, cat]) => `| \`${src}\` | \`${cat}\` |`)
    .join("\n");
  const md = `# Provenance — Denver, CO

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — offense records

| Field | Value |
|-------|-------|
| Dataset | **Crime** (ODC_CRIME_OFFENSES_P, layer 324) |
| Publisher | Denver Police Department, via Denver Open Data Catalog (City and County of Denver) |
| Landing page | ${HUB_ITEM} (portal: ${HUB}) |
| API | ${ARC_LAYER} |
| Fetched | ${v.fetchedAt} |
| License | Custom City and County of Denver use constraints — **verbatim text below** |
| Attribution | Denver Police Department via Denver Open Data Catalog, City and County of Denver |
| Rows used | ${fmt(v.crimeRows)} offense rows → **${fmt(v.incidentCount)} incidents** after dedupe (layer grand total ${fmt(v.grandTotal)}; IS_CRIME=1 filter applied — a no-op on this layer, which contains only crimes: ${fmt(v.nonCrimeRows)} rows excluded) |
| Source caveat | Updated Mon–Fri; records are dynamic — added, deleted, and modified as investigations proceed ("Crimes that occurred at least 30 days ago tend to be the most accurate") |

### License (pulled verbatim from the hub item \`licenseInfo\` at fetch time)

> ${v.licenseText}

### Rolling window (disclosed)

The source publishes a **rolling window**, per the item description (verbatim): "${v.rollingSnippet.split(". ")[0]}." At fetch time that window is **2021-01-01 → current** (verified live: minimum FIRST_OCCURRENCE_DATE is exactly 2021-01-01; 0 rows earlier). Consequences:

- The granular era is 2021-01 … 2026-06 (66 months); **2026-07 is a partial month** at fetch time — **${fmt(v.partialIncidents)} incidents excluded and disclosed**.
- Earlier years cannot be rebuilt from this source later — the window slides. Deep history (1985–2020) comes from the FBI UCR era below, citywide-annual only.
- A re-run in a later year will produce a *different* window; \`raw/hub-item.json\` snapshots the item as fetched.

### Sex-related crimes are ABSENT from the source (disclosed prominently)

The published point-level dataset contains **no sexual-assault offense category** — the 13 \`OFFENSE_CATEGORY_ID\` values enumerated below are exhaustive (verified live). The City and County of Denver publishes sex-related crimes only as a separate **aggregated** dataset ("Crime - Sex Related Crimes (aggregated)", no per-incident locations), and the item description states "Certain information is omitted, in accordance with legal requirements". Totals here therefore **undercount crimes against persons** relative to citywide reality, and no sex-crime incidents appear on the map. The FBI UCR history era (which includes rape in its Violent index) is a different taxonomy and is never equated with this era.

### Date field choice (disclosed)

The layer publishes \`FIRST_OCCURRENCE_DATE\`, \`LAST_OCCURRENCE_DATE\`, and \`REPORTED_DATE\`. **We use \`FIRST_OCCURRENCE_DATE\`** — the map animates *when offenses (first) happened*, not when paperwork was filed. 0 null dates; 0 rows predate the window (the source itself filters on this field). Client epoch→month conversion is verified against server-side \`EXTRACT()\` grouping (exact match, all cats × months).

### Grain and dedupe (disclosed)

The source is **offense-level**: one row per offense within an incident (\`OFFENSE_ID\` = \`INCIDENT_ID\` + offense code). We **dedupe by \`INCIDENT_ID\`** so every on-screen count is an **incident** count: ${fmt(v.crimeRows)} offense rows → ${fmt(v.incidentCount)} incidents (${fmt(v.dupRows)} extra offense rows, ×${(v.crimeRows / v.incidentCount).toFixed(3)} inflation removed). Representative offense per incident (deterministic): highest category priority **persons > property > society > other**, tie-broken by lowest \`OFFENSE_ID\` — an incident that includes any crime against a person counts as \`persons\`. ${fmt(v.multiCat)} incidents span more than one mapped category; ${fmt(v.multiHood)} span more than one \`NEIGHBORHOOD_ID\` value (the representative row's value is used); ${fmt(v.multiMonthExtra)} extra month-appearances from incidents whose offense rows carry different first-occurrence months.

Reconciliation against independent server-side queries, all exact:
- offense grain: server grouped count per category × year × month == client tally (67 months × 4 cats);
- incident grain: server \`COUNT(DISTINCT INCIDENT_ID)\` == client, **overall and for every month**;
- placed + unplaced == citywide, per category per month.

### Fields used

\`INCIDENT_ID\` · \`OFFENSE_ID\` · \`FIRST_OCCURRENCE_DATE\` · \`OFFENSE_CATEGORY_ID\` · \`OFFENSE_TYPE_ID\` · \`INCIDENT_ADDRESS\` (block-level, e.g. "3000 BLK STOUT ST") · \`GEO_LAT\`/\`GEO_LON\` · \`NEIGHBORHOOD_ID\` (official statistical-neighborhood slug) · \`IS_CRIME\`.

### Category mapping (OFFENSE_CATEGORY_ID → cat) — documented in full

Denver publishes offense **categories**, not native NIBRS crimes-against groups; each category is mapped to the NIBRS crimes-against group of the offenses it contains. The 13 values below are exhaustive (verified live):

| Source category | cat |
|---|---|
${catRows}

Notes: **robbery** maps to \`property\` because NIBRS classifies robbery as a crime against property. **public-disorder** (criminal mischief, disorderly conduct, weapons, prostitution…) maps to \`society\` as the closest crimes-against-society bucket, though it contains some persons-adjacent types (e.g. harassment) — the mapping is at category grain, coarser than NIBRS offense-level assignment. **all-other-crimes** is a mixed catch-all (criminal trespass, traffic-related criminal offenses, probation violations…) mapped to \`other\` ("${CATS.other.label}") and never counted as persons/property/society.

Window totals at incident grain: persons ${fmt(v.catTotals.persons)} · property ${fmt(v.catTotals.property)} · society ${fmt(v.catTotals.society)} · other ${fmt(v.catTotals.other)} (offense-row grain for comparison: ${fmt(v.rowCatTotals.persons)} / ${fmt(v.rowCatTotals.property)} / ${fmt(v.rowCatTotals.society)} / ${fmt(v.rowCatTotals.other)}).

### Coverage

- Placed (one of the 78 official statistical neighborhoods, 2021-01…2026-06): **${fmt(v.summary.placedRecords)}** (${v.summary.coveragePct}%)
- Unplaced: ${fmt(v.summary.unplacedRecords)} incidents with a null \`NEIGHBORHOOD_ID\` — kept in every citywide total and disclosed.
- Excluded & disclosed: ${fmt(v.partialIncidents)} incidents in partial month ${PARTIAL_MONTH}.

## Geometry source — official neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **ODC_ADMN_NEIGHBORHOOD_A** (layer 13) — 78 official statistical neighborhoods |
| FeatureServer | ${NBHD} |
| License | Same publisher and use constraints as the crime dataset (City and County of Denver) |
| Join key | \`slugify(NBHD_NAME)\` ↔ crime \`NEIGHBORHOOD_ID\` — **exact 78/78 both directions** (lowercase, non-alphanumeric runs → hyphen); the only unmatched incident value is null (disclosed as no-neighborhood) |
| Display names | \`NBHD_NAME\` verbatim from the polygon layer (proper names residents use, e.g. "Capitol Hill", "Five Points", "CBD") |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (\`points.json\`)

Dots are **real offense locations published by DPD** (\`GEO_LAT\`/\`GEO_LON\`; addresses are block-level, e.g. "3000 BLK STOUT ST"). **${fmt(v.noCoords)} in-window incidents have missing or out-of-city coordinates** — counted in every total, never plotted. Client-side gate: lat ${BBOX.latMin}–${BBOX.latMax}, lng ${BBOX.lngMin}–${BBOX.lngMax}. Deterministic sample: even-stride ≤100/month over each month's placeable incidents → **${fmt(v.ptsKept)} points ≈ 1 per ${v.sampleRate} of the ${fmt(v.placeableCount)} placeable incidents**.

## Historical source — FBI UCR (${v.history.yearMin}–${v.history.yearMax} deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Denver Police Department — **ORI \`${ORI}\`** (⚠ NOT \`${ORI_WRONG}\`: that ORI is the Denver County **Sheriff's Office** and returns an empty series — verified via the CDE state agency list) |
| Endpoint | ${v.history.sourceUrl} (and \`/property-crime\`) |
| Span | ${v.history.yearMin}–${v.history.yearMax}, annual Violent + Property (12 reported months verified per year) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set \`FBI_API_KEY\`) |
${
  v.droppedYears.length
    ? `\n**Dropped partial years (disclosed):** ${v.droppedYears
        .map((d) => `**${d.year}** (violent ${d.violentMonths}/12, property ${d.propertyMonths}/12 reported months)`)
        .join(", ")} — an annual total cannot honestly be built from fewer than 12 reported months.`
    : `\nAll ${v.history.yearMax - v.history.yearMin + 1} years in the span reported 12 months for both series — no years dropped.`
}${
    v.droppedSegments.length
      ? `\n**Dropped complete-but-noncontiguous years (disclosed):** ${v.droppedSegments.join(", ")}.`
      : ""
  }

Raw responses are cached under \`data/denver-co/raw/\`. UCR Summary (Violent/Property) is a **different taxonomy** than DPD offense categories — the eras are presented as distinct and bridge at 2021; they are never equated. No monthly or neighborhood detail is implied for ${v.history.yearMin}–${v.history.yearMax}. Note: UCR Violent *includes* rape, which the granular era's source omits — one more reason the eras must never be compared directly.

## Reproduce

\`\`\`bash
FBI_API_KEY=… node pipeline/sources/denver-co.mjs
\`\`\`
`;
  writeFileSync(PROV_PATH, md);
  console.log(`  wrote data/denver-co/PROVENANCE.md`);
}

// ---- wiki/Data-Provenance.md append -----------------------------------------
function appendWiki({ summary, history }) {
  if (!existsSync(WIKI_PATH)) return;
  const cur = readFileSync(WIKI_PATH, "utf8");
  if (cur.includes("## Denver, CO")) {
    console.log("  wiki/Data-Provenance.md already has a Denver section — skipped");
    return;
  }
  const fmt = (n) => n.toLocaleString("en-US");
  const section = `
## Denver, CO (\`denver-co\`)

- **Primary source:** Crime — DPD offense records, **rolling window** ("previous
  five calendar years plus the current year to date" = 2021-01 → current at
  fetch) (ArcGIS \`ODC_CRIME_OFFENSES_P/FeatureServer/324\`, ${HUB_ITEM}) —
  custom City and County of Denver use constraints, quoted verbatim in
  PROVENANCE. Attribution "Denver Police Department via Denver Open Data
  Catalog". Updated Mon–Fri; records are dynamic.
- **Grain/dedupe:** source is offense-level; **deduped by \`INCIDENT_ID\`**
  (${fmt(summary.totalRecords)} in-window incidents; representative offense =
  persons > property > society > other, tie lowest \`OFFENSE_ID\`). Both grains
  reconciled exactly against server-side grouped and COUNT(DISTINCT) queries,
  per month.
- **Sex crimes absent:** the source publishes **no sexual-assault category**
  (sex-related crimes exist only as a separate aggregated dataset) — persons
  totals undercount citywide reality; disclosed prominently.
- **Date field:** \`FIRST_OCCURRENCE_DATE\` (when the offense first happened),
  not \`REPORTED_DATE\`.
- **Spatial unit:** the 78 official **Denver statistical neighborhoods** — crime
  \`NEIGHBORHOOD_ID\` slugs join \`slugify(NBHD_NAME)\` of the official polygon
  layer \`ODC_ADMN_NEIGHBORHOOD_A/FeatureServer/13\` exactly 78/78 both
  directions (only nulls unmatched); display names verbatim from polygons.
- **Deep-history source (${history.yearMin}–${history.yearMax}):** FBI Crime Data Explorer (CDE) —
  Denver Police Department, **ORI ${ORI}** (not ${ORI_WRONG} = Sheriff's Office,
  empty series) — real annual Violent + Property counts, ${history.years.length} full years
  (12 reported months each, verified). UCR taxonomy kept distinct; eras bridge
  at 2021.
- **Span:** ${history.yearMin}–${history.yearMax} (FBI UCR annual) + 2021-01-01 → 2026-06-30 (DPD
  offenses with neighborhood detail, ${summary.months} months; partial 2026-07 dropped and
  disclosed).
- **Records:** ${fmt(summary.totalRecords)} in-window incidents ·
  ${fmt(summary.placedRecords)} placed in an official neighborhood
  (**${summary.coveragePct}% coverage**) · ${fmt(summary.unplacedRecords)} unplaced (null
  neighborhood), kept in totals and disclosed.
- **Real dots:** DPD publishes per-record \`GEO_LAT\`/\`GEO_LON\` (block-level
  addresses); dots are a deterministic even-stride ≤100/month sample of
  **real** locations; incidents without usable coords are counted but not
  plotted.
- **License:** custom Denver use constraints (verbatim in PROVENANCE) — "AS IS",
  liability waiver, "NOT FOR ENGINEERING PURPOSES".
- **Detail:** [\`data/denver-co/PROVENANCE.md\`](../data/denver-co/PROVENANCE.md)

### Category mapping (OFFENSE_CATEGORY_ID → cat; 13 source values, exhaustive)

| Source categories | cat |
|-------------------|-----|
| murder, aggravated-assault, other-crimes-against-persons | \`persons\` |
| robbery (NIBRS: crime against property), burglary, larceny, theft-from-motor-vehicle, auto-theft, arson, white-collar-crime | \`property\` |
| drug-alcohol, public-disorder (closest crimes-against-society bucket; contains some persons-adjacent types — category-grain mapping disclosed) | \`society\` |
| all-other-crimes | \`other\` (mixed catch-all — context only, never counted as persons/property/society) |
`;
  const marker = "## Ranked source types";
  const idx = cur.indexOf(marker);
  const next =
    idx >= 0 ? cur.slice(0, idx) + section.trimStart() + "\n" + cur.slice(idx) : cur + section;
  writeFileSync(WIKI_PATH, next);
  console.log("  appended Denver section to wiki/Data-Provenance.md");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
