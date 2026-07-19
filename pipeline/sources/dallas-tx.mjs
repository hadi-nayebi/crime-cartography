// Dallas, TX — DPD Police Incidents source pipeline (fetch → normalize → validate).
//
// BINDING RULE: never fabricate — every figure written by this script comes
// straight from a queryable public source; every gap is disclosed.
//
// Sources:
//   Incidents  : Socrata "Police Incidents" (qv6i-rri7), ODC-BY (Open Data
//                Commons Attribution), attribution "Dallas Police Department".
//                RMS incidents June 1, 2014 → current; preliminary
//                classifications; published "for research purposes only".
//                https://www.dallasopendata.com/resource/qv6i-rri7.json
//   Polygons   : Dallas Police Divisions (official DPD Crime Analysis Unit
//                layer, 8 polygons incl. CBD, field DIVISION)
//                https://services1.arcgis.com/In9TiV3Fv4nmmrag/arcgis/rest/services/Division/FeatureServer/0
//   History    : FBI Crime Data Explorer (CDE) summarized agency counts,
//                Dallas PD ORI TXDPD0000, 1985–2014 annual Violent + Property.
//                (The scouted ORI TX0570200 is WRONG — it returns Balch Springs
//                PD; TXDPD0000 verified via the byStateAbbr agency lookup and a
//                1985-plausibility check: 130,256 offenses, big-city scale.)
//
// Eras (honesty structure):
//   1985–2014  FBI UCR annual citywide totals (no division detail implied)
//   2015-01 → 2026-06  DPD RMS incidents with police-division detail
//                (2015 is the first full calendar year; the source starts
//                2014-06-01. Last FULL month at fetch time is 2026-06 —
//                measured: June has ~10.5k rows vs May ~11k; July is partial.)
//
// SOURCE SCOPE FILTER (disclosed prominently — PROVENANCE + summary.scopeNote):
//   DPD filters this public dataset before release. Excluded by the source:
//   sexually oriented offenses; offenses where juveniles/children (under 17)
//   are the victim or suspect; evidence property listings; Social Service
//   Referral offenses; some vehicle identifying info. Sex crimes therefore
//   NEVER appear and all totals undercount actual reported crime.
//
// Row grain: the source is VICTIM/INVOLVEMENT-level (servnumid = incidentnum +
// per-person suffix; measured ~1.20 rows per incident). Rows are DEDUPLICATED
// to incidents by incidentnum, keeping the source's first service-number row
// (lexicographically smallest servnumid, i.e. "-01") — deterministic,
// disclosed in summary.methodFootnote.
//
// date1 is TEXT ("YYYY-MM-DD HH:MM:SS.NNNNNNN", verified 0 null / 0 malformed
// in the whole dataset) — window filters use lexicographic comparison and every
// row's date1-derived month is sanity-checked against the source's own
// year1/month1 occurrence fields (mismatches counted + disclosed).
//
//   node pipeline/sources/dallas-tx.mjs        (set FBI_API_KEY or .secrets/fbi_api_key)
//
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const OUT_DIR = resolve(repoRoot, "data/dallas-tx/normalized");
const PROV_PATH = resolve(repoRoot, "data/dallas-tx/PROVENANCE.md");
const WIKI_PATH = resolve(repoRoot, "wiki/Data-Provenance.md");

const SODA = "https://www.dallasopendata.com/resource/qv6i-rri7.json";
const HUB = "https://www.dallasopendata.com/d/qv6i-rri7";
const DIV_URL =
  "https://services1.arcgis.com/In9TiV3Fv4nmmrag/arcgis/rest/services/Division/FeatureServer/0/query?where=1%3D1&outFields=DIVISION,DIVISION_NUM,DIVISION_ABBR&outSR=4326&geometryPrecision=6&f=geojson";
const DIV_ITEM = "https://www.arcgis.com/home/item.html?id=3ce570ceaeaf470d974f0d8695271bcf";
const ORI = "TXDPD0000";
const AGENCY = "Dallas Police Department";
const FBI_KEY =
  process.env.FBI_API_KEY ||
  (existsSync(resolve(repoRoot, ".secrets/fbi_api_key"))
    ? readFileSync(resolve(repoRoot, ".secrets/fbi_api_key"), "utf8").trim()
    : "DEMO_KEY");

// Granular era window: 2015-01 (first full calendar year; source starts
// 2014-06-01) → 2026-06 (last FULL month, measured). date1 is TEXT — these
// bounds compare lexicographically against "YYYY-MM-DD HH:MM:SS.NNNNNNN".
const SPAN_START = "2015-01-01"; // inclusive
const SPAN_END = "2026-07-01"; // exclusive → dateMax 2026-06-30
const HIST_FROM = "01-1985";
const HIST_TO = "12-2014";

// The 8 official DPD divisions (crime data's `division`, UPPERCASED, matches
// the official polygon layer's DIVISION field verbatim). ~550 mixed-case
// variants ("NorthEast" …) normalize to these; blank division → unplaced.
const DIVISIONS = [
  "CENTRAL",
  "NORTHEAST",
  "SOUTHEAST",
  "SOUTHWEST",
  "NORTHWEST",
  "NORTH CENTRAL",
  "SOUTH CENTRAL",
  "CBD",
];
const DIV_NAME = {
  CENTRAL: "Central",
  NORTHEAST: "Northeast",
  SOUTHEAST: "Southeast",
  SOUTHWEST: "Southwest",
  NORTHWEST: "Northwest",
  "NORTH CENTRAL": "North Central",
  "SOUTH CENTRAL": "South Central",
  CBD: "Downtown (CBD)",
};

// nibrs_crimeagainst (native, 2017+) → cat. "PERSON, PROPERTY, OR SOCIETY" is
// DPD's mixed-target bucket (measured: ~62% ALL OTHER OFFENSES + ~38% traffic
// violations) and MISCELLANEOUS is DPD's non-Group-A bucket — both go to
// `other` (context), never counted as NIBRS persons/property/society crime.
const NATIVE_CAT = {
  PERSON: "persons",
  PROPERTY: "property",
  SOCIETY: "society",
  "PERSON, PROPERTY, OR SOCIETY": "other",
  MISCELLANEOUS: "other",
};

