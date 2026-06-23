#!/usr/bin/env python3
"""Procedural tempo music bed for the crime-cartography video.

Self-generated, royalty-free. Synthesizes a drum machine (kick/snare/hats), a
bassline, and chord/arpeggio voices at a fixed BPM, arranged to follow the
video's sections (calm history -> fill at the 2023 transition -> full groove in
the granular era -> breakdown at the reveal -> outro). A minor, restrained,
documentary feel.

    python3 pipeline/audio/gen_music.py [--bpm 88]

Output: surface/remotion/public/audio/grand-rapids-music.wav
"""
import argparse
import os
import wave
import numpy as np

SR = 44100
DUR = 330.0  # must match config.durationSec

# Section boundaries (seconds) -- mirror surface/remotion/src/theme.ts PHASES.
P = dict(cold=0, method=13, history=39, transition=150,
         granular=163, reveal=292, outro=318, end=330)

rng = np.random.default_rng(42)  # deterministic noise

# ---- note frequencies (A minor) ----
def nf(semitones_from_a4):
    return 440.0 * 2 ** (semitones_from_a4 / 12.0)

# chord progression (one per bar): Am - F - C - G  (i - VI - III - VII)
# each entry: (root_hz, [chord tone hz for arp/pad])
A2, F2, C3, G2 = nf(-24), nf(-28), nf(-21), nf(-26)
CHORDS = [
    (A2, [nf(0), nf(3), nf(7)]),    # Am: A C E
    (F2, [nf(-4), nf(0), nf(3)]),   # F:  F A C
    (C3, [nf(-9), nf(-5), nf(-2)]), # C:  C E G
    (G2, [nf(-2), nf(2), nf(5)]),   # G:  G B D
]


def env(n, attack, decay, sustain=0.0, release=0.0, hold=0.0):
    """Simple AD/ADSR envelope of length n samples (times in seconds)."""
    a = int(attack * SR); d = int(decay * SR)
    h = int(hold * SR); r = int(release * SR)
    e = np.zeros(n)
    i = 0
    if a: e[i:i+a] = np.linspace(0, 1, a); i += a
    if h and i < n: e[i:i+h] = 1.0; i += h
    if d and i < n:
        seg = min(d, n - i); e[i:i+seg] = np.linspace(1, sustain, d)[:seg]; i += seg
    if i < n: e[i:n] = sustain
    if r and n - r > 0:  # release tail overrides the end
        e[n-r:n] = np.linspace(e[n-r], 0, r)
    return e


def kick(dur=0.32):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 120 * np.exp(-t * 28) + 46          # pitch drop
    phase = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(phase) * np.exp(-t * 9)
    click = np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 200) * 0.4
    return (body + click) * 0.9


def snare(dur=0.2):
    n = int(dur * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n) * np.exp(-t * 22)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 26) * 0.5
    return (noise * 0.7 + tone) * 0.65


def hat(dur=0.05, opn=False):
    n = int(dur * SR); t = np.arange(n) / SR
    rate = 9 if opn else 60
    noise = rng.standard_normal(n) * np.exp(-t * rate)
    # crude high-pass: subtract a smoothed copy
    hp = noise - np.convolve(noise, np.ones(8) / 8, mode="same")
    return hp * (0.32 if opn else 0.22)


