import type { Bundle, CatCounts } from "./types";
import {
  groupATotal,
  totalOf,
  windowCountAtMonth,
  zeroCounts,
  addCounts,
} from "./load";

// ---- Rate helpers (honest trend, NOT cumulative) -------------------------
// A cumulative line always rises and hides whether crime is actually going up
// or down. These express activity as a true PER-WEEK rate so the under-map line
// reads as a real trend.

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  if (m === 2 && ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) return 29;
  return DAYS_PER_MONTH[(m - 1) % 12] ?? 30;
}

// Group A incidents per week for each month — monthly count scaled to a 7-day
// week using that month's real length. No annualizing, no smoothing of future.
export function weeklyGroupARates(
  cityMonthly: CatCounts[],
  months: string[],
): number[] {
  return cityMonthly.map(
    (c, i) => (groupATotal(c) * 7) / daysInMonth(months[i] ?? "2023-01"),
  );
}

// Per-week rate for one category, per month.
export function weeklyCatRates(
  cityMonthly: CatCounts[],
  months: string[],
  cat: keyof CatCounts,
): number[] {
  return cityMonthly.map(
    (c, i) => (c[cat] * 7) / daysInMonth(months[i] ?? "2023-01"),
  );
}

// Trailing-window trend for a beat: this window's Group A rate vs the prior
// window's. dir = +1 rising (worse), -1 falling (better, green), 0 ~flat.
export function beatTrend(
  series: CatCounts[],
  monthFloat: number,
  windowMonths: number,
): { now: number; prev: number; dir: 1 | 0 | -1 } {
  const now = groupATotal(windowCountAtMonth(series, monthFloat, windowMonths));
  const prev = groupATotal(
    windowCountAtMonth(series, Math.max(0, monthFloat - windowMonths), windowMonths),
  );
  let dir: 1 | 0 | -1 = 0;
  if (prev <= 0 && now <= 0) dir = 0;
  else if (now > prev * 1.08) dir = 1;
  else if (now < prev * 0.92) dir = -1;
  return { now, prev, dir };
}

export interface BeatStat {
  key: string;
  centroid: [number, number];
  series: CatCounts[];
  groupATotalAll: number; // Group A over the whole period
  allTotal: number; // every category over the whole period
  catTotalsAll: CatCounts; // per-category over the whole period (stable dot mix)
}

export interface HoodStat {
  name: string; // official City neighborhood name (resident-known)
  beatKeys: string[]; // member beats whose centroid falls in this neighborhood
  series: CatCounts[]; // summed per-month counts across member beats
  groupATotalAll: number;
  allTotal: number; // every category over the whole period
}

export interface Stats {
  months: string[];
  beats: BeatStat[];
  ranking: BeatStat[]; // by groupATotalAll desc
  hoods: HoodStat[];
  hoodRanking: HoodStat[]; // hoods WITH data, by groupATotalAll desc (see below)
  hoodNoDataCount: number; // hoods excluded from hoodRanking (zero records joined)
  maxWindowMetric: number; // max trailing-window metric across beats — stable scale
  cityMonthly: CatCounts[]; // city-wide per-month counts (for the chart)
  cityCumulative: CatCounts[]; // city-wide cumulative per month
  grandTotalGroupA: number;
  grandTotalAll: number;
}

// Resident-known name for a beat key (falls back to the key itself).
export function hoodName(
  neighborhoods: Bundle["neighborhoods"],
  key: string,
): string {
  return neighborhoods?.map[key]?.name ?? key;
}

// Metric driving choropleth + symbol size. Group A when emphasized, else total.
export function beatMetric(c: CatCounts, emphasizeGroupA: boolean): number {
  return emphasizeGroupA ? groupATotal(c) : totalOf(c);
}

