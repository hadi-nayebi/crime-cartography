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
