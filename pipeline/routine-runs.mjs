#!/usr/bin/env node
/**
 * Index routine-run session transcripts into run-level eval metrics.
 *
 *   node pipeline/routine-runs.mjs [--since <ISO|YYYY-MM-DD>] [--routine <name>] [--json]
 *
 * Streams every session .jsonl in ~/.claude/projects/<this-project>/ (never
 * loads a file whole), identifies which routine the session was (by its first
 * user prompt), and reports per run: start, duration, turns, tool calls,
 * output tokens (the spend proxy), and the final message snippet (outcome).
 * This is the harness-improver's run-level audit instrument — transcripts are
 * the ground truth the commit trail can't show (no-op runs, permission stalls,
 * token waste).
 */
import { createReadStream, readdirSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";

const DIR = join(homedir(), ".claude/projects/-home-hadinayebi-CodingProjects-maps");
const args = process.argv.slice(2);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const since = opt("--since") ? new Date(opt("--since")).getTime() : 0;
const only = opt("--routine");
const asJson = args.includes("--json");

// ORDER MATTERS: most-specific first (the critic's prompt also contains
// "note-watcher", the scientist's contains "channel", etc.)
const SIGNATURES = [
  ["production-critic", "production-critic"],
  ["channel-scientist", "CHANNEL SCIENTIST"],
  ["note-watcher", "note-watcher"],
  ["batch1-production-driver", "production driver"],
  ["producer-work-session", "You are the PRODUCER"],
  ["earth-one-channel-briefing", "briefing officer"],
  ["youtube-channel-manager", "YouTube channel manager"],
  ["harness-improver", "harness improver"],
  ["repo-hygiene-reviewer", "gitignored"],
];

async function indexFile(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let routine = null, first = null, last = null, turns = 0, tools = 0, outTokens = 0, lastText = "";
  for await (const line of rl) {
    let j; try { j = JSON.parse(line); } catch { continue; }
    const ts = j.timestamp ? Date.parse(j.timestamp) : null;
    if (ts) { first ??= ts; last = ts; }
    const msg = j.message;
    if (!msg) continue;
    if (!routine && msg.role === "user") {
      const text = typeof msg.content === "string" ? msg.content
        : (msg.content ?? []).map((c) => c.text ?? "").join(" ");
      for (const [name, sig] of SIGNATURES) if (text.includes(sig)) { routine = name; break; }
      routine ??= "interactive/other";
    }
    if (msg.role === "assistant") {
      turns++;
      outTokens += msg.usage?.output_tokens ?? 0;
      for (const c of Array.isArray(msg.content) ? msg.content : []) {
        if (c.type === "tool_use") tools++;
        if (c.type === "text" && c.text?.trim()) lastText = c.text.trim();
      }
    }
  }
  return { routine: routine ?? "empty", start: first, end: last, turns, tools, outTokens, lastText };
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".jsonl"));
const runs = [];
for (const f of files) {
  const p = join(DIR, f);
  if (since && statSync(p).mtimeMs < since) continue; // cheap pre-filter
  const r = await indexFile(p);
  if (!r.start || r.start < since) continue;
  if (only && r.routine !== only) continue;
  runs.push({ session: f.replace(".jsonl", "").slice(0, 8), ...r });
}
runs.sort((a, b) => a.start - b.start);

if (asJson) { console.log(JSON.stringify(runs, null, 1)); process.exit(0); }

const fmt = (t) => t ? new Date(t).toISOString().slice(5, 16).replace("T", " ") : "?";
const mins = (r) => r.end && r.start ? Math.round((r.end - r.start) / 60000) : "?";
console.log("session  routine                    start        min  turns tools outTok  outcome");
for (const r of runs)
  console.log(`${r.session} ${r.routine.padEnd(26)} ${fmt(r.start)} ${String(mins(r)).padStart(4)} ${String(r.turns).padStart(5)} ${String(r.tools).padStart(5)} ${String(r.outTokens).padStart(6)}  ${r.lastText.replace(/\n/g, " ").slice(0, 60)}`);
// per-routine rollup
const agg = {};
for (const r of runs) {
  const a = (agg[r.routine] ??= { runs: 0, tokens: 0, tools: 0 });
  a.runs++; a.tokens += r.outTokens; a.tools += r.tools;
}
console.log("\nroutine                     runs   outTok  avgTok  tools");
for (const [k, a] of Object.entries(agg).sort((x, y) => y[1].tokens - x[1].tokens))
  console.log(`${k.padEnd(26)} ${String(a.runs).padStart(5)} ${String(a.tokens).padStart(8)} ${String(Math.round(a.tokens / a.runs)).padStart(7)} ${String(a.tools).padStart(6)}`);
