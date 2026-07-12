// Washington, DC — MPD Crime Incidents source pipeline (fetch → normalize → validate).
//
// BINDING RULE: never fabricate — every figure written by this script comes
// straight from a queryable public source; every gap is disclosed.
//
// Sources:
//   Incidents  : Open Data DC "Crime Incidents" ArcGIS FEEDS/MPD MapServer —
//                one layer per year 2008…2026 (layer ids discovered from the
//                service directory). CC BY 4.0, attribution
//                "Open Data DC / Metropolitan Police Department".
//                https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/MPD/MapServer
//   Polygons   : DC Neighborhood Clusters (official, 46 features)
//                https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Administrative_Other_Boundaries_WebMercator/MapServer/17
//   History    : FBI Crime Data Explorer (CDE) summarized agency counts,
//                Metropolitan Police Department ORI DCMPD0000, 1985–2007
//                annual Violent + Property.
//
// Eras (honesty structure):
//   1985–2007  FBI UCR annual citywide totals (no neighborhood detail implied)
//   2008-01 → 2026-06  MPD incidents with Neighborhood Cluster detail
//                (2026-07 is a partial month at fetch time — dropped, disclosed)
//
//   node pipeline/sources/washington-dc.mjs     (set FBI_API_KEY to avoid DEMO_KEY limits)
//
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const OUT_DIR = resolve(repoRoot, "data/washington-dc/normalized");
const PROV_PATH = resolve(repoRoot, "data/washington-dc/PROVENANCE.md");
const WIKI_PATH = resolve(repoRoot, "wiki/Data-Provenance.md");

const MPD = "https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/MPD/MapServer";
const HUB = "https://opendata.dc.gov/datasets/crime-incidents-in-2025"; // family landing (one page per year)
const CLUSTERS_URL =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Administrative_Other_Boundaries_WebMercator/MapServer/17/query?where=1%3D1&outFields=NAME,NBH_NAMES,TYPE&outSR=4326&f=geojson";
const ORI = "DCMPD0000";
const AGENCY = "Metropolitan Police Department";
const FBI_KEY = process.env.FBI_API_KEY || "DEMO_KEY";
const LICENSE = "CC BY 4.0 — attribution: Open Data DC / Metropolitan Police Department";

// Granular era window: 2008-01 → 2026-06 (last FULL month; 2026-07 partial → dropped, disclosed)
const YM_START = "2008-01";
const YM_END = "2026-06";
const HIST_FROM = "01-1985";
const HIST_TO = "12-2007";

// OFFENSE → cat (NIBRS crimes-against convention, same as chicago-il).
// DC publishes only these Part-I-style offenses; nothing maps to `society`
// (no drug/weapon/vice offenses in this feed) — society is structurally zero
// and the video must say so rather than imply zero society crime.
const CAT_OF = {
  HOMICIDE: "persons",
  "SEX ABUSE": "persons",
  "ASSAULT W/DANGEROUS WEAPON": "persons",
  ROBBERY: "property",
  BURGLARY: "property",
  "THEFT F/AUTO": "property",
  "THEFT/OTHER": "property",
  "MOTOR VEHICLE THEFT": "property",
  ARSON: "property",
};
const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff4d6d" },
  property: { label: "Crimes Against Property", color: "#38bdf8" },
  society: { label: "Crimes Against Society (not in DC's published feed)", color: "#ffd166" },
  other: { label: "Unrecognized offense (context)", color: "#64748b" },
};
const CAT_KEYS = ["persons", "property", "society", "other"]; // catIdx order

// Valid DC coordinate box (coords are block midpoints published by MPD).
const BBOX = { latMin: 38.79, latMax: 39.0, lngMin: -77.12, lngMax: -76.9 };

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
    const j = await r.json();
    // ArcGIS returns HTTP 200 with an `error` object on failure — surface it.
    if (j && j.error) throw new Error(`${label}: ArcGIS error ${JSON.stringify(j.error)}`);
    return j;
  }
}

