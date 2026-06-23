// Normalize the FBI UCR raw pull (raw/fbi_ucr.json) into the committed
// normalized/history.json that the surface reads for the 2000–2022 "deep
// history" era. Output is intentionally coarse + clearly labeled: annual real
// counts only, to be animated as a monthly average. No fabricated granularity.
//
//   node pipeline/normalize-history.mjs grand-rapids-mi
//
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const slug = process.argv[2] || "grand-rapids-mi";
const dir = resolve(repoRoot, "data", slug);

const raw = JSON.parse(readFileSync(resolve(dir, "raw/fbi_ucr.json"), "utf8"));

const years = Object.keys(raw.series.violent)
  .map(Number)
  .sort((a, b) => a - b);

const rows = years.map((y) => {
  const violent = raw.series.violent[String(y)] ?? 0;
  const property = raw.series.property[String(y)] ?? 0;
  return { year: y, violent, property, total: violent + property };
});

const out = {
  era: "history",
  taxonomy: "FBI UCR Summary (Violent + Property) — distinct from the NIBRS categories used from 2023",
  agency: raw.agency,
  ori: raw.ori,
  source: raw.source,
  sourceUrl: raw.sourceUrl,
  cdeUrl: raw.cdeUrl,
  fetchedAt: raw.fetchedAt,
  presentation: "monthly-average", // surface animates annual ÷ 12, labeled "annual average"
  note: raw.note,
  yearMin: years[0],
  yearMax: years[years.length - 1],
  // category colors reused from the main palette for visual continuity, but
  // labeled honestly as UCR Violent/Property (not NIBRS persons/property).
  cats: {
    violent: { label: "UCR Violent (murder, rape, robbery, agg. assault)", color: "#ff2e63" },
    property: { label: "UCR Property (burglary, larceny, MV theft)", color: "#ffc233" },
  },
  years: rows,
};

writeFileSync(resolve(dir, "normalized/history.json"), JSON.stringify(out, null, 2));

const totV = rows.reduce((s, r) => s + r.violent, 0);
const totP = rows.reduce((s, r) => s + r.property, 0);
console.log(
  `✓ history.json — ${rows.length} years (${out.yearMin}–${out.yearMax}), ` +
    `${totV.toLocaleString()} violent + ${totP.toLocaleString()} property (real UCR annual totals)`,
);
