// Baltimore, MD — BPD NIBRS Group A Crime Data source pipeline (fetch → normalize → validate).
//
// BINDING RULE: never fabricate — every figure written by this script comes
// straight from a queryable public source; every gap is disclosed.
//
// Sources:
//   Incidents  : Open Baltimore "NIBRS Group A Crime Data" hosted ArcGIS layer
//                (live feed, 2022-01-01 → present), Baltimore Police Department.
//                https://services1.arcgis.com/UWYHeuuJISiGmgXx/arcgis/rest/services/NIBRS_GroupA_Crime_Data/FeatureServer/0
//                ⚠ VICTIM-BASED: one row per victim (Total_Incidents is always 1);
//                261k+ rows collapse to ~226k incidents. DEDUPED BY CCNumber —
//                disclosed everywhere a count appears.
//                The legacy "Part 1 Crime Data" layer is FROZEN (last data
//                2023-02) and is NOT used.
//                License unstated on the item — attributed to "Baltimore City
//                Police Department via Open Baltimore".
//   Polygons   : Baltimore official Neighborhoods (2010 statistical areas,
//                278 polygons, field `Name`), City of Baltimore.
//                https://services1.arcgis.com/UWYHeuuJISiGmgXx/arcgis/rest/services/Neighborhoods_bndy/FeatureServer/0
//   History    : FBI Crime Data Explorer (CDE) summarized agency counts,
//                Baltimore PD ORI MDBPD0000, 1985–2020 annual Violent + Property.
//                (The scouted ORI MD3010100 returns an EMPTY series — verified
//                via agency/byStateAbbr/MD that Baltimore PD is MDBPD0000.
//                2021 has only 7 reported months → dropped, disclosed gap year.)
//
// Eras (honesty structure):
//   1985–2020  FBI UCR annual citywide totals (no neighborhood detail implied);
//              2021 = disclosed gap year (7/12 reported months, NIBRS transition)
//   2022-01 → 2026-06  BPD NIBRS Group A incidents (victim rows deduped by
//              CCNumber) with official-neighborhood detail via point-in-polygon
//              spatial join of BPD-published coordinates.
//
// Spatial join instead of the in-data `Neighborhood` field (disclosed):
//   the in-data field is ~98.5% BLANK for 2022 (52,959 of 53,741 rows) while
//   2023+ is nearly complete — an identity join would erase 2022 from the map
//   and put a method seam right where the story compares 2022→2025. One uniform
//   method (point-in-polygon of the source's own coordinates into the official
//   polygons, holes honored) covers the full span; where the in-data name IS
//   present and matches an official polygon name, the join is validated against
//   it and the agreement rate is published in PROVENANCE.
//
// Timestamps: CrimeDateTime is a true UTC instant of the local event time
//   (verified: min = 2022-01-01 05:00Z = local EST midnight; UTC hour-of-day
//   low sits at 10Z = 5-6 AM local). All month binning is done in
//   America/New_York local time; the per-month server cross-checks use exact
//   UTC instants of the local month boundaries.
//
//   node pipeline/sources/baltimore-md.mjs   (reads .secrets/fbi_api_key; FBI_API_KEY env overrides)
//
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const OUT_DIR = resolve(repoRoot, "data/baltimore-md/normalized");
const RAW_DIR = resolve(repoRoot, "data/baltimore-md/raw");
const PROV_PATH = resolve(repoRoot, "data/baltimore-md/PROVENANCE.md");
const WIKI_PATH = resolve(repoRoot, "wiki/Data-Provenance.md");

const ARC =
  "https://services1.arcgis.com/UWYHeuuJISiGmgXx/arcgis/rest/services/NIBRS_GroupA_Crime_Data/FeatureServer/0/query";
const ARC_LAYER =
  "https://services1.arcgis.com/UWYHeuuJISiGmgXx/arcgis/rest/services/NIBRS_GroupA_Crime_Data/FeatureServer/0";
const HUB_ITEM = "https://www.arcgis.com/home/item.html?id=204beefe92a645d79fdf0969957bbdf8";
const HUB = "https://data.baltimorecity.gov/";
const NBHD =
  "https://services1.arcgis.com/UWYHeuuJISiGmgXx/arcgis/rest/services/Neighborhoods_bndy/FeatureServer/0";
const NBHD_ITEM = "https://www.arcgis.com/home/item.html?id=9a800dc1d0fc42b697bb79a4e63488b2";
const ORI = "MDBPD0000"; // verified live; the scouted MD3010100 series is EMPTY
const AGENCY = "Baltimore Police Department";
const FBI_KEY =
  process.env.FBI_API_KEY ||
  (existsSync(resolve(repoRoot, ".secrets/fbi_api_key"))
    ? readFileSync(resolve(repoRoot, ".secrets/fbi_api_key"), "utf8").trim()
    : "DEMO_KEY");

const TZ = "America/New_York";
const SPAN_START = "2022-01-01"; // inclusive, local
const SPAN_END = "2026-07-01"; // exclusive, local → dateMax 2026-06-30
const HIST_FROM = "01-1985";
const HIST_TO = "12-2021"; // 2021 is partial (7 months) → dropped by the 12-month gate

