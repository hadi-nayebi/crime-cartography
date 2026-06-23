# Crime Cartography — agent operating guide

Repeatable YouTube pipeline that turns **sourced** city crime data into engaging ~5-min animated map videos. One reusable visual **surface** (heat + points over time, counters, dispatch feed, narrative) plugs into many datasets: cities → counties → states → all-US. Public repo, built for community growth.

## BINDING rules

1. **Strict data honesty — never fabricate.** Every point, count, and figure shown on screen must be factually sourced with a reliable, citable link. NO synthesized/"approximate" dot positions. If a period only has aggregate counts (no coordinates), visualize it honestly (choropleth/counts) or defer it — never invent points. Keep a visible on-screen data-source credit.
2. **Provenance per dataset.** Every dataset records its source URL, fetch date, license, and field mapping in `data/<slug>/PROVENANCE.md` and the `wiki/Data-Provenance.md` index. Build datasets via workflows.
3. **Renderer of record = Remotion** (`surface/remotion/`), deterministic export. The Leaflet HTML (`surface/preview/`) is a live preview/scrub tool only. One canonical data contract feeds both.
4. **Reproducible & proper.** Scripts not manual steps; committed configs; documented in the wiki. Triple-check every few steps.

## Canonical incident schema
`{ date:"YYYY-MM-DD", lat:Number, lng:Number, cat:"persons|property|society", type?, place? }`
NIBRS group → cat: Persons→`persons`, Property→`property`, Society→`society`.

## Durable state / memory
`.claude/memory/jobs/ACTIVE.md` is ground truth — chat dies at `/compact`. **Read it first** after any compact; **update it before** every compact and at each focus boundary.

## Self-compact protocol (Rule: ~40% context floor)
At ~40% context (don't ask — just do it): (1) write latest state to `.claude/memory/jobs/ACTIVE.md`, (2) fire:
```bash
bash .claude/skills/self-compact/self-compact.sh "<DIRECTIVE>" "<FOLLOWUP>"
```
It auto-targets `$TMUX_PANE` (= `%3`, session `yt-re`) and NEVER the sibling panes. Directive/follow-up must satisfy the shape gate (see `.claude/skills/self-compact/SKILL.md`). Verify with `--check-shape` / `--dry-run` (must print `TARGET=%3`) when in doubt. Write state BEFORE firing — context loss between compact and follow-up is real.

## Layout
`data/` raw+normalized · `pipeline/` fetch→normalize→validate · `surface/` remotion+preview · `videos/<city>/` config+output · `wiki/` docs · `.claude/` tooling+memory.
