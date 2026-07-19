// Memphis, TN — MPD Public Safety Incidents source pipeline (fetch → normalize → validate).
//
// BINDING RULE: never fabricate — every figure written by this script comes
// straight from a queryable public source; every gap is disclosed.
//
// Sources:
//   Incidents  : "MPD Public Safety Incidents" ArcGIS layer (updated each
//                morning by 6:00 am), Memphis Police Department via the City
//                of Memphis Open Data Hub (data.memphistn.gov). License NOT
//                stated on the item — attributed to "Memphis Police Department
//                via City of Memphis Open Data Hub".
//                https://services2.arcgis.com/saWmpKJIUAjyyNVc/arcgis/rest/services/MPD_Public_Safety_Incidents/FeatureServer/0
//                ⚠ SOURCE OMISSION (item description, verbatim): "Note that sex
//                crimes and juvenile-specific crime types are omitted from this
//                dataset." — disclosed prominently in PROVENANCE and summary.
//   Polygons   : "MPD Precinct Areas" (MPD_Station_Areas/FeatureServer/1) —
//                the 9 official MPD precinct (station) areas, same City of
//                Memphis ArcGIS org. License not stated.
//   History    : FBI Crime Data Explorer (CDE) summarized agency counts,
//                Memphis PD ORI TNMPD0000 (verified live: full 12-month series
//                1985–2019 for both Violent and Property; 1985 violent = 9,738,
//                plausible for Memphis). NOTE: the scouted ORI TN0790100 is the
//                COLLIERVILLE Police Department (1985 violent = 20 —
//                implausible) and was rejected by the plausibility check.
//
// Eras (honesty structure):
//   1985–2019  FBI UCR annual citywide totals (no precinct detail implied)
//   2020-01 → 2026-06  MPD NIBRS-classified incidents with precinct detail.
//                Measured live: the layer's earliest Offense_Datetime is
//                exactly 2020-01-01 00:00 Memphis local time (the item blurb
//                says "data goes back to 2019", but no 2019 occurrences exist
//                in the layer — the old 2006+ dataset was retired). 2026-07 is
//                a partial month at fetch time — excluded and disclosed.
//
// DEDUPE: the layer publishes OFFENSE-level rows — one incident (Crime_ID)
// can appear as several rows (multiple offenses per incident; ~1.11× measured).
// We dedupe by `Crime_ID`: one incident = one distinct Crime_ID; the kept row
// is the deterministic minimum by (Offense_Datetime, ObjectId). Independent
// reconciliation: the server's COUNT(DISTINCT Crime_ID) per month and for the
// whole window must equal the client-side dedupe exactly.
//
// TIME (verified live): `Offense_Datetime` stores true UTC instants — the
// dataset begins exactly at 2020-01-01T06:00:00Z = 2020-01-01 00:00 CST, and
// the hour-of-day histogram dips at 10:00Z = 4–5 AM Memphis local (the
// universal overnight crime lull). All month binning is done in Memphis local
// time (America/Chicago), and every server-side month window uses the matching
// UTC boundary for local midnight (CST/CDT aware).
//
// COORDS: Latitude/Longitude are published at ~3 decimal places (~110 m,
// block-level anonymization) — disclosed; dots are still the source's own
// published positions, never synthesized. Missing locations are 0,0.
//
// REGIONS: only 9 precincts (like Nashville's 9 police precincts) — the
// leaderboard topN stays 6 and the quiz still works; the small region count is
// disclosed in PROVENANCE and the wiki.
//
//   node pipeline/sources/memphis-tn.mjs   (set FBI_API_KEY to avoid DEMO_KEY limits)
//
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const OUT_DIR = resolve(repoRoot, "data/memphis-tn/normalized");
const RAW_DIR = resolve(repoRoot, "data/memphis-tn/raw");
const PROV_PATH = resolve(repoRoot, "data/memphis-tn/PROVENANCE.md");
const WIKI_PATH = resolve(repoRoot, "wiki/Data-Provenance.md");

const ARC =
  "https://services2.arcgis.com/saWmpKJIUAjyyNVc/arcgis/rest/services/MPD_Public_Safety_Incidents/FeatureServer/0/query";
const ARC_LAYER =
  "https://services2.arcgis.com/saWmpKJIUAjyyNVc/arcgis/rest/services/MPD_Public_Safety_Incidents/FeatureServer/0";
const HUB = "https://data.memphistn.gov/";
const HUB_ITEM = "https://www.arcgis.com/home/item.html?id=12b51ce4d5a14493ab6cc05d32e0c1ee";
const PREC =
  "https://services2.arcgis.com/saWmpKJIUAjyyNVc/arcgis/rest/services/MPD_Station_Areas/FeatureServer/1";
const PREC_ITEM = "https://www.arcgis.com/home/item.html?id=0334e3fb182a4460ac075b17ae8a1126";
const ORI = "TNMPD0000";
const AGENCY = "Memphis Police Department";
const FBI_KEY = process.env.FBI_API_KEY || "DEMO_KEY";
const TZ = "America/Chicago";

const HIST_FROM = "01-1985";
const HIST_TO = "12-2019";

