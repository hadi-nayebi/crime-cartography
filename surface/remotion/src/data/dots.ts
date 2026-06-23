// Deterministic dot-density sampling. The GRPD data has NO incident
// coordinates, so dots are NOT geolocated — they are evenly sampled WITHIN each
// beat polygon to show *how many* incidents, never *where*. This is disclosed
// on screen. All sampling is seeded (no Math.random) so the render is
// reproducible frame-for-frame.

import type { Beat, CatCounts } from "./types";

// --- seeded RNG (mulberry32) + string hash ---
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ray-casting point-in-polygon against a ring of [lng,lat]
function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Sample up to `n` points inside the beat's outer ring (rejection sampling with
// a deterministic RNG seeded by the beat key).
export function sampleDotsInBeat(beat: Beat, n: number): [number, number][] {
  const ring = beat.polygon[0];
  if (!ring || ring.length < 3) return [];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const rng = mulberry32(hashSeed(beat.key));
  const out: [number, number][] = [];
  let guard = 0;
  const maxGuard = n * 200 + 2000;
  while (out.length < n && guard < maxGuard) {
    guard++;
    const x = minX + rng() * (maxX - minX);
    const y = minY + rng() * (maxY - minY);
    if (pointInRing(x, y, ring)) out.push([x, y]);
  }
  return out;
}

// Assign a stable category to each dot slot, spread evenly via error diffusion
// (Bresenham-style), using the beat's whole-period Group A category mix. Stable
// per slot → dots don't flicker color between frames; only how many are visible
// changes with the trailing window.
export function makeDotCategories(
  count: number,
  mix: { persons: number; property: number; society: number },
): ("persons" | "property" | "society")[] {
  const total = mix.persons + mix.property + mix.society || 1;
  const acc = { persons: 0, property: 0, society: 0 };
  const out: ("persons" | "property" | "society")[] = [];
  for (let k = 0; k < count; k++) {
    acc.persons += mix.persons / total;
    acc.property += mix.property / total;
    acc.society += mix.society / total;
    let pick: "persons" | "property" | "society" = "persons";
    if (acc.property > acc[pick]) pick = "property";
    if (acc.society > acc[pick]) pick = "society";
    acc[pick] -= 1;
    out.push(pick);
  }
  return out;
}

export function groupAOf(c: CatCounts): number {
  return c.persons + c.property + c.society;
}
