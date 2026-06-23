#!/usr/bin/env node
/**
 * Normalize a fetched dataset into the compact, video-ready bundle the surface reads.
 * Aggregates real records into per-beat, per-month category counts joined to real
 * beat polygons. Nothing is invented: unmatched records are counted in the true
 * total and disclosed, never placed on the map.
 *
 *   node pipeline/normalize.mjs grand-rapids-mi
 *
 * Output (data/<slug>/normalized/):
 *   beats.json     real beat polygons + area-weighted centroids
 *   timeline.json  months[] + per-beat per-category counts per month
 *   feed.json      chronological sample of real incidents for the dispatch feed
 *   summary.json   totals, category totals, span, coverage %, sources
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2];
if (!slug) { console.error("usage: node pipeline/normalize.mjs <slug>"); process.exit(1); }
const RAW = join(ROOT, "data", slug, "raw");
const OUT = join(ROOT, "data", slug, "normalized");

const SERVCEN = { C: "CENTRAL", E: "EAST", N: "NORTH", S: "SOUTH", W: "WEST" };
const CATS = {
  persons:  { label: "Crimes Against Persons",  color: "#ff2e63" },
  property: { label: "Crimes Against Property", color: "#ffc233" },
  society:  { label: "Crimes Against Society",  color: "#34e0e0" },
  other:    { label: "Local / Other",           color: "#7486a0" },
};
function catOf(nibrsCategory) {
  switch ((nibrsCategory || "").trim()) {
    case "Crimes Against Person":   return "persons";
    case "Crimes Against Property": return "property";
    case "Crimes Against Society":  return "society";
    default:                        return "other"; // Local, Local-DL, All Other, 0
  }
}
function beatKeyOf(beat) {
  const m = (beat || "").trim().match(/^([CENSW])(\d+)$/);
  if (!m) return null;
  const key = `${SERVCEN[m[1]]} ${Number(m[2])}`;
  return key;
}

// area-weighted centroid of a GeoJSON polygon's outer ring (lng,lat)
function centroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    a += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross;
  }
  if (Math.abs(a) < 1e-12) { // degenerate: average vertices
    const m = ring.slice(0, -1).reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]);
    return [m[0] / (ring.length - 1), m[1] / (ring.length - 1)];
  }
  a *= 0.5;
  return [cx / (6 * a), cy / (6 * a)];
}
function ym(ms) { const d = new Date(ms); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; }
function monthRange(minYM, maxYM) {
  const out = []; let [y, m] = minYM.split("-").map(Number); const [Y, M] = maxYM.split("-").map(Number);
  while (y < Y || (y === Y && m <= M)) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const records = JSON.parse(await readFile(join(RAW, "incidents.json")));
  const beatsGeo = JSON.parse(await readFile(join(RAW, "beats.geojson")));
  const fetchMeta = JSON.parse(await readFile(join(RAW, "_fetch_meta.json")));

  // ---- beats: polygon + centroid, keyed "SERVCEN BEAT" ----
  const beats = {};
  for (const f of beatsGeo.features) {
    const p = f.properties;
    const key = `${p.SERVCEN} ${p.BEAT}`;
    const ring = f.geometry.type === "Polygon" ? f.geometry.coordinates[0]
      : f.geometry.coordinates[0][0]; // MultiPolygon outer of first part
    beats[key] = {
      key, name: p.NAME, servcen: p.SERVCEN, beat: p.BEAT,
      centroid: centroid(ring).map((v) => +v.toFixed(6)),
      polygon: f.geometry.coordinates, geomType: f.geometry.type,
    };
  }

  // ---- aggregate ----
  const months = monthRange(ym(fetchMeta.dateMin && Date.parse(fetchMeta.dateMin)),
                            ym(fetchMeta.dateMax && Date.parse(fetchMeta.dateMax)));
  const mIdx = Object.fromEntries(months.map((m, i) => [m, i]));
  // cells[beatKey][monthIdx] = {persons,property,society,other}
  const cells = {};
  const catTotals = { persons: 0, property: 0, society: 0, other: 0 };
  let placed = 0, unplaced = 0;
  const unplacedBeats = {};
  for (const r of records) {
    const cat = catOf(r.NIBRS_Category);
    catTotals[cat]++;
    const bk = beatKeyOf(r.Beat__);
    const mi = mIdx[ym(r.DATEOFOFFENSE)];
    if (bk == null || !beats[bk] || mi == null) {
      unplaced++; const b = (r.Beat__ || "∅").trim() || "∅"; unplacedBeats[b] = (unplacedBeats[b] || 0) + 1; continue;
    }
    placed++;
    (cells[bk] ||= months.map(() => ({ persons: 0, property: 0, society: 0, other: 0 })))[mi][cat]++;
  }

  // ---- dispatch feed: chronological sample weighted to serious NIBRS Group A ----
  const SERIOUS = /HOMICIDE|MURDER|ROBBERY|ASSAULT|SHOOT|WEAPON|BURGLAR|KIDNAP|ARSON|SEX/i;
  const groupA = records.filter((r) => catOf(r.NIBRS_Category) !== "other" && beatKeyOf(r.Beat__) && beats[beatKeyOf(r.Beat__)]);
  groupA.sort((a, b) => a.DATEOFOFFENSE - b.DATEOFOFFENSE);
  const feed = [];
  const TARGET = 320;
  const stride = Math.max(1, Math.floor(groupA.length / TARGET));
  for (let i = 0; i < groupA.length; i += stride) {
    // within each stride window, prefer a serious offense if present
    const win = groupA.slice(i, i + stride);
    const pick = win.find((r) => SERIOUS.test(r.OFFENSETITLE || r.Offense_Description || "")) || win[0];
    const bk = beatKeyOf(pick.Beat__);
    feed.push({
      date: new Date(pick.DATEOFOFFENSE).toISOString().slice(0, 10),
      title: (pick.OFFENSETITLE || pick.Offense_Description || "Incident").trim(),
      place: (pick.BLOCK_ADDRESS__INCIDENT_LOCATIO || "").trim(),
      beat: bk, cat: catOf(pick.NIBRS_Category),
    });
  }

  await writeFile(join(OUT, "beats.json"), JSON.stringify({ cats: CATS, beats }));
  await writeFile(join(OUT, "timeline.json"), JSON.stringify({ months, cells }));
  await writeFile(join(OUT, "feed.json"), JSON.stringify(feed));
  const summary = {
    slug, title: "Grand Rapids · MI",
    source: fetchMeta.source, fetchedAt: fetchMeta.fetchedAt,
    dateMin: fetchMeta.dateMin, dateMax: fetchMeta.dateMax, months: months.length,
    totalRecords: records.length, placedRecords: placed, unplacedRecords: unplaced,
    coveragePct: +(100 * placed / records.length).toFixed(1),
    unplacedBeats, catTotals, cats: CATS,
    beatCount: Object.keys(beats).length,
  };
  await writeFile(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`feed: ${feed.length} items`);
}
main().catch((e) => { console.error(e); process.exit(1); });
