// Chicago, IL crime-data source — fetch → normalize → validate, one script.
//
// Data sources (all real, citable):
//   * Incidents:  Socrata "Crimes - 2001 to Present" (CPD CLEAR system)
//                 https://data.cityofchicago.org/resource/ijzp-q8t2.json
//   * Areas:      Chicago community area polygons (77 official areas)
//                 https://data.cityofchicago.org/resource/igwz-8jzy.geojson
//   * History:    FBI Crime Data Explorer (CDE), Chicago PD ORI ILCPD0000
//                 (UCR summarized violent/property, annual 1986–2002)
//
// HONESTY RULES (binding):
//   * No fabricated numbers or dot positions. Timeline cells are exact Socrata
//     aggregation counts. Points are REAL block-level anonymized incident
//     locations (a deterministic sample, disclosed as such).
//   * community_area is unreliable pre-2003 → granular era = 2003-01..2026-06
//     (last FULL month). Everything outside the window is counted and
//     disclosed as unplaced, never hidden.
//   * FBI 1985 has Jan–Feb reported as 0 (missing, not real) → history era
//     starts at 1986; every kept year must have 12 nonzero months.
//
// Usage:  node pipeline/sources/chicago-il.mjs
//         (env FBI_API_KEY optional; DEMO_KEY fallback with 60s retry on 429)
//
// Outputs: data/chicago-il/normalized/{beats,timeline,feed,summary,history,
//          neighborhoods,points}.json  + raw dumps in data/chicago-il/raw/
//          (raw/ is gitignored except _fetch_meta.json).

import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const RAW_DIR = resolve(repoRoot, "data/chicago-il/raw");
const NORM_DIR = resolve(repoRoot, "data/chicago-il/normalized");
mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(NORM_DIR, { recursive: true });

// ---------------------------------------------------------------- constants
const SODA = "https://data.cityofchicago.org/resource/ijzp-q8t2.json";
const GEO_URL = "https://data.cityofchicago.org/resource/igwz-8jzy.geojson?$limit=100";
const HUB = "https://data.cityofchicago.org/Public-Safety/Crimes-2001-to-Present/ijzp-q8t2";
const ORI = "ILCPD0000";
const FBI_KEY = process.env.FBI_API_KEY || "DEMO_KEY";

// Granular era: 2003-01 .. 2026-06 (last full month; 2026-07 is partial).
const WIN_START = "2003-01-01T00:00:00";
const WIN_END = "2026-07-01T00:00:00"; // exclusive
const DATE_MIN = "2003-01-01";
const DATE_MAX = "2026-06-30";
const BBOX = { latMin: 41.6, latMax: 42.05, lngMin: -87.95, lngMax: -87.5 };

const CATS = {
  persons: { label: "Crimes Against Persons", color: "#ff2e63" },
  property: { label: "Crimes Against Property", color: "#ffc233" },
  society: { label: "Crimes Against Society", color: "#34e0e0" },
  other: { label: "Other / non-criminal", color: "#7486a0" },
};
const CAT_IDX = { persons: 0, property: 1, society: 2, other: 3 };

