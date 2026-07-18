#!/usr/bin/env node
/**
 * Crime Cartography production studio — local review dashboard.
 *
 *   node pipeline/dashboard/server.mjs   →  http://localhost:4400
 *
 * Browse every video, watch the rendered MP4 (with scrubbing), see its
 * confidence score / blockers / experiment features / publish status, and
 * leave timestamped comments or decisions (approve / hold / request changes).
 * All feedback is written to videos/<slug>/feedback.json inside the repo —
 * the producer (Claude) reads those files and acts on them; nothing leaves
 * the machine. No dependencies; plain Node.
 */
import { createServer } from "node:http";
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = Number(process.env.PORT || 4400);
const SECRETS = join(ROOT, ".secrets");
const SECRET_PATH = join(SECRETS, "youtube_client_secret.json");
const TOKEN_PATH = join(SECRETS, "youtube_token.json");
const OAUTH_SCOPE =
  "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube";
const REDIRECT = `http://localhost:${PORT}/oauth/callback`;

async function readJson(p, fallback = null) {
  try { return JSON.parse(await readFile(p, "utf8")); } catch { return fallback; }
}

async function catalog() {
  const dirs = (await readdir(join(ROOT, "videos"), { withFileTypes: true }))
    .filter((d) => d.isDirectory()).map((d) => d.name);
  const confidence = (await readJson(join(ROOT, "experiment/confidence.json"))) ?? {};
  const matrix = (await readJson(join(ROOT, "experiment/matrix.json"))) ?? {};
  const out = [];
  for (const slug of dirs) {
    const base = join(ROOT, "videos", slug);
    const cfg = await readJson(join(base, "config.json"));
    if (!cfg) continue;
    const yt = await readJson(join(base, "youtube.json"), {});
    const lock = await readJson(join(base, "render.lock.json"));
    const fb = (await readJson(join(base, "feedback.json"))) ?? [];
    let mp4 = null;
    if (lock?.output && existsSync(join(base, lock.output))) {
      const s = await stat(join(base, lock.output));
      mp4 = { path: lock.output, bytes: s.size, mtime: s.mtime };
    }
    out.push({
      slug,
      title: cfg.title,
      subtitle: cfg.subtitle,
      hook: cfg.hook?.stat ?? null,
      trendStyle: cfg.trendStyle ?? "bars",
      confidence: confidence[slug] ?? null,
      features: matrix[slug] ?? null,
      youtube: { status: yt.status ?? "draft", url: yt.url || null, title: yt.title ?? null },
      render: lock ? { renderedAt: lock.renderedAt, durationSec: lock.durationSec, commit: (lock.commit || "").slice(0, 7) } : null,
      mp4,
      feedbackCount: fb.length,
      openFeedback: fb.filter((f) => !f.resolved).length,
    });
  }
  out.sort((a, b) => a.slug.localeCompare(b.slug));
  return out;
}

async function appendFeedback(slug, entry) {
  const p = join(ROOT, "videos", slug, "feedback.json");
  const list = (await readJson(p)) ?? [];
  list.push(entry);
  await writeFile(p, JSON.stringify(list, null, 2));
  return list.length;
}