function q(layerId, params) {
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${MPD}/${layerId}/query?${qs}`;
}

// ---- month helpers ---------------------------------------------------------
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
const MONTHS = monthRange(YM_START, YM_END); // 222
const MONTH_IDX = new Map(MONTHS.map((m, i) => [m, i]));
// REPORT_DAT feature attributes are true UTC epochs, but MPD partitions the
// yearly layers — and the server evaluates TIMESTAMP literals and statistics —
// in DC local wall-clock (America/New_York). Verified live: layer 32 (2008) has
// rows at 2009-01-01T04:50Z (= 2008-12-31 23:50 EST) and
// `REPORT_DAT >= TIMESTAMP '2009-01-01 00:00:00'` matches 0 of them.
// So month bucketing MUST use DC local time to reconcile exactly.
const dtfDC = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const localDateOfMs = (ms) => dtfDC.format(new Date(ms)); // "YYYY-MM-DD" in DC local time
const ymOfMs = (ms) => localDateOfMs(ms).slice(0, 7);

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

// ---- polygon geometry (area-weighted centroid, shoelace) -------------------
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

// ArcGIS stats responses upper-case output field names — read case-insensitively.
function attr(attrs, name) {
  if (name in attrs) return attrs[name];
  const up = name.toUpperCase();
  if (up in attrs) return attrs[up];
  const lo = name.toLowerCase();
  if (lo in attrs) return attrs[lo];
  return undefined;
}

// ============================================================================
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const fetchedAt = new Date().toISOString();

  // ---- 1. Discover yearly incident layers from the service directory -------
  console.log("── MPD service directory: discover yearly layers");
  const svc = await getJSON(`${MPD}?f=json`, { label: "MPD service dir" });
  assert(Array.isArray(svc?.layers), "MPD service dir: no layers[]");
  const LAYERS = {}; // year → layer id
  for (const l of svc.layers) {
    const m = /^Crime Incidents - (\d{4})$/.exec(l.name);
    if (m) LAYERS[Number(m[1])] = l.id;
  }
  const YEARS = Object.keys(LAYERS).map(Number).sort((a, b) => a - b);
  assert(YEARS[0] === 2008 && YEARS[YEARS.length - 1] === 2026, `yearly layers span ${YEARS[0]}–${YEARS.at(-1)}, expected 2008–2026`);
  YEARS.forEach((y, i) => assert(y === 2008 + i, `missing yearly layer for ${2008 + i}`));
  console.log(`  ${YEARS.length} yearly layers: ` + YEARS.map((y) => `${y}→${LAYERS[y]}`).join(" "));

  // ---- 2. Neighborhood Cluster polygons -------------------------------------
  console.log("── Neighborhood Cluster polygons (official, joins incidents verbatim)");
  const gj = await getJSON(CLUSTERS_URL, { label: "cluster geojson" });
  assert(gj?.type === "FeatureCollection" && Array.isArray(gj.features), "clusters: bad geojson");
  assert(gj.features.length === 46, `clusters: expected 46 features, got ${gj.features.length}`);

  const beats = {};
  const fullNames = {}; // key → full NBH_NAMES string
  gj.features.forEach((f, idx) => {
    const key = f.properties?.NAME;
    assert(/^Cluster \d+$/.test(key || ""), `cluster feature ${idx}: bad NAME '${key}'`);
    assert(!beats[key], `clusters: duplicate NAME '${key}'`);
    const nbh = (f.properties?.NBH_NAMES || "").trim();
    assert(nbh.length > 0, `cluster '${key}': empty NBH_NAMES`);
    const parts0 = nbh.split(",").map((s) => s.trim()).filter(Boolean);
    const display = parts0.slice(0, 2).join(" / ");
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
    assert(A > 0, `cluster '${key}': zero area`);
    beats[key] = {
      key,
      name: display,
      desc: nbh, // full resident-known neighborhood list, verbatim from NBH_NAMES
      servcen: "",
      beat: idx,
      centroid: [Number((X / A).toFixed(6)), Number((Y / A).toFixed(6))],
      polygon: outerRings,
      geomType: g.type,
    };
    fullNames[key] = nbh;
  });
  const HOODS = new Set(Object.keys(beats));
  console.log(`  ${HOODS.size} clusters (e.g. Cluster 21 = "${beats["Cluster 21"]?.name}")`);

  // ---- 3. Page every yearly layer: rows → cells, points pool, feed pool -----
  console.log("── Incidents: page all yearly layers (2008…2026), bucket client-side");
  const cells = {};
  for (const k of HOODS)
    cells[k] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  const noClusterByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  const rowsByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)])); // client-side citywide
  const byMonthPts = MONTHS.map(() => []);
  const feedPool = new Map(); // "YYYY-Qn" → items (first 4 in OBJECTID order)
  const unknownOffenses = new Map(); // offense → count (mapped to `other`, logged)
  let dropped202607 = 0; // partial-month rows excluded (2026-07+)
  let ptsRejected = 0;
  let placeableCount = 0; // rows with in-bbox coords (denominator for sampleRate)

  const FIELDS = "REPORT_DAT,OFFENSE,METHOD,BLOCK,NEIGHBORHOOD_CLUSTER,LATITUDE,LONGITUDE";
  for (const year of YEARS) {
    const layer = LAYERS[year];
    const cnt = await getJSON(q(layer, { where: "1=1", returnCountOnly: "true", f: "json" }), {
      label: `count ${year}`,
    });
    const expected = cnt.count;
    assert(Number.isInteger(expected) && expected > 0, `count ${year}: bad ${expected}`);
    let got = 0;
    // NOTE: the server sometimes returns short pages (1000 instead of 2000)
    // with exceededTransferLimit=true — advance by the ACTUAL returned count.
    for (let offset = 0; offset < expected; ) {
      const page = await getJSON(
        q(layer, {
          where: "1=1",
          outFields: FIELDS,
          returnGeometry: "false",
          orderByFields: "OBJECTID",
          resultOffset: String(offset),
          resultRecordCount: "2000",
          f: "json",
        }),
        { label: `page ${year}@${offset}` },
      );
      assert(Array.isArray(page.features), `page ${year}@${offset}: no features`);
      assert(page.features.length > 0, `page ${year}@${offset}: empty page at ${got}/${expected}`);
      offset += page.features.length;
      for (const feat of page.features) {
        got++;
        const a = feat.attributes;
        assert(Number.isFinite(a.REPORT_DAT), `${year}: row without REPORT_DAT`);
        const ym = ymOfMs(a.REPORT_DAT);
        assert(ym.slice(0, 4) === String(year), `${year}: row dated ${ym} in wrong yearly layer`);
        if (ym > YM_END) {
          dropped202607++; // partial month at fetch time — excluded + disclosed
          continue;
        }
        const mi = MONTH_IDX.get(ym);
        assert(mi !== undefined, `${year}: month ${ym} outside span`);
        const offense = a.OFFENSE;
        let cat = CAT_OF[offense];
        if (!cat) {
          cat = "other";
          unknownOffenses.set(offense, (unknownOffenses.get(offense) || 0) + 1);
        }
        rowsByCatMonth[cat][mi]++;
        const hood = a.NEIGHBORHOOD_CLUSTER;
        if (HOODS.has(hood)) cells[hood][mi][cat]++;
        else {
          assert(
            hood === null || hood === undefined || String(hood).trim() === "",
            `${year}: unexpected NEIGHBORHOOD_CLUSTER '${hood}'`,
          );
          noClusterByCatMonth[cat][mi]++;
        }
        // points pool (block-midpoint coords published by MPD — real, disclosed grain)
        const lat = Number(a.LATITUDE),
          lng = Number(a.LONGITUDE);
        if (
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          lat >= BBOX.latMin &&
          lat <= BBOX.latMax &&
          lng >= BBOX.lngMin &&
          lng <= BBOX.lngMax
        ) {
          placeableCount++;
          byMonthPts[mi].push([Number(lng.toFixed(6)), Number(lat.toFixed(6)), CAT_KEYS.indexOf(cat)]);
        } else ptsRejected++;
        // feed pool: first 4 rows per quarter in OBJECTID order — no seriousness bias
        if (HOODS.has(hood) && a.BLOCK) {
          const qk = `${ym.slice(0, 4)}-Q${Math.floor((Number(ym.slice(5, 7)) - 1) / 3) + 1}`;
          const arr = feedPool.get(qk) || [];
          if (arr.length < 4) {
            const method = a.METHOD && a.METHOD !== "OTHERS" ? ` (${a.METHOD})` : "";
            arr.push({
              date: localDateOfMs(a.REPORT_DAT),
              title: `${offense}${method}`,
              place: a.BLOCK,
              beat: hood,
              cat,
            });
            feedPool.set(qk, arr);
          }
        }
      }
      if (!page.exceededTransferLimit)
        assert(got >= expected, `page ${year}: server stopped at ${got}/${expected}`);
    }
    assert(got === expected, `${year}: paged ${got} rows, expected ${expected}`);
    console.log(`  ${year}: ${got} rows paged`);
  }
  if (unknownOffenses.size)
    console.warn(
      `  UNRECOGNIZED OFFENSE values (mapped to 'other'): ${JSON.stringify([...unknownOffenses])}`,
    );
  else console.log("  all OFFENSE values covered by the category mapping (none → other)");
  console.log(`  dropped ${dropped202607} rows from partial month 2026-07 (disclosed)`);

  // ---- 4. Independent citywide check: server-side stats per month × offense --
  console.log("── Citywide per-month cross-check (server-side stats, no cluster)");
  const cityByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));
  const STATS = JSON.stringify([
    { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" },
  ]);
  for (const year of YEARS) {
    const layer = LAYERS[year];
    const lastMonth = year === 2026 ? 6 : 12;
    for (let m = 1; m <= lastMonth; m++) {
      const start = `${year}-${String(m).padStart(2, "0")}-01 00:00:00`;
      const ny = m === 12 ? year + 1 : year;
      const nm = m === 12 ? 1 : m + 1;
      const end = `${ny}-${String(nm).padStart(2, "0")}-01 00:00:00`;
      const res = await getJSON(
        q(layer, {
          where: `REPORT_DAT >= TIMESTAMP '${start}' AND REPORT_DAT < TIMESTAMP '${end}'`,
          groupByFieldsForStatistics: "OFFENSE",
          outStatistics: STATS,
          f: "json",
        }),
        { label: `stats ${year}-${String(m).padStart(2, "0")}` },
      );
      const mi = MONTH_IDX.get(`${year}-${String(m).padStart(2, "0")}`);
      for (const feat of res.features || []) {
        const offense = attr(feat.attributes, "OFFENSE");
        const n = Number(attr(feat.attributes, "n"));
        assert(Number.isFinite(n), `stats ${year}-${m}: bad count`);
        cityByCatMonth[CAT_OF[offense] || "other"][mi] += n;
      }
    }
  }
  // Reconcile EXACTLY: placed + unplaced == citywide, per month per cat —
  // and both must equal the client-side row bucketing.
  for (const cat of CAT_KEYS) {
    for (let mi = 0; mi < MONTHS.length; mi++) {
      let placed = 0;
      for (const k of HOODS) placed += cells[k][mi][cat];
      const lhs = placed + noClusterByCatMonth[cat][mi];
      assert(
        lhs === cityByCatMonth[cat][mi],
        `month ${MONTHS[mi]} cat ${cat}: placed+unplaced ${lhs} != citywide ${cityByCatMonth[cat][mi]}`,
      );
      assert(
        lhs === rowsByCatMonth[cat][mi],
        `month ${MONTHS[mi]} cat ${cat}: paged rows ${rowsByCatMonth[cat][mi]} != ${lhs}`,
      );
    }
  }
  console.log(`  placed + unplaced == citywide for all ${MONTHS.length} months × 4 cats ✓ (exact)`);

  // ---- 5. Totals -------------------------------------------------------------
  let placedRecords = 0;
  for (const k of HOODS)
    for (const cc of cells[k]) placedRecords += cc.persons + cc.property + cc.society + cc.other;
  const noCluster = CAT_KEYS.reduce(
    (s, c) => s + noClusterByCatMonth[c].reduce((a, b) => a + b, 0),
    0,
  );
  const totalRecords = placedRecords + noCluster;
  const catTotals = Object.fromEntries(
    CAT_KEYS.map((c) => [c, cityByCatMonth[c].reduce((a, b) => a + b, 0)]),
  );
  assert(
    CAT_KEYS.reduce((s, c) => s + catTotals[c], 0) === totalRecords,
    "catTotals do not sum to totalRecords",
  );
  const coveragePct = Math.round((placedRecords / totalRecords) * 1000) / 10;
  console.log(
    `  total ${totalRecords} = placed ${placedRecords} + no-cluster ${noCluster} → coverage ${coveragePct}%`,
  );

  // ---- 6. Points: deterministic even-stride sample ≤100/month ----------------
  const pts = byMonthPts.map((arr) => {
    if (arr.length <= 100) return arr;
    const out = [];
    for (let i = 0; i < 100; i++) out.push(arr[Math.floor((i * arr.length) / 100)]);
    return out;
  });
  const ptsKept = pts.reduce((s, a) => s + a.length, 0);
  const sampleRate = Math.round(placeableCount / ptsKept);
  console.log(
    `── Points: ${placeableCount} in-bbox rows, ${ptsRejected} rejected (bad/out-of-bbox coords), kept ${ptsKept} → 1 per ~${sampleRate}`,
  );

  // ---- 7. Feed ----------------------------------------------------------------
  const feed = [...feedPool.values()].flat();
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`── Feed: ${feed.length} real items (4 per quarter, chronological, no seriousness bias)`);

  // ---- 8. FBI UCR history 1985–2007 (LAST — DEMO_KEY may be rate-limited) -----
  console.log(
    `── FBI CDE history (${ORI}, 1985–2007, key=${FBI_KEY === "DEMO_KEY" ? "DEMO_KEY" : "FBI_API_KEY"})`,
  );
  async function fetchAnnual(offense) {
    const url = `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/${offense}?from=${HIST_FROM}&to=${HIST_TO}&API_KEY=${FBI_KEY}`;
    let waited = 0;
    const BUDGET = 20 * 60 * 1000; // 20 min total backoff budget
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(url);
      if (r.status === 429 || r.status >= 500) {
        const wait = attempt === 0 ? 90_000 : 300_000; // 90s → 300s backoff
        if (waited + wait > BUDGET)
          throw new Error(
            `FBI ${offense}: still HTTP ${r.status} after ${Math.round(waited / 1000)}s of backoff. ` +
              `Get a free key at https://api.data.gov/signup/ and set FBI_API_KEY.`,
          );
        console.warn(`  HTTP ${r.status} (${offense}); waiting ${wait / 1000}s…`);
        await sleep(wait);
        waited += wait;
        continue;
      }
      if (!r.ok) throw new Error(`FBI ${offense}: HTTP ${r.status}`);
      const j = await r.json();
      const actuals = j?.offenses?.actuals;
      if (!actuals) throw new Error(`FBI ${offense}: no actuals in response`);
      const agKey =
        Object.keys(actuals).find((k) => /Metropolitan Police|District of Columbia|Washington/i.test(k)) ||
        Object.keys(actuals).find((k) => !/United States/i.test(k));
      if (!agKey) throw new Error(`FBI ${offense}: no agency series in actuals`);
      console.log(`  ${offense}: agency series "${agKey}"`);
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
  }
  const violent = await fetchAnnual("violent-crime");
  const property = await fetchAnnual("property-crime");
  const droppedYears = [];
  const years = [];
  for (let y = 1985; y <= 2007; y++) {
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
  console.log(`  ${years.length} complete years ${yearMin}–${yearMax} (12 reported months each verified)`);

  // ---- Assemble output files ---------------------------------------------------
  const timeline = { months: MONTHS, cells };
  const beatsFile = { cats: CATS, beats };
  const summary = {
    slug: "washington-dc",
    title: "Washington · DC",
    source: { records: MPD, beats: CLUSTERS_URL, hub: HUB },
    fetchedAt,
    dateMin: "2008-01-01",
    dateMax: "2026-06-30",
    months: MONTHS.length,
    totalRecords,
    placedRecords,
    unplacedRecords: noCluster,
    coveragePct,
    unplacedBeats: { "no-cluster": noCluster },
    catTotals,
    cats: CATS,
    beatCount: Object.keys(beats).length,
  };
  const history = {
    era: "history",
    taxonomy:
      "FBI UCR Summary (Violent + Property) — a different taxonomy than the MPD offense categories used from 2008; the two eras bridge at 2008 and are never equated",
    agency: AGENCY,
    ori: ORI,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      `Annual totals are real UCR Summary counts fetched from the FBI CDE summarized agency endpoint for ORI ${ORI} ` +
      `(12 reported months verified per year). UCR Summary (Violent/Property) and MPD's published Part-I-style offense ` +
      `feed are different taxonomies and are presented as distinct eras; Neighborhood Cluster detail exists only from ` +
      `2008 (the MPD open-data feed starts there), so the story bridges from citywide annual history to per-cluster ` +
      `monthly data at 2008. Reproduce with pipeline/sources/washington-dc.mjs (set FBI_API_KEY to avoid DEMO_KEY rate limits).` +
      (droppedYears.length
        ? ` Dropped partial years: ${droppedYears.map((d) => d.year).join(", ")}.`
        : ""),
    yearMin,
    yearMax,
    cats: {
      violent: { label: "UCR Violent (murder, rape, robbery, agg. assault)", color: "#ff4d6d" },
      property: { label: "UCR Property (burglary, larceny, MV theft)", color: "#38bdf8" },
    },
    years,
  };
  const neighborhoods = {
    source: "DC Neighborhood Clusters (official, Office of Planning)",
    sourceUrl: CLUSTERS_URL,
    hub: "https://opendata.dc.gov/",
    fetchedAt,
    license: LICENSE,
    method:
      "identity — MPD crime records carry the official Neighborhood Cluster name ('Cluster N') verbatim; no spatial join or approximation is involved. Display names are the first two resident-known neighborhood names from the cluster's NBH_NAMES; the full list is in beats.json (beats[key].desc).",
    map: Object.fromEntries(
      Object.keys(beats).map((k) => [k, { name: beats[k].name, approx: false }]),
    ),
  };
  const points = {
    mode: "real-sample",
    note:
      "Every dot is a real reported offense location, published by MPD at block-midpoint grain (anonymized to the block). Deterministic sample (≤100/month). " +
      `${ptsRejected} rows with missing/out-of-bbox coordinates are counted in every total but not plotted.`,
    sampleRate,
    months: MONTHS,
    pts,
  };

  // ---- VALIDATE (fail loudly) ---------------------------------------------------
  console.log("── Validation");
  assert(
    MONTHS.length === 222 && MONTHS[0] === "2008-01" && MONTHS[221] === "2026-06",
    "months not contiguous 2008-01..2026-06",
  );
  for (let i = 1; i < MONTHS.length; i++) {
    const [py, pm] = MONTHS[i - 1].split("-").map(Number);
    const [cy, cm] = MONTHS[i].split("-").map(Number);
    assert(
      (cm === pm + 1 && cy === py) || (cm === 1 && pm === 12 && cy === py + 1),
      `months not contiguous at ${MONTHS[i]}`,
    );
  }
  assert(Object.keys(beats).length === 46, "beatCount != 46");
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
    assert(f.date >= "2008-01-01" && f.date <= "2026-06-30", `feed date out of span ${f.date}`);
    assert(HOODS.has(f.beat), `feed beat '${f.beat}' unknown`);
  }
  // society must be structurally zero (DC publishes no society offenses)
  assert(catTotals.society === 0, "society expected structurally zero for DC");
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

  // ---- Write ---------------------------------------------------------------------
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
    dropped202607,
    placeableCount,
    ptsRejected,
    ptsKept,
    sampleRate,
    catTotals,
    unknownOffenses,
  });
  appendWiki({ summary, history });

  console.log("\n── Final summary.json");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nVALIDATION PASS");
}