// NIBRS_Offense_Group (native crimes-against field) → cat, keyed by TRIMMED
// value (source values carry trailing spaces, e.g. "PERSON, PROPERTY, OR
// SOCIETY "). Verified live: these five values are exhaustive over the layer;
// any new value fails the run loudly. "PERSON, PROPERTY, OR SOCIETY" is the
// NIBRS Group B catch-all attached only to UCR_Category "ALL OTHER OFFENSES" —
// it cannot honestly be assigned to one crimes-against bucket, so it goes to
// `other` (context, never counted as persons/property/society). "CRIMES
// AGAINST PERSON" (singular) is the source's spelling on FAMILY OFFENSES,
// NONVIOLENT rows. The full UCR_Category × NIBRS_Group table is documented in
// PROVENANCE.md.
const OG_OF = {
  "CRIMES AGAINST PERSONS": "persons",
  "CRIMES AGAINST PERSON": "persons",
  "CRIMES AGAINST PROPERTY": "property",
  "CRIMES AGAINST SOCIETY": "society",
  "PERSON, PROPERTY, OR SOCIETY": "other",
};
const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff2e63" },
  property: { label: "Crimes Against Property", color: "#ffc233" },
  society: { label: "Crimes Against Society", color: "#34e0e0" },
  other: { label: "Other / unclassified (context)", color: "#7486a0" },
};
const CAT_KEYS = ["persons", "property", "society", "other"]; // catIdx order

// Valid Memphis coordinate box (spec). Missing locations are published as 0,0;
// a handful of real-looking coords fall outside the box (counted, not plotted).
const BBOX = { latMin: 34.98, latMax: 35.27, lngMin: -90.14, lngMax: -89.64 };

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

// Feature query with resultOffset paging (layer maxRecordCount = 1000).
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

// Server-side COUNT(DISTINCT Crime_ID) — the layer supportsCountDistinct.
async function arcDistinctIncidents(where, label) {
  const j = await postJSON(
    ARC,
    {
      f: "json",
      where,
      returnCountOnly: "true",
      returnDistinctValues: "true",
      outFields: "Crime_ID",
      returnGeometry: "false",
    },
    { label },
  );
  const n = j.count;
  if (!Number.isFinite(n)) throw new Error(`${label}: bad distinct-count response`);
  return n;
}

// ---- Memphis local-time helpers -------------------------------------------
// Offense_Datetime is a true UTC instant; Memphis wall-clock = America/Chicago.
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