// primary_type → cat (NIBRS crimes-against convention). Full table is
// documented in data/chicago-il/PROVENANCE.md.
const CAT_TYPES = {
  persons: [
    "BATTERY", "ASSAULT", "HOMICIDE", "CRIM SEXUAL ASSAULT",
    "CRIMINAL SEXUAL ASSAULT", // same offense as above, two spellings — merged
    "SEX OFFENSE", "KIDNAPPING", "INTIMIDATION", "STALKING",
    "OFFENSE INVOLVING CHILDREN", "HUMAN TRAFFICKING", "DOMESTIC VIOLENCE",
  ],
  property: [
    "THEFT", "BURGLARY", "MOTOR VEHICLE THEFT", "ROBBERY", "ARSON",
    "CRIMINAL DAMAGE", "CRIMINAL TRESPASS", "DECEPTIVE PRACTICE",
  ],
  society: [
    "NARCOTICS", "OTHER NARCOTIC VIOLATION", "PROSTITUTION", "GAMBLING",
    "WEAPONS VIOLATION", "LIQUOR LAW VIOLATION", "PUBLIC PEACE VIOLATION",
    "INTERFERENCE WITH PUBLIC OFFICER", "PUBLIC INDECENCY", "OBSCENITY",
    "CONCEALED CARRY LICENSE VIOLATION",
  ],
};
const KNOWN_MAPPED = new Set([...CAT_TYPES.persons, ...CAT_TYPES.property, ...CAT_TYPES.society]);
// Types we EXPECT in the `other` bucket (anything else unrecognized gets logged).
const KNOWN_OTHER = new Set([
  "OTHER OFFENSE", "NON-CRIMINAL", "NON - CRIMINAL",
  "NON-CRIMINAL (SUBJECT SPECIFIED)", "RITUALISM",
]);
function mapCat(t) {
  if (CAT_TYPES.persons.includes(t)) return "persons";
  if (CAT_TYPES.property.includes(t)) return "property";
  if (CAT_TYPES.society.includes(t)) return "society";
  return "other";
}

// months 2003-01 .. 2026-06
const MONTHS = [];
for (let y = 2003; y <= 2026; y++)
  for (let m = 1; m <= 12; m++) {
    if (y === 2026 && m > 6) break;
    MONTHS.push(`${y}-${String(m).padStart(2, "0")}`);
  }
const MONTH_IDX = Object.fromEntries(MONTHS.map((m, i) => [m, i]));

// ------------------------------------------------------------------ helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON(url, { tries = 5, label = "" } = {}) {
  let lastErr;
  for (let a = 0; a < tries; a++) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (r.status === 200) return await r.json();
      const body = (await r.text()).slice(0, 300);
      if (r.status === 400 || r.status === 404)
        throw Object.assign(new Error(`HTTP ${r.status} ${label}: ${body}`), { fatal: true });
      lastErr = new Error(`HTTP ${r.status} ${label}: ${body}`);
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = e;
    }
    const wait = 1500 * (a + 1);
    console.warn(`  retry ${a + 1}/${tries - 1} in ${wait}ms (${label}): ${lastErr.message.slice(0, 120)}`);
    await sleep(wait);
  }
  throw lastErr;
}

function soda(params) {
  const q = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${SODA}?${q}`;
}
const sq = (s) => `'${s.replace(/'/g, "''")}'`;
function catWhere(cat) {
  if (cat === "other") {
    const all = [...KNOWN_MAPPED].map(sq).join(",");
    return `(primary_type not in(${all}) OR primary_type IS NULL)`;
  }
  return `primary_type in(${CAT_TYPES[cat].map(sq).join(",")})`;
}
const windowWhere = `date >= '${WIN_START}' AND date < '${WIN_END}'`;