// ucr_offense → cat FALLBACK for rows whose NIBRS fields are blank — in
// practice the 2014–2016 era (DPD's RMS rows carry NIBRS classification only
// from 2017; measured: >99.9% of 2015–2016 rows have blank nibrs_crimeagainst
// but a populated ucr_offense — exactly 49 distinct values, all enumerated
// here). Mapping follows the FBI NIBRS crimes-against convention: robbery,
// fraud, arson → property; Group B offenses (drugs, weapons, DWI, disorderly,
// trespass, resisting…) → society; non-offense reports (found/lost property,
// accidents, injured-person, death investigations) → other. The audit fails
// loudly on any value not in this table.
const UCR_CAT = {
  // crimes against persons
  ASSAULT: "persons",
  "AGG ASSAULT - NFV": "persons",
  MURDER: "persons",
  "TERRORISTIC THREAT": "persons",
  "OFFENSE AGAINST CHILD": "persons",
  KIDNAPPING: "persons",
  "INTOXICATION MANSLAUGHTER": "persons",
  // crimes against property
  "THEFT/BMV": "property",
  UUMV: "property",
  "VANDALISM & CRIM MISCHIEF": "property",
  "BURGLARY-RESIDENCE": "property",
  "OTHER THEFTS": "property",
  "BURGLARY-BUSINESS": "property",
  "ROBBERY-INDIVIDUAL": "property",
  "ROBBERY-BUSINESS": "property",
  "THEFT/SHOPLIFT": "property",
  "THEFT ORG RETAIL": "property",
  FRAUD: "property",
  "FORGE & COUNTERFEIT": "property",
  "FORGERY & COUNTERFEITING": "property",
  EMBEZZLEMENT: "property",
  ARSON: "property",
  // crimes against society (incl. NIBRS Group B designations)
  "DRUNK & DISORDERLY": "society",
  "DISORDERLY CONDUCT": "society",
  DWI: "society",
  "NARCOTICS & DRUGS": "society",
  WEAPONS: "society",
  "LIQUOR OFFENSE": "society",
  GAMBLING: "society",
  "ORGANIZED CRIME": "society",
  "ORANIZED CRIME": "society", // source typo variant of ORGANIZED CRIME
  "CRIMINAL TRESPASS": "society",
  EVADING: "society",
  "RESIST ARREST": "society",
  "FAIL TO ID": "society",
  ESCAPE: "society",
  // non-offense / non-criminal reports (context only)
  FOUND: "other",
  LOST: "other",
  "ACCIDENT MV": "other",
  "MOTOR VEHICLE ACCIDENT": "other",
  "TRAFFIC FATALITY": "other",
  "TRAFFIC VIOLATION": "other",
  "SUDDEN DEATH&FOUND BODIES": "other",
  "INJURED PUBLIC": "other",
  "INJURED HOME": "other",
  "INJURED FIREARM": "other",
  "INJURED OCCUPA": "other",
  "ANIMAL BITE": "other",
  OTHERS: "other",
};

const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff2e63" },
  property: { label: "Crimes Against Property", color: "#ffc233" },
  society: { label: "Crimes Against Society", color: "#34e0e0" },
  other: { label: "Mixed / non-criminal (context)", color: "#7486a0" },
};
const CAT_KEYS = ["persons", "property", "society", "other"]; // catIdx order

const MONTH_NAME_NUM = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

// Valid Dallas coordinate box (spec-scouted; out-of-city geocode errors and
// null-island values are rejected here — rejected rows counted + disclosed).
const BBOX = { latMin: 32.62, latMax: 33.02, lngMin: -96.99, lngMax: -96.55 };

