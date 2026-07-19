// Cincinnati, OH — CPD "Reported Crime (STARS Category Offenses)" source
// pipeline (fetch → normalize → validate).
//
// BINDING RULE: never fabricate — every figure written by this script comes
// straight from a queryable public source; every gap is disclosed.
//
// Sources (a PAIR — the city split the feed at the 2024-06-03 RMS cutover):
//   Incidents A: Socrata "Reported Crime (STARS Category Offenses) before
//                6/3/2024" (8xzn-kpn7) — legacy RMS; reports 2020-01 →
//                2024-11-08 (a Jun–Nov 2024 straggler tail overlaps the new
//                set). NO license specified — attributed "City of Cincinnati /
//                Cincinnati Police Department (CPD)".
//                https://data.cincinnati-oh.gov/resource/8xzn-kpn7.json
//   Incidents B: Socrata "Reported Crime (STARS Category Offenses) on or after
//                6/3/2024" (7aqy-xrv9) — current RMS; ~3-week publication lag
//                (measured: loaded through 2026-06-23 at fetch). NO license
//                specified — same attribution.
//                https://data.cincinnati-oh.gov/resource/7aqy-xrv9.json
//   DEDUPE     : offense-level rows → incidents on `incident_no`, across the
//                pair (1,6xx legacy-numbered incidents appear in BOTH sets
//                during the Jun–Nov 2024 transition) and within each set
//                (multi-offense incidents repeat the incident_no).
//   Polygons   : CAGIS "Cincinnati Statistical Neighborhood Approximations
//                (2020) - Open Data" — 50 SNA polygons, field SNA_NAME matches
//                the crime data's `sna_neighborhood` verbatim, 50 of 50.
//   History    : FBI Crime Data Explorer (CDE) summarized agency counts,
//                Cincinnati PD ORI OHCIP0000 (the batch scout's OH0310600 is
//                WRONG — it returns Cleves PD; corrected via byStateAbbr
//                lookup and verified: "Cincinnati Police Department Offenses",
//                1985 violent 3,275 / property 25,936 — plausible).
//
// Eras (honesty structure):
//   1999–2019  FBI UCR annual citywide totals (no neighborhood detail implied).
//              1997 (11 months, all zero) and 1998 (12 months, all zero) are
//              non-reporting years published as zeros by the CDE — dropped as
//              artifacts, never shown as "zero crime". The complete-but-
//              noncontiguous 1985–1996 segment is dropped too (longest-
//              contiguous-run rule, same as atlanta/minneapolis) — all
//              disclosed, never interpolated.
//   2020-01 → 2026-05  CPD STARS incidents with official SNA neighborhood
//              names in-data (last FULL month measured 2026-05 — the new set
//              is loaded through 2026-06-23, so June 2026 is partial and
//              excluded).
//
//   node pipeline/sources/cincinnati-oh.mjs     (set FBI_API_KEY or .secrets/fbi_api_key)
//
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const OUT_DIR = resolve(repoRoot, "data/cincinnati-oh/normalized");
const PROV_PATH = resolve(repoRoot, "data/cincinnati-oh/PROVENANCE.md");
const WIKI_PATH = resolve(repoRoot, "wiki/Data-Provenance.md");

const SODA_OLD = "https://data.cincinnati-oh.gov/resource/8xzn-kpn7.json";
const SODA_NEW = "https://data.cincinnati-oh.gov/resource/7aqy-xrv9.json";
const HUB_OLD = "https://data.cincinnati-oh.gov/d/8xzn-kpn7";
const HUB_NEW = "https://data.cincinnati-oh.gov/d/7aqy-xrv9";
const BANNER_URL =
  "https://insights.cincinnati-oh.gov/stories/s/Banner-Statements-for-Reported-Crime/tcg6-ci6n/";
const SNA_URL =
  "https://services.arcgis.com/JyZag7oO4NteHGiq/arcgis/rest/services/Open_Data/FeatureServer/15/query?where=1%3D1&outFields=SNA_NAME,SNA_NUMBER&outSR=4326&geometryPrecision=6&f=geojson";
const SNA_ITEM = "https://www.arcgis.com/home/item.html?id=6bb28a3fa5c64d41a4b2557d976b0127";
const ORI = "OHCIP0000"; // scout's OH0310600 = Cleves PD (wrong) — verified via byStateAbbr
const AGENCY = "Cincinnati Police Department";
const FBI_KEY =
  process.env.FBI_API_KEY ||
  (existsSync(resolve(repoRoot, ".secrets/fbi_api_key"))
    ? readFileSync(resolve(repoRoot, ".secrets/fbi_api_key"), "utf8").trim()
    : "DEMO_KEY");

// Granular era window: the legacy set publishes reports from 2020-01 (spec:
// "use 2020-01+"); occurrence dates (datefrom) before 2020 are out-of-scope /
// junk-dated (legacy back to 1989, new set to year 1024) — excluded + counted.
// Last FULL month measured 2026-05: the new set is loaded through 2026-06-23
// (~3-week lag), so June 2026 is partial and excluded.
const SPAN_START = "2020-01-01T00:00:00"; // inclusive (on datefrom = occurrence)
const SPAN_END = "2026-06-01T00:00:00"; // exclusive → dateMax 2026-05-31
const CUTOVER = "2024-06-03T00:00:00"; // RMS cutover (documentation only)
const HIST_FROM = "01-1985";
const HIST_TO = "12-2019";