export function deriveStats(
  bundle: Bundle,
  windowMonths: number,
  emphasizeGroupA: boolean,
): Stats {
  const { timeline } = bundle;
  const months = timeline.months;
  const beatKeys = Object.keys(timeline.cells);

  const beats: BeatStat[] = beatKeys.map((key) => {
    const series = timeline.cells[key];
    const beatMeta = bundle.beats.beats[key];
    let gA = 0,
      all = 0;
    const catTotalsAll: CatCounts = {
      persons: 0,
      property: 0,
      society: 0,
      other: 0,
    };
    for (const m of series) {
      gA += groupATotal(m);
      all += totalOf(m);
      catTotalsAll.persons += m.persons;
      catTotalsAll.property += m.property;
      catTotalsAll.society += m.society;
      catTotalsAll.other += m.other;
    }
    return {
      key,
      centroid: beatMeta ? beatMeta.centroid : [0, 0],
      series,
      groupATotalAll: gA,
      allTotal: all,
      catTotalsAll,
    };
  });

  // Stable scale: largest trailing-window metric any beat reaches, sampled at
  // each integer month. Used so symbol radii/choropleth are comparable in time.
  let maxWindowMetric = 1;
  for (const b of beats) {
    for (let i = 0; i <= months.length; i++) {
      const w = windowCountAtMonth(b.series, i, windowMonths);
      const m = beatMetric(w, emphasizeGroupA);
      if (m > maxWindowMetric) maxWindowMetric = m;
    }
  }

  // City-wide monthly + cumulative series (for the timeline chart).
  const cityMonthly: CatCounts[] = months.map((_, i) => {
    let acc = zeroCounts();
    for (const b of beats) acc = addCounts(acc, b.series[i]);
    return acc;
  });
  const cityCumulative: CatCounts[] = [];
  let run = zeroCounts();
  for (const m of cityMonthly) {
    run = addCounts(run, m);
    cityCumulative.push({ ...run });
  }

  const ranking = [...beats].sort(
    (a, b) => b.groupATotalAll - a.groupATotalAll,
  );

  // Neighborhood-level aggregation — the honest unit for "which neighborhood is
  // safest/busiest", summing the beats whose centroid falls inside each one.
  const hoodMap = bundle.neighborhoods?.map ?? {};
  const byName = new Map<string, HoodStat>();
  for (const b of beats) {
    const name = hoodMap[b.key]?.name ?? b.key;
    let h = byName.get(name);
    if (!h) {
      h = {
        name,
        beatKeys: [],
        series: months.map(() => zeroCounts()),
        groupATotalAll: 0,
        allTotal: 0,
      };
      byName.set(name, h);
    }
    h.beatKeys.push(b.key);
    for (let i = 0; i < months.length; i++) {
      h.series[i] = addCounts(h.series[i], b.series[i]);
    }
    h.groupATotalAll += b.groupATotalAll;
    h.allTotal += b.allTotal;
  }
  const hoods = [...byName.values()];
  // Ranking used for every "busiest"/"safest" claim (quiz + reveal). A polygon
  // with ZERO records of ANY category across the window is a no-data region —
  // typically a name-join artifact (source records use a variant name with no
  // official polygon) — not a safe place. Ranking it "safest: 0" would be a
  // fabricated claim, so no-data hoods are excluded here and the exclusion is
  // disclosed in the Reveal caveat via hoodNoDataCount.
  const hoodRanking = hoods
    .filter((h) => h.allTotal > 0)
    .sort((a, b) => b.groupATotalAll - a.groupATotalAll);
  const hoodNoDataCount = hoods.length - hoodRanking.length;

  const grandTotalGroupA = beats.reduce((s, b) => s + b.groupATotalAll, 0);
  const grandTotalAll = beats.reduce((s, b) => s + b.allTotal, 0);

  return {
    months,
    beats,
    ranking,
    hoods,
    hoodRanking,
    hoodNoDataCount,
    maxWindowMetric,
    cityMonthly,
    cityCumulative,
    grandTotalGroupA,
    grandTotalAll,
  };
}

// Map a fraction [0,1] across the whole-period timeline to a month-float in
// [0, months]. monthFloat===months means "every month counted" (used at the
// reveal/close freeze).
export function sweepMonthFloat(
  frame: number,
  fps: number,
  sweepStartSec: number,
  sweepEndSec: number,
  monthCount: number,
): number {
  const sec = frame / fps;
  if (sec <= sweepStartSec) return 0;
  if (sec >= sweepEndSec) return monthCount;
  const p = (sec - sweepStartSec) / (sweepEndSec - sweepStartSec);
  return p * monthCount;
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function monthLabel(ym: string): { mon: string; year: string } {
  const [y, m] = ym.split("-");
  const names = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  return { mon: names[Number(m) - 1] ?? m, year: y };
}