def bass(freq, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    sig = (np.sin(2 * np.pi * freq * t)
           + 0.35 * np.sin(2 * np.pi * 2 * freq * t)
           + 0.5 * np.sin(2 * np.pi * 0.5 * freq * t))  # sub
    sig = np.tanh(sig * 1.4)                              # gentle drive
    e = env(n, 0.006, dur * 0.6, sustain=0.5, release=min(0.05, dur * 0.3))
    return sig * e * 0.5


def pluck(freq, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    sig = (np.sin(2 * np.pi * freq * t)
           + 0.4 * np.sin(2 * np.pi * 2 * freq * t)
           + 0.18 * np.sin(2 * np.pi * 3 * freq * t))
    e = env(n, 0.003, dur * 0.9, sustain=0.0)
    return sig * e * 0.3


def pad(freqs, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    sig = np.zeros(n)
    for f in freqs:
        sig += np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2 * t)
    sig /= len(freqs)
    e = env(n, dur * 0.25, 0, sustain=1.0, release=dur * 0.3)
    return sig * e * 0.16


def riser(dur):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 200 * 2 ** (t / dur * 2.2)
    sweep = np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / dur) ** 2 * 0.18
    noise = rng.standard_normal(n) * (t / dur) ** 3 * 0.12
    return sweep + noise


# ---- master buffers ----
NSAMP = int(DUR * SR)
left = np.zeros(NSAMP)
right = np.zeros(NSAMP)
duck = np.ones(NSAMP)  # sidechain ducking driven by kicks


def add(buf_l, buf_r, sample, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= NSAMP:
        return
    seg = sample[: NSAMP - i]
    lg = gain * (1 - max(0, pan))
    rg = gain * (1 + min(0, pan))
    buf_l[i:i + len(seg)] += seg * lg
    buf_r[i:i + len(seg)] += seg * rg


def add_kick(at, gain=1.0):
    k = kick()
    add(left, right, k, at, gain)
    # carve a ducking dip into the sidechain bus for pads/bass
    i = int(at * SR); n = int(0.28 * SR)
    if i < NSAMP:
        dip = 1 - 0.55 * np.exp(-np.arange(min(n, NSAMP - i)) / SR * 14)
        duck[i:i + len(dip)] = np.minimum(duck[i:i + len(dip)], dip)


BEAT = 60.0 / 88  # set after arg parse below (placeholder)


def main(bpm):
    global BEAT
    BEAT = 60.0 / bpm
    bar = BEAT * 4
    sixteenth = BEAT / 4

    # bass/pad/arp go onto a separate bus so we can sidechain-duck them
    bl = np.zeros(NSAMP); br = np.zeros(NSAMP)

    def section(start, end):
        return max(0.0, end - start)

    # iterate bar by bar across the whole piece
    t = 0.0
    bar_idx = 0
    while t < DUR:
        chord_root, chord_tones = CHORDS[bar_idx % 4]
        # which section are we in?
        if t < P["method"]:
            intensity = 0  # cold open: pad only
        elif t < P["history"]:
            intensity = 1  # method: soft pulse
        elif t < P["transition"]:
            intensity = 2  # history: calm minimal beat
        elif t < P["granular"]:
            intensity = 4  # transition: build/fill
        elif t < P["reveal"]:
            intensity = 5  # granular: full groove
        elif t < P["outro"]:
            intensity = 3  # reveal: breakdown
        else:
            intensity = 1  # outro

        # ---- pad (all sections that aren't silent) ----
        if intensity >= 0:
            add(bl, br, pad(chord_tones, bar * 1.02), t, gain=1.0)

        # ---- drums + bass + arp per intensity ----
        for b in range(4):
            beat_t = t + b * BEAT
            if beat_t >= DUR:
                break
            # KICK
            if intensity == 1 and b in (0, 2):
                add_kick(beat_t, 0.5)
            elif intensity == 2 and b in (0, 2):
                add_kick(beat_t, 0.7)
            elif intensity >= 4:
                add_kick(beat_t, 0.95)
                if b in (1, 3):  # syncopated 'and'
                    add_kick(beat_t + sixteenth * 2, 0.5)
            elif intensity == 3 and b == 0:
                add_kick(beat_t, 0.8)
            # SNARE on 2 & 4
            if intensity >= 4 and b in (1, 3):
                add(left, right, snare(), beat_t, 0.8)
            elif intensity == 2 and b == 2:
                add(left, right, snare(), beat_t, 0.35)
            elif intensity == 3 and b == 2:
                add(left, right, snare(), beat_t, 0.6)
            # HATS
            if intensity >= 2:
                subdiv = 4 if intensity >= 4 else 2
                for s in range(subdiv):
                    ht = beat_t + s * (BEAT / subdiv)
                    opn = (intensity >= 4 and s == subdiv // 2 and b in (1, 3))
                    g = 0.6 if intensity >= 4 else 0.4
                    add(left, right, hat(opn=opn), ht, g, pan=0.25 if s % 2 else -0.2)
            # BASS (groove in granular/reveal, roots in history)
            if intensity >= 4:
                add(bl, br, bass(chord_root, BEAT * 0.9), beat_t, 0.9)
                add(bl, br, bass(chord_root, sixteenth * 1.6), beat_t + sixteenth * 2, 0.6)
            elif intensity in (2, 3):
                if b in (0, 2):
                    add(bl, br, bass(chord_root, BEAT * 1.6), beat_t, 0.7)
            # ARP (granular + reveal) -- 8th notes over chord tones
            if intensity >= 4:
                for s in range(2):
                    at = beat_t + s * (BEAT / 2)
                    tone = chord_tones[(b * 2 + s) % len(chord_tones)] * 2
                    add(bl, br, pluck(tone, BEAT / 2 * 0.95), at, 0.7, pan=0.3 if s else -0.3)
            elif intensity == 3:
                tone = chord_tones[b % len(chord_tones)] * 2
                add(bl, br, pluck(tone, BEAT * 0.9), beat_t, 0.5)

        # transition fill: snare roll + riser in the last bar before granular
        if P["transition"] <= t < P["granular"] and (P["granular"] - t) <= bar * 1.2:
            for s in range(8):
                add(left, right, snare(0.12), t + s * (bar / 8), 0.3 + s * 0.05)
            add(left, right, riser(P["granular"] - t), t, 0.9)

        t += bar
        bar_idx += 1

    # apply sidechain ducking to the melodic bus, then sum
    bl *= duck; br *= duck
    L = left + bl
    R = right + br

    # master: soft clip + normalize to about -1.5 dBFS
    L = np.tanh(L * 1.1); R = np.tanh(R * 1.1)
    peak = max(np.max(np.abs(L)), np.max(np.abs(R)), 1e-6)
    g = (10 ** (-1.5 / 20)) / peak
    L *= g; R *= g

    stereo = np.empty(NSAMP * 2, dtype=np.int16)
    stereo[0::2] = np.clip(L * 32767, -32768, 32767).astype(np.int16)
    stereo[1::2] = np.clip(R * 32767, -32768, 32767).astype(np.int16)

    out = os.path.join(os.path.dirname(__file__),
                       "../../surface/remotion/public/audio/grand-rapids-music.wav")
    out = os.path.abspath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with wave.open(out, "w") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(stereo.tobytes())
    print(f"✓ wrote {out} ({os.path.getsize(out)/1e6:.1f} MB, {DUR:.0f}s @ {bpm} BPM)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--bpm", type=int, default=88)
    main(ap.parse_args().bpm)