// STARS rollup → cat slot. Cincinnati publishes the UCR-style STARS taxonomy
// (NOT NIBRS crimes-against): Part 1 Violent (homicide, rape, robbery, agg.
// assault, strangulation — robbery is VIOLENT under UCR, unlike NIBRS),
// Part 1 Property (burglary/B&E, thefts, auto theft), Part 2 (all other
// offenses). The persons/property/society keys are the surface's slot names;
// on-screen labels below carry the honest STARS names. `other` is structurally
// zero and the audit fails loudly on any unmapped value.
const SLOT_OF = {
  "Part 1 Violent": "persons",
  "Part 1 Property": "property",
  "Part 2": "society",
};
const SEVERITY = { "Part 1 Violent": 0, "Part 1 Property": 1, "Part 2": 2 };
const CATS = {
  persons: { label: "Part 1 Violent (homicide, rape, robbery, agg. assault)", color: "#ff2e63" },
  property: { label: "Part 1 Property (burglary, theft, auto theft)", color: "#ffc233" },
  society: { label: "Part 2 · All Other Offenses", color: "#34e0e0" },
  other: { label: "Other (none in source)", color: "#7486a0" },
};
const CAT_KEYS = ["persons", "property", "society", "other"]; // catIdx order

// Valid Cincinnati coordinate box (spec). Source coords are TEXT, 4-decimal
// (~11 m), tied to block-masked addresses ("25XX BURNET AV") — block-level.
// The LEGACY set publishes the columns SWAPPED (latitude_x holds longitude);
// orientation is normalized per-row and the swap count is disclosed.
const BBOX = { latMin: 39.05, latMax: 39.22, lngMin: -84.71, lngMax: -84.37 };
// generous orientation gate (swap detection only; strict BBOX still applies)
const ORIENT = { latMin: 38.8, latMax: 39.6, lngMin: -85.2, lngMax: -83.9 };

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

