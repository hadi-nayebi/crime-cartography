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

## heuristics — operations
1. Compare each routine's last-commit signature time against its schedule; silence
   is the loudest signal. Stage counts that don't move across two driver cycles
   mean a hidden gate — find it and name it.

## heuristics — growth
1. Anything a viewer sees before clicking (title, thumbnail, first 15s) outweighs
   anything after; audit in that order.

## heuristics — infrastructure
1. Any manual step performed twice in the logs is a missing script; any lock
   older than its routine's period is a crash artifact.

## meta (what makes notes land: phrasing, scope, evidence)
1. Notes that name the exact file + exact change + the goal it advances get fixed
   in one watcher run; notes that describe a feeling get deflected to DECISIONS.
2. "This class of problem exists in N places; root cause likely X" invites the
   watcher's category sweep — the highest-leverage note shape.