// Description → NIBRS crimes-against category. The 28 values below are the
// EXHAUSTIVE distinct Description values in the layer (verified live via a
// grouped query at build time — an unmapped value is a hard failure).
// Classification follows the official NIBRS crimes-against assignment of the
// corresponding Group A offense (robbery, arson, vandalism, fraud, extortion,
// stolen property = PROPERTY; intimidation, human trafficking = PERSONS;
// weapon/drug/prostitution/pornography/animal-cruelty = SOCIETY).
const CAT_OF = {
  "COMMON ASSAULT": "persons", // 13B simple assault
  "AGG. ASSAULT": "persons", // 13A
  HOMICIDE: "persons", // 09A
  RAPE: "persons", // 11A
  "SEX OFFENSES": "persons", // 11B/11C/36x
  INTIMIDATION: "persons", // 13C
  KIDNAPPING: "persons", // 100
  "HUMAN TRAFFICKING": "persons", // 64A/64B
  VANDALISM: "property", // 290 destruction/damage/vandalism
  "AUTO THEFT": "property", // 240
  LARCENY: "property", // 23x
  "LARCENY FROM AUTO": "property", // 23F
  "LARCENY OF MOTOR VEHICLE PARTS OR ACCESSORIES": "property", // 23G
  SHOPLIFTING: "property", // 23C
  BURGLARY: "property", // 220
  ROBBERY: "property", // 120 — a crime against PROPERTY in NIBRS
  "ROBBERY - COMMERCIAL": "property", // 120
  "ROBBERY - CARJACKING": "property", // 120
  FRAUD: "property", // 26x
  ARSON: "property", // 200
  "STOLEN PROPERTY": "property", // 280
  EXTORTION: "property", // 210
  "WEAPON VIOLATIONS": "society", // 520
  "DRUG/NARCOTIC VIOLATIONS": "society", // 35A/35B
  "DRUG VIOLOATION": "society", // source typo variant of the above (3 rows)
  PROSTITUTION: "society", // 40A
  PORNOGRAPHY: "society", // 370
  "ANIMAL CRUELTY": "society", // 720
};
const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff2e63" },
  property: { label: "Crimes Against Property", color: "#ffc233" },
  society: { label: "Crimes Against Society", color: "#34e0e0" },
  other: { label: "Other (unused — every offense maps to a NIBRS category)", color: "#7486a0" },
};
const CAT_KEYS = ["persons", "property", "society", "other"]; // catIdx order

// Valid Baltimore coordinate box (source Latitude/Longitude are TEXT; blanks
// and out-of-city junk are rejected here). Polygon extent measured live:
// lat 39.197–39.372, lng −76.711–−76.530.
const BBOX = { latMin: 39.19, latMax: 39.38, lngMin: -76.72, lngMax: -76.52 };

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
    if (j.error) {
      if (attempt >= retries) throw new Error(`${label}: ArcGIS error ${JSON.stringify(j.error)}`);
      console.warn(`  ArcGIS error (${label}): ${j.error.message}; retry in ${retryWait}ms…`);
      await sleep(retryWait);
      continue;
    }
    return j;
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

// ---- month helpers (America/New_York local time) --------------------------
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
const MONTHS = monthRange("2022-01", "2026-06"); // 54
const MONTH_IDX = new Map(MONTHS.map((m, i) => [m, i]));

