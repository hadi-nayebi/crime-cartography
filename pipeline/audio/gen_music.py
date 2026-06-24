#!/usr/bin/env python3
"""Procedural cinematic music bed for the crime-cartography video.

Built with the `music` skill (.claude/skills/music/SKILL.md) — apply that
checklist when editing. Self-generated, royalty-free numpy synthesis.

v0.3 — "cinematic-documentary" pass, modelled on an analysis of a reference
Suno track ("The Cost of Silence"): slow ~62 BPM half-time feel, sparse piano
+ sustained strings + deep sub bass, muted percussion that only enters later,
and ONE long tension-and-release arc — a dark sub-heavy intro, a slowly
brightening crescendo (a real time-varying low-pass that OPENS across the
piece, via scipy), a genuine BREAKDOWN at the era transition, then a fuller,
brighter climax with a borrowed bII (B-flat / Neapolitan) color, then a
resolve. Arranged to the video's phases.

    python3 pipeline/audio/gen_music.py [--bpm 62]

Output: surface/remotion/public/audio/grand-rapids-music.wav
"""
import argparse
import os
import wave
import numpy as np
from scipy.signal import butter, lfilter, lfilter_zi

SR = 44100
DUR = 330.0  # must match config.durationSec

# Section boundaries (seconds) -- mirror surface/remotion/src/theme.ts PHASES.
P = dict(cold=0, method=13, history=39, transition=150,
         granular=163, reveal=292, outro=318, end=330)

rng = np.random.default_rng(42)  # deterministic


def nf(semis):  # semitones from A4 -> Hz
    return 440.0 * 2 ** (semis / 12.0)


# A natural-minor scale degrees (semitones from A)
SCALE = [0, 2, 3, 5, 7, 8, 10]


def deg(d, octave=0):
    o = d // 7 + octave
    return SCALE[d % 7] + 12 * o


def chord(root_semis, tones):
    """(bass freq two octaves down, [pad/keys freqs around A4])."""
    return (nf(root_semis - 24), [nf(s) for s in tones])


Am = chord(0,  [0, 3, 7])      # A  C  E
F  = chord(-4, [-4, 0, 3])     # F  A  C
C_ = chord(-9, [-9, -5, -2])   # C  E  G
G  = chord(-2, [-2, 2, 5])     # G  B  D
Dm = chord(-7, [-7, -4, 0])    # D  F  A
Bb = chord(1,  [1, 5, 8])      # Bb D  F   (bII Neapolitan — the dark color)

PROG_INTRO  = [Am, F]               # i  VI   (slow, two bars each)
PROG_HIST   = [Am, F, C_, G]        # i  VI III VII  (the long crescendo)
PROG_GRAN_A = [Am, F, C_, G]
PROG_GRAN_B = [Dm, C_, G, Am]       # iv III VII i   (B-section reharm)
PROG_REVEAL = [Am, F, Bb, G]        # i  VI bII VII  (Neapolitan climax)

# Cinematic motif (scale-degree, beats). Spacious, descending-leaning, with rests.
MOTIF = [(4, 1.0), (3, 1.0), (2, 2.0), (0, 1.0), (2, 1.0), (4, 2.0)]


# ---------- envelope + voices ----------
def env(n, a, d, s=0.0, r=0.0):
    e = np.zeros(n); i = 0
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na); i = na
    if nd and i < n:
        seg = min(nd, n - i); e[i:i + seg] = np.linspace(1, s, nd)[:seg]; i += seg
    if i < n: e[i:] = s
    if nr and n - nr > 0: e[n - nr:] = np.linspace(e[n - nr], 0, nr)
    return e


def soft_kick(dur=0.5, g=1.0):
    """Round, muted cinematic kick (low, no sharp click)."""
    n = int(dur * SR); t = np.arange(n) / SR
    f = 95 * np.exp(-t * 22) + 42
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6)
    return body * 0.85 * g


def brush(dur=0.3, g=1.0):
    """Soft brushed-snare / muted clap — restrained, never a crack."""
    n = int(dur * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n) * np.exp(-t * 16)
    hp = noise - np.convolve(noise, np.ones(20) / 20, mode="same")
    tone = np.sin(2 * np.pi * 170 * t) * np.exp(-t * 24) * 0.3
    return (hp * 0.5 + tone) * 0.4 * g


