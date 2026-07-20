#!/usr/bin/env node
/**
 * Crime Cartography production studio — the operations dashboard.
 *
 *   node pipeline/dashboard/server.mjs   →  http://localhost:4400
 *   (installed as systemd user service crime-studio.service — always on)
 *
 * Shows EVERY city at its true production stage (data → trend → basemap →
 * config → music → render → verified → published), the project pulse (latest
 * briefing, commits, decisions, routine health), video playback with
 * timestamped notes, and a project-level notes channel. All feedback lands in
 * repo files; a 5-minute note-watcher routine picks up unresolved notes.
 */
import { createServer } from "node:http";
import { readFile, readdir, stat, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createReadStream, existsSync, statSync } from "node:fs";
import { execFile } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = Number(process.env.PORT || 4400);
const SECRETS = join(ROOT, ".secrets");
const SECRET_PATH = join(SECRETS, "youtube_client_secret.json");
const TOKEN_PATH = join(SECRETS, "youtube_token.json");
const GLOBAL_FEEDBACK = join(ROOT, "experiment/studio-feedback.json");
const OAUTH_SCOPE =
  "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/yt-analytics.readonly";
const REDIRECT = `http://localhost:${PORT}/oauth/callback`;
const pexec = promisify(execFile);

async function readJson(p, fallback = null) {
  try { return JSON.parse(await readFile(p, "utf8")); } catch { return fallback; }
}
const exists = (p) => existsSync(p);
const mtimeOf = (p) => { try { return statSync(p).mtime.toISOString(); } catch { return null; } };

// ---- stage model -----------------------------------------------------------
// The single source of truth the user sees: where each city REALLY is.
const STAGES = ["data", "trend", "basemap", "config", "music", "render", "verified", "published"];
// Confidence rubric (experiment/confidence.json _rubric): score is out of 100,
// and 100 is required to publish. Used as the attention-sort's "how far from
// ready" reference so a low ledger score raises a city's priority.
const PUBLISH_BAR = 100;

// Each video in the batch is an experiment point. Its color theme, geographic
// scope, and note-placement QA result are metadata the operator scans at a
// glance — surfaced as card badges (icon-only, label on hover).
function relLuminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}
function themeSummary(cfg) {
  const t = cfg?.theme;
  if (!t) return null;
  const bg = t.colors?.bg ?? null;
  const lum = bg ? relLuminance(bg) : null;
  const cc = t.catColors ?? {};
  return {
    name: t.name ?? null,
    bg,
    mode: lum == null ? null : lum < 0.4 ? "dark" : "light",
    swatch: [cc.persons, cc.property, cc.society].filter(Boolean),
  };
}
// Scope: city | county | state | country. Explicit config.scope wins; default city.
function deriveScope(cfg) {
  const s = (cfg?.scope || "").toLowerCase();
  return ["city", "county", "state", "country"].includes(s) ? s : "city";
}

async function cityRow(slug) {
  const d = join(ROOT, "data", slug);
  const v = join(ROOT, "videos", slug);
  const cfg = await readJson(join(v, "config.json"));
  const yt = (await readJson(join(v, "youtube.json"))) ?? {};
  const lock = await readJson(join(v, "render.lock.json"));
  const conf = null; // filled by caller from the shared ledger
  const fb = (await readJson(join(v, "feedback.json"))) ?? [];
  const qa = await readJson(join(v, "qa.json")); // note-placement review result (or null)
  const summary = await readJson(join(d, "normalized/summary.json"));

  const mp4Name = lock?.output ? join(v, lock.output) : join(v, `out/${slug}.mp4`);
  const hasRender = exists(mp4Name);
  // The operator's latest studio decision is the human sign-off: an APPROVE
  // made on the CURRENT render (not one predating a re-render) flips verified.
  const lastDecision = [...fb].reverse().find((f) => f.kind === "decision");
  const approvedAt = lastDecision && /^APPROVE/.test(lastDecision.text ?? "") ? lastDecision.at : null;
  const stages = {
    data: Boolean(summary),
    trend: exists(join(d, "normalized/trend.json")),
    basemap: exists(join(d, "normalized/basemap.json")),
    config: Boolean(cfg),
    music: exists(join(ROOT, "surface/remotion/public/audio", `${slug}-music-sao.wav`)) ||
           exists(join(ROOT, "surface/remotion/public/audio", `${slug.replace(/-\w\w$/, "")}-music-sao.wav`)),
    render: hasRender,
    verified: false, // flips ONLY on the operator's own fresh APPROVE (below) — never auto
    published: Boolean(yt.url),
  };
  let mp4 = null;
  if (hasRender) {
    const s = await stat(mp4Name);
    mp4 = { bytes: s.size, mtime: s.mtime };
  }
  const approveFresh = Boolean(approvedAt && mp4 && new Date(approvedAt) >= mp4.mtime);
  stages.verified = approveFresh;
  return {
    approval: approvedAt ? { at: approvedAt, fresh: approveFresh } : null,
    slug,
    title: cfg?.title ?? summary?.title ?? slug,
    subtitle: cfg?.subtitle ?? (summary ? `${summary.dateMin?.slice(0,4)}–${summary.dateMax?.slice(0,4)} · ${summary.beatCount} areas · ${(summary.totalRecords ?? 0).toLocaleString()} records` : "no data yet"),
    hook: cfg?.hook?.stat ?? null,
    trendStyle: cfg?.trendStyle ?? null,
    theme: themeSummary(cfg),
    scope: deriveScope(cfg),
    qa: qa?.notePlacement
      ? { status: qa.notePlacement.status ?? "pending", issues: qa.notePlacement.issues ?? [], reviewedAt: qa.notePlacement.reviewedAt ?? null }
      : null,
    stages,
    stageIndex: STAGES.filter((s) => stages[s]).length,
    confidence: conf,
    youtube: { status: yt.status ?? "draft", url: yt.url || null, videoId: yt.videoId || null, uploadedAt: yt.uploadedAt ?? null, playlistTitle: yt.playlistTitle ?? null, privacyStatus: yt.privacyStatus ?? null },
    composedThumb: exists(join(v, "thumbnail.jpg")),
    render: lock ? { renderedAt: lock.renderedAt, durationSec: lock.durationSec, commit: (lock.commit || "").slice(0, 7) } : null,
    mp4,
    feedbackCount: fb.length,
    openFeedback: fb.filter((f) => !f.resolved).length,
    dataMeta: summary ? { records: summary.totalRecords, areas: summary.beatCount, span: `${summary.dateMin ?? "?"} → ${summary.dateMax ?? "?"}`, coverage: summary.coveragePct } : null,
  };
}

