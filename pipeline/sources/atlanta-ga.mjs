// Atlanta, GA — APD Crime Data source pipeline (fetch → normalize → validate).
//
// BINDING RULE: never fabricate — every figure written by this script comes
// straight from a queryable public source; every gap is disclosed.
//
// Sources:
//   Incidents  : APD "OpenDataWebsite_Crime view" ArcGIS layer (2021-present,
//                full NIBRS, refreshed continuously), Atlanta Police Department.
//                https://services3.arcgis.com/Et5Qfajgiyosiw4d/ArcGIS/rest/services/OpenDataWebsite_Crime_view/FeatureServer/0
//                License: the AGOL item's licenseInfo field is BLANK (verified
//                at fetch time) — no explicit license stated. Attributed to
//                "Atlanta Police Department (APD)" via the APD Open Data hub
//                (https://atlantapd.hub.arcgis.com/) and the APD Crime Data
//                Downloads page. Flagged prominently in PROVENANCE.
//   Polygons   : APD "neighborhood" layer (242 official City of Atlanta
//                neighborhoods, NhoodName + NPU) — same AGOL org.
//                https://services3.arcgis.com/Et5Qfajgiyosiw4d/ArcGIS/rest/services/neighborhood/FeatureServer/0
//   History    : FBI Crime Data Explorer (CDE) summarized agency counts,
//                Atlanta PD ORI GAAPD0000, 1985–2018 annual Violent + Property.
//                (The batch-spec's guess GA0600100 resolves to College Park PD —
//                verified live and corrected; 2019–2020 are partial-year series
//                during APD's NIBRS transition and are dropped + disclosed.)
//
// Sibling legacy layers (probed, NOT used for the granular era — disclosed):
//   2009_2020CrimeData      — Part 1 (COBRA) offenses ONLY: 7 crime types
//                             (larceny×2, burglary, auto theft, agg assault,
//                             robbery, homicide). A fundamentally narrower
//                             taxonomy than the 2021+ full-NIBRS layer; merging
//                             would fabricate an apparent 2021 crime explosion.
//                             Also has junk string dates (min "0220-11-01",
//                             literal "NULL" values).
//   Crime_Data_1997_2008    — legacy UCR extract, same Part-1-style scope.
//   ⇒ granular era honestly starts 2021-01; deep history comes from FBI UCR.
//
// Eras (honesty structure):
//   1985–2018  FBI UCR annual citywide totals (no neighborhood detail implied)
//   2019–2020  GAP — APD's FBI submissions are partial (NIBRS transition) and
//              the open-data NIBRS layer starts 2021; no honest series exists.
//              Disclosed, never interpolated.
//   2021-01 → 2026-06  APD NIBRS with official-neighborhood detail.
//
// Timezone: OccurredFromDate epochs are true UTC instants of America/New_York
// wall-clock times (verified: Day_of_the_week matches the NY-local rendering
// for 60/60 sampled rows, and dataset min is exactly 2021-01-01 00:00 EST).
// All month binning uses NY-local month boundaries converted to UTC (DST-aware),
// and the raw-month cross-check re-verifies the convention end-to-end.
//
//   node pipeline/sources/atlanta-ga.mjs   (set FBI_API_KEY to avoid DEMO_KEY limits)
//
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const OUT_DIR = resolve(repoRoot, "data/atlanta-ga/normalized");
const RAW_DIR = resolve(repoRoot, "data/atlanta-ga/raw");
const PROV_PATH = resolve(repoRoot, "data/atlanta-ga/PROVENANCE.md");
const WIKI_PATH = resolve(repoRoot, "wiki/Data-Provenance.md");

const ARC =
  "https://services3.arcgis.com/Et5Qfajgiyosiw4d/ArcGIS/rest/services/OpenDataWebsite_Crime_view/FeatureServer/0/query";
const ARC_LAYER =
  "https://services3.arcgis.com/Et5Qfajgiyosiw4d/ArcGIS/rest/services/OpenDataWebsite_Crime_view/FeatureServer/0";
const HUB_ITEM = "https://www.arcgis.com/home/item.html?id=774475034b694ce68b6d2e887aa96544";
const HUB = "https://atlantapd.hub.arcgis.com/";
const NBHD =
  "https://services3.arcgis.com/Et5Qfajgiyosiw4d/ArcGIS/rest/services/neighborhood/FeatureServer/0";
const ORI = "GAAPD0000"; // verified live — the spec's GA0600100 is College Park PD
const AGENCY = "Atlanta Police Department";
const FBI_KEY = process.env.FBI_API_KEY || "DEMO_KEY";

const HIST_FROM = "01-1985";
const HIST_TO = "12-2020"; // 2019–2020 fetched, verified partial, dropped + disclosed

// Crime_Against → cat. Rows with a NULL Crime_Against all carry
// NibrsUcrCode = 'NOT_APPL' (verified live: that is the ONLY value) — APD's
// non-NIBRS/administrative bucket, disclosed as context, never counted as
// NIBRS Group A persons/property/society crime.
const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff2e63" },
  property: { label: "Crimes Against Property", color: "#ffc233" },
  society: { label: "Crimes Against Society", color: "#34e0e0" },
  other: { label: "Non-NIBRS / administrative (context)", color: "#7486a0" },
};
const CAT_KEYS = ["persons", "property", "society", "other"]; // catIdx order
const catOf = (v) =>
  v === null || v === undefined
    ? "other"
    : { Person: "persons", Property: "property", Society: "society" }[v];
