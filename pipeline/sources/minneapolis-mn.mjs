// Minneapolis, MN — MPD Crime Data source pipeline (fetch → normalize → validate).
//
// BINDING RULE: never fabricate — every figure written by this script comes
// straight from a queryable public source; every gap is disclosed.
//
// Sources:
//   Incidents  : Open Data Minneapolis "Crime_Data" consolidated ArcGIS layer
//                (2019-present, refreshed daily), Minneapolis Police Department.
//                https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/Crime_Data/FeatureServer/0
//                License: the per-year "Police Incidents" items are explicitly
//                CC0 1.0; the consolidated item's license field is blank —
//                cited per portal norm (City of Minneapolis waives copyright
//                on Open Data). Contact: PoliceOpenData@minneapolismn.gov
//   Polygons   : Minneapolis_Neighborhoods (official, 87 features, BDNAME) —
//                copyright waived (CC0) by City of Minneapolis.
//                https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/Minneapolis_Neighborhoods/FeatureServer/0
//   History    : FBI Crime Data Explorer (CDE) summarized agency counts,
//                Minneapolis PD ORI MN0271100, 1985–2018 annual Violent + Property.
//
// Eras (honesty structure):
//   1985–2018  FBI UCR annual citywide totals (no neighborhood detail implied)
//   2019-01 → 2026-06  MPD NIBRS with official-neighborhood detail (the
//                consolidated dataset starts 2019; rows whose Occurred_Date
//                predates 2019 — old occurrences reported 2019+ — are counted
//                and disclosed as "occurred-pre-2019" unplaced).
//
// Date field: Occurred_Date (when the offense happened), NOT Reported_Date —
// the map animates when crime occurred; the choice is recorded in PROVENANCE.
//
//   node pipeline/sources/minneapolis-mn.mjs   (set FBI_API_KEY to avoid DEMO_KEY limits)
//
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const OUT_DIR = resolve(repoRoot, "data/minneapolis-mn/normalized");
const RAW_DIR = resolve(repoRoot, "data/minneapolis-mn/raw");
const PROV_PATH = resolve(repoRoot, "data/minneapolis-mn/PROVENANCE.md");
const WIKI_PATH = resolve(repoRoot, "wiki/Data-Provenance.md");

const ARC = "https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/Crime_Data/FeatureServer/0/query";
const ARC_LAYER = "https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/Crime_Data/FeatureServer/0";
const HUB_ITEM = "https://www.arcgis.com/home/item.html?id=dfbae39fd25d45838a649d0fc27be4fb";
const HUB = "https://opendata.minneapolismn.gov/";
const NBHD =
  "https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/Minneapolis_Neighborhoods/FeatureServer/0";
const ORI = "MN0271100";
const AGENCY = "Minneapolis Police Department";
const FBI_KEY = process.env.FBI_API_KEY || "DEMO_KEY";

// Granular era window by Occurred_Date (consolidated dataset starts 2019;
// 2026-07 is a partial month at fetch time — dropped and disclosed)
const SPAN_START = "2019-01-01 00:00:00"; // inclusive
const SPAN_END = "2026-07-01 00:00:00"; // exclusive → dateMax 2026-06-30
const HIST_FROM = "01-1985";
const HIST_TO = "12-2018";

// NIBRS_Crime_Against (source values carry TRAILING SPACES, e.g. "Property ") →
// cat, keyed by TRIMMED value. "Non NIBRS Data" is MPD's supplemental bucket
// (Shots Fired Calls, Gunshot Wound Victims, and domestic assault/robbery
// "Subset of NIBRS ..." rows that duplicate NIBRS offenses) — disclosed as
// context, never counted as NIBRS persons/property/society.
const CAT_OF = {
  Person: "persons",
  Property: "property",
  Society: "society",
  "Non NIBRS Data": "other",
  "Not a Crime": "other",
};
const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff2e63" },
  property: { label: "Crimes Against Property", color: "#ffc233" },
  society: { label: "Crimes Against Society", color: "#34e0e0" },
  other: { label: "Other / non-criminal (context)", color: "#7486a0" },
};
const CAT_KEYS = ["persons", "property", "society", "other"]; // catIdx order
// Exact source literals (verified live: these 5 values are exhaustive)
const CAT_WHERE = {
  persons: `NIBRS_Crime_Against = 'Person '`,
  property: `NIBRS_Crime_Against = 'Property '`,
  society: `NIBRS_Crime_Against = 'Society '`,
  other: `NIBRS_Crime_Against IN ('Non NIBRS Data', 'Not a Crime ')`,
};

// Valid Minneapolis coordinate box (source Latitude/Longitude are doubles;
// missing locations are published as 0,0 — rejected here).
const BBOX = { latMin: 44.89, latMax: 45.06, lngMin: -93.33, lngMax: -93.19 };

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
    // ArcGIS reports errors inside a 200 body
    if (j.error) {
      if (attempt >= retries) throw new Error(`${label}: ArcGIS error ${JSON.stringify(j.error)}`);
      console.warn(`  ArcGIS error (${label}): ${j.error.message}; retry in ${retryWait}ms…`);
      await sleep(retryWait);
      continue;
    }
    return j;
  }
}

