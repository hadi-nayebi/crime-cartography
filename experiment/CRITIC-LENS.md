# critic detection playbook (grows every run)

The production-critic reads this BEFORE each review and appends new numbered
heuristics AFTER checking how its past notes were resolved (producerNotes tell
it whether it was on-target, whether the watcher found a deeper root cause it
missed, and which phrasings got fixed fast vs deflected). This file is the
"getting better at detecting" half of the critic↔watcher ratchet.

## heuristics — videos
1. The highest-yield checks historically: numbers whose SOURCE changed since authoring
   (config claims vs re-run factsheet), label collisions near dense map areas, and
   seam/measure disclosures that are technically present but visually missable.

## heuristics — studio
1. Walk the operator's real path (board → card → detail → publish), not the feature
   list — gaps live between features, not inside them.
2. "Feature built, data unpopulated" is a high-yield class: the badge/column/sort
   infra exists but no routine fills the field. Cross-check config/ledger POPULATION
   against the renderer — e.g. theme.name null in all 20 configs (badge shows "dark"
   for 19), confidence.json missing for 8 cohort cities (blank column). The fix is
   almost always upstream (producer seeds the field), not in the dashboard code.
3. Sorts/rankings often ignore the strongest signal they display. priorityOf weighted
   blocker COUNT but never the confidence SCORE — a card at 64/100 sorted like one at
   90/100. When the owner asks to "sort by what needs attention," check that the sort
   actually reads the quality number, not just presence/absence flags.

## heuristics — operations
1. Compare each routine's last-commit signature time against its schedule; silence
   is the loudest signal. Stage counts that don't move across two driver cycles
   mean a hidden gate — find it and name it.
2. Before filing "stage X isn't advancing," read the gate's ACTUAL server logic.
   This run every video sat at stageIndex 6 (verified=false) — but server.mjs makes
   'verified' an INTENTIONAL owner-only manual light (fresh Approve). "0/20 verified"
   is by design, not a bug. Distinguish a stuck automated stage from a deliberate
   human gate before filing.
3. Enumerate the literal STRINGS of every status/blocker across the ledger. Near-
   duplicate phrasings for ONE state ("full watch-through…" vs "full end-to-end
   watch-through…", 11 vs 9 cities) are high-yield: they break any string-matched
   count/filter/auto-clear and show the operator two labels for one action. Root is
   almost always a seeding step emitting two canned strings — canonicalize to a constant.
4. Advisory-vs-authoritative drift: when a ledger field is "advisory" (doesn't gate)
   but still feeds a SORT or DISPLAY, a value that no code path ever CLEARS silently
   corrupts the derived ranking. confidence.json blockers never gate publish, but
   priorityOf adds 20+blk to the attention sort — an un-cleared blocker outranks a
   clean card forever. Trace who writes AND who clears each derived-from field.
5. Verify field WIRING before filing a coverage gap. "All 20 configs music=NONE"
   was a false alarm — the field is audioSrc, not music, and all 20 wav files exist.
   Grep the config keys + the renderer's actual read path before claiming "unpopulated."
6. UI-copy vs server-truth contradiction is the mechanical root of most "UX confusing"
   owner complaints. Cross-check every UI string that DESCRIBES a gate against the
   server logic that ENFORCES it — and against the server's OWN error strings. Here the
   publish modal said verify "needs >=95 + zero blockers" while the server says the
   ledger "NEVER flips verify" and its own error says "Approve the current cut." Two
   UI strings disagreeing with each other + with the server = file it, name all three.

## heuristics — growth
1. Anything a viewer sees before clicking (title, thumbnail, first 15s) outweighs
   anything after; audit in that order.

## heuristics — infrastructure
1. Any manual step performed twice in the logs is a missing script; any lock
   older than its routine's period is a crash artifact.
2. Verify lock liveness with `kill -0 <pid>` / `ps -p <pid>` before honoring an
   mtime staleness window — a plain-file lock whose PID is dead is a crash artifact
   NOW, not in 20 min. Locks must release on exit (trap/flock); one that doesn't
   strands every other writer. (This run: note-watcher died holding .notes.lock,
   stranded it ~13 min, timed out two critic appends.)
3. The critic's OWN ledger is a filable signal: if CRITIC.md's `rotation:` line
   doesn't match the lens of recent `critic:` commits in git log, the round-robin
   is broken (runs re-start at 'videos'). Persist rotation at run START, not only
   at the end, or a mid-run crash loses it.
4. .notes.lock now appears in TWO formats — structured (`pid=… started=… task=…`)
   and bare pid (`3096686`). When reclaiming, match the pid with a loose `\d{3,}`
   regex, NOT a `pid=` anchor, or a dead bare-pid lock reads as unparseable and you
   burn the full 2-min poll waiting on a corpse (cost me a poll this run). The format
   split itself is an infra defect (writers disagree) but my prior notes-lock note
   already covers crash-safety — don't re-file an OPEN note; just reclaim and proceed.

## meta (what makes notes land: phrasing, scope, evidence)
1. Notes that name the exact file + exact change + the goal it advances get fixed
   in one watcher run; notes that describe a feeling get deflected to DECISIONS.
2. "This class of problem exists in N places; root cause likely X" invites the
   watcher's category sweep — the highest-leverage note shape.
3. RECOMPUTE every cited count immediately before the write. This run's
   confidence-null cohort went 9 → 8 mid-run (atlanta seeded while reviewing);
   filing "9 incl. atlanta" would have been factually wrong. Re-fetch, don't cache.
4. Line numbers drift when a concurrent studio/engine commit lands mid-run (a
   dashboard overhaul committed while I reviewed). Lead notes with function NAMES
   (themeBadge, priorityOf) + line as a hint, and re-grep the file after any
   overhaul/engine commit appears in /api/pulse before filing line-anchored notes.
