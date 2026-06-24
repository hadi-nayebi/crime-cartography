#!/usr/bin/env python3
"""Procedural tempo music bed for the crime-cartography video.

Built with the `music` skill (.claude/skills/music/SKILL.md) — apply that
checklist when editing. Self-generated, royalty-free numpy synthesis.

v0.2 — anti-monotony pass: a developed lead MOTIF (sequencing + rhythmic
displacement + rests), section-varied harmony (A-prog vs B-reharm every 4-bar
cycle), drum variation every 4 bars + boundary fills, per-note brightness
automation, kick-sidechained low bus. Arranged to the video's sections.

    python3 pipeline/audio/gen_music.py [--bpm 92]

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

rng = np.random.default_rng(42)  # deterministic


def nf(semis):  # semitones from A4 -> Hz
    return 440.0 * 2 ** (semis / 12.0)


# A natural-minor scale degrees (semitones from A)
SCALE = [0, 2, 3, 5, 7, 8, 10]


def deg(d, octave=0):
    """Scale degree -> semitones from A (d can exceed 6, wraps octaves)."""
    o = d // 7 + octave
    return SCALE[d % 7] + 12 * o


# chords: (root semis from A2, [chord-tone semis from A4 for arp/pad])
def chord(root_semis, tones):
    return (nf(root_semis - 24), [nf(s) for s in tones])


Am = chord(0,  [0, 3, 7])     # A C E
F  = chord(-4, [-4, 0, 3])    # F A C
C_ = chord(-9, [-9, -5, -2])  # C E G  (root low)
G  = chord(-2, [-2, 2, 5])    # G B D
Dm = chord(-7, [-7, -4, 0])   # D F A
Em = chord(-5, [-5, -1, 2])   # E G B

PROG_A = [Am, F, C_, G]       # i  VI III VII
PROG_B = [Dm, C_, G, Am]      # iv III VII i   (B-section reharm)

# motif: (scale-degree, duration in beats). A short idea, developed by transpose.
MOTIF = [(0, 0.5), (3, 0.5), (2, 1.0), (4, 0.5), (3, 0.5), (0, 1.0)]


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


def kick(dur=0.32):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 120 * np.exp(-t * 28) + 46
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    click = np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 200) * 0.4
    return (body + click) * 0.9


def snare(dur=0.2, g=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n) * np.exp(-t * 22)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 26) * 0.5
    return (noise * 0.7 + tone) * 0.65 * g


def hat(dur=0.05, opn=False, g=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n) * np.exp(-t * (9 if opn else 60))
    hp = noise - np.convolve(noise, np.ones(8) / 8, mode="same")
    return hp * (0.32 if opn else 0.22) * g


def bass(freq, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    sig = (np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * 2 * freq * t)
           + 0.5 * np.sin(2 * np.pi * 0.5 * freq * t))
    return np.tanh(sig * 1.4) * env(n, 0.006, dur * 0.6, 0.5, min(0.05, dur * 0.3)) * 0.5


def tone_voice(freq, dur, bright, harmonics, amp, a=0.004, decay_frac=0.9, sustain=0.0):
    """Generic plucked/lead tone; `bright` (0..1) scales upper-harmonic gain."""
    n = int(dur * SR); t = np.arange(n) / SR
    sig = np.sin(2 * np.pi * freq * t)
    for h, base in harmonics:  # (harmonic number, base gain)
        sig += base * (0.3 + bright) * np.sin(2 * np.pi * h * freq * t)
    return sig * env(n, a, dur * decay_frac, sustain, min(0.04, dur * 0.2)) * amp


def pluck(freq, dur, bright=0.5):
    return tone_voice(freq, dur, bright, [(2, 0.4), (3, 0.18)], 0.28)


def lead(freq, dur, bright=0.6):
    return tone_voice(freq, dur, bright, [(2, 0.5), (3, 0.25), (4, 0.12)], 0.34,
                      a=0.008, decay_frac=0.8, sustain=0.25)


def pad(freqs, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    sig = sum(np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2 * t) for f in freqs)
    return sig / len(freqs) * env(n, dur * 0.25, 0, 1.0, dur * 0.3) * 0.16


def riser(dur):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 200 * 2 ** (t / dur * 2.2)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / dur) ** 2 * 0.18
            + rng.standard_normal(n) * (t / dur) ** 3 * 0.12)


# ---------- master buffers ----------
NS = int(DUR * SR)
drums_l = np.zeros(NS); drums_r = np.zeros(NS)
bright_l = np.zeros(NS); bright_r = np.zeros(NS)   # arp + lead (sit on top)
low_l = np.zeros(NS); low_r = np.zeros(NS)         # bass + pad (sidechained)
duck = np.ones(NS)


def place(L, R, s, at, g=1.0, pan=0.0):
    i = int(at * SR)
    if i >= NS: return
    seg = s[:NS - i]
    L[i:i + len(seg)] += seg * g * (1 - max(0, pan))
    R[i:i + len(seg)] += seg * g * (1 + min(0, pan))


def add_kick(at, g=1.0):
    place(drums_l, drums_r, kick(), at, g)
    i = int(at * SR); n = int(0.28 * SR)
    if i < NS:
        dip = 1 - 0.5 * np.exp(-np.arange(min(n, NS - i)) / SR * 14)
        duck[i:i + len(dip)] = np.minimum(duck[i:i + len(dip)], dip)


def brightness_at(t):  # slow timbral automation (≈26s period)
    return 0.5 + 0.5 * np.sin(2 * np.pi * t / 26.0)


def main(bpm):
    BEAT = 60.0 / bpm; bar = BEAT * 4; six = BEAT / 4
    t = 0.0; bi = 0
    while t < DUR:
        if t < P["method"]: intensity = 0
        elif t < P["history"]: intensity = 1
        elif t < P["transition"]: intensity = 2
        elif t < P["granular"]: intensity = 4
        elif t < P["reveal"]: intensity = 5
        elif t < P["outro"]: intensity = 3
        else: intensity = 1

        cycle = bi % 4            # position in 4-bar cycle
        macro = (bi // 4)         # which 4-bar cycle
        prog = PROG_B if (intensity >= 4 and macro % 2 == 1) else PROG_A
        root, tones = prog[cycle]
        br = float(brightness_at(t))

        # pad
        place(low_l, low_r, pad(tones, bar * 1.02), t, 1.0)

        for b in range(4):
            bt = t + b * BEAT
            if bt >= DUR: break
            # ---- kick ----
            if intensity == 1 and b in (0, 2): add_kick(bt, 0.5)
            elif intensity == 2 and b in (0, 2): add_kick(bt, 0.7)
            elif intensity >= 4:
                add_kick(bt, 0.95)
                if b in (1, 3): add_kick(bt + six * 2, 0.5)
            elif intensity == 3 and b == 0: add_kick(bt, 0.8)
            # ---- snare (+ ghost variation every other cycle) ----
            if intensity >= 4 and b in (1, 3):
                place(drums_l, drums_r, snare(), bt, 0.8)
                if macro % 2 == 1 and b == 3:
                    place(drums_l, drums_r, snare(0.1, 0.3), bt + six * 2, 0.3)  # ghost
            elif intensity == 2 and b == 2: place(drums_l, drums_r, snare(g=0.5), bt, 0.35)
            elif intensity == 3 and b == 2: place(drums_l, drums_r, snare(), bt, 0.6)
            # ---- hats (pattern varies by cycle) ----
            if intensity >= 2:
                sub = 4 if intensity >= 4 else 2
                for s in range(sub):
                    ht = bt + s * (BEAT / sub)
                    opn = (intensity >= 4 and s == sub // 2 and b in (1, 3))
                    skip = (intensity >= 4 and cycle == 3 and s == 1 and b == 2)  # tiny rest
                    if skip: continue
                    place(drums_l, drums_r, hat(opn=opn, g=0.6 if intensity >= 4 else 0.4),
                          ht, 1.0, pan=0.25 if s % 2 else -0.2)
            # ---- bass ----
            if intensity >= 4:
                place(low_l, low_r, bass(root, BEAT * 0.9), bt, 0.9)
                place(low_l, low_r, bass(root, six * 1.6), bt + six * 2, 0.6)
            elif intensity in (2, 3) and b in (0, 2):
                place(low_l, low_r, bass(root, BEAT * 1.6), bt, 0.7)
            # ---- arp (granular/reveal) ----
            if intensity >= 4:
                for s in range(2):
                    at = bt + s * (BEAT / 2)
                    tn = tones[(b * 2 + s) % 3] * 2
                    place(bright_l, bright_r, pluck(tn, BEAT / 2 * 0.95, br), at, 0.6,
                          pan=0.3 if s else -0.3)
            elif intensity == 3:
                place(bright_l, bright_r, pluck(tones[b % 3] * 2, BEAT * 0.9, br), bt, 0.5)

        # ---- LEAD MOTIF: develop over granular + reveal, with rests ----
        if intensity >= 4:
            play_motif = (cycle in (0, 1)) or (cycle == 3 and macro % 2 == 0)  # rest some bars
            if play_motif:
                # sequence: start motif on the bar's chord root degree; octave hops
                base_deg = {0: 0, -4: 5, -9: 2, -2: 6, -7: 3, -5: 4}.get(
                    round(np.log2(root / nf(-24)) * 12) if False else 0, 0)
                # pick start degree from chord tone (root), displace rhythm on odd cycles
                start = 0 if cycle % 2 == 0 else 2
                disp = six * 2 if (macro % 2 == 1) else 0.0  # rhythmic displacement
                mt = t + disp
                for (d, dlen) in MOTIF:
                    nd = (start + d)
                    freq = nf(deg(nd, octave=1))  # one octave up for lead presence
                    if mt < DUR:
                        place(bright_l, bright_r, lead(freq, BEAT * dlen * 0.92, br),
                              mt, 0.5, pan=0.0)
                    mt += BEAT * dlen
        elif intensity == 5:
            pass

        # ---- fill at the last bar of each 4-bar cycle (granular) ----
        if intensity >= 4 and cycle == 3:
            for s in range(4):
                place(drums_l, drums_r, snare(0.1, 0.4 + s * 0.12), t + 3 * BEAT + s * (BEAT / 4),
                      0.4 + s * 0.1)

        # ---- transition fill + riser into the drop ----
        if P["transition"] <= t < P["granular"] and (P["granular"] - t) <= bar * 1.2:
            for s in range(8):
                place(drums_l, drums_r, snare(0.12), t + s * (bar / 8), 0.3 + s * 0.05)
            place(drums_l, drums_r, riser(P["granular"] - t), t, 0.9)

        t += bar; bi += 1

    # mix: duck low bus, sum buses
    low_l_d = low_l * duck; low_r_d = low_r * duck
    L = drums_l + bright_l + low_l_d
    R = drums_r + bright_r + low_r_d
    L = np.tanh(L * 1.05); R = np.tanh(R * 1.05)
    peak = max(np.max(np.abs(L)), np.max(np.abs(R)), 1e-6)
    g = (10 ** (-1.5 / 20)) / peak
    L *= g; R *= g

    st = np.empty(NS * 2, dtype=np.int16)
    st[0::2] = np.clip(L * 32767, -32768, 32767).astype(np.int16)
    st[1::2] = np.clip(R * 32767, -32768, 32767).astype(np.int16)
    out = os.path.abspath(os.path.join(os.path.dirname(__file__),
          "../../surface/remotion/public/audio/grand-rapids-music.wav"))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with wave.open(out, "w") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
    print(f"✓ wrote {out} ({os.path.getsize(out)/1e6:.1f} MB, {DUR:.0f}s @ {bpm} BPM)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--bpm", type=int, default=92)
    main(ap.parse_args().bpm)
