import { staticFile } from "remotion";
import type {
  BasemapFile,
  Beat,
  BeatsFile,
  Bundle,
  CatCounts,
  FeedItem,
  HistoryFile,
  NeighborhoodMap,
  PointsFile,
  Summary,
  TimelineFile,
  TrendFile,
} from "./types";
import { CATS, GROUP_A } from "../theme";

// ---- Loading -------------------------------------------------------------
// The normalized bundle is synced into public/<datasetDir>/normalized by
// scripts/sync-data.mjs. We fetch it in calculateMetadata (deterministic).

async function loadJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(staticFile(path), { signal });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return (await res.json()) as T;
}

export async function loadBundle(
  datasetDir: string,
  signal?: AbortSignal,
): Promise<Bundle> {
  const base = `${datasetDir}/normalized`;
  const [beats, timeline, feed, summary] = await Promise.all([
    loadJson<BeatsFile>(`${base}/beats.json`, signal),
    loadJson<TimelineFile>(`${base}/timeline.json`, signal),
    loadJson<FeedItem[]>(`${base}/feed.json`, signal),
    loadJson<Summary>(`${base}/summary.json`, signal),
  ]);
  // history.json is optional (only datasets with a sourced deep-history era).
  let history: HistoryFile | null = null;
  try {
    history = await loadJson<HistoryFile>(`${base}/history.json`, signal);
  } catch {
    history = null;
  }
  // neighborhoods.json is optional (resident-known locator names).
  let neighborhoods: NeighborhoodMap | null = null;
  try {
    neighborhoods = await loadJson<NeighborhoodMap>(
      `${base}/neighborhoods.json`,
      signal,
    );
  } catch {
    neighborhoods = null;
  }
  // points.json is optional (sampled REAL incident coordinates, block-level).
  let points: PointsFile | null = null;
  try {
    points = await loadJson<PointsFile>(`${base}/points.json`, signal);
  } catch {
    points = null;
  }
  // trend.json is optional (full long-arc annual series to the present).
  let trend: TrendFile | null = null;
  try {
    trend = await loadJson<TrendFile>(`${base}/trend.json`, signal);
  } catch {
    trend = null;
  }
  // basemap.json is optional (OSM highways + landmarks for orientation).
  let basemap: BasemapFile | null = null;
  try {
    basemap = await loadJson<BasemapFile>(`${base}/basemap.json`, signal);
  } catch {
    basemap = null;
  }
  return { beats, timeline, feed, summary, history, neighborhoods, points, trend, basemap };
}

// ---- Projection ----------------------------------------------------------
// Fit beat-polygon bounds into a target rect, preserving aspect with a
// cos(latitude) correction (equirectangular; extent is tiny so distortion is
// negligible). Pure + deterministic.

export interface Projection {
  project: (lng: number, lat: number) => [number, number];
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number };
}

export function makeProjection(
  beats: BeatsFile,
  rect: { x: number; y: number; w: number; h: number },
  pad = 0,
): Projection {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  for (const b of Object.values(beats.beats)) {
    for (const ring of b.polygon) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  const midLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const geoW = (maxLng - minLng) * cosLat;
  const geoH = maxLat - minLat;
  const innerW = rect.w - pad * 2;
  const innerH = rect.h - pad * 2;
  const scale = Math.min(innerW / geoW, innerH / geoH);
  // center the projected map inside the rect
  const drawnW = geoW * scale;
  const drawnH = geoH * scale;
  const offX = rect.x + pad + (innerW - drawnW) / 2;
  const offY = rect.y + pad + (innerH - drawnH) / 2;

  const project = (lng: number, lat: number): [number, number] => {
    const px = offX + (lng - minLng) * cosLat * scale;
    const py = offY + (maxLat - lat) * scale; // flip Y (north up)
    return [px, py];
  };
  return { project, bounds: { minLng, minLat, maxLng, maxLat } };
}

export function polygonToPath(
  beat: Beat,
  project: (lng: number, lat: number) => [number, number],
): string {
  let d = "";
  for (const ring of beat.polygon) {
    ring.forEach(([lng, lat], i) => {
      const [x, y] = project(lng, lat);
      d += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)} `;
    });
    d += "Z ";
  }
  return d.trim();
}

// ---- Aggregation helpers (deterministic, frame-driven) -------------------

export function zeroCounts(): CatCounts {
  return { persons: 0, property: 0, society: 0, other: 0 };
}

export function addCounts(a: CatCounts, b: CatCounts): CatCounts {
  return {
    persons: a.persons + b.persons,
    property: a.property + b.property,
    society: a.society + b.society,
    other: a.other + b.other,
  };
}

export function totalOf(c: CatCounts): number {
  return c.persons + c.property + c.society + c.other;
}

export function groupATotal(c: CatCounts): number {
  return c.persons + c.property + c.society;
}

export function dominantCat(c: CatCounts, emphasizeGroupA: boolean): string {
  const pool = emphasizeGroupA ? GROUP_A : CATS;
  let best = pool[0] as string;
  let bestV = -1;
  for (const k of pool) {
    if (c[k as keyof CatCounts] > bestV) {
      bestV = c[k as keyof CatCounts];
      best = k;
    }
  }
  return best;
}

// Cumulative counts for a beat through (and including) fractional month index.
// Whole months counted fully; the in-progress month is linearly weighted by
// its fractional part — keeps counters smooth without inventing data.
export function cumulativeAtMonth(
  series: CatCounts[],
  monthFloat: number,
): CatCounts {
  const whole = Math.floor(monthFloat);
  const frac = monthFloat - whole;
  let acc = zeroCounts();
  for (let i = 0; i < whole && i < series.length; i++) {
    acc = addCounts(acc, series[i]);
  }
  if (whole < series.length && frac > 0) {
    const m = series[whole];
    acc = addCounts(acc, {
      persons: m.persons * frac,
      property: m.property * frac,
      society: m.society * frac,
      other: m.other * frac,
    });
  }
  return acc;
}

// Trailing-window count (sum over [monthFloat-window, monthFloat]) for the
// choropleth + symbol size. Smoothly interpolated across the window edge.
export function windowCountAtMonth(
  series: CatCounts[],
  monthFloat: number,
  windowMonths: number,
): CatCounts {
  const end = cumulativeAtMonth(series, monthFloat);
  const startIdx = Math.max(0, monthFloat - windowMonths);
  const start = cumulativeAtMonth(series, startIdx);
  return {
    persons: end.persons - start.persons,
    property: end.property - start.property,
    society: end.society - start.society,
    other: end.other - start.other,
  };
}
