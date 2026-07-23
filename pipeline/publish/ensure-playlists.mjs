#!/usr/bin/env node
/**
 * Ensure the channel's format playlists exist and record their ids.
 *
 *   node pipeline/publish/ensure-playlists.mjs
 *
 * Every published video belongs to exactly one FORMAT playlist (the roadmap:
 * each format is a playlist — city videos, state comparatives, county sweeps,
 * national timelines). This script is idempotent: it reuses an existing
 * playlist with the same title before ever creating one, and writes the
 * id map to experiment/channel/playlists.json — the studio publish flow
 * reads that map to auto-insert each uploaded video.
 *
 * Auth: .secrets/youtube_client_secret.json + .secrets/youtube_token.json.
 * Quota: playlists.list 1 unit; playlists.insert 50 units (only on first run).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "experiment/channel/playlists.json");

// scope (videos/<slug>/config.json .scope, default "city") → playlist.
// Future formats get added here WHEN their first video approaches publish.
const FORMATS = {
  city: {
    title: "US Cities · Crime, Mapped",
    description:
      "Every video: a US city's reported-crime history, mapped from official sources — the FBI Uniform Crime Reporting program joined with the city's own open-data portal. Fully transparent and reproducible: every number on screen is sourced, and the complete code + data pipeline is public at https://github.com/hadi-nayebi/crime-cartography\n\nProduced through a human-directed agentic workflow. If you find an error, open an issue; corrections are part of the record.",
  },
};

const cs = JSON.parse(await readFile(join(ROOT, ".secrets/youtube_client_secret.json"), "utf8"));
const conf = cs.installed ?? cs.web;
const tok = JSON.parse(await readFile(join(ROOT, ".secrets/youtube_token.json"), "utf8"));
const tr = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: conf.client_id,
    client_secret: conf.client_secret,
    refresh_token: tok.refresh_token,
    grant_type: "refresh_token",
  }),
});
const { access_token } = await tr.json();
if (!access_token) throw new Error("could not refresh access token — re-run auth-youtube.mjs");
const H = { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };

// existing playlists on the channel (title → id)
const existing = new Map();
let pageToken = "";
do {
  const r = await fetch(
    `https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ""}`,
    { headers: H },
  );
  const j = await r.json();
  if (!r.ok) throw new Error(`playlists.list failed: ${JSON.stringify(j).slice(0, 300)}`);
  for (const it of j.items ?? []) existing.set(it.snippet.title, it.id);
  pageToken = j.nextPageToken ?? "";
} while (pageToken);

let map = {};
try { map = JSON.parse(await readFile(OUT, "utf8")); } catch {}
map.formats ??= {};

for (const [scope, spec] of Object.entries(FORMATS)) {
  if (map.formats[scope]?.id && existing.get(spec.title) === map.formats[scope].id) {
    console.log(`= ${scope}: "${spec.title}" already recorded (${map.formats[scope].id})`);
    continue;
  }
  let id = existing.get(spec.title);
  if (id) {
    console.log(`= ${scope}: found existing playlist "${spec.title}" (${id}) — reusing`);
  } else {
    const r = await fetch("https://www.googleapis.com/youtube/v3/playlists?part=snippet,status", {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        snippet: { title: spec.title, description: spec.description },
        status: { privacyStatus: "public" },
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`playlists.insert failed: ${JSON.stringify(j).slice(0, 300)}`);
    id = j.id;
    console.log(`+ ${scope}: created playlist "${spec.title}" (${id})`);
  }
  map.formats[scope] = { id, title: spec.title, url: `https://www.youtube.com/playlist?list=${id}`, ensuredAt: new Date().toISOString() };
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(map, null, 2));
console.log(`✓ ${OUT.replace(ROOT + "/", "")} written`);