def hat(dur=0.06, opn=False, g=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n) * np.exp(-t * (8 if opn else 55))
    hp = noise - np.convolve(noise, np.ones(8) / 8, mode="same")
    return hp * (0.18 if opn else 0.12) * g


def sub(freq, dur, g=1.0):
    """Deep sustained sub bass (near-sine + tiny 2nd harmonic for audibility)."""
    n = int(dur * SR); t = np.arange(n) / SR
    sig = np.sin(2 * np.pi * freq * t) + 0.18 * np.sin(2 * np.pi * 2 * freq * t)
    return sig * env(n, 0.04, dur * 0.5, 0.7, min(0.25, dur * 0.3)) * 0.42 * g


def keys(freq, dur, bright=0.5, g=1.0):
    """Piano-ish keys: a few harmonics, medium decay, gentle attack."""
    n = int(dur * SR); t = np.arange(n) / SR
    sig = np.sin(2 * np.pi * freq * t)
    sig += (0.45 + 0.4 * bright) * np.sin(2 * np.pi * 2 * freq * t)
    sig += (0.18 + 0.3 * bright) * np.sin(2 * np.pi * 3 * freq * t)
    sig += 0.08 * bright * np.sin(2 * np.pi * 4 * freq * t)
    return sig * env(n, 0.006, dur * 0.85, 0.0, min(0.05, dur * 0.2)) * 0.22 * g


def pluck(freq, dur, bright=0.5, g=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    sig = np.sin(2 * np.pi * freq * t)
    sig += (0.3 + bright) * 0.4 * np.sin(2 * np.pi * 2 * freq * t)
    sig += (0.3 + bright) * 0.18 * np.sin(2 * np.pi * 3 * freq * t)
    return sig * env(n, 0.004, dur * 0.9, 0.0, min(0.04, dur * 0.2)) * 0.2 * g


def strings(freqs, dur, g=1.0):
    """Sustained string-ish pad: detuned saws (additive) with slow swell."""
    n = int(dur * SR); t = np.arange(n) / SR
    sig = np.zeros(n)
    for f in freqs:
        for det in (-0.6, 0.0, 0.6):  # slight chorus/ensemble detune (Hz)
            ff = f + det
            for h in range(1, 7):     # band-limited-ish saw via few harmonics
                sig += (1.0 / h) * np.sin(2 * np.pi * ff * h * t) * (0.6 ** (h - 1))
    sig /= (len(freqs) * 3)
    return sig * env(n, dur * 0.3, 0, 1.0, dur * 0.35) * 0.12 * g


def shimmer(freqs, dur, g=1.0):
    """High airy bell cluster for the climax (slow attack, long tail)."""
    n = int(dur * SR); t = np.arange(n) / SR
    sig = sum(np.sin(2 * np.pi * f * 2 * t) + 0.5 * np.sin(2 * np.pi * f * 3 * t)
              for f in freqs) / len(freqs)
    return sig * env(n, dur * 0.4, 0, 1.0, dur * 0.4) * 0.05 * g


def riser(dur):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 180 * 2 ** (t / dur * 2.4)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / dur) ** 2 * 0.16
            + rng.standard_normal(n) * (t / dur) ** 3 * 0.10)


# ---------- master buffers ----------
NS = int(DUR * SR)
drums_l = np.zeros(NS); drums_r = np.zeros(NS)
color_l = np.zeros(NS); color_r = np.zeros(NS)   # keys+strings+arp+shimmer -> swept LPF
low_l = np.zeros(NS); low_r = np.zeros(NS)        # sub bass (unfiltered, sidechained)
duck = np.ones(NS)


def place(L, R, s, at, g=1.0, pan=0.0):
    i = int(at * SR)
    if i >= NS or len(s) == 0: return
    seg = s[:NS - i]
    L[i:i + len(seg)] += seg * g * (1 - max(0, pan))
    R[i:i + len(seg)] += seg * g * (1 + min(0, pan))


def add_kick(at, g=1.0):
    place(drums_l, drums_r, soft_kick(g=g), at, 1.0)
    i = int(at * SR); n = int(0.4 * SR)
    if i < NS:
        dip = 1 - 0.45 * np.exp(-np.arange(min(n, NS - i)) / SR * 10)
        duck[i:i + len(dip)] = np.minimum(duck[i:i + len(dip)], dip)