// Attention priority: which video should the operator look at first?
// Higher score sorts to the top; `reason` is the single headline driver.
function priorityOf(r) {
  const reasons = [];
  let score = 0;
  if (r.stages.verified && !r.stages.published) { score += 110; reasons.push("approved — ready to publish"); }
  if (r.openFeedback) { score += 100 + r.openFeedback * 5; reasons.push(`${r.openFeedback} open note${r.openFeedback > 1 ? "s" : ""}`); }
  if (r.approval && !r.approval.fresh && r.stages.render && !r.stages.published) { score += 55; reasons.push("re-approve — render is newer than your approval"); }
  if (r.stages.render && !r.stages.published && !r.stages.verified) { score += 60; reasons.push("ready to review"); }
  if (r.qa?.status === "fail") { score += 55; reasons.push(`note placement flagged (${r.qa.issues.length || "?"})`); }
  if (r.stages.data && !r.stages.config) { score += 45; reasons.push("needs config"); }
  if (r.stages.config && !r.stages.render) { score += 30; reasons.push("needs music/render"); }
  // A config'd city with no ledger entry reports zero blockers and null score, so
  // it would otherwise sort blind to readiness. Surface it explicitly as needing
  // its first review rather than letting the silent null hide the gap.
  if (r.stages.config && !r.confidence) { score += 40; reasons.push("awaiting first review — no confidence score yet"); }
  const blk = r.confidence?.blockers?.length ?? 0;
  if (blk) { score += 20 + blk; reasons.push(`${blk} blocker${blk > 1 ? "s" : ""}`); }
  // Confidence SCORE, not just blocker COUNT: a city further below the publish
  // bar needs more attention. Weight scales 1:1 with the gap so a 64/100 city
  // (gap 36) clearly outranks an 88/100 city (gap 12) even at equal blockers —
  // the two used to sort identically because only blocker count was read. Gated
  // to config'd, ledgered, not-yet-published cities (a published video is
  // settled; a no-ledger city is handled by the "awaiting first review" term).
  if (r.stages.config && !r.stages.published && typeof r.confidence?.score === "number") {
    const gap = PUBLISH_BAR - r.confidence.score;
    if (gap > 0) { score += gap; reasons.push(`confidence ${r.confidence.score}/${PUBLISH_BAR} — below bar`); }
  }
  if (r.stages.render && (!r.qa || r.qa.status === "pending")) { score += 12; reasons.push("note-placement QA unreviewed"); }
  if (!reasons.length) reasons.push(r.stages.published ? "settled · published" : "no action needed");
  return { score, reason: reasons[0], reasons };
}

