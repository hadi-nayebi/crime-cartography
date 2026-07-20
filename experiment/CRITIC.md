# production-critic log

The production-critic routine (every 15 min) reviews ONE lens per run —
videos → studio → operations → growth → infrastructure — and files 1-3
evidence-backed notes into the studio feedback channels for the note-watcher
to resolve. Flood control: it stays silent when ≥6 of its notes are open or
≥10 total notes are open (the owner's notes always outrank the critic's).

rotation: lens=growth, city=none   (advanced operations->growth; NEXT run = infrastructure)

## notes filed
- 2026-07-19T23 (studio) theme.name null in ALL 20 configs -> theme badge undifferentiated (19 dark / 0 light / 1 unset), GR has no theme block; owner wanted per-video theme experiment points. fp: theme-name-null-all-configs
- 2026-07-19T23 (studio) 8 cohort configs (baltimore/buffalo/charlotte/cincinnati/dallas/KC/memphis/nashville) missing confidence.json entry -> blank confidence column; producer should auto-seed a baseline. fp: confidence-ledger-missing-cohort
- 2026-07-19T23 (studio) priorityOf (server.mjs:132-146) ignores confidence.score, only counts blockers -> denver/detroit/milwaukee@64 don't rise in the attention sort the owner asked for. fp: priority-ignores-confidence-score
- 2026-07-19T23 (infrastructure, widened) .notes.lock not crash-safe (watcher pid died holding it, stranded ~13min) + held across whole fix cycle + CRITIC.md rotation ledger not persisted across runs. fp: notes-lock-crash-unsafe-and-rotation-stale

- 2026-07-20T14 (operations) publish gate 'watch-through' blocker written TWO ways in confidence.json: 11 cities 'full watch-through with audio not yet logged' vs 9 'full end-to-end watch-through...' -> any string-matched batch-progress count/filter/auto-clear undercounts ~half. Canonicalize to one seeded constant. fp: watchthrough-blocker-two-phrasings
- 2026-07-20T14 (operations) a fresh APPROVE never strips the advisory 'watch-through' blocker from confidence.json (no code path) -> approved/publishable videos still show blocked, inflating priorityOf attention rank (l.142-143) + stale gatebar. Reconcile verified===true with the blocker. fp: approve-does-not-clear-blocker-ledger-drift
- 2026-07-20T14 (studio, via ops publish-flow review) publish modal gatebar (index.html:679) states a FALSE verify rule '(confidence X/100, needs >=95 + zero blockers)' contradicting server.mjs (ledger 'NEVER flips verify' l.333-334; verify = fresh Approve l.96,105) AND server's own doPublish error (l.375). Likely the root of owner's open Boston 'how do I turn on verify' complaint. Fix gatebar copy to match server. fp: gatebar-false-verify-requirement-95-blockers

- 2026-07-20T15 (growth) 0/20 videos have a composed thumbnail.jpg (server.mjs:361 composed=false all 20); only raw thumbs/ frames exist; owner's boston note asks for a COMPOSED stats+map thumbnail but no routine builds one -> add pipeline/publish compose step for all 20. Last cohort-wide publish-quality item at 0/20. fp: thumbnail-compose-routine-missing-all20
- 2026-07-20T15 (growth) generic 'Forty Years Mapped' primary title on 6 cities (boston/chicago/philadelphia/san-francisco/seattle/washington-dc) while the data-led hook already sits in titleOptions[0] (boston -71.3% recomputed grounded) -> promote option to primary + fix routine to default the headline stat. fp: generic-primary-title-hook-parked-in-options-6cities
- 2026-07-20T15 (growth) 17/20 descriptions have NO city hashtag in the first-3 (above-title) slot — only #CrimeData #DataVisualization #OpenData; only chicago/grand-rapids/seattle prepend #City -> prepend #<City> in description-authoring step (city already tags[0]). fp: no-city-hashtag-above-title-17cities

## skipped runs
## events
- 2026-07-19T23 lens=studio. Backpressure clear (2 open at start). Append blocked twice by stale .notes.lock held by dead note-watcher (pid 3495231, exited without releasing); waited 120s+180s, then reclaimed after confirming holder dead. 4 notes landed. Corrected finding mid-run: confidence-null cohort was 9 -> 8 (atlanta seeded during the run).
- 2026-07-20T15 lens=growth. Backpressure clear (11 open, 8 openCritic at start). 3 growth notes landed (thumbnail-compose, generic-primary-title, no-city-hashtag) — all pre-click CTR levers in heuristic order (thumbnail>title>hashtag). Avoided 2 false notes: (a) 'youtube.json has no playlist field' — server.mjs:442-457 AUTO-files each video into its FORMAT playlist on publish, no per-video field needed; (b) 'no Shorts/vertical derivatives' — DECISIONS.md RULING D5 (Hadi 2026-07-20) RULED OUT shorts/vertical. Validated title-option honesty by recomputing boston (70,003->20,110 = -71.3%) via pipeline/factsheet.mjs before recommending promotion. Did NOT re-file titleOptions-empty (denver/detroit/milwaukee) — already OPEN (channel note 2026-07-20T14:30). boston-ma/feedback.json was dirty in working tree at start (another routine mid-edit) — left untouched.
- 2026-07-20T14 lens=operations. Backpressure clear (9 open, 5 openCritic at start). Avoided 2 false notes: 'all configs music=NONE' (wrong field — music is audioSrc, all 20 wav files present) and '0/20 verified is a bug' (verify is intentionally an owner-only manual light per server.mjs). .notes.lock again crash-stranded — a DIFFERENT holder (pid 3096686, DEAD, bare-pid format unlike the earlier structured lock) held it ~6min; reclaimed after kill -0 confirmed dead. 3 notes landed; one non-critic note auto-resolved by another process mid-run (open 7->9 not +3). Prior infra note (notes-lock-crash-unsafe) still OPEN — did NOT re-file, but this is live evidence it's unfixed + now has inconsistent lock formats.