const dtfParts = new Intl.DateTimeFormat("en-CA", {
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
// UTC instant of local midnight on the 1st of a month (EST=UTC-5 / EDT=UTC-4;
// month boundaries never fall inside a DST transition, which happen at 2 AM
// on mid-month Sundays — asserted anyway).
function utcOfLocalMonthStart(ym) {
  const [y, m] = ym.split("-").map(Number);
  for (const off of [5, 4]) {
    const ms = Date.UTC(y, m - 1, 1, off);
    const { ymd, hour } = localYmdHour(ms);
    if (ymd === `${ym}-01` && hour === "00") return ms;
  }
  fail(`utcOfLocalMonthStart: no EST/EDT offset works for ${ym}`);
}
const nextYm = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const utcLiteral = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

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
// even-odd ray cast across ALL rings (outer + holes) of all parts
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
  console.log("── Baltimore official neighborhood polygons (2010 statistical areas)");
  const gj = await postJSON(
    `${NBHD}/query`,
    { f: "geojson", where: "1=1", outFields: "Name", geometryPrecision: "5" },
    { label: "neighborhoods geojson" },
  );
  assert(gj?.type === "FeatureCollection" && Array.isArray(gj.features), "NBHD: bad geojson");
  assert(gj.features.length === 278, `NBHD: expected 278 features, got ${gj.features.length}`);

  const beats = {};
  const joinFeatures = []; // { key, bbox, rings: [ring…] incl. holes } for the spatial join
  gj.features.forEach((f, idx) => {
    const raw = f.properties?.Name;
    assert(typeof raw === "string" && raw.trim().length > 0, `NBHD feature ${idx}: missing Name`);
    const key = raw.trim();
    assert(!beats[key], `NBHD: duplicate neighborhood '${key}'`);
    const g = f.geometry;
    const parts = g.type === "Polygon" ? [g.coordinates] : g.coordinates; // MultiPolygon
    const outerRings = parts.map((p) => p[0]);
    const allRings = parts.flat(); // outer rings AND holes → even-odd PIP
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
      name: key, // `Name` is already the resident-facing proper-case name
      servcen: "",
      beat: idx,
      centroid: [Number((X / A).toFixed(6)), Number((Y / A).toFixed(6))],
      polygon: outerRings,
      geomType: g.type,
    };
    joinFeatures.push({ key, bbox: { latMin, latMax, lngMin, lngMax }, rings: allRings });
  });
  const HOODS = new Set(Object.keys(beats));
  const UPPER2KEY = new Map([...HOODS].map((k) => [k.toUpperCase(), k]));
  assert(UPPER2KEY.size === HOODS.size, "polygon names not unique case-insensitively");
  console.log(`  ${HOODS.size} neighborhoods (e.g. ${[...HOODS].slice(0, 3).join(", ")})`);

  function placePoint(lng, lat) {
    for (const jf of joinFeatures) {
      const b = jf.bbox;
      if (lat < b.latMin || lat > b.latMax || lng < b.lngMin || lng > b.lngMax) continue;
      if (pointInRings(lng, lat, jf.rings)) return jf.key;
    }
    return null;
  }

  // ---- 2. Full raw pull of every victim row ---------------------------------
  console.log("── Full raw pull (victim-based rows; RowID order, 2000/page)");
  const FIELDS = "RowID,CCNumber,CrimeDateTime,Description,Neighborhood,Latitude,Longitude,Location";
  const rows = [];
  let offset = 0;
  for (;;) {
    const j = await postJSON(
      ARC,
      {
        f: "json",
        where: "1=1",
        outFields: FIELDS,
        orderByFields: "RowID",
        returnGeometry: "false",
        resultOffset: String(offset),
      },
      { label: `raw pull (offset ${offset})` },
    );
    const feats = j.features || [];
    for (const f of feats) rows.push(f.attributes);
    if (!j.exceededTransferLimit) break;
    offset += feats.length;
    if (feats.length === 0) fail("raw pull: exceededTransferLimit with 0 features");
    if (offset % 50000 < 2000) console.log(`  …${offset} rows`);
  }
  const serverGrand = await arcCount("1=1", "grand total (post-pull)");
  assert(
    rows.length === serverGrand,
    `raw pull ${rows.length} != server count ${serverGrand} (live feed moved mid-pull — rerun)`,
  );
  const serverDistinctCC = await arcCount("1=1", "grand distinct CCNumber", "CCNumber");
  console.log(`  ${rows.length} victim rows, ${serverDistinctCC} distinct CCNumbers (server)`);

  // ---- 3. Parse, window, dedupe by CCNumber ---------------------------------
  console.log("── Dedupe: victim rows → incidents (CCNumber; representative = lowest RowID)");
  const ccMap = new Map(); // cc → { rep, months:Set, descs:Set, nRows }
  let rowsInWindow = 0,
    rowsPartialTail = 0;
  const rowsByMonth = MONTHS.map(() => 0); // victim rows per local month (client tally)
  const anyRowCCByMonth = MONTHS.map(() => new Set()); // distinct CCs with ANY victim row in month
  for (const a of rows) {
    assert(a.CCNumber, `row ${a.RowID}: blank CCNumber`);
    assert(Number.isFinite(a.CrimeDateTime), `row ${a.RowID}: bad CrimeDateTime`);
    const ymd = localYmd(a.CrimeDateTime);
    assert(ymd >= SPAN_START, `row ${a.RowID}: local date ${ymd} before ${SPAN_START}`);
    if (ymd >= SPAN_END) {
      rowsPartialTail++;
      continue;
    }
    rowsInWindow++;
    const ym = ymd.slice(0, 7);
    const mi = MONTH_IDX.get(ym);
    assert(mi !== undefined, `row ${a.RowID}: month ${ym} outside span`);
    rowsByMonth[mi]++;
    anyRowCCByMonth[mi].add(a.CCNumber);
    const desc = String(a.Description ?? "").trim();
    assert(CAT_OF[desc], `row ${a.RowID}: unmapped Description '${a.Description}'`);
    let e = ccMap.get(a.CCNumber);
    if (!e) {
      e = { rep: a, repYmd: ymd, months: new Set(), descs: new Set(), nRows: 0 };
      ccMap.set(a.CCNumber, e);
    }
    e.nRows++;
    e.months.add(ym);
    e.descs.add(desc);
    if (a.RowID < e.rep.RowID) (e.rep = a), (e.repYmd = ymd);
  }
  const totalRecords = ccMap.size; // INCIDENTS in window
  let multiVictim = 0,
    multiDesc = 0,
    multiMonth = 0,
    extraMonthMemberships = 0;
  for (const e of ccMap.values()) {
    if (e.nRows > 1) multiVictim++;
    if (e.descs.size > 1) multiDesc++;
    if (e.months.size > 1) multiMonth++;
    extraMonthMemberships += e.months.size - 1;
  }
  // CCNumbers seen only in the partial tail (not in ccMap) — for the grand identity
  const allCC = new Set(rows.map((a) => a.CCNumber));
  const tailOnlyCC = allCC.size - totalRecords;
  assert(allCC.size === serverDistinctCC, `client distinct CC ${allCC.size} != server ${serverDistinctCC}`);
  console.log(
    `  ${rowsInWindow} in-window victim rows → ${totalRecords} incidents (×${(rowsInWindow / totalRecords).toFixed(3)});` +
      ` ${multiVictim} incidents have >1 victim row, ${multiDesc} carry >1 offense description,` +
      ` ${multiMonth} span >1 local month`,
  );
  console.log(
    `  excluded & disclosed: ${rowsPartialTail} partial-tail rows (local date ≥ ${SPAN_END}; ${tailOnlyCC} tail-only CCNumbers)`,
  );

  // ---- 4. Spatial join (uniform method) + in-data-name validation -----------
  console.log("── Spatial join: incident coords → official polygons (holes honored)");
  const cells = {};
  for (const k of HOODS)
    cells[k] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  const junkByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  const unplacedWhy = { "no-coordinates": 0, "out-of-bbox": 0, "outside-polygons": 0 };
  const nameCheck = { checked: 0, agree: 0, disagree: 0, nameNotInPolygons: 0, blank: 0 };
  const incidents = []; // { mi, cat, lng?, lat?, hood?, rep } for points/feed
  const inDataNameByYear = {}; // blank-vs-named tallies by local year (for PROVENANCE)
  for (const e of ccMap.values()) {
    const a = e.rep;
    const ym = e.repYmd.slice(0, 7);
    const mi = MONTH_IDX.get(ym);
    const cat = CAT_OF[String(a.Description ?? "").trim()];
    const lat = Number(a.Latitude),
      lng = Number(a.Longitude);
    const hasCoord =
      a.Latitude != null && a.Latitude !== "" && Number.isFinite(lat) && Number.isFinite(lng);
    let hood = null;
    if (!hasCoord) unplacedWhy["no-coordinates"]++;
    else if (lat < BBOX.latMin || lat > BBOX.latMax || lng < BBOX.lngMin || lng > BBOX.lngMax)
      unplacedWhy["out-of-bbox"]++;
    else {
      hood = placePoint(lng, lat);
      if (!hood) unplacedWhy["outside-polygons"]++;
    }
    if (hood) cells[hood][mi][cat]++;
    else junkByCatMonth[cat][mi]++;
    incidents.push({ mi, cat, hood, lat, lng, hasCoord, rep: a, ymd: e.repYmd });
    // validation against the in-data Neighborhood name (where present)
    const yr = e.repYmd.slice(0, 4);
    inDataNameByYear[yr] = inDataNameByYear[yr] || { named: 0, blank: 0 };
    const inName = String(a.Neighborhood ?? "").trim();
    if (!inName) {
      nameCheck.blank++;
      inDataNameByYear[yr].blank++;
    } else {
      inDataNameByYear[yr].named++;
      const mapped = UPPER2KEY.get(inName.toUpperCase());
      if (!mapped) nameCheck.nameNotInPolygons++;
      else if (hood) {
        nameCheck.checked++;
        if (hood === mapped) nameCheck.agree++;
        else nameCheck.disagree++;
      }
    }
  }
  const agreePct = Math.round((nameCheck.agree / nameCheck.checked) * 1000) / 10;
  assert(agreePct >= 90, `spatial join vs in-data name agreement ${agreePct}% < 90% — join broken?`);
  console.log(
    `  in-data-name validation: ${nameCheck.checked} placed incidents carry a matching official name → ` +
      `${agreePct}% agree (${nameCheck.disagree} boundary disagreements); ` +
      `${nameCheck.blank} blank names, ${nameCheck.nameNotInPolygons} names not in the official polygon set`,
  );
  console.log(
    `  unplaced: ${unplacedWhy["no-coordinates"]} no-coordinates, ${unplacedWhy["out-of-bbox"]} out-of-bbox, ` +
      `${unplacedWhy["outside-polygons"]} in-bbox but outside every polygon`,
  );

  // ---- 5. Citywide per-cat monthly (separate pass) + reconciliation ---------
  console.log("── Citywide monthly totals per category (independent client pass + server checks)");
  const cityByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  for (const inc of incidents) cityByCatMonth[inc.cat][inc.mi]++;
  for (const cat of CAT_KEYS) {
    for (let mi = 0; mi < MONTHS.length; mi++) {
      let placed = 0;
      for (const k of HOODS) placed += cells[k][mi][cat];
      const lhs = placed + junkByCatMonth[cat][mi];
      const rhs = cityByCatMonth[cat][mi];
      assert(lhs === rhs, `month ${MONTHS[mi]} cat ${cat}: placed+unplaced ${lhs} != citywide ${rhs}`);
    }
  }
  console.log(`  placed + unplaced == citywide for all ${MONTHS.length} months × 4 cats ✓`);

  // Server-side cross-checks per month (UTC instants of local month boundaries):
  //   (a) victim-row count  (b) distinct-CCNumber count
  console.log("── Server cross-checks: 54 months × (row count + distinct CCNumbers)");
  let serverAnyRowCCTotal = 0;
  for (let mi = 0; mi < MONTHS.length; mi++) {
    const w =
      `CrimeDateTime >= TIMESTAMP '${utcLiteral(utcOfLocalMonthStart(MONTHS[mi]))}'` +
      ` AND CrimeDateTime < TIMESTAMP '${utcLiteral(utcOfLocalMonthStart(nextYm(MONTHS[mi])))}'`;
    const nRows = await arcCount(w, `server rows ${MONTHS[mi]}`);
    assert(
      nRows === rowsByMonth[mi],
      `month ${MONTHS[mi]}: server victim rows ${nRows} != client ${rowsByMonth[mi]}`,
    );
    const nCC = await arcCount(w, `server distinct CC ${MONTHS[mi]}`, "CCNumber");
    assert(
      nCC === anyRowCCByMonth[mi].size,
      `month ${MONTHS[mi]}: server distinct CC ${nCC} != client ${anyRowCCByMonth[mi].size}`,
    );
    serverAnyRowCCTotal += nCC;
  }
  // month-membership identity: Σ per-month distinct CCs = incidents + extra memberships
  assert(
    serverAnyRowCCTotal === totalRecords + extraMonthMemberships,
    `Σ monthly distinct CC ${serverAnyRowCCTotal} != incidents ${totalRecords} + cross-month ${extraMonthMemberships}`,
  );
  console.log(
    `  all 54 months reconcile exactly (rows AND distinct CCNumbers); ` +
      `Σ monthly distinct CC ${serverAnyRowCCTotal} = ${totalRecords} incidents + ${extraMonthMemberships} cross-month memberships ✓`,
  );

  // ---- 6. Totals ------------------------------------------------------------
  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  for (const c of CAT_KEYS) catTotals[c] = cityByCatMonth[c].reduce((a, b) => a + b, 0);
  assert(
    CAT_KEYS.reduce((s, c) => s + catTotals[c], 0) === totalRecords,
    "catTotals do not sum to totalRecords",
  );
  let placedRecords = 0;
  for (const k of HOODS)
    for (const cc of cells[k]) placedRecords += cc.persons + cc.property + cc.society + cc.other;
  const unplacedRecords = Object.values(unplacedWhy).reduce((a, b) => a + b, 0);
  assert(placedRecords + unplacedRecords === totalRecords, "placed+unplaced != total");
  const coveragePct = Math.round((placedRecords / totalRecords) * 1000) / 10;
  console.log(
    `  total ${totalRecords} incidents = placed ${placedRecords} + unplaced ${unplacedRecords} → coverage ${coveragePct}%`,
  );

  // victim-row cat totals (context for the dedupe disclosure)
  const victimCatTotals = { persons: 0, property: 0, society: 0, other: 0 };
  for (const a of rows) {
    const ymd = localYmd(a.CrimeDateTime);
    if (ymd >= SPAN_END) continue;
    victimCatTotals[CAT_OF[String(a.Description ?? "").trim()]]++;
  }
  // Description enumeration on incidents (for the PROVENANCE mapping table)
  const descCounts = new Map();
  for (const inc of incidents) {
    const d = String(inc.rep.Description).trim();
    descCounts.set(d, (descCounts.get(d) || 0) + 1);
  }

  // ---- 7. Sampled REAL points -----------------------------------------------
  console.log("── Real incident points (BPD-published coords; deterministic sample)");
  const byMonth = MONTHS.map(() => []);
  for (const inc of incidents) {
    if (!inc.hasCoord) continue;
    if (inc.lat < BBOX.latMin || inc.lat > BBOX.latMax || inc.lng < BBOX.lngMin || inc.lng > BBOX.lngMax)
      continue;
    byMonth[inc.mi].push({
      rowid: inc.rep.RowID,
      p: [Number(inc.lng.toFixed(6)), Number(inc.lat.toFixed(6)), CAT_KEYS.indexOf(inc.cat)],
    });
  }
  const placeableCount = byMonth.reduce((s, a) => s + a.length, 0);
  const pts = byMonth.map((arr) => {
    arr.sort((a, b) => a.rowid - b.rowid); // deterministic RowID order
    if (arr.length <= 100) return arr.map((x) => x.p);
    const out = [];
    for (let i = 0; i < 100; i++) out.push(arr[Math.floor((i * arr.length) / 100)].p);
    return out;
  });
  const ptsKept = pts.reduce((s, a) => s + a.length, 0);
  const sampleRate = Math.round(placeableCount / ptsKept);
  console.log(`  kept ${ptsKept} of ${placeableCount} placeable incidents → 1 per ~${sampleRate}`);

  // ---- 8. Dispatch feed ------------------------------------------------------
  // 17 real incidents per quarter (2022-Q1 … 2026-Q2 = 18 quarters → 306 items),
  // slots allocated across categories in proportion to the quarter's REAL
  // citywide incident mix (largest-remainder, deterministic), items taken in
  // RowID order from placed incidents. No seriousness bias.
  console.log("── Feed: 17 real incidents per quarter (category-proportional), 2022-Q1 … 2026-Q2");
  const placedByCatQuarter = new Map(); // `q|cat` → sorted incidents
  for (const inc of incidents) {
    if (!inc.hood) continue;
    const q = `${inc.ymd.slice(0, 4)}-Q${Math.floor((Number(inc.ymd.slice(5, 7)) - 1) / 3) + 1}`;
    const key = `${q}|${inc.cat}`;
    if (!placedByCatQuarter.has(key)) placedByCatQuarter.set(key, []);
    placedByCatQuarter.get(key).push(inc);
  }
  for (const arr of placedByCatQuarter.values()) arr.sort((a, b) => a.rep.RowID - b.rep.RowID);
  const feed = [];
  for (let y = 2022; y <= 2026; y++) {
    for (let q = 0; q < 4; q++) {
      const qYm = `${y}-${String(q * 3 + 1).padStart(2, "0")}`;
      if (!MONTH_IDX.has(qYm)) continue;
      const qMonths = [0, 1, 2]
        .map((k) => MONTH_IDX.get(`${y}-${String(q * 3 + 1 + k).padStart(2, "0")}`))
        .filter((mi) => mi !== undefined);
      const catN = CAT_KEYS.map((c) => qMonths.reduce((s, mi) => s + cityByCatMonth[c][mi], 0));
      const catTot = catN.reduce((a, b) => a + b, 0);
      assert(catTot > 0, `feed ${y}Q${q + 1}: empty quarter`);
      const exact = catN.map((n) => (n / catTot) * 17);
      const alloc = exact.map(Math.floor);
      let rem = 17 - alloc.reduce((a, b) => a + b, 0);
      exact
        .map((e, i) => [e - alloc[i], i])
        .sort((a, b) => b[0] - a[0])
        .slice(0, rem)
        .forEach(([, i]) => alloc[i]++);
      for (let ci = 0; ci < CAT_KEYS.length; ci++) {
        if (alloc[ci] === 0) continue;
        const pool = placedByCatQuarter.get(`${y}-Q${q + 1}|${CAT_KEYS[ci]}`) || [];
        assert(pool.length >= alloc[ci], `feed ${y}Q${q + 1} ${CAT_KEYS[ci]}: pool ${pool.length} < ${alloc[ci]}`);
        for (const inc of pool.slice(0, alloc[ci])) {
          feed.push({
            date: inc.ymd,
            title: String(inc.rep.Description).trim(),
            place: String(inc.rep.Location ?? "").trim() || inc.hood,
            beat: inc.hood,
            cat: inc.cat,
          });
        }
      }
    }
  }
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`  ${feed.length} feed items (chronological, no seriousness bias)`);

  // ---- 9. FBI UCR history 1985–2020 -----------------------------------------
  console.log(
    `── FBI CDE history (${ORI}, 1985–2021 fetched; key=${FBI_KEY === "DEMO_KEY" ? "DEMO_KEY" : "provided"})`,
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
      if (!actuals) throw new Error(`FBI ${offense}: no actuals in response (empty series for ${ori}?)`);
      // ⚠ CDE returns BOTH "… Offenses" and "… Clearances" agency series —
      // match Offenses EXPLICITLY (the buffalo-build trap).
      const agKey = Object.keys(actuals).find(
        (k) => /Offenses/.test(k) && !/United States/i.test(k) && !/Clearances/i.test(k),
      );
      if (!agKey)
        throw new Error(`FBI ${offense}: no agency Offenses series (keys: ${Object.keys(actuals)})`);
      assert(/Baltimore/i.test(agKey), `FBI ${offense}: agency key '${agKey}' is not Baltimore`);
      const monthly = actuals[agKey] || {};
      if (Object.keys(monthly).length === 0)
        throw new Error(
          `FBI ${offense}: empty series for ORI ${ori} — verify via ` +
            `https://api.usa.gov/crime/fbi/cde/agency/byStateAbbr/MD (grep Baltimore)`,
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
  // 1985 plausibility gate (the Offenses-vs-Clearances trap check): Baltimore
  // 1985 must be big-city scale — violent >5,000 and property >20,000.
  assert(
    violent.byYear[1985] > 5000 && property.byYear[1985] > 20000,
    `FBI 1985 totals implausible (violent ${violent.byYear[1985]}, property ${property.byYear[1985]}) — wrong series?`,
  );
  const droppedYears = [];
  const complete = [];
  for (let y = 1985; y <= 2021; y++) {
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
  // keep the longest contiguous run of complete years (ties → later)
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
    console.warn(`  complete-but-noncontiguous segments dropped: ${droppedSegments.join(", ")}`);
  const yearMin = years[0].year,
    yearMax = years[years.length - 1].year;
  years.forEach((yr, i) => {
    assert(yr.year === yearMin + i, `FBI history: gap at ${yearMin + i} inside kept segment`);
  });
  console.log(`  kept ${years.length} complete years ${yearMin}–${yearMax} (12 months each verified)`);

  // ---- Assemble output files -------------------------------------------------
  const methodFootnote =
    "Victim-based source: BPD publishes one row per victim; rows are deduplicated to incidents by CCNumber " +
    `(${rowsInWindow.toLocaleString("en-US")} victim rows → ${totalRecords.toLocaleString("en-US")} incidents). ` +
    "Neighborhoods assigned by point-in-polygon of BPD-published coordinates into the official city polygons.";
  const timeline = { months: MONTHS, cells };
  const beatsFile = { cats: CATS, beats };
  const summary = {
    slug: "baltimore-md",
    title: "Baltimore · MD",
    source: { records: ARC_LAYER, beats: NBHD, hub: HUB },
    fetchedAt,
    dateMin: "2022-01-01",
    dateMax: "2026-06-30",
    months: MONTHS.length,
    totalRecords,
    victimRows: rowsInWindow,
    methodFootnote,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: unplacedWhy,
    catTotals,
    cats: CATS,
    beatCount: Object.keys(beats).length,
  };
  const history = {
    era: "history",
    taxonomy:
      "FBI UCR Summary (Violent + Property) — a different taxonomy than the BPD NIBRS categories used from 2022; the eras bridge at 2022 (2021 is a disclosed gap year) and are never equated",
    agency: AGENCY,
    ori: ORI,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      `Annual totals are real UCR Summary counts fetched from the FBI CDE summarized agency endpoint for ORI ${ORI} ` +
      `(12 reported months verified per year; the scouted ORI MD3010100 returns an empty series and MDBPD0000 was ` +
      `verified via the CDE agency roster). UCR Summary (Violent/Property) and BPD NIBRS are different taxonomies ` +
      `presented as distinct eras. 2021 has only 7 reported months in the FBI series (BPD's NIBRS transition) — no ` +
      `honest annual total exists, so the history era ends at ${yearMax} and the granular era begins 2022-01; 2021 is a ` +
      `disclosed gap year. Reproduce with pipeline/sources/baltimore-md.mjs.` +
      (droppedYears.length
        ? ` Dropped partial years (<12 reported months): ${droppedYears
            .map((d) => `${d.year} (violent ${d.violentMonths}/12, property ${d.propertyMonths}/12)`)
            .join(", ")}.`
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
    source: "Baltimore official Neighborhoods (2010 statistical areas, City of Baltimore)",
    sourceUrl: `${NBHD}/query?where=1=1&outFields=Name&f=geojson`,
    hub: NBHD_ITEM,
    fetchedAt,
    license: "Not stated on the item — attributed to City of Baltimore (public open-data portal)",
    method:
      "point-in-polygon — each deduplicated incident is placed by ray-casting the BPD-published coordinates " +
      "into the official neighborhood polygons (holes honored). The in-data `Neighborhood` field is ~98.5% blank " +
      `in 2022, so it cannot serve as the join key; where it IS present and matches an official polygon name, the ` +
      `spatial join agrees with it ${agreePct}% of the time (${nameCheck.agree.toLocaleString("en-US")} of ${nameCheck.checked.toLocaleString("en-US")}; boundary geocoding differences account for the rest).`,
    map: Object.fromEntries(Object.keys(beats).map((k) => [k, { name: k, approx: false }])),
  };
  const points = {
    mode: "real-sample",
    note:
      "Every dot is a real reported incident location as published by BPD (Latitude/Longitude fields, address-level). " +
      "Victim rows are deduplicated to incidents by CCNumber before sampling. " +
      `${(totalRecords - placeableCount).toLocaleString("en-US")} incidents (~${Math.round(((totalRecords - placeableCount) / totalRecords) * 1000) / 10}%) have no usable coordinates and are counted but not plotted. ` +
      "Deterministic even-stride sample (≤100/month) in RowID order.",
    sampleRate,
    months: MONTHS,
    pts,
  };

  // ---- VALIDATE (fail loudly) -------------------------------------------------
  console.log("── Validation");
  assert(
    MONTHS.length === 54 && MONTHS[0] === "2022-01" && MONTHS[53] === "2026-06",
    "months not contiguous 2022-01..2026-06",
  );
  for (let i = 1; i < MONTHS.length; i++) {
    const [py, pm] = MONTHS[i - 1].split("-").map(Number);
    const [cy, cm] = MONTHS[i].split("-").map(Number);
    assert(
      (cm === pm + 1 && cy === py) || (cm === 1 && pm === 12 && cy === py + 1),
      `months not contiguous at ${MONTHS[i]}`,
    );
  }
  assert(Object.keys(beats).length === 278, "beatCount != 278");
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
  assert(catTotals.other === 0, "other should be 0 — every Description maps to a NIBRS category");
  assert(history.years.length === yearMax - yearMin + 1, "history years not contiguous");
  for (const f of feed) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(f.date), `feed bad date ${f.date}`);
    assert(f.date >= SPAN_START && f.date <= "2026-06-30", `feed date out of span ${f.date}`);
    assert(HOODS.has(f.beat), `feed beat '${f.beat}' not an official neighborhood`);
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
    victimCatTotals,
    descCounts,
    rowsInWindow,
    rowsPartialTail,
    tailOnlyCC,
    serverGrand,
    multiVictim,
    multiDesc,
    multiMonth,
    extraMonthMemberships,
    nameCheck,
    agreePct,
    unplacedWhy,
    inDataNameByYear,
  });
  appendWiki({ summary, history, agreePct });

  console.log("\n── Final summary.json");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nVALIDATION PASS");
}