function titleCase(name) {
  const special = { OHARE: "O'Hare", "MCKINLEY PARK": "McKinley Park" };
  if (special[name]) return special[name];
  return name.toLowerCase().replace(/(^|[\s\-(])[a-z]/g, (c) => c.toUpperCase());
}
const r6 = (x) => Math.round(x * 1e6) / 1e6;

function assert(cond, msg) {
  if (!cond) {
    console.error(`VALIDATION FAIL: ${msg}`);
    process.exit(1);
  }
}
function assertNoNaN(obj, path) {
  const stack = [[obj, path]];
  while (stack.length) {
    const [o, p] = stack.pop();
    if (typeof o === "number") assert(Number.isFinite(o), `non-finite number at ${p}`);
    else if (Array.isArray(o)) o.forEach((v, i) => stack.push([v, `${p}[${i}]`]));
    else if (o && typeof o === "object")
      for (const [k, v] of Object.entries(o)) stack.push([v, `${p}.${k}`]);
  }
}

// ------------------------------------------------------- 1. area polygons
async function fetchAreas() {
  console.log("1/7 community area polygons…");
  const gj = await fetchJSON(GEO_URL, { label: "geojson" });
  writeFileSync(resolve(RAW_DIR, "community_areas.geojson"), JSON.stringify(gj));
  assert(gj.features?.length === 77, `expected 77 areas, got ${gj.features?.length}`);
  const areas = {}; // areaNum -> { name, polygon, centroid }
  for (const f of gj.features) {
    const p = f.properties;
    const num = Number(p.area_numbe ?? p.area_num_1);
    const name = String(p.community).toUpperCase().trim();
    assert(Number.isInteger(num) && num >= 1 && num <= 77, `bad area number ${p.area_numbe}`);
    const g = f.geometry;
    const parts = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
    // flatten: all OUTER rings of all parts -> number[][][]
    const polygon = parts.map((part) => part[0].map(([lng, lat]) => [r6(lng), r6(lat)]));
    // area-weighted centroid across all parts (planar shoelace; fine at city scale)
    let AW = 0, cx = 0, cy = 0;
    for (const ring of parts.map((part) => part[0])) {
      let A = 0, sx = 0, sy = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
        const cross = x1 * y2 - x2 * y1;
        A += cross; sx += (x1 + x2) * cross; sy += (y1 + y2) * cross;
      }
      A /= 2;
      if (Math.abs(A) < 1e-12) continue;
      const w = Math.abs(A);
      cx += (sx / (6 * A)) * w; cy += (sy / (6 * A)) * w; AW += w;
    }
    assert(AW > 0, `degenerate polygon for ${name}`);
    areas[num] = { name, polygon, centroid: [r6(cx / AW), r6(cy / AW)] };
  }
  assert(Object.keys(areas).length === 77, "duplicate area numbers in geojson");
  return areas;
}

// ----------------------------------- 2. full-dataset totals by primary_type
async function fetchTotals() {
  console.log("2/7 full-dataset counts by primary_type (2001+)…");
  const rows = await fetchJSON(
    soda({ $select: "primary_type,count(*) AS n", $group: "primary_type", $order: "n DESC", $limit: 1000 }),
    { label: "by_primary_type" },
  );
  writeFileSync(resolve(RAW_DIR, "by_primary_type.json"), JSON.stringify(rows, null, 2));
  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  const unrecognized = [];
  for (const r of rows) {
    const t = r.primary_type ?? "(null)";
    const cat = mapCat(t);
    catTotals[cat] += Number(r.n);
    if (cat === "other" && !KNOWN_OTHER.has(t)) unrecognized.push(`${t} (${r.n})`);
  }
  if (unrecognized.length)
    console.log(`  unrecognized primary_type → other: ${unrecognized.join("; ")}`);
  const total = Object.values(catTotals).reduce((a, b) => a + b, 0);
  await sleep(150);
  const [cnt] = await fetchJSON(soda({ $select: "count(*) AS n" }), { label: "total_count" });
  assert(Number(cnt.n) === total, `count(*)=${cnt.n} != sum-by-type=${total}`);
  await sleep(150);
  const [pre] = await fetchJSON(
    soda({ $select: "count(*) AS n", $where: `date < '${WIN_START}'` }),
    { label: "pre2003_count" },
  );
  await sleep(150);
  const [post] = await fetchJSON(
    soda({ $select: "count(*) AS n", $where: `date >= '${WIN_END}'` }),
    { label: "post_window_count" },
  );
  console.log(`  total=${total}  pre-2003=${pre.n}  partial-2026-07=${post.n}`);
  return { catTotals, total, pre2003: Number(pre.n), postWindow: Number(post.n), unrecognized };
}