function soda(base, params) {
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${base}?${qs}`;
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
const MONTHS = monthRange("2020-01", "2026-05"); // 77
const MONTH_IDX = new Map(MONTHS.map((m, i) => [m, i]));
const ymOf = (ts) => String(ts).slice(0, 7);

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

  // ---- 1. Official SNA neighborhood polygons --------------------------------
  console.log("── CAGIS SNA (2020) neighborhood polygons");
  const gj = await getJSON(SNA_URL, { label: "SNA geojson" });
  assert(gj?.type === "FeatureCollection" && Array.isArray(gj.features), "SNA: bad geojson");
  assert(gj.features.length === 50, `SNA: expected 50 features, got ${gj.features.length}`);

  const beats = {};
  gj.features.forEach((f, idx) => {
    const key = f.properties?.SNA_NAME;
    assert(typeof key === "string" && key.length > 0, `SNA feature ${idx}: missing SNA_NAME`);
    assert(!beats[key], `SNA: duplicate neighborhood '${key}'`);
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
    assert(A > 0, `SNA '${key}': zero area`);
    beats[key] = {
      key,
      name: key, // official SNA names are already resident-friendly
      servcen: "",
      beat: f.properties?.SNA_NUMBER ?? idx,
      centroid: [Number((X / A).toFixed(6)), Number((Y / A).toFixed(6))],
      polygon: outerRings,
      geomType: g.type,
    };
  });
  const HOODS = new Set(Object.keys(beats));
  console.log(`  ${HOODS.size} neighborhoods (e.g. ${[...HOODS].slice(0, 3).join(", ")})`);

  // ---- 2. Server-side window partition per set (independent reference) ------
  console.log("── Window partition per set (server-side counts)");
  async function partition(base, label) {
    const cnt = async (where) => {
      const p = { $select: "count(*) AS n" };
      if (where) p.$where = where;
      const [{ n }] = await getJSON(soda(base, p), { label: `${label} count` });
      return Number(n);
    };
    const whole = await cnt();
    const nullDate = await cnt("datefrom IS NULL");
    const pre = await cnt(`datefrom < '${SPAN_START}'`);
    const inWin = await cnt(`datefrom >= '${SPAN_START}' AND datefrom < '${SPAN_END}'`);
    const post = await cnt(`datefrom >= '${SPAN_END}'`);
    assert(
      nullDate + pre + inWin + post === whole,
      `${label}: partition ${nullDate}+${pre}+${inWin}+${post} != whole ${whole}`,
    );
    console.log(
      `  ${label}: whole ${whole} = null-datefrom ${nullDate} + pre-window ${pre} + in-window ${inWin} + post-window ${post}`,
    );
    return { whole, nullDate, pre, inWin, post };
  }
  const partOld = await partition(SODA_OLD, "legacy 8xzn-kpn7");
  const partNew = await partition(SODA_NEW, "current 7aqy-xrv9");
  const [{ maxrep }] = await getJSON(
    soda(SODA_NEW, { $select: "max(datereported) AS maxrep" }),
    { label: "new max datereported" },
  );
  const loadedThrough = String(maxrep).slice(0, 10);
  console.log(`  current set loaded through ${loadedThrough} (≈3-week lag → last full month 2026-05)`);
  // Measured last-full-month gate: 2026-05 is only a full month if the source
  // has loaded past its end; and if the source has moved past June the window
  // constant is stale-conservative — flag it so SPAN_END gets re-measured.
  assert(
    loadedThrough >= "2026-06-01",
    `current set loaded only through ${loadedThrough} — 2026-05 may be incomplete; re-measure SPAN_END`,
  );
  if (loadedThrough >= "2026-07-01")
    console.warn(
      `  NOTE: source now loaded through ${loadedThrough} — June 2026 may be complete; consider extending SPAN_END`,
    );

  // ---- 3. Server-side grouped ym × rollup reference (per set) ---------------
  console.log("── Server-side ym × STARS-rollup reference counts");
  async function groupedRef(base, rollupField, label) {
    const rows = await getJSON(
      soda(base, {
        $select: `date_trunc_ym(datefrom) AS ym,${rollupField} AS g,count(*) AS n`,
        $where: `datefrom >= '${SPAN_START}' AND datefrom < '${SPAN_END}'`,
        $group: "ym,g",
        $limit: "10000",
      }),
      { label: `grouped ${label}` },
    );
    assert(rows.length < 10000, `grouped ${label}: hit $limit`);
    const map = new Map();
    let total = 0;
    for (const r of rows) {
      assert(SLOT_OF[r.g], `${label}: unmapped STARS rollup '${r.g}' — extend SLOT_OF + docs`);
      const mi = MONTH_IDX.get(ymOf(r.ym));
      assert(mi !== undefined, `${label}: month ${r.ym} outside span`);
      map.set(`${mi}|${r.g}`, Number(r.n));
      total += Number(r.n);
    }
    return { map, total };
  }
  const refOld = await groupedRef(SODA_OLD, "stars_category", "legacy");
  const refNew = await groupedRef(SODA_NEW, "type", "current");
  assert(refOld.total === partOld.inWin, `legacy grouped total ${refOld.total} != in-window ${partOld.inWin}`);
  assert(refNew.total === partNew.inWin, `current grouped total ${refNew.total} != in-window ${partNew.inWin}`);
  console.log(`  legacy ${refOld.total} rows · current ${refNew.total} rows (match window counts)`);

  // ---- 4. Full row fetch (both sets, in-window) -----------------------------
  console.log("── Row fetch (offense-level rows, both sets)");
  async function fetchRows(base, select, label) {
    const out = [];
    const PAGE = 25000;
    for (let offset = 0; ; offset += PAGE) {
      const rows = await getJSON(
        soda(base, {
          $select: select,
          $where: `datefrom >= '${SPAN_START}' AND datefrom < '${SPAN_END}'`,
          $order: ":id",
          $limit: String(PAGE),
          $offset: String(offset),
        }),
        { label: `${label} page@${offset}` },
      );
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  }
  const oldRows = await fetchRows(
    SODA_OLD,
    "incident_no,datefrom,datereported,stars_category,sna_neighborhood,latitude_x,longitude_x,address_x",
    "legacy",
  );
  const newRows = await fetchRows(
    SODA_NEW,
    "incident_no,datefrom,datereported,stars_category,type,sna_neighborhood,latitude_x,longitude_x,address_x",
    "current",
  );
  assert(oldRows.length === partOld.inWin, `legacy fetched ${oldRows.length} != server ${partOld.inWin}`);
  assert(newRows.length === partNew.inWin, `current fetched ${newRows.length} != server ${partNew.inWin}`);
  console.log(`  legacy ${oldRows.length} rows, current ${newRows.length} rows — fetch complete`);

  // ---- 5. Local raw tallies must equal the server reference EXACTLY ---------
  console.log("── Reconciliation A: local raw rows == server grouped counts");
  const rollupOf = (row, set) => (set === "old" ? row.stars_category : row.type);
  function rawTally(rows, set, label) {
    const map = new Map();
    for (const r of rows) {
      const g = rollupOf(r, set);
      assert(SLOT_OF[g], `${label}: unmapped STARS rollup '${g}' in row ${r.incident_no}`);
      const mi = MONTH_IDX.get(ymOf(r.datefrom));
      assert(mi !== undefined, `${label}: datefrom ${r.datefrom} outside span`);
      const k = `${mi}|${g}`;
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }
  const tallyOld = rawTally(oldRows, "old", "legacy");
  const tallyNew = rawTally(newRows, "new", "current");
  for (const [ref, tally, label] of [
    [refOld.map, tallyOld, "legacy"],
    [refNew.map, tallyNew, "current"],
  ]) {
    for (const [k, n] of ref) assert(tally.get(k) === n, `${label} ${k}: local ${tally.get(k)} != server ${n}`);
    for (const [k, n] of tally) assert(ref.get(k) === n, `${label} ${k}: local ${n} != server ${ref.get(k)}`);
  }
  console.log("  exact match, every month × rollup × set ✓");

  // ---- 6. Dedupe: offense rows → incidents on incident_no -------------------
  console.log("── Dedupe: rows → incidents (cross-pair + within-set, on incident_no)");
  const groups = new Map();
  let noIdRows = 0;
  function addRow(r, set, seq) {
    let key = String(r.incident_no ?? "").trim();
    if (!key) {
      key = `__noid:${set}:${seq}`; // undedupable — kept as its own incident, counted
      noIdRows++;
    }
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { old: [], new: [] }));
    r.__seq = seq;
    g[set].push(r);
  }
  oldRows.forEach((r, i) => addRow(r, "old", i));
  newRows.forEach((r, i) => addRow(r, "new", i));

  let crossPairDroppedRows = 0,
    withinSetCollapsedRows = 0,
    crossPairIncidents = 0;
  const incidents = [];
  for (const [key, g] of groups) {
    const set = g.new.length ? "new" : "old"; // post-cutover RMS is authoritative
    if (g.new.length && g.old.length) {
      crossPairDroppedRows += g.old.length;
      crossPairIncidents++;
    }
    const rows = g[set]
      .slice()
      .sort(
        (a, b) =>
          SEVERITY[rollupOf(a, set)] - SEVERITY[rollupOf(b, set)] ||
          String(a.datereported ?? "").localeCompare(String(b.datereported ?? "")) ||
          String(a.stars_category ?? "").localeCompare(String(b.stars_category ?? "")) ||
          String(a.latitude_x ?? "").localeCompare(String(b.latitude_x ?? "")) ||
          a.__seq - b.__seq,
      );
    withinSetCollapsedRows += rows.length - 1;
    const rep = rows[0]; // highest STARS severity (UCR hierarchy convention)
    const mi = MONTH_IDX.get(ymOf(rep.datefrom));
    assert(mi !== undefined, `incident ${key}: rep datefrom ${rep.datefrom} outside span`);
    incidents.push({
      key,
      set,
      mi,
      date: String(rep.datefrom).slice(0, 10),
      cat: SLOT_OF[rollupOf(rep, set)],
      title: rep.stars_category || "", // legacy: rollup; current: specific STARS type
      hood: rep.sna_neighborhood ?? null,
      lat: rep.latitude_x,
      lng: rep.longitude_x,
      place: rep.address_x || "",
    });
  }
  const fetchedRows = oldRows.length + newRows.length;
  assert(
    incidents.length + crossPairDroppedRows + withinSetCollapsedRows === fetchedRows,
    `dedupe identity: ${incidents.length}+${crossPairDroppedRows}+${withinSetCollapsedRows} != ${fetchedRows}`,
  );
  console.log(
    `  ${fetchedRows} rows → ${incidents.length} incidents` +
      ` (cross-pair: ${crossPairIncidents} incidents in both sets, ${crossPairDroppedRows} legacy rows dropped;` +
      ` within-set: ${withinSetCollapsedRows} extra offense rows collapsed; ${noIdRows} rows without incident_no kept 1:1)`,
  );

  // ---- 7. Timeline cells + citywide (two passes) + placed/unplaced identity --
  console.log("── Timeline: per-neighborhood monthly counts by category (2020-01…2026-05)");
  const cells = {};
  for (const k of HOODS)
    cells[k] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  const junkByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  for (const inc of incidents) {
    if (inc.hood !== null && inc.hood !== "") {
      assert(HOODS.has(inc.hood), `unexpected sna_neighborhood '${inc.hood}'`);
      cells[inc.hood][inc.mi][inc.cat]++;
    } else {
      junkByCatMonth[inc.cat][inc.mi]++;
    }
  }
  // independent second pass for citywide per-cat-month (separate aggregation)
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

  // ---- 8. Totals ------------------------------------------------------------
  console.log("── Dataset totals (2020-01-01 … 2026-05-31 window, incident-level)");
  const totalRecords = incidents.length;
  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  for (const inc of incidents) catTotals[inc.cat]++;
  assert(
    CAT_KEYS.reduce((s, c) => s + catTotals[c], 0) === totalRecords,
    "catTotals do not sum to totalRecords",
  );
  assert(catTotals.other === 0, "cat 'other' must be structurally zero for STARS");
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
    `  incidents ${totalRecords} = placed ${placedRecords} + no-neighborhood ${noNeighborhood} → coverage ${coveragePct}%`,
  );

  // ---- 9. Real incident points (orientation-normalized, deterministic sample) -
  console.log("── Real incident points (4-decimal block-level; legacy columns swapped → normalized)");
  const inLat = (v) => v >= ORIENT.latMin && v <= ORIENT.latMax;
  const inLng = (v) => v >= ORIENT.lngMin && v <= ORIENT.lngMax;
  const byMonth = MONTHS.map(() => []);
  let swappedRows = 0,
    noCoord = 0,
    outOfBbox = 0,
    placeableCount = 0;
  for (const inc of incidents) {
    const a = Number(inc.lat),
      b = Number(inc.lng);
    let lat, lng;
    if (Number.isFinite(a) && Number.isFinite(b) && inLat(a) && inLng(b)) {
      lat = a;
      lng = b;
    } else if (Number.isFinite(a) && Number.isFinite(b) && inLat(b) && inLng(a)) {
      lat = b; // columns swapped at the source (all legacy rows publish them reversed)
      lng = a;
      swappedRows++;
    } else {
      noCoord++;
      continue;
    }
    if (lat < BBOX.latMin || lat > BBOX.latMax || lng < BBOX.lngMin || lng > BBOX.lngMax) {
      outOfBbox++;
      continue;
    }
    placeableCount++;
    byMonth[inc.mi].push([Number(lng.toFixed(6)), Number(lat.toFixed(6)), CAT_KEYS.indexOf(inc.cat)]);
  }
  // ≤100/month, deterministic even-stride pick (incidents iterate in stable order)
  const pts = byMonth.map((arr) => {
    if (arr.length <= 100) return arr;
    const out = [];
    for (let i = 0; i < 100; i++) out.push(arr[Math.floor((i * arr.length) / 100)]);
    return out;
  });
  const ptsKept = pts.reduce((s, a) => s + a.length, 0);
  const sampleRate = Math.round(placeableCount / ptsKept);
  console.log(
    `  ${placeableCount} placeable incidents (${swappedRows} column-swapped normalized, ${noCoord} no usable coords,` +
      ` ${outOfBbox} outside bbox) → kept ${ptsKept} (≤100/mo) → 1 per ~${sampleRate}`,
  );

  // ---- 10. Dispatch feed -----------------------------------------------------
  console.log("── Feed: 4 real items per quarter, 2020-Q1 … 2026-Q2");
  const feed = [];
  const feedable = incidents
    .filter((inc) => inc.hood && inc.title)
    .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  for (let y = 2020; y <= 2026; y++) {
    for (let q = 0; q < 4; q++) {
      const start = `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`;
      const end = q === 3 ? `${y + 1}-01-01` : `${y}-${String(q * 3 + 4).padStart(2, "0")}-01`;
      if (start >= "2026-06-01") continue;
      const inQ = feedable.filter((inc) => inc.date >= start && inc.date < end);
      if (!inQ.length) continue;
      const picks = [];
      for (let i = 0; i < Math.min(4, inQ.length); i++)
        picks.push(inQ[Math.floor((i * inQ.length) / Math.min(4, inQ.length))]);
      for (const inc of picks) {
        assert(HOODS.has(inc.hood), `feed: unexpected neighborhood '${inc.hood}'`);
        feed.push({ date: inc.date, title: inc.title, place: inc.place, beat: inc.hood, cat: inc.cat });
      }
    }
  }
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`  ${feed.length} feed items (even-stride through each quarter, no seriousness bias)`);

  // ---- 11. FBI UCR history (1985–2019 requested; longest contiguous run kept) -
  console.log(
    `── FBI CDE history (${ORI}, 1985–2019, key=${FBI_KEY === "DEMO_KEY" ? "DEMO_KEY" : "FBI_API_KEY"})`,
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
      // The response has BOTH "… Offenses" and "… Clearances" series — take the
      // agency's Offenses series, never Clearances or United States (the
      // buffalo-build trap: a loose regex can silently pick Clearances).
      const agKey = Object.keys(actuals).find(
        (k) => /Cincinnati/i.test(k) && /Offenses/i.test(k) && !/United States/i.test(k),
      );
      if (!agKey)
        throw new Error(
          `FBI ${offense}: no Cincinnati Offenses series (keys: ${Object.keys(actuals)})`,
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
  const droppedZeroYears = [];
  const complete = [];
  for (let y = 1985; y <= 2019; y++) {
    const vm = violent.monthsSeen[y] || 0,
      pm = property.monthsSeen[y] || 0;
    if (vm !== 12 || pm !== 12) {
      droppedYears.push({ year: y, violentMonths: vm, propertyMonths: pm });
      continue;
    }
    const v = violent.byYear[y],
      p = property.byYear[y];
    // Zero-reported artifact gate: a year where either series sums to zero is
    // a non-reporting year the CDE fills with zeros (Cincinnati 1997–98) — a
    // big city never has a true zero-crime year; dropping it is the honest
    // move (showing it would fabricate a "zero crime" year on screen).
    if (v === 0 || p === 0) {
      droppedZeroYears.push({ year: y, violent: v, property: p });
      continue;
    }
    complete.push({ year: y, violent: v, property: p, total: v + p });
  }
  assert(complete.length > 0, "FBI history: no complete years");
  if (droppedYears.length)
    console.warn(`  partial years (≠12 reported months, dropped): ${JSON.stringify(droppedYears)}`);
  if (droppedZeroYears.length)
    console.warn(
      `  zero-reported years (12 months of zeros — non-reporting artifact, dropped): ${JSON.stringify(droppedZeroYears)}`,
    );
  // Keep the longest contiguous run of complete years (minneapolis/atlanta pattern).
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
  // plausibility gate (the wrong-ORI trap: Cleves PD returns ~1–5/yr)
  assert(years[0].total > 5000, `FBI history: ${years[0].year} total ${years[0].total} implausibly small — wrong ORI?`);
  console.log(`  kept ${years.length} complete years ${yearMin}–${yearMax} (12 months each verified)`);

  // ---- Assemble output files -------------------------------------------------
  const timeline = { months: MONTHS, cells };
  const beatsFile = { cats: CATS, beats };
  const dedupe = {
    fetchedRows,
    legacyRows: oldRows.length,
    currentRows: newRows.length,
    crossPairIncidents,
    crossPairDroppedRows,
    withinSetCollapsedRows,
    noIdRows,
    incidents: totalRecords,
  };
  const summary = {
    slug: "cincinnati-oh",
    title: "Cincinnati · OH",
    source: {
      records: SODA_OLD,
      recordsCurrent: SODA_NEW,
      beats: SNA_URL,
      hub: HUB_OLD,
      hubCurrent: HUB_NEW,
    },
    fetchedAt,
    dateMin: "2020-01-01",
    dateMax: "2026-05-31",
    months: MONTHS.length,
    totalRecords,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: { "no-neighborhood": noNeighborhood },
    excludedOutsideWindow: {
      "legacy:junk-or-pre-2020-datefrom": partOld.pre,
      "legacy:null-datefrom": partOld.nullDate,
      "legacy:post-window": partOld.post,
      "current:junk-or-pre-2020-datefrom": partNew.pre,
      "current:null-datefrom": partNew.nullDate,
      "current:partial-2026-06": partNew.post,
    },
    dedupe,
    methodFootnote:
      "Offense-level rows from the legacy/current STARS dataset pair are deduplicated to incidents on incident_no: " +
      "incidents recorded in both systems during the Jun–Nov 2024 RMS transition count once (current system preferred), " +
      "and multi-offense incidents count once at the highest STARS severity (Part 1 Violent > Part 1 Property > Part 2).",
    scopeNote:
      "CPD publishes the UCR-style STARS taxonomy, not NIBRS crimes-against: Part 1 Violent includes robbery " +
      "(a property crime under NIBRS), and all non–Part 1 offenses are one 'Part 2' bucket.",
    licenseNote:
      "NO LICENSE SPECIFIED on either Socrata dataset — used under the city portal's public terms with attribution " +
      "'City of Cincinnati / Cincinnati Police Department (CPD)'.",
    catTotals,
    cats: CATS,
    beatCount: Object.keys(beats).length,
  };
  const history = {
    era: "history",
    taxonomy:
      "FBI UCR Summary (Violent + Property) — a different taxonomy than the CPD STARS categories used from 2020; the two eras bridge at 2020 and are never equated",
    agency: AGENCY,
    ori: ORI,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      `Annual totals are real UCR Summary counts fetched from the FBI CDE summarized agency endpoint for ORI ${ORI} ` +
      `(12 reported months verified per year; zero-filled non-reporting years rejected). The batch scout's ORI OH0310600 ` +
      `resolves to Cleves PD and was corrected via the CDE byStateAbbr agency lookup. 1997 (11 months, all zero) and ` +
      `1998 (12 months, all zero) are non-reporting years the CDE publishes as zeros — dropped as artifacts, never ` +
      `shown as "zero crime"; the complete-but-noncontiguous 1985–1996 segment is dropped to keep one honest contiguous ` +
      `series (${yearMin}–${yearMax}) — all disclosed, never interpolated. UCR Summary (Violent/Property) and CPD STARS ` +
      `are different taxonomies presented as distinct eras; ` +
      `neighborhood-level detail exists only from 2020 (the open-data pair begins there), so the story bridges from ` +
      `citywide annual history to per-neighborhood monthly data at 2020. Reproduce with ` +
      `pipeline/sources/cincinnati-oh.mjs (set FBI_API_KEY to avoid DEMO_KEY rate limits).`,
    yearMin,
    yearMax,
    droppedYears: droppedYears.map((d) => d.year),
    droppedZeroYears: droppedZeroYears.map((d) => d.year),
    droppedSegments,
    cats: {
      violent: { label: "UCR Violent (murder, rape, robbery, agg. assault)", color: "#ff2e63" },
      property: { label: "UCR Property (burglary, larceny, MV theft)", color: "#ffc233" },
    },
    years,
  };
  const neighborhoods = {
    source: "Cincinnati Statistical Neighborhood Approximations (2020) — CAGIS Open Data (50)",
    sourceUrl: SNA_URL,
    hub: SNA_ITEM,
    fetchedAt,
    license:
      "Public open data from the CAGIS Open Data portal (as-is disclaimer; attribution CAGIS / City of Cincinnati)",
    method:
      "identity — CPD crime records carry the official SNA neighborhood name verbatim in sna_neighborhood (all 50 polygon SNA_NAME values match the crime data's values exactly, in both datasets of the pair); no spatial join or approximation is involved",
    map: Object.fromEntries(Object.keys(beats).map((k) => [k, { name: k, approx: false }])),
  };
  const points = {
    mode: "real-sample",
    note:
      "Every dot is a real reported incident location published by CPD at 4-decimal precision (~11 m) against block-masked addresses ('25XX …') — block-level, never an exact address, never synthesized. The legacy dataset publishes the latitude_x/longitude_x columns REVERSED; orientation is normalized per-row and disclosed. Incidents without usable coordinates are counted in every total but not plotted. Deterministic sample (≤100/month).",
    coordPrecision: "4 decimal places (~11 m, block-masked addresses)",
    orientationNote: `${swappedRows} incidents had latitude_x/longitude_x reversed at the source (the whole legacy set) — swapped back deterministically`,
    sampleRate,
    months: MONTHS,
    pts,
  };

  // ---- VALIDATE (fail loudly) -------------------------------------------------
  console.log("── Validation");
  assert(
    MONTHS.length === 77 && MONTHS[0] === "2020-01" && MONTHS[76] === "2026-05",
    "months not contiguous 2020-01..2026-05",
  );
  for (let i = 1; i < MONTHS.length; i++) {
    const [py, pm] = MONTHS[i - 1].split("-").map(Number);
    const [cy, cm] = MONTHS[i].split("-").map(Number);
    assert(
      (cm === pm + 1 && cy === py) || (cm === 1 && pm === 12 && cy === py + 1),
      `months not contiguous at ${MONTHS[i]}`,
    );
  }
  assert(Object.keys(beats).length === 50, "beatCount != 50");
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
    assert(f.date >= "2020-01-01" && f.date <= "2026-05-31", `feed date out of span ${f.date}`);
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
    droppedZeroYears,
    droppedSegments,
    placeableCount,
    ptsKept,
    sampleRate,
    catTotals,
    partOld,
    partNew,
    dedupe,
    loadedThrough,
    swappedRows,
    noCoord,
    outOfBbox,
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
  droppedZeroYears,
  droppedSegments,
  placeableCount,
  ptsKept,
  sampleRate,
  catTotals,
  partOld,
  partNew,
  dedupe,
  loadedThrough,
  swappedRows,
  noCoord,
  outOfBbox,
}) {
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const md = `# Provenance — Cincinnati, OH

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

> **LICENSE FLAG (prominent, per batch spec):** neither Socrata dataset declares a license
> (no \`licenseId\` in the portal metadata). The data is published on the City of Cincinnati's
> official open-data portal and is used with attribution **"City of Cincinnati / Cincinnati
> Police Department (CPD)"**. CPD/OPDA banner statements about this data: ${BANNER_URL}

## Primary source — a PAIR of incident datasets (RMS cutover 2024-06-03)

| Field | Legacy set | Current set |
|-------|-----------|-------------|
| Dataset | **Reported Crime (STARS Category Offenses) before 6/3/2024** (\`8xzn-kpn7\`) | **Reported Crime (STARS Category Offenses) on or after 6/3/2024** (\`7aqy-xrv9\`) |
| Landing page | ${HUB_OLD} | ${HUB_NEW} |
| API | ${SODA_OLD} | ${SODA_NEW} |
| Publisher | City of Cincinnati (attribution "City of Cincinnati") | City of Cincinnati |
| License | **not specified** (see flag above) | **not specified** (see flag above) |
| Reports span | 2020-01 → 2024-11-08 (legacy RMS; frozen) | 2024-06-03 → present (~3-week lag; loaded through ${loadedThrough} at fetch) |
| Rows fetched (window) | ${fmt(dedupe.legacyRows)} | ${fmt(dedupe.currentRows)} |
| Fetched | ${fetchedAt} | ${fetchedAt} |

The city split its published crime feed when CPD changed records-management systems on
**2024-06-03**. During the **Jun–Nov 2024 transition the sets OVERLAP**: ${fmt(dedupe.crossPairIncidents)}
incidents carry the same legacy incident number in both sets and are counted **once** (see dedupe below).

### Windowing (disclosed exclusions; identities validated in-script per set)
- Window: \`datefrom\` (occurrence date) **2020-01-01 → 2026-05-31**. The **last FULL month was
  measured, not assumed**: the current set is loaded through **${loadedThrough}** (~3-week lag +
  update cadence), so June 2026 is partial — **${fmt(partNew.post)} rows** after 2026-05-31 are excluded.
- Legacy set: whole ${fmt(partOld.whole)} = ${fmt(partOld.nullDate)} null-datefrom + ${fmt(partOld.pre)} datefrom before 2020 (junk/old occurrences back to 1989, reported 2020+) + ${fmt(partOld.inWin)} in-window + ${fmt(partOld.post)} post-window.
- Current set: whole ${fmt(partNew.whole)} = ${fmt(partNew.nullDate)} null-datefrom + ${fmt(partNew.pre)} datefrom before 2020 (junk dates back to year 1024) + ${fmt(partNew.inWin)} in-window + ${fmt(partNew.post)} partial-June-2026.
- \`datefrom\` is the **occurrence** date (per spec); \`datereported\` is used only for lag
  measurement and deterministic tie-breaks.

### Dedupe — offense-level rows → incidents (disclosed method)
Both sets publish **offense-level rows**: one incident can repeat its \`incident_no\` with a
different STARS category (e.g. Auto Theft + Theft from Auto + Part 2 rows for one incident),
and transition-era incidents appear in **both** sets under the same legacy number.

| Step | Rows |
|------|-----:|
| Offense-level rows fetched (window, both sets) | ${fmt(dedupe.fetchedRows)} |
| − legacy rows for incidents also present in the current set (cross-pair overlap, current system preferred) | ${fmt(dedupe.crossPairDroppedRows)} |
| − extra offense rows collapsed within one incident (highest STARS severity kept: Part 1 Violent > Part 1 Property > Part 2 — the UCR hierarchy convention) | ${fmt(dedupe.withinSetCollapsedRows)} |
| = **incidents** (rows without an \`incident_no\`: ${fmt(dedupe.noIdRows)} — kept 1:1, undedupable) | **${fmt(dedupe.incidents)}** |

The identity \`rows == incidents + cross-pair dropped + within-set collapsed\` is asserted
in-script, and every count below is **incident-level**.

### Reconciliation chain (all asserted in-script, exact)
1. **Fetch completeness:** rows fetched per set == independent server-side \`count(*)\` for the
   same window, and the whole-set partition (null + pre + in + post = whole) holds per set.
2. **Local == server:** local per-month × STARS-rollup × set tallies of the raw rows match the
   server's independent \`$group\` aggregation **exactly** (every cell, both directions).
3. **Placed + unplaced == citywide** per month × category over the deduped incidents
   (two separate aggregation passes).

### Fields used
\`incident_no\` (dedupe key) · \`datefrom\` (occurrence) · \`datereported\` (lag/tie-breaks) ·
\`stars_category\` (legacy: rollup; current: specific STARS type) · \`type\` (current: rollup) ·
\`sna_neighborhood\` (official SNA name, in-data, both sets) · \`latitude_x\`/\`longitude_x\`
(TEXT, 4-decimal) · \`address_x\` (block-masked). The legacy \`offense\`/\`ucr\` fields are
suppressed ("X") for every window row and unusable; the spec's \`cpd_neighborhood\` exists
**only** in the current set, so the pair-consistent \`sna_neighborhood\` is used instead (a
disclosed deviation from the batch scout note).

### Category mapping (STARS rollup → cat slot) — complete enumeration
| STARS rollup (source value) | cat slot | incident count |
|---|---|--:|
| Part 1 Violent | \`persons\` | ${fmt(catTotals.persons)} |
| Part 1 Property | \`property\` | ${fmt(catTotals.property)} |
| Part 2 | \`society\` | ${fmt(catTotals.society)} |
| (nothing else in source) | \`other\` | ${fmt(catTotals.other)} |

**Taxonomy honesty:** CPD publishes the UCR-style **STARS** taxonomy, not NIBRS
crimes-against. **Part 1 Violent includes robbery and strangulation** (robbery is a crime
against *property* under NIBRS — here it stays where the source puts it). **Part 2 is the
source's own "everything else" bucket** (drugs, vandalism, fraud, simple assault, …); it is
carried in the surface's third slot with the honest on-screen label
"${summary.cats.society.label}" and is never presented as NIBRS "Crimes Against Society".
The current set's specific \`stars_category\` values (Auto Theft, Robbery, Rape, Homicide,
Strangulation, Agg Assault, Burglary/BE, Theft from Auto, Personal/Other Theft) roll up to
these three exactly (verified in-data); multi-offense incidents take the highest-severity
rollup. The in-script audit fails loudly on any unmapped value.

### Coverage
- Placed (one of the 50 official SNAs, 2020-01…2026-05): **${fmt(summary.placedRecords)}** (${summary.coveragePct}%)
- Unplaced: ${fmt(summary.unplacedRecords)} in-window incidents with a blank \`sna_neighborhood\` — kept in every citywide total and disclosed.

## Geometry source — official SNA polygons

| Field | Value |
|-------|-------|
| Dataset | **Cincinnati Statistical Neighborhood Approximations (2020) — Open Data** — 50 polygons, field \`SNA_NAME\` |
| FeatureServer | https://services.arcgis.com/JyZag7oO4NteHGiq/arcgis/rest/services/Open_Data/FeatureServer/15 |
| Item page | ${SNA_ITEM} |
| Publisher | CAGIS (Cincinnati Area GIS) Open Data, owner \`cagisopendata\` — the city/county's own GIS consortium |
| License | public open data with an as-is disclaimer (no warranty); attribution CAGIS / City of Cincinnati |
| Join key | \`SNA_NAME\` — matches the crime data's \`sna_neighborhood\` values **verbatim, all 50 of 50, in both datasets** (identity join, no fuzzy matching). The layer's merged SNAs ("English Woods_North Fairmount", "Lower Price Hill_Queensgate", "Riverside_Sedamsville") are exactly the merged values the crime data uses. |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (\`points.json\`)

Coordinates are TEXT at **4-decimal precision (~11 m)** attached to **block-masked addresses**
("25XX BURNET AV") — block-level locations published by CPD, never exact addresses, never
synthesized. **Source artifact (disclosed):** the legacy dataset publishes \`latitude_x\`/\`longitude_x\`
**reversed** (latitude_x holds −84.x longitudes); orientation is normalized per-row by value
range — ${fmt(swappedRows)} incidents swapped back, deterministic. Of ${fmt(summary.totalRecords)} incidents:
${fmt(placeableCount)} placeable, ${fmt(noCoord)} without usable coordinates, ${fmt(outOfBbox)} outside the strict
city bbox (lat ${BBOX.latMin}–${BBOX.latMax}, lng ${BBOX.lngMin}–${BBOX.lngMax}) — all counted in every total, only
missing from the dot layer, and the video says so. Deterministic even-stride sample ≤100/month →
**${fmt(ptsKept)} points ≈ 1 per ${sampleRate} placeable incidents**.

## Historical source — FBI UCR (${history.yearMin}–${history.yearMax} deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Cincinnati Police Department — **ORI \`${ORI}\`** (verified: returns "Cincinnati Police Department Offenses" series; the batch scout's \`OH0310600\` resolves to **Cleves PD** and was corrected via the CDE \`agency/byStateAbbr/OH\` lookup) |
| Endpoint | ${history.sourceUrl} (and \`/property-crime\`) |
| Span | ${history.yearMin}–${history.yearMax}, annual Violent + Property (12 reported months verified per year) |
| Dropped | Partial years **${droppedYears.map((d) => d.year).join(", ") || "—"}** (<12 reported months) · zero-reported years **${droppedZeroYears.map((d) => d.year).join(", ") || "—"}** (every month zero — a CDE non-reporting artifact; a big city has no true zero-crime year, so showing it would fabricate one) · complete-but-noncontiguous segment **${droppedSegments.join(", ") || "—"}** (longest-contiguous-run rule). Nothing is interpolated. |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set \`FBI_API_KEY\`) |

UCR Summary (Violent/Property) is a **different taxonomy** than CPD STARS — the eras are
presented as distinct and bridge at 2020; they are never equated. No monthly or neighborhood
detail is implied for ${history.yearMin}–${history.yearMax}.

## Reproduce

\`\`\`bash
FBI_API_KEY=… node pipeline/sources/cincinnati-oh.mjs
\`\`\`
`;
  writeFileSync(PROV_PATH, md);
  console.log(`  wrote data/cincinnati-oh/PROVENANCE.md`);
}