async function catalog() {
  const dirs = new Set();
  for (const base of ["data", "videos"]) {
    try {
      for (const e of await readdir(join(ROOT, base), { withFileTypes: true }))
        if (e.isDirectory() && !e.name.startsWith(".")) dirs.add(e.name);
    } catch {}
  }
  const ledger = (await readJson(join(ROOT, "experiment/confidence.json"))) ?? {};
  const matrix = (await readJson(join(ROOT, "experiment/matrix.json"))) ?? {};
  const rows = [];
  for (const slug of [...dirs].sort()) {
    const row = await cityRow(slug);
    row.confidence = ledger[slug] ?? null;
    row.features = matrix[slug] ?? null;
    // verified is the operator's own light: it flips ONLY on a fresh human
    // APPROVE (computed in cityRow). The confidence ledger is advisory — a high
    // score is shown but NEVER flips verify on its own; the owner must do it.
    row.stageIndex = STAGES.filter((s) => row.stages[s]).length;
    const pr = priorityOf(row); // computed AFTER verified/confidence merge
    row.priority = pr.score;
    row.attention = pr.reason;
    row.attentionAll = pr.reasons;
    rows.push(row);
  }
  // live state for published cards (one batched videos.list, cached): stats +
  // the REAL thumbnail/title/privacy from YouTube, so published videos render
  // from live truth, not the local youtube.json or our composed thumbnail.
  const ids = rows.filter((r) => r.youtube.videoId).map((r) => r.youtube.videoId);
  const stats = await ytStats(ids);
  for (const r of rows) {
    if (!r.youtube.videoId) continue;
    const s = stats[r.youtube.videoId];
    if (!s) continue;
    r.youtube.stats = { views: s.views, likes: s.likes, comments: s.comments, favorites: s.favorites };
    r.youtube.live = {
      title: s.title, thumb: s.thumb, privacyStatus: s.privacyStatus, publishedAt: s.publishedAt,
      durationSec: s.durationSec, definition: s.definition, caption: s.caption, embeddable: s.embeddable,
      license: s.license, madeForKids: s.madeForKids, uploadStatus: s.uploadStatus, categoryId: s.categoryId, tagCount: s.tagCount,
    };
    r.youtube.statsFetchedAt = statsCache.at || null; // so the board can show "live · updated Nm ago"
  }
  return rows;
}

// videos.list snippet+statistics+status for all published ids — the LIVE
// truth: the real thumbnail the operator actually chose on YouTube (often NOT
// our composed one), the live title, and the CURRENT privacy. Published cards
// render from THIS, not the local youtube.json, so a video flipped to public on
// YouTube stops showing here as "private". videos.list is 1 quota unit
// regardless of parts; cached 10 min.
let statsCache = { at: 0, map: {} };
function bestThumb(thumbs) {
  const t = thumbs ?? {};
  return (t.maxres || t.standard || t.high || t.medium || t.default || {}).url ?? null;
}
// ISO-8601 video duration ("PT5M30S") -> seconds, so we can show the real
// on-YouTube length and confirm the upload matches our render.
function iso8601ToSec(d) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d || "");
  return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : null;
}
// One videos.list call (1 quota unit REGARDLESS of parts) returns far more than
// the 3 counters we used to keep — pull every field the Data-API grant exposes:
// full statistics, the real content details (length/quality/captions), and the
// live status flags. Deeper watch-time/CTR/impressions/traffic metrics live in a
// SEPARATE API (youtubeAnalytics) needing the yt-analytics.readonly scope, which
// our OAUTH_SCOPE does not request — surfaced honestly, not faked.
async function ytStats(ids, force = false) {
  if (!ids.length) return {};
  if (!force && Date.now() - statsCache.at < 10 * 60 * 1000) return statsCache.map;
  try {
    const at = await accessToken();
    if (!at) return statsCache.map;
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status,contentDetails&id=${ids.join(",")}`, { headers: { Authorization: `Bearer ${at}` } });
    const j = await r.json();
    if (r.ok) {
      const map = {};
      for (const it of j.items ?? [])
        map[it.id] = {
          views: Number(it.statistics?.viewCount ?? 0),
          likes: Number(it.statistics?.likeCount ?? 0),
          comments: Number(it.statistics?.commentCount ?? 0),
          favorites: Number(it.statistics?.favoriteCount ?? 0),
          title: it.snippet?.title ?? null,
          thumb: bestThumb(it.snippet?.thumbnails),
          privacyStatus: it.status?.privacyStatus ?? null,
          publishedAt: it.snippet?.publishedAt ?? null,
          // richer live truth from the SAME 1-unit call
          durationSec: iso8601ToSec(it.contentDetails?.duration),
          definition: it.contentDetails?.definition ?? null, // "hd" | "sd"
          caption: it.contentDetails?.caption === "true",
          embeddable: it.status?.embeddable ?? null,
          license: it.status?.license ?? null, // "youtube" | "creativeCommon"
          madeForKids: it.status?.madeForKids ?? null,
          uploadStatus: it.status?.uploadStatus ?? null, // "processed" | "uploaded" | "failed"
          categoryId: it.snippet?.categoryId ?? null,
          tagCount: (it.snippet?.tags ?? []).length,
        };
      statsCache = { at: Date.now(), map };
    }
  } catch {}
  return statsCache.map;
}

// Machine-readable live stats for the manager roles/routines — every field the
// authorized YouTube Data API exposes for our published videos, keyed by slug.
// Served at GET /api/stats (add ?fresh=1 to bypass the 10-min cache). Routines
// read THIS instead of scraping the HTML board or re-implementing the OAuth pull.
async function liveStats(force = false) {
  const byId = {};
  const map = {};
  let slugs = [];
  try {
    slugs = (await readdir(join(ROOT, "videos"), { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name);
  } catch {}
  for (const slug of slugs.sort()) {
    const yt = (await readJson(join(ROOT, "videos", slug, "youtube.json"))) ?? {};
    if (yt.videoId) { byId[yt.videoId] = slug; map[slug] = { videoId: yt.videoId, url: yt.url || `https://youtu.be/${yt.videoId}` }; }
  }
  const s = await ytStats(Object.keys(byId), force);
  for (const [id, slug] of Object.entries(byId)) if (s[id]) map[slug] = { ...map[slug], ...s[id] };
  return {
    fetchedAt: statsCache.at ? new Date(statsCache.at).toISOString() : null,
    ageSec: statsCache.at ? Math.round((Date.now() - statsCache.at) / 1000) : null,
    cacheTtlSec: 600,
    source: "YouTube Data API v3 videos.list(part=snippet,statistics,status,contentDetails) — 1 quota unit/call, cached 10min; ?fresh=1 forces a pull",
    deeperMetrics: "watch-time, avg view duration, CTR, impressions, traffic sources & subscriber gains need the youtubeAnalytics API + yt-analytics.readonly scope — NOT in the current grant (see experiment/DECISIONS.md 2026-07-20). Re-authorize to unlock.",
    videos: map,
  };
}