// ------------------------------- 3. per-cat monthly-by-area timeline cells
async function fetchTimeline(areas) {
  console.log("3/7 timeline: per-cat monthly counts by community area…");
  const cells = {};
  for (const a of Object.values(areas))
    cells[a.name] = MONTHS.map(() => ({ persons: 0, property: 0, society: 0, other: 0 }));
  const placedByCatMonth = {}; // cat -> number[282]
  const noAreaByCatMonth = {};
  let noAreaTotal = 0;
  const badAreaValues = new Set();
  for (const cat of Object.keys(CATS)) {
    placedByCatMonth[cat] = MONTHS.map(() => 0);
    noAreaByCatMonth[cat] = MONTHS.map(() => 0);
    let offset = 0, pages = 0;
    for (;;) {
      const rows = await fetchJSON(
        soda({
          $select: "community_area,date_trunc_ym(date) AS ym,count(*) AS n",
          $where: `${catWhere(cat)} AND ${windowWhere}`,
          $group: "community_area,ym",
          $order: "ym,community_area",
          $limit: 50000,
          $offset: offset,
        }),
        { label: `agg:${cat}@${offset}` },
      );
      pages++;
      for (const r of rows) {
        const ym = String(r.ym).slice(0, 7);
        const mi = MONTH_IDX[ym];
        assert(mi !== undefined, `agg ${cat}: month ${ym} outside window`);
        const n = Number(r.n);
        const num = Number(r.community_area);
        if (r.community_area != null && Number.isInteger(num) && num >= 1 && num <= 77) {
          cells[areas[num].name][mi][cat] += n;
          placedByCatMonth[cat][mi] += n;
        } else {
          noAreaByCatMonth[cat][mi] += n;
          noAreaTotal += n;
          if (r.community_area != null) badAreaValues.add(String(r.community_area));
        }
      }
      if (rows.length < 50000) break;
      offset += 50000;
      await sleep(150);
    }
    console.log(`  ${cat}: ${pages} page(s)`);
    await sleep(150);
  }
  if (badAreaValues.size)
    console.log(`  non-1..77 community_area values treated as unplaced: ${[...badAreaValues].join(", ")}`);
  return { cells, placedByCatMonth, noAreaByCatMonth, noAreaTotal };
}

// --------------------------------------- 4. citywide per-cat monthly checks
async function fetchCitywide() {
  console.log("4/7 citywide per-cat monthly (cross-check)…");
  const cw = {};
  for (const cat of Object.keys(CATS)) {
    const rows = await fetchJSON(
      soda({
        $select: "date_trunc_ym(date) AS ym,count(*) AS n",
        $where: `${catWhere(cat)} AND ${windowWhere}`,
        $group: "ym", $order: "ym", $limit: 1000,
      }),
      { label: `citywide:${cat}` },
    );
    cw[cat] = MONTHS.map(() => 0);
    for (const r of rows) {
      const mi = MONTH_IDX[String(r.ym).slice(0, 7)];
      assert(mi !== undefined, `citywide ${cat}: month outside window`);
      cw[cat][mi] = Number(r.n);
    }
    await sleep(150);
  }
  return cw;
}

// ----------------------------------------------- 5. sampled REAL points
// DEVIATION from the per-year `$order=:id` spec, for representativeness:
// live tests showed :id order is heavily type-clustered (2003-05 first 100 =
// 58 HOMICIDE; 2025 returns all 1300 rows in January), which would paint a
// dishonest "murder map". Instead: one query PER MONTH ordered by
// case_number (deterministic, type-representative — matches the true
// citywide mix), fetch up to 1300 real rows, then a deterministic stride
// sample down to ≤100/month. Every kept dot is still a REAL block-level
// anonymized location straight from the source.
async function fetchPoints() {
  console.log("5/7 real sampled points (block-anonymized, ≤100/month, 282 monthly queries)…");
  const pts = MONTHS.map(() => []);
  let outOfBbox = 0;
  for (let mi = 0; mi < MONTHS.length; mi++) {
    const [y, m] = MONTHS[mi].split("-").map(Number);
    const start = `${MONTHS[mi]}-01T00:00:00`;
    const end = m === 12 ? `${y + 1}-01-01T00:00:00` : `${y}-${String(m + 1).padStart(2, "0")}-01T00:00:00`;
    const rows = await fetchJSON(
      soda({
        $select: "date,latitude,longitude,primary_type",
        $where: `latitude IS NOT NULL AND longitude IS NOT NULL AND date >= '${start}' AND date < '${end}'`,
        $order: "case_number",
        $limit: 1300,
      }),
      { label: `points:${MONTHS[mi]}` },
    );
    const inBbox = [];
    for (const r of rows) {
      const lat = Number(r.latitude), lng = Number(r.longitude);
      if (!(lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax)) {
        outOfBbox++; continue; // real but geocoded outside city bbox — excluded, counted
      }
      inBbox.push([r6(lng), r6(lat), CAT_IDX[mapCat(r.primary_type)]]);
    }
    const stride = Math.max(1, Math.floor(inBbox.length / 100));
    for (let i = 0; i < inBbox.length && pts[mi].length < 100; i += stride) pts[mi].push(inBbox[i]);
    if ((mi + 1) % 24 === 0) console.log(`  …through ${MONTHS[mi]}`);
    await sleep(150);
  }
  const shown = pts.reduce((a, m) => a + m.length, 0);
  console.log(`  ${shown} points kept (${outOfBbox} out-of-bbox rows excluded)`);
  return { pts, shown, outOfBbox };
}

