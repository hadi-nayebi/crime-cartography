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
// annual totals from timeline cells; groupAOnly restricts to persons+property+society
async function timelineAnnual(groupAOnly) {
  const t = JSON.parse(await readFile(join(NORM, "timeline.json")));
  const by = {};
  t.months.forEach((m, i) => {
    const y = Number(m.slice(0, 4));
    for (const series of Object.values(t.cells)) {
      const c = series[i];
      const v = groupAOnly
        ? c.persons + c.property + c.society
        : c.persons + c.property + c.society + c.other;
      by[y] = (by[y] ?? 0) + v;
    }
  });
  // completeness: only years with all 12 months present in the timeline
  const monthsPerYear = {};
  t.months.forEach((m) => { const y = Number(m.slice(0, 4)); monthsPerYear[y] = (monthsPerYear[y] ?? 0) + 1; });
  for (const y of Object.keys(by)) if (monthsPerYear[y] !== 12) delete by[y];
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

const plan = PLANS[slug];
if (!plan) { console.error(`no trend plan for ${slug}`); process.exit(1); }
const { eras, fbi, inc, note } = await plan();

const years = [];
for (let y = eras[0].from; y <= eras[0].to; y++) {
  if (!(fbi[y] > 0)) throw new Error(`fbi year ${y} missing`);
  years.push({ year: y, total: fbi[y], era: "fbi" });
}
for (let y = eras[1].from; y <= eras[1].to; y++) {
  if (!(inc[y] > 0)) throw new Error(`incident year ${y} missing`);
  years.push({ year: y, total: inc[y], era: "incident" });
}
// validate contiguity across the whole span
for (let i = 1; i < years.length; i++) {
  if (years[i].year !== years[i - 1].year + 1) throw new Error(`gap at ${years[i].year}`);
}
const out = {
  note,
  fetchedAt: new Date().toISOString(),
  seamYear: eras[1].from,
  eras,
  years,
};
await writeFile(join(NORM, "trend.json"), JSON.stringify(out, null, 2));
console.log(
  `✓ ${slug} trend.json: ${years[0].year}–${years[years.length - 1].year} (${years.length} yrs), seam ${out.seamYear}; ` +
  `first ${years[0].total}, seam-1 ${years.find((x) => x.year === out.seamYear - 1)?.total}, seam ${years.find((x) => x.year === out.seamYear)?.total}, last ${years[years.length - 1].total}`,
);