// ---- project pulse ---------------------------------------------------------
async function pulse() {
  let commits = [];
  try {
    const { stdout } = await pexec("git", ["log", "--oneline", "-12", "--format=%h|%ct|%s"], { cwd: ROOT });
    commits = stdout.trim().split("\n").filter(Boolean).map((l) => {
      const [h, ct, ...rest] = l.split("|");
      return { hash: h, when: new Date(Number(ct) * 1000).toISOString(), msg: rest.join("|") };
    });
  } catch {}
  let briefing = null;
  try {
    const files = (await readdir(join(ROOT, "experiment/briefings"))).filter((f) => f.endsWith(".md")).sort();
    if (files.length) {
      const f = files[files.length - 1];
      briefing = { file: f, text: await readFile(join(ROOT, "experiment/briefings", f), "utf8") };
    }
  } catch {}
  let decisions = null;
  try { decisions = await readFile(join(ROOT, "experiment/DECISIONS.md"), "utf8"); } catch {}
  // routine health: last commit containing each routine's signature
  const health = {};
  for (const [key, sig] of [["driver", "driver:"], ["producer", "producer:"], ["briefing", "briefing:"], ["channel", "channel:"], ["harness", "harness:"]]) {
    const hit = commits.find((c) => c.msg.startsWith(sig));
    health[key] = hit ? { last: hit.when, msg: hit.msg } : { last: null };
  }
  const globalFb = (await readJson(GLOBAL_FEEDBACK)) ?? [];
  const active = [];
  try {
    const am = await readFile(join(ROOT, ".claude/memory/jobs/ACTIVE.md"), "utf8");
    for (const line of am.split("\n")) if (line.includes("DRIVER BLOCKED")) active.push(line.trim().slice(0, 200));
  } catch {}
  return {
    now: new Date().toISOString(),
    commits: commits.slice(0, 8),
    briefing,
    decisions,
    health,
    blocked: active,
    globalOpenNotes: globalFb.filter((f) => !f.resolved).length,
  };
}

// ---- feedback --------------------------------------------------------------
async function appendFeedback(file, entry) {
  const list = (await readJson(file)) ?? [];
  list.push(entry);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(list, null, 2));
  return list.length;
}
function fbEntry(body) {
  return {
    at: new Date().toISOString(),
    kind: body.kind === "decision" ? "decision" : "comment",
    videoTime: Number.isFinite(body.videoTime) ? Math.round(body.videoTime * 10) / 10 : null,
    text: String(body.text ?? "").slice(0, 2000),
    resolved: false,
  };
}