// -------------------------------------------------------------- 6. feed
async function fetchFeed(areas) {
  console.log("6/7 dispatch feed (4 real incidents per quarter)…");
  const feed = [];
  let skipped = 0;
  for (let y = 2003; y <= 2026; y++) {
    for (let q = 0; q < 4; q++) {
      if (y === 2026 && q > 1) break; // window ends 2026-06
      const sm = q * 3 + 1;
      const start = `${y}-${String(sm).padStart(2, "0")}-01T00:00:00`;
      const end = q === 3 ? `${y + 1}-01-01T00:00:00` : `${y}-${String(sm + 3).padStart(2, "0")}-01T00:00:00`;
      const rows = await fetchJSON(
        soda({
          $select: "date,primary_type,description,block,community_area",
          $where: `community_area IS NOT NULL AND date >= '${start}' AND date < '${end}'`,
          $order: ":id",
          $limit: 4,
        }),
        { label: `feed:${y}Q${q + 1}` },
      );
      for (const r of rows) {
        const num = Number(r.community_area);
        if (!(Number.isInteger(num) && num >= 1 && num <= 77)) { skipped++; continue; }
        feed.push({
          date: String(r.date).slice(0, 10),
          title: `${r.primary_type} — ${r.description}`,
          place: r.block,
          beat: areas[num].name,
          cat: mapCat(r.primary_type),
        });
      }
      await sleep(150);
    }
  }
  feed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (skipped) console.log(`  ${skipped} feed rows skipped (community_area outside 1..77)`);
  console.log(`  ${feed.length} feed items`);
  return feed;
}

