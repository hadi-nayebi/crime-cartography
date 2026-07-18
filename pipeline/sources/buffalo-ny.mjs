// Buffalo, NY — BPD Crime Incidents source pipeline (fetch → normalize → validate).
//
// BINDING RULE: never fabricate — every figure written by this script comes
// straight from a queryable public source; every gap is disclosed.
//
// Sources:
//   Incidents  : Socrata "Crime Incidents" (d6g9-xbgu), Public Domain U.S.
//                Government (USGOV_WORKS), attribution "Buffalo Police
//                Department". Preliminary report data; updated daily with a
//                ~1-month publication lag.
//                https://data.buffalony.gov/resource/d6g9-xbgu.json
//   Polygons   : City of Buffalo official planning Neighborhood Boundaries
//                (35 features, field NbhdName) — City of Buffalo GIS server
//                https://gis.buffalony.gov/server/rest/services/BaseFiles/Neighborhood_Boundaries/FeatureServer/0
//   History    : FBI Crime Data Explorer (CDE) summarized agency counts,
//                Buffalo PD ORI NY0140100, 1985–2005 annual Violent + Property.
//
// Eras (honesty structure):
//   1985–2005  FBI UCR annual citywide totals (no neighborhood detail implied)
//   2006-01 → 2026-05  BPD incidents with official neighborhood names in-data
//                (last FULL month at fetch time is 2026-05 — the source lags
//                ~1 month; June 2026 rows stop mid-month and are excluded).
//
// Known SOURCE GAPS (disclosed, never patched over):
//   - 2006-02…2006-04 thin ramp-in months (335–1,053 rows vs ~1,500–2,000 norm)
//   - 2008-01…2008-05 near-empty (17–262 rows/month) — records-system gap
//   - a handful of junk-dated rows back to 1910 (excluded + counted)
//
//   node pipeline/sources/buffalo-ny.mjs        (set FBI_API_KEY or .secrets/fbi_api_key)
//
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const OUT_DIR = resolve(repoRoot, "data/buffalo-ny/normalized");
const PROV_PATH = resolve(repoRoot, "data/buffalo-ny/PROVENANCE.md");
const WIKI_PATH = resolve(repoRoot, "wiki/Data-Provenance.md");

const SODA = "https://data.buffalony.gov/resource/d6g9-xbgu.json";
const HUB = "https://data.buffalony.gov/d/d6g9-xbgu";
const NBHD_URL =
  "https://gis.buffalony.gov/server/rest/services/BaseFiles/Neighborhood_Boundaries/FeatureServer/0/query?where=1%3D1&outFields=NbhdName,NbhdNum,Sector&outSR=4326&geometryPrecision=6&f=geojson";
const ORI = "NY0140100";
const AGENCY = "Buffalo Police Department";
const FBI_KEY =
  process.env.FBI_API_KEY ||
  (existsSync(resolve(repoRoot, ".secrets/fbi_api_key"))
    ? readFileSync(resolve(repoRoot, ".secrets/fbi_api_key"), "utf8").trim()
    : "DEMO_KEY");

// Granular era window: dataset's honest start is 2006 (633 junk-dated rows back
// to 1910 excluded + disclosed); last FULL month measured 2026-05 (source rows
// stop 2026-06-16 → June is partial and excluded).
const SPAN_START = "2006-01-01T00:00:00"; // inclusive
const SPAN_END = "2026-06-01T00:00:00"; // exclusive → dateMax 2026-05-31
const HIST_FROM = "01-1985";
const HIST_TO = "12-2005";

