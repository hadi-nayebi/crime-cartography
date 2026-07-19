#!/usr/bin/env node
/**
 * Generic bundle-contract validator: honesty + integrity invariants for any
 * city's normalized bundle. City-agnostic — the bbox is derived from the
 * city's own beats.json geometry, category keys come from its summary.json.
 * Exits non-zero on any failure so the pipeline can gate a render.
 *
 *   node pipeline/validate.mjs <slug> [dataRoot]
 *
 * dataRoot defaults to <repo>/data — pass another checkout's data/ to
 * validate a bundle built elsewhere.
 *
 * Bundle contract (data/<slug>/normalized/):
 *   beats.json timeline.json feed.json summary.json history.json
 *   neighborhoods.json [points.json — required only when the source
 *   publishes real coordinates; aggregate-only cities honestly omit it]
 * trend.json / basemap.json are add-ons built by their own scripts and are
 * not gated here.
 */
import { readFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2];
if (!slug) { console.error("usage: node pipeline/validate.mjs <slug> [dataRoot]"); process.exit(1); }
const DATA = process.argv[3] || join(ROOT, "data");
const N = join(DATA, slug, "normalized");

const fails = [];
const warns = [];
const check = (cond, msg) => { if (!cond) fails.push(msg); };
const warn = (cond, msg) => { if (!cond) warns.push(msg); };
const exists = (p) => access(p).then(() => true, () => false);

const load = async (f) => {
  try { return JSON.parse(await readFile(join(N, f))); }
  catch (e) { fails.push(`${f}: ${e.message}`); return null; }
};

// ── 1. required files parse; points.json only if the source has coordinates
const [beats, timeline, feed, summary, history, neighborhoods] = await Promise.all(
  ["beats.json", "timeline.json", "feed.json", "summary.json", "history.json", "neighborhoods.json"].map(load));
const hasPoints = await exists(join(N, "points.json"));
const points = hasPoints ? await load("points.json") : null;
if (fails.length || !summary) { bail(); }

// ── 2. summary shape + provenance links + PROVENANCE.md
check(summary.slug === slug, `summary.slug '${summary.slug}' != '${slug}'`);
check(typeof summary.title === "string" && summary.title, "summary.title missing");
check(summary.source && summary.source.records && summary.source.beats && summary.source.hub,
  "summary.source must carry records + beats + hub links");
check(typeof summary.fetchedAt === "string" && summary.fetchedAt, "summary.fetchedAt missing");
const isDate = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
check(isDate(summary.dateMin) && isDate(summary.dateMax) && summary.dateMin <= summary.dateMax,
  `bad summary date span ${summary.dateMin}..${summary.dateMax}`);
for (const k of ["months", "totalRecords", "placedRecords", "unplacedRecords", "coveragePct", "beatCount"])
  check(Number.isFinite(summary[k]), `summary.${k} not a finite number`);
const catKeys = Object.keys(summary.cats || {});
check(catKeys.length > 0, "summary.cats missing");
for (const [k, c] of Object.entries(summary.cats || {}))
  check(c && c.label && c.color, `summary.cats.${k} needs label + color`);
check(await exists(join(DATA, slug, "PROVENANCE.md")), "data/<slug>/PROVENANCE.md missing");

// ── 3. totals reconcile
const catSum = Object.values(summary.catTotals || {}).reduce((a, b) => a + b, 0);
check(catSum === summary.totalRecords, `catTotals sum ${catSum} != totalRecords ${summary.totalRecords}`);
check(summary.placedRecords + summary.unplacedRecords === summary.totalRecords, "placed+unplaced != total");
if (summary.unplacedRecords > 0 || summary.unplacedBeats) {
  const ubSum = Object.values(summary.unplacedBeats || {}).reduce((a, b) => a + b, 0);
  check(ubSum === summary.unplacedRecords,
    `unplacedBeats sum ${ubSum} != unplacedRecords ${summary.unplacedRecords}`);
}
const covRecomp = Math.round((summary.placedRecords / summary.totalRecords) * 1000) / 10;
check(Math.abs(covRecomp - summary.coveragePct) <= 0.06,
  `coveragePct ${summary.coveragePct} != recomputed ${covRecomp}`);

// ── 4. beats: real geometry, finite coords, centroid inside its own polygon bbox;
//      the CITY bbox is derived from this geometry (no hardcoded city)
const beatKeys = Object.keys(beats.beats || {});
check(beatKeys.length === summary.beatCount, `beats ${beatKeys.length} != summary.beatCount ${summary.beatCount}`);
check(JSON.stringify(Object.keys(beats.cats || {})) === JSON.stringify(catKeys),
  "beats.cats keys/order != summary.cats (points cat index depends on this order)");