// Feed quota: 2 per month + 1 extra in each quarter's first month
// → 138×2 + 46 = 322 items (~300 target), spread evenly, fetch order (no bias).
const feedQuota = (ym) => (Number(ym.slice(5, 7)) % 3 === 1 ? 3 : 2);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fetchCount = 0;
async function getJSON(url, { retries = 4, retryWait = 5000, label = url } = {}) {
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
const MONTHS = monthRange("2015-01", "2026-06"); // 138
const MONTH_IDX = new Map(MONTHS.map((m, i) => [m, i]));
const ymOf = (ts) => String(ts).slice(0, 7);
function monthBounds(ym) {
  let [y, m] = ym.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  m++;
  if (m > 12) (m = 1), y++;
  return [start, `${y}-${String(m).padStart(2, "0")}-01`];
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

// cat resolution: native nibrs_crimeagainst first, ucr_offense fallback second,
// unclassified `other` last. Returns [cat, basis] — basis counts are disclosed.
function catOf(row) {
  const ca = (row.nibrs_crimeagainst || "").trim().toUpperCase();
  if (ca) {
    const cat = NATIVE_CAT[ca];
    assert(cat, `unmapped nibrs_crimeagainst '${ca}' — extend NATIVE_CAT + docs`);
    return [cat, ca === "PERSON, PROPERTY, OR SOCIETY" || ca === "MISCELLANEOUS" ? "native-other" : "native"];
  }
  const u = (row.ucr_offense || "").trim().toUpperCase();
  if (!u) return ["other", "unclassified"];
  const cat = UCR_CAT[u];
  assert(cat, `unmapped ucr_offense '${u}' — extend UCR_CAT + docs`);
  return [cat, "ucr-fallback"];
}

// ============================================================================
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const fetchedAt = new Date().toISOString();

  // ---- 1. Official DPD Division polygons -----------------------------------
  console.log("── Dallas Police Divisions polygons (official DPD CAU layer)");
  const gj = await getJSON(DIV_URL, { label: "Division geojson" });
  assert(gj?.type === "FeatureCollection" && Array.isArray(gj.features), "DIV: bad geojson");
  assert(gj.features.length === 8, `DIV: expected 8 features, got ${gj.features.length}`);

  const beats = {};
  gj.features.forEach((f, idx) => {
    const key = String(f.properties?.DIVISION || "").toUpperCase().trim();
    assert(DIVISIONS.includes(key), `DIV feature ${idx}: unexpected DIVISION '${key}'`);
    assert(!beats[key], `DIV: duplicate division '${key}'`);
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
    assert(A > 0, `DIV '${key}': zero area`);
    beats[key] = {
      key,
      name: DIV_NAME[key],
      servcen: f.properties?.DIVISION_ABBR ?? "",
      beat: f.properties?.DIVISION_NUM ?? idx,
      centroid: [Number((X / A).toFixed(6)), Number((Y / A).toFixed(6))],
      polygon: outerRings,
      geomType: g.type,
    };
  });
  assert(Object.keys(beats).length === 8, "DIV: not all 8 divisions present");
  const HOODS = new Set(Object.keys(beats));
  console.log(`  8 divisions: ${Object.values(beats).map((b) => b.name).join(", ")}`);

  // ---- 2. Monthly pass: fetch ALL rows, dedupe to incidents, reconcile ------
  // The source is victim-level, so aggregates must be computed client-side on
  // deduplicated incidents. Per month: (a) server row count, (b) full row
  // fetch (assert complete), (c) server count(distinct incidentnum) as the
  // INDEPENDENT citywide reconciliation of the client-side dedupe.
  console.log(`── Monthly pass: ${MONTHS.length} months × (rows + dedupe + reconcile)`);
  const cells = {};
  for (const k of HOODS)
    cells[k] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  const junkByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  const cityIncidentsByMonth = MONTHS.map(() => 0); // client-side deduped
  const byMonthPts = MONTHS.map(() => []);
  const feed = [];
  const seenIncidents = new Set(); // cross-month duplicate guard (fails loudly)
  const basisCounts = { native: 0, "native-other": 0, "ucr-fallback": 0, unclassified: 0 };
  let windowRows = 0;
  let victimDupRows = 0; // rows dropped by dedupe
  let catDisagree = 0; // dropped rows whose cat differs from the kept row's
  let divDisagree = 0; // dropped rows whose division differs from the kept row's
  let binMismatch = 0; // rows whose year1/month1 disagree with date1's month
  let binMissing = 0; // rows with unparseable year1/month1
  let placeableIncidents = 0; // deduped incidents with in-bbox coords
  let coordMissing = 0; // deduped incidents without usable coords
  let coordRejected = 0; // deduped incidents with out-of-bbox/junk coords

  for (let mi = 0; mi < MONTHS.length; mi++) {
    const ym = MONTHS[mi];
    const [mStart, mEnd] = monthBounds(ym);
    const W = `date1 >= '${mStart}' AND date1 < '${mEnd}'`;

    const [{ n: rowCountStr }] = await getJSON(
      soda({ $select: "count(*) AS n", $where: W }),
      { label: `rowcount ${ym}` },
    );
    const rowCount = Number(rowCountStr);
    assert(rowCount < 50000, `${ym}: ${rowCount} rows ≥ page limit — chunk this month`);

    const rows = await getJSON(
      soda({
        $select:
          "incidentnum,servnumid,date1,year1,month1,division,nibrs_crimeagainst,ucr_offense,offincident,geocoded_column",
        $where: W,
        $order: ":id",
        $limit: "50000",
      }),
      { label: `rows ${ym}` },
    );
    assert(rows.length === rowCount, `${ym}: fetched ${rows.length} != counted ${rowCount}`);
    windowRows += rowCount;

    const [{ d: distinctStr }] = await getJSON(
      soda({ $select: "count(distinct incidentnum) AS d", $where: W }),
      { label: `distinct ${ym}` },
    );
    const serverDistinct = Number(distinctStr);

    // client-side dedupe: keep the lexicographically-smallest servnumid row
    const chosen = new Map(); // incidentnum → row
    for (const r of rows) {
      assert(r.incidentnum, `${ym}: row with blank incidentnum`);
      assert(ymOf(r.date1) === ym, `${ym}: row date1 '${r.date1}' outside month`);
      // date1-vs-source-month sanity (year1 + month1 are DPD's own occurrence fields)
      const y1 = Number(r.year1),
        m1 = MONTH_NAME_NUM[String(r.month1 || "").trim()];
      if (!Number.isFinite(y1) || !m1) binMissing++;
      else if (`${y1}-${String(m1).padStart(2, "0")}` !== ym) binMismatch++;
      const prev = chosen.get(r.incidentnum);
      if (!prev) {
        chosen.set(r.incidentnum, r);
        continue;
      }
      victimDupRows++;
      const a = prev.servnumid ?? "￿",
        b = r.servnumid ?? "￿";
      const keep = b < a ? r : prev;
      const drop = keep === r ? prev : r;
      if (catOf(drop)[0] !== catOf(keep)[0]) catDisagree++;
      if (
        String(drop.division || "").toUpperCase().trim() !==
        String(keep.division || "").toUpperCase().trim()
      )
        divDisagree++;
      chosen.set(r.incidentnum, keep);
    }
    // INDEPENDENT per-month reconciliation: client dedupe == server distinct
    assert(
      chosen.size === serverDistinct,
      `${ym}: client dedupe ${chosen.size} != server count(distinct incidentnum) ${serverDistinct}`,
    );
    cityIncidentsByMonth[mi] = chosen.size;

    let feedTaken = 0;
    const feedMax = feedQuota(ym);
    for (const r of chosen.values()) {
      assert(!seenIncidents.has(r.incidentnum), `incident ${r.incidentnum} appears in two months`);
      seenIncidents.add(r.incidentnum);
      const [cat, basis] = catOf(r);
      basisCounts[basis]++;
      const div = String(r.division || "").toUpperCase().trim();
      if (HOODS.has(div)) {
        cells[div][mi][cat]++;
      } else {
        assert(div === "", `unexpected division '${r.division}'`);
        junkByCatMonth[cat][mi]++;
      }
      // real coordinates (Socrata location type; DPD-geocoded incident address)
      const lat = Number(r.geocoded_column?.latitude),
        lng = Number(r.geocoded_column?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) coordMissing++;
      else if (lat < BBOX.latMin || lat > BBOX.latMax || lng < BBOX.lngMin || lng > BBOX.lngMax)
        coordRejected++;
      else {
        placeableIncidents++;
        byMonthPts[mi].push([Number(lng.toFixed(6)), Number(lat.toFixed(6)), CAT_KEYS.indexOf(cat)]);
      }
      // dispatch feed: first 2-3 placed incidents per month, fetch order (no bias)
      if (feedTaken < feedMax && HOODS.has(div) && r.offincident) {
        let place = "";
        try {
          place = JSON.parse(r.geocoded_column?.human_address || "{}").address || "";
        } catch {}
        feed.push({
          date: String(r.date1).slice(0, 10),
          title: String(r.offincident).trim(),
          place,
          beat: div,
          cat,
        });
        feedTaken++;
      }
    }
    if ((mi + 1) % 12 === 0 || mi === MONTHS.length - 1)
      console.log(
        `  …through ${ym}: ${windowRows.toLocaleString("en-US")} rows → ${seenIncidents.size.toLocaleString("en-US")} incidents`,
      );
  }
  const totalRecords = seenIncidents.size;
  assert(
    totalRecords === cityIncidentsByMonth.reduce((a, b) => a + b, 0),
    "incident total != sum of monthly",
  );
  console.log(
    `  dedupe: ${windowRows.toLocaleString("en-US")} victim-level rows → ${totalRecords.toLocaleString("en-US")} incidents` +
      ` (${victimDupRows.toLocaleString("en-US")} extra-victim rows dropped; cat disagrees on ${catDisagree.toLocaleString("en-US")}, division on ${divDisagree})`,
  );
  console.log(
    `  date1 sanity vs year1/month1: ${binMismatch} mismatched, ${binMissing} missing of ${windowRows.toLocaleString("en-US")} rows`,
  );
  assert(binMismatch / windowRows < 0.005, "date1 vs year1/month1 mismatch rate ≥0.5% — investigate");

  // ---- 3. Whole-dataset partition + window reconciliation -------------------
  console.log("── Whole-dataset partition (rows) + window distinct cross-check");
  const [{ n: wholeStr }] = await getJSON(soda({ $select: "count(*) AS n" }), {
    label: "whole rows",
  });
  const [{ n: preStr }] = await getJSON(
    soda({ $select: "count(*) AS n", $where: `date1 < '${SPAN_START}'` }),
    { label: "pre-window rows" },
  );
  const [{ n: postStr }] = await getJSON(
    soda({ $select: "count(*) AS n", $where: `date1 >= '${SPAN_END}'` }),
    { label: "post-window rows" },
  );
  const wholeRows = Number(wholeStr),
    preRows = Number(preStr),
    postRows = Number(postStr);
  assert(
    preRows + windowRows + postRows === wholeRows,
    `row partition ${preRows}+${windowRows}+${postRows} != whole ${wholeRows}`,
  );
  const [{ d: winDistinctStr }] = await getJSON(
    soda({
      $select: "count(distinct incidentnum) AS d",
      $where: `date1 >= '${SPAN_START}' AND date1 < '${SPAN_END}'`,
    }),
    { label: "window distinct" },
  );
  assert(
    Number(winDistinctStr) === totalRecords,
    `window count(distinct incidentnum) ${winDistinctStr} != client total ${totalRecords}`,
  );
  console.log(
    `  whole ${wholeRows.toLocaleString("en-US")} rows = pre-2015 ${preRows.toLocaleString("en-US")} + window ${windowRows.toLocaleString("en-US")} + post-2026-06 ${postRows.toLocaleString("en-US")} ✓` +
      `\n  window distinct incidents (server) == client dedupe: ${totalRecords.toLocaleString("en-US")} ✓`,
  );

  // ---- 4. Totals, coverage --------------------------------------------------
  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  let placedRecords = 0;
  for (const k of HOODS)
    for (const cc of cells[k])
      for (const c of CAT_KEYS) {
        catTotals[c] += cc[c];
        placedRecords += cc[c];
      }
  const noDivision = CAT_KEYS.reduce((s, c) => s + junkByCatMonth[c].reduce((a, b) => a + b, 0), 0);
  for (const c of CAT_KEYS) catTotals[c] += junkByCatMonth[c].reduce((a, b) => a + b, 0);
  assert(
    CAT_KEYS.reduce((s, c) => s + catTotals[c], 0) === totalRecords,
    "catTotals do not sum to totalRecords",
  );
  const unplacedRecords = noDivision;
  assert(placedRecords + unplacedRecords === totalRecords, "placed+unplaced != total");
  // per-month × cat identity (cells and junk were built from the same deduped
  // set whose monthly sizes were server-reconciled above)
  for (let mi = 0; mi < MONTHS.length; mi++) {
    let m = 0;
    for (const c of CAT_KEYS) {
      for (const k of HOODS) m += cells[k][mi][c];
      m += junkByCatMonth[c][mi];
    }
    assert(m === cityIncidentsByMonth[mi], `month ${MONTHS[mi]}: cells+junk ${m} != citywide ${cityIncidentsByMonth[mi]}`);
  }
  const coveragePct = Math.round((placedRecords / totalRecords) * 1000) / 10;
  console.log(
    `  window ${totalRecords.toLocaleString("en-US")} incidents = placed ${placedRecords.toLocaleString("en-US")} + no-division ${noDivision} → coverage ${coveragePct}%`,
  );
  console.log(
    `  classification basis: native NIBRS ${basisCounts.native.toLocaleString("en-US")} · native mixed/misc→other ${basisCounts["native-other"].toLocaleString("en-US")}` +
      ` · UCR fallback ${basisCounts["ucr-fallback"].toLocaleString("en-US")} · unclassified→other ${basisCounts.unclassified.toLocaleString("en-US")}`,
  );

  // ---- 5. Points sample -----------------------------------------------------
  console.log("── Real incident points (DPD-geocoded addresses; deterministic sample)");
  const pts = byMonthPts.map((arr) => {
    if (arr.length <= 100) return arr;
    const out = [];
    for (let i = 0; i < 100; i++) out.push(arr[Math.floor((i * arr.length) / 100)]);
    return out;
  });
  const ptsKept = pts.reduce((s, a) => s + a.length, 0);
  const sampleRate = Math.round(placeableIncidents / ptsKept);
  console.log(
    `  ${placeableIncidents.toLocaleString("en-US")} incidents with in-bbox coords (${coordMissing.toLocaleString("en-US")} without coords, ${coordRejected.toLocaleString("en-US")} out-of-bbox rejected)` +
      ` → kept ${ptsKept.toLocaleString("en-US")} (≤100/month) → 1 per ~${sampleRate}`,
  );

  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`  ${feed.length} feed items (chronological, 2-3 first-in-fetch-order per month, no seriousness bias)`);

  // ---- 6. FBI UCR history 1985–2014 -----------------------------------------
  console.log(
    `── FBI CDE history (${ORI}, 1985–2014, key=${FBI_KEY === "DEMO_KEY" ? "DEMO_KEY" : "FBI_API_KEY"})`,
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
        (k) => /Dallas Police Department/i.test(k) && /Offenses/i.test(k) && !/United States/i.test(k),
      );
      if (!agKey)
        throw new Error(
          `FBI ${offense}: no Dallas Police Department Offenses series (keys: ${Object.keys(actuals)}) — wrong ORI?`,
        );
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
  for (let y = 1985; y <= 2014; y++) {
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
  // ORI PLAUSIBILITY: 1985 Dallas (~1M residents, crime-wave era) must be
  // big-city scale. The scouted ORI TX0570200 returns Balch Springs PD
  // (suburb, ~2–3k offenses/yr) — this check catches any such mix-up.
  if (yearMin === 1985) {
    const t85 = years[0].total;
    assert(
      t85 > 50000 && t85 < 300000,
      `FBI history: 1985 total ${t85} implausible for Dallas PD (expect ~130k) — wrong ORI/series?`,
    );
    console.log(`  1985 plausibility: ${years[0].total.toLocaleString("en-US")} offenses (violent ${years[0].violent.toLocaleString("en-US")} + property ${years[0].property.toLocaleString("en-US")}) — big-city scale ✓`);
  }
  if (droppedYears.length) console.warn(`  dropped partial years: ${JSON.stringify(droppedYears)}`);
  console.log(`  ${years.length} complete years ${yearMin}–${yearMax} (12 months each verified)`);

  // ---- Assemble output files -------------------------------------------------
  const timeline = { months: MONTHS, cells };
  const beatsFile = { cats: CATS, beats };
  const scopeNote =
    "DPD filters this public dataset before release: sexually oriented offenses and offenses where juveniles or children (under 17) are the victim or suspect are EXCLUDED by the source (also excluded: evidence property listings, Social Service Referral offenses, some vehicle identifying info). Sex crimes never appear here, and every total undercounts actual reported crime — this is disclosed on-screen.";
  const summary = {
    slug: "dallas-tx",
    title: "Dallas · TX",
    source: { records: SODA, beats: DIV_URL, hub: HUB },
    fetchedAt,
    dateMin: "2015-01-01",
    dateMax: "2026-06-30",
    months: MONTHS.length,
    totalRecords,
    victimRows: windowRows,
    methodFootnote:
      `Victim/involvement-level source: DPD publishes one row per involved person (servnumid). Rows are deduplicated to incidents by incidentnum, keeping the source's first service-number row (${windowRows.toLocaleString("en-US")} rows → ${totalRecords.toLocaleString("en-US")} incidents; verified per-month against server-side count(distinct incidentnum)). Categories: native nibrs_crimeagainst where present (2017+); documented ucr_offense mapping for the ${basisCounts["ucr-fallback"].toLocaleString("en-US")} pre-NIBRS rows (2015–2016); ${basisCounts.unclassified.toLocaleString("en-US")} rows with neither are counted as 'other'.`,
    scopeNote,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: { "no-division": noDivision },
    excludedOutsideWindow: {
      "rows-before-2015": preRows,
      "rows-after-2026-06 (partial July)": postRows,
    },
    classificationBasis: basisCounts,
    catTotals,
    cats: CATS,
    beatCount: Object.keys(beats).length,
  };
  const history = {
    era: "history",
    taxonomy:
      "FBI UCR Summary (Violent + Property) — a different taxonomy than the DPD RMS/NIBRS categories used from 2015; the two eras bridge at 2015 and are never equated",
    agency: AGENCY,
    ori: ORI,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      `Annual totals are real UCR Summary counts fetched from the FBI CDE summarized agency endpoint for ORI ${ORI} ` +
      `(12 reported months verified per year; 1985 total sanity-checked at big-city scale — the scouted ORI TX0570200 ` +
      `was wrong, returning suburban Balch Springs PD, and was corrected via the CDE byStateAbbr agency lookup). ` +
      `UCR Summary (Violent/Property) and DPD RMS categories are different taxonomies and are presented as distinct ` +
      `eras; division-level detail exists only from 2015 (the DPD open dataset begins 2014-06-01), so the story bridges ` +
      `from citywide annual history to per-division monthly data at 2015. Note the modern era EXCLUDES sexual offenses ` +
      `and juvenile-involved cases (source filter), while UCR history includes rape in Violent — one more reason the ` +
      `eras are never numerically compared. Reproduce with pipeline/sources/dallas-tx.mjs (set FBI_API_KEY).` +
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
    source: "Dallas Police Divisions (official DPD Crime Analysis Unit layer, 8 divisions)",
    sourceUrl: DIV_URL,
    hub: DIV_ITEM,
    fetchedAt,
    license:
      "Public ArcGIS layer by DPD Crime Analysis Unit; disclaimer: graphical representation only, not survey-grade (State of Texas H.B. 1147)",
    method:
      "identity — DPD crime records carry the police division name; uppercased values match the official polygon layer's DIVISION field verbatim, 8 of 8 (≈550 mixed-case source variants normalize to the same 8; no spatial join or approximation)",
    map: Object.fromEntries(DIVISIONS.map((k) => [k, { name: DIV_NAME[k], approx: false }])),
  };
  const points = {
    mode: "real-sample",
    note:
      "Every dot is a real reported incident location as geocoded and published by DPD (street-address grain, from the source's Location1 column) — never synthesized. 99.8% of incidents have usable coordinates; the rest are counted in every total but not plotted, and the video says so. Deterministic sample (≤100/month). NOTE the source-level scope filter: sexual offenses and juvenile-involved cases are excluded by DPD and can never appear as dots.",
    sampleRate,
    months: MONTHS,
    pts,
  };

  // ---- VALIDATE (fail loudly) -------------------------------------------------
  console.log("── Validation");
  assert(
    MONTHS.length === 138 && MONTHS[0] === "2015-01" && MONTHS[137] === "2026-06",
    "months not contiguous 2015-01..2026-06",
  );
  for (let i = 1; i < MONTHS.length; i++) {
    const [py, pm] = MONTHS[i - 1].split("-").map(Number);
    const [cy, cm] = MONTHS[i].split("-").map(Number);
    assert(
      (cm === pm + 1 && cy === py) || (cm === 1 && pm === 12 && cy === py + 1),
      `months not contiguous at ${MONTHS[i]}`,
    );
  }
  assert(Object.keys(beats).length === 8, "beatCount != 8");
  for (const k of Object.keys(cells)) {
    assert(beats[k], `cells key '${k}' has no beat polygon`);
    assert(cells[k].length === MONTHS.length, `cells['${k}'] length != ${MONTHS.length}`);
  }
  for (const k of Object.keys(beats)) assert(cells[k], `division '${k}' missing from cells`);
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
  assert(feed.length >= 250, `feed too thin: ${feed.length}`);
  for (const f of feed) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(f.date), `feed bad date ${f.date}`);
    assert(f.date >= "2015-01-01" && f.date <= "2026-06-30", `feed date out of span ${f.date}`);
    assert(HOODS.has(f.beat), `feed bad beat ${f.beat}`);
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
    placeableIncidents,
    coordMissing,
    coordRejected,
    ptsKept,
    sampleRate,
    catTotals,
    basisCounts,
    preRows,
    postRows,
    wholeRows,
    windowRows,
    victimDupRows,
    catDisagree,
    divDisagree,
    binMismatch,
    binMissing,
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
  placeableIncidents,
  coordMissing,
  coordRejected,
  ptsKept,
  sampleRate,
  catTotals,
  basisCounts,
  preRows,
  postRows,
  wholeRows,
  windowRows,
  victimDupRows,
  catDisagree,
  divDisagree,
  binMismatch,
  binMissing,
}) {
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const ucrByCat = { persons: [], property: [], society: [], other: [] };
  for (const [k, c] of Object.entries(UCR_CAT)) ucrByCat[c].push(k);
  const md = `# Provenance — Dallas, TX

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## ⚠ SOURCE SCOPE FILTER — read first

**DPD filters this public dataset before release.** Quoting the dataset description ("Among the exclusions are"):

> 1.) Sexually oriented offenses
> 2.) Offenses where juveniles or children (individuals under 17 years of age) are the victim or suspect
> 3.) Listing of property items that are considered evidence
> 4.) Social Service Referral offenses
> 5.) Identifying vehicle information in certain offenses

**Sexual offenses and juvenile-involved cases never appear in this data.** Every count, map, and trend below therefore **undercounts actual reported crime**, and rape/sexual-assault categories are structurally absent. This is disclosed on-screen (data note) and in \`summary.scopeNote\`. The city also states the dataset is published "for research purposes only" and that the authoritative source is DPD's Crime Analytics Dashboard.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **Police Incidents** (Socrata \`qv6i-rri7\`) |
| Publisher | Dallas Police Department (DPD), via dallasopendata.com |
| Landing page | ${HUB} |
| API | ${SODA} |
| Fetched | ${fetchedAt} |
| License | **ODC-BY** (Open Data Commons Attribution, http://opendatacommons.org/licenses/by/1.0/), attribution "Dallas Police Department" |
| Span | RMS incidents June 1, 2014 → current; **granular window 2015-01-01 → 2026-06-30** (first full calendar year → last full month, measured) |
| Records used | ${fmt(windowRows)} victim-level rows → **${fmt(summary.totalRecords)} incidents** (deduplicated, see below) |
| Source caveat | Preliminary classifications, may change with investigation; DPD explicitly does not guarantee accuracy/completeness and warns against over-time comparison — trends are shown with this caveat |

### Row grain + dedupe (disclosed method)
The source is **victim/involvement-level**: one row per involved person, \`servnumid\` = \`incidentnum\` + per-person suffix (\`-01\`, \`-02\`, …). Measured ${fmt(windowRows)} rows → ${fmt(summary.totalRecords)} distinct incidents in-window (~${(windowRows / summary.totalRecords).toFixed(2)}× inflation). Dedupe rule: keep the row with the **lexicographically smallest servnumid** (the source's first service number, normally \`-01\`) — deterministic, no seriousness bias. Validation: the client-side dedupe is reconciled **per month** against an independent server-side \`count(distinct incidentnum)\` — exact match required for all 138 months. Among the ${fmt(victimDupRows)} dropped extra-victim rows, ${fmt(catDisagree)} carry a different category and ${fmt(divDisagree)} a different division than the kept row (an incident with a murdered victim and an assaulted victim counts once, under the first service number's offense).

### Windowing (disclosed exclusions)
Whole dataset at fetch time: **${fmt(wholeRows)} rows** = ${fmt(preRows)} pre-2015 + ${fmt(windowRows)} window + ${fmt(postRows)} post-window (identity validated in-script).
- **${fmt(preRows)} rows dated before 2015-01-01** are excluded from the granular era: the source starts 2014-06-01 (2014 is a partial year) and carries a thin tail of old occurrence dates back to 1967 (incidents reported long after the fact — real records, not junk, but outside the honest monthly window).
- **${fmt(postRows)} rows dated 2026-07-01+** (partial July at fetch) are excluded; the window ends at the last FULL month, 2026-06 (measured: June ~10.5k rows vs May ~11k — complete; July mid-month).

### date1 parsing (TEXT column — handled deliberately)
\`date1\` ("Date1 of Occurrence") is **TEXT** ("YYYY-MM-DD HH:MM:SS.NNNNNNN"), verified **0 null and 0 malformed** across the whole dataset; window filters use lexicographic comparison, month binning uses the "YYYY-MM" prefix. Sanity check against DPD's own \`year1\`/\`month1\` occurrence fields: **${fmt(binMismatch)} mismatched + ${fmt(binMissing)} missing of ${fmt(windowRows)} rows** (<0.5%, asserted in-script).

### Fields used
\`incidentnum\` · \`servnumid\` · \`date1\` (TEXT) · \`year1\`/\`month1\` (binning sanity) · \`division\` · \`nibrs_crimeagainst\` · \`ucr_offense\` · \`offincident\` · \`geocoded_column\` (Socrata location).

### Category mapping — two documented bases (counts per basis)
| Basis | Incidents | Rule |
|-------|----------:|------|
| **Native NIBRS** (2017+) | ${fmt(basisCounts.native)} | \`nibrs_crimeagainst\`: PERSON→persons, PROPERTY→property, SOCIETY→society |
| Native mixed/misc → other | ${fmt(basisCounts["native-other"])} | "PERSON, PROPERTY, OR SOCIETY" (DPD's mixed-target bucket: ~62% ALL OTHER OFFENSES + ~38% traffic) and "MISCELLANEOUS" — context only, never counted as Group A crime |
| **UCR fallback** (2015–2016) | ${fmt(basisCounts["ucr-fallback"])} | The source's NIBRS fields are blank before 2017 (>99.9% of 2015–2016 rows); categories derive from \`ucr_offense\` — 49 values, fully enumerated below |
| Unclassified → other | ${fmt(basisCounts.unclassified)} | Neither field populated (mostly ~1k/yr recent rows) — counted, shown as \`other\` |

**The 2015–2016 and 2017+ segments therefore classify by different source fields** — both follow the same FBI crimes-against convention, and the seam is disclosed here rather than hidden.

#### UCR fallback table (complete, 49 values — audit fails loudly on anything new)
| cat | ucr_offense values |
|-----|--------------------|
| \`persons\` | ${ucrByCat.persons.join(" · ")} |
| \`property\` | ${ucrByCat.property.join(" · ")} (robbery + fraud + arson are crimes against property per NIBRS) |
| \`society\` | ${ucrByCat.society.join(" · ")} (NIBRS Group B offenses are designated crimes against society; "ORANIZED CRIME" is a source typo variant) |
| \`other\` | ${ucrByCat.other.join(" · ")} (non-offense reports: found/lost property, accidents, injured-person, death investigations, catch-all "OTHERS") |

#### Window totals by cat
| cat | incidents |
|---|--:|
| persons | ${fmt(catTotals.persons)} |
| property | ${fmt(catTotals.property)} |
| society | ${fmt(catTotals.society)} |
| other (mixed / non-criminal / unclassified) | ${fmt(catTotals.other)} |

### Coverage
- Placed (one of the 8 official DPD divisions): **${fmt(summary.placedRecords)}** (${summary.coveragePct}%)
- Unplaced: ${fmt(summary.unplacedRecords)} incidents with a blank \`division\` — kept in every citywide total and disclosed.
- Identities validated in-script: per-month client dedupe == server \`count(distinct incidentnum)\` (independent reconciliation, 138/138 months); cells+unplaced == citywide per month; row partition pre+window+post == whole dataset.

## Geometry source — official DPD division polygons

| Field | Value |
|-------|-------|
| Dataset | **Dallas Police Divisions** — 8 polygons (Central, Northeast, Southeast, Southwest, Northwest, North Central, South Central, CBD), field \`DIVISION\` |
| FeatureServer | https://services1.arcgis.com/In9TiV3Fv4nmmrag/arcgis/rest/services/Division/FeatureServer/0 |
| Publisher | DPD Crime Analysis Unit (ArcGIS Online item \`3ce570ceaeaf470d974f0d8695271bcf\`, owner \`dwight.beaty_DPDCAU\`) |
| Join key | \`DIVISION\` — matches the crime data's uppercased \`division\` values **verbatim, 8 of 8** (identity join; ≈550 mixed-case crime-data variants like "NorthEast" normalize to the same keys) |
| Disclaimer (verbatim) | "This data is to be used for graphical representation only. The accuracy is not to be taken/used as data produced by a Registered Professional Land Surveyor (RPLS) for the State of Texas. … (State of Texas: H.B. 1147)" |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

Only **8 regions** — the leaderboard shows top 6 and the region quiz still works (same note as Nashville/Memphis in the batch spec). "CBD" is displayed as "Downtown (CBD)".

## Real incident points (\`points.json\`)

Every dot is a real incident location **geocoded and published by DPD** (street-address grain, Socrata \`geocoded_column\`), never synthesized. In-window: ${fmt(placeableIncidents)} incidents (99.8%) have usable in-bbox coordinates; ${fmt(coordMissing)} lack coordinates and ${fmt(coordRejected)} carry out-of-bbox/junk coordinates (gate: lat ${BBOX.latMin}–${BBOX.latMax}, lng ${BBOX.lngMin}–${BBOX.lngMax}) — all still counted in every total, only missing from the dot layer. Deterministic sample: per month, even-stride ≤100 from fetch order → **${fmt(ptsKept)} points ≈ 1 per ${sampleRate}**. Remember the scope filter: sexual offenses and juvenile-involved cases can never appear as dots because DPD excludes them at the source.

## Historical source — FBI UCR (${history.yearMin}–${history.yearMax} deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Dallas Police Department — **ORI \`${ORI}\`** (verified: returns "Dallas Police Department Offenses" series) |
| ⚠ ORI correction | The batch-spec scouted ORI \`TX0570200\` is **wrong** — CDE returns *Balch Springs PD* for it. Corrected via the CDE \`agency/byStateAbbr/TX\` lookup; 1985 plausibility asserted in-script (1985 total ≈130k offenses — big-city scale, vs ~2–3k for a suburb) |
| Endpoint | ${history.sourceUrl} (and \`/property-crime\`) |
| Span | ${history.yearMin}–${history.yearMax}, annual Violent + Property (12 reported months verified per year)${droppedYears.length ? ` — dropped partial years: ${droppedYears.map((d) => d.year).join(", ")}` : ""} |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set \`FBI_API_KEY\`) |

UCR Summary (Violent/Property) is a **different taxonomy** than the DPD RMS data — the eras are presented as distinct and bridge at 2015; they are never equated. Extra reason here: UCR Violent **includes rape**, while the modern DPD dataset **excludes all sexual offenses** — a direct numeric comparison would be dishonest and is never made. No monthly or division detail is implied for ${history.yearMin}–${history.yearMax}.

## Reproduce

\`\`\`bash
FBI_API_KEY=… node pipeline/sources/dallas-tx.mjs
\`\`\`
`;
  writeFileSync(PROV_PATH, md);
  console.log(`  wrote data/dallas-tx/PROVENANCE.md`);
}

