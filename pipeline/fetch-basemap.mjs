#!/usr/bin/env node
/**
 * Fetch a minimal orientation basemap per city from OpenStreetMap (Overpass):
 *   - major highways (motorway + trunk) clipped to the beats' bounding box
 *   - a curated allowlist of well-known landmarks (airports, terminals,
 *     stadiums, downtown anchors), each resolved to REAL OSM coordinates
 *
 * Output: data/<slug>/normalized/basemap.json
 *   { attribution, fetchedAt, bbox, highways:[{ref,pts:[[lng,lat],...]}],
 *     landmarks:[{name,kind,lng,lat}] }
 *
 * License: OSM data is ODbL — the on-screen credit "© OpenStreetMap
 * contributors" is REQUIRED and is added to each video's credits/source line.
 * Landmarks not found (or outside the map extent) are dropped with a warning —
 * nothing is ever placed by hand.
 *
 *   node pipeline/fetch-basemap.mjs <slug>
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2];
if (!slug) { console.error("usage: node pipeline/fetch-basemap.mjs <slug>"); process.exit(1); }
const NORM = join(ROOT, "data", slug, "normalized");
const OVERPASS = "https://overpass-api.de/api/interpreter";

// Curated, verifiable orientation anchors per city. `q` is matched against OSM
// `name` (case-insensitive regex) within the city bbox; kind drives the icon.
const LANDMARKS = {
  "chicago-il": [
    { q: "^O'Hare International Airport$", kind: "airport", label: "O'Hare ✈" },
    { q: "Midway International Airport", kind: "airport", label: "Midway ✈" },
    { q: "^Chicago Union Station$", kind: "terminal", label: "Union Station" },
    { q: "^Navy Pier$", kind: "landmark", label: "Navy Pier" },
    { q: "^Soldier Field$", kind: "stadium", label: "Soldier Field" },
    { q: "^Willis Tower$", kind: "landmark", label: "Willis Tower" },
    { q: "^University of Chicago$", kind: "university", label: "Univ. of Chicago" },
    { q: "^Wrigley Field$", kind: "stadium", label: "Wrigley Field" },
  ],
  "seattle-wa": [
    { q: "^King County International Airport$|^Boeing Field", kind: "airport", label: "Boeing Field ✈" },
    { q: "^King Street Station$", kind: "terminal", label: "King St Station" },
    { q: "^Space Needle$", kind: "landmark", label: "Space Needle" },
    { q: "^Pike Place Market$", kind: "landmark", label: "Pike Place" },
    { q: "^University of Washington$", kind: "university", label: "Univ. of Washington" },
    { q: "^Lumen Field$", kind: "stadium", label: "Lumen Field" },
    { q: "^T-Mobile Park$", kind: "stadium", label: "T-Mobile Park" },
    { q: "^Woodland Park Zoo$", kind: "landmark", label: "Woodland Park Zoo" },
  ],
  "grand-rapids-mi": [
    { q: "^Van Andel Arena$", kind: "stadium", label: "Van Andel Arena" },
    { q: "^DeVos Place$", kind: "landmark", label: "DeVos Place" },
    { q: "^Gerald R. Ford Presidential (Museum|Library)", kind: "landmark", label: "Ford Museum" },
    { q: "^John Ball Zoo", kind: "landmark", label: "John Ball Zoo" },
    { q: "^Grand Valley State University", kind: "university", label: "GVSU (downtown)" },
    { q: "^Frederik Meijer Gardens", kind: "landmark", label: "Meijer Gardens" },
  ],
};

async function overpass(query) {
  for (let a = 0; a < 4; a++) {
    const r = await fetch(OVERPASS, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "crime-cartography" },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (r.status === 429 || r.status >= 500) {
      console.warn(`  overpass ${r.status}, retrying…`);
      await new Promise((res) => setTimeout(res, 20000 * (a + 1)));
      continue;
    }
    if (!r.ok) throw new Error(`overpass ${r.status}`);
    return r.json();
  }
  throw new Error("overpass: still failing after retries");
}

function bboxOfBeats(beatsFile) {
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const b of Object.values(beatsFile.beats)) {
    for (const ring of b.polygon) {
      for (const [lng, lat] of ring) {
        if (lat < s) s = lat; if (lat > n) n = lat;
        if (lng < w) w = lng; if (lng > e) e = lng;
      }
    }
  }
  // small pad so highways continue to the frame edge
  const padLat = (n - s) * 0.03, padLng = (e - w) * 0.03;
  return { s: s - padLat, w: w - padLng, n: n + padLat, e: e + padLng };
}

const beatsFile = JSON.parse(await readFile(join(NORM, "beats.json")));
const bb = bboxOfBeats(beatsFile);
const bbox = `${bb.s},${bb.w},${bb.n},${bb.e}`;
console.log(`bbox: ${bbox}`);

// ---- highways: motorway + trunk ways with geometry ----
console.log("fetching highways…");
const hw = await overpass(
  `[out:json][timeout:90];way["highway"~"^(motorway|trunk)$"](${bbox});out tags geom;`,
);
// merge by route ref (I 90, US 131…), downsample + quantize
const byRef = new Map();
for (const el of hw.elements ?? []) {
  if (!el.geometry) continue;
  const ref = (el.tags?.ref ?? el.tags?.name ?? "").split(";")[0].trim();
  const pts = el.geometry
    .filter((_, i) => i % 2 === 0 || i === el.geometry.length - 1) // downsample
    .map((g) => [Number(g.lon.toFixed(5)), Number(g.lat.toFixed(5))]);
  if (pts.length < 2) continue;
  if (!byRef.has(ref)) byRef.set(ref, []);
  byRef.get(ref).push(pts);
}
const highways = [];
for (const [ref, segs] of byRef) highways.push({ ref, segs });
const segCount = highways.reduce((a, h) => a + h.segs.length, 0);
console.log(`highways: ${highways.length} routes, ${segCount} segments`);

// ---- landmarks ----
const wanted = LANDMARKS[slug] ?? [];
const landmarks = [];
for (const lm of wanted) {
  const j = await overpass(
    `[out:json][timeout:60];nwr["name"~"${lm.q}",i](${bbox});out tags center 3;`,
  );
  const el = (j.elements ?? []).find((x) => x.center || (x.lat && x.lon));
  if (!el) { console.warn(`  ✗ landmark not found in bbox: ${lm.label}`); continue; }
  const lat = el.center?.lat ?? el.lat;
  const lon = el.center?.lon ?? el.lon;
  if (lat < bb.s || lat > bb.n || lon < bb.w || lon > bb.e) {
    console.warn(`  ✗ landmark outside extent: ${lm.label}`); continue;
  }
  landmarks.push({ name: lm.label, kind: lm.kind, lng: Number(lon.toFixed(5)), lat: Number(lat.toFixed(5)) });
  console.log(`  ✓ ${lm.label} @ ${lat.toFixed(4)},${lon.toFixed(4)}`);
  await new Promise((r) => setTimeout(r, 1200)); // Overpass courtesy
}
if (landmarks.length < 3) throw new Error(`too few landmarks resolved (${landmarks.length}) — refusing to write a useless basemap`);

const out = {
  attribution: "Basemap (highways & landmarks): © OpenStreetMap contributors (ODbL)",
  source: "https://www.openstreetmap.org / Overpass API",
  fetchedAt: new Date().toISOString(),
  bbox: bb,
  highways,
  landmarks,
};
await writeFile(join(NORM, "basemap.json"), JSON.stringify(out));
const kb = (JSON.stringify(out).length / 1024).toFixed(0);
console.log(`✓ wrote ${slug} basemap.json (${kb} KB, ${highways.length} routes, ${landmarks.length} landmarks)`);