const bbox = { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity };
const eachCoordPair = (coords, fn) => {
  if (!Array.isArray(coords)) return fn(null);
  if (typeof coords[0] === "number") return fn(coords);   // [lng,lat] leaf (Polygon or MultiPolygon depth)
  for (const c of coords) eachCoordPair(c, fn);
};
for (const [bk, b] of Object.entries(beats.beats || {})) {
  check(b.key === bk, `beat '${bk}' key field mismatch`);
  const sub = { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity };
  let nPairs = 0;
  eachCoordPair(b.polygon, (pair) => {
    if (!pair || pair.length < 2 || !Number.isFinite(pair[0]) || !Number.isFinite(pair[1])) { fails.push(`beat '${bk}' has a non-finite polygon coordinate`); return; }
    const [lng, lat] = pair; nPairs++;
    check(lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90, `beat '${bk}' coord outside world range: ${lng},${lat}`);
    if (lng < sub.minLng) sub.minLng = lng; if (lng > sub.maxLng) sub.maxLng = lng;
    if (lat < sub.minLat) sub.minLat = lat; if (lat > sub.maxLat) sub.maxLat = lat;
  });
  check(nPairs >= 4, `beat '${bk}' polygon has too few coordinates (${nPairs})`);
  const [clng, clat] = b.centroid || [];
  check(Number.isFinite(clng) && Number.isFinite(clat), `beat '${bk}' centroid not finite`);
  const eps = 1e-6;
  check(clng >= sub.minLng - eps && clng <= sub.maxLng + eps && clat >= sub.minLat - eps && clat <= sub.maxLat + eps,
    `beat '${bk}' centroid ${b.centroid} outside its own polygon bbox`);
  bbox.minLng = Math.min(bbox.minLng, sub.minLng); bbox.maxLng = Math.max(bbox.maxLng, sub.maxLng);
  bbox.minLat = Math.min(bbox.minLat, sub.minLat); bbox.maxLat = Math.max(bbox.maxLat, sub.maxLat);
}

// ── 5. timeline: contiguous months matching the summary span; cells cover
//      exactly the real beats; every cell = all cats, finite ints; Σ == placed
const months = timeline.months || [];
check(months.length === summary.months, `months ${months.length} != summary.months ${summary.months}`);
const nextMonth = (m) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
};
for (let i = 0; i < months.length; i++) {
  check(/^\d{4}-\d{2}$/.test(months[i]), `months[${i}] bad format '${months[i]}'`);
  if (i > 0) check(months[i] === nextMonth(months[i - 1]), `months not contiguous at ${months[i - 1]} → ${months[i]}`);
}
check(months[0] === summary.dateMin.slice(0, 7), `months[0] ${months[0]} != dateMin month`);
check(months.at(-1) === summary.dateMax.slice(0, 7), `last month ${months.at(-1)} != dateMax month`);
const cellBeats = Object.keys(timeline.cells || {});
for (const bk of cellBeats) check(beats.beats[bk], `timeline references unknown beat '${bk}'`);
for (const bk of beatKeys) check(timeline.cells[bk], `beat '${bk}' missing from timeline.cells`);
let cellSum = 0;
for (const [bk, arr] of Object.entries(timeline.cells || {})) {
  check(arr.length === months.length, `beat '${bk}' has ${arr.length} months, expected ${months.length}`);
  for (const [i, cell] of arr.entries()) {
    const keys = Object.keys(cell);
    if (keys.length !== catKeys.length || catKeys.some((k) => !(Number.isInteger(cell[k]) && cell[k] >= 0))) {
      fails.push(`beat '${bk}' month ${months[i]} cell malformed: ${JSON.stringify(cell)}`); continue;
    }
    for (const k of catKeys) cellSum += cell[k];
  }
}
check(cellSum === summary.placedRecords, `timeline cell sum ${cellSum} != placedRecords ${summary.placedRecords}`);

// ── 6. feed: real sampled incidents — valid date in span, real beat, real cat
check(Array.isArray(feed) && feed.length > 0, "feed empty");
for (const [i, it] of (feed || []).entries()) {
  check(isDate(it.date) && it.date >= summary.dateMin && it.date <= summary.dateMax,
    `feed[${i}] date '${it.date}' outside ${summary.dateMin}..${summary.dateMax}`);
  check(beats.beats[it.beat], `feed[${i}] unknown beat '${it.beat}'`);
  check(catKeys.includes(it.cat), `feed[${i}] unknown cat '${it.cat}'`);
  check(typeof it.title === "string" && it.title, `feed[${i}] title missing`);
  check(typeof it.place === "string", `feed[${i}] place missing`);
}