// ---- PROVENANCE.md -----------------------------------------------------------
function writeProvenance(x) {
  const fmt = (n) => n.toLocaleString("en-US");
  const catOfDesc = (d) => CAT_OF[d];
  const mapRows = [...x.descCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([d, n]) => `| ${d} | \`${catOfDesc(d)}\` | ${fmt(n)} |`)
    .join("\n");
  const yearRows = Object.entries(x.inDataNameByYear)
    .sort()
    .map(
      ([y, v]) =>
        `| ${y} | ${fmt(v.named)} | ${fmt(v.blank)} (${Math.round((v.blank / (v.named + v.blank)) * 1000) / 10}%) |`,
    )
    .join("\n");
  const md = `# Provenance — Baltimore, MD

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **NIBRS Group A Crime Data** (Open Baltimore hosted ArcGIS layer) |
| Publisher | Baltimore Police Department, via Open Baltimore |
| Landing page | ${HUB_ITEM} (portal: ${HUB}) |
| API | ${ARC_LAYER} |
| Fetched | ${x.fetchedAt} |
| License | **Not stated on the item** — attributed to "Baltimore City Police Department via Open Baltimore" |
| Rows in layer | ${fmt(x.serverGrand)} victim-based rows (live feed, 2022-01-01 → present) |
| Records used | **${fmt(x.summary.totalRecords)} incidents** (deduplicated; local dates 2022-01-01 → 2026-06-30) |
| Source caveat | Live feed refreshed continuously; classifications and counts can change as investigations proceed. The legacy "Part 1 Crime Data" layer is frozen (last data 2023-02) and is **not** used. |

### ⚠ Victim-based rows → incident dedupe (the headline disclosure)
BPD publishes **one row per victim** (\`Total_Incidents\` is always 1 per row). All counts shown are **incidents**, obtained by deduplicating on \`CCNumber\` (the BPD central-complaint number):

- ${fmt(x.rowsInWindow)} in-window victim rows → **${fmt(x.summary.totalRecords)} incidents** (×${(x.rowsInWindow / x.summary.totalRecords).toFixed(3)} inflation removed)
- ${fmt(x.multiVictim)} incidents (${Math.round((x.multiVictim / x.summary.totalRecords) * 1000) / 10}%) have more than one victim row
- Representative row per incident = **lowest RowID** (deterministic, no severity weighting). Consequences, both measured and disclosed: ${fmt(x.multiDesc)} incidents (${Math.round((x.multiDesc / x.summary.totalRecords) * 1000) / 10}%) carry more than one offense description across their victim rows (the representative's description decides the category), and ${fmt(x.multiMonth)} incidents have victim rows in more than one local month (the representative's date decides the month).
- Victim-row vs incident category totals (context): persons ${fmt(x.victimCatTotals.persons)} → ${fmt(x.catTotals.persons)}, property ${fmt(x.victimCatTotals.property)} → ${fmt(x.catTotals.property)}, society ${fmt(x.victimCatTotals.society)} → ${fmt(x.catTotals.society)}. Persons crimes shrink the most under dedupe — multi-victim incidents are naturally concentrated there.

### Timestamps & windowing (disclosed)
\`CrimeDateTime\` is a true UTC instant of the local event time (verified: dataset min = 2022-01-01 05:00Z = local EST midnight; the UTC hour-of-day low sits at 10Z = 5–6 AM local). **All month binning uses America/New_York local time.** Excluded and disclosed: **${fmt(x.rowsPartialTail)}** rows with local dates in the partial month 2026-07 (${fmt(x.tailOnlyCC)} tail-only CCNumbers). No rows predate 2022-01-01 local (asserted).

### Fields used
\`RowID\` · \`CCNumber\` · \`CrimeDateTime\` · \`Description\` · \`Neighborhood\` (validation only — see below) · \`Latitude\`/\`Longitude\` (TEXT, address-level) · \`Location\` (block address).

### Category mapping (Description → cat) — exhaustive, incident counts
The layer has no native crimes-against field; \`Description\` (28 distinct values, enumerated live) is mapped to the **official NIBRS crimes-against** assignment of the corresponding Group A offense. Note NIBRS places robbery, arson, vandalism, fraud and extortion under **property**; intimidation and human trafficking under **persons**. "DRUG VIOLOATION" is a source typo variant of "DRUG/NARCOTIC VIOLATIONS" (mapped identically). Every value maps to persons/property/society — the \`other\` bucket is **0** for Baltimore.

| Description (verbatim) | cat | incidents |
|---|---|--:|
${mapRows}

### Neighborhood placement — spatial join (disclosed method choice)
The in-data \`Neighborhood\` field is **~98.5% blank throughout 2022** and nearly complete from 2023 (incident-level, by representative row):

| Year | named | blank |
|---|--:|--:|
${yearRows}

An identity join on that field would erase 2022 from the map and put a method seam exactly where the story compares 2022→2025. Instead **every incident is placed the same way**: point-in-polygon (even-odd, holes honored) of the BPD-published coordinates into the 278 official neighborhood polygons.

Validation against the in-data name where one exists and matches an official polygon name: **${x.agreePct}% agreement** (${fmt(x.nameCheck.agree)} of ${fmt(x.nameCheck.checked)} placed incidents; ${fmt(x.nameCheck.disagree)} boundary disagreements — BPD's own assignment vs point-in-polygon differ along shared edges). ${fmt(x.nameCheck.nameNotInPolygons)} incidents carry BPD area names that are not in the official 2010 polygon set (e.g. HARBOR EAST, BALTIMORE PENINSULA) — their coordinates still place them in an official polygon.

### Coverage
- Placed (one of the 278 official neighborhoods): **${fmt(x.summary.placedRecords)}** (${x.summary.coveragePct}%)
- Unplaced ${fmt(x.summary.unplacedRecords)} = ${fmt(x.unplacedWhy["no-coordinates"])} no-coordinates + ${fmt(x.unplacedWhy["out-of-bbox"])} out-of-city-bbox + ${fmt(x.unplacedWhy["outside-polygons"])} in-bbox but outside every polygon (piers, harbor water, edge artifacts) — all counted in every total, never hidden.
- Identity \`placed + unplaced == citywide\` validated per month × category in-script.

### Independent server reconciliation (all 54 months)
For every local month, the exact UTC boundary instants were queried back against the source: server victim-row counts **and** server distinct-\`CCNumber\` counts both match the client tallies exactly, and Σ monthly distinct CCNumbers = ${fmt(x.summary.totalRecords)} incidents + ${fmt(x.extraMonthMemberships)} cross-month memberships (incidents whose victim rows straddle a month boundary) — the identity is asserted, not assumed.

## Geometry source — official neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **Neighborhoods** (2010 neighborhood statistical areas) — 278 polygons, field \`Name\` |
| FeatureServer | ${NBHD} |
| Item | ${NBHD_ITEM} |
| License | Not stated — attributed to City of Baltimore |
| Join method | point-in-polygon of incident coordinates (see above) — **not** a name join |
| Centroids | Area-weighted centroid across outer rings (shoelace formula) — for symbol placement only |
| Geometry precision | 5 decimals (~1 m) as served by \`geometryPrecision=5\` |

## Real incident points (\`points.json\`)

Dots are **real incident locations published by BPD** (\`Latitude\`/\`Longitude\`, address-level strings, one per deduplicated incident's representative row). ${fmt(x.summary.totalRecords - x.placeableCount)} incidents (~${Math.round(((x.summary.totalRecords - x.placeableCount) / x.summary.totalRecords) * 1000) / 10}%) have blank or out-of-city coordinates — counted in every total, absent only from the dot layer. Client-side gate: lat ${BBOX.latMin}–${BBOX.latMax}, lng ${BBOX.lngMin}–${BBOX.lngMax}. Deterministic sample: per month, incidents in RowID order, even-stride ≤100/month → **${fmt(x.ptsKept)} points ≈ 1 per ${x.sampleRate} of the ${fmt(x.placeableCount)} placeable incidents**.

## Historical source — FBI UCR (${x.history.yearMin}–${x.history.yearMax} deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Baltimore Police Department — **ORI \`${ORI}\`** |
| Endpoint | ${x.history.sourceUrl} (and \`/property-crime\`) |
| Span | ${x.history.yearMin}–${x.history.yearMax}, annual Violent + Property (12 reported months verified per year) |
| Auth | api.data.gov key (read from \`.secrets/fbi_api_key\`; \`FBI_API_KEY\` env overrides) |
| Raw responses | cached under \`data/baltimore-md/raw/\` |

**ORI correction (disclosed):** the scouted ORI MD3010100 returns an *empty* series on the CDE; the agency roster (\`agency/byStateAbbr/MD\`) identifies Baltimore Police Department as **MDBPD0000**, whose series was used and sanity-checked (1985 violent = 15,498 — big-city scale, and the \`… Offenses\` series is matched explicitly so the \`… Clearances\` series can never be picked up by accident).
${x.droppedYears.length ? `
**Dropped partial years (disclosed):** ${x.droppedYears.map((d) => `**${d.year}** (violent ${d.violentMonths}/12, property ${d.propertyMonths}/12 reported months)`).join(", ")} — an annual total cannot honestly be built from fewer than 12 reported months. 2021 is BPD's NIBRS-transition year; it is presented as a **gap year** between the eras, never interpolated.` : ""}${x.droppedSegments.length ? `
**Dropped complete-but-noncontiguous segments (disclosed):** ${x.droppedSegments.join(", ")}.` : ""}

UCR Summary (Violent/Property) is a **different taxonomy** than BPD NIBRS categories — the eras are presented as distinct and bridge at 2022 across the disclosed 2021 gap; they are never equated. No monthly or neighborhood detail is implied for ${x.history.yearMin}–${x.history.yearMax}.

## Reproduce

\`\`\`bash
node pipeline/sources/baltimore-md.mjs   # reads .secrets/fbi_api_key; FBI_API_KEY env overrides
\`\`\`
`;
  writeFileSync(PROV_PATH, md);
  console.log(`  wrote data/baltimore-md/PROVENANCE.md`);
}