// ---- youtube oauth (unchanged behavior) ------------------------------------
function oauthConf(cs) { const c = cs?.installed ?? cs?.web; return c?.client_id && c?.client_secret ? c : null; }
async function accessToken() {
  const conf = oauthConf(await readJson(SECRET_PATH));
  const tok = await readJson(TOKEN_PATH);
  if (!conf || !tok?.refresh_token) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: conf.client_id, client_secret: conf.client_secret, refresh_token: tok.refresh_token, grant_type: "refresh_token" }),
  });
  return (await r.json()).access_token ?? null;
}
async function authStatus() {
  const hasSecret = Boolean(oauthConf(await readJson(SECRET_PATH)));
  const hasToken = Boolean((await readJson(TOKEN_PATH))?.refresh_token);
  let channel = null;
  if (hasSecret && hasToken) {
    try {
      const at = await accessToken();
      if (at) {
        const r = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${at}` } });
        const sn = (await r.json()).items?.[0]?.snippet;
        if (sn) channel = { title: sn.title, thumb: sn.thumbnails?.default?.url ?? null };
      }
    } catch {}
  }
  return { hasSecret, hasToken, channel, redirect: REDIRECT };
}

// ---- publish flow ----------------------------------------------------------
// Thumbnail candidates are REAL frames from the rendered video (honesty: the
// thumbnail can never promise something the video doesn't show). Times span
// the phase layout: hook, method, trend arc, punchline, map, reveal.
const THUMB_TIMES = [4, 45, 110, 155, 210, 290];
const safeName = (s) => typeof s === "string" && /^[\w.-]+$/.test(s) && !s.includes("..");
const PUBLISHING = new Set();

async function mp4Of(slug) {
  const lock = await readJson(join(ROOT, "videos", slug, "render.lock.json"));
  const file = lock?.output ? join(ROOT, "videos", slug, lock.output) : join(ROOT, "videos", slug, `out/${slug}.mp4`);
  return exists(file) ? file : null;
}

async function ensureThumbs(slug, force = false) {
  const mp4 = await mp4Of(slug);
  if (!mp4) return [];
  const dir = join(ROOT, "videos", slug, "thumbs");
  await mkdir(dir, { recursive: true });
  const mp4Time = statSync(mp4).mtimeMs;
  const out = [];
  for (const t of THUMB_TIMES) {
    const name = `t${String(t).padStart(3, "0")}.jpg`;
    const f = join(dir, name);
    // stale candidates (older than the current render) silently re-extract —
    // a re-rendered video must never offer frames of its previous cut
    if (force || !exists(f) || statSync(f).mtimeMs < mp4Time) {
      try {
        await pexec("ffmpeg", ["-ss", String(t), "-i", mp4, "-frames:v", "1", "-vf", "scale=1280:720", "-q:v", "3", "-y", f]);
      } catch {}
    }
    if (exists(f)) out.push(name);
  }
  return out;
}

// Publish gate: every pre-publish light on the stage strip must be green —
// including "verified", which ONLY the operator flips (a fresh APPROVE). Same
// rule the board shows; enforced server-side so no UI path can publish an
// unapproved cut.
async function gateOf(slug) {
  const row = await cityRow(slug); // verified is true ONLY via the operator's fresh human APPROVE
  const ledger = (await readJson(join(ROOT, "experiment/confidence.json"))) ?? {};
  const conf = ledger[slug] ?? null;
  // The confidence ledger is reported for context but NEVER flips verify — the
  // owner's manual approve is the sole verify gate.
  const missing = STAGES.slice(0, 7).filter((s) => !row.stages[s]);
  return { ready: missing.length === 0, missing, confidence: conf?.score ?? null, blockers: conf?.blockers ?? [], approval: row.approval };
}

async function publishPreview(slug) {
  const yt = await readJson(join(ROOT, "videos", slug, "youtube.json"));
  if (!yt) return { error: "no youtube.json — config/publish metadata not authored yet" };
  const auth = await authStatus();
  const playlists = (await readJson(join(ROOT, "experiment/channel/playlists.json")))?.formats ?? {};
  const cfg = await readJson(join(ROOT, "videos", slug, "config.json"));
  const scope = deriveScope(cfg);
  return {
    slug,
    published: Boolean(yt.videoId),
    url: yt.url || null,
    status: yt.status ?? "draft",
    title: yt.title ?? slug,
    titleOptions: Array.isArray(yt.titleOptions) ? yt.titleOptions : [],
    description: yt.description ?? "",
    tags: yt.tags ?? [],
    hasRender: Boolean(await mp4Of(slug)),
    authOk: auth.hasSecret && auth.hasToken,
    channel: auth.channel,
    gate: await gateOf(slug),
    playlist: playlists[scope] ? { title: playlists[scope].title, url: playlists[scope].url } : null,
    thumbs: await ensureThumbs(slug),
    composed: exists(join(ROOT, "videos", slug, "thumbnail.jpg")),
    chosenThumb: yt.thumbnailFrame ?? null,
  };
}

// Push a chosen thumbnail to a live video. The #1 real failure the owner hit
// ("the thumbnail never landed") is a RACE: right after videos.insert the video
// is still PROCESSING on YouTube's side, so thumbnails.set returns a transient
// 404/409/429/5xx — a single silent best-effort call loses the thumbnail and the
// only recovery was a manual trip to YouTube Studio. So retry with backoff.
// 403 (channel not eligible for custom thumbnails) and 400 (bad image) are
// PERMANENT — don't retry those. Never throws; returns a human status string the
// publish surface shows so a miss is loud, not swallowed.
async function applyThumbnail(videoId, jpgPath, { attempts = 3, gapMs = 6000 } = {}) {
  if (!exists(jpgPath)) return { ok: false, status: "no thumbnail.jpg to push" };
  let buf;
  try { buf = await readFile(jpgPath); } catch { return { ok: false, status: "could not read thumbnail.jpg" }; }
  let last = "unknown error";
  for (let i = 0; i < attempts; i++) {
    if (i) await new Promise((r) => setTimeout(r, gapMs * i)); // 0s, then gap, 2×gap…
    try {
      const at = await accessToken();
      if (!at) return { ok: false, status: "YouTube not connected" };
      const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${at}`, "Content-Type": "image/jpeg" },
        body: buf,
      });
      if (r.ok) return { ok: true, status: "set" };
      last = `HTTP ${r.status}`;
      if (r.status === 403) return { ok: false, status: "channel not eligible for custom thumbnails — verify the channel in YouTube Studio, then push again" };
      if (r.status === 400) return { ok: false, status: "YouTube rejected the image (HTTP 400)" };
      // 404/409/429/5xx → video is still processing; fall through and retry
    } catch (e) { last = String(e?.message ?? e).slice(0, 120); }
  }
  return { ok: false, status: `not set yet (${last}) — the video may still be processing; click “Push thumbnail” again in a minute` };
}

