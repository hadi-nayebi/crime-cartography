// FBI UCR / Crime Data Explorer (CDE) historical source for Grand Rapids PD.
//
// Provides REAL annual offense counts (Violent + Property) for 2000–2022, which
// pre-date the granular GRPD NIBRS dataset (2023+). We use these as the honest
// "deep history" era of the video, shown as a labeled monthly AVERAGE
// (annual ÷ 12) — never presented as actual month-by-month or beat-level data.
//
// Agency: Grand Rapids Police Department — ORI MI4143600 (verified via CDE
//         agency/byStateAbbr/MI).
// API:    https://api.usa.gov/crime/fbi/cde/summarized/agency/{ORI}/{offense}
//         Auth via api.data.gov key. DEMO_KEY works but is rate-limited
//         (~30/hr); set FBI_API_KEY for a free higher-limit key.
//
//   node pipeline/sources/fbi-ucr.mjs
//
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const OUT_DIR = resolve(repoRoot, "data/grand-rapids-mi/raw");

const ORI = "MI4143600";
const AGENCY = "Grand Rapids Police Department";
const KEY = process.env.FBI_API_KEY || "DEMO_KEY";
const OFFENSES = ["violent-crime", "property-crime"];
const FROM = "01-2000";
const TO = "12-2022";

async function fetchAnnual(offense) {
  const url = `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/${offense}?from=${FROM}&to=${TO}&API_KEY=${KEY}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url);
    if (r.status === 429) {
      const wait = 2000 * (attempt + 1);
      console.warn(`  rate-limited (${offense}); retry in ${wait}ms…`);
      await new Promise((res) => setTimeout(res, wait));
      continue;
    }
    const j = await r.json();
    const actuals = j?.offenses?.actuals;
    if (!actuals) throw new Error(`${offense}: no actuals in response`);
    const agKey =
      Object.keys(actuals).find((k) => /Grand Rapids/i.test(k)) ||
      Object.keys(actuals).find((k) => !/United States/i.test(k));
    const monthly = actuals[agKey] || {};
    const byYear = {};
    for (const [mk, v] of Object.entries(monthly)) {
      const y = mk.split("-")[1];
      byYear[y] = (byYear[y] || 0) + (Number(v) || 0);
    }
    return byYear;
  }
  throw new Error(
    `${offense}: still rate-limited after retries. Get a free key at ` +
      `https://api.data.gov/signup/ and set FBI_API_KEY.`,
  );
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const series = {};
  for (const off of OFFENSES) {
    process.stdout.write(`fetching ${off}… `);
    series[off.replace("-crime", "")] = await fetchAnnual(off);
    console.log("ok");
  }
  const out = {
    ori: ORI,
    agency: AGENCY,
    source:
      "FBI Crime Data Explorer (CDE) — summarized agency offense counts",
    sourceUrl: `https://api.usa.gov/crime/fbi/cde/summarized/agency/${ORI}/violent-crime`,
    cdeUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    fetchedAt: new Date().toISOString(),
    span: { from: FROM, to: TO },
    note:
      "Annual totals are real UCR counts. The video animates them as a monthly " +
      "average (annual ÷ 12) and labels them as such; no monthly or beat-level " +
      "detail is implied for 2000–2022.",
    series, // { violent: {YYYY: n}, property: {YYYY: n} }
  };
  writeFileSync(resolve(OUT_DIR, "fbi_ucr.json"), JSON.stringify(out, null, 2));
  console.log(`✓ wrote raw/fbi_ucr.json (${OFFENSES.length} series, 2000–2022)`);
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
