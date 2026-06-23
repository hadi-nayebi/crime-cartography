// Copy a normalized dataset bundle from the repo's data/<slug>/normalized into
// this Remotion project's public/ folder so staticFile() can load it.
// Source of truth stays in data/; public/data is gitignored & reproducible.
//
//   node scripts/sync-data.mjs grand-rapids-mi
//
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");

const slug = process.argv[2] || "grand-rapids-mi";
const src = resolve(repoRoot, "data", slug, "normalized");
const dest = resolve(__dirname, "..", "public", "data", slug, "normalized");

if (!existsSync(src)) {
  console.error(`✗ source not found: ${src}`);
  console.error(`  run the pipeline first: node pipeline/normalize.mjs ${slug}`);
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`✓ synced ${slug} → public/data/${slug}/normalized`);