# ---------- automation curves (keyframed, smooth) ----------
# Brightness cutoff (Hz) for the color bus — OPENS across the piece, dips at
# the breakdown, peaks at the climax. Mirrors the reference track's centroid arc.
CUT_T = [0,   13,  39,  95,  150,  156, 163, 210,  292,  305,  318,  330]
CUT_V = [320, 360, 460, 760, 1050, 480, 700, 1200, 1750, 1700, 1100, 480]

# Overall dynamic level (so the breakdown breathes and the climax lifts).
LVL_T = [0,   13,  39,  120,  150,  158,  163, 200,  292, 305, 318, 330]
LVL_V = [0.5, 0.7, 0.8, 0.95, 0.85, 0.45, 0.8, 0.95, 1.0, 1.0, 0.7, 0.45]


def bright_at(t):
    c = np.interp(t, CUT_T, CUT_V)
    return float(np.clip((c - 320) / (1750 - 320), 0, 1))


def block_lowpass(sig):
    """Time-varying 2nd-order low-pass following the CUT curve. Block-wise
    butter + lfilter with carried state — cheap and smooth."""
    out = np.empty_like(sig)
    B = 2048
    zi = None
    for i in range(0, len(sig), B):
        t = (i + B / 2) / SR
        fc = float(np.clip(np.interp(t, CUT_T, CUT_V), 150, SR * 0.45))
        b, a = butter(2, fc / (SR / 2), btype="low")
        if zi is None:
            zi = lfilter_zi(b, a) * sig[i]
        seg, zi = lfilter(b, a, sig[i:i + B], zi=zi)
        out[i:i + len(seg)] = seg
    return out


