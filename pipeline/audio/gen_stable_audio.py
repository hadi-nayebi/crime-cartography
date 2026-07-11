#!/usr/bin/env python3
"""Continuous cinematic music bed via Stable Audio Open (free, open weights).

v2 — GAP-FREE, CONTINUOUS. The previous version generated one clip per phase and
left long silences where Stable Audio produced sparse/quiet output (17s and 14s
dead spots). This version guarantees a continuous score:

  1. A sustained PAD BED is generated once and loop-crossfaded across the whole
     330s, so there is never silence underneath.
  2. Each macro-SECTION's clip is reduced to its densest musical window (dead
     tails removed), then loop-crossfaded to fill the section length.
  3. Sections crossfade into each other; a per-section level envelope shapes the
     dynamic arc (quiet intro -> build -> breakdown dip -> groove -> climax ->
     fade) so it moves without cutting out.

Model: stabilityai/stable-audio-open-1.0 (Stability AI Community License —
commercial use permitted under $1M/yr revenue). Weights are HF-gated: accept the
terms and `hf auth login` once before running.

    ~/.venvs/stableaudio/bin/python pipeline/audio/gen_stable_audio.py --steps 140
    # single-section test (writes <out>.<name>.wav):
    ~/.venvs/stableaudio/bin/python pipeline/audio/gen_stable_audio.py --only granular --steps 100
"""
import argparse
import os
import sys
import numpy as np

MODEL = "stabilityai/stable-audio-open-1.0"
SR = 44100
TOTAL = 330.0  # must match config.durationSec
CF = 2.5       # crossfade seconds between sections and loop wraps
NEG = ("low quality, distorted, clipping, harsh noise, vocals, singing, lyrics, "
       "speech, silence, long pauses, empty, abrupt stop")

# Shared anchor keeps every gen in the same key/tempo/instrument world so the
# loops and section boundaries stay tonally compatible.
ANCHOR = ("instrumental cinematic documentary score, A minor, around 70 BPM, "
          "grand piano, warm sustained strings, deep sub bass, continuous and "
          "flowing with no pauses or silence, seamless, film score, high quality")

# A continuous sustained bed under the whole piece — never stops.
BED = ("continuous sustained warm string pad and soft low drone in A minor, "
       "evolving slowly, seamless and unbroken, no melody, no drums, no pauses")
BED_CORE = 22.0   # seconds of the densest bed window to loop
BED_GAIN = 0.55   # bed level under the section layer

# (name, phase_seconds, core_seconds, detail). phase_seconds sum to TOTAL and
# mirror theme.ts PHASES: intro 0-30, history 30-150, transition 150-163,
# granular 163-292, reveal 292-318, outro 318-330. level = section loudness.
SECTIONS = [
    ("intro",      30, 16, 0.55, "slow flowing grand piano motif over the strings, "
        "contemplative and restrained, continuous, no drums, no gaps"),
    ("history",   120, 20, 0.80, "gently building cinematic piano and strings with a "
        "steady soft heartbeat pulse, warm and continuous, growing, documentary, "
        "no silence"),
    ("transition", 13, 10, 0.62, "smooth breakdown, sustained low drone and a slow "
        "rising swell, continuous anticipation, no beat, no gaps"),
    ("granular",  129, 20, 0.92, "steady restrained cinematic-electronic groove, "
        "muted kick and soft brushed percussion, arpeggiated synth and piano, "
        "propulsive but controlled, continuous and unbroken, A minor"),
    ("reveal",     26, 16, 0.85, "emotional cinematic swell, full soaring strings and "
        "piano, brighter, powerful but not triumphant, continuous, resolving"),
    ("outro",      12, 10, 0.60, "gentle sustained resolve, solo piano and warm "
        "strings, continuous, slowly settling, A minor"),
]


def equal_power_crossfade(a, b, n):
    """Crossfade the tail of a (n samples) into the head of b."""
    n = int(min(n, len(a), len(b)))
    if n <= 0:
        return np.concatenate([a, b], axis=0)
    t = np.linspace(0, 1, n)[:, None]
    fo, fi = np.cos(t * np.pi / 2), np.sin(t * np.pi / 2)
    mid = a[-n:] * fo + b[:n] * fi
    return np.concatenate([a[:-n], mid, b[n:]], axis=0)


def densest_window(wav, win_s):
    """Return the win_s-second sub-array with the highest RMS (drops dead tails)."""
    win = int(min(win_s, len(wav) / SR) * SR)
    if win >= len(wav):
        return wav
    mono = wav.mean(axis=1) ** 2
    # coarse RMS scan every ~0.25s
    hop = int(0.25 * SR)
    best_i, best_e = 0, -1.0
    csum = np.concatenate([[0.0], np.cumsum(mono)])
    for i in range(0, len(wav) - win, hop):
        e = (csum[i + win] - csum[i]) / win
        if e > best_e:
            best_e, best_i = e, i
    return wav[best_i:best_i + win]


