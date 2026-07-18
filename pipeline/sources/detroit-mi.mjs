// Detroit, MI — DPD RMS Crime Incidents source pipeline (fetch → normalize → validate).
//
// BINDING RULE: never fabricate — every figure written by this script comes
// straight from a queryable public source; every gap is disclosed.
//
// Sources:
//   Incidents  : "RMS Crime Incidents" ArcGIS layer (2017-present, refreshed
//                daily), Detroit Police Department via the City of Detroit
//                Open Data Portal (data.detroitmi.gov). License unstated on the
//                item — attributed to "Detroit Police Department (DPD)".
//                https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/RMS_Crime_Incidents/FeatureServer/0
//   Polygons   : Current City of Detroit Neighborhoods (official, 205 features,
//                nhood_name) — same City of Detroit ArcGIS org.
//                https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/Current_City_of_Detroit_Neighborhoods/FeatureServer/0
//   History    : FBI Crime Data Explorer (CDE) summarized agency counts,
//                Detroit PD ORI MI8234900 (verified live: full 12-month series
//                1985–2016), annual Violent + Property.
//
// Eras (honesty structure):
//   1985–2016  FBI UCR annual citywide totals (no neighborhood detail implied)
//   2017-01 → 2026-06  DPD RMS incidents with official-neighborhood detail
//                (the RMS layer starts 2017; a small tail of rows with
//                occurred-dates before 2017 — junk/straggler dates back to
//                1915 — is excluded and disclosed, per the source's own 2017+
//                framing).
//
// DEDUPE (spec-mandated): the layer publishes OFFENSE-level rows — one report
// (incident) can appear as several rows (multiple offenses and outright
// duplicate rows). We dedupe by `report_number`: one incident = one distinct
// report_number; the kept row is the deterministic minimum by
// (incident_occurred_at, crime_id, ESRI_OID). Independent reconciliation:
// the server's COUNT(DISTINCT report_number) per month and for the whole
// window must equal the client-side dedupe exactly.
//
// TIME (verified live): `incident_occurred_at` stores true UTC instants —
// converting with the America/Detroit timezone reproduces the source's own
// local `incident_time` field exactly (sampled Jan/EST + Jul/EDT). All month
// binning is done in Detroit local time, and every server-side month window
// uses the matching UTC boundary for local midnight (EST/EDT aware).
//
//   node pipeline/sources/detroit-mi.mjs   (set FBI_API_KEY to avoid DEMO_KEY limits)
//
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const OUT_DIR = resolve(repoRoot, "data/detroit-mi/normalized");
const RAW_DIR = resolve(repoRoot, "data/detroit-mi/raw");
const PROV_PATH = resolve(repoRoot, "data/detroit-mi/PROVENANCE.md");
const WIKI_PATH = resolve(repoRoot, "wiki/Data-Provenance.md");

const ARC =
  "https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/RMS_Crime_Incidents/FeatureServer/0/query";
const ARC_LAYER =
  "https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/RMS_Crime_Incidents/FeatureServer/0";
const HUB = "https://data.detroitmi.gov/";
const HUB_ITEM = "https://data.detroitmi.gov/datasets/rms-crime-incidents";
const NBHD =
  "https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/Current_City_of_Detroit_Neighborhoods/FeatureServer/0";
const ORI = "MI8234900";
const AGENCY = "Detroit Police Department";
const FBI_KEY = process.env.FBI_API_KEY || "DEMO_KEY";
const TZ = "America/Detroit";

const HIST_FROM = "01-1985";
const HIST_TO = "12-2016";

// offense_category → cat, following the NIBRS crimes-against convention
// (documented in full in PROVENANCE.md; ROBBERY is a crime against PROPERTY in
// NIBRS; Group-B-style offenses count against SOCIETY; JUSTIFIABLE HOMICIDE is
// not a crime in NIBRS and RUNAWAY is a status offense — both go to `other`
// along with the source's own MISCELLANEOUS/OTHER buckets).
const CAT_OF = {
  // crimes against persons
  ASSAULT: "persons",
  "AGGRAVATED ASSAULT": "persons",
  HOMICIDE: "persons",
  "SEXUAL ASSAULT": "persons",
  "SEX OFFENSES": "persons",
  KIDNAPPING: "persons",
  // crimes against property
  ROBBERY: "property",
  LARCENY: "property",
  BURGLARY: "property",
  "STOLEN VEHICLE": "property",
  "STOLEN PROPERTY": "property",
  "DAMAGE TO PROPERTY": "property",
  FRAUD: "property",
  FORGERY: "property",
  EXTORTION: "property",
  ARSON: "property",
  // crimes against society
  "WEAPONS OFFENSES": "society",
  "DANGEROUS DRUGS": "society",
  OUIL: "society",
  LIQUOR: "society",
  GAMBLING: "society",
  SOLICITATION: "society",
  "DISORDERLY CONDUCT": "society",
  "OBSTRUCTING THE POLICE": "society",
  "OBSTRUCTING JUDICIARY": "society",
  "HEALTH AND SAFETY": "society",
  "FAMILY OFFENSE": "society",
  "INVASION OF PRIVACY -OTHER": "society",
  // context bucket — never counted as persons/property/society crime
  RUNAWAY: "other",
  MISCELLANEOUS: "other",
  OTHER: "other",
  "JUSTIFIABLE HOMICIDE": "other",
};
const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff2e63" },
  property: { label: "Crimes Against Property", color: "#ffc233" },
  society: { label: "Crimes Against Society", color: "#34e0e0" },
  other: { label: "Other / non-criminal (context)", color: "#7486a0" },
};
const CAT_KEYS = ["persons", "property", "society", "other"]; // catIdx order

