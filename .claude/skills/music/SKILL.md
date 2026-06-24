---
name: music
description: Generate and improve royalty-free procedural music beds for videos (numpy synthesis). Load and follow this whenever creating or revising music. It is a MATURING skill — append a dated entry to the Maturity Log every time you use it.
---

# music — procedural music generation skill

Self-made, royalty-free music for the crime-cartography videos via numpy
synthesis (`pipeline/audio/gen_music.py`). The goal is a track that is musical,
*non-monotonous*, and arranged to follow the video's sections.

> **This skill grows.** Every time you make/revise music, (1) follow the
> checklist, (2) note what worked / what sounded bad in the **Maturity Log**,
> (3) fold durable lessons up into Principles. Treat the Log as memory.

## When to use
Any time you generate or edit a music/audio bed. Read this file first, apply the
checklist, then run the toolchain.

## Core principles (the anti-monotony rules)

1. **Motif, then develop it.** Write one short melodic idea (2–4 bars) and
   restate it with variation — *sequencing* (same intervals, new starting
   pitch), *rhythmic displacement* (start on a different beat), *inversion*,
   *augmentation/diminution*. Repetition-with-variation is what makes it stick
   without boring. A bed with no recognizable motif feels like drone.
2. **Sections must differ, not just repeat.** Arrange as A B A B C (intro /
   groove / variation / groove / breakdown). Change something every **4–8 bars**:
   add/remove a layer, swap the drum pattern, change the chord voicing, open the
   filter. "Section A × N" is the #1 monotony trap.
3. **Vary the harmony.** Don't loop one 4-chord progression for 5 minutes. Give
   each macro-section its own progression or a B-section reharm (e.g. relative
   major lift, or a IV–v turnaround). Key/voicing changes per section add motion.
4. **Tension & release.** Build with risers/fills into a "drop", pull back into
   a breakpoint, then return fuller. Dynamics over time > constant density.
5. **Automation = life.** Slowly sweep a low-pass filter / brightness / reverb
   send across a section so the *timbre* evolves even when notes repeat.
6. **Groove from syncopation + space.** Off-beat hits and *deliberate silence*
   (rests) are part of the melody. Wall-to-wall notes read as monotone.
7. **Fills at boundaries.** A 1-bar drum fill / snare roll / tom run signals a
   section change and keeps the ear expecting.
8. **Frequency separation when mixing.** Sub/bass < ~150 Hz, body mids, air/hats
   top. Sidechain-duck pads & bass under the kick so it breathes. Keep peak
   ≈ −1.5 dBFS, no harsh clipping.
9. **Match picture.** Section changes should land on the video's structural
   beats (era change, reveal). Sync accents (ticks) to real events if possible.

## Toolchain

- Generator: `pipeline/audio/gen_music.py` (numpy → 16-bit stereo WAV).
  - Run: `python3 pipeline/audio/gen_music.py --bpm 92`
  - Output: `surface/remotion/public/audio/grand-rapids-music.wav`
- Synth voices to keep/extend: kick, snare, hat, bass (driven sine+sub),
  pluck/arp, pad, riser. Add a **lead** voice for the motif.
- A one-pole low-pass `y[n]=y[n-1]+a*(x[n]-y[n-1])` gives cheap filter
  automation when `a` is time-varying.
- Preview without re-rendering the whole video:
  `ffmpeg -ss <t> -t 20 -i <wav> -q:a 4 preview.mp3` then have the user play it.

## QA checklist (run every time, before declaring done)
- [ ] Is there a **recognizable melodic motif** that recurs with variation?
- [ ] Does **something change at least every 8 bars** (layer/pattern/harmony/filter)?
- [ ] At least **2 distinct macro-sections** with different progressions?
- [ ] **Fills/risers** at section boundaries?
- [ ] **Filter/brightness automation** somewhere (not static timbre)?
- [ ] **Rests / syncopation** present (not a constant wall of notes)?
- [ ] Section changes **align to the video phases**?
- [ ] Mix: peak ≈ −1.5 dBFS, kick audible, no muddy buildup, sidechain breathing?
- [ ] Listen end-to-end (or section previews) for the "it got boring here" moment;
      fix that bar.

## Maturity Log
_Append a dated entry each use: BPM/key, what changed, what sounded good/bad,
next improvement._