// ---- YouTube OAuth (standard installed-app flow, loopback redirect) --------
function oauthConf(cs) {
  const c = cs?.installed ?? cs?.web;
  return c?.client_id && c?.client_secret ? c : null;
}
async function accessToken() {
  const conf = oauthConf(await readJson(SECRET_PATH));
  const tok = await readJson(TOKEN_PATH);
  if (!conf || !tok?.refresh_token) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: conf.client_id,
      client_secret: conf.client_secret,
      refresh_token: tok.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  return j.access_token ?? null;
}
async function authStatus() {
  const hasSecret = Boolean(oauthConf(await readJson(SECRET_PATH)));
  const hasToken = Boolean((await readJson(TOKEN_PATH))?.refresh_token);
  let channel = null;
  if (hasSecret && hasToken) {
    try {
      const at = await accessToken();
      if (at) {
        const r = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
          { headers: { Authorization: `Bearer ${at}` } },
        );
        const j = await r.json();
        const sn = j.items?.[0]?.snippet;
        if (sn) channel = { title: sn.title, thumb: sn.thumbnails?.default?.url ?? null };
      }
    } catch { /* status stays token-only */ }
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
  if (!lock?.output) return send(res, 404, { error: "no render" });
  const file = join(ROOT, "videos", slug, lock.output);
  if (!existsSync(file)) return send(res, 404, { error: "mp4 missing" });
  const { size } = await stat(file);
  const range = req.headers.range;
  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    const start = Number(m?.[1] ?? 0);
    const end = m?.[2] ? Number(m[2]) : Math.min(start + 4 * 1024 * 1024, size - 1);
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Type": "video/mp4",
    });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Length": size, "Content-Type": "video/mp4", "Accept-Ranges": "bytes" });
    createReadStream(file).pipe(res);
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = await readFile(join(ROOT, "pipeline/dashboard/index.html"), "utf8");
      return send(res, 200, html, "text/html; charset=utf-8");
    }
    if (url.pathname === "/api/catalog") return send(res, 200, await catalog());

    // ---- OAuth endpoints ----
    if (url.pathname === "/api/auth/status") return send(res, 200, await authStatus());
    if (url.pathname === "/api/auth/secret" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      let parsed;
      try { parsed = JSON.parse(body); } catch { return send(res, 400, { error: "not valid JSON" }); }
      if (!oauthConf(parsed))
        return send(res, 400, { error: "JSON has no installed/web client_id+client_secret — download the OAuth client JSON from Google Cloud Console (type: Desktop app)" });
      await mkdir(SECRETS, { recursive: true });
      await writeFile(SECRET_PATH, JSON.stringify(parsed, null, 2));
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/oauth/start") {
      const conf = oauthConf(await readJson(SECRET_PATH));
      if (!conf) return send(res, 400, { error: "no client secret saved yet" });
      const u =
        "https://accounts.google.com/o/oauth2/v2/auth?" +
        new URLSearchParams({
          client_id: conf.client_id,
          redirect_uri: REDIRECT,
          response_type: "code",
          scope: OAUTH_SCOPE,
          access_type: "offline",
          prompt: "consent",
        });
      res.writeHead(302, { Location: u });
      return res.end();
    }
    if (url.pathname === "/oauth/callback") {
      const err = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      if (err || !code)
        return send(res, 400, `<body style="font-family:sans-serif;background:#07090d;color:#e7eef7;padding:40px">Authorization failed: ${err ?? "no code"} — <a style="color:#ffc233" href="/">back to the studio</a></body>`, "text/html");
      const conf = oauthConf(await readJson(SECRET_PATH));
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: conf.client_id,
          client_secret: conf.client_secret,
          redirect_uri: REDIRECT,
          grant_type: "authorization_code",
        }),
      });
      const tok = await r.json();
      if (!tok.refresh_token && !tok.access_token)
        return send(res, 500, `<body style="font-family:sans-serif;background:#07090d;color:#e7eef7;padding:40px">Token exchange failed: <pre>${JSON.stringify(tok)}</pre><a style="color:#ffc233" href="/">back</a></body>`, "text/html");
      // keep an existing refresh_token if Google omits it on re-consent
      const prev = (await readJson(TOKEN_PATH)) ?? {};
      if (!tok.refresh_token && prev.refresh_token) tok.refresh_token = prev.refresh_token;
      await mkdir(SECRETS, { recursive: true });
      await writeFile(TOKEN_PATH, JSON.stringify(tok, null, 2));
      res.writeHead(302, { Location: "/?connected=1" });
      return res.end();
    }
    if (url.pathname.startsWith("/api/feedback/")) {
      const slug = url.pathname.split("/")[3];
      if (req.method === "GET")
        return send(res, 200, (await readJson(join(ROOT, "videos", slug, "feedback.json"))) ?? []);
      if (req.method === "POST") {
        let body = "";
        for await (const c of req) body += c;
        const { videoTime, text, kind } = JSON.parse(body || "{}");
        if (!text || typeof text !== "string") return send(res, 400, { error: "text required" });
        const entry = {
          at: new Date().toISOString(),
          kind: kind === "decision" ? "decision" : "comment",
          videoTime: Number.isFinite(videoTime) ? Math.round(videoTime * 10) / 10 : null,
          text: text.slice(0, 2000),
          resolved: false,
        };
        const n = await appendFeedback(slug, entry);
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
