#!/usr/bin/env node
/**
 * Build normalized/trend.json — the FULL long-arc annual series from the
 * earliest sourced year to the last COMPLETE year, joining two real measures:
 *
 *   era "fbi":      FBI UCR summarized agency counts (Violent + Property)
 *   era "incident": the city's own police incident data, annual totals
 *
 * The two measures are NOT directly comparable (UCR index crimes vs all
 * police-recorded incidents) — the seam year is recorded and the chart must
 * show it as an explicit labeled measure change. Nothing is interpolated,
 * scaled, or invented; partial current years are excluded.
 *
 *   node pipeline/build-trend.mjs grand-rapids-mi|chicago-il|seattle-wa
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2];
if (!slug) { console.error("usage: node pipeline/build-trend.mjs <slug>"); process.exit(1); }
const NORM = join(ROOT, "data", slug, "normalized");
const KEY = process.env.FBI_API_KEY || "DEMO_KEY";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) {
  for (let a = 0; a < 4; a++) {
    const r = await fetch(url, { headers: { "User-Agent": "crime-cartography" } });
    if (r.status === 429 || r.status >= 500) { await sleep(15000 * (a + 1)); continue; }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }
  throw new Error(`still failing: ${url}`);
}
async function cdeAnnual(ori, offense, from, to) {
  const j = await getJson(
    `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ori}/${offense}?from=${from}&to=${to}&API_KEY=${KEY}`,
  );
  const act = j?.offenses?.actuals ?? {};
  const key = Object.keys(act).find((k) => !/United States/i.test(k));
  const by = {};
  for (const [m, v] of Object.entries(act[key] ?? {})) {
    const y = Number(m.split("-")[1]);
    by[y] = (by[y] ?? 0) + (Number(v) || 0);
  }
  return by;
}
function soda(base, params) {
  const q = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return getJson(`${base}?${q}`);
}
// Paginated Socrata fetch of one row per incident/report id with its EARLIEST
// date — server-side $group dedupes offense/involvement-level rows, min(date)
// bins each incident at its earliest date (the same convention the normalize
// scripts use). Used by citywide trend plans whose sources publish multiple
// rows per incident. Returns Map(id -> earliest ISO date string).
async function sodaGroupMinDate(base, idField, dateField, where) {
  const out = new Map();
  for (let off = 0; ; off += 50000) {
    const rows = await soda(base, {
      "$select": `${idField},min(${dateField}) AS d`,
      "$where": where,
      "$group": idField,
      "$order": idField,
      "$limit": "50000",
      "$offset": String(off),
    });
    for (const r of rows) {
      const id = r[idField];
      if (id == null) continue; // no null ids measured in any source; guard anyway
      const prev = out.get(id);
      if (!prev || r.d < prev) out.set(id, r.d);
    }
    if (rows.length < 50000) break;
  }
  return out;
}
// annual totals from timeline cells; groupAOnly restricts to persons+property+society.
// Also accumulates per-category parts (for the "stacked" composition chart style).
async function timelineAnnual(groupAOnly) {
  const t = JSON.parse(await readFile(join(NORM, "timeline.json")));
  const by = {};
  const parts = {};
  t.months.forEach((m, i) => {
    const y = Number(m.slice(0, 4));
    for (const series of Object.values(t.cells)) {
      const c = series[i];
      const v = groupAOnly
        ? c.persons + c.property + c.society
        : c.persons + c.property + c.society + c.other;
      by[y] = (by[y] ?? 0) + v;
      const p = (parts[y] ??= { persons: 0, property: 0, society: 0, other: 0 });
      p.persons += c.persons; p.property += c.property; p.society += c.society;
      if (!groupAOnly) p.other += c.other;
    }
  });
  // completeness: only years with all 12 months present in the timeline
  const monthsPerYear = {};
  t.months.forEach((m) => { const y = Number(m.slice(0, 4)); monthsPerYear[y] = (monthsPerYear[y] ?? 0) + 1; });
  for (const y of Object.keys(by)) if (monthsPerYear[y] !== 12) { delete by[y]; delete parts[y]; }
  if (groupAOnly) for (const p of Object.values(parts)) delete p.other;
  timelineAnnual.lastParts = parts; // side-channel for plans that want composition
  return by;
}

const PLANS = {
  "grand-rapids-mi": async () => {
    const [v, p] = [
      await cdeAnnual("MI4143600", "violent-crime", "01-1985", "12-2022"),
      (await sleep(3000), await cdeAnnual("MI4143600", "property-crime", "01-1985", "12-2022")),
    ];
    const fbi = {};
    for (let y = 1985; y <= 2022; y++) {
      if (!(v[y] > 0) || !(p[y] > 0)) throw new Error(`GR FBI year ${y} incomplete`);
      fbi[y] = v[y] + p[y];
    }
    const inc = await timelineAnnual(true); // NIBRS Group A only (Local/ordinance excluded)
    return {
      eras: [
        { key: "fbi", label: "FBI UCR — Violent + Property", from: 1985, to: 2022 },
        { key: "incident", label: "GRPD NIBRS — Group A crimes", from: 2023, to: Math.max(...Object.keys(inc).map(Number)) },
      ],
      fbi, inc,
      note: "UCR index crimes (1985–2022) vs NIBRS Group A (2023+) are different measures — compare shapes within an era, not across the seam. Partial current year excluded.",
    };
  },
  "chicago-il": async () => {
    const h = JSON.parse(await readFile(join(NORM, "history.json")));
    const fbi = {};
    for (const y of h.years) if (y.year <= 2000) fbi[y.year] = y.total;
    const extra = await soda("https://data.cityofchicago.org/resource/ijzp-q8t2.json", {
      "$select": "year,count(*) AS n", "$where": "year in('2001','2002')", "$group": "year",
    });
    const inc = await timelineAnnual(false); // all recorded incidents
    for (const r of extra) inc[Number(r.year)] = Number(r.n);
    return {
      eras: [
        { key: "fbi", label: "FBI UCR — Violent + Property", from: 1986, to: 2000 },
        { key: "incident", label: "CPD — all recorded incidents", from: 2001, to: Math.max(...Object.keys(inc).map(Number)) },
      ],
      fbi, inc,
      note: "UCR index crimes (1986–2000) vs all CPD-recorded incidents (2001+) are different measures — the step at the seam is the measure changing, not a crime wave. Partial current year excluded.",
    };
  },
  "seattle-wa": async () => {
    const h = JSON.parse(await readFile(join(NORM, "history.json")));
    const fbi = {};
    for (const y of h.years) if (y.year <= 2007) fbi[y.year] = y.total;
    const extra = await soda("https://data.seattle.gov/resource/tazs-3rd5.json", {
      "$select": "date_extract_y(offense_date) AS y,count(*) AS n",
      "$where": "offense_date between '2008-01-01T00:00:00' and '2016-12-31T23:59:59'",
      "$group": "y", "$order": "y",
    });
    const inc = await timelineAnnual(false); // all recorded offenses
    for (const r of extra) inc[Number(r.y)] = Number(r.n);
    return {
      eras: [
        { key: "fbi", label: "FBI UCR — Violent + Property", from: 1985, to: 2007 },
        { key: "incident", label: "SPD — all recorded offenses", from: 2008, to: Math.max(...Object.keys(inc).map(Number)) },
      ],
      fbi, inc,
      note: "UCR index crimes (1985–2007) vs all SPD-recorded offenses (2008+) are different measures — the step at the seam is the measure changing, not a crime wave. Partial current year excluded.",
    };
  },
};

// Generic plan for cities whose history.json already spans exactly the FBI era
// (ends at seam−1) and whose incident era comes fully from the timeline.
// groupAOnly=true excludes the dataset's "other" bucket (e.g. service records)
// from the incident-era annual totals — the era label must say so.
// cfg options:
//   groupAOnly      restrict incident-era annual totals to persons+property+society
//   incidentLabel   era-2 legend label
//   extraNote       appended to the honesty note
//   extendFbi {ori,toYear}  fetch ADDITIONAL real FBI UCR years past history.json's
//                   yearMax straight from CDE (SAME ORI/series as the builder used,
//                   so magnitudes are identical) to close a one-year seam gap — used
//                   only where the extra year is a genuine COMPLETE full-year value.
//   allowSeamGap    the incident era starts >1 year after the FBI era ends and the
//                   intervening year(s) have NO comparable full-year total (e.g. the
//                   agency's FBI submissions were incomplete during its NIBRS
//                   transition). The gap years are OMITTED (never interpolated) and
//                   disclosed on-chart + in PROVENANCE. Set with `seamGapReason`.
//   seamGapReason   verbatim disclosure of WHY the seam has a hole
//   artifactYears   sourced years WITHIN an era whose reported total is a known
//                   reporting artifact (e.g. an incomplete UCR submission showing
//                   a false near-zero). Listed years are OMITTED from the series
//                   (never corrected or interpolated), recorded in trend.json and
//                   disclosed on-chart + in PROVENANCE. Set with `artifactReason`.
//   artifactReason  verbatim disclosure of WHY the artifact year(s) are excluded
function genericPlan(cfg) {
  return async () => {
    const h = JSON.parse(await readFile(join(NORM, "history.json")));
    const fbi = {};
    const parts = {};
    for (const y of h.years) {
      fbi[y.year] = y.total;
      parts[y.year] = { violent: y.violent, property: y.property };
    }
    let fbiTo = h.yearMax;
    if (cfg.extendFbi) {
      const { ori, toYear } = cfg.extendFbi;
      const v = await cdeAnnual(ori, "violent-crime", `01-${h.yearMax + 1}`, `12-${toYear}`);
      await sleep(3000);
      const p = await cdeAnnual(ori, "property-crime", `01-${h.yearMax + 1}`, `12-${toYear}`);
      for (let y = h.yearMax + 1; y <= toYear; y++) {
        if (!(v[y] > 0) || !(p[y] > 0)) throw new Error(`${slug} extendFbi year ${y} incomplete (v=${v[y]} p=${p[y]})`);
        fbi[y] = v[y] + p[y];
        parts[y] = { violent: v[y], property: p[y] };
      }
      fbiTo = toYear;
    }
    const inc = await timelineAnnual(cfg.groupAOnly);
    Object.assign(parts, timelineAnnual.lastParts ?? {});
    const incFrom = Math.min(...Object.keys(inc).map(Number));
    const incTo = Math.max(...Object.keys(inc).map(Number));
    return {
      eras: [
        { key: "fbi", label: "FBI UCR — Violent + Property", from: h.yearMin, to: fbiTo },
        { key: "incident", label: cfg.incidentLabel, from: incFrom, to: incTo },
      ],
      fbi,
      inc,
      parts,
      allowSeamGap: !!cfg.allowSeamGap,
      seamGapReason: cfg.seamGapReason,
      artifactYears: cfg.artifactYears ?? [],
      artifactReason: cfg.artifactReason,
      note:
        `UCR index crimes (${h.yearMin}–${fbiTo}) vs ${cfg.incidentLabel} (${incFrom}+) are ` +
        "different measures — compare shapes within an era, not across the seam. " +
        "Partial current year excluded." +
        (incFrom > fbiTo + 1
          ? ` Years ${fbiTo + 1}–${incFrom - 1} are omitted: ${cfg.seamGapReason ?? "no comparable full-year total exists"}.`
          : "") +
        (cfg.artifactYears?.length
          ? ` Year${cfg.artifactYears.length > 1 ? "s" : ""} ${cfg.artifactYears.join(", ")} omitted as a disclosed reporting artifact: ${cfg.artifactReason}.`
          : "") +
        (cfg.extraNote ? ` ${cfg.extraNote}` : ""),
    };
  };
}
PLANS["washington-dc"] = genericPlan({
  groupAOnly: false,
  incidentLabel: "MPD — reported crime incidents",
});
PLANS["san-francisco-ca"] = genericPlan({
  groupAOnly: false,
  incidentLabel: "SFPD — all recorded incidents",
});
PLANS["boston-ma"] = genericPlan({
  groupAOnly: true,
  incidentLabel: "BPD — crime reports (service records excluded)",
  extraNote: "Boston's incident file mixes in non-crime service records; the trend counts crime categories only (persons+property+society).",
});
// Philadelphia: the trend must be CITYWIDE from the source — the timeline's
// placed cells exclude ~200k records from districts retired in later mergers
// (concentrated in early years), which would understate the decline.
PLANS["philadelphia-pa"] = async () => {
  const h = JSON.parse(await readFile(join(NORM, "history.json")));
  const fbi = {};
  for (const y of h.years) fbi[y.year] = y.total;
  const sql =
    "SELECT date_part('year',dispatch_date::date) AS y, count(*) AS n FROM incidents_part1_part2 " +
    "WHERE dispatch_date::date >= '2006-01-01' AND dispatch_date::date < '2026-01-01' GROUP BY 1 ORDER BY 1";
  const j = await getJson(`https://phl.carto.com/api/v2/sql?q=${encodeURIComponent(sql)}`);
  const inc = {};
  for (const r of j.rows) inc[Number(r.y)] = Number(r.n);
  return {
    eras: [
      { key: "fbi", label: "FBI UCR — Violent + Property", from: h.yearMin, to: h.yearMax },
      { key: "incident", label: "PPD — all recorded offenses", from: 2006, to: 2025 },
    ],
    fbi,
    inc,
    note:
      `UCR index crimes (${h.yearMin}–${h.yearMax}) vs all PPD-recorded offenses (2006+) are different ` +
      "measures — compare shapes within an era, not across the seam. Citywide totals include districts " +
      "retired in later boundary mergers. Partial current year excluded.",
  };
};
// San Francisco: citywide annuals fetched per source — the ~58k no-location
// rows exist only in the 2018+ dataset, so placed-only annuals would
// understate recent years relative to 2003–2017.
PLANS["san-francisco-ca"] = async () => {
  const h = JSON.parse(await readFile(join(NORM, "history.json")));
  const fbi = {};
  for (const y of h.years) fbi[y.year] = y.total;
  const inc = {};
  const tm = await soda("https://data.sfgov.org/resource/tmnf-yvry.json", {
    "$select": "date_extract_y(date) AS y,count(*) AS n",
    "$where": "date >= '2003-01-01T00:00:00' AND date < '2018-01-01T00:00:00'",
    "$group": "y", "$order": "y",
  });
  for (const r of tm) inc[Number(r.y)] = Number(r.n);
  const wg = await soda("https://data.sfgov.org/resource/wg3w-h783.json", {
    "$select": "date_extract_y(incident_datetime) AS y,count(*) AS n",
    "$where": "incident_datetime >= '2018-01-01T00:00:00' AND incident_datetime < '2026-01-01T00:00:00'",
    "$group": "y", "$order": "y",
  });
  for (const r of wg) inc[Number(r.y)] = Number(r.n);
  return {
    eras: [
      { key: "fbi", label: "FBI UCR — Violent + Property", from: h.yearMin, to: h.yearMax },
      { key: "incident", label: "SFPD — all recorded incidents", from: 2003, to: 2025 },
    ],
    fbi,
    inc,
    note:
      `UCR index crimes (${h.yearMin}–${h.yearMax}) vs all SFPD-recorded incidents (2003+) are different ` +
      "measures — compare shapes within an era, not across the seam. Citywide totals include records " +
      "without a mappable location. Partial current year excluded.",
  };
};

PLANS["minneapolis-mn"] = genericPlan({
  groupAOnly: true, // the 'other' bucket contains Shots-Fired Calls that only
  // exist from 2020-07 — a data-availability artifact that must not shape the trend
  incidentLabel: "MPD — NIBRS Group A offenses",
  extraNote:
    "Non-NIBRS context records (e.g. Shots Fired Calls, published only from July 2020) are excluded from the trend.",
});

PLANS["denver-co"] = genericPlan({
  groupAOnly: false, // Denver's 'other' = all-other-crimes: real criminal
  // offenses (a consistent bucket across the whole rolling window) — included
  incidentLabel: "DPD — recorded criminal offenses (incidents)",
  extraNote:
    "Incident era counts deduplicated incidents placed in an official neighborhood (99.9% of all; " +
    "the ~0.1% with no neighborhood are excluded here but disclosed in PROVENANCE). The source " +
    "omits sex-related crimes entirely, while UCR Violent includes rape — one more reason the " +
    "eras are never compared across the seam.",
});


PLANS["atlanta-ga"] = genericPlan({
  groupAOnly: false,
  incidentLabel: "APD — recorded offenses (NIBRS)",
  allowSeamGap: true, // FBI UCR ends 2018; APD's open incident feed starts 2021.
  seamGapReason:
    "Atlanta PD's FBI submissions for 2019 and 2020 were incomplete during its transition to NIBRS " +
    "(CDE returns only partial-year totals for those years — e.g. 2020 ≈ 7,300 vs 2018 ≈ 27,000), so no " +
    "comparable citywide total exists for 2019–2020; those years are left blank rather than shown at a false low",
});
PLANS["detroit-mi"] = genericPlan({ groupAOnly: false, incidentLabel: "DPD — recorded incidents (RMS)" });
// Buffalo: the trend must be CITYWIDE from the source — the timeline's placed
// cells drop the no-neighborhood rows, whose share swings by year (measured at
// the source 2026-07-19: ~0.3–0.8% in 2012–2019 but 6.0–7.7% in 2021–2024 vs
// 1.7% in 2025), so placed-only annuals overstate the recent rebound
// (2022→2025 = +21.7% placed-only vs +14.1% citywide). Rows are incident-level
// (case_number verified unique in the builder) — count(*) is the incident count.
PLANS["buffalo-ny"] = async () => {
  const h = JSON.parse(await readFile(join(NORM, "history.json")));
  const fbi = {};
  const parts = {};
  for (const y of h.years) {
    fbi[y.year] = y.total;
    parts[y.year] = { violent: y.violent, property: y.property };
  }
  const rows = await soda("https://data.buffalony.gov/resource/d6g9-xbgu.json", {
    "$select": "date_extract_y(incident_datetime) AS y,count(*) AS n",
    "$where": "incident_datetime between '2006-01-01T00:00:00' and '2025-12-31T23:59:59'",
    "$group": "y", "$order": "y",
  });
  const inc = {};
  for (const r of rows) inc[Number(r.y)] = Number(r.n);
  return {
    eras: [
      { key: "fbi", label: "FBI UCR — Violent + Property", from: h.yearMin, to: h.yearMax },
      { key: "incident", label: "BPD — reported crimes (10 major types)", from: 2006, to: 2025 },
    ],
    fbi, inc, parts,
    note:
      `UCR index crimes (${h.yearMin}–${h.yearMax}) vs BPD — reported crimes (10 major types) (2006+) are ` +
      "different measures — compare shapes within an era, not across the seam. Partial current year excluded. " +
      "Incident-era totals are citywide from the source, including the ~2% of reports never mapped to a " +
      "neighborhood. Buffalo publishes only ten major crime types — no drug/weapon/vice offenses; a narrower " +
      "incident measure than most cities.",
  };
};
PLANS["baltimore-md"] = genericPlan({
  groupAOnly: false,
  incidentLabel: "BPD — NIBRS Group A (victim-deduped)",
  allowSeamGap: true, // FBI UCR ends 2020; BPD's open NIBRS feed starts 2022.
  seamGapReason:
    "Baltimore PD has a documented FBI/NIBRS reporting gap in 2021 (CDE returns only a partial-year " +
    "total ≈ 13,200 vs 2020 ≈ 28,000), and the city's open NIBRS incident feed begins 2022-01, so no " +
    "comparable full-year total exists for 2021; that year is left blank rather than shown at a false low",
  artifactYears: [1999], // CDE 1999 = 503 total (violent 0 + property 503) between 72,994 (1998) and 66,397 (2000)
  artifactReason:
    "Baltimore's 1999 FBI UCR submission is a broken reporting year (CDE returns violent 0 + property 503 " +
    "= 503 total, between 72,994 in 1998 and 66,397 in 2000) — an incomplete submission, not a real one-year " +
    "crime collapse; the year is omitted rather than drawn as a false crater",
});
// Cincinnati: the trend must be CITYWIDE from the source — the timeline's
// placed cells drop the blank-neighborhood incidents, whose share collapses at
// the 2024-06 RMS cutover (measured at the source 2026-07-19: ~7–8% of
// incidents in 2020–2023 vs ~0.4% in 2025), so placed-only annuals tilt the
// recent shape (2020→2025 = +6.4% placed-only vs ≈flat citywide). Incidents
// are deduplicated across the legacy/current dataset pair by incident number
// (union — the Jun–Nov 2024 cross-set overlap is counted once), binned at each
// incident's earliest occurrence date (datefrom), matching the normalizer.
PLANS["cincinnati-oh"] = async () => {
  const h = JSON.parse(await readFile(join(NORM, "history.json")));
  const fbi = {};
  const parts = {};
  for (const y of h.years) {
    fbi[y.year] = y.total;
    parts[y.year] = { violent: y.violent, property: y.property };
  }
  const ids = new Map(); // incident_no -> earliest datefrom across BOTH sets
  for (const ds of ["8xzn-kpn7", "7aqy-xrv9"]) {
    const m = await sodaGroupMinDate(
      `https://data.cincinnati-oh.gov/resource/${ds}.json`,
      "incident_no", "datefrom",
      "datefrom between '2020-01-01T00:00:00' and '2025-12-31T23:59:59'",
    );
    for (const [id, d] of m) {
      const prev = ids.get(id);
      if (!prev || d < prev) ids.set(id, d);
    }
  }
  const inc = {};
  for (const d of ids.values()) {
    const y = Number(d.slice(0, 4));
    inc[y] = (inc[y] ?? 0) + 1;
  }
  return {
    eras: [
      { key: "fbi", label: "FBI UCR — Violent + Property", from: h.yearMin, to: h.yearMax },
      { key: "incident", label: "CPD — recorded incidents (STARS)", from: 2020, to: 2025 },
    ],
    fbi, inc, parts,
    note:
      `UCR index crimes (${h.yearMin}–${h.yearMax}) vs CPD — recorded incidents (STARS) (2020+) are ` +
      "different measures — compare shapes within an era, not across the seam. Partial current year excluded. " +
      "Incident-era totals are citywide from the source pair, deduplicated by incident number and including " +
      "the ~5% of incidents never mapped to a neighborhood.",
  };
};
// Kansas City: the trend must be CITYWIDE from the source — the timeline's
// placed cells depend on KCPD's published coordinates, whose quality swings
// hard by year (measured at the source 2026-07-19: 2017 has ~29% of reports
// geocoded outside the city box — bad geocodes like out-of-state points; and
// 2019–2021 rows are ~18–24% missing coordinates per PROVENANCE), so
// placed-only annuals draw false craters (2017: 36,471 placed vs 52,554
// citywide reports — citywide 2017 was level with its neighbors). Reports are
// deduplicated by report number within AND across the yearly involvement-level
// datasets, binned at the earliest reporting date, matching the normalizer.
PLANS["kansas-city-mo"] = async () => {
  const h = JSON.parse(await readFile(join(NORM, "history.json")));
  const fbi = {};
  const parts = {};
  for (const y of h.years) {
    fbi[y.year] = y.total;
    parts[y.year] = { violent: y.violent, property: y.property };
  }
  // Same per-year field drift the source builder measured (see
  // pipeline/sources/kansas-city-mo.mjs YEARS): report-number and
  // reporting-date field names vary by dataset.
  const KC = [
    { id: "kbzx-7ehe", rep: "report_no", date: "reported_date" }, // 2015
    { id: "wbz8-pdv7", rep: "report_no", date: "reported_date" }, // 2016
    { id: "98is-shjt", rep: "report_no", date: "reported_date" }, // 2017
    { id: "dmjw-d28i", rep: "report_no", date: "reported_date" }, // 2018
    { id: "pxaa-ahcm", rep: "report_no", date: "reported_date" }, // 2019
    { id: "vsgj-uufz", rep: "report_no", date: "reported_date" }, // 2020
    { id: "w795-ffu6", rep: "report_no", date: "report_date" },   // 2021
    { id: "x39y-7d3m", rep: "report_no", date: "report_date" },   // 2022 (carries stragglers dated 2015–2021)
    { id: "bfyq-5nh6", rep: "report", date: "report_date" },      // 2023
    { id: "isbe-v4d8", rep: "report_no", date: "reported_date" }, // 2024
    { id: "dmnp-9ajg", rep: "report", date: "report_date" },      // 2025
    { id: "f7wj-ckmw", rep: "report", date: "report_date" },      // 2026 (any rows dated ≤2025 bin to their year)
  ];
  const ids = new Map(); // report number -> earliest reporting date across ALL datasets
  for (const d of KC) {
    const m = await sodaGroupMinDate(
      `https://data.kcmo.org/resource/${d.id}.json`,
      d.rep, d.date,
      `${d.date} between '2015-01-01T00:00:00' and '2025-12-31T23:59:59'`,
    );
    for (const [id, dt] of m) {
      const prev = ids.get(id);
      if (!prev || dt < prev) ids.set(id, dt);
    }
  }
  const inc = {};
  for (const dt of ids.values()) {
    const y = Number(dt.slice(0, 4));
    inc[y] = (inc[y] ?? 0) + 1;
  }
  return {
    eras: [
      { key: "fbi", label: "FBI UCR — Violent + Property", from: h.yearMin, to: h.yearMax },
      { key: "incident", label: "KCPD — reported crimes (deduped)", from: 2015, to: 2025 },
    ],
    fbi, inc, parts,
    note:
      `UCR index crimes (${h.yearMin}–${h.yearMax}) vs KCPD — reported crimes (deduped) (2015+) are ` +
      "different measures — compare shapes within an era, not across the seam. Partial current year excluded. " +
      "Incident-era totals are citywide from the source datasets, deduplicated by report number and including " +
      "the ~13% of reports without usable map coordinates.",
  };
};
PLANS["milwaukee-wi"] = genericPlan({ groupAOnly: true, incidentLabel: "MPD — NIBRS Group A offenses",
  // Milwaukee's open incident archive begins 2005-02 (no January 2005), so the
  // first COMPLETE incident year is 2006. FBI history stopped at 2004, leaving a
  // one-year hole. 2005 is a genuine full FBI UCR year (CDE WIMPD0000: violent
  // 6,027 + property 33,377 = 39,404, sitting cleanly between 2004=36,968 and
  // 2006), so we close the seam by extending real FBI history to 2005 — nothing
  // interpolated. Incident era then starts 2006 → fully contiguous.
  extendFbi: { ori: "WIMPD0000", toYear: 2005 },
  extraNote: "Group B / other context records excluded from the trend. FBI UCR history extended to 2005 (real CDE full year) because the city's incident archive begins February 2005." });
PLANS["charlotte-nc"] = genericPlan({ groupAOnly: false, incidentLabel: "CMPD — criminal incidents (NIBRS)" });
PLANS["nashville-tn"] = genericPlan({ groupAOnly: false, incidentLabel: "MNPD — reported incidents (NIBRS)" });
PLANS["dallas-tx"] = genericPlan({ groupAOnly: false, incidentLabel: "DPD — recorded incidents (NIBRS)",
  extraNote: "Source excludes sexual offenses and juvenile cases entirely — disclosed on screen and in provenance." });
PLANS["memphis-tn"] = genericPlan({ groupAOnly: true, incidentLabel: "MPD — NIBRS Group A offenses",
  extraNote: "Group B catch-all records excluded from the trend. Source omits sex crimes and juvenile-specific types." });

const plan = PLANS[slug];
if (!plan) { console.error(`no trend plan for ${slug}`); process.exit(1); }
const { eras, fbi, inc, note, parts = {}, allowSeamGap = false, seamGapReason, artifactYears = [], artifactReason } = await plan();

// Declared artifact years must be real (inside an era) and must carry a reason —
// they are OMITTED below, never corrected or interpolated.
if (artifactYears.length && !artifactReason) throw new Error(`artifactYears set without artifactReason`);
for (const y of artifactYears) {
  const inEra = (y >= eras[0].from && y <= eras[0].to) || (y >= eras[1].from && y <= eras[1].to);
  if (!inEra) throw new Error(`artifact year ${y} outside both eras — remove it`);
}

const years = [];
for (let y = eras[0].from; y <= eras[0].to; y++) {
  if (artifactYears.includes(y)) continue; // disclosed reporting artifact — omitted, never shown at a false value
  if (!(fbi[y] > 0)) throw new Error(`fbi year ${y} missing`);
  years.push({ year: y, total: fbi[y], era: "fbi", ...(parts[y] ? { parts: parts[y] } : {}) });
}
for (let y = eras[1].from; y <= eras[1].to; y++) {
  if (artifactYears.includes(y)) continue;
  if (!(inc[y] > 0)) throw new Error(`incident year ${y} missing`);
  years.push({ year: y, total: inc[y], era: "incident", ...(parts[y] ? { parts: parts[y] } : {}) });
}
// parts (when present) must sum to the year total — composition is honest or absent
for (const yr of years) {
  if (!yr.parts) continue;
  const s = Object.values(yr.parts).reduce((a, b) => a + b, 0);
  if (s !== yr.total) throw new Error(`parts of ${yr.year} sum ${s} ≠ total ${yr.total}`);
}
// The intervening years between the two eras (the seam hole), if any.
const seamGapYears = [];
for (let y = eras[0].to + 1; y < eras[1].from; y++) seamGapYears.push(y);
// Validate contiguity. Gaps WITHIN either era are always fatal, EXCEPT holes
// consisting solely of DECLARED artifactYears (disclosed reporting artifacts —
// omitted on purpose, above). A gap AT the seam is permitted ONLY when the plan
// explicitly declared allowSeamGap (the omitted years have no honest comparable
// total; they are disclosed, never filled). This keeps genuine data holes from
// passing silently.
for (let i = 1; i < years.length; i++) {
  if (years[i].year === years[i - 1].year + 1) continue;
  const atSeam = years[i - 1].era === "fbi" && years[i].era === "incident";
  if (atSeam && allowSeamGap) continue;
  let declaredHole = true;
  for (let y = years[i - 1].year + 1; y < years[i].year; y++) if (!artifactYears.includes(y)) declaredHole = false;
  if (declaredHole) continue;
  throw new Error(`gap at ${years[i].year}`);
}
if (seamGapYears.length && !allowSeamGap) throw new Error(`undeclared seam gap ${seamGapYears.join(",")}`);
if (allowSeamGap && !seamGapYears.length) throw new Error(`allowSeamGap set but eras are contiguous — remove it`);
const out = {
  note,
  fetchedAt: new Date().toISOString(),
  seamYear: eras[1].from,
  eras,
  ...(seamGapYears.length ? { seamGapYears, seamGapReason } : {}),
  ...(artifactYears.length ? { artifactYears, artifactReason } : {}),
  years,
};
await writeFile(join(NORM, "trend.json"), JSON.stringify(out, null, 2));
console.log(
  `✓ ${slug} trend.json: ${years[0].year}–${years[years.length - 1].year} (${years.length} yrs), seam ${out.seamYear}; ` +
  `first ${years[0].total}, seam-1 ${years.find((x) => x.year === out.seamYear - 1)?.total}, seam ${years.find((x) => x.year === out.seamYear)?.total}, last ${years[years.length - 1].total}`,
);