def loop_fill(clip, length_n, xf_n):
    """Loop-crossfade clip to exactly length_n samples of continuous audio."""
    xf_n = int(min(xf_n, len(clip) // 2))
    out = clip.copy()
    while len(out) < length_n:
        out = equal_power_crossfade(out, clip, xf_n)
    return out[:length_n]


def _norm(wav, peak_db=-1.5):
    peak = np.max(np.abs(wav)) + 1e-9
    return (wav * (10 ** (peak_db / 20) / peak)).astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=140)
    ap.add_argument("--only", type=str, default=None, help="generate one section by name")
    ap.add_argument("--device", type=str, default="auto", choices=["auto", "cuda", "cpu"])
    ap.add_argument("--out", type=str, default=os.path.abspath(os.path.join(
        os.path.dirname(__file__), "../../surface/remotion/public/audio/grand-rapids-music-sao.wav")))
    ap.add_argument("--vibe", type=str, default="",
                    help="city-flavor descriptors appended to the style anchor "
                         "(e.g. 'rain-soaked ambient, mellow, Pacific Northwest')")
    ap.add_argument("--seed", type=int, default=42, help="base seed (vary per city)")
    args = ap.parse_args()

    anchor = ANCHOR + (f", {args.vibe}" if args.vibe else "")

    import torch
    import soundfile as sf
    from diffusers import StableAudioPipeline

    dev = args.device
    if dev == "auto":
        dev = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if dev == "cuda" else torch.float32
    print(f"[sao] loading {MODEL} on {dev} ({dtype})…", flush=True)
    pipe = StableAudioPipeline.from_pretrained(MODEL, torch_dtype=dtype)
    if dev == "cuda":
        pipe.enable_model_cpu_offload()
        try:
            pipe.enable_attention_slicing()
        except Exception:
            pass
    else:
        pipe = pipe.to("cpu")

    def gen(name, gen_s, detail, seed):
        prompt = f"{anchor}. {detail}."
        g = torch.Generator(device="cpu" if dev == "cpu" else "cuda").manual_seed(seed)
        end = max(float(gen_s), 12.0)
        print(f"[sao] {name}: gen {end:.0f}s, {args.steps} steps…", flush=True)
        out = pipe(prompt, negative_prompt=NEG, num_inference_steps=args.steps,
                   audio_end_in_s=end, num_waveforms_per_prompt=1, generator=g).audios
        wav = out[0].to(torch.float32).cpu().numpy().T
        if wav.ndim == 1:
            wav = np.stack([wav, wav], axis=1)
        return wav

    if args.only:
        sec = [s for s in SECTIONS if s[0] == args.only]
        if not sec:
            sys.exit(f"no section named {args.only!r}")
        name, phase_s, core_s, _lvl, detail = sec[0]
        raw = gen(name, core_s + 8, detail, seed=args.seed)
        core = densest_window(raw, core_s)
        filled = loop_fill(core, int(phase_s * SR), int(CF * SR))
        single = os.path.splitext(args.out)[0] + f".{name}.wav"
        sf.write(single, _norm(filled), SR)
        print(f"[sao] wrote {single} ({len(filled)/SR:.1f}s continuous)")
        return

    # --- continuous bed across the whole track ---
    bed_raw = gen("bed", BED_CORE + 8, BED, seed=args.seed + 100)
    bed_core = densest_window(bed_raw, BED_CORE)
    bed = loop_fill(bed_core, int(TOTAL * SR), int(CF * SR))

    # --- section layer: each section densest-window looped to fill, crossfaded ---
    top = None
    for i, (name, phase_s, core_s, lvl, detail) in enumerate(SECTIONS):
        raw = gen(name, core_s + 8, detail, seed=args.seed + i)
        core = densest_window(raw, core_s)
        # fill a bit longer than the phase so the crossfade into the next section
        # doesn't eat the phase's own content.
        filled = loop_fill(core, int((phase_s + CF) * SR), int(CF * SR)) * lvl
        top = filled if top is None else equal_power_crossfade(top, filled, int(CF * SR))

    target = int(TOTAL * SR)
    if len(top) < target:
        top = loop_fill(top, target, int(CF * SR))
    top = top[:target]
    bed = bed[:target]

    mix = top + bed * BED_GAIN
    fe = int(1.2 * SR)  # gentle fade in/out at the very ends
    mix[:fe] *= np.linspace(0, 1, fe)[:, None]
    mix[-fe:] *= np.linspace(1, 0, fe)[:, None]

    sf.write(args.out, _norm(mix), SR)
    print(f"[sao] ✓ wrote {args.out} ({len(mix)/SR:.1f}s, continuous, peak −1.5 dBFS)")


if __name__ == "__main__":
    main()