// Feature query with resultOffset paging (works for raw AND aggregated queries —
// the service supports pagination on aggregated queries).
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
  const j = await postJSON(
    ARC,
    {
      f: "json",
      where,
      outStatistics: JSON.stringify([
        { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
      ]),
    },
    { label },
  );
  const n = j.features?.[0]?.attributes?.n;
  if (!Number.isFinite(n)) throw new Error(`${label}: bad count response`);
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
const MONTHS = monthRange("2019-01", "2026-06"); // 90
const MONTH_IDX = new Map(MONTHS.map((m, i) => [m, i]));
// Epoch-ms → "YYYY-MM"/"YYYY-MM-DD". The service stores local wall-clock time
// as if UTC (verified: server-side EXTRACT() grouping reconciles exactly with
// this client-side conversion in the raw-month cross-check below).
const ymOfMs = (ms) => new Date(ms).toISOString().slice(0, 7);
const ymdOfMs = (ms) => new Date(ms).toISOString().slice(0, 10);
const monthWhere = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return `Occurred_Date >= TIMESTAMP '${ym}-01 00:00:00' AND Occurred_Date < TIMESTAMP '${next}-01 00:00:00'`;
};
const SPAN_WHERE = `Occurred_Date >= TIMESTAMP '${SPAN_START}' AND Occurred_Date < TIMESTAMP '${SPAN_END}'`;
const WINDOW_WHERE = `Occurred_Date < TIMESTAMP '${SPAN_END}'`; // totals window (see PROVENANCE)

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

  // ---- 1. Official neighborhood polygons -----------------------------------
  console.log("── Minneapolis official neighborhood polygons");
  const gj = await postJSON(
    `${NBHD}/query`,
    { f: "geojson", where: "1=1", outFields: "BDNAME,BDNUM" },
    { label: "neighborhoods geojson" },
  );
  assert(gj?.type === "FeatureCollection" && Array.isArray(gj.features), "NBHD: bad geojson");
  assert(gj.features.length === 87, `NBHD: expected 87 features, got ${gj.features.length}`);

  const beats = {};
  gj.features.forEach((f, idx) => {
    const raw = f.properties?.BDNAME;
    assert(typeof raw === "string" && raw.trim().length > 0, `NBHD feature ${idx}: missing BDNAME`);
    const key = raw.trim(); // defensive trim; verified identical to trimmed values
    assert(!beats[key], `NBHD: duplicate neighborhood '${key}'`);
    const g = f.geometry;
    const parts = g.type === "Polygon" ? [g.coordinates] : g.coordinates; // MultiPolygon
    const outerRings = parts.map((p) => p[0]); // outer ring of each part
    let A = 0,
      X = 0,
      Y = 0;
    for (const ring of outerRings) {
      const { area, cx, cy } = ringAreaCentroid(ring);
      A += area;
      X += cx * area;
      Y += cy * area;
    }
    assert(A > 0, `NBHD '${key}': zero area`);
    beats[key] = {
      key,
      name: key, // BDNAME is already the resident-facing proper name
      servcen: String(f.properties?.BDNUM ?? ""),
      beat: idx,
      centroid: [Number((X / A).toFixed(6)), Number((Y / A).toFixed(6))],
      polygon: outerRings,
      geomType: g.type,
    };
  });
  const HOODS = new Set(Object.keys(beats));
  console.log(`  ${HOODS.size} neighborhoods (e.g. ${[...HOODS].slice(0, 3).join(", ")})`);

  // ---- 2. Timeline cells: per-cat × neighborhood × month -------------------
  console.log("── Timeline: per-neighborhood monthly counts by category (2019-01…2026-06)");
  const cells = {};
  for (const k of HOODS)
    cells[k] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  // null-neighborhood rows inside the span, per cat per month (disclosed as unplaced)
  const junkByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  const joinStats = { matchedNames: new Set(), nullRows: 0 };

  for (const cat of CAT_KEYS) {
    const feats = await arcAll(
      {
        where: `${SPAN_WHERE} AND ${CAT_WHERE[cat]}`,
        groupByFieldsForStatistics:
          "Neighborhood,EXTRACT(YEAR FROM Occurred_Date),EXTRACT(MONTH FROM Occurred_Date)",
        outStatistics: JSON.stringify([
          { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
        ]),
      },
      { label: `timeline ${cat}` },
    );
    let placedN = 0,
      junkN = 0;
    for (const f of feats) {
      const a = f.attributes;
      const ym = `${a.EXPR_1}-${String(a.EXPR_2).padStart(2, "0")}`;
      const mi = MONTH_IDX.get(ym);
      assert(mi !== undefined, `timeline ${cat}: month ${ym} outside span`);
      const n = Number(a.n);
      assert(Number.isFinite(n) && n >= 0, `timeline ${cat}: bad count ${a.n}`);
      const hood = a.Neighborhood == null ? null : String(a.Neighborhood).trim();
      if (hood !== null && HOODS.has(hood)) {
        cells[hood][mi][cat] += n;
        placedN += n;
        joinStats.matchedNames.add(hood);
      } else {
        // verified live: the ONLY incident-neighborhood value absent from the
        // polygon layer is null — anything else is a hard failure
        assert(hood === null, `timeline ${cat}: unexpected neighborhood '${hood}'`);
        junkByCatMonth[cat][mi] += n;
        junkN += n;
      }
    }
    console.log(`  ${cat}: ${feats.length} cells → ${placedN} placed, ${junkN} unplaced-in-span`);
  }
  console.log(
    `  join: ${joinStats.matchedNames.size}/${HOODS.size} polygon neighborhoods appear in incident data; ` +
      `0 incident names missing from polygons (identity join, trimmed)`,
  );

  // ---- 3. Citywide per-cat monthly (cross-check + unplaced derivation) ------
  console.log("── Citywide monthly totals per category (cross-check)");
  const cityByCatMonth = {};
  for (const cat of CAT_KEYS) {
    const feats = await arcAll(
      {
        where: `${SPAN_WHERE} AND ${CAT_WHERE[cat]}`,
        groupByFieldsForStatistics:
          "EXTRACT(YEAR FROM Occurred_Date),EXTRACT(MONTH FROM Occurred_Date)",
        outStatistics: JSON.stringify([
          { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
        ]),
      },
      { label: `citywide ${cat}` },
    );
    const arr = MONTHS.map(() => 0);
    for (const f of feats) {
      const a = f.attributes;
      const ym = `${a.EXPR_1}-${String(a.EXPR_2).padStart(2, "0")}`;
      const mi = MONTH_IDX.get(ym);
      assert(mi !== undefined, `citywide ${cat}: month ${ym} outside span`);
      arr[mi] = Number(a.n);
    }
    cityByCatMonth[cat] = arr;
  }
  // VALIDATE: placed + junk == citywide, per cat per month (grouped query is exhaustive)
  for (const cat of CAT_KEYS) {
    for (let mi = 0; mi < MONTHS.length; mi++) {
      let placed = 0;
      for (const k of HOODS) placed += cells[k][mi][cat];
      const lhs = placed + junkByCatMonth[cat][mi];
      const rhs = cityByCatMonth[cat][mi];
      assert(
        lhs === rhs,
        `month ${MONTHS[mi]} cat ${cat}: placed+unplaced ${lhs} != citywide ${rhs}`,
      );
    }
  }
  console.log(`  placed + unplaced == citywide for all ${MONTHS.length} months × 4 cats ✓`);

  // ---- 3b. Raw-pull verification of one full month --------------------------
  console.log("── Verification: raw paged pull of 2023-05 vs grouped stats");
  const VER_YM = "2023-05";
  const rawFeats = await arcAll(
    {
      where: monthWhere(VER_YM),
      outFields: "Occurred_Date,Neighborhood,NIBRS_Crime_Against",
      returnGeometry: "false",
      orderByFields: "OBJECTID",
      resultRecordCount: "16000",
    },
    { label: `raw ${VER_YM}` },
  );
  const rawTally = Object.fromEntries(CAT_KEYS.map((c) => [c, { placed: 0, junk: 0 }]));
  for (const f of rawFeats) {
    const a = f.attributes;
    assert(ymOfMs(a.Occurred_Date) === VER_YM, `raw ${VER_YM}: date ${a.Occurred_Date} outside month`);
    const cat = CAT_OF[String(a.NIBRS_Crime_Against ?? "").trim()];
    assert(cat, `raw ${VER_YM}: unmapped NIBRS_Crime_Against '${a.NIBRS_Crime_Against}'`);
    const hood = a.Neighborhood == null ? null : String(a.Neighborhood).trim();
    if (hood !== null && HOODS.has(hood)) rawTally[cat].placed++;
    else {
      assert(hood === null, `raw ${VER_YM}: unexpected neighborhood '${hood}'`);
      rawTally[cat].junk++;
    }
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
  console.log(`  ${rawFeats.length} raw rows in ${VER_YM} match grouped stats exactly, all 4 cats ✓`);

  // ---- 4. Dataset-level totals ---------------------------------------------
  console.log("── Dataset totals (Occurred_Date < 2026-07-01 window)");
  // The consolidated layer holds 2019-present REPORTS; a small tail of rows
  // OCCURRED before 2019 (back to 1922 — old offenses reported recently).
  // They are counted in totalRecords and disclosed as "occurred-pre-2019"
  // unplaced. Excluded and disclosed: partial-month 2026-07 rows and rows
  // with no Occurred_Date at all.
  const totalRecords = await arcCount(WINDOW_WHERE, "total window");
  const pre2019 = await arcCount(
    `Occurred_Date < TIMESTAMP '${SPAN_START}'`,
    "occurred-pre-2019 count",
  );
  const partialJuly = await arcCount(
    `Occurred_Date >= TIMESTAMP '${SPAN_END}'`,
    "partial 2026-07 count",
  );
  const nullDate = await arcCount(`Occurred_Date IS NULL`, "null Occurred_Date count");
  const grand = await arcCount(`1=1`, "grand total");
  assert(
    totalRecords + partialJuly + nullDate === grand,
    `window ${totalRecords} + partial ${partialJuly} + nullDate ${nullDate} != grand ${grand}`,
  );

  const catRowsJ = await arcAll(
    {
      where: WINDOW_WHERE,
      groupByFieldsForStatistics: "NIBRS_Crime_Against",
      outStatistics: JSON.stringify([
        { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
      ]),
    },
    { label: "catTotals window" },
  );
  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  const catSourceValues = [];
  for (const f of catRowsJ) {
    const rawVal = f.attributes.NIBRS_Crime_Against;
    const cat = CAT_OF[String(rawVal ?? "").trim()];
    assert(cat, `catTotals: unmapped NIBRS_Crime_Against '${rawVal}'`);
    catTotals[cat] += Number(f.attributes.n);
    catSourceValues.push({ value: rawVal, cat, n: Number(f.attributes.n) });
  }
  assert(
    CAT_KEYS.reduce((s, c) => s + catTotals[c], 0) === totalRecords,
    "catTotals do not sum to totalRecords",
  );
  // Enumerate what "Non NIBRS Data" actually contains (disclosed in PROVENANCE)
  const nonNibrsRows = await arcAll(
    {
      where: `${WINDOW_WHERE} AND NIBRS_Crime_Against = 'Non NIBRS Data'`,
      groupByFieldsForStatistics: "Offense_Category",
      outStatistics: JSON.stringify([
        { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
      ]),
    },
    { label: "nonNibrs breakdown" },
  );
  const nonNibrsBreakdown = nonNibrsRows
    .map((f) => ({ category: f.attributes.Offense_Category, n: Number(f.attributes.n) }))
    .sort((a, b) => b.n - a.n);
  // Crime_Count disclosure: rows vs the dataset's own offense multiplier field
  const ccJ = await postJSON(
    ARC,
    {
      f: "json",
      where: WINDOW_WHERE,
      outStatistics: JSON.stringify([
        { statisticType: "sum", onStatisticField: "Crime_Count", outStatisticFieldName: "csum" },
      ]),
    },
    { label: "Crime_Count sum" },
  );
  const crimeCountSum = Number(ccJ.features[0].attributes.csum);

  let placedRecords = 0;
  for (const k of HOODS)
    for (const cc of cells[k]) placedRecords += cc.persons + cc.property + cc.society + cc.other;
  const noNeighborhood = CAT_KEYS.reduce(
    (s, c) => s + junkByCatMonth[c].reduce((a, b) => a + b, 0),
    0,
  );
  const citywideSpanTotal = CAT_KEYS.reduce(
    (s, c) => s + cityByCatMonth[c].reduce((a, b) => a + b, 0),
    0,
  );
  assert(
    pre2019 + citywideSpanTotal === totalRecords,
    `pre2019 ${pre2019} + span ${citywideSpanTotal} != total ${totalRecords}`,
  );
  const unplacedRecords = pre2019 + noNeighborhood;
  assert(placedRecords + unplacedRecords === totalRecords, "placed+unplaced != total");
  const coveragePct = Math.round((placedRecords / totalRecords) * 1000) / 10;
  console.log(
    `  total ${totalRecords} = placed ${placedRecords} + occurred-pre-2019 ${pre2019} + no-neighborhood ${noNeighborhood}` +
      ` → coverage ${coveragePct}%` +
      ` (excluded & disclosed: ${partialJuly} partial 2026-07 rows, ${nullDate} null-date row(s))`,
  );

  // ---- 5. Sampled REAL points ----------------------------------------------
  console.log("── Real incident points (source-published coords; deterministic sample)");
  // Full pull of every in-bbox row per month, then even-stride to ≤100/month —
  // dots are real Latitude/Longitude values published by MPD (the source also
  // publishes wgsX/YAnon block-anonymized coords; we use Latitude/Longitude).
  const BBOX_WHERE = `Latitude >= ${BBOX.latMin} AND Latitude <= ${BBOX.latMax} AND Longitude >= ${BBOX.lngMin} AND Longitude <= ${BBOX.lngMax}`;
  const byMonth = MONTHS.map(() => []);
  let placeableCount = 0,
    fetched = 0,
    rejected = 0;
  for (let mi = 0; mi < MONTHS.length; mi++) {
    const feats = await arcAll(
      {
        where: `${monthWhere(MONTHS[mi])} AND ${BBOX_WHERE}`,
        outFields: "Occurred_Date,Latitude,Longitude,NIBRS_Crime_Against",
        returnGeometry: "false",
        orderByFields: "OBJECTID",
        resultRecordCount: "16000",
      },
      { label: `points ${MONTHS[mi]}` },
    );
    placeableCount += feats.length;
    for (const f of feats) {
      fetched++;
      const a = f.attributes;
      const lat = Number(a.Latitude),
        lng = Number(a.Longitude);
      const cat = CAT_OF[String(a.NIBRS_Crime_Against ?? "").trim()];
      const miRow = MONTH_IDX.get(ymOfMs(a.Occurred_Date));
      if (
        miRow !== mi ||
        !cat ||
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
      byMonth[mi].push([Number(lng.toFixed(6)), Number(lat.toFixed(6)), CAT_KEYS.indexOf(cat)]);
    }
    if ((mi + 1) % 12 === 0) console.log(`  …through ${MONTHS[mi]} (${fetched} rows so far)`);
  }
  // ≤100/month, deterministic even-stride pick across the WHOLE month (rows in OBJECTID order)
  const pts = byMonth.map((arr) => {
    if (arr.length <= 100) return arr;
    const out = [];
    for (let i = 0; i < 100; i++) out.push(arr[Math.floor((i * arr.length) / 100)]);
    return out;
  });
  const ptsKept = pts.reduce((s, a) => s + a.length, 0);
  const sampleRate = Math.round(placeableCount / ptsKept);
  console.log(
    `  fetched ${fetched} in-bbox rows, rejected ${rejected} (client re-check), kept ${ptsKept}` +
      ` of ${placeableCount} placeable → 1 per ~${sampleRate}`,
  );

  // ---- 6. Dispatch feed ------------------------------------------------------
  // NOTE: rows in this layer cluster by offense batch in OBJECTID order, so a
  // plain "first 10 per quarter" pull is dominated by "Subset of NIBRS" context
  // rows. Instead the 10 quarterly slots are allocated across categories in
  // proportion to that quarter's REAL citywide category mix (largest-remainder,
  // deterministic) — every item is still a real record in OBJECTID order.
  console.log("── Feed: 10 real items per quarter (category-proportional), 2019-Q1 … 2026-Q2");
  const feed = [];
  for (let y = 2019; y <= 2026; y++) {
    for (let q = 0; q < 4; q++) {
      const start = `${y}-${String(q * 3 + 1).padStart(2, "0")}-01 00:00:00`;
      const end =
        q === 3
          ? `${y + 1}-01-01 00:00:00`
          : `${y}-${String(q * 3 + 4).padStart(2, "0")}-01 00:00:00`;
      if (start >= SPAN_END) continue;
      // real category mix of this quarter (from the validated citywide series)
      const qMonths = [0, 1, 2]
        .map((k) => MONTH_IDX.get(`${y}-${String(q * 3 + 1 + k).padStart(2, "0")}`))
        .filter((mi) => mi !== undefined);
      const catN = CAT_KEYS.map((c) => qMonths.reduce((s, mi) => s + cityByCatMonth[c][mi], 0));
      const catTot = catN.reduce((a, b) => a + b, 0);
      assert(catTot > 0, `feed ${y}Q${q + 1}: empty quarter`);
      const exact = catN.map((n) => (n / catTot) * 10);
      const alloc = exact.map(Math.floor);
      let rem = 10 - alloc.reduce((a, b) => a + b, 0);
      exact
        .map((e, i) => [e - alloc[i], i])
        .sort((a, b) => b[0] - a[0])
        .slice(0, rem)
        .forEach(([, i]) => alloc[i]++);
      const rows = [];
      for (let ci = 0; ci < CAT_KEYS.length; ci++) {
        if (alloc[ci] === 0) continue;
        const j = await postJSON(
          ARC,
          {
            f: "json",
            where:
              `Occurred_Date >= TIMESTAMP '${start}' AND Occurred_Date < TIMESTAMP '${end}'` +
              ` AND Neighborhood IS NOT NULL AND ${CAT_WHERE[CAT_KEYS[ci]]}`,
            outFields:
              "Occurred_Date,Offense_Category,Offense,Address,Neighborhood,NIBRS_Crime_Against",
            returnGeometry: "false",
            orderByFields: "OBJECTID",
            resultRecordCount: String(alloc[ci]),
          },
          { label: `feed ${y}Q${q + 1} ${CAT_KEYS[ci]}` },
        );
        rows.push(...(j.features || []));
      }
      for (const f of rows) {
        const a = f.attributes;
        const hood = String(a.Neighborhood).trim();
        assert(HOODS.has(hood), `feed: unexpected neighborhood '${a.Neighborhood}'`);
        const catg = String(a.Offense_Category ?? "").trim();
        const off = String(a.Offense ?? "").trim();
        const title = !off
          ? catg || "OFFENSE (unspecified)"
          : !catg || off.toLowerCase() === catg.toLowerCase()
            ? off
            : `${catg} — ${off}`;
        feed.push({
          date: ymdOfMs(a.Occurred_Date),
          title,
          place: String(a.Address ?? "").trim() || hood,
          beat: hood,
          cat: CAT_OF[String(a.NIBRS_Crime_Against ?? "").trim()] || "other",
        });
      }
    }
  }
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`  ${feed.length} feed items (chronological, no seriousness bias)`);

  // ---- 7. FBI UCR history 1985–2018 -----------------------------------------
  console.log(
    `── FBI CDE history (${ORI}, 1985–2018, key=${FBI_KEY === "DEMO_KEY" ? "DEMO_KEY" : "FBI_API_KEY"})`,
  );
  mkdirSync(RAW_DIR, { recursive: true });
  async function fetchAnnual(offense, ori = ORI) {
    const url = `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ori}/${offense}?from=${HIST_FROM}&to=${HIST_TO}&API_KEY=${FBI_KEY}`;
    const cachePath = resolve(RAW_DIR, `fbi-${ori}-${offense}.json`);
    let waited = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      let j = null;
      if (existsSync(cachePath)) {
        // Real response from a real earlier fetch of THIS run/ORI/span — its
        // own fetchedAtUTC is recorded inside; never synthesized.
        const cached = JSON.parse(readFileSync(cachePath, "utf8"));
        console.log(`  using cached FBI response ${cachePath} (fetched ${cached.fetchedAtUTC})`);
        j = cached.response;
      } else {
        const r = await fetch(url);
        if (r.status === 429 || r.status === 403) {
          const wait = waited === 0 ? 90000 : 300000; // 90s first, then 300s
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
            JSON.stringify({ url: url.replace(FBI_KEY, "<key>"), fetchedAtUTC: new Date().toISOString(), response: j }),
          );
      }
      const actuals = j?.offenses?.actuals;
      if (!actuals) throw new Error(`FBI ${offense}: no actuals in response`);
      const agKey =
        Object.keys(actuals).find((k) => /Minneapolis/i.test(k)) ||
        Object.keys(actuals).find((k) => !/United States/i.test(k));
      const monthly = actuals[agKey] || {};
      if (Object.keys(monthly).length === 0)
        throw new Error(
          `FBI ${offense}: empty series for ORI ${ori} — verify the ORI via ` +
            `https://api.usa.gov/crime/fbi/cde/agency/byStateAbbr/MN (grep Minneapolis)`,
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
  for (let y = 1985; y <= 2018; y++) {
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
  // Minneapolis has a mid-span partial year (1990), so — unlike Seattle — the
  // complete years are NOT one contiguous run. We keep the LONGEST contiguous
  // segment of complete years (ties → the later one) and disclose every year
  // left out; an annual total can never be honestly built from <12 months.
  const segments = [];
  for (const yr of complete) {
    const last = segments[segments.length - 1];
    if (last && yr.year === last[last.length - 1].year + 1) last.push(yr);
    else segments.push([yr]);
  }
  segments.sort((a, b) => a.length - b.length || a[0].year - b[0].year);
  const years = segments[segments.length - 1];
  const droppedSegments = segments
    .slice(0, -1)
    .map((s) => `${s[0].year}–${s[s.length - 1].year}`);
  if (droppedSegments.length)
    console.warn(
      `  complete-but-noncontiguous segments dropped to keep one honest series: ${droppedSegments.join(", ")}`,
    );
  const yearMin = years[0].year,
    yearMax = years[years.length - 1].year;
  // contiguity within the kept segment (by construction, but assert anyway)
  years.forEach((yr, i) => {
    assert(yr.year === yearMin + i, `FBI history: gap at ${yearMin + i} inside kept segment`);
  });
  console.log(`  kept ${years.length} complete years ${yearMin}–${yearMax} (12 months each verified)`);

  // ---- Assemble output files -------------------------------------------------
  const timeline = { months: MONTHS, cells };
  const beatsFile = { cats: CATS, beats };
  const summary = {
    slug: "minneapolis-mn",
    title: "Minneapolis · MN",
    source: { records: ARC_LAYER, beats: `${NBHD}`, hub: HUB },
    fetchedAt,
    dateMin: "2019-01-01",
    dateMax: "2026-06-30",
    months: MONTHS.length,
    totalRecords,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: { "occurred-pre-2019": pre2019, "no-neighborhood": noNeighborhood },
    catTotals,
    cats: CATS,
    beatCount: Object.keys(beats).length,
  };
  const history = {
    era: "history",
    taxonomy:
      "FBI UCR Summary (Violent + Property) — a different taxonomy than the MPD NIBRS categories used from 2019; the two eras bridge at 2019 and are never equated",
    agency: AGENCY,
    ori: ORI,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      `Annual totals are real UCR Summary counts fetched from the FBI CDE summarized agency endpoint for ORI ${ORI} ` +
      `(12 reported months verified per year). UCR Summary (Violent/Property) and MPD NIBRS are different taxonomies ` +
      `and are presented as distinct eras; neighborhood-level detail exists only from 2019 (the consolidated MPD open-data ` +
      `layer starts there), so the story bridges from citywide annual history to per-neighborhood monthly data at 2019. ` +
      `Reproduce with pipeline/sources/minneapolis-mn.mjs (set FBI_API_KEY to avoid DEMO_KEY rate limits).` +
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
    source: "Minneapolis official neighborhoods (City of Minneapolis)",
    sourceUrl: `${NBHD}/query?where=1=1&outFields=*&f=geojson`,
    hub: HUB,
    fetchedAt,
    license: "CC0 1.0 (City of Minneapolis has waived all copyright and related rights)",
    method:
      "identity — MPD crime records carry the official neighborhood name (BDNAME) verbatim; no spatial join or approximation is involved",
    map: Object.fromEntries(Object.keys(beats).map((k) => [k, { name: k, approx: false }])),
  };
  const points = {
    mode: "real-sample",
    note:
      "Every dot is a real reported offense location as published by MPD (Latitude/Longitude fields; the source also publishes block-anonymized wgsX/YAnon coords). ~0.6% of in-span records have 0,0/out-of-city coords and are counted but not plotted. Deterministic even-stride sample (≤100/month) across each full month.",
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
  assert(Object.keys(beats).length === 87, "beatCount != 87");
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
    assert(f.date >= "2019-01-01" && f.date <= "2026-06-30", `feed date out of span ${f.date}`);
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
    droppedSegments,
    placeableCount,
    ptsKept,
    sampleRate,
    catTotals,
    catSourceValues,
    nonNibrsBreakdown,
    partialJuly,
    nullDate,
    crimeCountSum,
    grand,
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
  droppedSegments,
  placeableCount,
  ptsKept,
  sampleRate,
  catTotals,
  catSourceValues,
  nonNibrsBreakdown,
  partialJuly,
  nullDate,
  crimeCountSum,
  grand,
}) {
  const fmt = (n) => n.toLocaleString("en-US");
  const srcValRows = catSourceValues
    .sort((a, b) => b.n - a.n)
    .map((r) => `| ${JSON.stringify(r.value)} | \`${r.cat}\` | ${fmt(r.n)} |`)
    .join("\n");
  const nnRows = nonNibrsBreakdown.map((r) => `| ${r.category} | ${fmt(r.n)} |`).join("\n");
  const md = `# Provenance — Minneapolis, MN

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **Crime_Data** (consolidated Police Incidents, 2019-present) |
| Publisher | Minneapolis Police Department, via Open Data Minneapolis |
| Landing page | ${HUB_ITEM} (portal: ${HUB}) |
| API | ${ARC_LAYER} |
| Fetched | ${fetchedAt} |
| License | CC0 1.0 — the per-year "Police Incidents" items on Open Data Minneapolis are explicitly CC0 and the polygons item carries the city's copyright waiver; the consolidated item's license field is blank, so we cite the per-year items + portal norm. Contact: PoliceOpenData@minneapolismn.gov |
| Attribution | Minneapolis Police Department via Open Data Minneapolis |
| Records used | ${fmt(summary.totalRecords)} (Occurred_Date < 2026-07-01; dataset grand total ${fmt(grand)}) |
| Source caveat | Refreshed daily; classifications can change as investigations proceed |

### Date field choice (disclosed)
The layer publishes both \`Reported_Date\` and \`Occurred_Date\`. **We use \`Occurred_Date\`** — the map animates *when offenses happened*, not when paperwork was filed. Consequence: ${fmt(summary.unplacedBeats["occurred-pre-2019"])} rows *occurred* before 2019 (back to 1922) but were *reported* 2019+; they are counted in \`totalRecords\` and disclosed as \`unplacedBeats["occurred-pre-2019"]\` — never silently dropped.

### Windowing (disclosed exclusions)
- Rows with Occurred_Date on/after **2026-07-01** (partial month at fetch time): **${fmt(partialJuly)}** excluded.
- Rows with **no Occurred_Date**: **${fmt(nullDate)}** excluded.
- Both exclusions are outside \`totalRecords\` and listed here; everything else in the layer is accounted for (${fmt(summary.totalRecords)} + ${fmt(partialJuly)} + ${fmt(nullDate)} = ${fmt(grand)}).

### Fields used
\`Occurred_Date\` · \`NIBRS_Crime_Against\` · \`Offense_Category\` · \`Offense\` · \`Address\` (block-level) · \`Neighborhood\` (official name) · \`Latitude\`/\`Longitude\` · \`Precinct\`.

### Category mapping (NIBRS_Crime_Against → cat)
Source values carry **trailing spaces** (e.g. \`"Property "\`) — matched exactly, mapped by trimmed value. The five distinct values below are exhaustive (verified live against the whole layer):

| Source value (verbatim) | cat | window count |
|---|---|--:|
${srcValRows}

**"Non NIBRS Data"** is MPD's supplemental bucket — mapped to \`other\`, labeled "${CATS.other.label}", and **never counted as NIBRS persons/property/society**. Its contents in the window (note the "Subset of NIBRS …" rows duplicate offenses already counted in the NIBRS categories, another reason they must stay out of the crime counts):

| Offense_Category inside "Non NIBRS Data" | count |
|---|--:|
${nnRows}

Note: **Shots Fired Calls exist in the layer only from 2020-07-08 onward** — the visible jump in the \`other\` series at 2020-07 is a data-availability artifact, not a crime trend. \`other\` is context-only and never mixed into the NIBRS categories.

### Row counting (disclosed)
We count **records** (one row = one published offense record). The layer also carries a \`Crime_Count\` multiplier field (window sum ${fmt(crimeCountSum)} vs ${fmt(summary.totalRecords)} rows); we do not expand rows by it, so our totals are conservative relative to dashboards that sum \`Crime_Count\`.

### Coverage
- Placed (one of the 87 official neighborhoods, 2019-01…2026-06): **${fmt(summary.placedRecords)}** (${summary.coveragePct}%)
- Unplaced: ${fmt(summary.unplacedRecords)} = ${fmt(summary.unplacedBeats["occurred-pre-2019"])} occurred-pre-2019 + ${fmt(summary.unplacedBeats["no-neighborhood"])} in-span rows with a null \`Neighborhood\`.
- Identity \`placed + unplaced == citywide\` validated per month × category in-script, **plus** one full month (2023-05) re-verified against a paged raw row pull.

## Geometry source — official neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **Minneapolis_Neighborhoods** — 87 polygons, official city neighborhoods |
| FeatureServer | ${NBHD} |
| License | CC0-style waiver ("City of Minneapolis has waived all copyright and related or neighboring rights") |
| Join key | \`BDNAME\` ↔ crime \`Neighborhood\` — **exact identity** after trimming: all 87 incident names match all 87 polygon names; the only unmatched incident value is null (disclosed as no-neighborhood) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (\`points.json\`)

Dots are **real offense locations published by MPD** in the \`Latitude\`/\`Longitude\` fields (the source additionally publishes \`wgsXAnon\`/\`wgsYAnon\` block-anonymized coordinates; we use the primary fields and note both exist — MPD publishes addresses at block grain, e.g. \`0015XX LASALLE AVE\`). Missing locations appear as 0,0 and a handful fall outside the city box — **${fmt(summary.totalRecords - placeableCount - summary.unplacedBeats["occurred-pre-2019"])} in-span rows (~0.6%) have no usable location** and are counted in every total but not plotted. Client-side gate: lat ${BBOX.latMin}–${BBOX.latMax}, lng ${BBOX.lngMin}–${BBOX.lngMax}. Deterministic sample: every in-bbox row of each month fetched (OBJECTID order), even-stride ≤100/month → **${fmt(ptsKept)} points ≈ 1 per ${sampleRate} of the ${fmt(placeableCount)} placeable rows**.

## Historical source — FBI UCR (${history.yearMin}–${history.yearMax} deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Minneapolis Police Department — **ORI \`${ORI}\`** |
| Endpoint | ${history.sourceUrl} (and \`/property-crime\`) |
| Span | ${history.yearMin}–${history.yearMax}, annual Violent + Property (12 reported months verified per year) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set \`FBI_API_KEY\`) |
${droppedYears.length ? `
**Dropped partial years (disclosed):** ${droppedYears.map((d) => `**${d.year}** (violent ${d.violentMonths}/12, property ${d.propertyMonths}/12 reported months)`).join(", ")} — an annual total cannot honestly be built from fewer than 12 reported months.` : ""}${droppedSegments.length ? `
**Dropped complete-but-noncontiguous years (disclosed):** ${droppedSegments.join(", ")} — these years are complete in the source but separated from the kept series by the partial-year gap above; they are omitted (not merged across the gap) to keep one contiguous honest series. Raw responses are cached under \`data/minneapolis-mn/raw/\`.` : ""}

UCR Summary (Violent/Property) is a **different taxonomy** than MPD NIBRS categories — the eras are presented as distinct and bridge at 2019; they are never equated. No monthly or neighborhood detail is implied for ${history.yearMin}–${history.yearMax}.

## Reproduce

\`\`\`bash
FBI_API_KEY=… node pipeline/sources/minneapolis-mn.mjs
\`\`\`
`;
  writeFileSync(PROV_PATH, md);
  console.log(`  wrote data/minneapolis-mn/PROVENANCE.md`);
}

// ---- wiki/Data-Provenance.md append -------------------------------------------
function appendWiki({ summary, history }) {
  if (!existsSync(WIKI_PATH)) return;
  const cur = readFileSync(WIKI_PATH, "utf8");
  if (cur.includes("## Minneapolis, MN")) {
    console.log("  wiki/Data-Provenance.md already has a Minneapolis section — skipped");
    return;
  }
  const fmt = (n) => n.toLocaleString("en-US");
  const section = `
## Minneapolis, MN (\`minneapolis-mn\`)

- **Primary source:** Crime_Data — consolidated MPD Police Incidents, 2019-present
  (ArcGIS \`Crime_Data/FeatureServer/0\`, ${HUB_ITEM}) — CC0 1.0
  (per-year Police Incidents items are explicitly CC0; consolidated item's license
  field is blank, cited per portal norm). Attribution "Minneapolis Police
  Department via Open Data Minneapolis". Refreshed daily.
- **Date field:** \`Occurred_Date\` (when the offense happened), not
  \`Reported_Date\` — ${fmt(summary.unplacedBeats["occurred-pre-2019"])} rows occurred pre-2019 (reported later) are
  counted and disclosed as "occurred-pre-2019" unplaced.
- **Spatial unit:** the 87 official **Minneapolis neighborhoods** — the crime
  data's \`Neighborhood\` field matches the polygon layer's \`BDNAME\` exactly
  (identity join after trim; only nulls unmatched). Polygons:
  \`Minneapolis_Neighborhoods/FeatureServer/0\` (CC0 waiver).
- **Deep-history source (${history.yearMin}–${history.yearMax}):** FBI Crime Data Explorer (CDE) —
  Minneapolis PD, **ORI ${ORI}** — real annual Violent + Property counts,
  ${history.years.length} full years (12 reported months each, verified). Partial years and
  years cut off by a mid-span reporting gap are dropped and disclosed in
  PROVENANCE. UCR taxonomy kept distinct from NIBRS; eras bridge at 2019.
- **Span:** ${history.yearMin}–${history.yearMax} (FBI UCR annual) + 2019-01-01 → 2026-06-30 (MPD NIBRS
  with neighborhood detail, ${summary.months} months; partial 2026-07 dropped and disclosed).
- **Records:** ${fmt(summary.totalRecords)} total ·
  ${fmt(summary.placedRecords)} placed in an official neighborhood
  (**${summary.coveragePct}% coverage**) · ${fmt(summary.unplacedRecords)} unplaced
  (${fmt(summary.unplacedBeats["occurred-pre-2019"])} occurred-pre-2019 + ${fmt(summary.unplacedBeats["no-neighborhood"])} null neighborhood), kept in totals and disclosed.
- **Real dots:** MPD publishes per-record \`Latitude\`/\`Longitude\` (plus
  block-anonymized \`wgsX/YAnon\`); ~0.6% of in-span rows are 0,0/out-of-city —
  dots are a deterministic even-stride ≤100/month sample of **real** locations;
  unlocatable records are counted but not plotted.
- **License:** CC0 1.0 (City of Minneapolis open-data waiver); contact
  PoliceOpenData@minneapolismn.gov.
- **Detail:** [\`data/minneapolis-mn/PROVENANCE.md\`](../data/minneapolis-mn/PROVENANCE.md)

### Category mapping (NIBRS_Crime_Against → cat; source values carry trailing spaces, matched exactly)

| Source value | cat |
|--------------|-----|
| "Person " | \`persons\` |
| "Property " | \`property\` |
| "Society " | \`society\` |
| "Non NIBRS Data" / "Not a Crime " | \`other\` (shots-fired calls, gunshot-wound victims, domestic "Subset of NIBRS" duplicate rows, non-crimes — context only, never counted as NIBRS crime) |
`;
  // insert before "## Ranked source types" if present, else append
  const marker = "## Ranked source types";
  const idx = cur.indexOf(marker);
  const next =
    idx >= 0 ? cur.slice(0, idx) + section.trimStart() + "\n" + cur.slice(idx) : cur + section;
  writeFileSync(WIKI_PATH, next);
  console.log("  appended Minneapolis section to wiki/Data-Provenance.md");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
