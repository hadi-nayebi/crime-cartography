# Audio generation

The video's score is **not data** — it carries no figures and makes no factual
claim. Three royalty-free generators live here; **only one is wired into the
current video.**

| Script | Engine | Output file | Role |
|--------|--------|-------------|------|
| `gen_stable_audio.py` | Stable Audio Open 1.0 (neural, GPU) | `grand-rapids-music-sao.wav` | **Canonical** — what the current video uses |
| `gen_music.py` | numpy synthesis (CPU, no model) | `grand-rapids-music.wav` | Fallback — offline / no-GPU |
| `gen-bed.mjs` | Node drone + binaural bed | `grand-rapids.wav` | Alternate ambient bed |

All write into `surface/remotion/public/audio/` (gitignored — regenerate locally).

The video plays whatever `audioSrc` points to in
`videos/grand-rapids-mi/config.json` (and the default in `surface/remotion/src/Root.tsx`).
To switch beds, change `audioSrc` to the matching filename above.

## Canonical: Stable Audio Open

```bash
# one-time: create venv + install, accept the gated model, log in
python3 -m venv ~/.venvs/stableaudio
~/.venvs/stableaudio/bin/pip install torch diffusers transformers accelerate soundfile sentencepiece torchsde "huggingface_hub[cli]"
# accept terms at https://huggingface.co/stabilityai/stable-audio-open-1.0, then:
~/.venvs/stableaudio/bin/hf auth login --token hf_YOUR_READ_TOKEN

# generate the full 5:30 score (~13 min on a 4 GB GPU)
~/.venvs/stableaudio/bin/python pipeline/audio/gen_stable_audio.py --steps 150
# quick single-section test:
~/.venvs/stableaudio/bin/python pipeline/audio/gen_stable_audio.py --only intro --steps 100
```

It prompts the model once per video **phase** (intro → history build → breakdown
→ granular → reveal → outro), crossfades the sections to 330 s, and normalizes to
−1.5 dBFS. Edit the `SECTIONS` list in the script to change the mood per phase.

**License:** Stable Audio Open is under the Stability AI Community License —
free including commercial use for creators/organizations under $1M/yr revenue.
See `data/grand-rapids-mi/PROVENANCE.md` → *Music / audio*.

## Fallback: procedural (`gen_music.py`)

No GPU, no model download — pure numpy. Useful for CI or offline builds.

```bash
python3 pipeline/audio/gen_music.py --bpm 62   # -> grand-rapids-music.wav
```

Then set `audioSrc: "audio/grand-rapids-music.wav"` in the config to use it.
Arrangement guidance lives in `.claude/skills/music/SKILL.md`.
