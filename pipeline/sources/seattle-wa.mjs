// Seattle, WA — SPD Crime Data source pipeline (fetch → normalize → validate).
//
// BINDING RULE: never fabricate — every figure written by this script comes
// straight from a queryable public source; every gap is disclosed.
//
// Sources:
//   Incidents  : Socrata "SPD Crime Data: 2008-Present" (tazs-3rd5), PUBLIC_DOMAIN,
//                attribution "SPD". Only finalized (UCR-approved) reports;
//                updated daily; classifications can change.
//                https://data.seattle.gov/resource/tazs-3rd5.json
//   Polygons   : Seattle MCPP neighborhoods (official, 58 features)
//                https://services.arcgis.com/ZOyb2t4B0UYuYNYH/ArcGIS/rest/services/MCPP/FeatureServer/0
//   History    : FBI Crime Data Explorer (CDE) summarized agency counts,
//                Seattle PD ORI WASPD0000, 1985–2016 annual Violent + Property.
//
// Eras (honesty structure):
//   1985–2016  FBI UCR annual citywide totals (no neighborhood detail implied)
//   2017-01 → 2026-06  SPD NIBRS with MCPP neighborhood detail (the
//                `neighborhood` field is ≈99% "-" before 2017, so the granular
//                era honestly starts at 2017; 2008–2016 SPD rows are counted in
//                summary totals and disclosed as "pre-2017" unplaced).
//
//   node pipeline/sources/seattle-wa.mjs        (set FBI_API_KEY to avoid DEMO_KEY limits)
//
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const OUT_DIR = resolve(repoRoot, "data/seattle-wa/normalized");
const PROV_PATH = resolve(repoRoot, "data/seattle-wa/PROVENANCE.md");
const WIKI_PATH = resolve(repoRoot, "wiki/Data-Provenance.md");

const SODA = "https://data.seattle.gov/resource/tazs-3rd5.json";
const HUB = "https://data.seattle.gov/d/tazs-3rd5";
const MCPP_URL =
  "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/ArcGIS/rest/services/MCPP/FeatureServer/0/query?where=1=1&outFields=*&f=geojson";
const ORI = "WASPD0000";
const AGENCY = "Seattle Police Department";
const FBI_KEY = process.env.FBI_API_KEY || "DEMO_KEY";

// Granular era window (neighborhood field only populated from 2017; last full month)
const SPAN_START = "2017-01-01T00:00:00"; // inclusive
const SPAN_END = "2026-07-01T00:00:00"; // exclusive → dateMax 2026-06-30
const FULL_START = "2008-01-01T00:00:00"; // dataset's honest start (pre-2008 rows are dirty)
const HIST_FROM = "01-1985";
const HIST_TO = "12-2016";

// nibrs_crime_against_category → cat. ANY is SPD's mixed-target bucket —
// disclosed as context, never counted as NIBRS Group A persons/property/society.
const CAT_OF = {
  PERSON: "persons",
  PROPERTY: "property",
  SOCIETY: "society",
  ANY: "other",
  NOT_A_CRIME: "other",
  "-": "other",
};
const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff2e63" },
  property: { label: "Crimes Against Property", color: "#ffc233" },
  society: { label: "Crimes Against Society", color: "#34e0e0" },
  other: { label: "Mixed / non-criminal (context)", color: "#7486a0" },
};
const CAT_KEYS = ["persons", "property", "society", "other"]; // catIdx order
const CAT_WHERE = {
  persons: `nibrs_crime_against_category in ('PERSON')`,
  property: `nibrs_crime_against_category in ('PROPERTY')`,
  society: `nibrs_crime_against_category in ('SOCIETY')`,
  other: `nibrs_crime_against_category in ('ANY','NOT_A_CRIME','-')`,
};
const JUNK_HOODS = new Set(["-", "UNKNOWN", "OOJ", "FK ERROR", "", null, undefined]);