const CAT_WHERE = {
  persons: `Crime_Against = 'Person'`,
  property: `Crime_Against = 'Property'`,
  society: `Crime_Against = 'Society'`,
  other: `Crime_Against IS NULL`,
};

// Valid Atlanta coordinate box (from the batch-1 scout; coords are 100%
// populated doubles — a handful fall outside the city box and are counted
// but not plotted).
const BBOX = { latMin: 33.62, latMax: 33.9, lngMin: -84.56, lngMax: -84.28 };

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

// Feature query with resultOffset paging.
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

// ---- America/New_York time helpers ----------------------------------------
// OccurredFromDate stores true UTC instants; the city's wall clock is NY time.
const NY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function nyParts(ms) {
  const p = Object.fromEntries(NY_FMT.formatToParts(ms).map((x) => [x.type, x.value]));
  return p; // {year, month, day, hour, minute}
}
const ymNY = (ms) => {
  const p = nyParts(ms);
  return `${p.year}-${p.month}`;
};
const ymdNY = (ms) => {
  const p = nyParts(ms);
  return `${p.year}-${p.month}-${p.day}`;
};
// UTC instant of NY-local midnight on the 1st of (y, m) — DST-aware by trial
// (EST=UTC-5 → 05:00Z, EDT=UTC-4 → 04:00Z); verified by round-trip.
function localMidnightUtc(y, m) {
  for (const h of [5, 4]) {
    const ms = Date.UTC(y, m - 1, 1, h, 0, 0);
    const p = nyParts(ms);
    if (Number(p.year) === y && Number(p.month) === m && Number(p.day) === 1 && p.hour === "00")
      return { ms, ts: `${y}-${String(m).padStart(2, "0")}-01 ${String(h).padStart(2, "0")}:00:00` };
  }
  throw new Error(`localMidnightUtc: no EST/EDT offset round-trips for ${y}-${m}`);
}
function monthBoundsUtc(ym) {
  const [y, m] = ym.split("-").map(Number);
  const start = localMidnightUtc(y, m);
  const end = m === 12 ? localMidnightUtc(y + 1, 1) : localMidnightUtc(y, m + 1);
  return { start, end };
}
const monthWhere = (ym) => {
  const { start, end } = monthBoundsUtc(ym);
  return `OccurredFromDate >= TIMESTAMP '${start.ts}' AND OccurredFromDate < TIMESTAMP '${end.ts}'`;
};

