#!/usr/bin/env python3
"""Cinematic music bed via Stable Audio Open (free, open weights).

Generates the crime-cartography video's 5:30 score by prompting Stable Audio
Open per video PHASE (so musical section changes land on the visual section
changes — music skill principle #9), then arranging the sections with
equal-power crossfades, normalising to −1.5 dBFS. Output replaces the
procedural bed.

Model: stabilityai/stable-audio-open-1.0 (Stability AI Community License —
commercial use permitted for creators under $1M/yr revenue). The weights are
license-gated: you must accept the terms on HuggingFace and `huggingface-cli
login` once before running this.

    # full 5:30 score:
    ~/.venvs/stableaudio/bin/python pipeline/audio/gen_stable_audio.py
    # quick single-section test (writes <out>.<name>.wav):
    ~/.venvs/stableaudio/bin/python pipeline/audio/gen_stable_audio.py --only intro --steps 100

Run with the venv python that has torch+diffusers installed.
"""
import argparse
import os
import sys
import numpy as np

MODEL = "stabilityai/stable-audio-open-1.0"
SR = 44100
TOTAL = 330.0  # must match config.durationSec
CF = 1.2       # crossfade seconds between sections
NEG = "low quality, distorted, clipping, harsh noise, vocals, singing, lyrics, speech"

# Shared style anchor keeps gens tonally compatible (same key/tempo/instrument set).
ANCHOR = ("instrumental cinematic documentary score, A minor, around 60 BPM, "
          "sparse grand piano, sustained warm strings, deep sub bass, tasteful, "
          "emotional, restrained, film score, high quality")

# (name, seconds, prompt-detail) — durations sum to ~TOTAL (crossfades overlap).
# Mirrors theme.ts PHASES: cold/method 0-39, history 39-150, transition 150-163,
# granular 163-292, reveal 292-318, outro 318-330.
SECTIONS = [
    ("intro",      40, "very sparse and quiet opening, lone piano notes and a dark "
                       "low drone, tense and contemplative, no drums, slow"),
    ("hist1",      40, "slowly building, gentle piano motif over warm sustained "
                       "strings, contemplative, minimal, no drums yet"),
    ("hist2",      40, "continuing to build, fuller strings, soft muted heartbeat "
                       "percussion entering quietly, growing tension, documentary"),
    ("hist3",      37, "rising cinematic crescendo, swelling strings and low brass, "
                       "soft taiko-style drums, serious and tense, building"),
    ("breakdown",  14, "sudden breakdown, everything strips back to a single "
                       "sustained low drone and a slow reverse-cymbal riser, "
                       "anticipation, no beat"),
    ("gran1",      44, "the music opens up, steady restrained cinematic-electronic "
                       "groove, muted kick and soft brushed percussion, arpeggiated "
                       "synth, propulsive but controlled, A minor"),
    ("gran2",      44, "driving cinematic-electronic, pulsing bassline, "
                       "arpeggios and piano, momentum, controlled energy, A minor"),
    ("gran3",      43, "fuller driving section, layered synths and strings, steady "
                       "muted drums, forward momentum, tense and modern"),
    ("reveal",     27, "emotional cinematic climax, full soaring strings and piano, "
                       "brighter, a dramatic Neapolitan B-flat color, powerful but "
                       "not triumphant, resolving"),
    ("outro",      14, "gentle resolve, solo piano and fading strings, quiet, "
                       "reflective, slowing to a stop, A minor"),
]


def equal_power_crossfade(a, b, n):
    """Crossfade tail of a (n samples) into head of b; returns concatenation."""
    n = min(n, len(a), len(b))
    if n <= 0:
        return np.concatenate([a, b], axis=0)
    t = np.linspace(0, 1, n)[:, None]
    fo, fi = np.cos(t * np.pi / 2), np.sin(t * np.pi / 2)  # equal-power
    mid = a[-n:] * fo + b[:n] * fi
    return np.concatenate([a[:-n], mid, b[n:]], axis=0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=140)
    ap.add_argument("--only", type=str, default=None, help="generate one section by name")
    ap.add_argument("--device", type=str, default="auto", choices=["auto", "cuda", "cpu"])
    ap.add_argument("--out", type=str, default=os.path.abspath(os.path.join(
        os.path.dirname(__file__), "../../surface/remotion/public/audio/grand-rapids-music-sao.wav")))
    args = ap.parse_args()

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
        # fit a 4 GB laptop GPU: offload submodules to GPU only when active.
        pipe.enable_model_cpu_offload()
        try:
            pipe.enable_attention_slicing()
        except Exception:
            pass
    else:
        pipe = pipe.to("cpu")

    def gen(name, seconds, detail, seed):
        prompt = f"{ANCHOR}. {detail}."
        g = torch.Generator(device="cpu" if dev == "cpu" else "cuda").manual_seed(seed)
        print(f"[sao] {name}: {seconds}s, {args.steps} steps…", flush=True)
        end = max(float(seconds) + CF, 10.0)
        out = pipe(prompt, negative_prompt=NEG, num_inference_steps=args.steps,
                   audio_end_in_s=end, num_waveforms_per_prompt=1, generator=g).audios
        wav = out[0].to(torch.float32).cpu().numpy().T   # (samples, channels)
        if wav.ndim == 1:
            wav = np.stack([wav, wav], axis=1)
        return wav

    sections = SECTIONS
    if args.only:
        sections = [s for s in SECTIONS if s[0] == args.only]
        if not sections:
            sys.exit(f"no section named {args.only!r}")

    pieces = []
    for i, (name, secs, detail) in enumerate(sections):
        wav = gen(name, secs, detail, seed=42 + i)
        if args.only:
            single = os.path.splitext(args.out)[0] + f".{name}.wav"
            sf.write(single, _norm(wav), SR)
            print(f"[sao] wrote {single} ({len(wav)/SR:.1f}s)")
            return
        pieces.append((name, secs, wav))

    # arrange with crossfades, then trim/pad to exactly TOTAL
    cf_n = int(CF * SR)
    track = None
    for (name, secs, wav) in pieces:
        keep = int((secs + CF) * SR)
        wav = wav[:keep]
        track = wav if track is None else equal_power_crossfade(track, wav, cf_n)
    target = int(TOTAL * SR)
    if len(track) < target:
        track = np.pad(track, ((0, target - len(track)), (0, 0)))
    track = track[:target]
    # short fade in/out at the very ends
    fe = int(0.4 * SR)
    track[:fe] *= np.linspace(0, 1, fe)[:, None]
    track[-fe:] *= np.linspace(1, 0, fe)[:, None]

    sf.write(args.out, _norm(track), SR)
    print(f"[sao] ✓ wrote {args.out} ({len(track)/SR:.1f}s, peak −1.5 dBFS)")


def _norm(wav, peak_db=-1.5):
    peak = np.max(np.abs(wav)) + 1e-9
    return (wav * (10 ** (peak_db / 20) / peak)).astype(np.float32)


if __name__ == "__main__":
    main()
