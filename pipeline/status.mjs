#!/usr/bin/env node
// pipeline/status.mjs — canonical per-city production status.
//
// One source of truth for "where is every city in the pipeline" so the driver,
// producer, and harness-improver stop re-deriving it with ad-hoc ls/node
// one-liners each run. Reads the filesystem + experiment/confidence.json only;
// never writes; no external deps.
//
// Stages (each a real artifact on disk):
//   data     data/<slug>/normalized/summary.json
//   trend    data/<slug>/normalized/trend.json
//   basemap  data/<slug>/normalized/basemap.json
//   config   videos/<slug>/config.json
//   music    the file videos/<slug>/config.json's `audioSrc` points at,
//            resolved under surface/remotion/public/ (honest: checks the
//            asset the render will actually load, not a name convention).
//   render   videos/<slug>/out/<slug>.mp4  (size + mtime reported)
//
// Score/blockers come from experiment/confidence.json (100 = publishable).
//
// Usage:
//   node pipeline/status.mjs           aligned table + STAGE COUNTS summary
//   node pipeline/status.mjs --md      GitHub-markdown table (paste into HARNESS.md)
//   node pipeline/status.mjs --json    machine-readable array for other routines (includes .flow)
//   node pipeline/status.mjs --next    prints next unrendered slug w/ config+music ready (driver helper), or empty
//   node pipeline/status.mjs --flow    the canonical FLOW SCOREBOARD (owner ruling 2026-07-20, FLEET.md):
//                                      review-ready N · awaiting-publish N · published-24h N/6 ·
//                                      hours-since-newly-ready · STARVATION verdict. One source of
//                                      truth so the producer flow-alarm, briefing scoreboard, and
//                                      harness FLOW SLO stop hand-deriving it (and can't disagree).
//
// Exit code 0 always (a status probe, not a gate).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'surface', 'remotion', 'public');
const STAGES = ['data', 'trend', 'basemap', 'config', 'music', 'render'];

const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