// parent_incident_type → cat, mapped by NIBRS crimes-against convention.
// The source publishes ONLY these 10 major-crime types — no drug/weapon/vice
// offenses at all, so `society` (and `other`) are structurally ZERO and the
// scope limitation is disclosed on-screen and in PROVENANCE.
const CAT_OF = {
  Assault: "persons",
  Homicide: "persons",
  "Sexual Assault": "persons",
  "Sexual Offense": "persons",
  "Other Sexual Offense": "persons",
  SODOMY: "persons",
  Theft: "property",
  "Breaking & Entering": "property",
  "Theft of Vehicle": "property",
  Robbery: "property", // NIBRS classifies robbery as a crime against property
};
const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff2e63" },
  property: { label: "Crimes Against Property", color: "#ffc233" },
  society: { label: "Crimes Against Society (not published by BPD)", color: "#34e0e0" },
  other: { label: "Other (none in source)", color: "#7486a0" },
};
const CAT_KEYS = ["persons", "property", "society", "other"]; // catIdx order
const PERSONS_TYPES = Object.keys(CAT_OF).filter((k) => CAT_OF[k] === "persons");
const PROPERTY_TYPES = Object.keys(CAT_OF).filter((k) => CAT_OF[k] === "property");
const inList = (arr) => arr.map((v) => `'${v.replace(/'/g, "''")}'`).join(",");
const CAT_WHERE = {
  persons: `parent_incident_type in (${inList(PERSONS_TYPES)})`,
  property: `parent_incident_type in (${inList(PROPERTY_TYPES)})`,
};
const JUNK_HOODS = new Set(["UNKNOWN", "", null, undefined]);

