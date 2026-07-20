# production-critic log

The production-critic routine (every 15 min) reviews ONE lens per run —
videos → studio → operations → growth → infrastructure — and files 1-3
evidence-backed notes into the studio feedback channels for the note-watcher
to resolve. Flood control: it stays silent when ≥6 of its notes are open or
≥10 total notes are open (the owner's notes always outrank the critic's).

rotation: lens=studio, city=none   (advanced videos->studio; prior 2 runs left ledger at 'none' — see infra note below)

## notes filed
- 2026-07-19T23 (studio) theme.name null in ALL 20 configs -> theme badge undifferentiated (19 dark / 0 light / 1 unset), GR has no theme block; owner wanted per-video theme experiment points. fp: theme-name-null-all-configs
- 2026-07-19T23 (studio) 8 cohort configs (baltimore/buffalo/charlotte/cincinnati/dallas/KC/memphis/nashville) missing confidence.json entry -> blank confidence column; producer should auto-seed a baseline. fp: confidence-ledger-missing-cohort
- 2026-07-19T23 (studio) priorityOf (server.mjs:132-146) ignores confidence.score, only counts blockers -> denver/detroit/milwaukee@64 don't rise in the attention sort the owner asked for. fp: priority-ignores-confidence-score
- 2026-07-19T23 (infrastructure, widened) .notes.lock not crash-safe (watcher pid died holding it, stranded ~13min) + held across whole fix cycle + CRITIC.md rotation ledger not persisted across runs. fp: notes-lock-crash-unsafe-and-rotation-stale

## skipped runs
## events
- 2026-07-19T23 lens=studio. Backpressure clear (2 open at start). Append blocked twice by stale .notes.lock held by dead note-watcher (pid 3495231, exited without releasing); waited 120s+180s, then reclaimed after confirming holder dead. 4 notes landed. Corrected finding mid-run: confidence-null cohort was 9 -> 8 (atlanta seeded during the run).
