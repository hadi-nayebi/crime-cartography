#!/usr/bin/env node
/**
 * Source adapter: Grand Rapids Police Department (GRPD) Crime Data.
 *
 * Fetches the FULL incident record set (no coordinates — spatial unit is Beat)
 * plus the real beat polygons, straight from the City of Grand Rapids ArcGIS Hub.
 * Deterministic + reproducible: same query, same fields, written to raw/ with a
 * fetch-meta sidecar recording exactly what was pulled and when.
 *
 * Honesty: we pull real records only. No synthesis happens here or downstream.
 *
 *   node pipeline/sources/grpd.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SLUG = "grand-rapids-mi";
const RAW = join(ROOT, "data", SLUG, "raw");

const RECORDS_URL =
  "https://services2.arcgis.com/L81TiOwAPO1ZvU9b/arcgis/rest/services/GRPD_Crime_Data/FeatureServer/0";
const BEATS_URL =
  "https://services2.arcgis.com/L81TiOwAPO1ZvU9b/arcgis/rest/services/GRPD_SERVICE_AREA_MAP_NEW/FeatureServer/1";

const FIELDS = [
  "ObjectID", "DATEOFOFFENSE", "NIBRS_Category", "NIBRS_GRP",
  "Offense_Description", "OFFENSETITLE", "Beat__", "Service_Area",
  "BLOCK_ADDRESS__INCIDENT_LOCATIO", "Weapon_Type", "Day_of_the_Week",
];
const PAGE = 2000;

async function getJSON(url, params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(u, { headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.error) throw new Error(`ArcGIS error: ${JSON.stringify(j.error)}`);
      return j;
    } catch (e) {
      if (attempt === 4) throw e;
      process.stderr.write(`  retry ${attempt} (${e.message})\n`);
      await new Promise((res) => setTimeout(res, 800 * attempt));
    }
  }
}

async function fetchAllRecords() {
  const out = [];
  let offset = 0;
  for (;;) {
    const j = await getJSON(`${RECORDS_URL}/query`, {
      where: "1=1",
      outFields: FIELDS.join(","),
      orderByFields: "ObjectID",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
      returnGeometry: "false",
      f: "json",
    });
    const feats = j.features || [];
    for (const f of feats) out.push(f.attributes);
    process.stdout.write(`\r  records: ${out.length}`);
    if (feats.length < PAGE && !j.exceededTransferLimit) break;
    if (feats.length === 0) break;
    offset += feats.length;
  }
  process.stdout.write("\n");
  return out;
}

async function main() {
  await mkdir(RAW, { recursive: true });
  const startedAt = new Date().toISOString();

  console.log("Fetching GRPD incident records …");
  const records = await fetchAllRecords();

  console.log("Fetching beat polygons (GeoJSON) …");
  const beats = await getJSON(`${BEATS_URL}/query`, {
    where: "1=1", outFields: "*", returnGeometry: "true",
    outSR: "4326", f: "geojson",
  });

  await writeFile(join(RAW, "incidents.json"), JSON.stringify(records));
  await writeFile(join(RAW, "beats.geojson"), JSON.stringify(beats));

  let dMin = Infinity, dMax = -Infinity, nDates = 0;
  for (const r of records) {
    const d = r.DATEOFOFFENSE;
    if (d == null) continue;
    nDates++;
    if (d < dMin) dMin = d;
    if (d > dMax) dMax = d;
  }
  const meta = {
    fetchedAt: startedAt,
    completedAt: new Date().toISOString(),
    source: {
      records: RECORDS_URL,
      beats: BEATS_URL,
      hub: "https://grpd-grandrapids.hub.arcgis.com/datasets/grandrapids::grpd-crime-data",
    },
    fields: FIELDS,
    recordCount: records.length,
    beatFeatureCount: (beats.features || []).length,
    dateMin: nDates ? new Date(dMin).toISOString().slice(0, 10) : null,
    dateMax: nDates ? new Date(dMax).toISOString().slice(0, 10) : null,
  };
  await writeFile(join(RAW, "_fetch_meta.json"), JSON.stringify(meta, null, 2));
  console.log("Done:", JSON.stringify(meta, null, 2));
}

main().catch((e) => {
  console.error("\nFETCH FAILED:", e);
  process.exit(1);
});
