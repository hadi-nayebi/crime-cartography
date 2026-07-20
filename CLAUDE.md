# Crime Cartography — agent operating guide

Repeatable YouTube pipeline turning **sourced** city crime data into ~5:30
animated map videos (channel: **Earth One**). One reusable Remotion surface
(heat + points over time, counters, dispatch feed, long-arc trend) plugs into
many datasets: cities → counties → states → all-US. Public repo, built for
community trust and growth.

## BINDING rules

1. **Strict data honesty — never fabricate.** Every point, count, and figure
   shown on screen must be recomputed from `data/<slug>/normalized/*.json` and
   traceable to a citable source. NO synthesized dot positions, NO
   interpolation, NO bridging declared gaps. Aggregate-only periods are shown
   honestly (density/choropleth, disclosed) or deferred. Visible on-screen
   data-source credit always.
2. **Provenance per dataset.** Source URL, fetch date, license, field mapping,
   and every seam/artifact decision live in `data/<slug>/PROVENANCE.md` (+ the
   `wiki/Data-Provenance.md` index). Datasets are built by scripts, never by hand.
3. **Renderer of record = Remotion** (`surface/remotion/`), deterministic.
   One canonical bundle contract (beats/timeline/feed/summary/history/
   neighborhoods/points/trend/basemap) feeds everything.
4. **Reproducible & proper.** Scripts not manual steps; committed configs;
   scoped git adds only (NEVER `git add -A` — concurrent routines share this
   repo); role-prefixed commit messages (driver:/producer:/note:/critic:/…).

## The operating model (read these before acting)

- **`experiment/FLEET.md`** — the routine team charter: roles, the FLOW model
  (publishable → published, owner-clicked, ≤6/24h max, starvation = alarm),
  and the STATE LAYER (shared-memory files with tiered write access:
  reviewers file notes; fixers own artifacts).
- **`.claude/memory/jobs/ACTIVE.md`** — durable ground truth. Chat dies at
  compact; THIS survives. Read first after any compact; update before every
  compact and at focus boundaries.
- **The owner (Hadi) is the only publisher.** His studio notes are the
  highest-priority input; his APPROVE flips the verify light; routines never
  upload, never flip privacy, never touch `pipeline/notify` constants.
- Studio dashboard: `localhost:4400` (systemd `crime-studio.service`).

## Canonical incident schema
`{ date:"YYYY-MM-DD", lat:Number, lng:Number, cat:"persons|property|society", type?, place? }`
NIBRS group → cat: Persons→`persons`, Property→`property`, Society→`society`.

## Hard operational lessons (do not relearn these)
- GPU is 4GB: music generation and Remotion renders are strictly serialized,
  never concurrent; check `nvidia-smi` and clean dead-holder zombies first.
- Locks (`experiment/.driver.lock`, `.notes.lock`, `.critic.lock`) are
  crash-safe by protocol: PID inside, `kill -0` liveness before honoring age,
  reclaim dead holders, release on exit.
- Verify disk state before acting on remembered status; a data sweep must
  mirror the RENDER's exact data path (window slice + join), not full-span data.
- Context hygiene: at ~40–50% context, update ACTIVE.md, then compact
  (`.claude/skills/self-compact/` exists for autonomous compaction when the
  owner is away; verify targeting with `--dry-run` before firing).

## Layout
`data/` raw+normalized · `pipeline/` fetch→normalize→validate→trend→basemap→
factsheet→dashboard→publish→notify · `surface/` remotion engine ·
`videos/<slug>/` config + youtube.json + render.lock + feedback + thumbnail ·
`experiment/` fleet charter, ledgers, playbooks, decisions · `wiki/` docs ·
`.claude/` tooling + durable memory.