// Re-apply the committed thumbnail.jpg to an already-uploaded video — the
// studio-side recovery for the processing race, so the owner can push the chosen
// thumbnail straight from the publish surface AFTER upload instead of setting it
// by hand in YouTube Studio. Idempotent; safe to click repeatedly.
async function pushThumbnail(slug) {
  const ytPath = join(ROOT, "videos", slug, "youtube.json");
  const yt = await readJson(ytPath);
  if (!yt) return [400, { error: "no youtube.json" }];
  if (!yt.videoId) return [409, { error: "not uploaded yet — nothing to push a thumbnail to" }];
  const jpg = join(ROOT, "videos", slug, "thumbnail.jpg");
  if (!exists(jpg)) return [400, { error: "no thumbnail.jpg — pick or compose a thumbnail first" }];
  if (!(await accessToken())) return [401, { error: "YouTube not connected — authorize the channel first" }];
  const res = await applyThumbnail(yt.videoId, jpg, { attempts: 4, gapMs: 8000 });
  if (res.ok) { yt.thumbnailSetAt = new Date().toISOString(); yt.thumbnailPushed = true; await writeFile(ytPath, JSON.stringify(yt, null, 2)); }
  return [res.ok ? 200 : 502, { ok: res.ok, thumbnail: res.status, videoId: yt.videoId }];
}