def main(bpm):
    BEAT = 60.0 / bpm; bar = BEAT * 4
    t = 0.0; bi = 0
    while t < DUR:
        if t < P["method"]:        sec = "cold"
        elif t < P["history"]:     sec = "method"
        elif t < P["transition"]:  sec = "history"
        elif t < P["granular"]:    sec = "transition"
        elif t < P["reveal"]:      sec = "granular"
        elif t < P["outro"]:       sec = "reveal"
        else:                      sec = "outro"

        macro = bi // 4
        cycle = bi % 4
        br = bright_at(t)

        # ---- harmony per section ----
        if sec in ("cold", "method"):
            root, tones = PROG_INTRO[(bi // 2) % 2]
        elif sec == "history":
            root, tones = PROG_HIST[bi % 4]
        elif sec == "transition":
            root, tones = Am
        elif sec == "granular":
            prog = PROG_GRAN_B if macro % 2 == 1 else PROG_GRAN_A
            root, tones = prog[cycle]
        elif sec == "reveal":
            root, tones = PROG_REVEAL[cycle]
        else:  # outro
            root, tones = Am

        # ---- sustained string pad (the harmonic bed, everywhere) ----
        spread = [tones[0] * 0.5] + tones  # add a lower octave for body
        place(color_l, color_r, strings(spread, bar * 1.03,
              g=0.7 if sec in ("cold", "transition", "outro") else 1.0), t, 1.0)

        # ---- deep sub bass on the chord root (slow, sustained) ----
        if sec != "cold":
            sg = {"method": 0.6, "history": 0.8, "transition": 0.7,
                  "granular": 1.0, "reveal": 1.0, "outro": 0.6}[sec]
            place(low_l, low_r, sub(root, bar * 0.98, g=sg), t, 1.0)
            if sec in ("granular", "reveal"):  # add a half-bar push
                place(low_l, low_r, sub(root, BEAT * 1.6, g=sg * 0.7), t + bar / 2, 1.0)

        # ---- muted percussion: only mid/late, half-time, restrained ----
        if sec == "history" and t >= 95:               # enters halfway through history
            add_kick(t, 0.5)
            place(drums_l, drums_r, brush(g=0.4), t + BEAT * 2, 1.0)
        elif sec in ("granular", "reveal"):
            add_kick(t, 0.9 if sec == "reveal" else 0.8)             # beat 1
            add_kick(t + BEAT * 2, 0.5)                               # soft beat 3
            place(drums_l, drums_r, brush(g=0.7), t + BEAT * 2, 1.0)  # backbeat on 3
            if sec == "reveal":
                place(drums_l, drums_r, brush(0.2, 0.3), t + BEAT * 3, 0.5)  # ghost
            for s in range(8):  # soft 8th-note brush hats with rests + pan
                if (cycle == 3 and s == 5) or (s == 7 and macro % 2 == 0):
                    continue  # deliberate rests
                place(drums_l, drums_r, hat(opn=(s == 4), g=0.6),
                      t + s * (BEAT / 2), 1.0, pan=0.22 if s % 2 else -0.18)
        elif sec == "outro" and cycle == 0:
            add_kick(t, 0.4)

        # ---- piano/keys motif: sparse in method/history, fuller later ----
        play_keys = (
            (sec == "method") or
            (sec == "history" and cycle in (0, 2)) or
            (sec in ("granular", "reveal") and ((cycle in (0, 1)) or (cycle == 3 and macro % 2 == 0))) or
            (sec == "outro" and cycle == 0)
        )
        if play_keys:
            start = 0 if cycle % 2 == 0 else 2          # sequence the motif
            disp = (BEAT / 2) if (sec in ("granular", "reveal") and macro % 2 == 1) else 0.0
            mt = t + disp
            oct_ = 1 if sec in ("granular", "reveal") else 0
            for (d, dlen) in MOTIF:
                freq = nf(deg(start + d, octave=oct_))
                if mt < DUR:
                    place(color_l, color_r, keys(freq, BEAT * dlen * 0.95, br,
                          g=0.9 if sec in ("granular", "reveal") else 0.7),
                          mt, 1.0, pan=0.0)
                mt += BEAT * dlen

        # ---- arpeggio sparkle (granular/reveal only) ----
        if sec in ("granular", "reveal"):
            for b in range(4):
                for s in range(2):
                    at = t + b * BEAT + s * (BEAT / 2)
                    tn = tones[(b * 2 + s) % 3] * 2
                    place(color_l, color_r, pluck(tn, BEAT / 2 * 0.95, br, g=0.7),
                          at, 1.0, pan=0.3 if s else -0.3)

        # ---- shimmer/air on top of the climax ----
        if sec == "reveal":
            place(color_l, color_r, shimmer([tones[1] * 2, tones[2] * 2], bar, g=1.0), t, 1.0)

        # ---- fill at the last bar of each 4-bar cycle (granular/reveal) ----
        if sec in ("granular", "reveal") and cycle == 3:
            for s in range(4):
                place(drums_l, drums_r, brush(0.12, 0.4 + s * 0.12),
                      t + 3 * BEAT + s * (BEAT / 4), 0.4 + s * 0.1)

        # ---- breakdown: strip drums, build a riser into the granular drop ----
        if sec == "transition" and (P["granular"] - t) <= bar * 1.2:
            place(color_l, color_r, riser(P["granular"] - t), t, 0.9)
            for s in range(4):
                place(drums_l, drums_r, brush(0.12, 0.3 + s * 0.12),
                      t + (P["granular"] - t) * (s / 4), 0.4)

        t += bar; bi += 1

    # ---- mix ----
    cl = block_lowpass(color_l); cr = block_lowpass(color_r)   # the sweep
    low_l_d = low_l * duck; low_r_d = low_r * duck             # sidechain sub
    L = drums_l + cl + low_l_d
    R = drums_r + cr + low_r_d

    # overall dynamic-level automation (breakdown breathes, climax lifts)
    tline = np.arange(NS) / SR
    lvl = np.interp(tline, LVL_T, LVL_V)
    L *= lvl; R *= lvl

    L = np.tanh(L * 1.02); R = np.tanh(R * 1.02)
    peak = max(np.max(np.abs(L)), np.max(np.abs(R)), 1e-6)
    g = (10 ** (-1.5 / 20)) / peak     # peak -1.5 dBFS, NO clipping
    L *= g; R *= g

    st = np.empty(NS * 2, dtype=np.int16)
    st[0::2] = np.clip(L * 32767, -32768, 32767).astype(np.int16)
    st[1::2] = np.clip(R * 32767, -32768, 32767).astype(np.int16)
    out = os.path.abspath(os.path.join(os.path.dirname(__file__),
          "../../surface/remotion/public/audio/grand-rapids-music.wav"))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with wave.open(out, "w") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
    print(f"✓ wrote {out} ({os.path.getsize(out)/1e6:.1f} MB, {DUR:.0f}s @ {bpm} BPM, v0.3)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--bpm", type=int, default=62)
    main(ap.parse_args().bpm)
