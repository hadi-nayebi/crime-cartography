# Contributing

Thanks for your interest! This project turns **sourced** crime data into honest,
reproducible animated map videos. The bar for contributions is the same as the
bar for the videos: **every number on screen must be traceable to a real,
citable source — never fabricated.**

## The one rule that matters most

**Data honesty is non-negotiable.** No synthesized points, no "approximate"
positions, no invented counts. If only aggregate data exists, visualize it
honestly (counts / choropleth / density disclosed as density) or defer it. Keep
the on-screen source credit intact. See the [Principles](README.md#principles).

## Add a city

This is the most valuable contribution. It's a contained, documented job:

1. Read [`wiki/Add-a-City.md`](wiki/Add-a-City.md).
2. Find an open, sourced dataset; write a fetch adapter in `pipeline/sources/`.
3. Normalize to the [canonical schema](pipeline/schema.md), then
   `node pipeline/validate.mjs <slug>` must pass.
4. Record the source URL, fetch date, license, and field mapping in
   `data/<slug>/PROVENANCE.md` **and** [`wiki/Data-Provenance.md`](wiki/Data-Provenance.md).
5. Copy `videos/grand-rapids-mi/config.json` to `videos/<slug>/`, adjust, render.

Open an issue first if you're unsure a dataset qualifies — happy to help vet it.

## Code

- The Remotion surface is the **renderer of record** and must stay deterministic:
  all animation is a pure function of `frame`. No `Math.random` / `Date.now` /
  CSS transitions in render. See [`surface/remotion/README.md`](surface/remotion/README.md).
- Run `npm run lint` (eslint + tsc) in `surface/remotion/` before a PR.
- Keep new on-screen figures labeled with **what** they are and their **unit**,
  and consistent within a frame.

## Provenance for non-data assets

Music and other generated assets are fine if royalty-free and license-clear;
record the tool + license in `PROVENANCE.md` (see the Music / audio section as a
model). Don't commit large binaries — renders and audio are gitignored and
shared via Releases / links.
