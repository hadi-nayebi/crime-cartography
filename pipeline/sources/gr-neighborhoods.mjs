#!/usr/bin/env node
// Source adapter: City of Grand Rapids "Neighborhood Areas" → a beat→neighborhood
// label map. Honest, sourced locator names ("Creston", "Heritage Hill", …) so a
// viewer who doesn't know "CENTRAL 3" still recognizes the place.
//
// Method: fetch the City's official neighborhood polygons (same ArcGIS org and
// license as the GRPD crime + beat data), then for each beat centroid find the
// neighborhood polygon that CONTAINS it (point-in-polygon). When a centroid
// falls outside every polygon (a few beats hug the city edge / river), fall back
// to the nearest polygon by centroid distance and flag it `approx:true`.
//
// Output: data/grand-rapids-mi/normalized/neighborhoods.json
//   { source, sourceUrl, fetchedAt, license, map: { "CENTRAL 3": {name, approx} } }
//
// Run: node pipeline/sources/gr-neighborhoods.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const NORM = join(ROOT, "data", "grand-rapids-mi", "normalized");

const LAYER =
  "https://services2.arcgis.com/L81TiOwAPO1ZvU9b/arcgis/rest/services/City_of_Grand_Rapids_Neighborhood_Areas/FeatureServer/0";
const UA = "crime-cartography/1.0 (research; github.com/hadi-nayebi/crime-cartography)";

// ---- geometry helpers ----------------------------------------------------
function pointInRing(pt, ring) {
  // ray casting; ring = [[lng,lat],...]
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// GeoJSON polygon/multipolygon: rings[0] outer, rings[1..] holes.
function pointInPolygon(pt, geom) {
  const polys =
    geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  for (const rings of polys) {
    if (!rings.length) continue;
    if (pointInRing(pt, rings[0])) {
      let inHole = false;
      for (let h = 1; h < rings.length; h++) {
        if (pointInRing(pt, rings[h])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
  }
  return false;
}

function polyCentroid(geom) {
  const polys =
    geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  let sx = 0,
    sy = 0,
    n = 0;
  for (const rings of polys)
    for (const [x, y] of rings[0]) {
      sx += x;
      sy += y;
      n++;
    }
  return [sx / n, sy / n];
}

async function main() {
  const beats = JSON.parse(readFileSync(join(NORM, "beats.json"), "utf8"));

  const url =
    `${LAYER}/query?where=1%3D1&outFields=NEBRH&outSR=4326&f=geojson`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`neighborhoods fetch failed: ${res.status}`);
  const gj = await res.json();
  const hoods = (gj.features || [])
    .map((f) => ({
      // fix the source's stray leading-lowercase ("ken-O-Sha Park"); otherwise verbatim
      name: ((n) => (n ? n.charAt(0).toUpperCase() + n.slice(1) : n))(
        (f.properties?.NEBRH || "").trim(),
      ),
      geom: f.geometry,
      centroid: f.geometry ? polyCentroid(f.geometry) : null,
    }))
    .filter((h) => h.name && h.geom);
  console.log(`fetched ${hoods.length} neighborhood polygons`);

  const map = {};
  let contained = 0,
    approx = 0;
  for (const [key, beat] of Object.entries(beats.beats)) {
    const c = beat.centroid; // [lng, lat]
    let hit = hoods.find((h) => pointInPolygon(c, h.geom));
    let isApprox = false;
    if (!hit) {
      // nearest neighborhood centroid (planar — extent is tiny)
      isApprox = true;
      let best = null,
        bestD = Infinity;
      for (const h of hoods) {
        const dx = h.centroid[0] - c[0];
        const dy = h.centroid[1] - c[1];
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = h;
        }
      }
      hit = best;
    }
    if (hit) {
      map[key] = { name: hit.name, approx: isApprox };
      if (isApprox) approx++;
      else contained++;
    }
  }
  console.log(`mapped ${Object.keys(map).length} beats (${contained} contained, ${approx} nearest-fallback)`);

  const out = {
    source: "City of Grand Rapids Neighborhood Areas (ArcGIS)",
    sourceUrl:
      "https://services2.arcgis.com/L81TiOwAPO1ZvU9b/arcgis/rest/services/City_of_Grand_Rapids_Neighborhood_Areas/FeatureServer/0",
    hub: "https://grdata-grandrapids.opendata.arcgis.com/",
    fetchedAt: new Date().toISOString().slice(0, 10),
    license:
      "City of Grand Rapids Data Access and Use Constraint Agreement (provided 'as is')",
    method:
      "beat centroid → containing official neighborhood polygon (point-in-polygon); approx=true means nearest neighborhood when the centroid falls outside all polygons",
    map,
  };
  writeFileSync(join(NORM, "neighborhoods.json"), JSON.stringify(out, null, 2));
  console.log(`wrote ${join(NORM, "neighborhoods.json")}`);

  // human-readable preview
  for (const k of Object.keys(map).sort())
    console.log(`  ${k.padEnd(10)} → ${map[k].name}${map[k].approx ? " (≈)" : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