// ---- PROVENANCE.md --------------------------------------------------------------
function writeProvenance({
  fetchedAt,
  summary,
  history,
  droppedYears,
  dropped202607,
  placeableCount,
  ptsRejected,
  ptsKept,
  sampleRate,
  catTotals,
  unknownOffenses,
}) {
  const md = `# Provenance — Washington, DC

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **Crime Incidents** (Open Data DC, one ArcGIS layer per year 2008–2026) |
| Publisher | Metropolitan Police Department (MPD), via Open Data DC |
| Landing pages | https://opendata.dc.gov/ (search "Crime Incidents in <year>") |
| API | ${MPD} (yearly layers; ids discovered from the service directory) |
| Fetched | ${fetchedAt} |
| License | ${LICENSE} |
| Records used | ${summary.totalRecords.toLocaleString("en-US")} (REPORT_DAT 2008-01-01 → 2026-06-30) |
| Source caveat | MPD publishes only finalized Part-I-style incident reports; the feed is updated daily and classifications can change |

### Windowing (disclosed exclusions)
- Rows after **2026-06-30** (${dropped202607.toLocaleString("en-US")} rows in the partial month 2026-07 at fetch time) are excluded; the granular window ends at the last full month.
- Dates come from \`REPORT_DAT\` (report date, epoch ms — a true UTC instant). MPD partitions the yearly layers **in DC local wall-clock time** (America/New_York), and the ArcGIS server evaluates \`TIMESTAMP\` filters/statistics the same way, so month bucketing uses DC local time; layer partitioning, server-side statistics, and client-side bucketing then agree exactly (asserted in-script).

### Fields used
\`REPORT_DAT\` · \`OFFENSE\` · \`METHOD\` · \`BLOCK\` · \`NEIGHBORHOOD_CLUSTER\` · \`LATITUDE\`/\`LONGITUDE\`.

### Category mapping (OFFENSE → cat, NIBRS crimes-against convention)
| OFFENSE | cat | window count |
|---|---|--:|
| HOMICIDE, SEX ABUSE, ASSAULT W/DANGEROUS WEAPON | \`persons\` | ${catTotals.persons.toLocaleString("en-US")} |
| ROBBERY, BURGLARY, THEFT F/AUTO, THEFT/OTHER, MOTOR VEHICLE THEFT, ARSON | \`property\` | ${catTotals.property.toLocaleString("en-US")} |
| *(none — see below)* | \`society\` | ${catTotals.society.toLocaleString("en-US")} |
| unrecognized OFFENSE values | \`other\` | ${catTotals.other.toLocaleString("en-US")} |

**\`society\` is structurally zero for DC**: MPD's open-data feed publishes only the nine Part-I-style offenses above — no drug, weapon, or vice offenses are released in this dataset, so "Crimes Against Society" cannot be shown for DC and the video must say the category is not published, not that it is zero.${
    unknownOffenses.size
      ? `\n\nUnrecognized OFFENSE values mapped to \`other\` and logged: ${[...unknownOffenses].map(([k, v]) => `${k} (${v})`).join(", ")}.`
      : "\n\nAll distinct OFFENSE values in the fetched window were covered by the mapping; \`other\` is 0."
  }