- **2026-06-24 · v0.1 (skill created).** Baseline `gen_music.py` was A-minor 88
  BPM: drums + bass + arp over a single Am–F–C–G loop, section-gated by
  intensity. **User feedback: too monotonic — tones hold too long before
  change.** Root cause: no lead motif; one progression for the whole track; drum
  pattern identical every bar within a section; static timbre. Planned v0.2:
  add a developed lead motif, give the granular era a B-section reharm, vary
  drums every 4 bars + boundary fills, automate a low-pass on arp/lead, insert
  rests. Target ~92 BPM.
- **2026-06-24 · v0.2 (generated, awaiting user ear-check).** 92 BPM A-minor.
  Added: lead MOTIF `[0,3,2,4,3,0]` developed by transpose + rhythmic
  displacement on odd cycles + rests (skips cycle 2); granular harmony
  alternates PROG_A (Am–F–C–G) / PROG_B (Dm–C–G–Am) every 4-bar cycle; snare
  ghosts + hat rests vary by cycle; 1-bar snare fill closes each 4-bar cycle;
  per-note brightness automation (26s sine) replaces static timbre (cheap —
  avoids per-sample time-varying filter, which is too slow in pure-python over
  14.5M samples). NOTE: spectral-centroid proxy is dominated by hats so it's a
  poor monotony meter — judge by ear / section previews instead. Next if still
  flat: stronger A/B contrast (drop drums in B), a counter-melody call/response,
  and a real low-pass sweep via scipy on a downsampled control signal.
- **2026-06-24 · v0.3 (generated, awaiting user ear-check).** 62 BPM A-minor,
  "cinematic-documentary" rewrite modelled on a measured analysis of a user
  reference Suno track ("The Cost of Silence": ~61 BPM, A-min/C-maj family,
  arc = sparse dark intro → long filter-opening crescendo → breakdown → bright
  climax → outro; centroid swept 360→1460 Hz; mean −12.9 dB but master CLIPS at
  +2.7 dB). What I changed vs v0.2: (1) tempo 92→62 (half-time, spacious);
  (2) palette is now cinematic — sustained detuned-saw STRINGS pad as the bed,
  piano-ish KEYS motif, deep sustained SUB bass, *muted* soft-kick + brushed
  snare that only enter mid/late (never a crack); (3) a REAL time-varying
  low-pass (scipy butter+lfilter, block-wise with carried zi) on the "color"
  bus that OPENS across the piece following a keyframed cutoff curve, dipping at
  the breakdown — the #1 fix the log asked for; (4) a genuine BREAKDOWN at the
  era transition (150–163 s): drums strip out, level drops ~6 dB, a riser builds
  into the granular drop; (5) borrowed bII (B-flat / Neapolitan) chord in the
  reveal progression [Am F Bb G] for a dark climax color (matches the reference's
  B-flat presence); (6) overall dynamic-level automation so breakdown breathes
  and climax lifts. Measured result: −16 dB intro → −18 dB breakdown → −9 dB
  climax (≈9 dB swing vs ~flat in v0.2); centroid 247→1050 Hz across the track;
  peak −1.5 dBFS, no clipping. GOOD: dynamic arc + timbral sweep are clearly
  audible now; the breakdown→drop reads. WATCH: cold-open (0–13 s) measures very
  quiet (−43 dB) — may be too empty under the cold-open visuals; bump if the user
  wants presence there. The scipy block-LPF is the right tool — keep it. Next if
  needed: a counter-melody call/response in granular B-sections, gentle reverb
  send, and lift the cold-open floor.
- **2026-06-24 · PIVOT to neural model (Stable Audio Open).** User listened to
  the procedural v0.3 previews and rejected them outright ("none are good") —
  pure numpy synthesis tops out well below the produced quality of a Suno
  reference they liked. Conclusion: **for this project, procedural synthesis is
  a fallback, not the deliverable.** New primary path = `pipeline/audio/
  gen_stable_audio.py`, which prompts **Stable Audio Open 1.0** (open weights,
  Stability Community License — commercial OK under $1M/yr) once per video PHASE
  and crossfade-arranges to 330 s. Runs locally on a 4 GB GPU via diffusers
  `StableAudioPipeline` + `enable_model_cpu_offload()` + attention slicing; ~0.8 s
  compute per second of audio at 100 steps (≈13 min for the full 5:30 at 150
  steps). Gotchas: model is HF-gated (accept terms + `hf auth login`); needs
  `torchsde` for its CosineDPM scheduler; the per-phase ANCHOR string (key/tempo/
  instrument set) keeps independent gens tonally compatible; equal-power
  crossfades at phase boundaries hide seams. The skill's arrangement principles
  (section arc, breakdown, match-picture) now live in the SECTIONS prompt list,
  not in synthesis code. gen_music.py (v0.3) stays as an offline/no-GPU fallback.
