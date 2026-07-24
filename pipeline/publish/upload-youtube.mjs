#!/usr/bin/env node
/**
 * Upload a finished video to YouTube from its per-video directory.
 *
 *   node pipeline/publish/upload-youtube.mjs <slug> [--public]
 *
 * Reads  videos/<slug>/youtube.json  (title, description, tags, categoryId)
 * and the mp4 named in videos/<slug>/render.lock.json. Uploads PRIVATE by
 * default (--public only after the owner's explicit go). On success writes
 * videoId/url/uploadedAt back into youtube.json — the per-video directory
 * stays the single source of truth mirroring the YouTube listing.
 *
 * Auth: the channel-scoped active connection must resolve to the separately
 * owner-locked Crime Cartography destination. Legacy shared-token files are
 * never accepted.
 */
import { readFile, writeFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createYoutubeDestinationAuth } from "../auth/youtube-destination-auth.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const slug = process.argv[2];
const makePublic = process.argv.includes("--public");
if (!slug) { console.error("usage: node pipeline/publish/upload-youtube.mjs <slug> [--public]"); process.exit(1); }

const dir = join(ROOT, "videos", slug);
const meta = JSON.parse(await readFile(join(dir, "youtube.json"), "utf8"));
const lock = JSON.parse(await readFile(join(dir, "render.lock.json"), "utf8"));
const mp4 = join(dir, lock.output);
const size = (await stat(mp4)).size;
if (meta.videoId) {
  console.error(`✗ ${slug} already has videoId ${meta.videoId} (${meta.url}) — refusing to double-upload.`);
  process.exit(1);
}

// Fail closed unless the exact token used for this mutation is the active,
// channel-scoped token and resolves to the owner-locked destination.
const destinationAuth = createYoutubeDestinationAuth({
  secretsDirectory: join(ROOT, ".secrets"),
});
const { accessToken: access_token, channel } = await destinationAuth.authorizeMutation();
console.log(`destination verified: ${channel.title} (${channel.id})`);

// ---- resumable upload: init ----
const body = {
  snippet: {
    title: meta.title,
    description: meta.description,
    tags: meta.tags,
    categoryId: meta.categoryId ?? "27",
  },
  status: {
    privacyStatus: makePublic ? "public" : (meta.privacyStatus ?? "private"),
    selfDeclaredMadeForKids: false,
  },
};
console.log(`uploading ${slug}: ${lock.output} (${(size / 1e6).toFixed(1)} MB) as ${body.status.privacyStatus}…`);
const init = await fetch(
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(size),
      "X-Upload-Content-Type": "video/mp4",
    },
    body: JSON.stringify(body),
  },
);
if (!init.ok) throw new Error(`init failed ${init.status}: ${await init.text()}`);
const uploadUrl = init.headers.get("location");

// ---- resumable upload: send bytes ----
const put = await fetch(uploadUrl, {
  method: "PUT",
  headers: { "Content-Length": String(size), "Content-Type": "video/mp4" },
  body: createReadStream(mp4),
  duplex: "half",
});
if (!put.ok) throw new Error(`upload failed ${put.status}: ${await put.text()}`);
const vid = await put.json();
const url = `https://youtu.be/${vid.id}`;

// ---- write the listing back into the per-video record ----
meta.videoId = vid.id;
meta.url = url;
meta.uploadedAt = new Date().toISOString();
meta.status = body.status.privacyStatus === "public" ? "published" : "uploaded-private";
await writeFile(join(dir, "youtube.json"), JSON.stringify(meta, null, 2));
console.log(`✓ uploaded: ${url} (${meta.status})`);
console.log(`✓ videos/${slug}/youtube.json updated — commit it to complete the record.`);