async function doPublish(slug, p) {
  const ytPath = join(ROOT, "videos", slug, "youtube.json");
  const yt = await readJson(ytPath);
  if (!yt) return [400, { error: "no youtube.json" }];
  if (yt.videoId) return [409, { error: `already published: ${yt.url}` }];
  if (!(await mp4Of(slug))) return [400, { error: "no rendered mp4 yet" }];
  const gate = await gateOf(slug);
  if (!gate.ready)
    return [412, { error: `not all lights green — missing: ${gate.missing.join(", ")}` +
      (gate.missing.includes("verified") ? ` (verify is a manual light — Approve the current cut on its review page first)` : "") }];
  if (!(await accessToken())) return [401, { error: "YouTube not connected — authorize the channel first" }];
  // Nothing publishes outside a playlist (each format is a playlist) — check
  // BEFORE the upload so we never strand a video without one.
  const fmts = (await readJson(join(ROOT, "experiment/channel/playlists.json")))?.formats ?? {};
  const vScope = deriveScope(await readJson(join(ROOT, "videos", slug, "config.json")));
  if (!fmts[vScope]?.id)
    return [412, { error: `no playlist configured for format "${vScope}" — run pipeline/publish/ensure-playlists.mjs first` }];
  // Flow model (owner ruling 2026-07-20): publishable → published, owner-clicked;
  // ≤6 uploads per rolling 24h is a quota MAX, never a schedule.
  let recent = 0;
  try {
    for (const e of await readdir(join(ROOT, "videos"), { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const y = await readJson(join(ROOT, "videos", e.name, "youtube.json"));
      if (y?.uploadedAt && Date.now() - new Date(y.uploadedAt).getTime() < 24 * 3600 * 1000) recent++;
    }
  } catch {}
  if (recent >= 6)
    return [429, { error: `daily upload max reached (${recent}/6 in the last 24h — YouTube quota). A slot frees as the oldest upload ages past 24h.` }];
  // Persist the operator's choices into the per-video record BEFORE upload —
  // the canonical upload CLI reads youtube.json, so the record and the listing
  // can never diverge.
  if (p.title) yt.title = String(p.title).slice(0, 100);
  if (p.description) yt.description = String(p.description).slice(0, 5000);
  const privacy = p.privacy === "public" ? "public" : "private";
  yt.privacyStatus = privacy;
  if (p.thumb && safeName(p.thumb)) {
    // candidates (thumbs/) are regenerable and gitignored; the CHOSEN frame is
    // copied to thumbnail.jpg — the committed part of the per-video record.
    // p.thumb === "thumbnail.jpg" means the operator picked the COMPOSED
    // thumbnail already sitting in the video dir (built from selected frames).
    if (p.thumb === "thumbnail.jpg") {
      if (!exists(join(ROOT, "videos", slug, "thumbnail.jpg"))) return [400, { error: "no composed thumbnail.jpg yet" }];
      yt.thumbnailFrame = "composed";
    } else {
      await copyFile(join(ROOT, "videos", slug, "thumbs", p.thumb), join(ROOT, "videos", slug, "thumbnail.jpg"));
      yt.thumbnailFrame = p.thumb;
    }
    yt.thumbnailFile = "thumbnail.jpg";
  }
  yt.publishedVia = "studio";
  await writeFile(ytPath, JSON.stringify(yt, null, 2));
  const args = [join(ROOT, "pipeline/publish/upload-youtube.mjs"), slug];
  if (privacy === "public") args.push("--public");
  try {
    await pexec("node", args, { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
  } catch (e) {
    return [500, { error: `upload failed: ${String(e.stderr || e.message || e).slice(0, 600)}` }];
  }
  const done = (await readJson(ytPath)) ?? {};
  // Chosen thumbnail → YouTube. Retries the "still processing" race instead of
  // one silent best-effort attempt (applyThumbnail). If it still misses, the
  // publish result surfaces a "Push thumbnail" button so the owner re-applies it
  // from the studio — never a manual trip to YouTube Studio.
  let thumbnail = "none chosen";
  let thumbnailOk = true;
  if (p.thumb && safeName(p.thumb) && done.videoId) {
    const res = await applyThumbnail(done.videoId, join(ROOT, "videos", slug, "thumbnail.jpg"));
    thumbnail = res.status;
    thumbnailOk = res.ok;
    if (res.ok) { done.thumbnailSetAt = new Date().toISOString(); done.thumbnailPushed = true; }
  }
  // File the video into its FORMAT playlist ("each format is a playlist" —
  // nothing publishes outside one). Best-effort: a failure never undoes the
  // upload, but is reported loudly for the operator/channel-manager routine.
  let playlist = "no playlist configured";
  try {
    const pls = (await readJson(join(ROOT, "experiment/channel/playlists.json")))?.formats ?? {};
    const scope = deriveScope(await readJson(join(ROOT, "videos", slug, "config.json")));
    const pl = pls[scope];
    if (pl?.id && done.videoId) {
      const at = await accessToken();
      const r = await fetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
        method: "POST",
        headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
        body: JSON.stringify({ snippet: { playlistId: pl.id, resourceId: { kind: "youtube#video", videoId: done.videoId } } }),
      });
      if (r.ok) { playlist = pl.title; done.playlistId = pl.id; done.playlistTitle = pl.title; }
      else playlist = `insert failed (HTTP ${r.status}) — add it in YouTube Studio`;
    }
  } catch { playlist = "insert failed — add it in YouTube Studio"; }
  await writeFile(ytPath, JSON.stringify(done, null, 2));
  return [200, { ok: true, url: done.url, videoId: done.videoId, status: done.status, thumbnail, thumbnailOk, playlist }];
}

function send(res, code, body, type = "application/json") {
  const data = type === "application/json" ? JSON.stringify(body) : body;
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(data);
}

async function streamVideo(req, res, slug) {
  const lock = await readJson(join(ROOT, "videos", slug, "render.lock.json"));
  const file = lock?.output ? join(ROOT, "videos", slug, lock.output) : join(ROOT, "videos", slug, `out/${slug}.mp4`);
  if (!exists(file)) return send(res, 404, { error: "mp4 missing" });
  const { size } = await stat(file);
  const range = req.headers.range;
  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    const start = Number(m?.[1] ?? 0);
    const end = m?.[2] ? Number(m[2]) : Math.min(start + 4 * 1024 * 1024, size - 1);
    res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Content-Type": "video/mp4" });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Length": size, "Content-Type": "video/mp4", "Accept-Ranges": "bytes" });
    createReadStream(file).pipe(res);
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === "/" || url.pathname === "/index.html")
      return send(res, 200, await readFile(join(ROOT, "pipeline/dashboard/index.html"), "utf8"), "text/html; charset=utf-8");
    if (url.pathname === "/api/catalog") return send(res, 200, await catalog());
    if (url.pathname === "/api/stats") return send(res, 200, await liveStats(url.searchParams.get("fresh") === "1"));
    if (url.pathname === "/api/pulse") return send(res, 200, await pulse());
    if (url.pathname === "/api/auth/status") return send(res, 200, await authStatus());
    if (url.pathname === "/api/auth/secret" && req.method === "POST") {
      let body = ""; for await (const c of req) body += c;
      let parsed; try { parsed = JSON.parse(body); } catch { return send(res, 400, { error: "not valid JSON" }); }
      if (!oauthConf(parsed)) return send(res, 400, { error: "JSON lacks installed/web client_id+client_secret (Desktop-app OAuth client)" });
      await mkdir(SECRETS, { recursive: true });
      await writeFile(SECRET_PATH, JSON.stringify(parsed, null, 2));
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/oauth/start") {
      const conf = oauthConf(await readJson(SECRET_PATH));
      if (!conf) return send(res, 400, { error: "no client secret saved yet" });
      res.writeHead(302, { Location: "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({ client_id: conf.client_id, redirect_uri: REDIRECT, response_type: "code", scope: OAUTH_SCOPE, access_type: "offline", prompt: "consent" }) });
      return res.end();
    }
    if (url.pathname === "/oauth/callback") {
      const code = url.searchParams.get("code");
      if (!code) return send(res, 400, "<body style='background:#07090d;color:#e7eef7;font-family:sans-serif;padding:40px'>Authorization failed — <a style='color:#ffc233' href='/'>back</a></body>", "text/html");
      const conf = oauthConf(await readJson(SECRET_PATH));
      const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: conf.client_id, client_secret: conf.client_secret, redirect_uri: REDIRECT, grant_type: "authorization_code" }) });
      const tok = await r.json();
      const prev = (await readJson(TOKEN_PATH)) ?? {};
      if (!tok.refresh_token && prev.refresh_token) tok.refresh_token = prev.refresh_token;
      await mkdir(SECRETS, { recursive: true });
      await writeFile(TOKEN_PATH, JSON.stringify(tok, null, 2));
      res.writeHead(302, { Location: "/?connected=1" });
      return res.end();
    }
    // publish flow
    if (url.pathname.startsWith("/api/publish/")) {
      const parts = url.pathname.split("/");
      const slug = parts[3];
      if (!safeName(slug)) return send(res, 400, { error: "bad slug" });
      if (parts[4] === "thumbs" && req.method === "POST")
        return send(res, 200, { thumbs: await ensureThumbs(slug, true) });
      // Re-apply the chosen thumbnail to an already-uploaded video (studio-side
      // recovery for the processing race — no YouTube Studio trip needed).
      if (parts[4] === "setthumb" && req.method === "POST") {
        const [code, out] = await pushThumbnail(slug);
        return send(res, code, out);
      }
      if (req.method === "GET") return send(res, 200, await publishPreview(slug));
      if (req.method === "POST") {
        if (PUBLISHING.has(slug)) return send(res, 409, { error: "publish already in progress" });
        PUBLISHING.add(slug);
        try {
          let body = ""; for await (const c of req) body += c;
          let parsed; try { parsed = JSON.parse(body || "{}"); } catch { return send(res, 400, { error: "not valid JSON" }); }
          const [code, out] = await doPublish(slug, parsed);
          return send(res, code, out);
        } finally { PUBLISHING.delete(slug); }
      }
    }
    if (url.pathname.startsWith("/thumb/")) {
      const [, , slug, file] = url.pathname.split("/");
      if (!safeName(slug) || !safeName(file)) return send(res, 400, { error: "bad path" });
      // "thumbnail.jpg" = the composed/chosen one in the video dir; others are candidates
      const f = file === "thumbnail.jpg" ? join(ROOT, "videos", slug, file) : join(ROOT, "videos", slug, "thumbs", file);
      if (!exists(f)) return send(res, 404, { error: "not found" });
      res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store" });
      return createReadStream(f).pipe(res);
    }
    // per-video feedback
    if (url.pathname.startsWith("/api/feedback/")) {
      const slug = url.pathname.split("/")[3];
      const file = slug === "_project" ? GLOBAL_FEEDBACK : join(ROOT, "videos", slug, "feedback.json");
      if (req.method === "GET") return send(res, 200, (await readJson(file)) ?? []);
      if (req.method === "POST") {
        let body = ""; for await (const c of req) body += c;
        const parsed = JSON.parse(body || "{}");
        if (!parsed.text) return send(res, 400, { error: "text required" });
        const n = await appendFeedback(file, fbEntry(parsed));
        return send(res, 200, { ok: true, count: n });
      }
    }
    if (url.pathname.startsWith("/video/")) return streamVideo(req, res, url.pathname.split("/")[2]);
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: String(e?.message ?? e) });
  }
});

server.listen(PORT, () => console.log(`studio ready → http://localhost:${PORT}`));