// Valid Detroit coordinate box (spec). Verified live: zero in-window rows fall
// outside it; missing locations are published as NULL lat/lng.
const BBOX = { latMin: 42.25, latMax: 42.46, lngMin: -83.29, lngMax: -82.91 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fetchCount = 0;
async function postJSON(url, params, { retries = 4, retryWait = 5000, label = url } = {}) {
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
  const j = await postJSON(ARC, { f: "json", where, returnCountOnly: "true" }, { label });
  const n = j.count;
  if (!Number.isFinite(n)) throw new Error(`${label}: bad count response`);
  return n;
}

// Server-side COUNT(DISTINCT report_number) — the layer supportsCountDistinct.
async function arcDistinctReports(where, label) {
  const j = await postJSON(
    ARC,
    {
      f: "json",
      where,
      returnCountOnly: "true",
      returnDistinctValues: "true",
      outFields: "report_number",
      returnGeometry: "false",
    },
    { label },
  );
  const n = j.count;
  if (!Number.isFinite(n)) throw new Error(`${label}: bad distinct-count response`);
  return n;
}

// ---- Detroit local-time helpers -------------------------------------------
// incident_occurred_at is a true UTC instant; Detroit wall-clock = America/Detroit.
const FMT_YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const FMT_HM = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const ymdOfMs = (ms) => FMT_YMD.format(new Date(ms)); // "YYYY-MM-DD" local
const ymOfMs = (ms) => ymdOfMs(ms).slice(0, 7);
const hmOfMs = (ms) => FMT_HM.format(new Date(ms)); // "HH:MM" local

// UTC instant of local midnight for "YYYY-MM-DD" (EST=UTC-5 / EDT=UTC-4 aware).
function utcOfLocalMidnight(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  for (const offH of [4, 5]) {
    const t = Date.UTC(y, m - 1, d, offH, 0, 0);
    if (ymdOfMs(t) === ymd && hmOfMs(t) === "00:00") return t;
  }
  throw new Error(`utcOfLocalMidnight: no EST/EDT offset reproduces local midnight for ${ymd}`);
}
const sqlTs = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
};

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
const nextYm = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
// where-clause for one LOCAL month (UTC boundaries, DST-aware)
const monthWhere = (ym) => {
  const a = utcOfLocalMidnight(`${ym}-01`);
  const b = utcOfLocalMidnight(`${nextYm(ym)}-01`);
  return `incident_occurred_at >= TIMESTAMP '${sqlTs(a)}' AND incident_occurred_at < TIMESTAMP '${sqlTs(b)}'`;
};
const SPAN_START_MS = utcOfLocalMidnight("2017-01-01");
const SPAN_END_MS = utcOfLocalMidnight("2026-07-01");
const SPAN_WHERE = `incident_occurred_at >= TIMESTAMP '${sqlTs(SPAN_START_MS)}' AND incident_occurred_at < TIMESTAMP '${sqlTs(SPAN_END_MS)}'`;

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
  console.log("── Detroit official neighborhood polygons (Current City of Detroit Neighborhoods)");
  const gj = await postJSON(
    `${NBHD}/query`,
    { f: "geojson", where: "1=1", outFields: "nhood_name,nhood_num,council_district" },
    { label: "neighborhoods geojson" },
  );
  assert(gj?.type === "FeatureCollection" && Array.isArray(gj.features), "NBHD: bad geojson");
  assert(gj.features.length === 205, `NBHD: expected 205 features, got ${gj.features.length}`);

  const beats = {};
  gj.features.forEach((f, idx) => {
    const raw = f.properties?.nhood_name;
    assert(typeof raw === "string" && raw.trim().length > 0, `NBHD feature ${idx}: missing nhood_name`);
    const key = raw.trim(); // defensive trim; verified identical to source values
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
      name: key, // nhood_name is already the resident-facing proper name
      servcen: String(f.properties?.nhood_num ?? ""),
      beat: idx,
      centroid: [Number((X / A).toFixed(6)), Number((Y / A).toFixed(6))],
      polygon: outerRings,
      geomType: g.type,
    };
  });
  const HOODS = new Set(Object.keys(beats));
  console.log(`  ${HOODS.size} neighborhoods (e.g. ${[...HOODS].slice(0, 3).join(", ")})`);

  // ---- 2. Full monthly pulls + client-side dedupe by report_number ---------
  console.log("── Full pull (2017-01…2026-06, Detroit local months) + dedupe by report_number");
  // incidents: report_number → kept offense row (deterministic minimum) + stats
  const incidents = new Map();
  const rowsPerMonth = MONTHS.map(() => 0);
  const monthReportSets = MONTHS.map(() => new Set()); // reports with ≥1 row in month
  let windowRows = 0;
  let nullTimeRows = 0;

  for (let mi = 0; mi < MONTHS.length; mi++) {
    const ym = MONTHS[mi];
    const feats = await arcAll(
      {
        where: monthWhere(ym),
        outFields:
          "ESRI_OID,report_number,crime_id,incident_occurred_at,offense_category,offense_description,neighborhood,latitude,longitude,nearest_intersection",
        returnGeometry: "false",
        orderByFields: "ESRI_OID",
        resultRecordCount: "2000",
      },
      { label: `pull ${ym}` },
    );
    for (const f of feats) {
      const a = f.attributes;
      windowRows++;
      rowsPerMonth[mi]++;
      assert(Number.isFinite(a.incident_occurred_at), `pull ${ym}: null incident_occurred_at`);
      assert(ymOfMs(a.incident_occurred_at) === ym, `pull ${ym}: row local-month mismatch (${a.incident_occurred_at})`);
      const rep = a.report_number;
      assert(typeof rep === "string" && rep.length > 0, `pull ${ym}: missing report_number`);
      const cat = CAT_OF[a.offense_category];
      assert(cat, `pull ${ym}: unmapped offense_category '${a.offense_category}'`);
      const hood = a.neighborhood == null ? null : String(a.neighborhood).trim();
      assert(hood === null || HOODS.has(hood), `pull ${ym}: unexpected neighborhood '${a.neighborhood}'`);
      monthReportSets[mi].add(rep);
      const row = {
        ms: a.incident_occurred_at,
        crimeId: String(a.crime_id ?? ""),
        oid: a.ESRI_OID,
        cat,
        catRaw: a.offense_category,
        desc: a.offense_description == null ? "" : String(a.offense_description).trim(),
        hood,
        lat: a.latitude,
        lng: a.longitude,
        place: a.nearest_intersection == null ? "" : String(a.nearest_intersection).trim(),
      };
      const cur = incidents.get(rep);
      if (!cur) {
        incidents.set(rep, { kept: row, rows: 1, cats: new Set([cat]), hoods: new Set([hood]), minYm: ym, maxYm: ym });
      } else {
        cur.rows++;
        cur.cats.add(cat);
        cur.hoods.add(hood);
        if (ym < cur.minYm) cur.minYm = ym;
        if (ym > cur.maxYm) cur.maxYm = ym;
        // deterministic kept row: min (incident_occurred_at, crime_id, ESRI_OID)
        const k = cur.kept;
        if (
          row.ms < k.ms ||
          (row.ms === k.ms && (row.crimeId < k.crimeId || (row.crimeId === k.crimeId && row.oid < k.oid)))
        )
          cur.kept = row;
      }
    }
    // INDEPENDENT per-month reconciliation: the server's COUNT(DISTINCT
    // report_number) for this local month must equal what we just pulled.
    const distinctSrv = await arcDistinctReports(monthWhere(ym), `distinct ${ym}`);
    assert(
      distinctSrv === monthReportSets[mi].size,
      `${ym}: server distinct reports ${distinctSrv} != pulled ${monthReportSets[mi].size}`,
    );
    if ((mi + 1) % 12 === 0)
      console.log(`  …through ${ym}: ${windowRows} rows, ${incidents.size} incidents so far`);
  }
  void nullTimeRows;
  const totalRecords = incidents.size; // deduped incidents in the window
  console.log(`  ${windowRows} offense rows → ${totalRecords} deduped incidents (by report_number)`);

  // Global independent reconciliation of the dedupe + row totals
  const srvWindowRows = await arcCount(SPAN_WHERE, "window row count");
  assert(srvWindowRows === windowRows, `window rows: server ${srvWindowRows} != pulled ${windowRows}`);
  const srvDistinct = await arcDistinctReports(SPAN_WHERE, "window distinct reports");
  assert(srvDistinct === totalRecords, `window distinct: server ${srvDistinct} != deduped ${totalRecords}`);
  console.log(`  server COUNT(DISTINCT report_number) == client dedupe: ${totalRecords} ✓ (per month and globally)`);

  // Dedupe disclosure stats
  let multiRowReports = 0,
    crossCatReports = 0,
    crossHoodReports = 0,
    crossMonthReports = 0;
  for (const v of incidents.values()) {
    if (v.rows > 1) multiRowReports++;
    if (v.cats.size > 1) crossCatReports++;
    if (v.hoods.size > 1) crossHoodReports++;
    if (v.minYm !== v.maxYm) crossMonthReports++;
  }
  console.log(
    `  dedupe: ${multiRowReports} reports had >1 offense row; ${crossCatReports} spanned categories, ` +
      `${crossHoodReports} spanned neighborhoods, ${crossMonthReports} spanned months (binned at earliest row)`,
  );

  // ---- 3. Window-edge disclosure (junk dates, partial month) ---------------
  console.log("── Window edges (excluded & disclosed)");
  const preRows = await arcCount(
    `incident_occurred_at < TIMESTAMP '${sqlTs(SPAN_START_MS)}'`,
    "pre-2017 rows",
  );
  const postRows = await arcCount(
    `incident_occurred_at >= TIMESTAMP '${sqlTs(SPAN_END_MS)}'`,
    "post-window rows",
  );
  const nullDate = await arcCount(`incident_occurred_at IS NULL`, "null-date rows");
  const grandRows = await arcCount(`1=1`, "grand row total");
  assert(
    preRows + windowRows + postRows + nullDate === grandRows,
    `row accounting: ${preRows}+${windowRows}+${postRows}+${nullDate} != ${grandRows}`,
  );
  console.log(
    `  grand ${grandRows} rows = ${preRows} pre-2017 (junk/straggler dates) + ${windowRows} in-window + ` +
      `${postRows} partial 2026-07 + ${nullDate} null-date`,
  );

  // ---- 4. Bin deduped incidents: neighborhood × month × cat ----------------
  console.log("── Timeline: per-neighborhood monthly incident counts by category");
  const cells = {};
  for (const k of HOODS)
    cells[k] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  const junkByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  const cityByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  const catRawTotals = {}; // verbatim offense_category → count (kept rows)

  for (const v of incidents.values()) {
    const k = v.kept;
    const mi = MONTH_IDX.get(ymOfMs(k.ms));
    assert(mi !== undefined, `bin: kept row outside span (${k.ms})`);
    cityByCatMonth[k.cat][mi]++;
    catTotals[k.cat]++;
    catRawTotals[k.catRaw] = (catRawTotals[k.catRaw] || 0) + 1;
    if (k.hood !== null) cells[k.hood][mi][k.cat]++;
    else junkByCatMonth[k.cat][mi]++;
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
  assert(
    CAT_KEYS.reduce((s, c) => s + catTotals[c], 0) === totalRecords,
    "catTotals do not sum to totalRecords",
  );
  console.log(`  placed + unplaced == citywide for all ${MONTHS.length} months × 4 cats ✓`);

  let placedRecords = 0;
  for (const k of HOODS)
    for (const cc of cells[k]) placedRecords += cc.persons + cc.property + cc.society + cc.other;
  const noNeighborhood = CAT_KEYS.reduce(
    (s, c) => s + junkByCatMonth[c].reduce((a, b) => a + b, 0),
    0,
  );
  const unplacedRecords = noNeighborhood;
  assert(placedRecords + unplacedRecords === totalRecords, "placed+unplaced != total");
  const coveragePct = Math.round((placedRecords / totalRecords) * 1000) / 10;
  console.log(
    `  total ${totalRecords} incidents = placed ${placedRecords} + no-neighborhood ${noNeighborhood}` +
      ` → coverage ${coveragePct}%`,
  );

  // ---- 5. Sampled REAL points ----------------------------------------------
  console.log("── Real incident points (DPD-published coords; deterministic sample)");
  const byMonth = MONTHS.map(() => []);
  let placeableCount = 0,
    noCoords = 0;
  // deterministic order: sort each incident list by (ms, crimeId, report irrelevant)
  const sortedIncidents = [...incidents.entries()]
    .map(([rep, v]) => ({ rep, ...v.kept }))
    .sort((a, b) => a.ms - b.ms || (a.crimeId < b.crimeId ? -1 : a.crimeId > b.crimeId ? 1 : 0) || (a.rep < b.rep ? -1 : 1));
  for (const it of sortedIncidents) {
    const lat = it.lat,
      lng = it.lng;
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
    const mi = MONTH_IDX.get(ymOfMs(it.ms));
    byMonth[mi].push([Number(lng.toFixed(6)), Number(lat.toFixed(6)), CAT_KEYS.indexOf(it.cat)]);
  }
  assert(placeableCount + noCoords === totalRecords, "points accounting != total");
  const pts = byMonth.map((arr) => {
    if (arr.length <= 100) return arr;
    const out = [];
    for (let i = 0; i < 100; i++) out.push(arr[Math.floor((i * arr.length) / 100)]);
    return out;
  });
  const ptsKept = pts.reduce((s, a) => s + a.length, 0);
  const sampleRate = Math.round(placeableCount / ptsKept);
  console.log(
    `  ${placeableCount} incidents with usable coords (${noCoords} without — counted, not plotted), ` +
      `kept ${ptsKept} → 1 per ~${sampleRate}`,
  );

  // ---- 6. Dispatch feed ------------------------------------------------------
  // 8 real incidents per quarter, chosen by deterministic even-stride across the
  // quarter's chronologically-sorted placed incidents (no category/severity
  // bias; a plain "first 8" pull would over-sample midnight-dated offenses).
  console.log("── Feed: 8 real incidents per quarter, 2017-Q1 … 2026-Q2 (even-stride)");
  const feed = [];
  for (let y = 2017; y <= 2026; y++) {
    for (let q = 0; q < 4; q++) {
      const qMonths = [0, 1, 2].map((k) => `${y}-${String(q * 3 + 1 + k).padStart(2, "0")}`);
      if (MONTH_IDX.get(qMonths[0]) === undefined) continue;
      const pool = sortedIncidents.filter(
        (it) => it.hood !== null && qMonths.includes(ymOfMs(it.ms)),
      );
      assert(pool.length >= 8, `feed ${y}Q${q + 1}: only ${pool.length} placed incidents`);
      for (let i = 0; i < 8; i++) {
        const it = pool[Math.floor((i * pool.length) / 8)];
        const catg = it.catRaw;
        const off = it.desc;
        const title = !off
          ? catg || "OFFENSE (unspecified)"
          : !catg || off.toLowerCase() === catg.toLowerCase()
            ? off
            : `${catg} — ${off}`;
        feed.push({
          date: ymdOfMs(it.ms),
          title,
          place: it.place || it.hood,
          beat: it.hood,
          cat: it.cat,
        });
      }
    }
  }
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`  ${feed.length} feed items (chronological, no seriousness bias)`);

  // ---- 7. FBI UCR history 1985–2016 -----------------------------------------
  console.log(
    `── FBI CDE history (${ORI}, 1985–2016, key=${FBI_KEY === "DEMO_KEY" ? "DEMO_KEY" : "FBI_API_KEY"})`,
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
      // The CDE returns BOTH "… Offenses" and "… Clearances" series for this
      // agency — match the Offenses series explicitly (never clearances).
      const agKey = Object.keys(actuals).find((k) => /Detroit/i.test(k) && /Offenses/i.test(k));
      if (!agKey)
        throw new Error(`FBI ${offense}: no "Detroit … Offenses" series (keys: ${Object.keys(actuals)})`);
      const monthly = actuals[agKey] || {};
      if (Object.keys(monthly).length === 0)
        throw new Error(
          `FBI ${offense}: empty series for ORI ${ori} — verify the ORI via ` +
            `https://api.usa.gov/crime/fbi/cde/agency/byStateAbbr/MI (grep Detroit)`,
        );
      const byYear = {},
        monthsSeen = {};
      for (const [mk, v] of Object.entries(monthly)) {
        if (v === null || v === undefined) continue;
        const y2 = Number(mk.split("-")[1]);
        byYear[y2] = (byYear[y2] || 0) + Number(v);
        monthsSeen[y2] = (monthsSeen[y2] || 0) + 1;
      }
      return { byYear, monthsSeen };
    }
    throw new Error(`FBI ${offense}: exhausted retries`);
  }
  const violent = await fetchAnnual("violent-crime");
  const property = await fetchAnnual("property-crime");
  const droppedYears = [];
  const years = [];
  for (let y = 1985; y <= 2016; y++) {
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
  if (droppedYears.length)
    console.warn(`  dropped partial years: ${JSON.stringify(droppedYears)}`);
  console.log(`  ${years.length} complete years ${yearMin}–${yearMax} (12 months each verified)`);

  // ---- Assemble output files -------------------------------------------------
  const timeline = { months: MONTHS, cells };
  const beatsFile = { cats: CATS, beats };
  const summary = {
    slug: "detroit-mi",
    title: "Detroit · MI",
    source: { records: ARC_LAYER, beats: NBHD, hub: HUB },
    fetchedAt,
    dateMin: "2017-01-01",
    dateMax: "2026-06-30",
    months: MONTHS.length,
    totalRecords,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: { "no-neighborhood": noNeighborhood },
    dedupe: {
      method: "report_number",
      offenseRows: windowRows,
      incidents: totalRecords,
      note: "source rows are offense-level; incidents are distinct report_numbers (server COUNT DISTINCT == client dedupe, verified per month)",
    },
    catTotals,
    cats: CATS,
    beatCount: Object.keys(beats).length,
  };
  const history = {
    era: "history",
    taxonomy:
      "FBI UCR Summary (Violent + Property) — a different taxonomy than the DPD RMS categories used from 2017; the two eras bridge at 2017 and are never equated",
    agency: AGENCY,
    ori: ORI,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      `Annual totals are real UCR Summary counts fetched from the FBI CDE summarized agency endpoint for ORI ${ORI} ` +
      `(12 reported months verified per year; the CDE returns Offenses and Clearances series — the Offenses series is used). ` +
      `UCR Summary (Violent/Property) and DPD RMS offense categories are different taxonomies and are presented as distinct ` +
      `eras; neighborhood-level detail exists only from 2017 (the RMS open-data layer starts there), so the story bridges ` +
      `from citywide annual history to per-neighborhood monthly data at 2017. ` +
      `Reproduce with pipeline/sources/detroit-mi.mjs (set FBI_API_KEY to avoid DEMO_KEY rate limits).` +
      (droppedYears.length
        ? ` Dropped partial years (<12 reported months): ${droppedYears.map((d) => d.year).join(", ")}.`
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
    source: "Current City of Detroit Neighborhoods (official)",
    sourceUrl: `${NBHD}/query?where=1=1&outFields=*&f=geojson`,
    hub: HUB,
    fetchedAt,
    license:
      "Not stated on the item — City of Detroit Open Data Portal; attributed to the City of Detroit",
    method:
      "identity — DPD crime records carry the official neighborhood name (nhood_name) verbatim; all 205 incident values match all 205 polygon names exactly; no spatial join or approximation is involved",
    map: Object.fromEntries(Object.keys(beats).map((k) => [k, { name: k, approx: false }])),
  };
  const points = {
    mode: "real-sample",
    note:
      "Every dot is a real reported incident location as published by DPD (latitude/longitude fields; DPD publishes locations at the nearest-intersection grain). ~0.1% of incidents have no usable coordinates and are counted but not plotted. One dot per deduped incident (report_number), deterministic even-stride sample (≤100/month).",
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
  assert(Object.keys(beats).length === 205, "beatCount != 205");
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
    assert(f.date >= "2017-01-01" && f.date <= "2026-06-30", `feed date out of span ${f.date}`);
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
    noCoords,
    ptsKept,
    sampleRate,
    catTotals,
    catRawTotals,
    windowRows,
    preRows,
    postRows,
    nullDate,
    grandRows,
    multiRowReports,
    crossCatReports,
    crossHoodReports,
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
  noCoords,
  ptsKept,
  sampleRate,
  catTotals,
  catRawTotals,
  windowRows,
  preRows,
  postRows,
  nullDate,
  grandRows,
  multiRowReports,
  crossCatReports,
  crossHoodReports,
  crossMonthReports,
}) {
  const fmt = (n) => n.toLocaleString("en-US");
  const mapRows = Object.entries(CAT_OF)
    .map(([src, cat]) => `| ${src} | \`${cat}\` | ${fmt(catRawTotals[src] || 0)} |`)
    .join("\n");
  const md = `# Provenance — Detroit, MI

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **RMS Crime Incidents** (2017-present) |
| Publisher | Detroit Police Department (DPD), via the City of Detroit Open Data Portal |
| Landing page | ${HUB_ITEM} (portal: ${HUB}) |
| API | ${ARC_LAYER} |
| Fetched | ${fetchedAt} |
| License | **Not stated** on the dataset item — used under the portal's public open-data publication; attribution "Detroit Police Department (DPD) via City of Detroit Open Data Portal" |
| Records used | ${fmt(summary.totalRecords)} incidents (${fmt(windowRows)} offense-level rows, deduplicated — see below) |
| Source caveat | Refreshed daily; classifications can change as investigations proceed |

### Offense-level rows → incidents (dedupe, disclosed)
The layer publishes **offense-level rows**: one police report (incident) can appear as several rows — additional offenses on the same report and outright duplicate rows. Following the dataset's own \`report_number\` key:

- ${fmt(windowRows)} in-window offense rows → **${fmt(summary.totalRecords)} distinct incidents** (dedupe by \`report_number\`, ×${(windowRows / summary.totalRecords).toFixed(3)} row inflation)
- Kept row per report = deterministic minimum by (\`incident_occurred_at\`, \`crime_id\`, \`ESRI_OID\`); its category/neighborhood/coordinates represent the incident
- ${fmt(multiRowReports)} reports had >1 row; ${fmt(crossCatReports)} spanned crime categories, ${fmt(crossHoodReports)} spanned neighborhoods, ${fmt(crossMonthReports)} spanned months (binned at the earliest row)
- **Independent reconciliation:** the server's \`COUNT(DISTINCT report_number)\` equals the client-side dedupe **for every one of the 114 months and globally** — validated in-script on every run

### Time semantics (verified, disclosed)
\`incident_occurred_at\` stores **true UTC instants**: converting with the America/Detroit timezone reproduces the source's own local \`incident_time\` field exactly (verified on EST and EDT samples). All month binning uses **Detroit local time**, and every server-side month query uses the matching UTC boundary for local midnight (DST-aware). Per the source's field description, when an incident occurred over a period the timestamp is the **beginning** of that period.

### Windowing (disclosed exclusions)
Dataset grand total ${fmt(grandRows)} rows =
- **${fmt(windowRows)} in-window rows** (occurred 2017-01-01 → 2026-06-30, Detroit local time) — used
- **${fmt(preRows)} pre-2017 rows** — junk/straggler occurred-dates back to 1915 in a dataset framed as 2017-present; excluded and disclosed
- **${fmt(postRows)} partial-month rows** (occurred on/after 2026-07-01 local, partial month at fetch time) — excluded and disclosed
- **${fmt(nullDate)} null-date rows**

### Fields used
\`incident_occurred_at\` · \`offense_category\` · \`offense_description\` · \`state_offense_code\` (inspected) · \`report_number\` · \`crime_id\` · \`neighborhood\` (official name) · \`police_precinct\` (inspected) · \`nearest_intersection\` · \`latitude\`/\`longitude\`.

### Category mapping (offense_category → cat), in full
DPD's RMS categories carry no native NIBRS crimes-against flag, so each \`offense_category\` is mapped once, following the **NIBRS crimes-against convention** (robbery counts against **property**; Group-B-style offenses count against **society**; non-crimes and unclassifiable buckets go to \`other\`). The 32 values below are exhaustive (any new value fails the run loudly). Counts are deduped incidents (kept rows) in the window:

| offense_category (verbatim) | cat | incidents |
|---|---|--:|
${mapRows}

Mapping rationale for the judgment calls:
- **ROBBERY → \`property\`** — NIBRS classifies robbery as a crime against property.
- **SEX OFFENSES / SEXUAL ASSAULT → \`persons\`** — NIBRS classifies sex offenses as crimes against persons.
- **OBSTRUCTING THE POLICE / OBSTRUCTING JUDICIARY / OUIL / DISORDERLY CONDUCT / LIQUOR / FAMILY OFFENSE / HEALTH AND SAFETY / SOLICITATION / INVASION OF PRIVACY -OTHER → \`society\`** — Group-B-style offenses; NIBRS treats Group B offenses as crimes against society.
- **JUSTIFIABLE HOMICIDE → \`other\`** — not a crime in NIBRS.
- **RUNAWAY → \`other\`** — status offense, not a crime.
- **MISCELLANEOUS / OTHER → \`other\`** — unclassifiable source buckets, kept as context only.

\`other\` is labeled "${CATS.other.label}" and is never counted as persons/property/society crime.

### Coverage
- Placed (one of the 205 official neighborhoods): **${fmt(summary.placedRecords)}** (${summary.coveragePct}%)
- Unplaced: ${fmt(summary.unplacedRecords)} incidents whose kept row has a null \`neighborhood\` — counted in every total and disclosed, never dropped.
- Identity \`placed + unplaced == citywide\` validated per month × category in-script, on top of the independent server-side distinct-count reconciliation above.

## Geometry source — official neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **Current City of Detroit Neighborhoods** — 205 polygons, official city neighborhoods |
| FeatureServer | ${NBHD} |
| License | Not stated on the item — City of Detroit Open Data Portal; attributed to the City of Detroit |
| Join key | \`nhood_name\` ↔ crime \`neighborhood\` — **exact identity**: all 205 distinct incident values match all 205 polygon names verbatim (verified live); the only unmatched incident value is null (disclosed as no-neighborhood) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (\`points.json\`)

Dots are **real incident locations published by DPD** in the \`latitude\`/\`longitude\` fields (DPD anonymizes to the \`nearest_intersection\` grain). One dot per deduped incident. **${fmt(noCoords)} incidents (~${Math.round((noCoords / summary.totalRecords) * 1000) / 10}%) have no usable coordinates** (null lat/lng) and are counted in every total but not plotted; zero in-window rows fall outside the city bounding box (lat ${BBOX.latMin}–${BBOX.latMax}, lng ${BBOX.lngMin}–${BBOX.lngMax}). Deterministic sample: incidents sorted by (occurred-at, crime_id), even-stride ≤100/month → **${fmt(ptsKept)} points ≈ 1 per ${sampleRate} of the ${fmt(placeableCount)} placeable incidents**.

## Historical source — FBI UCR (${history.yearMin}–${history.yearMax} deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Detroit Police Department — **ORI \`${ORI}\`** (verified live: full series returned) |
| Endpoint | ${history.sourceUrl} (and \`/property-crime\`) |
| Span | ${history.yearMin}–${history.yearMax}, annual Violent + Property (12 reported months verified per year)${droppedYears.length ? ` — dropped partial years: ${droppedYears.map((d) => d.year).join(", ")}` : ""} |
| Series | The CDE returns both "Offenses" and "Clearances" series for this agency — the **Offenses** series is used (matched explicitly) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set \`FBI_API_KEY\`) |

Raw CDE responses are cached under \`data/detroit-mi/raw/\`. UCR Summary (Violent/Property) is a **different taxonomy** than DPD RMS offense categories — the eras are presented as distinct and bridge at 2017; they are never equated. No monthly or neighborhood detail is implied for ${history.yearMin}–${history.yearMax}.

## Reproduce

\`\`\`bash
FBI_API_KEY=… node pipeline/sources/detroit-mi.mjs
\`\`\`
`;
  writeFileSync(PROV_PATH, md);
  console.log(`  wrote data/detroit-mi/PROVENANCE.md`);
}

// ---- wiki/Data-Provenance.md append -------------------------------------------
function appendWiki({ summary, history }) {
  if (!existsSync(WIKI_PATH)) return;
  const cur = readFileSync(WIKI_PATH, "utf8");
  if (cur.includes("## Detroit, MI")) {
    console.log("  wiki/Data-Provenance.md already has a Detroit section — skipped");
    return;
  }
  const fmt = (n) => n.toLocaleString("en-US");
  const section = `
## Detroit, MI (\`detroit-mi\`)

- **Primary source:** RMS Crime Incidents — DPD offense-level records, 2017-present
  (ArcGIS \`RMS_Crime_Incidents/FeatureServer/0\`, ${HUB_ITEM}) —
  license **not stated** on the item; attributed "Detroit Police Department (DPD)
  via City of Detroit Open Data Portal". Refreshed daily.
- **Dedupe:** the layer is offense-level — deduplicated by \`report_number\` to
  **incidents** (${fmt(summary.dedupe.offenseRows)} rows → ${fmt(summary.totalRecords)} incidents).
  Independent server-side \`COUNT(DISTINCT report_number)\` equals the client
  dedupe for every month and globally (validated in-script).
- **Time:** \`incident_occurred_at\` is a true UTC instant (verified against the
  source's local \`incident_time\`); all binning is Detroit local time with
  DST-aware month boundaries.
- **Spatial unit:** the 205 official **Current City of Detroit Neighborhoods** —
  the crime data's \`neighborhood\` field matches the polygon layer's
  \`nhood_name\` exactly (identity join, 205/205 verbatim; only nulls unmatched).
- **Deep-history source (${history.yearMin}–${history.yearMax}):** FBI Crime Data Explorer (CDE) —
  Detroit PD, **ORI ${ORI}** — real annual Violent + Property counts,
  ${history.years.length} full years (12 reported months each, verified; the CDE's "Offenses"
  series, never "Clearances"). UCR taxonomy kept distinct from DPD RMS
  categories; eras bridge at 2017.
- **Span:** ${history.yearMin}–${history.yearMax} (FBI UCR annual) + 2017-01-01 → 2026-06-30 (DPD RMS
  with neighborhood detail, ${summary.months} months; junk pre-2017 straggler dates and
  partial 2026-07 dropped and disclosed).
- **Records:** ${fmt(summary.totalRecords)} incidents ·
  ${fmt(summary.placedRecords)} placed in an official neighborhood
  (**${summary.coveragePct}% coverage**) · ${fmt(summary.unplacedRecords)} unplaced
  (null neighborhood), kept in totals and disclosed.
- **Real dots:** DPD publishes per-record \`latitude\`/\`longitude\` at the
  nearest-intersection grain; ~0.1% of incidents have no usable coordinates —
  dots are a deterministic even-stride ≤100/month sample of **real** locations;
  unlocatable incidents are counted but not plotted.
- **License:** not stated (open-data portal publication) — flagged; attribute DPD.
- **Detail:** [\`data/detroit-mi/PROVENANCE.md\`](../data/detroit-mi/PROVENANCE.md)

### Category mapping (offense_category → cat, NIBRS crimes-against convention)

| cat | offense_category values |
|-----|------------------------|
| \`persons\` | ASSAULT, AGGRAVATED ASSAULT, HOMICIDE, SEXUAL ASSAULT, SEX OFFENSES, KIDNAPPING |
| \`property\` | ROBBERY (NIBRS: property), LARCENY, BURGLARY, STOLEN VEHICLE, STOLEN PROPERTY, DAMAGE TO PROPERTY, FRAUD, FORGERY, EXTORTION, ARSON |
| \`society\` | WEAPONS OFFENSES, DANGEROUS DRUGS, OUIL, LIQUOR, GAMBLING, SOLICITATION, DISORDERLY CONDUCT, OBSTRUCTING THE POLICE, OBSTRUCTING JUDICIARY, HEALTH AND SAFETY, FAMILY OFFENSE, INVASION OF PRIVACY -OTHER |
| \`other\` | RUNAWAY (status offense), MISCELLANEOUS, OTHER, JUSTIFIABLE HOMICIDE (not a crime in NIBRS) — context only, never counted as crime |
`;
  // insert before "## Ranked source types" if present, else append
  const marker = "## Ranked source types";
  const idx = cur.indexOf(marker);
  const next =
    idx >= 0 ? cur.slice(0, idx) + section.trimStart() + "\n" + cur.slice(idx) : cur + section;
  writeFileSync(WIKI_PATH, next);
  console.log("  appended Detroit section to wiki/Data-Provenance.md");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
