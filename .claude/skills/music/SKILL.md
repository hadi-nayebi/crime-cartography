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