// ------------------------------------------------------------ 7. FBI CDE
async function fetchFBI(offense) {
  const url = `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/${offense}?from=01-1985&to=12-2002&API_KEY=${FBI_KEY}`;
  for (let a = 0; a <= 2; a++) {
    const r = await fetch(url);
    if (r.status === 429) {
      if (a === 2) break;
      console.warn(`  FBI 429 (${offense}); waiting 60s (retry ${a + 1}/2)…`);
      await sleep(60000);
      continue;
    }
    if (r.status !== 200) throw new Error(`FBI ${offense}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const actuals = j?.offenses?.actuals;
    if (!actuals) throw new Error(`FBI ${offense}: no offenses.actuals in response`);
    const agKey =
      Object.keys(actuals).find((k) => /Chicago/i.test(k)) ||
      Object.keys(actuals).find((k) => !/United States/i.test(k));
    if (!agKey) throw new Error(`FBI ${offense}: no agency series found`);
    return { raw: j, monthly: actuals[agKey] || {} }; // { "MM-YYYY": n }
  }
  throw new Error(`FBI ${offense}: still rate-limited after 2 retries (set FBI_API_KEY).`);
}

async function fetchHistory() {
  console.log(`7/7 FBI CDE history (${ORI}, 1985–2002 monthly → annual)…`);
  const violent = await fetchFBI("violent-crime");
  await sleep(1000);
  const property = await fetchFBI("property-crime");
  writeFileSync(
    resolve(RAW_DIR, "fbi_cde.json"),
    JSON.stringify({ ori: ORI, fetchedAt: new Date().toISOString(), violent: violent.raw, property: property.raw }),
  );
  const perYear = (monthly, y) => {
    const vals = [];
    for (let m = 1; m <= 12; m++) {
      const k = `${String(m).padStart(2, "0")}-${y}`;
      vals.push(monthly[k] === undefined ? undefined : Number(monthly[k]));
    }
    return vals;
  };
  const years = [];
  const dropped = [];
  for (let y = 1985; y <= 2002; y++) {
    const v = perYear(violent.monthly, y);
    const p = perYear(property.monthly, y);
    const complete =
      v.every((x) => x !== undefined && x > 0) && p.every((x) => x !== undefined && x > 0);
    if (!complete) {
      const badV = v.map((x, i) => (x === undefined || x <= 0 ? i + 1 : null)).filter(Boolean);
      const badP = p.map((x, i) => (x === undefined || x <= 0 ? i + 1 : null)).filter(Boolean);
      dropped.push(`${y} (violent months missing/zero: [${badV}], property: [${badP}])`);
      assert(y === 1985, `FBI year ${y} incomplete inside 1986–2002 — cannot build contiguous history`);
      continue;
    }
    const vy = v.reduce((a, b) => a + b, 0);
    const py = p.reduce((a, b) => a + b, 0);
    years.push({ year: y, violent: vy, property: py, total: vy + py });
  }
  if (dropped.length) console.log(`  dropped partial years: ${dropped.join("; ")}`);
  return { years, dropped };
}

// -------------------------------------------------------------------- main
async function main() {
  const t0 = Date.now();
  const fetchedAt = new Date().toISOString();

  const areas = await fetchAreas();
  const totals = await fetchTotals();
  const tl = await fetchTimeline(areas);
  const cw = await fetchCitywide();
  const pointsRes = await fetchPoints();
  const feed = await fetchFeed(areas);
  const history = await fetchHistory();

  // ----------------------------------------------------------- validation
  console.log("validating…");
  assert(MONTHS.length === 282 && MONTHS[0] === "2003-01" && MONTHS[281] === "2026-06",
    `months array wrong (${MONTHS.length}, ${MONTHS[0]}..${MONTHS.at(-1)})`);
  for (let i = 1; i < MONTHS.length; i++) {
    const [py, pm] = MONTHS[i - 1].split("-").map(Number);
    const [cy, cm2] = MONTHS[i].split("-").map(Number);
    assert((pm === 12 && cy === py + 1 && cm2 === 1) || (cy === py && cm2 === pm + 1),
      `months not contiguous at ${MONTHS[i]}`);
  }
  const names = Object.values(areas).map((a) => a.name);
  assert(new Set(names).size === 77, "duplicate community names");
  for (const [name, series] of Object.entries(tl.cells)) {
    assert(series.length === MONTHS.length, `cells[${name}] length ${series.length} != ${MONTHS.length}`);
    assert(names.includes(name), `cells key ${name} not in beats`);
  }
  assert(Object.keys(tl.cells).length === 77, "cells must cover all 77 areas");
  // placed + unplaced == citywide, per cat per month, 0 tolerance
  let placedRecords = 0, windowCitywide = 0;
  for (const cat of Object.keys(CATS)) {
    for (let mi = 0; mi < MONTHS.length; mi++) {
      const placed = tl.placedByCatMonth[cat][mi];
      const unplaced = tl.noAreaByCatMonth[cat][mi];
      assert(placed + unplaced === cw[cat][mi],
        `${cat} ${MONTHS[mi]}: placed ${placed} + unplaced ${unplaced} != citywide ${cw[cat][mi]}`);
      placedRecords += placed;
      windowCitywide += cw[cat][mi];
    }
  }
  // cross-check cells sum == placedRecords
  let cellsSum = 0;
  for (const series of Object.values(tl.cells))
    for (const c of series) cellsSum += c.persons + c.property + c.society + c.other;
  assert(cellsSum === placedRecords, `cells sum ${cellsSum} != placed ${placedRecords}`);
  const noArea = windowCitywide - placedRecords;
  assert(noArea === tl.noAreaTotal, `no-area mismatch ${noArea} != ${tl.noAreaTotal}`);
  // full-dataset identity: pre2003 + window + post == total
  assert(totals.pre2003 + windowCitywide + totals.postWindow === totals.total,
    `partition mismatch: ${totals.pre2003}+${windowCitywide}+${totals.postWindow} != ${totals.total}`);
  const unplacedRecords = totals.total - placedRecords;
  const coveragePct = Math.round((placedRecords / totals.total) * 1000) / 10;
  assert(Math.abs(coveragePct - (placedRecords / totals.total) * 100) < 0.05, "coveragePct rounding sanity");
  // points
  assert(pointsRes.pts.length === MONTHS.length, "points months misaligned");
  for (let mi = 0; mi < pointsRes.pts.length; mi++)
    for (const [lng, lat, ci] of pointsRes.pts[mi]) {
      assert(lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax,
        `point out of bbox in ${MONTHS[mi]}: ${lng},${lat}`);
      assert(Number.isInteger(ci) && ci >= 0 && ci <= 3, `bad catIdx ${ci}`);
    }
  // feed
  for (const it of feed) {
    assert(names.includes(it.beat), `feed beat ${it.beat} unknown`);
    assert(it.date >= DATE_MIN && it.date <= DATE_MAX, `feed date ${it.date} outside window`);
    assert(CATS[it.cat], `feed cat ${it.cat} invalid`);
  }
  // history: contiguous 1986..2002
  assert(history.years.length === 17, `history years ${history.years.length} != 17`);
  history.years.forEach((y, i) => assert(y.year === 1986 + i, `history not contiguous at ${y.year}`));

  // ------------------------------------------------------------- outputs
  const beats = { cats: CATS, beats: {} };
  for (const [numStr, a] of Object.entries(areas)) {
    beats.beats[a.name] = {
      key: a.name, name: titleCase(a.name), servcen: "CHICAGO", beat: Number(numStr),
      centroid: a.centroid, polygon: a.polygon, geomType: "MultiPolygon",
    };
  }
  const timeline = { months: MONTHS, cells: tl.cells };
  const sampleRate = Math.round((windowCitywide / pointsRes.shown) * 10) / 10;
  const points = {
    mode: "real-sample",
    note: "Every dot is a real reported incident location, anonymized to the block by the City of Chicago. A deterministic sample (≤100/month) is shown.",
    sampleRate,
    months: MONTHS,
    pts: pointsRes.pts,
  };
  const summary = {
    slug: "chicago-il",
    title: "Chicago · IL",
    source: { records: SODA, beats: GEO_URL.split("?")[0], hub: HUB },
    fetchedAt,
    dateMin: DATE_MIN,
    dateMax: DATE_MAX,
    months: MONTHS.length,
    totalRecords: totals.total,
    placedRecords,
    unplacedRecords,
    coveragePct,
    unplacedBeats: { "pre-2003": totals.pre2003, "no-area": noArea, "partial-2026-07": totals.postWindow },
    catTotals: totals.catTotals,
    cats: CATS,
    beatCount: 77,
  };
  const historyJson = {
    era: "history",
    taxonomy: "FBI UCR Summary (Violent + Property) — distinct from the NIBRS-style categories used from 2003",
    agency: "Chicago Police Department",
    ori: ORI,
    source: "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt,
    presentation: "annual",
    note:
      "Annual totals are real UCR counts fetched from the FBI CDE summarized agency endpoint for ORI ILCPD0000, " +
      "summed from monthly actuals (every kept year verified to have 12 nonzero months). 1985 reports Jan–Feb as 0 " +
      "(missing, not real), so the history era starts at 1986. UCR Summary (violent/property) is a different " +
      "taxonomy from the incident-level categories used for 2003+; the two eras bridge at 2003 and are never " +
      "mixed on one axis. Reproduce with pipeline/sources/chicago-il.mjs (set FBI_API_KEY to avoid DEMO_KEY limits)." +
      (history.dropped.length ? ` Dropped partial years: ${history.dropped.join("; ")}.` : ""),
    yearMin: 1986,
    yearMax: 2002,
    cats: {
      violent: { label: "UCR Violent (murder, rape, robbery, agg. assault)", color: "#ff2e63" },
      property: { label: "UCR Property (burglary, larceny, MV theft)", color: "#ffc233" },
    },
    years: history.years,
  };
  const neighborhoods = {
    source: "Chicago community areas (official)",
    sourceUrl: GEO_URL.split("?")[0],
    hub: "",
    fetchedAt,
    license: "See Chicago data terms",
    method: "identity — community areas are the resident-known names",
    map: Object.fromEntries(names.map((n) => [n, { name: titleCase(n), approx: false }])),
  };

  const outputs = { "beats.json": beats, "timeline.json": timeline, "feed.json": feed,
    "summary.json": summary, "history.json": historyJson, "neighborhoods.json": neighborhoods,
    "points.json": points };
  for (const [f, obj] of Object.entries(outputs)) {
    assertNoNaN(obj, f);
    writeFileSync(resolve(NORM_DIR, f), JSON.stringify(obj));
  }
  writeFileSync(
    resolve(RAW_DIR, "_fetch_meta.json"),
    JSON.stringify({
      fetchedAt, script: "pipeline/sources/chicago-il.mjs",
      sources: { records: SODA, areas: GEO_URL, fbi: `api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}` },
      totalRecords: totals.total, window: `${DATE_MIN}..${DATE_MAX}`,
      unrecognizedTypes: totals.unrecognized,
    }, null, 2),
  );

  const size = (f) => `${(statSync(resolve(NORM_DIR, f)).size / 1024).toFixed(1)} KB`;
  const yearTotal = (name, y) => {
    const s = tl.cells[name];
    let t = 0;
    for (let mi = 0; mi < MONTHS.length; mi++)
      if (MONTHS[mi].startsWith(`${y}-`)) t += s[mi].persons + s[mi].property + s[mi].society + s[mi].other;
    return t;
  };
  const falls = names
    .map((n) => {
      const a = yearTotal(n, 2003), b = yearTotal(n, 2025);
      return { name: n, y2003: a, y2025: b, pct: a > 0 ? Math.round(((b - a) / a) * 1000) / 10 : null };
    })
    .sort((x, y) => (x.pct ?? 0) - (y.pct ?? 0));
  const by2025 = [...falls].sort((x, y) => y.y2025 - x.y2025);
  const cw2025 = { persons: 0, property: 0, society: 0, other: 0 };
  for (const cat of Object.keys(CATS))
    for (let mi = 0; mi < MONTHS.length; mi++)
      if (MONTHS[mi].startsWith("2025-")) cw2025[cat] += cw[cat][mi];
  const peak = history.years.reduce((a, b) => (b.violent > a.violent ? b : a));

  console.log(JSON.stringify({
    totalRecords: totals.total, placedRecords, unplacedRecords, coveragePct,
    unplacedBeats: summary.unplacedBeats, catTotals: totals.catTotals,
    months: MONTHS.length, feedItems: feed.length, pointsShown: pointsRes.shown,
    sampleRate, historyYears: `${historyJson.yearMin}-${historyJson.yearMax}`,
    fbiViolentPeak: { year: peak.year, violent: peak.violent },
    citywide2025: cw2025,
    biggestFalls2003to2025: falls.slice(0, 5),
    smallestFalls2003to2025: falls.slice(-3),
    top2025: by2025.slice(0, 3), bottom2025: by2025.slice(-3),
    sizes: Object.fromEntries(Object.keys(outputs).map((f) => [f, size(f)])),
    elapsedSec: Math.round((Date.now() - t0) / 1000),
  }, null, 2));
  console.log("VALIDATION PASS");
}

main().catch((e) => {
  console.error("✗", e.stack || e.message);
  process.exit(1);
});