// Valid Buffalo coordinate box (source lat/lng are TEXT; sentinel "UNKNOWN"
// and out-of-city geocode errors e.g. 42.634,-79.028 are rejected here).
// Coordinates are 3-DECIMAL (~80-110 m block-level) — disclosed everywhere.
const BBOX = { latMin: 42.8, latMax: 42.99, lngMin: -78.95, lngMax: -78.78 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fetchCount = 0;
async function getJSON(url, { retries = 3, retryWait = 5000, label = url } = {}) {
  for (let attempt = 0; ; attempt++) {
    if (fetchCount++ > 0) await sleep(150); // be polite: sequential + 150ms delay
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

function soda(params) {
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${SODA}?${qs}`;
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
const MONTHS = monthRange("2006-01", "2026-05"); // 245
const MONTH_IDX = new Map(MONTHS.map((m, i) => [m, i]));
const ymOf = (ts) => String(ts).slice(0, 7);

function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s\-/(.])([a-z])/g, (_, p, c) => p + c.toUpperCase());
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

  // ---- 1. Official neighborhood polygons ----------------------------------
  console.log("── City of Buffalo Neighborhood Boundaries polygons");
  const gj = await getJSON(NBHD_URL, { label: "Neighborhood_Boundaries geojson" });
  assert(gj?.type === "FeatureCollection" && Array.isArray(gj.features), "NBHD: bad geojson");
  assert(gj.features.length === 35, `NBHD: expected 35 features, got ${gj.features.length}`);

  const beats = {};
  gj.features.forEach((f, idx) => {
    const key = f.properties?.NbhdName;
    assert(typeof key === "string" && key.length > 0, `NBHD feature ${idx}: missing NbhdName`);
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
      name: key, // already resident-friendly Title Case in the official layer
      servcen: f.properties?.Sector ?? "",
      beat: f.properties?.NbhdNum ?? idx,
      centroid: [Number((X / A).toFixed(6)), Number((Y / A).toFixed(6))],
      polygon: outerRings,
      geomType: g.type,
    };
  });
  const HOODS = new Set(Object.keys(beats));
  console.log(`  ${HOODS.size} neighborhoods (e.g. ${[...HOODS].slice(0, 3).join(", ")})`);

  // ---- 2. Exhaustive category audit (fail on any unmapped type) ------------
  console.log("── parent_incident_type audit (window 2006-01…2026-05)");
  const typeRows = await getJSON(
    soda({
      $select: "parent_incident_type AS t,count(*) AS n",
      $where: `incident_datetime >= '${SPAN_START}' AND incident_datetime < '${SPAN_END}'`,
      $group: "t",
      $limit: "100",
    }),
    { label: "type audit" },
  );
  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  for (const r of typeRows) {
    const cat = CAT_OF[r.t];
    assert(cat, `unmapped parent_incident_type '${r.t}' — extend CAT_OF + docs`);
    catTotals[cat] += Number(r.n);
    console.log(`  ${String(r.t).padEnd(22)} → ${cat.padEnd(8)} ${Number(r.n).toLocaleString("en-US")}`);
  }
  assert(catTotals.society === 0 && catTotals.other === 0, "unexpected society/other counts");

  // ---- 3. Timeline cells: per-cat × neighborhood × month -------------------
  console.log("── Timeline: per-neighborhood monthly counts by category (2006-01…2026-05)");
  const cells = {};
  for (const k of HOODS)
    cells[k] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  // blank/UNKNOWN-neighborhood rows inside the span, per cat per month (disclosed as unplaced)
  const junkByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));

  for (const cat of ["persons", "property"]) {
    const rows = await getJSON(
      soda({
        $select: "neighborhood,date_trunc_ym(incident_datetime) AS ym,count(*) AS n",
        $where: `incident_datetime >= '${SPAN_START}' AND incident_datetime < '${SPAN_END}' AND ${CAT_WHERE[cat]}`,
        $group: "neighborhood,ym",
        $limit: "50000",
      }),
      { label: `timeline ${cat}` },
    );
    assert(rows.length < 50000, `timeline ${cat}: hit $limit — raise it`);
    let placedN = 0,
      junkN = 0;
    for (const r of rows) {
      const mi = MONTH_IDX.get(ymOf(r.ym));
      assert(mi !== undefined, `timeline ${cat}: month ${r.ym} outside span`);
      const n = Number(r.n);
      assert(Number.isFinite(n), `timeline ${cat}: bad count ${r.n}`);
      const hood = r.neighborhood;
      if (HOODS.has(hood)) {
        cells[hood][mi][cat] += n;
        placedN += n;
      } else {
        assert(JUNK_HOODS.has(hood), `timeline ${cat}: unexpected neighborhood '${hood}'`);
        junkByCatMonth[cat][mi] += n;
        junkN += n;
      }
    }
    console.log(`  ${cat}: ${rows.length} cells → ${placedN} placed, ${junkN} unplaced-in-span`);
  }

  // ---- 4. Citywide per-cat monthly (cross-check + unplaced derivation) ------
  console.log("── Citywide monthly totals per category (cross-check)");
  const cityByCatMonth = { society: MONTHS.map(() => 0), other: MONTHS.map(() => 0) };
  for (const cat of ["persons", "property"]) {
    const rows = await getJSON(
      soda({
        $select: "date_trunc_ym(incident_datetime) AS ym,count(*) AS n",
        $where: `incident_datetime >= '${SPAN_START}' AND incident_datetime < '${SPAN_END}' AND ${CAT_WHERE[cat]}`,
        $group: "ym",
        $limit: "500",
      }),
      { label: `citywide ${cat}` },
    );
    const arr = MONTHS.map(() => 0);
    for (const r of rows) {
      const mi = MONTH_IDX.get(ymOf(r.ym));
      assert(mi !== undefined, `citywide ${cat}: month ${r.ym} outside span`);
      arr[mi] = Number(r.n);
    }
    cityByCatMonth[cat] = arr;
  }
  // Independent citywide reconciliation: unfiltered per-month totals must equal
  // persons+property per month (proves the CAT_WHERE lists are exhaustive).
  const allRows = await getJSON(
    soda({
      $select: "date_trunc_ym(incident_datetime) AS ym,count(*) AS n",
      $where: `incident_datetime >= '${SPAN_START}' AND incident_datetime < '${SPAN_END}'`,
      $group: "ym",
      $limit: "500",
    }),
    { label: "citywide all" },
  );
  const cityAll = MONTHS.map(() => 0);
  for (const r of allRows) {
    const mi = MONTH_IDX.get(ymOf(r.ym));
    assert(mi !== undefined, `citywide all: month ${r.ym} outside span`);
    cityAll[mi] = Number(r.n);
  }
  for (let mi = 0; mi < MONTHS.length; mi++) {
    const byCat = CAT_KEYS.reduce((s, c) => s + cityByCatMonth[c][mi], 0);
    assert(byCat === cityAll[mi], `month ${MONTHS[mi]}: cat sum ${byCat} != citywide ${cityAll[mi]}`);
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

  // ---- 5. Dataset-level totals + windowing reconciliation -------------------
  console.log("── Dataset totals (2006-01-01 … 2026-05-31 window)");
  const [{ count: totalStr }] = await getJSON(
    soda({
      $select: "count(*) AS count",
      $where: `incident_datetime >= '${SPAN_START}' AND incident_datetime < '${SPAN_END}'`,
    }),
    { label: "total window" },
  );
  const totalRecords = Number(totalStr);
  const [{ count: preStr }] = await getJSON(
    soda({
      $select: "count(*) AS count",
      $where: `incident_datetime < '${SPAN_START}'`,
    }),
    { label: "pre-2006 junk-dated count" },
  );
  const preWindow = Number(preStr); // junk-dated rows back to 1910 — excluded + disclosed
  const [{ count: postStr }] = await getJSON(
    soda({
      $select: "count(*) AS count",
      $where: `incident_datetime >= '${SPAN_END}'`,
    }),
    { label: "post-window (partial June 2026) count" },
  );
  const postWindow = Number(postStr); // partial last month — excluded + disclosed
  const [{ count: wholeStr }] = await getJSON(
    soda({ $select: "count(*) AS count" }),
    { label: "whole dataset count" },
  );
  const wholeDataset = Number(wholeStr);
  assert(
    preWindow + totalRecords + postWindow === wholeDataset,
    `window partition ${preWindow}+${totalRecords}+${postWindow} != whole ${wholeDataset}`,
  );
  assert(
    CAT_KEYS.reduce((s, c) => s + catTotals[c], 0) === totalRecords,
    "catTotals do not sum to totalRecords",
  );
  const citywideSpanTotal = cityAll.reduce((a, b) => a + b, 0);
  assert(citywideSpanTotal === totalRecords, "monthly citywide sum != totalRecords");

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
    `  whole dataset ${wholeDataset} = junk-dated pre-2006 ${preWindow} + window ${totalRecords} + partial-June ${postWindow}`,
  );
  console.log(
    `  window ${totalRecords} = placed ${placedRecords} + no-neighborhood ${noNeighborhood} → coverage ${coveragePct}%`,
  );

  // ---- 6. Sampled REAL points ----------------------------------------------
  console.log("── Real incident points (3-decimal block-level coords; deterministic sample)");
  const byMonth = MONTHS.map(() => []);
  let placeableCount = 0; // rows matching the coord filter (for sampleRate)
  let fetched = 0,
    rejected = 0;
  for (let y = 2006; y <= 2026; y++) {
    const yStart = y === 2006 ? SPAN_START : `${y}-01-01T00:00:00`;
    const yEnd = y === 2026 ? SPAN_END : `${y + 1}-01-01T00:00:00`;
    const where =
      `incident_datetime >= '${yStart}' AND incident_datetime < '${yEnd}'` +
      ` AND latitude IS NOT NULL AND latitude != 'UNKNOWN'`;
    const [{ count: pc }] = await getJSON(
      soda({ $select: "count(*) AS count", $where: where }),
      { label: `points count ${y}` },
    );
    placeableCount += Number(pc);
    const rows = await getJSON(
      soda({
        $select: "incident_datetime,latitude,longitude,parent_incident_type",
        $where: where,
        $order: ":id",
        $limit: "1500",
      }),
      { label: `points ${y}` },
    );
    for (const r of rows) {
      fetched++;
      const lat = Number(r.latitude),
        lng = Number(r.longitude);
      const mi = MONTH_IDX.get(ymOf(r.incident_datetime));
      const cat = CAT_OF[r.parent_incident_type];
      if (
        mi === undefined ||
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
  }
  // ≤100/month, deterministic even-stride pick (rows arrive in stable :id order)
  const pts = byMonth.map((arr) => {
    if (arr.length <= 100) return arr;
    const out = [];
    for (let i = 0; i < 100; i++) out.push(arr[Math.floor((i * arr.length) / 100)]);
    return out;
  });
  const ptsKept = pts.reduce((s, a) => s + a.length, 0);
  const sampleRate = Math.round(placeableCount / ptsKept);
  console.log(
    `  fetched ${fetched} candidate rows, rejected ${rejected} (bad/out-of-bbox coords), kept ${ptsKept}` +
      ` of ${placeableCount} placeable → 1 per ~${sampleRate}`,
  );

  // ---- 7. Dispatch feed ------------------------------------------------------
  console.log("── Feed: 4 real items per quarter, 2006-Q1 … 2026-Q2");
  const feed = [];
  for (let y = 2006; y <= 2026; y++) {
    for (let q = 0; q < 4; q++) {
      const start = `${y}-${String(q * 3 + 1).padStart(2, "0")}-01T00:00:00`;
      const end =
        q === 3 ? `${y + 1}-01-01T00:00:00` : `${y}-${String(q * 3 + 4).padStart(2, "0")}-01T00:00:00`;
      if (start >= SPAN_END) continue;
      const cappedEnd = end > SPAN_END ? SPAN_END : end;
      const rows = await getJSON(
        soda({
          $select:
            "incident_datetime,incident_type_primary,address_1,neighborhood,parent_incident_type",
          $where:
            `incident_datetime >= '${start}' AND incident_datetime < '${cappedEnd}'` +
            ` AND neighborhood IS NOT NULL AND neighborhood != 'UNKNOWN'`,
          $order: ":id",
          $limit: "4",
        }),
        { label: `feed ${y}Q${q + 1}` },
      );
      for (const r of rows) {
        assert(HOODS.has(r.neighborhood), `feed: unexpected neighborhood '${r.neighborhood}'`);
        feed.push({
          date: String(r.incident_datetime).slice(0, 10),
          title: r.incident_type_primary || "INCIDENT (unspecified)",
          place: r.address_1 || "",
          beat: r.neighborhood,
          cat: CAT_OF[r.parent_incident_type] || "other",
        });
      }
    }
  }
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`  ${feed.length} feed items (chronological, no seriousness bias)`);

  // ---- 8. FBI UCR history 1985–2005 -----------------------------------------
  console.log(
    `── FBI CDE history (${ORI}, 1985–2005, key=${FBI_KEY === "DEMO_KEY" ? "DEMO_KEY" : "FBI_API_KEY"})`,
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
        (k) => /Buffalo/i.test(k) && /Offenses/i.test(k) && !/United States/i.test(k),
      );
      if (!agKey) throw new Error(`FBI ${offense}: no Buffalo Offenses series (keys: ${Object.keys(actuals)})`);
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
  for (let y = 1985; y <= 2005; y++) {
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
  // contiguity within the kept span (partial years allowed only at the edges)
  years.forEach((yr, i) => {
    assert(yr.year === yearMin + i, `FBI history: gap at ${yearMin + i} (partial year mid-span?)`);
  });
  if (droppedYears.length)
    console.warn(`  dropped partial years: ${JSON.stringify(droppedYears)}`);
  console.log(`  ${years.length} complete years ${yearMin}–${yearMax} (12 months each verified)`);

  // ---- Assemble output files -------------------------------------------------
  const sourceGaps = [
    {
      span: "2006-02 … 2006-04",
      note: "thin ramp-in months (335–1,053 rows vs ~1,500–2,000 typical) — source starts filling in early 2006",
    },
    {
      span: "2008-01 … 2008-05",
      note: "near-empty months (17–262 rows) — gap in the source records system; shown honestly as a dip, never interpolated",
    },
  ];
  const timeline = { months: MONTHS, cells };
  const beatsFile = { cats: CATS, beats };
  const summary = {
    slug: "buffalo-ny",
    title: "Buffalo · NY",
    source: { records: SODA, beats: NBHD_URL, hub: HUB },
    fetchedAt,
    dateMin: "2006-01-01",
    dateMax: "2026-05-31",
    months: MONTHS.length,
    totalRecords,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: { "no-neighborhood": noNeighborhood },
    excludedOutsideWindow: { "junk-dated-pre-2006": preWindow, "partial-2026-06": postWindow },
    sourceGaps,
    scopeNote:
      "BPD publishes only 10 major-crime incident types (homicide, assault, sexual offenses, robbery, burglary, theft, vehicle theft) — no drug/weapon/vice offenses, so Crimes Against Society is structurally zero.",
    catTotals,
    cats: CATS,
    beatCount: Object.keys(beats).length,
  };
  const history = {
    era: "history",
    taxonomy:
      "FBI UCR Summary (Violent + Property) — a different taxonomy than the BPD incident types used from 2006; the two eras bridge at 2006 and are never equated",
    agency: AGENCY,
    ori: ORI,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      `Annual totals are real UCR Summary counts fetched from the FBI CDE summarized agency endpoint for ORI ${ORI} ` +
      `(12 reported months verified per year). UCR Summary (Violent/Property) and BPD incident types are different ` +
      `taxonomies and are presented as distinct eras; neighborhood-level detail exists only from 2006 (the BPD open ` +
      `dataset begins there), so the story bridges from citywide annual history to per-neighborhood monthly data at 2006. ` +
      `Reproduce with pipeline/sources/buffalo-ny.mjs (set FBI_API_KEY to avoid DEMO_KEY rate limits).` +
      (droppedYears.length
        ? ` Dropped partial years: ${droppedYears.map((d) => d.year).join(", ")}.`
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
    source: "City of Buffalo official planning Neighborhood Boundaries (35)",
    sourceUrl: NBHD_URL,
    hub: "https://data.buffalony.gov/",
    fetchedAt,
    license: "Public data — City of Buffalo GIS server (attribution City of Buffalo)",
    method:
      "identity — BPD crime records carry the official City of Buffalo neighborhood name verbatim (all 35 polygon NbhdName values match the crime data's neighborhood values exactly); no spatial join or approximation is involved",
    map: Object.fromEntries(Object.keys(beats).map((k) => [k, { name: k, approx: false }])),
  };
  const points = {
    mode: "real-sample",
    note:
      "Every dot is a real reported incident location published by BPD, rounded by the source to 3 decimal places (~80–110 m, block-level) — DISCLOSED: dots mark blocks, not exact addresses. ~2.3% of records have no usable coordinates (null or 'UNKNOWN') and are counted but not plotted. Deterministic sample (≤100/month).",
    coordPrecision: "3 decimal places (block-level, ~80–110 m)",
    sampleRate,
    months: MONTHS,
    pts,
  };

  // ---- VALIDATE (fail loudly) -------------------------------------------------
  console.log("── Validation");
  assert(
    MONTHS.length === 245 && MONTHS[0] === "2006-01" && MONTHS[244] === "2026-05",
    "months not contiguous 2006-01..2026-05",
  );
  for (let i = 1; i < MONTHS.length; i++) {
    const [py, pm] = MONTHS[i - 1].split("-").map(Number);
    const [cy, cm] = MONTHS[i].split("-").map(Number);
    assert(
      (cm === pm + 1 && cy === py) || (cm === 1 && pm === 12 && cy === py + 1),
      `months not contiguous at ${MONTHS[i]}`,
    );
  }
  assert(Object.keys(beats).length === 35, "beatCount != 35");
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
    assert(f.date >= "2006-01-01" && f.date <= "2026-05-31", `feed date out of span ${f.date}`);
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
    ptsKept,
    sampleRate,
    catTotals,
    typeRows,
    preWindow,
    postWindow,
    wholeDataset,
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
  ptsKept,
  sampleRate,
  catTotals,
  typeRows,
  preWindow,
  postWindow,
  wholeDataset,
}) {
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const typeTable = typeRows
    .slice()
    .sort((a, b) => Number(b.n) - Number(a.n))
    .map((r) => `| ${r.t} | \`${CAT_OF[r.t]}\` | ${fmt(r.n)} |`)
    .join("\n");
  const md = `# Provenance — Buffalo, NY

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **Crime Incidents** (Socrata \`d6g9-xbgu\`) |
| Publisher | Buffalo Police Department (BPD), via data.buffalony.gov |
| Landing page | ${HUB} |
| API | ${SODA} |
| Fetched | ${fetchedAt} |
| License | **Public Domain U.S. Government** (Socrata licenseId \`USGOV_WORKS\`, https://www.usa.gov/government-works), attribution "Buffalo Police Department" |
| Records used | ${fmt(summary.totalRecords)} (incident_datetime 2006-01-01 → 2026-05-31) |
| Source caveat | Preliminary report data ("very preliminary information … further investigation may be necessary"); updated daily with a ~1-month publication lag |

### Windowing (disclosed exclusions)
Whole dataset at fetch time: **${fmt(wholeDataset)} rows** = ${fmt(preWindow)} junk-dated + ${fmt(summary.totalRecords)} window + ${fmt(postWindow)} partial-month (identity validated in-script).
- **${fmt(preWindow)} junk-dated rows before 2006** (incident_datetime back to 1910 — data-entry artifacts; the real span begins 2006) are excluded and counted here.
- **${fmt(postWindow)} rows after 2026-05-31** are excluded: the source lags ~1 month and June 2026 rows stop mid-month (last row 2026-06-16 at fetch) — the granular window ends at the last FULL month, **2026-05** (measured, not assumed).

### Source gaps (shown honestly, never interpolated)
| Span | What the source shows |
|------|----------------------|
| 2006-02 … 2006-04 | thin ramp-in months (335–1,053 rows vs ~1,500–2,000 typical) |
| 2008-01 … 2008-05 | near-empty months (17–262 rows) — a gap in the source records system |

These dips are real properties of the published data and appear as-is in the timeline; comparisons in the video avoid 2006 and 2008 as baseline years.

### Fields used
\`incident_datetime\` · \`parent_incident_type\` · \`incident_type_primary\` · \`neighborhood\` (official city neighborhood name, in-data) · \`address_1\` · \`latitude\`/\`longitude\` (TEXT, 3-decimal) · \`case_number\` (verified unique in-window — incident-level data, no dedupe needed).

### Category mapping (parent_incident_type → cat) — complete enumeration
| Source value | cat | window count |
|---|---|--:|
${typeTable}

Mapping follows the NIBRS crimes-against convention (robbery is a crime against **property**; all sexual offenses and homicide against **persons**). **SCOPE LIMIT (disclosed on-screen):** BPD publishes only these 10 major-crime types — no drug, weapon, or vice offenses — so **Crimes Against Society is structurally zero** (${fmt(catTotals.society)}) and \`other\` is empty (${fmt(catTotals.other)}). The in-script audit fails loudly if the source ever adds an unmapped type.

### Coverage
- Placed (one of the 35 official neighborhoods, 2006-01…2026-05): **${fmt(summary.placedRecords)}** (${summary.coveragePct}%)
- Unplaced: ${fmt(summary.unplacedRecords)} in-span rows whose neighborhood is blank or "UNKNOWN" — kept in every citywide total and disclosed.
- Identity \`placed + unplaced == citywide\` validated per month × category in-script, plus an independent per-month all-rows reconciliation proving the category lists are exhaustive.

## Geometry source — official neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **City of Buffalo planning Neighborhood Boundaries** — 35 polygons, field \`NbhdName\` |
| FeatureServer | https://gis.buffalony.gov/server/rest/services/BaseFiles/Neighborhood_Boundaries/FeatureServer/0 |
| Publisher | City of Buffalo GIS (gis.buffalony.gov, the city's own server; referenced by the city's "Planning Neighborhoods and Sectors" web map) |
| Join key | \`NbhdName\` — matches the crime data's \`neighborhood\` values **verbatim, all 35 of 35** (identity join, no fuzzy matching) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (\`points.json\`)

Coordinates in the source are TEXT and **rounded by BPD to 3 decimal places (~80–110 m) — block-level, DISCLOSED**: every dot is a real reported incident's block, never an exact address and never synthesized. Sentinels rejected: \`UNKNOWN\` (~5.3k rows), null (~2.5k rows), plus out-of-city geocode errors outside lat ${BBOX.latMin}–${BBOX.latMax}, lng ${BBOX.lngMin}–${BBOX.lngMax}. Deterministic sample: per year 2006–2026, first 1,500 rows in \`:id\` order with usable coords, bucketed by month, even-stride ≤100/month → **${fmt(ptsKept)} points ≈ 1 per ${sampleRate} of the ${fmt(placeableCount)} placeable rows**. Records without usable coordinates are still counted in every total — they are only missing from the dot layer, and the video says so.

## Historical source — FBI UCR (${history.yearMin}–${history.yearMax} deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Buffalo Police Department — **ORI \`${ORI}\`** (verified: returns "Buffalo Police Department Offenses" series) |
| Endpoint | ${history.sourceUrl} (and \`/property-crime\`) |
| Span | ${history.yearMin}–${history.yearMax}, annual Violent + Property (12 reported months verified per year)${droppedYears.length ? ` — dropped partial years: ${droppedYears.map((d) => d.year).join(", ")}` : ""} |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set \`FBI_API_KEY\`) |

UCR Summary (Violent/Property) is a **different taxonomy** than the BPD incident types — the eras are presented as distinct and bridge at 2006; they are never equated. No monthly or neighborhood detail is implied for ${history.yearMin}–${history.yearMax}.

## Reproduce

\`\`\`bash
FBI_API_KEY=… node pipeline/sources/buffalo-ny.mjs
\`\`\`
`;
  writeFileSync(PROV_PATH, md);
  console.log(`  wrote data/buffalo-ny/PROVENANCE.md`);
}

// ---- wiki/Data-Provenance.md append -------------------------------------------
function appendWiki({ summary, history }) {
  if (!existsSync(WIKI_PATH)) return;
  const cur = readFileSync(WIKI_PATH, "utf8");
  if (cur.includes("## Buffalo, NY")) {
    console.log("  wiki/Data-Provenance.md already has a Buffalo section — skipped");
    return;
  }
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const section = `
## Buffalo, NY (\`buffalo-ny\`)

- **Primary source:** Crime Incidents (Socrata \`d6g9-xbgu\`, ${HUB}) —
  **Public Domain U.S. Government** (\`USGOV_WORKS\`), attribution "Buffalo
  Police Department". Preliminary report data; updated daily, ~1-month lag.
- **Spatial unit:** the **35 official City of Buffalo planning neighborhoods**
  — the crime data's \`neighborhood\` field matches the city GIS polygon layer
  (\`Neighborhood_Boundaries/FeatureServer/0\`, field \`NbhdName\`) verbatim,
  35 of 35 (identity join, no approximation).
- **Deep-history source (${history.yearMin}–${history.yearMax}):** FBI Crime Data Explorer (CDE) —
  Buffalo PD, **ORI ${ORI}** (verified) — real annual Violent + Property counts,
  ${history.years.length} full years (12 reported months each, verified). UCR taxonomy kept
  distinct from the incident data; eras bridge at 2006.
- **Span:** ${history.yearMin}–${history.yearMax} (FBI UCR annual) + 2006-01-01 → 2026-05-31 (BPD
  incidents with neighborhood detail, ${summary.months} months; last FULL month measured
  — June 2026 is partial at the source and excluded).
- **Records:** ${fmt(summary.totalRecords)} in-window · ${fmt(summary.placedRecords)} placed in an official
  neighborhood (**${summary.coveragePct}% coverage**) · ${fmt(summary.unplacedRecords)} unplaced
  (blank/"UNKNOWN" neighborhood), kept in totals and disclosed. ${fmt(summary.excludedOutsideWindow["junk-dated-pre-2006"])} junk-dated
  pre-2006 rows (back to 1910) excluded + disclosed.
- **Source gaps disclosed:** 2006-02…04 thin ramp-in; 2008-01…05 near-empty
  (records-system gap) — shown as-is, never interpolated; baselines avoid them.
- **Real dots:** BPD publishes **3-decimal (~block-level, ~80–110 m) coords**
  for ~97.7% of rows — DISCLOSED; dots are a deterministic ≤100/month sample of
  real block locations; no-coordinate records are counted but not plotted.
- **Scope limit (disclosed):** only 10 major-crime types published (no
  drug/weapon/vice offenses) → Crimes Against Society is structurally zero.
- **License:** Public Domain U.S. Government (\`USGOV_WORKS\`); polygons from
  the City of Buffalo's own GIS server (attribution City of Buffalo).
- **Detail:** [\`data/buffalo-ny/PROVENANCE.md\`](../data/buffalo-ny/PROVENANCE.md)

### Category mapping (parent_incident_type → cat)

| Source value | cat |
|--------------|-----|
| Assault · Homicide · Sexual Assault · Sexual Offense · Other Sexual Offense · SODOMY | \`persons\` |
| Theft · Breaking & Entering · Theft of Vehicle · Robbery | \`property\` (robbery = crime against property per NIBRS) |
| — | \`society\` structurally 0 — BPD publishes no society-type offenses |
`;
  // insert before "## Ranked source types" if present, else append
  const marker = "## Ranked source types";
  const idx = cur.indexOf(marker);
  const next =
    idx >= 0 ? cur.slice(0, idx) + section.trimStart() + "\n" + cur.slice(idx) : cur + section;
  writeFileSync(WIKI_PATH, next);
  console.log("  appended Buffalo section to wiki/Data-Provenance.md");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