### Coverage
- Placed (one of the 46 official Neighborhood Clusters, 2008-01…2026-06): **${summary.placedRecords.toLocaleString("en-US")}** (${summary.coveragePct}%)
- Unplaced: ${summary.unplacedRecords.toLocaleString("en-US")} rows whose \`NEIGHBORHOOD_CLUSTER\` is blank/null (mostly older years) — kept in every total, disclosed as \`unplacedBeats["no-cluster"]\`, never silently dropped.
- Identity \`placed + unplaced == citywide\` validated **exactly** per month × category in-script, where the citywide side is an independent server-side statistics query (groupBy OFFENSE per month, no cluster involved).

## Geometry source — Neighborhood Cluster polygons

| Field | Value |
|-------|-------|
| Dataset | **DC Neighborhood Clusters** (Office of Planning) — 46 polygons |
| MapServer | https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Administrative_Other_Boundaries_WebMercator/MapServer/17 |
| Join key | \`NAME\` ("Cluster N") — matches the crime data's \`NEIGHBORHOOD_CLUSTER\` values **verbatim** (no fuzzy matching) |
| Display names | first two resident-known neighborhood names from \`NBH_NAMES\` (e.g. Cluster 17 → "Takoma / Brightwood"); the full comma-separated list is kept verbatim in \`beats.json\` (\`beats[key].desc\`) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (\`points.json\`)

MPD publishes coordinates at **block-midpoint grain** (anonymized to the block) — every dot is a real reported offense location as released, never synthesized, and the block grain is disclosed on screen. Client-side gate: lat ${BBOX.latMin}–${BBOX.latMax}, lng ${BBOX.lngMin}–${BBOX.lngMax}; ${ptsRejected.toLocaleString("en-US")} rows failed it and are counted but not plotted. Deterministic even-stride sample ≤100/month → **${ptsKept.toLocaleString("en-US")} points ≈ 1 per ${sampleRate} of the ${placeableCount.toLocaleString("en-US")} placeable rows**.

## Dispatch feed (\`feed.json\`)

First 4 rows per quarter in OBJECTID order (2008-Q1 … 2026-Q2) with a cluster and a block — **no seriousness bias**; title is \`OFFENSE\` plus \`METHOD\` when it is GUN or KNIFE (METHOD "OTHERS" is MPD's catch-all and is omitted from titles).

## Historical source — FBI UCR (${history.yearMin}–${history.yearMax} deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | ${AGENCY} — **ORI \`${ORI}\`** |
| Endpoint | ${history.sourceUrl} (and \`/property-crime\`) |
| Span | ${history.yearMin}–${history.yearMax}, annual Violent + Property (12 reported months verified per year)${droppedYears.length ? ` — dropped partial years: ${droppedYears.map((d) => d.year).join(", ")}` : ""} |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set \`FBI_API_KEY\`) |

UCR Summary (Violent/Property) is a **different taxonomy** than MPD's published offense feed — the eras are presented as distinct and bridge at 2008; they are never equated. No monthly or neighborhood detail is implied for ${history.yearMin}–${history.yearMax}.

## Reproduce

\`\`\`bash
FBI_API_KEY=… node pipeline/sources/washington-dc.mjs
\`\`\`
`;
  writeFileSync(PROV_PATH, md);
  console.log(`  wrote data/washington-dc/PROVENANCE.md`);
}

