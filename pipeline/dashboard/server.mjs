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
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
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
  "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube";
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

async function cityRow(slug) {
  const d = join(ROOT, "data", slug);
  const v = join(ROOT, "videos", slug);
  const cfg = await readJson(join(v, "config.json"));
  const yt = (await readJson(join(v, "youtube.json"))) ?? {};
  const lock = await readJson(join(v, "render.lock.json"));
  const conf = null; // filled by caller from the shared ledger
  const fb = (await readJson(join(v, "feedback.json"))) ?? [];
  const summary = await readJson(join(d, "normalized/summary.json"));

  const mp4Name = lock?.output ? join(v, lock.output) : join(v, `out/${slug}.mp4`);
  const hasRender = exists(mp4Name);
  const stages = {
    data: Boolean(summary),
    trend: exists(join(d, "normalized/trend.json")),
    basemap: exists(join(d, "normalized/basemap.json")),
    config: Boolean(cfg),
    music: exists(join(ROOT, "surface/remotion/public/audio", `${slug}-music-sao.wav`)) ||
           exists(join(ROOT, "surface/remotion/public/audio", `${slug.replace(/-\w\w$/, "")}-music-sao.wav`)),
    render: hasRender,
    verified: false, // set from ledger (score>=95 & no blockers touching render)
    published: Boolean(yt.url),
  };
  let mp4 = null;
  if (hasRender) {
    const s = await stat(mp4Name);
    mp4 = { bytes: s.size, mtime: s.mtime };
  }
  return {
    slug,
    title: cfg?.title ?? summary?.title ?? slug,
    subtitle: cfg?.subtitle ?? (summary ? `${summary.dateMin?.slice(0,4)}–${summary.dateMax?.slice(0,4)} · ${summary.beatCount} areas · ${(summary.totalRecords ?? 0).toLocaleString()} records` : "no data yet"),
    hook: cfg?.hook?.stat ?? null,
    trendStyle: cfg?.trendStyle ?? null,
    stages,
    stageIndex: STAGES.filter((s) => stages[s]).length,
    confidence: conf,
    youtube: { status: yt.status ?? "draft", url: yt.url || null },
    render: lock ? { renderedAt: lock.renderedAt, durationSec: lock.durationSec, commit: (lock.commit || "").slice(0, 7) } : null,
    mp4,
    feedbackCount: fb.length,
    openFeedback: fb.filter((f) => !f.resolved).length,
    dataMeta: summary ? { records: summary.totalRecords, areas: summary.beatCount, span: `${summary.dateMin ?? "?"} → ${summary.dateMax ?? "?"}`, coverage: summary.coveragePct } : null,
  };
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
    if (row.confidence) {
      row.stages.verified =
        row.stages.render && row.confidence.score >= 95 && (row.confidence.blockers ?? []).length === 0;
      row.stageIndex = STAGES.filter((s) => row.stages[s]).length;
    }
    rows.push(row);
  }
  return rows;
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