// Valid Seattle coordinate box (source lat/lng are TEXT with sentinels:
// "REDACTED", "-1.0", and junk like "89.99998854" — all rejected here).
const BBOX = { latMin: 47.4, latMax: 47.8, lngMin: -122.5, lngMax: -122.2 };

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
const MONTHS = monthRange("2017-01", "2026-06"); // 114
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

  // ---- 1. MCPP polygons ---------------------------------------------------
  console.log("── MCPP neighborhood polygons");
  const gj = await getJSON(MCPP_URL, { label: "MCPP geojson" });
  assert(gj?.type === "FeatureCollection" && Array.isArray(gj.features), "MCPP: bad geojson");
  assert(gj.features.length === 58, `MCPP: expected 58 features, got ${gj.features.length}`);

  const beats = {};
  gj.features.forEach((f, idx) => {
    const key = f.properties?.neighborhood;
    assert(typeof key === "string" && key.length > 0, `MCPP feature ${idx}: missing neighborhood`);
    assert(!beats[key], `MCPP: duplicate neighborhood '${key}'`);
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
    assert(A > 0, `MCPP '${key}': zero area`);
    beats[key] = {
      key,
      name: titleCase(key),
      servcen: f.properties?.precinct ?? "",
      beat: idx,
      centroid: [Number((X / A).toFixed(6)), Number((Y / A).toFixed(6))],
      polygon: outerRings,
      geomType: g.type,
    };
  });
  const HOODS = new Set(Object.keys(beats));
  console.log(`  ${HOODS.size} neighborhoods (e.g. ${[...HOODS].slice(0, 3).join(", ")})`);

  // ---- 2. Timeline cells: per-cat × neighborhood × month -------------------
  console.log("── Timeline: per-neighborhood monthly counts by category (2017-01…2026-06)");
  const cells = {};
  for (const k of HOODS)
    cells[k] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  // junk/blank-neighborhood rows inside the span, per cat per month (disclosed as unplaced)
  const junkByCatMonth = Object.fromEntries(CAT_KEYS.map((c) => [c, MONTHS.map(() => 0)]));

  for (const cat of CAT_KEYS) {
    const rows = await getJSON(
      soda({
        $select: "neighborhood,date_trunc_ym(offense_date) AS ym,count(*) AS n",
        $where: `offense_date >= '${SPAN_START}' AND offense_date < '${SPAN_END}' AND ${CAT_WHERE[cat]}`,
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

  // ---- 3. Citywide per-cat monthly (cross-check + unplaced derivation) ------
  console.log("── Citywide monthly totals per category (cross-check)");
  const cityByCatMonth = {};
  for (const cat of CAT_KEYS) {
    const rows = await getJSON(
      soda({
        $select: "date_trunc_ym(offense_date) AS ym,count(*) AS n",
        $where: `offense_date >= '${SPAN_START}' AND offense_date < '${SPAN_END}' AND ${CAT_WHERE[cat]}`,
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
  console.log("  placed + unplaced == citywide for all 114 months × 4 cats ✓");

  // ---- 4. Dataset-level totals ---------------------------------------------
  console.log("── Dataset totals (2008-01-01 … 2026-06-30 window)");
  // Rows before 2008 are dirty (2,966 rows, offense_date back to 1900) and rows
  // after 2026-06-30 are a partial month — both excluded and disclosed.
  const [{ count: totalStr }] = await getJSON(
    soda({
      $select: "count(*) AS count",
      $where: `offense_date >= '${FULL_START}' AND offense_date < '${SPAN_END}'`,
    }),
    { label: "total 2008+" },
  );
  const totalRecords = Number(totalStr);
  const [{ count: preStr }] = await getJSON(
    soda({
      $select: "count(*) AS count",
      $where: `offense_date >= '${FULL_START}' AND offense_date < '${SPAN_START}'`,
    }),
    { label: "pre-2017 count" },
  );
  const pre2017 = Number(preStr);
  const catRows = await getJSON(
    soda({
      $select: "nibrs_crime_against_category AS c,count(*) AS n",
      $where: `offense_date >= '${FULL_START}' AND offense_date < '${SPAN_END}'`,
      $group: "c",
      $limit: "100",
    }),
    { label: "catTotals 2008+" },
  );
  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  for (const r of catRows) {
    const cat = CAT_OF[r.c];
    assert(cat, `catTotals: unmapped nibrs_crime_against_category '${r.c}'`);
    catTotals[cat] += Number(r.n);
  }
  assert(
    CAT_KEYS.reduce((s, c) => s + catTotals[c], 0) === totalRecords,
    "catTotals do not sum to totalRecords",
  );

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
    pre2017 + citywideSpanTotal === totalRecords,
    `pre2017 ${pre2017} + span ${citywideSpanTotal} != total ${totalRecords}`,
  );
  const unplacedRecords = pre2017 + noNeighborhood;
  assert(placedRecords + unplacedRecords === totalRecords, "placed+unplaced != total");
  const coveragePct = Math.round((placedRecords / totalRecords) * 1000) / 10;
  console.log(
    `  total ${totalRecords} = placed ${placedRecords} + pre-2017 ${pre2017} + no-neighborhood ${noNeighborhood}` +
      ` → coverage ${coveragePct}%`,
  );

  // ---- 5. Sampled REAL points ----------------------------------------------
  console.log("── Real incident points (block-snapped by SPD; deterministic sample)");
  const byMonth = MONTHS.map(() => []);
  let placeableCount = 0; // rows matching the non-redacted filter (for sampleRate)
  let fetched = 0,
    rejected = 0;
  for (let y = 2017; y <= 2026; y++) {
    const yEnd = y === 2026 ? SPAN_END : `${y + 1}-01-01T00:00:00`;
    const where =
      `offense_date >= '${y}-01-01T00:00:00' AND offense_date < '${yEnd}'` +
      ` AND latitude NOT IN ('REDACTED','-1.0')`;
    const [{ count: pc }] = await getJSON(
      soda({ $select: "count(*) AS count", $where: where }),
      { label: `points count ${y}` },
    );
    placeableCount += Number(pc);
    const rows = await getJSON(
      soda({
        $select: "offense_date,latitude,longitude,nibrs_crime_against_category",
        $where: where,
        $order: ":id",
        $limit: "1300",
      }),
      { label: `points ${y}` },
    );
    for (const r of rows) {
      fetched++;
      const lat = Number(r.latitude),
        lng = Number(r.longitude);
      const mi = MONTH_IDX.get(ymOf(r.offense_date));
      const cat = CAT_OF[r.nibrs_crime_against_category];
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

  // ---- 6. Dispatch feed ------------------------------------------------------
  console.log("── Feed: 8 real items per quarter, 2017-Q1 … 2026-Q2");
  const feed = [];
  for (let y = 2017; y <= 2026; y++) {
    for (let q = 0; q < 4; q++) {
      const start = `${y}-${String(q * 3 + 1).padStart(2, "0")}-01T00:00:00`;
      const end =
        q === 3 ? `${y + 1}-01-01T00:00:00` : `${y}-${String(q * 3 + 4).padStart(2, "0")}-01T00:00:00`;
      if (start >= SPAN_END) continue;
      const rows = await getJSON(
        soda({
          $select:
            "offense_date,nibrs_offense_code_description,block_address,neighborhood,nibrs_crime_against_category",
          $where:
            `offense_date >= '${start}' AND offense_date < '${end}'` +
            ` AND neighborhood not in ('-','UNKNOWN','OOJ','FK ERROR')`,
          $order: ":id",
          $limit: "8",
        }),
        { label: `feed ${y}Q${q + 1}` },
      );
      for (const r of rows) {
        assert(HOODS.has(r.neighborhood), `feed: unexpected neighborhood '${r.neighborhood}'`);
        feed.push({
          date: String(r.offense_date).slice(0, 10),
          title: r.nibrs_offense_code_description || "OFFENSE (unspecified)",
          place: r.block_address || "",
          beat: r.neighborhood,
          cat: CAT_OF[r.nibrs_crime_against_category] || "other",
        });
      }
    }
  }
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`  ${feed.length} feed items (chronological, no seriousness bias)`);

  // ---- 7. FBI UCR history 1985–2016 -----------------------------------------
  console.log(`── FBI CDE history (${ORI}, 1985–2016, key=${FBI_KEY === "DEMO_KEY" ? "DEMO_KEY" : "FBI_API_KEY"})`);
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
      const agKey =
        Object.keys(actuals).find((k) => /Seattle/i.test(k)) ||
        Object.keys(actuals).find((k) => !/United States/i.test(k));
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
  // contiguity within the kept span (partial years allowed only at the edges)
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
    slug: "seattle-wa",
    title: "Seattle · WA",
    source: { records: SODA, beats: MCPP_URL, hub: HUB },
    fetchedAt,
    dateMin: "2017-01-01",
    dateMax: "2026-06-30",
    months: MONTHS.length,
    totalRecords,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: { "pre-2017": pre2017, "no-neighborhood": noNeighborhood },
    catTotals,
    cats: CATS,
    beatCount: Object.keys(beats).length,
  };
  const history = {
    era: "history",
    taxonomy:
      "FBI UCR Summary (Violent + Property) — a different taxonomy than the SPD NIBRS categories used from 2017; the two eras bridge at 2017 and are never equated",
    agency: AGENCY,
    ori: ORI,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      `Annual totals are real UCR Summary counts fetched from the FBI CDE summarized agency endpoint for ORI ${ORI} ` +
      `(12 reported months verified per year). UCR Summary (Violent/Property) and SPD NIBRS are different taxonomies ` +
      `and are presented as distinct eras; neighborhood-level detail exists only from 2017 (SPD's MCPP field is blank ` +
      `before then), so the story bridges from citywide annual history to per-neighborhood monthly data at 2017. ` +
      `Reproduce with pipeline/sources/seattle-wa.mjs (set FBI_API_KEY to avoid DEMO_KEY rate limits).` +
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
    source: "Seattle MCPP (official)",
    sourceUrl: MCPP_URL,
    hub: "https://data.seattle.gov/",
    fetchedAt,
    license: "Public Domain",
    method:
      "identity — SPD crime records carry the official MCPP neighborhood name verbatim; no spatial join or approximation is involved",
    map: Object.fromEntries(
      Object.keys(beats).map((k) => [k, { name: titleCase(k), approx: false }]),
    ),
  };
  const points = {
    mode: "real-sample",
    note:
      "Every dot is a real reported offense location, anonymized to the block by SPD; 25.7% of records have redacted locations and are counted but not plotted. Deterministic sample (≤100/month).",
    sampleRate,
    months: MONTHS,
    pts,
  };

  // ---- VALIDATE (fail loudly) -------------------------------------------------
  console.log("── Validation");
  assert(MONTHS.length === 114 && MONTHS[0] === "2017-01" && MONTHS[113] === "2026-06",
    "months not contiguous 2017-01..2026-06");
  for (let i = 1; i < MONTHS.length; i++) {
    const [py, pm] = MONTHS[i - 1].split("-").map(Number);
    const [cy, cm] = MONTHS[i].split("-").map(Number);
    assert((cm === pm + 1 && cy === py) || (cm === 1 && pm === 12 && cy === py + 1),
      `months not contiguous at ${MONTHS[i]}`);
  }
  assert(Object.keys(beats).length === 58, "beatCount != 58");
  for (const k of Object.keys(cells)) {
    assert(beats[k], `cells key '${k}' has no beat polygon`);
    assert(cells[k].length === MONTHS.length, `cells['${k}'] length != ${MONTHS.length}`);
  }
  for (const k of Object.keys(beats)) assert(cells[k], `beat '${k}' missing from cells`);
  assert(pts.length === MONTHS.length, "points.pts not aligned with months");
  for (const monthArr of pts)
    for (const [lng, lat, ci] of monthArr) {
      assert(lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax,
        `point out of bbox: ${lng},${lat}`);
      assert(ci >= 0 && ci <= 3, `bad catIdx ${ci}`);
    }
  assert(history.years.length === yearMax - yearMin + 1, "history years not contiguous");
  for (const f of feed) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(f.date), `feed bad date ${f.date}`);
    assert(f.date >= "2017-01-01" && f.date <= "2026-06-30", `feed date out of span ${f.date}`);
  }
  const recomputedCoverage = Math.round((placedRecords / totalRecords) * 1000) / 10;
  assert(recomputedCoverage === summary.coveragePct, "coveragePct mismatch on recompute");
  for (const [name, obj] of Object.entries({ timeline, beatsFile, summary, history, neighborhoods, points, feed }))
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
    writeFileSync(p, name === "summary.json" || name === "history.json" || name === "neighborhoods.json"
      ? JSON.stringify(obj, null, 2)
      : JSON.stringify(obj));
    const kb = Math.round(readFileSync(p).length / 1024);
    console.log(`  wrote normalized/${name} (${kb} KB)`);
    assert(kb < 4096, `${name} exceeds 4MB`);
  }

  writeProvenance({ fetchedAt, summary, history, droppedYears, placeableCount, ptsKept, sampleRate, catTotals });
  appendWiki({ summary, history });

  console.log("\n── Final summary.json");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nVALIDATION PASS");
}

// ---- PROVENANCE.md -----------------------------------------------------------
function writeProvenance({ fetchedAt, summary, history, droppedYears, placeableCount, ptsKept, sampleRate, catTotals }) {
  const md = `# Provenance — Seattle, WA

Every figure rendered from this dataset traces to the public sources below. No values are synthesized.

## Primary source — incident records

| Field | Value |
|-------|-------|
| Dataset | **SPD Crime Data: 2008-Present** (Socrata \`tazs-3rd5\`) |
| Publisher | Seattle Police Department (SPD), via data.seattle.gov |
| Landing page | ${HUB} |
| API | ${SODA} |
| Fetched | ${fetchedAt} |
| License | Public Domain (Socrata licenseId \`PUBLIC_DOMAIN\`), attribution "SPD" |
| Records used | ${summary.totalRecords.toLocaleString("en-US")} (offense_date 2008-01-01 → 2026-06-30) |
| Source caveat | Only finalized (UCR-approved) reports; dataset updated daily; classifications can change |

### Windowing (disclosed exclusions)
- **2,966 dirty pre-2008 rows** (offense_date back to 1900) are excluded — the dataset is titled "2008-Present" and pre-2008 rows are data-entry artifacts.
- Rows after **2026-06-30** (partial month at fetch time) are excluded; the granular window ends at the last full month.
- The \`neighborhood\` (MCPP) field is ≈99% "-" before 2017, so the **granular era starts 2017-01**. The ${summary.unplacedBeats["pre-2017"].toLocaleString("en-US")} rows from 2008–2016 are counted in \`totalRecords\` and disclosed as \`unplacedBeats["pre-2017"]\` — never silently dropped.

### Fields used
\`offense_date\` · \`nibrs_crime_against_category\` · \`nibrs_offense_code_description\` · \`neighborhood\` (MCPP) · \`block_address\` · \`latitude\`/\`longitude\` (TEXT) · \`precinct\`.

### Category mapping (nibrs_crime_against_category → cat)
| Source value | cat | 2008+ window count |
|---|---|--:|
| PERSON | \`persons\` | ${catTotals.persons.toLocaleString("en-US")} |
| PROPERTY | \`property\` | ${catTotals.property.toLocaleString("en-US")} |
| SOCIETY | \`society\` | ${catTotals.society.toLocaleString("en-US")} |
| ANY / NOT_A_CRIME / "-" | \`other\` | ${catTotals.other.toLocaleString("en-US")} |

**ANY** is SPD's mixed-target bucket and **NOT_A_CRIME** is non-criminal activity — both are mapped to \`other\`, labeled "${CATS.other.label}", and never counted as NIBRS Group A persons/property/society crime.

### Coverage
- Placed (one of the 58 MCPP neighborhoods, 2017-01…2026-06): **${summary.placedRecords.toLocaleString("en-US")}** (${summary.coveragePct}%)
- Unplaced: ${summary.unplacedRecords.toLocaleString("en-US")} = ${summary.unplacedBeats["pre-2017"].toLocaleString("en-US")} pre-2017 + ${summary.unplacedBeats["no-neighborhood"].toLocaleString("en-US")} in-span rows whose neighborhood is "-", UNKNOWN, OOJ, or FK ERROR.
- Identity \`placed + unplaced == citywide\` validated per month × category in-script.

## Geometry source — MCPP neighborhood polygons

| Field | Value |
|-------|-------|
| Dataset | **Seattle MCPP (Micro-Community Policing Plans) neighborhoods** — 58 polygons |
| FeatureServer | https://services.arcgis.com/ZOyb2t4B0UYuYNYH/ArcGIS/rest/services/MCPP/FeatureServer/0 |
| Join key | \`neighborhood\` — matches the crime data's MCPP values **verbatim** (no fuzzy matching) |
| Centroids | Area-weighted centroid across all polygon parts (shoelace formula) — for symbol placement only |

## Real incident points (\`points.json\`)

Coordinates in the source are TEXT with sentinels: \`REDACTED\` (224,493), \`-1.0\` (172,365), plus a handful of junk values — **≈25.7% of records have no usable location**. Points shown are **real block-snapped offense locations published by SPD** (block_address grain), never synthesized. Client-side gate: parseable lat 47.4–47.8, lng −122.5–−122.2. Deterministic sample: per year 2017–2026, first 1,300 rows in \`:id\` order with non-redacted coords, bucketed by month, even-stride ≤100/month → **${ptsKept.toLocaleString("en-US")} points ≈ 1 per ${sampleRate} of the ${placeableCount.toLocaleString("en-US")} placeable rows**. Redacted-location records are still counted in every total — they are only missing from the dot layer, and the video says so.

## Historical source — FBI UCR (${history.yearMin}–${history.yearMax} deep-history era)

| Field | Value |
|-------|-------|
| Dataset | FBI Crime Data Explorer (CDE) — summarized agency offense counts |
| Agency | Seattle Police Department — **ORI \`${ORI}\`** |
| Endpoint | ${history.sourceUrl} (and \`/property-crime\`) |
| Span | ${history.yearMin}–${history.yearMax}, annual Violent + Property (12 reported months verified per year)${droppedYears.length ? ` — dropped partial years: ${droppedYears.map((d) => d.year).join(", ")}` : ""} |
| Auth | api.data.gov key (DEMO_KEY rate-limited; set \`FBI_API_KEY\`) |

UCR Summary (Violent/Property) is a **different taxonomy** than SPD NIBRS categories — the eras are presented as distinct and bridge at 2017; they are never equated. No monthly or neighborhood detail is implied for ${history.yearMin}–${history.yearMax}.

## Reproduce

\`\`\`bash
FBI_API_KEY=… node pipeline/sources/seattle-wa.mjs
\`\`\`
`;
  writeFileSync(PROV_PATH, md);
  console.log(`  wrote data/seattle-wa/PROVENANCE.md`);
}

// ---- wiki/Data-Provenance.md append -------------------------------------------
function appendWiki({ summary, history }) {
  if (!existsSync(WIKI_PATH)) return;
  const cur = readFileSync(WIKI_PATH, "utf8");
  if (cur.includes("## Seattle, WA")) {
    console.log("  wiki/Data-Provenance.md already has a Seattle section — skipped");
    return;
  }
  const section = `
## Seattle, WA (\`seattle-wa\`)

- **Primary source:** SPD Crime Data: 2008-Present (Socrata \`tazs-3rd5\`,
  ${HUB}) — Public Domain, attribution "SPD".
  Only finalized (UCR-approved) reports; updated daily.
- **Spatial unit:** the 58 official **MCPP neighborhoods** — the crime data's
  \`neighborhood\` field matches the MCPP polygon layer verbatim (identity join,
  no approximation). Polygons: ArcGIS \`MCPP/FeatureServer/0\`.
- **Deep-history source (${history.yearMin}–${history.yearMax}):** FBI Crime Data Explorer (CDE) —
  Seattle PD, **ORI ${ORI}** — real annual Violent + Property counts,
  ${history.years.length} full years (12 reported months each, verified). UCR taxonomy kept
  distinct from NIBRS; eras bridge at 2017.
- **Span:** ${history.yearMin}–${history.yearMax} (FBI UCR annual) + 2017-01-01 → 2026-06-30 (SPD NIBRS
  with MCPP detail, ${summary.months} months). SPD rows 2008–2016 predate the MCPP
  field (≈99% "-") and are disclosed as "pre-2017" unplaced, never hidden.
- **Records:** ${summary.totalRecords.toLocaleString("en-US")} total (2008-01 → 2026-06) ·
  ${summary.placedRecords.toLocaleString("en-US")} placed in an MCPP neighborhood
  (**${summary.coveragePct}% coverage**) · ${summary.unplacedRecords.toLocaleString("en-US")} unplaced
  (${summary.unplacedBeats["pre-2017"].toLocaleString("en-US")} pre-2017 + ${summary.unplacedBeats["no-neighborhood"].toLocaleString("en-US")} blank/unknown neighborhood), kept in totals and disclosed.
- **Real dots:** SPD publishes block-snapped coordinates, but ≈25.7% are
  REDACTED/sentinel values — dots are a deterministic ≤100/month sample of
  **real** locations; redacted records are counted but not plotted, and the
  video says so.
- **License:** Public Domain (\`PUBLIC_DOMAIN\`), attribution "SPD"; MCPP
  polygons public domain (City of Seattle).
- **Detail:** [\`data/seattle-wa/PROVENANCE.md\`](../data/seattle-wa/PROVENANCE.md)

### Category mapping (nibrs_crime_against_category → cat)

| Source value | cat |
|--------------|-----|
| PERSON | \`persons\` |
| PROPERTY | \`property\` |
| SOCIETY | \`society\` |
| ANY / NOT_A_CRIME / "-" | \`other\` (mixed / non-criminal, context only — never counted as Group A) |
`;
  // insert before "## Ranked source types" if present, else append
  const marker = "## Ranked source types";
  const idx = cur.indexOf(marker);
  const next = idx >= 0 ? cur.slice(0, idx) + section.trimStart() + "\n" + cur.slice(idx) : cur + section;
  writeFileSync(WIKI_PATH, next);
  console.log("  appended Seattle section to wiki/Data-Provenance.md");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
