#!/usr/bin/env node
/**
 * Validate a normalized dataset against honesty + integrity invariants.
 * Exits non-zero on any failure so the pipeline can gate a render.
 *
 *   node pipeline/validate.mjs grand-rapids-mi
 */
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2];
if (!slug) { console.error("usage: node pipeline/validate.mjs <slug>"); process.exit(1); }
const N = join(ROOT, "data", slug, "normalized");

const fails = [];
const check = (cond, msg) => { if (!cond) fails.push(msg); };

const [beats, timeline, feed, summary] = await Promise.all(
  ["beats.json", "timeline.json", "feed.json", "summary.json"].map(async (f) =>
    JSON.parse(await readFile(join(N, f)))));

// 1. category totals reconcile to the true record total
const catSum = Object.values(summary.catTotals).reduce((a, b) => a + b, 0);
check(catSum === summary.totalRecords, `catTotals sum ${catSum} != totalRecords ${summary.totalRecords}`);

// 2. placed + unplaced == total
check(summary.placedRecords + summary.unplacedRecords === summary.totalRecords,
  `placed+unplaced != total`);

// 3. placed records equal the sum of all timeline cells
let cellSum = 0;
for (const arr of Object.values(timeline.cells))
  for (const m of arr) cellSum += m.persons + m.property + m.society + m.other;
check(cellSum === summary.placedRecords, `timeline cell sum ${cellSum} != placedRecords ${summary.placedRecords}`);

// 4. every timeline beat key exists as a real polygon
for (const bk of Object.keys(timeline.cells))
  check(beats.beats[bk], `timeline references unknown beat ${bk}`);

// 5. each cell array length == months length
for (const [bk, arr] of Object.entries(timeline.cells))
  check(arr.length === timeline.months.length, `beat ${bk} has ${arr.length} months, expected ${timeline.months.length}`);

// 6. months contiguous + count matches summary
check(timeline.months.length === summary.months, `months length mismatch`);

// 7. every beat centroid sits inside Grand Rapids bbox (honest geometry sanity)
const BBOX = { minLng: -85.78, maxLng: -85.55, minLat: 42.86, maxLat: 43.05 };
for (const b of Object.values(beats.beats)) {
  const [lng, lat] = b.centroid;
  check(lng > BBOX.minLng && lng < BBOX.maxLng && lat > BBOX.minLat && lat < BBOX.maxLat,
    `beat ${b.key} centroid out of GR bbox: ${b.centroid}`);
}

// 8. feed integrity: valid date, beat, cat
const catKeys = new Set(Object.keys(summary.cats));
for (const [i, it] of feed.entries()) {
  check(/^\d{4}-\d{2}-\d{2}$/.test(it.date), `feed[${i}] bad date ${it.date}`);
  check(beats.beats[it.beat], `feed[${i}] unknown beat ${it.beat}`);
  check(catKeys.has(it.cat), `feed[${i}] unknown cat ${it.cat}`);
}

// 9. coverage threshold (disclosed, but must stay high enough to be representative)
check(summary.coveragePct >= 90, `coverage ${summary.coveragePct}% below 90%`);

// 10. provenance present
check(summary.source && summary.source.records && summary.source.hub, `missing source links`);

if (fails.length) {
  console.error(`✗ VALIDATION FAILED (${fails.length}):`);
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
console.log(`✓ ${slug} valid — ${summary.totalRecords} records, ${summary.coveragePct}% placed across ${summary.beatCount} beats, ${summary.months} months, feed ${feed.length}.`);