// ---- wiki/Data-Provenance.md append -------------------------------------------
function appendWiki({ summary, history }) {
  if (!existsSync(WIKI_PATH)) return;
  const cur = readFileSync(WIKI_PATH, "utf8");
  if (cur.includes("## Cincinnati, OH")) {
    console.log("  wiki/Data-Provenance.md already has a Cincinnati section — skipped");
    return;
  }
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const d = summary.dedupe;
  const section = `
## Cincinnati, OH (\`cincinnati-oh\`)

- **Primary source — a PAIR:** Reported Crime (STARS Category Offenses)
  **before 6/3/2024** (Socrata \`8xzn-kpn7\`, ${HUB_OLD}) + **on or after
  6/3/2024** (\`7aqy-xrv9\`, ${HUB_NEW}) — the city split the feed at CPD's
  2024-06-03 RMS cutover. **No license specified on either dataset**
  (flagged); attribution "City of Cincinnati / CPD".
- **Dedupe (disclosed):** both sets are offense-level and OVERLAP Jun–Nov 2024
  — ${fmt(d.fetchedRows)} rows → **${fmt(d.incidents)} incidents** on \`incident_no\`
  (${fmt(d.crossPairDroppedRows)} legacy rows for ${fmt(d.crossPairIncidents)} incidents present in both sets dropped, current
  system preferred; ${fmt(d.withinSetCollapsedRows)} multi-offense rows collapsed at highest STARS
  severity). All counts are incident-level.
- **Spatial unit:** the **50 official SNA neighborhoods** (CAGIS "Statistical
  Neighborhood Approximations 2020" polygons, field \`SNA_NAME\`) — the crime
  data's \`sna_neighborhood\` matches verbatim, 50 of 50 in both sets
  (identity join, no approximation).
- **Taxonomy (disclosed):** UCR-style **STARS** rollups, not NIBRS —
  Part 1 Violent → \`persons\` slot (includes robbery, unlike NIBRS),
  Part 1 Property → \`property\`, and the source's own **Part 2 "everything
  else" bucket** → third slot labeled "${summary.cats.society.label}";
  never presented as NIBRS Crimes Against Society.
- **Deep-history source (${history.yearMin}–${history.yearMax}):** FBI CDE — Cincinnati PD,
  **ORI ${ORI}** (the scout's OH0310600 = Cleves PD; corrected via byStateAbbr
  and verified) — real annual Violent + Property counts, ${history.years.length} full years.
  1997–1998 are non-reporting years the CDE publishes as zeros (dropped as
  artifacts, never shown as "zero crime") and the complete 1985–1996 segment
  is noncontiguous with the kept run — all dropped and disclosed.
- **Span:** ${history.yearMin}–${history.yearMax} (FBI UCR annual) + 2020-01-01 → 2026-05-31 (CPD
  STARS incidents, ${summary.months} months; last FULL month measured — the current set
  is loaded through 2026-06-23, so June 2026 is partial and excluded).
- **Records:** ${fmt(summary.totalRecords)} in-window incidents · ${fmt(summary.placedRecords)} placed in an official
  SNA (**${summary.coveragePct}% coverage**) · ${fmt(summary.unplacedRecords)} unplaced (blank neighborhood), kept
  in totals and disclosed.
- **Real dots:** CPD publishes 4-decimal (~11 m) coords against block-masked
  addresses — block-level, DISCLOSED; the legacy set's lat/lng columns are
  REVERSED at the source and are swapped back deterministically (disclosed).
  Dots are a deterministic ≤100/month sample; no-coordinate incidents are
  counted but not plotted.
- **License:** none specified (crime pair — flagged prominently); SNA polygons
  public open data from CAGIS with as-is disclaimer.
- **Detail:** [\`data/cincinnati-oh/PROVENANCE.md\`](../data/cincinnati-oh/PROVENANCE.md)

### Category mapping (STARS rollup → cat slot)

| Source value | cat |
|--------------|-----|
| Part 1 Violent (homicide, rape, robbery, agg. assault, strangulation) | \`persons\` (UCR keeps robbery here — disclosed vs NIBRS) |
| Part 1 Property (burglary/B&E, thefts, auto theft) | \`property\` |
| Part 2 (all other offenses — drugs, vandalism, fraud, simple assault, …) | \`society\` slot, labeled "Part 2 · All Other Offenses" |
| — | \`other\` structurally 0 (audited) |
`;
  // insert before "## Ranked source types" if present, else append
  const marker = "## Ranked source types";
  const idx = cur.indexOf(marker);
  const next =
    idx >= 0 ? cur.slice(0, idx) + section.trimStart() + "\n" + cur.slice(idx) : cur + section;
  writeFileSync(WIKI_PATH, next);
  console.log("  appended Cincinnati section to wiki/Data-Provenance.md");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