// ---- wiki/Data-Provenance.md append -------------------------------------------
function appendWiki({ summary, history, agreePct }) {
  if (!existsSync(WIKI_PATH)) return;
  const cur = readFileSync(WIKI_PATH, "utf8");
  if (cur.includes("## Baltimore, MD")) {
    console.log("  wiki/Data-Provenance.md already has a Baltimore section — skipped");
    return;
  }
  const fmt = (n) => n.toLocaleString("en-US");
  const section = `
## Baltimore, MD (\`baltimore-md\`)

- **Primary source:** NIBRS Group A Crime Data — live BPD feed, 2022-01-01+
  (ArcGIS \`NIBRS_GroupA_Crime_Data/FeatureServer/0\`, ${HUB_ITEM}).
  License not stated — attributed "Baltimore City Police Department via Open
  Baltimore". The legacy Part 1 layer (frozen 2023-02) is **not** used.
- **⚠ Victim-based rows, deduplicated to incidents:** BPD publishes one row per
  victim; every count shown is incidents deduped by \`CCNumber\`
  (${fmt(summary.victimRows)} victim rows → ${fmt(summary.totalRecords)} incidents, ×${(summary.victimRows / summary.totalRecords).toFixed(2)}).
  Representative row = lowest RowID (deterministic); multi-description and
  cross-month incidents measured and disclosed in PROVENANCE.
- **Spatial unit:** the 278 official **2010 neighborhood statistical areas**.
  The in-data \`Neighborhood\` field is ~98.5% blank in 2022, so every incident
  is placed by **point-in-polygon of BPD's own coordinates** (uniform method,
  holes honored); where the in-data name exists it agrees ${agreePct}% —
  published as validation, not used as the join.
- **Timestamps:** \`CrimeDateTime\` is a true UTC instant; months are binned in
  **America/New_York local time**, and all 54 months are reconciled against
  server-side row counts AND distinct-CCNumber counts at exact UTC boundaries.
- **Deep-history source (${history.yearMin}–${history.yearMax}):** FBI Crime Data Explorer (CDE) —
  Baltimore PD, **ORI ${ORI}** (the scouted MD3010100 is empty — corrected via
  the CDE agency roster) — real annual Violent + Property counts, ${history.years.length} full
  years (12 reported months each, verified; the \`… Offenses\` series matched
  explicitly, never \`… Clearances\`). **2021 = disclosed gap year** (7/12
  months, NIBRS transition) — the eras bridge 2020 → 2022.
- **Span:** ${history.yearMin}–${history.yearMax} (FBI UCR annual) + 2022-01-01 → 2026-06-30 (BPD NIBRS
  incidents, ${summary.months} months; partial 2026-07 dropped and disclosed).
- **Records:** ${fmt(summary.totalRecords)} incidents · ${fmt(summary.placedRecords)} placed in an official
  neighborhood (**${summary.coveragePct}% coverage**) · ${fmt(summary.unplacedRecords)} unplaced
  (no/bad coordinates or outside every polygon), kept in totals and disclosed.
- **Real dots:** BPD publishes address-level \`Latitude\`/\`Longitude\` per row —
  dots are a deterministic even-stride ≤100/month sample of **real** deduped
  incident locations; unlocatable incidents are counted but not plotted.
- **License:** not stated by the source — attribution "Baltimore City Police
  Department"; polygons City of Baltimore.
- **Detail:** [\`data/baltimore-md/PROVENANCE.md\`](../data/baltimore-md/PROVENANCE.md)

### Category mapping (Description → cat, official NIBRS crimes-against)

| Source values | cat |
|--------------|-----|
| COMMON ASSAULT · AGG. ASSAULT · HOMICIDE · RAPE · SEX OFFENSES · INTIMIDATION · KIDNAPPING · HUMAN TRAFFICKING | \`persons\` |
| VANDALISM · AUTO THEFT · LARCENY (all variants) · SHOPLIFTING · BURGLARY · ROBBERY (all variants) · FRAUD · ARSON · STOLEN PROPERTY · EXTORTION | \`property\` |
| WEAPON VIOLATIONS · DRUG/NARCOTIC VIOLATIONS (+ "DRUG VIOLOATION" typo) · PROSTITUTION · PORNOGRAPHY · ANIMAL CRUELTY | \`society\` |
| — | \`other\` (empty for Baltimore — every offense maps to a NIBRS category) |
`;
  const marker = "## Ranked source types";
  const idx = cur.indexOf(marker);
  const next =
    idx >= 0 ? cur.slice(0, idx) + section.trimStart() + "\n" + cur.slice(idx) : cur + section;
  writeFileSync(WIKI_PATH, next);
  console.log("  appended Baltimore section to wiki/Data-Provenance.md");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