// UTC instant of local midnight for "YYYY-MM-DD" (CST=UTC-6 / CDT=UTC-5 aware).
function utcOfLocalMidnight(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  for (const offH of [5, 6]) {
    const t = Date.UTC(y, m - 1, d, offH, 0, 0);
    if (ymdOfMs(t) === ymd && hmOfMs(t) === "00:00") return t;
  }
  throw new Error(`utcOfLocalMidnight: no CST/CDT offset reproduces local midnight for ${ymd}`);
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
const MONTHS = monthRange("2020-01", "2026-06"); // 78
const MONTH_IDX = new Map(MONTHS.map((m, i) => [m, i]));
const nextYm = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
// where-clause for one LOCAL month (UTC boundaries, DST-aware)
const monthWhere = (ym) => {
  const a = utcOfLocalMidnight(`${ym}-01`);
  const b = utcOfLocalMidnight(`${nextYm(ym)}-01`);
  return `Offense_Datetime >= TIMESTAMP '${sqlTs(a)}' AND Offense_Datetime < TIMESTAMP '${sqlTs(b)}'`;
};
const SPAN_START_MS = utcOfLocalMidnight("2020-01-01");
const SPAN_END_MS = utcOfLocalMidnight("2026-07-01");
const SPAN_WHERE = `Offense_Datetime >= TIMESTAMP '${sqlTs(SPAN_START_MS)}' AND Offense_Datetime < TIMESTAMP '${sqlTs(SPAN_END_MS)}'`;

// Precinct join key: incident values are UPPERCASE ("MT MORIAH"); the polygon
// layer uses proper case with punctuation ("Mt. Moriah"). Normalize = uppercase
// + strip periods + collapse whitespace. Deterministic, no approximation.
const precKey = (s) =>
  String(s)
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();

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

  // ---- 1. Official precinct polygons ---------------------------------------
  console.log("── MPD Precinct Areas (9 official precinct/station areas)");
  const gj = await postJSON(
    `${PREC}/query`,
    { f: "geojson", where: "1=1", outFields: "precinct,prct_code,Area_SqMi" },
    { label: "precincts geojson" },
  );
  assert(gj?.type === "FeatureCollection" && Array.isArray(gj.features), "PREC: bad geojson");
  assert(gj.features.length === 9, `PREC: expected 9 features, got ${gj.features.length}`);

  const beats = {};
  gj.features.forEach((f, idx) => {
    const raw = f.properties?.precinct;
    assert(typeof raw === "string" && raw.trim().length > 0, `PREC feature ${idx}: missing precinct`);
    const key = precKey(raw); // e.g. "Mt. Moriah" → "MT MORIAH" (incident-data form)
    assert(!beats[key], `PREC: duplicate precinct '${key}'`);
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
    assert(A > 0, `PREC '${key}': zero area`);
    beats[key] = {
      key,
      name: raw.trim(), // resident-facing proper name from the polygon layer, e.g. "Mt. Moriah"
      servcen: String(f.properties?.prct_code ?? ""),
      beat: idx,
      centroid: [Number((X / A).toFixed(6)), Number((Y / A).toFixed(6))],
      polygon: outerRings,
      geomType: g.type,
    };
  });
  const PRECINCTS = new Set(Object.keys(beats));
  console.log(`  ${PRECINCTS.size} precincts: ${[...PRECINCTS].join(", ")}`);

  // ---- 2. Full monthly pulls + client-side dedupe by Crime_ID --------------
  console.log("── Full pull (2020-01…2026-06, Memphis local months) + dedupe by Crime_ID");
  // incidents: Crime_ID → kept offense row (deterministic minimum) + stats
  const incidents = new Map();
  const monthIncidentSets = MONTHS.map(() => new Set()); // incidents with ≥1 row in month
  let windowRows = 0;

  for (let mi = 0; mi < MONTHS.length; mi++) {
    const ym = MONTHS[mi];
    const feats = await arcAll(
      {
        where: monthWhere(ym),
        outFields:
          "ObjectId,Crime_ID,Offense_Datetime,UCR_Category,UCR_Description,NIBRS_Group,NIBRS_Offense_Group,Precinct,Latitude,Longitude,Street_Address",
        returnGeometry: "false",
        orderByFields: "ObjectId",
        resultRecordCount: "1000",
      },
      { label: `pull ${ym}` },
    );
    for (const f of feats) {
      const a = f.attributes;
      windowRows++;
      assert(Number.isFinite(a.Offense_Datetime), `pull ${ym}: null Offense_Datetime`);
      assert(ymOfMs(a.Offense_Datetime) === ym, `pull ${ym}: row local-month mismatch (${a.Offense_Datetime})`);
      const cid = a.Crime_ID;
      assert(typeof cid === "string" && cid.length > 0, `pull ${ym}: missing Crime_ID`);
      const ogRaw = a.NIBRS_Offense_Group;
      let cat;
      if (ogRaw == null) {
        // verified live: exactly one row in the layer has null classification
        // fields (UCR_Incident_Code 850) — context bucket, disclosed
        cat = "other";
      } else {
        cat = OG_OF[String(ogRaw).trim()];
        assert(cat, `pull ${ym}: unmapped NIBRS_Offense_Group '${ogRaw}'`);
      }
      const grp = a.NIBRS_Group == null ? "" : String(a.NIBRS_Group).trim();
      assert(grp === "A" || grp === "B" || ogRaw == null, `pull ${ym}: unexpected NIBRS_Group '${a.NIBRS_Group}'`);
      const precRaw = a.Precinct == null ? null : precKey(a.Precinct);
      const prec = precRaw !== null && PRECINCTS.has(precRaw) ? precRaw : null;
      const row = {
        ms: a.Offense_Datetime,
        oid: a.ObjectId,
        cat,
        catRaw: a.UCR_Category == null ? "(unclassified)" : String(a.UCR_Category).trim(),
        grp: ogRaw == null ? "—" : grp,
        desc: a.UCR_Description == null ? "" : String(a.UCR_Description).trim(),
        prec, // one of the 9 precincts, or null
        precRawVal: a.Precinct == null ? "(null)" : String(a.Precinct).trim() || "(blank)",
        lat: a.Latitude,
        lng: a.Longitude,
        place: a.Street_Address == null ? "" : String(a.Street_Address).trim(),
      };
      monthIncidentSets[mi].add(cid);
      const cur = incidents.get(cid);
      if (!cur) {
        incidents.set(cid, { kept: row, rows: 1, cats: new Set([cat]), precs: new Set([prec]), minYm: ym, maxYm: ym });
      } else {
        cur.rows++;
        cur.cats.add(cat);
        cur.precs.add(prec);
        if (ym < cur.minYm) cur.minYm = ym;
        if (ym > cur.maxYm) cur.maxYm = ym;
        // deterministic kept row: min (Offense_Datetime, ObjectId)
        const k = cur.kept;
        if (row.ms < k.ms || (row.ms === k.ms && row.oid < k.oid)) cur.kept = row;
      }
    }
    // INDEPENDENT per-month reconciliation: the server's COUNT(DISTINCT
    // Crime_ID) for this local month must equal what we just pulled.
    const distinctSrv = await arcDistinctIncidents(monthWhere(ym), `distinct ${ym}`);
    assert(
      distinctSrv === monthIncidentSets[mi].size,
      `${ym}: server distinct incidents ${distinctSrv} != pulled ${monthIncidentSets[mi].size}`,
    );
    if ((mi + 1) % 12 === 0)
      console.log(`  …through ${ym}: ${windowRows} rows, ${incidents.size} incidents so far`);
  }
  const totalRecords = incidents.size; // deduped incidents in the window
  console.log(`  ${windowRows} offense rows → ${totalRecords} deduped incidents (by Crime_ID)`);

  // Global independent reconciliation of the dedupe + row totals
  const srvWindowRows = await arcCount(SPAN_WHERE, "window row count");
  assert(srvWindowRows === windowRows, `window rows: server ${srvWindowRows} != pulled ${windowRows}`);
  const srvDistinct = await arcDistinctIncidents(SPAN_WHERE, "window distinct incidents");
  assert(srvDistinct === totalRecords, `window distinct: server ${srvDistinct} != deduped ${totalRecords}`);
  console.log(`  server COUNT(DISTINCT Crime_ID) == client dedupe: ${totalRecords} ✓ (per month and globally)`);

  // Dedupe disclosure stats
  let multiRowIncidents = 0,
    crossCatIncidents = 0,
    crossPrecIncidents = 0,
    crossMonthIncidents = 0;
  for (const v of incidents.values()) {
    if (v.rows > 1) multiRowIncidents++;
    if (v.cats.size > 1) crossCatIncidents++;
    if (v.precs.size > 1) crossPrecIncidents++;
    if (v.minYm !== v.maxYm) crossMonthIncidents++;
  }
  console.log(
    `  dedupe: ${multiRowIncidents} incidents had >1 offense row; ${crossCatIncidents} spanned categories, ` +
      `${crossPrecIncidents} spanned precincts, ${crossMonthIncidents} spanned months (binned at earliest row)`,
  );

  // ---- 3. Window-edge disclosure (partial month, null dates) ---------------
  console.log("── Window edges (excluded & disclosed)");
  const preRows = await arcCount(
    `Offense_Datetime < TIMESTAMP '${sqlTs(SPAN_START_MS)}'`,
    "pre-2020 rows",
  );
  const postRows = await arcCount(
    `Offense_Datetime >= TIMESTAMP '${sqlTs(SPAN_END_MS)}'`,
    "post-window rows",
  );
  const nullDate = await arcCount(`Offense_Datetime IS NULL`, "null-date rows");
  const grandRows = await arcCount(`1=1`, "grand row total");
  assert(
    preRows + windowRows + postRows + nullDate === grandRows,
    `row accounting: ${preRows}+${windowRows}+${postRows}+${nullDate} != ${grandRows}`,
  );
  assert(preRows === 0, `expected 0 pre-2020 rows (dataset starts 2020-01-01 local), got ${preRows}`);
  console.log(
    `  grand ${grandRows} rows = ${preRows} pre-2020 + ${windowRows} in-window + ` +
      `${postRows} partial 2026-07 + ${nullDate} null-date`,
  );

  // ---- 4. Bin deduped incidents: precinct × month × cat --------------------
  console.log("── Timeline: per-precinct monthly incident counts by category");
  const cells = {};
  for (const k of PRECINCTS)
    cells[k] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  const junkByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  const cityByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  const catRawTotals = {}; // "UCR_Category|NIBRS_Group|cat" → incident count (kept rows)
  const unplacedPrecValues = {}; // verbatim non-station Precinct values → incident count

  for (const v of incidents.values()) {
    const k = v.kept;
    const mi = MONTH_IDX.get(ymOfMs(k.ms));
    assert(mi !== undefined, `bin: kept row outside span (${k.ms})`);
    cityByCatMonth[k.cat][mi]++;
    catTotals[k.cat]++;
    const mk = `${k.catRaw}|${k.grp}|${k.cat}`;
    catRawTotals[mk] = (catRawTotals[mk] || 0) + 1;
    if (k.prec !== null) cells[k.prec][mi][k.cat]++;
    else {
      junkByCatMonth[k.cat][mi]++;
      unplacedPrecValues[k.precRawVal] = (unplacedPrecValues[k.precRawVal] || 0) + 1;
    }
  }
  // Identity: placed + unplaced == citywide, per cat per month
  for (const cat of CAT_KEYS) {
    for (let mi = 0; mi < MONTHS.length; mi++) {
      let placed = 0;
      for (const k of PRECINCTS) placed += cells[k][mi][cat];
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
  for (const k of PRECINCTS)
    for (const cc of cells[k]) placedRecords += cc.persons + cc.property + cc.society + cc.other;
  const noPrecinct = CAT_KEYS.reduce(
    (s, c) => s + junkByCatMonth[c].reduce((a, b) => a + b, 0),
    0,
  );
  const unplacedRecords = noPrecinct;
  assert(placedRecords + unplacedRecords === totalRecords, "placed+unplaced != total");
  const coveragePct = Math.round((placedRecords / totalRecords) * 1000) / 10;
  console.log(
    `  total ${totalRecords} incidents = placed ${placedRecords} + no-precinct/special-unit ${noPrecinct}` +
      ` → coverage ${coveragePct}%`,
  );
  console.log(
    `  unplaced Precinct values: ${Object.entries(unplacedPrecValues)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k}=${n}`)
      .join(", ")}`,
  );

  // ---- 5. Sampled REAL points ----------------------------------------------
  console.log("── Real incident points (MPD-published ~3-decimal block coords; deterministic sample)");
  const byMonth = MONTHS.map(() => []);
  let placeableCount = 0,
    noCoords = 0;
  // deterministic order: sort incidents by (ms, Crime_ID)
  const sortedIncidents = [...incidents.entries()]
    .map(([cid, v]) => ({ cid, ...v.kept, ym: ymOfMs(v.kept.ms) }))
    .sort((a, b) => a.ms - b.ms || (a.cid < b.cid ? -1 : a.cid > b.cid ? 1 : 0));
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
      noCoords++; // 0,0 sentinel (missing location) or outside the city box
      continue;
    }
    placeableCount++;
    const mi = MONTH_IDX.get(it.ym);
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
  // 12 real incidents per quarter (26 quarters → 312 items), chosen by
  // deterministic even-stride across the quarter's chronologically-sorted
  // placed incidents (no category/severity bias).
  console.log("── Feed: 12 real incidents per quarter, 2020-Q1 … 2026-Q2 (even-stride)");
  const feed = [];
  for (let y = 2020; y <= 2026; y++) {
    for (let q = 0; q < 4; q++) {
      const qMonths = [0, 1, 2].map((k) => `${y}-${String(q * 3 + 1 + k).padStart(2, "0")}`);
      if (MONTH_IDX.get(qMonths[0]) === undefined) continue;
      const pool = sortedIncidents.filter(
        (it) => it.prec !== null && qMonths.includes(it.ym),
      );
      assert(pool.length >= 12, `feed ${y}Q${q + 1}: only ${pool.length} placed incidents`);
      for (let i = 0; i < 12; i++) {
        const it = pool[Math.floor((i * pool.length) / 12)];
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
          place: it.place || beats[it.prec].name,
          beat: it.prec,
          cat: it.cat,
        });
      }
    }
  }
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`  ${feed.length} feed items (chronological, no seriousness bias)`);

  // ---- 7. FBI UCR history 1985–2019 -----------------------------------------
  console.log(
    `── FBI CDE history (${ORI}, 1985–2019, key=${FBI_KEY === "DEMO_KEY" ? "DEMO_KEY" : "FBI_API_KEY"})`,
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
      // ⚠ The CDE returns BOTH "… Offenses" and "… Clearances" series for this
      // agency — match the Offenses series explicitly (never clearances).
      const agKey = Object.keys(actuals).find((k) => /Memphis/i.test(k) && /Offenses/i.test(k));
      if (!agKey)
        throw new Error(`FBI ${offense}: no "Memphis … Offenses" series (keys: ${Object.keys(actuals)})`);
      const monthly = actuals[agKey] || {};
      if (Object.keys(monthly).length === 0)
        throw new Error(
          `FBI ${offense}: empty series for ORI ${ori} — verify the ORI via ` +
            `https://api.usa.gov/crime/fbi/cde/agency/byStateAbbr/TN (grep Memphis)`,
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
  for (let y = 1985; y <= 2019; y++) {
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
  // 1985 plausibility gate (the Offenses-vs-Clearances + wrong-ORI trap): a
  // city of Memphis's size must show thousands of violent offenses in 1985.
  const y1985 = years.find((yr) => yr.year === 1985);
  assert(
    y1985 && y1985.violent > 2000 && y1985.property > 10000,
    `FBI history: 1985 totals implausible for Memphis (violent ${y1985?.violent}, property ${y1985?.property}) — wrong ORI or Clearances series?`,
  );
  console.log(
    `  ${years.length} complete years ${yearMin}–${yearMax} (12 months each verified); ` +
      `1985 violent ${y1985.violent} / property ${y1985.property} — plausible ✓`,
  );

  // ---- Assemble output files -------------------------------------------------
  const timeline = { months: MONTHS, cells };
  const beatsFile = { cats: CATS, beats };
  const summary = {
    slug: "memphis-tn",
    title: "Memphis · TN",
    source: { records: ARC_LAYER, beats: PREC, hub: HUB },
    fetchedAt,
    dateMin: "2020-01-01",
    dateMax: "2026-06-30",
    months: MONTHS.length,
    totalRecords,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: { "no-precinct-or-special-unit": noPrecinct },
    dedupe: {
      method: "Crime_ID",
      offenseRows: windowRows,
      incidents: totalRecords,
      note: "source rows are offense-level; incidents are distinct Crime_IDs (server COUNT DISTINCT == client dedupe, verified per month)",
    },
    sourceOmissions:
      "Per the source item description, sex crimes and juvenile-specific crime types are omitted from this dataset by MPD. Coordinates are published at ~3 decimal places (block-level).",
    catTotals,
    cats: CATS,
    beatCount: Object.keys(beats).length,
  };
  const history = {
    era: "history",
    taxonomy:
      "FBI UCR Summary (Violent + Property) — a different taxonomy than the MPD NIBRS categories used from 2020; the two eras bridge at 2020 and are never equated",
    agency: AGENCY,
    ori: ORI,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      `Annual totals are real UCR Summary counts fetched from the FBI CDE summarized agency endpoint for ORI ${ORI} ` +
      `(12 reported months verified per year; the CDE returns Offenses and Clearances series — the Offenses series is used, ` +
      `and the 1985 totals are plausibility-checked in-script). The scouted ORI TN0790100 turned out to be the Collierville ` +
      `Police Department and was rejected; TNMPD0000 is Memphis PD, verified via the CDE agency list for TN. ` +
      `UCR Summary (Violent/Property) and MPD NIBRS categories are different taxonomies and are presented as distinct eras; ` +
      `precinct-level detail exists only from 2020 (the MPD open-data layer starts there), so the story bridges from citywide ` +
      `annual history to per-precinct monthly data at 2020. ` +
      `Reproduce with pipeline/sources/memphis-tn.mjs (set FBI_API_KEY to avoid DEMO_KEY rate limits).` +
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
    source: "MPD Precinct Areas (official MPD precinct/station areas)",
    sourceUrl: `${PREC}/query?where=1=1&outFields=*&f=geojson`,
    hub: HUB,
    fetchedAt,
    license: "Not stated on the item — City of Memphis ArcGIS org; attributed to the City of Memphis",
    method:
      "name join — MPD crime records carry the precinct STATION name in uppercase (e.g. MT MORIAH); polygon names are proper case (Mt. Moriah); joined by uppercase/punctuation-normalized name, all 9 match exactly; no spatial join or approximation is involved",
    map: Object.fromEntries(Object.entries(beats).map(([k, b]) => [k, { name: b.name, approx: false }])),
  };
  const points = {
    mode: "real-sample",
    note:
      "Every dot is a real reported incident location as published by MPD (Latitude/Longitude fields, ~3 decimal places ≈ block-level anonymization — positions are the source's own, never synthesized). Missing locations are published as 0,0 and are counted but not plotted. One dot per deduped incident (Crime_ID), deterministic even-stride sample (≤100/month).",
    sampleRate,
    months: MONTHS,
    pts,
  };

  // ---- VALIDATE (fail loudly) -------------------------------------------------
  console.log("── Validation");
  assert(
    MONTHS.length === 78 && MONTHS[0] === "2020-01" && MONTHS[77] === "2026-06",
    "months not contiguous 2020-01..2026-06",
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
    assert(f.date >= "2020-01-01" && f.date <= "2026-06-30", `feed date out of span ${f.date}`);
    assert(PRECINCTS.has(f.beat), `feed beat '${f.beat}' not a precinct`);
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
    catRawTotals,
    unplacedPrecValues,
    windowRows,
    preRows,
    postRows,
    nullDate,
    grandRows,
    multiRowIncidents,
    crossCatIncidents,
    crossPrecIncidents,
    crossMonthIncidents,
    beats,
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
  catRawTotals,
  unplacedPrecValues,
  windowRows,
  preRows,
  postRows,
  nullDate,
  grandRows,
  multiRowIncidents,
  crossCatIncidents,
  crossPrecIncidents,
  crossMonthIncidents,
  beats,
}) {
  const fmt = (n) => n.toLocaleString("en-US");
  const mapRows = Object.entries(catRawTotals)
    .map(([mk, n]) => {
      const [catRaw, grp, cat] = mk.split("|");
      return { catRaw, grp, cat, n };
    })
    .sort((a, b) => b.n - a.n)
    .map((r) => `| ${r.catRaw} | ${r.grp} | \`${r.cat}\` | ${fmt(r.n)} |`)
    .join("\n");
  const unplacedRows = Object.entries(unplacedPrecValues)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `| ${k} | ${fmt(n)} |`)
    .join("\n");
  const precinctList = Object.values(beats)
    .map((b) => `${b.name} (${b.key})`)
    .join(", ");
  const md = `# Provenance — Memphis, TN

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **MPD Public Safety Incidents** |
| Publisher | Memphis Police Department (MPD), via the City of Memphis Open Data Hub |
| Landing page | ${HUB_ITEM} (hub: ${HUB}) |
| API | ${ARC_LAYER} |
| Fetched | ${fetchedAt} |
| License | **Not stated** on the dataset item — used under the city's public open-data publication; attribution "Memphis Police Department via City of Memphis Open Data Hub" |
| Records used | ${fmt(summary.totalRecords)} incidents (${fmt(windowRows)} offense-level rows, deduplicated — see below) |
| Source caveat | Updated each morning by 6:00 am; classifications can change as investigations proceed |

### ⚠ Source omissions (disclosed prominently)
The dataset item description states, verbatim: *"This dataset contains all crime incidents where a police report was taken. Data goes back to 2019 and is updated each morning by 6:00 am. **Note that sex crimes and juvenile-specific crime types are omitted from this dataset.**"* — Memphis totals shown from this source therefore **exclude sex crimes and juvenile-specific crime types** (there is no rape/sex-offense UCR category anywhere in the layer). This is an MPD publishing decision, not a pipeline choice, and it is disclosed on-screen via \`summary.sourceOmissions\`. Note also: despite the blurb's "back to 2019", the layer's earliest \`Offense_Datetime\` is exactly **2020-01-01 00:00 Memphis local time** (measured live; the older 2006+ public dataset was retired) — the granular era therefore starts 2020-01.

### Offense-level rows → incidents (dedupe, disclosed)
The layer publishes **offense-level rows**: one incident (\`Crime_ID\`) can appear as several rows — one per offense on the report (e.g. one FRAUD incident with both IMPERSONATION and CREDIT CARD/ATM FRAUD offense rows). Following the dataset's own \`Crime_ID\` key:

- ${fmt(windowRows)} in-window offense rows → **${fmt(summary.totalRecords)} distinct incidents** (dedupe by \`Crime_ID\`, ×${(windowRows / summary.totalRecords).toFixed(3)} row inflation)
- Kept row per incident = deterministic minimum by (\`Offense_Datetime\`, \`ObjectId\`); its category/precinct/coordinates represent the incident
- ${fmt(multiRowIncidents)} incidents had >1 row; ${fmt(crossCatIncidents)} spanned crime categories, ${fmt(crossPrecIncidents)} spanned precincts, ${fmt(crossMonthIncidents)} spanned months (binned at the earliest row)
- **Independent reconciliation:** the server's \`COUNT(DISTINCT Crime_ID)\` equals the client-side dedupe **for every one of the ${summary.months} months and globally** — validated in-script on every run

### Time semantics (verified, disclosed)
\`Offense_Datetime\` stores **true UTC instants**: the dataset begins exactly at 2020-01-01T06:00:00Z (= 2020-01-01 00:00 CST) and the hour-of-day histogram dips at 10:00Z = 4–5 AM Memphis local (the universal overnight crime lull) — both incompatible with "local time stored as UTC". All month binning uses **Memphis local time (America/Chicago)**, and every server-side month query uses the matching UTC boundary for local midnight (CST/CDT aware). We bin by \`Offense_Datetime\` (when the offense happened), not \`Reported_Datetime\`.

### Windowing (disclosed exclusions)
Dataset grand total ${fmt(grandRows)} rows =
- **${fmt(windowRows)} in-window rows** (occurred 2020-01-01 → 2026-06-30, Memphis local time) — used
- **${fmt(preRows)} pre-2020 rows** (none exist — the layer starts exactly at 2020-01-01 local midnight)
- **${fmt(postRows)} partial-month rows** (occurred on/after 2026-07-01 local; 2026-07 was in progress at fetch time) — excluded and disclosed
- **${fmt(nullDate)} null-date rows** — excluded and disclosed

### Fields used
\`Offense_Datetime\` · \`Crime_ID\` · \`UCR_Category\` / \`UCR_Description\` · \`NIBRS_Group\` (A/B) · \`NIBRS_Offense_Group\` (native crimes-against) · \`Precinct\` (station name) · \`Latitude\`/\`Longitude\` (~3-decimal block-level) · \`Street_Address\` (block-level address).

### Category mapping (NIBRS_Offense_Group → cat; UCR_Category × NIBRS_Group documented in full)
The source carries a **native NIBRS crimes-against field** (\`NIBRS_Offense_Group\`) plus the offense's NIBRS Group (A/B) — each incident is mapped by its own crimes-against value, keyed by trimmed string (several source values carry trailing spaces): CRIMES AGAINST PERSONS/PERSON → \`persons\`, CRIMES AGAINST PROPERTY → \`property\`, CRIMES AGAINST SOCIETY → \`society\`, and "PERSON, PROPERTY, OR SOCIETY" (the Group B **ALL OTHER OFFENSES** catch-all, which NIBRS itself does not assign to one bucket) → \`other\`. Verified live: each \`UCR_Category\` maps to exactly one (\`NIBRS_Offense_Group\`, \`NIBRS_Group\`) pair across the whole layer; any new value fails the run loudly. One single row in the layer (\`UCR_Incident_Code\` 850) has null classification fields → \`other\`, shown as "(unclassified)" below. Counts are deduped incidents (kept rows) in the window:

| UCR_Category (verbatim, trimmed) | NIBRS_Group | cat | incidents |
|---|---|---|--:|
${mapRows}

Mapping rationale for the judgment calls (NIBRS convention, per the source's own field):
- **ROBBERY → \`property\`** — NIBRS classifies robbery as a crime against property.
- **DRUG/NARCOTIC, WEAPON LAW VIOLATION, PROSTITUTION, PORNOGRAPHY/OBSCN MAT, GAMBLING, ANIMAL CRUELTY → \`society\`** — NIBRS Group A crimes against society.
- **Group B offenses** (TRESPASS, DUI, DISORDERLY CONDUCT, DRUNKENNESS, LIQUOR LAW, CURFEW/LOITERING, PEEPING TOM, BAD CHECKS, FAMILY OFFENSES NONVIOLENT) carry their source-assigned crimes-against value (society, property, or persons).
- **ALL OTHER OFFENSES (Group B catch-all) → \`other\`** — the source itself labels it "PERSON, PROPERTY, OR SOCIETY"; it cannot honestly be assigned to one bucket.

\`other\` is labeled "${CATS.other.label}" and is never counted as persons/property/society crime.

### Coverage (9 precincts — small-region note)
Memphis MPD publishes the **precinct station area** as the spatial unit — only **9 regions** (${precinctList}), like Nashville's 9 police precincts. Leaderboards cap at top 6 and the quiz still works; the small region count is disclosed here and in the wiki.

- Placed (one of the 9 precinct areas): **${fmt(summary.placedRecords)}** (${summary.coveragePct}%)
- Unplaced: ${fmt(summary.unplacedRecords)} incidents whose kept row carries a special-unit or missing \`Precinct\` value instead of a station area — counted in every total and disclosed, never dropped. Verbatim values:

| Precinct value (non-geographic) | incidents |
|---|--:|
${unplacedRows}

(OCU = MPD Organized Crime Unit; STIS/MEM/MOTORS/ARL/LAK and numeric codes are special units or data-entry stragglers — none correspond to a station polygon.)

- Identity \`placed + unplaced == citywide\` validated per month × category in-script, on top of the independent server-side distinct-count reconciliation above.

## Geometry source — official precinct polygons

| Field | Value |
|-------|-------|
| Dataset | **MPD Precinct Areas** (\`MPD_Station_Areas/FeatureServer/1\`) — 9 polygons, official MPD precinct/station areas |
| FeatureServer | ${PREC} |
| Landing page | ${PREC_ITEM} |
| License | Not stated on the item — City of Memphis ArcGIS org; attributed to the City of Memphis |
| Join key | polygon \`precinct\` (proper case, e.g. "Mt. Moriah") ↔ crime \`Precinct\` (uppercase, e.g. "MT MORIAH") — joined by uppercase/punctuation-normalized name; **all 9 match exactly**; every unmatched incident value is a special unit or null (disclosed above) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (\`points.json\`)

Dots are **real incident locations published by MPD** in the \`Latitude\`/\`Longitude\` fields. **MPD publishes coordinates at ~3 decimal places (≈110 m — block-level anonymization)**, matching the block-level \`Street_Address\` field (e.g. "1900 GRAHAM ST"); dots therefore mark blocks, not exact addresses — the positions are still the source's own published values, never synthesized. Missing locations are published as **0,0** and a handful of coords fall outside the city box — **${fmt(noCoords)} incidents (~${Math.round((noCoords / summary.totalRecords) * 1000) / 10}%) have no usable coordinates** and are counted in every total but not plotted (client-side gate: lat ${BBOX.latMin}–${BBOX.latMax}, lng ${BBOX.lngMin}–${BBOX.lngMax}). Deterministic sample: incidents sorted by (occurred-at, Crime_ID), even-stride ≤100/month → **${fmt(ptsKept)} points ≈ 1 per ${sampleRate} of the ${fmt(placeableCount)} placeable incidents**.

## Historical source — FBI UCR (${history.yearMin}–${history.yearMax} deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Memphis Police Department — **ORI \`${ORI}\`** (verified live) |
| Endpoint | ${history.sourceUrl} (and \`/property-crime\`) |
| Span | ${history.yearMin}–${history.yearMax}, annual Violent + Property (12 reported months verified per year)${droppedYears.length ? ` — dropped partial years: ${droppedYears.map((d) => d.year).join(", ")}` : ""} |
| Series | The CDE returns both "Offenses" and "Clearances" series for this agency — the **Offenses** series is used (matched explicitly) |
| ORI verification | The scouted ORI **TN0790100 is the Collierville Police Department** (1985 violent = 20 — implausible for Memphis) and was **rejected**; TNMPD0000 was found via the CDE \`agency/byStateAbbr/TN\` list and passes the in-script 1985 plausibility gate (violent ${fmt(history.years[0].violent)}, property ${fmt(history.years[0].property)}) |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set \`FBI_API_KEY\`) |

Raw CDE responses are cached under \`data/memphis-tn/raw/\`. UCR Summary (Violent/Property) is a **different taxonomy** than MPD NIBRS categories — the eras are presented as distinct and bridge at 2020; they are never equated. No monthly or precinct detail is implied for ${history.yearMin}–${history.yearMax}. Note the FBI-era totals INCLUDE rape (UCR Violent) while the 2020+ MPD source omits sex crimes — one more reason the eras are never numerically compared.

## Reproduce

\`\`\`bash
FBI_API_KEY=… node pipeline/sources/memphis-tn.mjs
\`\`\`
`;
  writeFileSync(PROV_PATH, md);
  console.log(`  wrote data/memphis-tn/PROVENANCE.md`);
}

// ---- wiki/Data-Provenance.md append -------------------------------------------
function appendWiki({ summary, history }) {
  if (!existsSync(WIKI_PATH)) return;
  const cur = readFileSync(WIKI_PATH, "utf8");
  if (cur.includes("## Memphis, TN")) {
    console.log("  wiki/Data-Provenance.md already has a Memphis section — skipped");
    return;
  }
  const fmt = (n) => n.toLocaleString("en-US");
  const section = `
## Memphis, TN (\`memphis-tn\`)

- **Primary source:** MPD Public Safety Incidents — offense-level records
  (ArcGIS \`MPD_Public_Safety_Incidents/FeatureServer/0\`, ${HUB_ITEM}) —
  license **not stated** on the item; attributed "Memphis Police Department via
  City of Memphis Open Data Hub" (${HUB}). Updated each morning by 6:00 am.
- **⚠ Source omissions (disclosed):** per the item description, **sex crimes
  and juvenile-specific crime types are omitted** by MPD — no sex-offense UCR
  category exists in the layer. Disclosed in PROVENANCE and
  \`summary.sourceOmissions\` for on-screen use.
- **Span:** ${history.yearMin}–${history.yearMax} (FBI UCR annual) + 2020-01-01 → 2026-06-30 (MPD NIBRS
  with precinct detail, ${summary.months} months). The layer starts exactly at 2020-01-01
  local midnight (measured; the item blurb's "back to 2019" has no 2019 rows;
  the old 2006+ dataset was retired). Partial 2026-07 dropped and disclosed.
- **Dedupe:** the layer is offense-level — deduplicated by \`Crime_ID\` to
  **incidents** (${fmt(summary.dedupe.offenseRows)} rows → ${fmt(summary.totalRecords)} incidents).
  Independent server-side \`COUNT(DISTINCT Crime_ID)\` equals the client dedupe
  for every month and globally (validated in-script).
- **Time:** \`Offense_Datetime\` is a true UTC instant (dataset starts exactly
  2020-01-01T06:00Z = local midnight CST; hour histogram dips 4–5 AM local);
  all binning is Memphis local time (America/Chicago) with DST-aware month
  boundaries.
- **Spatial unit:** the **9 official MPD precinct (station) areas** — polygon
  layer \`MPD_Station_Areas/FeatureServer/1\` ("MPD Precinct Areas"), joined by
  normalized station name (MT MORIAH ↔ Mt. Moriah, 9/9 exact). Only 9 regions
  (like Nashville): leaderboard topN stays 6, quiz still works. Special-unit
  values (OCU = Organized Crime Unit, etc.) are unplaced and disclosed.
- **Records:** ${fmt(summary.totalRecords)} incidents ·
  ${fmt(summary.placedRecords)} placed in a precinct area
  (**${summary.coveragePct}% coverage**) · ${fmt(summary.unplacedRecords)} unplaced
  (special-unit/missing precinct), kept in totals and disclosed.
- **Real dots:** MPD publishes per-record \`Latitude\`/\`Longitude\` at
  **~3 decimal places (block-level)** — disclosed; dots mark blocks, not exact
  addresses. Missing locations are 0,0 sentinels — counted, not plotted.
- **Deep-history source (${history.yearMin}–${history.yearMax}):** FBI Crime Data Explorer (CDE) —
  Memphis PD, **ORI ${ORI}** — real annual Violent + Property counts,
  ${history.years.length} full years (12 reported months each, verified; the CDE's "Offenses"
  series, never "Clearances"). **The scouted ORI TN0790100 was Collierville PD
  (1985 violent = 20, implausible) — rejected by the 1985 plausibility gate;**
  TNMPD0000 found via \`agency/byStateAbbr/TN\`. UCR taxonomy kept distinct;
  eras bridge at 2020 (and FBI-era violent totals include rape while the MPD
  source omits sex crimes — eras never numerically compared).
- **License:** not stated (open-data hub publication) — flagged; attribute MPD.
- **Detail:** [\`data/memphis-tn/PROVENANCE.md\`](../data/memphis-tn/PROVENANCE.md)

### Category mapping (native \`NIBRS_Offense_Group\` → cat; \`UCR_Category\` × \`NIBRS_Group\` table in PROVENANCE)

| Source value (trimmed) | cat |
|--------------|-----|
| CRIMES AGAINST PERSONS / CRIMES AGAINST PERSON | \`persons\` |
| CRIMES AGAINST PROPERTY | \`property\` |
| CRIMES AGAINST SOCIETY | \`society\` |
| "PERSON, PROPERTY, OR SOCIETY" (= ALL OTHER OFFENSES, NIBRS Group B catch-all) + 1 unclassified row | \`other\` (context only, never counted as NIBRS crime) |
`;
  // insert before "## Ranked source types" if present, else append
  const marker = "## Ranked source types";
  const idx = cur.indexOf(marker);
  const next =
    idx >= 0 ? cur.slice(0, idx) + section.trimStart() + "\n" + cur.slice(idx) : cur + section;
  writeFileSync(WIKI_PATH, next);
  console.log("  appended Memphis section to wiki/Data-Provenance.md");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