// ---- wiki/Data-Provenance.md append ------------------------------------------------
function appendWiki({ summary, history }) {
  if (!existsSync(WIKI_PATH)) return;
  const cur = readFileSync(WIKI_PATH, "utf8");
  if (cur.includes("## washington-dc")) {
    console.log("  wiki/Data-Provenance.md already has a washington-dc section — skipped");
    return;
  }
  const section = `
## washington-dc — Washington, DC

- **Primary source:** Open Data DC "Crime Incidents" — ArcGIS FEEDS/MPD MapServer,
  one layer per year 2008–2026 (${MPD}) —
  **CC BY 4.0**, attribution "Open Data DC / Metropolitan Police Department".
  Finalized Part-I-style incident reports; updated daily.
- **Spatial unit:** the 46 official **Neighborhood Clusters** — the crime data's
  \`NEIGHBORHOOD_CLUSTER\` field ("Cluster N") matches the Office of Planning
  polygon layer's \`NAME\` verbatim (identity join, no approximation). Display
  names use the first two resident-known neighborhoods from \`NBH_NAMES\`
  (full lists kept in \`beats.json\`).
- **Deep-history source (${history.yearMin}–${history.yearMax}):** FBI Crime Data Explorer (CDE) —
  ${AGENCY}, **ORI ${ORI}** — real annual Violent + Property counts,
  ${history.years.length} full years (12 reported months each, verified). UCR taxonomy kept
  distinct from MPD's offense feed; eras bridge at 2008.
- **Span:** ${history.yearMin}–${history.yearMax} (FBI UCR annual) + 2008-01-01 → 2026-06-30 (MPD incidents
  with cluster detail, ${summary.months} months). The partial month 2026-07 at fetch
  time is dropped and disclosed.
- **Records:** ${summary.totalRecords.toLocaleString("en-US")} total (2008-01 → 2026-06) ·
  ${summary.placedRecords.toLocaleString("en-US")} placed in a Neighborhood Cluster
  (**${summary.coveragePct}% coverage**) · ${summary.unplacedRecords.toLocaleString("en-US")} with a blank
  cluster field, kept in totals and disclosed. Placed+unplaced == citywide
  verified exactly per month × category against independent server-side stats.
- **Real dots:** MPD publishes coordinates at **block-midpoint** grain (100%
  of rows carry coords) — dots are a deterministic ≤100/month sample of real
  block-level locations; the block grain is disclosed on screen.
- **Society note:** DC's feed contains **no crimes-against-society offenses**
  (no drug/weapon/vice) — \`society\` is structurally zero and the video must
  say "not published", never imply zero society crime.
- **License:** CC BY 4.0 (Open Data DC); cluster polygons CC BY 4.0 (Office of Planning).
- **Detail:** [\`data/washington-dc/PROVENANCE.md\`](../data/washington-dc/PROVENANCE.md)

### Category mapping (OFFENSE → cat)

| OFFENSE | cat |
|---------|-----|
| HOMICIDE, SEX ABUSE, ASSAULT W/DANGEROUS WEAPON | \`persons\` |
| ROBBERY, BURGLARY, THEFT F/AUTO, THEFT/OTHER, MOTOR VEHICLE THEFT, ARSON | \`property\` |
| *(none published)* | \`society\` (structurally zero — disclosed) |
| anything unrecognized | \`other\` (logged; 0 in current fetch unless noted in PROVENANCE) |
`;
  const marker = "## Ranked source types";
  const idx = cur.indexOf(marker);
  const next =
    idx >= 0 ? cur.slice(0, idx) + section.trimStart() + "\n" + cur.slice(idx) : cur + section;
  writeFileSync(WIKI_PATH, next);
  console.log("  appended washington-dc section to wiki/Data-Provenance.md");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