// ---- wiki/Data-Provenance.md append -------------------------------------------
function appendWiki({ summary, history }) {
  if (!existsSync(WIKI_PATH)) return;
  const cur = readFileSync(WIKI_PATH, "utf8");
  if (cur.includes("## Dallas, TX")) {
    console.log("  wiki/Data-Provenance.md already has a Dallas section — skipped");
    return;
  }
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const section = `
## Dallas, TX (\`dallas-tx\`)

- **Primary source:** Police Incidents (Socrata \`qv6i-rri7\`, ${HUB}) —
  **ODC-BY** (Open Data Commons Attribution), attribution "Dallas Police
  Department". RMS incidents June 2014 → current; preliminary classifications;
  published "for research purposes only".
- **⚠ Source scope filter (disclosed prominently, on-screen too):** DPD
  excludes **sexually oriented offenses** and **offenses where juveniles or
  children (under 17) are the victim or suspect** (plus evidence property
  lists, Social Service Referrals, some vehicle info) before publication —
  sex crimes never appear and all totals undercount actual reported crime.
- **Row grain:** victim/involvement-level (one row per person, \`servnumid\`);
  deduplicated to incidents by \`incidentnum\` keeping the first service-number
  row — ${fmt(summary.victimRows)} rows → ${fmt(summary.totalRecords)} incidents, reconciled per month
  against server-side \`count(distinct incidentnum)\` (exact, 138/138).
- **Spatial unit:** the **8 official DPD divisions** (Central, Northeast,
  Southeast, Southwest, Northwest, North Central, South Central, CBD) — the
  crime data's \`division\` (uppercased) matches the official DPD Crime
  Analysis Unit polygon layer field \`DIVISION\` verbatim, 8 of 8 (identity
  join). Only 8 regions — leaderboard top-6 note as in Nashville/Memphis.
- **Categories:** native \`nibrs_crimeagainst\` (2017+); for 2015–2016 the
  source's NIBRS fields are blank, so categories derive from a **documented
  complete 49-value \`ucr_offense\` mapping** (crimes-against convention);
  DPD's mixed "PERSON, PROPERTY, OR SOCIETY" + "MISCELLANEOUS" buckets and
  unclassified rows → \`other\` (context, never Group A). Seam disclosed.
- **date1 is TEXT** — verified 0 null/0 malformed; lexicographic windowing;
  month binning sanity-checked against the source's \`year1\`/\`month1\`.
- **Deep-history source (${history.yearMin}–${history.yearMax}):** FBI CDE — Dallas PD **ORI ${ORI}**
  (the scouted TX0570200 was Balch Springs PD — corrected via byStateAbbr
  lookup; 1985 total ≈130k asserted big-city-plausible). Annual Violent +
  Property, ${history.years.length} full years. UCR includes rape; the modern era excludes
  sexual offenses — eras bridge at 2015 and are never numerically compared.
- **Span:** ${history.yearMin}–${history.yearMax} (FBI UCR annual) + 2015-01-01 → 2026-06-30 (DPD RMS
  with division detail, ${summary.months} months; last FULL month measured).
- **Records:** ${fmt(summary.totalRecords)} incidents in-window · ${fmt(summary.placedRecords)} placed in an
  official division (**${summary.coveragePct}% coverage**) · ${fmt(summary.unplacedRecords)} unplaced
  (blank division), kept in totals and disclosed.
- **Real dots:** DPD-geocoded street addresses (\`geocoded_column\`, 99.8%
  coverage) — deterministic ≤100/month sample of real locations; no-coordinate
  incidents counted but not plotted.
- **License:** ODC-BY (records); DPD CAU public ArcGIS layer (polygons,
  graphical-representation disclaimer, Texas H.B. 1147).
- **Detail:** [\`data/dallas-tx/PROVENANCE.md\`](../data/dallas-tx/PROVENANCE.md)

### Category mapping (nibrs_crimeagainst → cat, native 2017+)

| Source value | cat |
|--------------|-----|
| PERSON | \`persons\` |
| PROPERTY | \`property\` |
| SOCIETY | \`society\` |
| PERSON, PROPERTY, OR SOCIETY · MISCELLANEOUS · (blank) | \`other\` (mixed / non-criminal / unclassified — context only) |

2015–2016 rows (blank NIBRS fields) use the complete 49-value \`ucr_offense\`
fallback table in \`data/dallas-tx/PROVENANCE.md\`.
`;
  // insert before "## Ranked source types" if present, else append
  const marker = "## Ranked source types";
  const idx = cur.indexOf(marker);
  const next =
    idx >= 0 ? cur.slice(0, idx) + section.trimStart() + "\n" + cur.slice(idx) : cur + section;
  writeFileSync(WIKI_PATH, next);
  console.log("  appended Dallas section to wiki/Data-Provenance.md");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