// ── 7. history: sourced annual era — contiguous years, finite counts, links
check(history.source && history.sourceUrl, "history missing source/sourceUrl provenance");
check(Number.isInteger(history.yearMin) && Number.isInteger(history.yearMax), "history yearMin/yearMax missing");
const hcats = Object.keys(history.cats || {});
check(hcats.length > 0, "history.cats missing");
check((history.years || []).length === history.yearMax - history.yearMin + 1,
  `history.years length ${(history.years || []).length} != span ${history.yearMin}..${history.yearMax}`);
for (const [i, y] of (history.years || []).entries()) {
  check(y.year === history.yearMin + i, `history.years not contiguous at index ${i} (${y.year})`);
  for (const k of hcats) check(Number.isFinite(y[k]) && y[k] >= 0, `history ${y.year}.${k} not a finite count`);
}

// ── 8. neighborhoods: resident-name mapping covers every beat, with provenance
check(neighborhoods.source && neighborhoods.sourceUrl, "neighborhoods missing source/sourceUrl");
check(typeof neighborhoods.method === "string" && neighborhoods.method, "neighborhoods.method missing");
for (const bk of beatKeys)
  check(neighborhoods.map && neighborhoods.map[bk] && neighborhoods.map[bk].name,
    `neighborhoods.map missing entry for beat '${bk}'`);

// ── 9. points (real-coordinate cities only): months aligned to timeline, every
//      triple finite + inside the derived city bbox (+pad: real edge addresses
//      sit slightly outside the neighborhood envelope), cat index valid
if (points) {
  check(points.mode && points.note && Number.isFinite(points.sampleRate),
    "points needs mode + note (disclosure) + sampleRate");
  check(Array.isArray(points.months) && points.months.length === months.length &&
    points.months.every((m, i) => m === months[i]), "points.months != timeline.months");
  check(Array.isArray(points.pts) && points.pts.length === months.length,
    `points.pts length ${(points.pts || []).length} != months ${months.length}`);
  const PAD = 0.05; // ~5 km — catches swapped/zeroed coords, not polygon membership
  for (const [mi, monthArr] of (points.pts || []).entries())
    for (const pt of monthArr) {
      const [lng, lat, ci] = pt;
      check(Number.isFinite(lng) && Number.isFinite(lat), `points[${mi}] non-finite coord ${pt}`);
      check(lng >= bbox.minLng - PAD && lng <= bbox.maxLng + PAD && lat >= bbox.minLat - PAD && lat <= bbox.maxLat + PAD,
        `points[${months[mi]}] outside city bbox: ${lng},${lat}`);
      check(Number.isInteger(ci) && ci >= 0 && ci < catKeys.length, `points[${months[mi]}] bad cat index ${ci}`);
    }
}

// ── 10. no non-finite number anywhere in the bundle
const scanFinite = (o, path) => {
  if (typeof o === "number") { if (!Number.isFinite(o)) fails.push(`non-finite number at ${path}`); return; }
  if (Array.isArray(o)) { o.forEach((v, i) => scanFinite(v, `${path}[${i}]`)); return; }
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) scanFinite(v, `${path}.${k}`);
};
for (const [name, obj] of Object.entries({ beats, timeline, feed, summary, history, neighborhoods, points }))
  if (obj) scanFinite(obj, name);

// ── warnings (must be disclosed on screen, but do not hard-fail the bundle)
warn(summary.coveragePct >= 90,
  `coverage ${summary.coveragePct}% below 90% — representativeness must be disclosed on screen ` +
  `(unplaced: ${JSON.stringify(summary.unplacedBeats)})`);
warn(hasPoints, "no points.json — aggregate-only bundle (fine ONLY if the source publishes no coordinates)");

bail();
function bail() {
  if (fails.length) {
    console.error(`✗ ${slug} VALIDATION FAILED (${fails.length}):`);
    for (const f of fails.slice(0, 40)) console.error("  - " + f);
    if (fails.length > 40) console.error(`  … and ${fails.length - 40} more`);
    process.exit(1);
  }
  for (const w of warns) console.warn(`⚠ ${slug}: ${w}`);
  const fmtB = (v) => v.toFixed(3);
  console.log(`✓ ${slug} valid — ${summary.totalRecords.toLocaleString("en-US")} records, ` +
    `${summary.coveragePct}% placed across ${summary.beatCount} beats, ${summary.months} months ` +
    `(${timeline.months[0]}..${timeline.months.at(-1)}), feed ${feed.length}, ` +
    `history ${history.yearMin}–${history.yearMax}, points ${points ? "real-coords" : "none (aggregate)"}, ` +
    `bbox [${fmtB(bbox.minLng)},${fmtB(bbox.minLat)} → ${fmtB(bbox.maxLng)},${fmtB(bbox.maxLat)}].`);
}