// ---- month range ----------------------------------------------------------
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
const MONTHS = monthRange("2021-01", "2026-06"); // 66
const MONTH_IDX = new Map(MONTHS.map((m, i) => [m, i]));
const SPAN_START_TS = localMidnightUtc(2021, 1).ts; // 2021-01-01 05:00:00 UTC (EST)
const SPAN_END_TS = localMidnightUtc(2026, 7).ts; // 2026-07-01 04:00:00 UTC (EDT)
const SPAN_WHERE = `OccurredFromDate >= TIMESTAMP '${SPAN_START_TS}' AND OccurredFromDate < TIMESTAMP '${SPAN_END_TS}'`;

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

  // ---- 1. Official neighborhood polygons -----------------------------------
  console.log("── Atlanta official neighborhood polygons (NhoodName + NPU)");
  const gj = await postJSON(
    `${NBHD}/query`,
    { f: "geojson", where: "1=1", outFields: "NhoodName,NPU" },
    { label: "neighborhoods geojson" },
  );
  assert(gj?.type === "FeatureCollection" && Array.isArray(gj.features), "NBHD: bad geojson");
  assert(gj.features.length === 242, `NBHD: expected 242 features, got ${gj.features.length}`);

  const beats = {};
  gj.features.forEach((f, idx) => {
    const raw = f.properties?.NhoodName;
    assert(typeof raw === "string" && raw.trim().length > 0, `NBHD feature ${idx}: missing NhoodName`);
    const key = raw.trim(); // defensive; probe showed no padding
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
      name: key, // NhoodName is already the resident-facing proper name
      servcen: String(f.properties?.NPU ?? ""), // NPU letter (A–Z planning units)
      beat: idx,
      centroid: [Number((X / A).toFixed(6)), Number((Y / A).toFixed(6))],
      polygon: outerRings,
      geomType: g.type,
    };
  });
  const HOODS = new Set(Object.keys(beats));
  console.log(`  ${HOODS.size} neighborhoods (e.g. ${[...HOODS].slice(0, 3).join(", ")})`);

  // ---- 2+3. Timeline cells + citywide cross-check, month by month ----------
  // Dates are NY-local-midnight-bounded UTC windows (DST-aware). Per month:
  //  (a) group by NhoodName + Crime_Against  → placed / null-name / unmatched-name
  //  (b) group by Crime_Against only         → independent citywide reconciliation
  console.log(`── Timeline: per-neighborhood monthly counts by category (${MONTHS[0]}…${MONTHS.at(-1)}, NY-local months)`);
  const cells = {};
  for (const k of HOODS)
    cells[k] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  const nullByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  const unmatchedByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  const unmatchedNames = new Map(); // name → count (crime names absent from the polygon layer)
  const cityByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  const matchedNames = new Set();

  for (let mi = 0; mi < MONTHS.length; mi++) {
    const ym = MONTHS[mi];
    const grouped = await arcAll(
      {
        where: monthWhere(ym),
        groupByFieldsForStatistics: "NhoodName,Crime_Against",
        outStatistics: JSON.stringify([
          { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
        ]),
      },
      { label: `timeline ${ym}` },
    );
    for (const f of grouped) {
      const a = f.attributes;
      const cat = catOf(a.Crime_Against);
      assert(cat, `timeline ${ym}: unmapped Crime_Against '${a.Crime_Against}'`);
      const n = Number(a.n);
      assert(Number.isFinite(n) && n >= 0, `timeline ${ym}: bad count ${a.n}`);
      const hood = a.NhoodName == null ? null : String(a.NhoodName).trim();
      if (hood !== null && HOODS.has(hood)) {
        cells[hood][mi][cat] += n;
        matchedNames.add(hood);
      } else if (hood === null || hood === "") {
        nullByCatMonth[cat][mi] += n;
      } else {
        // real APD name with no polygon in the official layer — counted,
        // disclosed as unmatched-name unplaced, never guessed onto the map
        unmatchedByCatMonth[cat][mi] += n;
        unmatchedNames.set(hood, (unmatchedNames.get(hood) || 0) + n);
      }
    }
    const city = await arcAll(
      {
        where: monthWhere(ym),
        groupByFieldsForStatistics: "Crime_Against",
        outStatistics: JSON.stringify([
          { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
        ]),
      },
      { label: `citywide ${ym}` },
    );
    for (const f of city) {
      const cat = catOf(f.attributes.Crime_Against);
      assert(cat, `citywide ${ym}: unmapped Crime_Against '${f.attributes.Crime_Against}'`);
      cityByCatMonth[cat][mi] += Number(f.attributes.n);
    }
    if ((mi + 1) % 12 === 0) console.log(`  …through ${ym}`);
  }

  // VALIDATE: placed + null-name + unmatched-name == citywide, per cat per month
  for (const cat of CAT_KEYS) {
    for (let mi = 0; mi < MONTHS.length; mi++) {
      let placed = 0;
      for (const k of HOODS) placed += cells[k][mi][cat];
      const lhs = placed + nullByCatMonth[cat][mi] + unmatchedByCatMonth[cat][mi];
      const rhs = cityByCatMonth[cat][mi];
      assert(lhs === rhs, `month ${MONTHS[mi]} cat ${cat}: placed+unplaced ${lhs} != citywide ${rhs}`);
    }
  }
  console.log(`  placed + unplaced == citywide for all ${MONTHS.length} months × 4 cats ✓`);
  console.log(
    `  join: ${matchedNames.size}/${HOODS.size} polygon neighborhoods appear in incident data; ` +
      `${unmatchedNames.size} incident names have no polygon (disclosed): ${[...unmatchedNames.keys()].join(", ")}`,
  );

  // ---- 3b. Raw-pull verification of one full month --------------------------
  // Also end-to-end verifies the UTC↔NY-local month convention: every raw epoch
  // must render to the expected NY-local month.
  console.log("── Verification: raw paged pull of 2024-03 vs grouped stats (incl. DST transition month)");
  const VER_YM = "2024-03";
  const rawFeats = await arcAll(
    {
      where: monthWhere(VER_YM),
      outFields: "OccurredFromDate,NhoodName,Crime_Against,ReportNumber,IncidentNumber",
      returnGeometry: "false",
      orderByFields: "OBJECTID",
    },
    { label: `raw ${VER_YM}` },
  );
  const rawTally = Object.fromEntries(CAT_KEYS.map((c) => [c, { placed: 0, unplaced: 0 }]));
  const verReports = new Set();
  for (const f of rawFeats) {
    const a = f.attributes;
    assert(ymNY(a.OccurredFromDate) === VER_YM, `raw ${VER_YM}: epoch ${a.OccurredFromDate} not in NY-local month`);
    const cat = catOf(a.Crime_Against);
    assert(cat, `raw ${VER_YM}: unmapped Crime_Against '${a.Crime_Against}'`);
    const hood = a.NhoodName == null ? null : String(a.NhoodName).trim();
    if (hood !== null && HOODS.has(hood)) rawTally[cat].placed++;
    else rawTally[cat].unplaced++;
    verReports.add(a.ReportNumber);
  }
  const vmi = MONTH_IDX.get(VER_YM);
  for (const cat of CAT_KEYS) {
    let placed = 0;
    for (const k of HOODS) placed += cells[k][vmi][cat];
    const unplaced = nullByCatMonth[cat][vmi] + unmatchedByCatMonth[cat][vmi];
    assert(
      rawTally[cat].placed === placed && rawTally[cat].unplaced === unplaced,
      `raw ${VER_YM} ${cat}: raw ${rawTally[cat].placed}+${rawTally[cat].unplaced} != grouped ${placed}+${unplaced}`,
    );
  }
  // Row-grain measurement (offense-level rows; incident inflation disclosed)
  const verRows = rawFeats.length;
  const verIncidents = verReports.size;
  const grainInflation = Math.round((verRows / verIncidents) * 1000) / 1000;
  console.log(
    `  ${verRows} raw rows in ${VER_YM} match grouped stats exactly, all 4 cats ✓ ` +
      `(${verIncidents} distinct ReportNumbers → offense-per-incident inflation ×${grainInflation}, disclosed)`,
  );

  // ---- 4. Dataset-level totals ---------------------------------------------
  console.log("── Dataset totals (NY-local window 2021-01-01 … 2026-06-30)");
  const totalRecords = await arcCount(SPAN_WHERE, "total window");
  const preSpan = await arcCount(
    `OccurredFromDate < TIMESTAMP '${SPAN_START_TS}'`,
    "pre-span count",
  );
  const partialTail = await arcCount(
    `OccurredFromDate >= TIMESTAMP '${SPAN_END_TS}'`,
    "partial 2026-07 count",
  );
  const nullDate = await arcCount(`OccurredFromDate IS NULL`, "null OccurredFromDate count");
  const grand = await arcCount(`1=1`, "grand total");
  assert(
    totalRecords + preSpan + partialTail + nullDate === grand,
    `window ${totalRecords} + pre ${preSpan} + partial ${partialTail} + nullDate ${nullDate} != grand ${grand}`,
  );

  const catRowsJ = await arcAll(
    {
      where: SPAN_WHERE,
      groupByFieldsForStatistics: "Crime_Against",
      outStatistics: JSON.stringify([
        { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
      ]),
    },
    { label: "catTotals window" },
  );
  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  const catSourceValues = [];
  for (const f of catRowsJ) {
    const rawVal = f.attributes.Crime_Against;
    const cat = catOf(rawVal);
    assert(cat, `catTotals: unmapped Crime_Against '${rawVal}'`);
    catTotals[cat] += Number(f.attributes.n);
    catSourceValues.push({ value: rawVal, cat, n: Number(f.attributes.n) });
  }
  assert(
    CAT_KEYS.reduce((s, c) => s + catTotals[c], 0) === totalRecords,
    "catTotals do not sum to totalRecords",
  );
  // What is the NULL Crime_Against bucket? (verified: all NibrsUcrCode NOT_APPL)
  const nullCatRows = await arcAll(
    {
      where: `${SPAN_WHERE} AND Crime_Against IS NULL`,
      groupByFieldsForStatistics: "NibrsUcrCode",
      outStatistics: JSON.stringify([
        { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
      ]),
    },
    { label: "null-cat breakdown" },
  );
  for (const f of nullCatRows)
    assert(
      f.attributes.NibrsUcrCode === "NOT_APPL",
      `null Crime_Against carries unexpected NibrsUcrCode '${f.attributes.NibrsUcrCode}'`,
    );

  let placedRecords = 0;
  for (const k of HOODS)
    for (const cc of cells[k]) placedRecords += cc.persons + cc.property + cc.society + cc.other;
  const noNeighborhood = CAT_KEYS.reduce(
    (s, c) => s + nullByCatMonth[c].reduce((a, b) => a + b, 0),
    0,
  );
  const unmatchedName = CAT_KEYS.reduce(
    (s, c) => s + unmatchedByCatMonth[c].reduce((a, b) => a + b, 0),
    0,
  );
  const citywideSpanTotal = CAT_KEYS.reduce(
    (s, c) => s + cityByCatMonth[c].reduce((a, b) => a + b, 0),
    0,
  );
  assert(citywideSpanTotal === totalRecords, `citywide span ${citywideSpanTotal} != total ${totalRecords}`);
  const unplacedRecords = noNeighborhood + unmatchedName;
  assert(placedRecords + unplacedRecords === totalRecords, "placed+unplaced != total");
  assert(unmatchedName / totalRecords < 0.02, `unmatched-name share too high: ${unmatchedName}`);
  const coveragePct = Math.round((placedRecords / totalRecords) * 1000) / 10;
  console.log(
    `  total ${totalRecords} = placed ${placedRecords} + no-neighborhood ${noNeighborhood} + unmatched-name ${unmatchedName}` +
      ` → coverage ${coveragePct}%` +
      ` (excluded & disclosed: ${partialTail} partial 2026-07 rows, ${preSpan} pre-span, ${nullDate} null-date)`,
  );

  // ---- 5. Sampled REAL points ----------------------------------------------
  console.log("── Real incident points (APD-published coords; deterministic sample)");
  const BBOX_WHERE = `Latitude >= ${BBOX.latMin} AND Latitude <= ${BBOX.latMax} AND Longitude >= ${BBOX.lngMin} AND Longitude <= ${BBOX.lngMax}`;
  const byMonth = MONTHS.map(() => []);
  let placeableCount = 0,
    fetched = 0,
    rejected = 0;
  for (let mi = 0; mi < MONTHS.length; mi++) {
    const feats = await arcAll(
      {
        where: `${monthWhere(MONTHS[mi])} AND ${BBOX_WHERE}`,
        outFields: "OccurredFromDate,Latitude,Longitude,Crime_Against",
        returnGeometry: "false",
        orderByFields: "OBJECTID",
      },
      { label: `points ${MONTHS[mi]}` },
    );
    placeableCount += feats.length;
    for (const f of feats) {
      fetched++;
      const a = f.attributes;
      const lat = Number(a.Latitude),
        lng = Number(a.Longitude);
      const cat = catOf(a.Crime_Against);
      const miRow = MONTH_IDX.get(ymNY(a.OccurredFromDate));
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
  // ≤100/month, deterministic even-stride pick across the WHOLE month (OBJECTID order)
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
  // 22 quarters (2021-Q1 … 2026-Q2) × 14 slots ≈ 308 real items. Slots are
  // allocated across categories in proportion to the quarter's REAL citywide
  // category mix (largest-remainder, deterministic) so offense-batch clustering
  // in OBJECTID order cannot bias the feed; every item is a real record.
  console.log("── Feed: 14 real items per quarter (category-proportional), 2021-Q1 … 2026-Q2");
  const feed = [];
  for (let y = 2021; y <= 2026; y++) {
    for (let q = 0; q < 4; q++) {
      const qMonths = [0, 1, 2]
        .map((k) => MONTH_IDX.get(`${y}-${String(q * 3 + 1 + k).padStart(2, "0")}`))
        .filter((mi) => mi !== undefined);
      if (qMonths.length === 0) continue;
      const qStart = monthBoundsUtc(MONTHS[qMonths[0]]).start.ts;
      const qEnd = monthBoundsUtc(MONTHS[qMonths[qMonths.length - 1]]).end.ts;
      const catN = CAT_KEYS.map((c) => qMonths.reduce((s, mi) => s + cityByCatMonth[c][mi], 0));
      const catTot = catN.reduce((a, b) => a + b, 0);
      assert(catTot > 0, `feed ${y}Q${q + 1}: empty quarter`);
      const exact = catN.map((n) => (n / catTot) * 14);
      const alloc = exact.map(Math.floor);
      let rem = 14 - alloc.reduce((a, b) => a + b, 0);
      exact
        .map((e, i) => [e - alloc[i], i])
        .sort((a, b) => b[0] - a[0])
        .slice(0, rem)
        .forEach(([, i]) => alloc[i]++);
      for (let ci = 0; ci < CAT_KEYS.length; ci++) {
        if (alloc[ci] === 0) continue;
        // small buffer: ~1% of named rows carry a name with no polygon; those
        // are filtered client-side and the next real rows take their place
        const j = await postJSON(
          ARC,
          {
            f: "json",
            where:
              `OccurredFromDate >= TIMESTAMP '${qStart}' AND OccurredFromDate < TIMESTAMP '${qEnd}'` +
              ` AND NhoodName IS NOT NULL AND ${CAT_WHERE[CAT_KEYS[ci]]}`,
            outFields: "OccurredFromDate,NIBRS_Offense,StreetAddress,NhoodName,Crime_Against",
            returnGeometry: "false",
            orderByFields: "OBJECTID",
            resultRecordCount: String(alloc[ci] + 8),
          },
          { label: `feed ${y}Q${q + 1} ${CAT_KEYS[ci]}` },
        );
        let taken = 0;
        for (const f of j.features || []) {
          if (taken >= alloc[ci]) break;
          const a = f.attributes;
          const hood = String(a.NhoodName).trim();
          if (!HOODS.has(hood)) continue; // unmatched-name row — skip, disclosed elsewhere
          taken++;
          feed.push({
            date: ymdNY(a.OccurredFromDate),
            title: String(a.NIBRS_Offense ?? "").trim() || "OFFENSE (unspecified)",
            place: String(a.StreetAddress ?? "").trim() || hood,
            beat: hood,
            cat: catOf(a.Crime_Against) || "other",
          });
        }
        assert(taken === alloc[ci], `feed ${y}Q${q + 1} ${CAT_KEYS[ci]}: only ${taken}/${alloc[ci]} rows`);
      }
    }
  }
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`  ${feed.length} feed items (chronological, no seriousness bias)`);

  // ---- 7. FBI UCR history 1985–2018 -----------------------------------------
  console.log(
    `── FBI CDE history (${ORI}, request 1985–2020, key=${FBI_KEY === "DEMO_KEY" ? "DEMO_KEY" : "FBI_API_KEY"})`,
  );
  async function fetchAnnual(offense, ori = ORI) {
    const url = `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ori}/${offense}?from=${HIST_FROM}&to=${HIST_TO}&API_KEY=${FBI_KEY}`;
    const cachePath = resolve(RAW_DIR, `fbi-${ori}-${offense}.json`);
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
      // MUST match the Offenses series (not Clearances) for Atlanta PD
      const agKey = Object.keys(actuals).find((k) => /Atlanta Police Department Offenses/i.test(k));
      if (!agKey)
        throw new Error(
          `FBI ${offense}: no 'Atlanta Police Department Offenses' series for ORI ${ori} — ` +
            `verify via https://api.usa.gov/crime/fbi/cde/agency/byStateAbbr/GA (grep Atlanta)`,
        );
      const monthly = actuals[agKey] || {};
      if (Object.keys(monthly).length === 0)
        throw new Error(`FBI ${offense}: empty series for ORI ${ori}`);
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
  // Keep the longest contiguous run of complete years (Minneapolis pattern).
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
  console.log(
    `  NOTE: ${yearMax + 1}–2020 are partial (APD NIBRS transition) and the open-data NIBRS layer starts 2021 — ` +
      `the ${yearMax + 1}–2020 gap between the eras is disclosed, never interpolated.`,
  );

  // ---- Assemble output files -------------------------------------------------
  const timeline = { months: MONTHS, cells };
  const beatsFile = { cats: CATS, beats };
  const summary = {
    slug: "atlanta-ga",
    title: "Atlanta · GA",
    source: { records: ARC_LAYER, beats: NBHD, hub: HUB },
    fetchedAt,
    dateMin: "2021-01-01",
    dateMax: "2026-06-30",
    months: MONTHS.length,
    totalRecords,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: { "no-neighborhood": noNeighborhood, "unmatched-name": unmatchedName },
    catTotals,
    cats: CATS,
    beatCount: Object.keys(beats).length,
  };
  const history = {
    era: "history",
    taxonomy:
      "FBI UCR Summary (Violent + Property) — a different taxonomy than the APD NIBRS categories used from 2021; the eras are separated by a disclosed 2019–2020 reporting gap and are never equated",
    agency: AGENCY,
    ori: ORI,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      `Annual totals are real UCR Summary counts fetched from the FBI CDE summarized agency endpoint for ORI ${ORI} ` +
      `(12 reported months verified per year; the batch-spec's ORI guess GA0600100 resolves to College Park PD and was ` +
      `corrected after live verification). UCR Summary (Violent/Property) and APD NIBRS are different taxonomies and are ` +
      `presented as distinct eras. APD's FBI submissions for 2019–2020 are partial (NIBRS transition) and the APD ` +
      `open-data NIBRS layer starts 2021, so 2019–2020 appear in neither era — the gap is disclosed on screen, never ` +
      `interpolated. Neighborhood-level detail exists only from 2021. ` +
      `Reproduce with pipeline/sources/atlanta-ga.mjs (set FBI_API_KEY to avoid DEMO_KEY rate limits).` +
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
    source: "City of Atlanta official neighborhoods (APD AGOL 'neighborhood' layer, NhoodName + NPU)",
    sourceUrl: `${NBHD}/query?where=1=1&outFields=NhoodName,NPU&f=geojson`,
    hub: HUB,
    fetchedAt,
    license:
      "Not stated on the AGOL item (licenseInfo blank, verified at fetch) — attributed to Atlanta Police Department / City of Atlanta",
    method:
      "identity — APD crime records carry the official neighborhood name (NhoodName) verbatim; no spatial join or approximation is involved. 9 incident-name variants absent from the polygon layer are disclosed as unmatched-name unplaced, never guessed onto the map.",
    unmatchedIncidentNames: Object.fromEntries(
      [...unmatchedNames.entries()].sort((a, b) => b[1] - a[1]),
    ),
    map: Object.fromEntries(Object.keys(beats).map((k) => [k, { name: k, approx: false }])),
  };
  const points = {
    mode: "real-sample",
    note:
      "Every dot is a real reported offense location as published by APD (Latitude/Longitude fields, 100% populated; a small number fall outside the city box and are counted but not plotted). Deterministic even-stride sample (≤100/month) across each full NY-local month.",
    sampleRate,
    months: MONTHS,
    pts,
  };

  // ---- VALIDATE (fail loudly) -------------------------------------------------
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
  assert(Object.keys(beats).length === 242, "beatCount != 242");
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
  assert(feed.length >= 280 && feed.length <= 320, `feed size ${feed.length} not ~300`);
  for (const f of feed) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(f.date), `feed bad date ${f.date}`);
    assert(f.date >= "2021-01-01" && f.date <= "2026-06-30", `feed date out of span ${f.date}`);
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
    unmatchedNames,
    partialTail,
    preSpan,
    nullDate,
    grand,
    verRows,
    verIncidents,
    grainInflation,
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
  unmatchedNames,
  partialTail,
  preSpan,
  nullDate,
  grand,
  verRows,
  verIncidents,
  grainInflation,
}) {
  const fmt = (n) => n.toLocaleString("en-US");
  const srcValRows = catSourceValues
    .sort((a, b) => b.n - a.n)
    .map((r) => `| ${r.value === null ? "*(null — NibrsUcrCode `NOT_APPL`)*" : JSON.stringify(r.value)} | \`${r.cat}\` | ${fmt(r.n)} |`)
    .join("\n");
  const unmatchedRows = [...unmatchedNames.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `| ${k} | ${fmt(v)} |`)
    .join("\n");
  const md = `# Provenance — Atlanta, GA

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **OpenDataWebsite_Crime view** (APD NIBRS crime data, 2021-present) |
| Publisher | Atlanta Police Department (APD), via the APD Open Data hub |
| Landing page | ${HUB_ITEM} (hub: ${HUB}) |
| API | ${ARC_LAYER} |
| Fetched | ${fetchedAt} |
| License | **Not stated** — the AGOL item's \`licenseInfo\` field is blank (verified at fetch time) and APD's legacy open-data portal terms page is offline. The data is published publicly by APD on its ArcGIS Online hub; we attribute "Atlanta Police Department (APD)" and flag the absence of an explicit license here prominently. |
| Attribution | Atlanta Police Department (APD) via APD Open Data (atlantapd.hub.arcgis.com) |
| Records used | ${fmt(summary.totalRecords)} (OccurredFromDate in NY-local window 2021-01-01 → 2026-06-30; dataset grand total ${fmt(grand)}) |
| Source caveat | Live layer refreshed continuously; classifications can change as investigations proceed |

### Timezone handling (disclosed)
\`OccurredFromDate\` epochs are **true UTC instants of America/New_York wall-clock times** — verified live: the layer's own \`Day_of_the_week\` field matches the NY-local rendering for 60/60 sampled rows, and the dataset minimum is exactly 2021-01-01 00:00 EST. All month binning uses NY-local month boundaries converted to UTC (DST-aware). The 2024-03 raw-month cross-check (a DST-transition month) re-verifies the convention end-to-end.

### Windowing (disclosed exclusions)
- Rows occurring on/after **2026-07-01** NY-local (partial month at fetch time): **${fmt(partialTail)}** excluded.
- Rows occurring before **2021-01-01** NY-local: **${fmt(preSpan)}** (the live view starts cleanly at 2021).
- Rows with **no OccurredFromDate**: **${fmt(nullDate)}**.
- Accounting: ${fmt(summary.totalRecords)} + ${fmt(partialTail)} + ${fmt(preSpan)} + ${fmt(nullDate)} = ${fmt(grand)} (asserted in-script). The batch-1 scout measured junk 1015/2124 dates on APD layers; the live view's date bounds are clean, and the sanity window above would exclude any such rows regardless.

### Row grain (disclosed)
Rows are **offense-level** (one row per offense record; multi-offense incidents repeat their \`ReportNumber\`). Measured in the 2024-03 raw pull: ${fmt(verRows)} rows ↔ ${fmt(verIncidents)} distinct ReportNumbers → **×${grainInflation} offense-per-incident inflation (~${Math.round((grainInflation - 1) * 1000) / 10}%)**. We count records, consistent with the other cities in this repo, and disclose the grain here.

### Fields used
\`OccurredFromDate\` · \`Crime_Against\` · \`NibrsUcrCode\` · \`NIBRS_Offense\` · \`StreetAddress\` (block-level street address) · \`NhoodName\` (official neighborhood) · \`NPU\` · \`Latitude\`/\`Longitude\` · \`ReportNumber\`/\`IncidentNumber\` (grain measurement only).

### Category mapping (Crime_Against → cat)
The four distinct values below are exhaustive (verified live against the whole layer):

| Source value (verbatim) | cat | window count |
|---|---|--:|
${srcValRows}

Rows with a **null \`Crime_Against\`** all carry \`NibrsUcrCode = 'NOT_APPL'\` (asserted in-script — any other value fails the run): APD's non-NIBRS/administrative bucket. They are mapped to \`other\`, labeled "${CATS.other.label}", and **never counted as NIBRS persons/property/society crime**.

### Coverage
- Placed (one of the 242 official neighborhoods, 2021-01…2026-06): **${fmt(summary.placedRecords)}** (${summary.coveragePct}%)
- Unplaced: ${fmt(summary.unplacedRecords)} = ${fmt(summary.unplacedBeats["no-neighborhood"])} in-span rows with a null \`NhoodName\` + ${fmt(summary.unplacedBeats["unmatched-name"])} rows whose APD neighborhood name has no polygon in the official layer (below).
- Identity \`placed + unplaced == citywide\` validated per month × category in-script, **plus** one full month (2024-03) re-verified against a paged raw row pull.

### Incident neighborhood names with no official polygon (disclosed, kept in totals)
These APD-entered names do not appear in the 242-polygon official layer. They are **counted in every citywide figure** and disclosed as \`unplacedBeats["unmatched-name"]\` — never guessed onto the map:

| APD name | rows |
|---|--:|
${unmatchedRows}

## Geometry source — official neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **neighborhood** — 242 polygons, official City of Atlanta neighborhoods with NPU letters |
| FeatureServer | ${NBHD} |
| License | Not stated on the AGOL item (blank \`licenseInfo\`, verified) — attributed to APD / City of Atlanta |
| Join key | \`NhoodName\` ↔ crime \`NhoodName\` — **exact identity** after trimming; 239/242 polygon names appear in the incident data (Bankhead, Englewood Manor, Midwest Cascade have polygons but no 2021+ named incidents under those exact names); the 9 unmatched incident names are tabled above |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Sibling legacy layers — probed and NOT used (disclosed)

| Layer | Finding |
|---|---|
| \`2009_2020CrimeData/FeatureServer/0\` | 366,824 rows but **Part 1 (COBRA) offenses only** — exactly 7 crime types (Larceny-From Vehicle, Larceny-Non Vehicle, Burglary, Auto Theft, Agg Assault, Robbery, Homicide). This is a fundamentally narrower taxonomy than the 2021+ full-NIBRS layer (which also carries drugs, fraud, simple assault, weapons, etc.); splicing them into one granular timeline would fabricate an apparent 2021 crime explosion. The layer's \`Occur_Date\` is also a **string** field with junk values (min "0220-11-01", literal "NULL"). |
| \`Crime_Data_1997_2008/FeatureServer/0\` | Legacy UCR extract (~579k rows, 1997–2008), same Part-1-style scope, string dates. |

Per the spec's probe-then-decide instruction, the granular era therefore honestly starts **2021-01**, and deep history comes from the FBI UCR series below. The legacy layers are cited here so the decision is reproducible.

## Real incident points (\`points.json\`)

Dots are **real offense locations published by APD** in the \`Latitude\`/\`Longitude\` fields (100% populated doubles). A small number of rows fall outside the city sanity box (lat ${BBOX.latMin}–${BBOX.latMax}, lng ${BBOX.lngMin}–${BBOX.lngMax}) — **${fmt(summary.totalRecords - placeableCount)} in-span rows (~${Math.round(((summary.totalRecords - placeableCount) / summary.totalRecords) * 10000) / 100}%)** are counted in every total but not plotted. Deterministic sample: every in-bbox row of each NY-local month fetched (OBJECTID order), even-stride ≤100/month → **${fmt(ptsKept)} points ≈ 1 per ${sampleRate} of the ${fmt(placeableCount)} placeable rows**.

## Historical source — FBI UCR (${history.yearMin}–${history.yearMax} deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Atlanta Police Department — **ORI \`${ORI}\`** (verified live; the batch-spec's guess \`GA0600100\` resolves to **College Park PD** and was corrected) |
| Endpoint | ${history.sourceUrl} (and \`/property-crime\`) |
| Span | ${history.yearMin}–${history.yearMax}, annual Violent + Property (12 reported months verified per year) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set \`FBI_API_KEY\`) — raw responses cached under \`data/atlanta-ga/raw/\` |
${droppedYears.length ? `
**Dropped partial years (disclosed):** ${droppedYears.map((d) => `**${d.year}** (violent ${d.violentMonths}/12, property ${d.propertyMonths}/12 reported months)`).join(", ")} — an annual total cannot honestly be built from fewer than 12 reported months. These are APD's NIBRS-transition years.` : ""}${droppedSegments.length ? `
**Dropped complete-but-noncontiguous years (disclosed):** ${droppedSegments.join(", ")} — omitted (not merged across the gap) to keep one contiguous honest series.` : ""}

**The 2019–2020 gap is real and disclosed:** APD's FBI submissions for 2019–2020 are partial and the APD open-data NIBRS layer starts 2021 — no honest citywide series exists for those two years, so they appear in neither era and are never interpolated.

UCR Summary (Violent/Property) is a **different taxonomy** than APD NIBRS categories — the eras are presented as distinct and are never equated. No monthly or neighborhood detail is implied for ${history.yearMin}–${history.yearMax}.

## Reproduce

\`\`\`bash
FBI_API_KEY=… node pipeline/sources/atlanta-ga.mjs
\`\`\`
`;
  writeFileSync(PROV_PATH, md);
  console.log(`  wrote data/atlanta-ga/PROVENANCE.md`);
}

// ---- wiki/Data-Provenance.md append -------------------------------------------
function appendWiki({ summary, history }) {
  if (!existsSync(WIKI_PATH)) return;
  const cur = readFileSync(WIKI_PATH, "utf8");
  if (cur.includes("## Atlanta, GA")) {
    console.log("  wiki/Data-Provenance.md already has an Atlanta section — skipped");
    return;
  }
  const fmt = (n) => n.toLocaleString("en-US");
  const section = `
## Atlanta, GA (\`atlanta-ga\`)

- **Primary source:** OpenDataWebsite_Crime view — APD NIBRS crime data,
  2021-present (ArcGIS \`OpenDataWebsite_Crime_view/FeatureServer/0\`,
  ${HUB_ITEM}) — **no explicit license stated**
  (AGOL \`licenseInfo\` blank, verified; flagged in PROVENANCE). Attribution
  "Atlanta Police Department (APD) via APD Open Data" (${HUB}).
- **Timezone:** \`OccurredFromDate\` epochs are true UTC instants of
  America/New_York wall-clock times (verified against the layer's own
  \`Day_of_the_week\`); month binning is NY-local, DST-aware.
- **Spatial unit:** the 242 official **City of Atlanta neighborhoods**
  (NhoodName, with NPU letters) — the crime data's \`NhoodName\` matches the
  polygon layer verbatim (identity join). 9 APD name variants without a
  polygon (${fmt(summary.unplacedBeats["unmatched-name"])} rows) are disclosed as unmatched-name unplaced.
- **Legacy layers probed, not used:** \`2009_2020CrimeData\` +
  \`Crime_Data_1997_2008\` are Part-1-only (7 offense types) with junk string
  dates — splicing them onto the full-NIBRS 2021+ layer would fabricate a 2021
  jump, so the granular era honestly starts 2021 (reasons in PROVENANCE).
- **Deep-history source (${history.yearMin}–${history.yearMax}):** FBI Crime Data Explorer (CDE) —
  Atlanta PD, **ORI ${ORI}** (verified live; the scouted guess GA0600100 is
  College Park PD) — real annual Violent + Property counts, ${history.years.length} full years
  (12 reported months each, verified). **2019–2020 are a disclosed gap**: APD's
  FBI submissions are partial (NIBRS transition) and the open-data layer starts
  2021 — never interpolated.
- **Span:** ${history.yearMin}–${history.yearMax} (FBI UCR annual) + 2021-01-01 → 2026-06-30 (APD NIBRS
  with neighborhood detail, ${summary.months} months; partial 2026-07 dropped and disclosed).
- **Records:** ${fmt(summary.totalRecords)} total ·
  ${fmt(summary.placedRecords)} placed in an official neighborhood
  (**${summary.coveragePct}% coverage**) · ${fmt(summary.unplacedRecords)} unplaced
  (${fmt(summary.unplacedBeats["no-neighborhood"])} null NhoodName + ${fmt(summary.unplacedBeats["unmatched-name"])} unmatched-name), kept in totals and disclosed.
- **Real dots:** APD publishes per-record \`Latitude\`/\`Longitude\` (100%
  populated); a handful fall outside the city box and are counted but not
  plotted — dots are a deterministic even-stride ≤100/month sample of **real**
  locations.
- **Row grain:** offense-level rows (~2.6% multi-offense inflation, measured);
  we count records and disclose the grain.
- **License:** not stated by APD — attribution given, absence flagged.
- **Detail:** [\`data/atlanta-ga/PROVENANCE.md\`](../data/atlanta-ga/PROVENANCE.md)

### Category mapping (Crime_Against → cat)

| Source value | cat |
|--------------|-----|
| Person | \`persons\` |
| Property | \`property\` |
| Society | \`society\` |
| *(null — NibrsUcrCode \`NOT_APPL\`)* | \`other\` (non-NIBRS/administrative, context only — never counted as NIBRS crime) |
`;
  const marker = "## Ranked source types";
  const idx = cur.indexOf(marker);
  const next =
    idx >= 0 ? cur.slice(0, idx) + section.trimStart() + "\n" + cur.slice(idx) : cur + section;
  writeFileSync(WIKI_PATH, next);
  console.log("  appended Atlanta section to wiki/Data-Provenance.md");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
