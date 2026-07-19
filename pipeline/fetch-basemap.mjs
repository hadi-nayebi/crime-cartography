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
  "washington-dc": [
    { q: "^White House$", kind: "landmark", label: "White House" },
    { q: "^United States Capitol$", kind: "landmark", label: "US Capitol" },
    { q: "^Union Station$", kind: "terminal", label: "Union Station" },
    { q: "^Washington Monument$", kind: "landmark", label: "Washington Monument" },
    { q: "^Nationals Park$", kind: "stadium", label: "Nationals Park" },
    { q: "^Howard University$", kind: "university", label: "Howard University" },
    { q: "National Zoological Park|^National Zoo$", kind: "landmark", label: "National Zoo" },
    { q: "^Capital One Arena$", kind: "stadium", label: "Capital One Arena" },
  ],
  "san-francisco-ca": [
    { q: "^Golden Gate Bridge$", kind: "landmark", label: "Golden Gate Bridge" },
    { q: "^Ferry Building$", kind: "terminal", label: "Ferry Building" },
    { q: "^Oracle Park$", kind: "stadium", label: "Oracle Park" },
    { q: "^Chase Center$", kind: "stadium", label: "Chase Center" },
    { q: "^Coit Tower$", kind: "landmark", label: "Coit Tower" },
    { q: "^Golden Gate Park$", kind: "landmark", label: "Golden Gate Park" },
    { q: "^Alcatraz Island$", kind: "landmark", label: "Alcatraz" },
    { q: "^San Francisco City Hall$", kind: "landmark", label: "City Hall" },
  ],
  "boston-ma": [
    { q: "^Fenway Park$", kind: "stadium", label: "Fenway Park" },
    { q: "^TD Garden$", kind: "stadium", label: "TD Garden" },
    { q: "^Boston Common$", kind: "landmark", label: "Boston Common" },
    { q: "Logan International Airport", kind: "airport", label: "Logan ✈" },
    { q: "^South Station$", kind: "terminal", label: "South Station" },
    { q: "^Faneuil Hall$", kind: "landmark", label: "Faneuil Hall" },
    { q: "^Boston University$", kind: "university", label: "Boston University" },
    { q: "^Franklin Park Zoo$", kind: "landmark", label: "Franklin Park Zoo" },
  ],
  "philadelphia-pa": [
    { q: "^Philadelphia City Hall$", kind: "landmark", label: "City Hall" },
    { q: "^Independence Hall$", kind: "landmark", label: "Independence Hall" },
    { q: "^30th Street Station$", kind: "terminal", label: "30th St Station" },
    { q: "^Citizens Bank Park$", kind: "stadium", label: "Citizens Bank Park" },
    { q: "^Lincoln Financial Field$", kind: "stadium", label: "Lincoln Financial" },
    { q: "^Temple University$", kind: "university", label: "Temple University" },
    { q: "^University of Pennsylvania$", kind: "university", label: "Penn" },
    { q: "^Philadelphia Museum of Art$", kind: "landmark", label: "Museum of Art" },
    { q: "Philadelphia International Airport", kind: "airport", label: "PHL ✈" },
  ],
  "minneapolis-mn": [
    { q: "^U\\.?S\\.? Bank Stadium$", kind: "stadium", label: "US Bank Stadium" },
    { q: "^Target Field$", kind: "stadium", label: "Target Field" },
    { q: "^Target Center$", kind: "stadium", label: "Target Center" },
    { q: "^University of Minnesota$", kind: "university", label: "Univ. of Minnesota" },
    { q: "^Stone Arch Bridge$", kind: "landmark", label: "Stone Arch Bridge" },
    { q: "^Minnehaha (Regional Park|Falls)", kind: "landmark", label: "Minnehaha Falls" },
    { q: "^First Avenue", kind: "landmark", label: "First Avenue" },
    { q: "^Bde Maka Ska$", kind: "landmark", label: "Bde Maka Ska" },
  ],
  "atlanta-ga": [
    { q: "^Mercedes-Benz Stadium$", kind: "stadium", label: "Mercedes-Benz Stadium" },
    { q: "^State Farm Arena$", kind: "stadium", label: "State Farm Arena" },
    { q: "^Georgia Aquarium$", kind: "landmark", label: "Georgia Aquarium" },
    { q: "^Centennial Olympic Park$", kind: "landmark", label: "Centennial Park" },
    { q: "^Piedmont Park$", kind: "landmark", label: "Piedmont Park" },
    { q: "^Georgia Institute of Technology$", kind: "university", label: "Georgia Tech" },
    { q: "Hartsfield.Jackson", kind: "airport", label: "ATL ✈" },
    { q: "^Martin Luther King Jr. National Historical Park", kind: "landmark", label: "MLK Nat'l Park" },
  ],
  "detroit-mi": [
    { q: "^Ford Field$", kind: "stadium", label: "Ford Field" },
    { q: "^Comerica Park$", kind: "stadium", label: "Comerica Park" },
    { q: "^Little Caesars Arena$", kind: "stadium", label: "LCA" },
    { q: "^Renaissance Center$", kind: "landmark", label: "Renaissance Center" },
    { q: "^Belle Isle", kind: "landmark", label: "Belle Isle" },
    { q: "^Michigan Central (Station|Depot)", kind: "terminal", label: "Michigan Central" },
    { q: "^Eastern Market$", kind: "landmark", label: "Eastern Market" },
    { q: "^Wayne State University$", kind: "university", label: "Wayne State" },
  ],
  "buffalo-ny": [
    { q: "^KeyBank Center$", kind: "stadium", label: "KeyBank Center" },
    { q: "^Sahlen Field$", kind: "stadium", label: "Sahlen Field" },
    { q: "^Buffalo City Hall$", kind: "landmark", label: "City Hall" },
    { q: "^Canalside$", kind: "landmark", label: "Canalside" },
    { q: "^Delaware Park$", kind: "landmark", label: "Delaware Park" },
    { q: "^Buffalo Zoo$", kind: "landmark", label: "Buffalo Zoo" },
    { q: "^University at Buffalo", kind: "university", label: "UB South" },
  ],
  "denver-co": [
    { q: "^Coors Field$", kind: "stadium", label: "Coors Field" },
    { q: "^Empower Field at Mile High$", kind: "stadium", label: "Mile High" },
    { q: "^Ball Arena$", kind: "stadium", label: "Ball Arena" },
    { q: "^Union Station$", kind: "terminal", label: "Union Station" },
    { q: "^Denver Zoo$", kind: "landmark", label: "Denver Zoo" },
    { q: "^City Park$", kind: "landmark", label: "City Park" },
    { q: "^Colorado State Capitol$", kind: "landmark", label: "State Capitol" },
    { q: "^Denver Botanic Gardens$", kind: "landmark", label: "Botanic Gardens" },
  ],
  "baltimore-md": [
    { q: "^Oriole Park at Camden Yards$", kind: "stadium", label: "Camden Yards" },
    { q: "^M&T Bank Stadium$", kind: "stadium", label: "M&T Bank Stadium" },
    { q: "^Fort McHenry", kind: "landmark", label: "Fort McHenry" },
    { q: "^National Aquarium", kind: "landmark", label: "National Aquarium" },
    { q: "^Johns Hopkins University$", kind: "university", label: "Johns Hopkins" },
    { q: "^Johns Hopkins Hospital$", kind: "landmark", label: "Hopkins Hospital" },
    { q: "^Penn(sylvania)? Station$", kind: "terminal", label: "Penn Station" },
  ],
  "cincinnati-oh": [
    { q: "^Great American Ball Park$", kind: "stadium", label: "GABP" },
    { q: "^Paycor Stadium$", kind: "stadium", label: "Paycor Stadium" },
    { q: "^Findlay Market$", kind: "landmark", label: "Findlay Market" },
    { q: "^Cincinnati Zoo", kind: "landmark", label: "Cincinnati Zoo" },
    { q: "^University of Cincinnati$", kind: "university", label: "UC" },
    { q: "^(Cincinnati )?Union Terminal$", kind: "terminal", label: "Union Terminal" },
    { q: "^Fountain Square$", kind: "landmark", label: "Fountain Square" },
  ],
  "kansas-city-mo": [
    { q: "^GEHA Field at Arrowhead Stadium$|^Arrowhead Stadium$", kind: "stadium", label: "Arrowhead" },
    { q: "^Kauffman Stadium$", kind: "stadium", label: "Kauffman Stadium" },
    { q: "^Union Station$", kind: "terminal", label: "Union Station" },
    { q: "^Country Club Plaza$", kind: "landmark", label: "The Plaza" },
    { q: "^Nelson-Atkins Museum of Art$", kind: "landmark", label: "Nelson-Atkins" },
    { q: "^National (World War I|WWI) Museum", kind: "landmark", label: "WWI Museum" },
    { q: "^T-Mobile Center$", kind: "stadium", label: "T-Mobile Center" },
    { q: "^Kansas City Zoo", kind: "landmark", label: "KC Zoo" },
  ],
  "milwaukee-wi": [
    { q: "^American Family Field$", kind: "stadium", label: "Am Fam Field" },
    { q: "^Fiserv Forum$", kind: "stadium", label: "Fiserv Forum" },
    { q: "^Milwaukee Art Museum$", kind: "landmark", label: "Art Museum" },
    { q: "Mitchell International Airport", kind: "airport", label: "MKE ✈" },
    { q: "^Marquette University$", kind: "university", label: "Marquette" },
    { q: "^University of Wisconsin.Milwaukee$", kind: "university", label: "UWM" },
    { q: "^Harley-Davidson Museum$", kind: "landmark", label: "H-D Museum" },
  ],
  "charlotte-nc": [
    { q: "^Bank of America Stadium$", kind: "stadium", label: "BofA Stadium" },
    { q: "^Spectrum Center$", kind: "stadium", label: "Spectrum Center" },
    { q: "^Truist Field$", kind: "stadium", label: "Truist Field" },
    { q: "Charlotte.Douglas International Airport", kind: "airport", label: "CLT ✈" },
    { q: "^University of North Carolina at Charlotte$", kind: "university", label: "UNC Charlotte" },
    { q: "^Freedom Park$", kind: "landmark", label: "Freedom Park" },
    { q: "^NASCAR Hall of Fame$", kind: "landmark", label: "NASCAR HOF" },
  ],
  "nashville-tn": [
    { q: "^Nissan Stadium$", kind: "stadium", label: "Nissan Stadium" },
    { q: "^Bridgestone Arena$", kind: "stadium", label: "Bridgestone Arena" },
    { q: "^Ryman Auditorium$", kind: "landmark", label: "Ryman" },
    { q: "^Grand Ole Opry House$|^Grand Ole Opry$", kind: "landmark", label: "Grand Ole Opry" },
    { q: "^Vanderbilt University$", kind: "university", label: "Vanderbilt" },
    { q: "^(The )?Parthenon$", kind: "landmark", label: "Parthenon" },
    { q: "^Nashville International Airport$", kind: "airport", label: "BNA ✈" },
    { q: "^Tennessee State Capitol$", kind: "landmark", label: "State Capitol" },
  ],
  "dallas-tx": [
    { q: "^American Airlines Center$", kind: "stadium", label: "AA Center" },
    { q: "^Cotton Bowl", kind: "stadium", label: "Cotton Bowl" },
    { q: "^Dallas Love Field$", kind: "airport", label: "Love Field ✈" },
    { q: "^Reunion Tower$", kind: "landmark", label: "Reunion Tower" },
    { q: "^Dealey Plaza$", kind: "landmark", label: "Dealey Plaza" },
    { q: "^Southern Methodist University$", kind: "university", label: "SMU" },
    { q: "^Dallas Zoo$", kind: "landmark", label: "Dallas Zoo" },
    { q: "^Klyde Warren Park$", kind: "landmark", label: "Klyde Warren Park" },
  ],
  "memphis-tn": [
    { q: "^FedExForum$", kind: "stadium", label: "FedExForum" },
    { q: "^Graceland$", kind: "landmark", label: "Graceland" },
    { q: "^Beale Street$", kind: "landmark", label: "Beale Street" },
    { q: "^Memphis Zoo$", kind: "landmark", label: "Memphis Zoo" },
    { q: "^National Civil Rights Museum$", kind: "landmark", label: "Civil Rights Museum" },
    { q: "^Memphis International Airport$", kind: "airport", label: "MEM ✈" },
    { q: "^University of Memphis$", kind: "university", label: "U of Memphis" },
    { q: "^(Memphis )?Pyramid$|^Bass Pro Shops at the Pyramid$", kind: "landmark", label: "The Pyramid" },
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
