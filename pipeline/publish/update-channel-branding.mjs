#!/usr/bin/env node
/**
 * Apply Crime Cartography channel-level branding from
 * experiment/channel/branding.json.
 *
 *   node pipeline/publish/update-channel-branding.mjs
 *
 * Sets: channel description + keywords (channels.update brandingSettings),
 * banner (channelBanners.insert → bannerExternalUrl), and homepage sections
 * (channelSections.insert for configured playlists, skipped if present).
 * Idempotent + reproducible: the config file is the record; re-running applies
 * the same state. NOT API-accessible (owner does in Studio): channel name,
 * handle, avatar, and the unsubscribed trailer (needs a public video anyway).
 *
 * Auth: the channel-scoped active connection must resolve to the owner-locked
 * Crime Cartography destination. Legacy shared-token files are not accepted.
 */
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createYoutubeDestinationAuth } from "../auth/youtube-destination-auth.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const cfg = JSON.parse(await readFile(join(ROOT, "experiment/channel/branding.json"), "utf8"));

const destinationAuth = createYoutubeDestinationAuth({
  secretsDirectory: join(ROOT, ".secrets"),
});
const { accessToken: access_token, channel: authorizedChannel } =
  await destinationAuth.authorizeMutation();
console.log(`destination verified: ${authorizedChannel.title} (${authorizedChannel.id})`);
const H = { Authorization: `Bearer ${access_token}` };
const HJ = { ...H, "Content-Type": "application/json" };

// current channel state (merge, never clobber)
const chR = await fetch("https://www.googleapis.com/youtube/v3/channels?part=brandingSettings,snippet&mine=true", { headers: H });
const ch = (await chR.json()).items?.[0];
if (!ch) throw new Error("no channel for this token");
console.log(`channel: ${ch.snippet.title} (${ch.id})`);

// 1. banner upload
let bannerUrl = null;
if (cfg.bannerPath) {
  const img = await readFile(join(ROOT, cfg.bannerPath));
  const bR = await fetch("https://www.googleapis.com/upload/youtube/v3/channelBanners/insert?uploadType=media", {
    method: "POST",
    headers: { ...H, "Content-Type": "image/jpeg", "Content-Length": String(img.length) },
    body: img,
  });
  const bJ = await bR.json();
  if (!bR.ok) throw new Error(`banner upload failed: ${JSON.stringify(bJ).slice(0, 300)}`);
  bannerUrl = bJ.url;
  console.log(`banner uploaded: ${bannerUrl.slice(0, 80)}…`);
}

// 2. brandingSettings update (description + keywords + banner)
const bs = ch.brandingSettings ?? {};
bs.channel = { ...(bs.channel ?? {}), description: cfg.description, keywords: cfg.keywords };
if (bannerUrl) bs.image = { ...(bs.image ?? {}), bannerExternalUrl: bannerUrl };
const uR = await fetch("https://www.googleapis.com/youtube/v3/channels?part=brandingSettings", {
  method: "PUT",
  headers: HJ,
  body: JSON.stringify({ id: ch.id, brandingSettings: bs }),
});
if (!uR.ok) throw new Error(`channels.update failed: ${(await uR.text()).slice(0, 300)}`);
console.log("✓ description + keywords + banner applied");

// 3. homepage sections for configured playlists (skip if already present)
const playlists = JSON.parse(await readFile(join(ROOT, "experiment/channel/playlists.json"), "utf8")).formats ?? {};
const sR = await fetch("https://www.googleapis.com/youtube/v3/channelSections?part=snippet,contentDetails&mine=true", { headers: H });
const sections = (await sR.json()).items ?? [];
for (const want of cfg.sections ?? []) {
  const pl = playlists[want.playlistKey];
  if (!pl?.id) { console.log(`- section skipped: no playlist for key "${want.playlistKey}"`); continue; }
  const already = sections.some((s) => (s.contentDetails?.playlists ?? []).includes(pl.id));
  if (already) { console.log(`= section exists for "${pl.title}"`); continue; }
  const iR = await fetch("https://www.googleapis.com/youtube/v3/channelSections?part=snippet,contentDetails", {
    method: "POST",
    headers: HJ,
    body: JSON.stringify({ snippet: { type: want.type ?? "singlePlaylist", position: want.position ?? 0 }, contentDetails: { playlists: [pl.id] } }),
  });
  const iJ = await iR.json();
  if (!iR.ok) console.log(`✗ section insert failed for "${pl.title}": ${JSON.stringify(iJ).slice(0, 200)}`);
  else console.log(`+ section created: "${pl.title}"`);
}
console.log("done — verify at youtube.com/channel/" + ch.id);
