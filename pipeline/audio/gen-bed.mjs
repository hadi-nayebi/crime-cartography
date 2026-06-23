// Procedurally synthesize a royalty-free ambient + binaural audio bed for the
// crime-cartography video. Self-generated (no external/copyright assets). The
// bed reacts to the video's structure: a calm history era, a riser at the
// 2023 era-transition, soft month ticks during the granular sweep, a swell at
// the reveal, and fades at the ends.
//
//   node pipeline/audio/gen-bed.mjs
//
// Output: surface/remotion/public/audio/grand-rapids.wav (gitignored; reproducible)

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(
  __dirname,
  "../../surface/remotion/public/audio/grand-rapids.wav",
);

const SR = 44100;
const DUR = 330; // seconds — must match config.durationSec
const N = SR * DUR;

// Phase boundaries (seconds) — mirror surface/remotion/src/theme.ts PHASES.
const P = {
  coldOpenEnd: 13,
  methodEnd: 39,
  historyEnd: 150,
  transitionEnd: 163,
  granularEnd: 292,
  revealEnd: 318,
  closeEnd: 330,
};
const MONTHS = 42; // granular timeline length

const TWO_PI = Math.PI * 2;
const lfo = (t, hz, ph = 0) => 0.5 + 0.5 * Math.sin(TWO_PI * hz * t + ph);

// month-tick times across the granular sweep
const tickTimes = [];
for (let i = 0; i < MONTHS; i++) {
  tickTimes.push(P.transitionEnd + (i / MONTHS) * (P.granularEnd - P.transitionEnd));
}

// master amplitude envelope by phase
function masterEnv(t) {
  if (t < P.coldOpenEnd) return 0.6 * (t / P.coldOpenEnd); // fade in
  if (t < P.methodEnd) return 0.55;
  if (t < P.historyEnd) return 0.5; // history: calm
  if (t < P.transitionEnd) {
    const k = (t - P.historyEnd) / (P.transitionEnd - P.historyEnd);
    return 0.5 + 0.35 * k; // riser
  }
  if (t < P.granularEnd) return 0.72; // granular: present
  if (t < P.revealEnd) return 0.8; // reveal swell
  // close fade out
  const k = (t - P.revealEnd) / (P.closeEnd - P.revealEnd);
  return 0.8 * (1 - k);
}

// short decaying blip for a month tick
function tickAt(t) {
  let s = 0;
  for (const tk of tickTimes) {
    if (t >= tk && t < tk + 0.45) {
      const e = Math.exp(-(t - tk) / 0.1);
      s += 0.1 * e * Math.sin(TWO_PI * 528 * (t - tk));
    }
  }
  return s;
}

// transition riser sweep (200 → 760 Hz) during the era bridge
function riserAt(t) {
  if (t < P.historyEnd || t >= P.transitionEnd) return 0;
  const k = (t - P.historyEnd) / (P.transitionEnd - P.historyEnd);
  const f = 200 + 560 * k;
  return 0.08 * k * Math.sin(TWO_PI * f * t);
}

console.log(`synthesizing ${DUR}s @ ${SR}Hz stereo…`);
const buf = Buffer.alloc(44 + N * 4); // 16-bit stereo

// WAV header
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write("WAVE", 8);
buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); // PCM
buf.writeUInt16LE(2, 22); // stereo
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); // byte rate
buf.writeUInt16LE(4, 32); // block align
buf.writeUInt16LE(16, 34); // bits
buf.write("data", 36);
buf.writeUInt32LE(N * 4, 40);

for (let i = 0; i < N; i++) {
  const t = i / SR;
  const env = masterEnv(t);

  // ambient pads (A2 root, E3 fifth, A3) with slow independent LFOs
  const pad =
    0.16 * Math.sin(TWO_PI * 110.0 * t) * lfo(t, 0.05, 0.0) +
    0.12 * Math.sin(TWO_PI * 164.81 * t) * lfo(t, 0.037, 1.7) +
    0.08 * Math.sin(TWO_PI * 220.0 * t) * lfo(t, 0.061, 3.1) +
    0.05 * Math.sin(TWO_PI * 82.41 * t) * lfo(t, 0.029, 0.6); // sub E2

  const shared = (pad + tickAt(t) + riserAt(t)) * env;

  // binaural beat: 6 Hz (L 200 / R 206), gentle, swells in granular+reveal
  const binAmp = 0.05 * (t > P.transitionEnd ? 1 : 0.5);
  let l = shared + binAmp * Math.sin(TWO_PI * 200.0 * t);
  let r = shared + binAmp * Math.sin(TWO_PI * 206.0 * t);

  // soft clip
  l = Math.max(-1, Math.min(1, l * 0.9));
  r = Math.max(-1, Math.min(1, r * 0.9));

  buf.writeInt16LE((l * 32767) | 0, 44 + i * 4);
  buf.writeInt16LE((r * 32767) | 0, 44 + i * 4 + 2);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buf);
console.log(`✓ wrote ${OUT} (${(buf.length / 1e6).toFixed(1)} MB)`);