// Canonical city set = the video directories.
const slugs = fs.readdirSync(path.join(ROOT, 'videos'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((s) => exists(path.join(ROOT, 'videos', s, 'config.json')) || exists(path.join(ROOT, 'data', s)))
  .sort();

const confidence = readJSON(path.join(ROOT, 'experiment', 'confidence.json')) || {};

// Resolve the audio asset a config actually references.
function musicOK(slug, cfg) {
  const src = cfg && cfg.audioSrc;
  if (src) {
    const rel = src.replace(/^\/+/, '');
    if (exists(path.join(PUBLIC, rel))) return true;
    // audioSrc may already be public-relative (e.g. "audio/foo.wav")
    if (exists(path.join(PUBLIC, rel.replace(/^public\//, '')))) return true;
    return false;
  }
  // no explicit audioSrc → fall back to the SAO naming convention
  return exists(path.join(PUBLIC, 'audio', `${slug}-music-sao.wav`));
}

// Studio-canonical verify light: a fresh operator APPROVE (kind:"decision",
// text starts "APPROVE") whose timestamp is >= the current mp4's mtime. Mirrors
// pipeline/dashboard/server.mjs cityRow() EXACTLY — the verify light is the
// owner's alone; confidence.json blockers are context, never a verify gate.
function verifyOf(slug, renderMs) {
  if (!renderMs) return { verified: false, approvedAt: null };
  const fb = readJSON(path.join(ROOT, 'videos', slug, 'feedback.json'));
  const arr = Array.isArray(fb) ? fb : (fb && Array.isArray(fb.entries) ? fb.entries : []);
  const lastDecision = [...arr].reverse().find((f) => f && f.kind === 'decision');
  const approvedAt = lastDecision && /^APPROVE/.test(lastDecision.text || '') ? lastDecision.at : null;
  const verified = Boolean(approvedAt && new Date(approvedAt).getTime() >= renderMs);
  return { verified, approvedAt };
}

const rows = slugs.map((slug) => {
  const cfgPath = path.join(ROOT, 'videos', slug, 'config.json');
  const cfg = readJSON(cfgPath);
  const mp4 = path.join(ROOT, 'videos', slug, 'out', `${slug}.mp4`);
  let renderInfo = null;
  let renderMs = 0;
  if (exists(mp4)) {
    const st = fs.statSync(mp4);
    renderMs = st.mtime.getTime();
    renderInfo = { mb: +(st.size / 1048576).toFixed(1), mtime: st.mtime.toISOString().slice(0, 16).replace('T', ' ') };
  }
  const conf = confidence[slug] || {};
  const yt = readJSON(path.join(ROOT, 'videos', slug, 'youtube.json')) || {};
  const { verified, approvedAt } = verifyOf(slug, renderMs);
  const published = Boolean(yt.url);
  return {
    slug,
    stages: {
      data: exists(path.join(ROOT, 'data', slug, 'normalized', 'summary.json')),
      trend: exists(path.join(ROOT, 'data', slug, 'normalized', 'trend.json')),
      basemap: exists(path.join(ROOT, 'data', slug, 'normalized', 'basemap.json')),
      config: !!cfg,
      music: musicOK(slug, cfg),
      render: !!renderInfo,
    },
    render: renderInfo,
    renderMs,
    verified,
    approvedAt,
    published,
    previouslyPublishedOnEarthOne: Array.isArray(yt.previousPublications) &&
      yt.previousPublications.some((publication) => (
        publication?.platform === 'youtube' &&
        publication?.channel_id === 'UCTsrF3UvpWzSGDXfbnZAWKA'
      )),
    uploadedAt: yt.uploadedAt || null,
    score: typeof conf.score === 'number' ? conf.score : null,
    blockers: Array.isArray(conf.blockers) ? conf.blockers.length : 0,
  };
});

// ---- FLOW SCOREBOARD (owner ruling 2026-07-20, FLEET.md) -------------------
// A video's flow position, from the studio's own light semantics:
//   in-production : not yet rendered
//   review-ready  : rendered, NOT verified, NOT published  (owner's queue)
//   awaiting-pub  : verified (fresh APPROVE), NOT published (one publish-click away)
//   published     : youtube.json has a url
// STARVATION (management event) = the review-ready queue is empty AND nothing new
// landed in it in 24h. Blockers are surfaced as context, never a flow gate.
function computeFlow(rows) {
  const now = Date.now();
  const DAY = 86400000;
  const reviewReady = rows.filter((r) => r.stages.render && !r.verified && !r.published);
  const awaitingPublish = rows.filter((r) => r.verified && !r.published);
  const published = rows.filter((r) => r.published);
  const published24h = published.filter((r) => r.uploadedAt && (now - new Date(r.uploadedAt).getTime()) < DAY);
  // "last time a reviewable cut landed" = newest mp4 among rendered-but-unpublished.
  const pipelineRendered = rows.filter((r) => r.stages.render && !r.published);
  const lastReadyMs = pipelineRendered.reduce((m, r) => Math.max(m, r.renderMs), 0);
  const hoursSinceReady = lastReadyMs ? +((now - lastReadyMs) / 3600000).toFixed(1) : null;
  const starving = reviewReady.length === 0 && (hoursSinceReady === null || hoursSinceReady >= 24);
  return {
    reviewReady: reviewReady.map((r) => r.slug),
    awaitingPublish: awaitingPublish.map((r) => r.slug),
    published: published.map((r) => r.slug),
    published24h: published24h.length,
    quotaCap: 6,
    hoursSinceReady,
    starving,
  };
}
const flow = computeFlow(rows);

const counts = Object.fromEntries(STAGES.map((s) => [s, rows.filter((r) => r.stages[s]).length]));
const total = rows.length;
const publishable = rows.filter((r) => r.score === 100).length;

const arg = process.argv[2] || '';

if (arg === '--json') {
  process.stdout.write(JSON.stringify({ total, counts, publishable, flow, rows }, null, 2) + '\n');
} else if (arg === '--flow') {
  const o = [];
  o.push('FLOW SCOREBOARD  (studio light semantics — owner ruling 2026-07-20)');
  o.push(`  review-ready     ${String(flow.reviewReady.length).padStart(2)}   (rendered · owner not yet approved — his queue)`);
  o.push(`  awaiting-publish ${String(flow.awaitingPublish.length).padStart(2)}   (APPROVED · one publish-click from live)${flow.awaitingPublish.length ? '  → ' + flow.awaitingPublish.join(', ') : ''}`);
  o.push(`  published (24h)  ${String(flow.published24h).padStart(2)}/${flow.quotaCap} (all-time published: ${flow.published.length})`);
  o.push(`  last cut landed  ${flow.hoursSinceReady === null ? 'never' : flow.hoursSinceReady + 'h ago'}`);
  o.push(`  STARVATION       ${flow.starving ? '🔴 YES — review queue empty AND nothing new in 24h (management event: harness roots-causes)' : '🟢 no — queue stocked / fresh cut within 24h'}`);
  process.stdout.write(o.join('\n') + '\n');
} else if (arg === '--next') {
  // driver helper: first city with config+music ready but no render, fewest blockers first
  const cand = rows
    .filter((r) => r.stages.config && r.stages.music && !r.stages.render)
    .sort((a, b) => a.blockers - b.blockers || a.slug.localeCompare(b.slug));
  process.stdout.write(cand.length ? cand[0].slug + '\n' : '');
} else if (arg === '--md') {
  const mark = (b) => (b ? '✅' : '·');
  const lines = [];
  lines.push(`| city | data | trend | basemap | config | music | render | score | blk |`);
  lines.push(`|------|:--:|:--:|:--:|:--:|:--:|:--:|--:|--:|`);
  for (const r of rows) {
    lines.push(`| ${r.slug} | ${mark(r.stages.data)} | ${mark(r.stages.trend)} | ${mark(r.stages.basemap)} | ${mark(r.stages.config)} | ${mark(r.stages.music)} | ${mark(r.stages.render)} | ${r.score ?? '–'} | ${r.blockers} |`);
  }
  lines.push(`| **${total} cities** | ${counts.data} | ${counts.trend} | ${counts.basemap} | ${counts.config} | ${counts.music} | **${counts.render}** | ${publishable}@100 | – |`);
  process.stdout.write(lines.join('\n') + '\n');
} else {
  const mark = (b) => (b ? 'Y' : '·');
  const out = [];
  out.push('CITY              data trend base cfg mus rend  score blk  render');
  for (const r of rows) {
    const ri = r.render ? `${r.render.mb}MB ${r.render.mtime}` : '';
    out.push(
      r.slug.padEnd(17) +
      ` ${mark(r.stages.data)}    ${mark(r.stages.trend)}     ${mark(r.stages.basemap)}    ${mark(r.stages.config)}   ${mark(r.stages.music)}   ${mark(r.stages.render)}   ` +
      `${String(r.score ?? '–').padStart(4)}  ${String(r.blockers).padStart(2)}  ${ri}`
    );
  }
  out.push('');
  out.push(`STAGE COUNTS (/${total}):  ` + STAGES.map((s) => `${s} ${counts[s]}`).join(' · '));
  out.push(`PUBLISHABLE (score=100): ${publishable}/${total}   ·   render bottleneck: ${counts.render}/${total}`);
  process.stdout.write(out.join('\n') + '\n');
}
