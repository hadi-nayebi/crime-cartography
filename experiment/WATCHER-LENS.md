# watcher solutions playbook (grows every resolution)

The note-watcher reads this BEFORE resolving (known categories first) and
appends AFTER each resolution: the category, the ROOT CAUSE (not the symptom),
how wide the category sweep went, and the lesson. This file is the "getting
better at solving" half of the critic↔watcher ratchet. Rule of the house:
surface-patching one instance of a systemic issue is a failure mode — fix the
producing layer (template/engine/pipeline/routine) and sweep every instance.

## categories solved (category | root cause | sweep breadth | lesson)
- routines-sweep-foreign-work | root cause: `git add -A` in every routine SKILL's commit step + GIT POLICY template | sweep: 7 SKILL files, 11 occurrences replaced with explicit-file adds | lesson: shared-repo automation must never blanket-stage; observed twice tonight (agent work swept into "note:" commits 72f6f1c, 0456d53/3270cb7)
- no-data-crowned-as-extreme (safest/least/best of a ranking) | root cause: engine derive.ts `hoodRanking` sorted by groupATotalAll with no data-presence guard — a spatial-join artifact (allTotal===0, zero incidents in EVERY category every month) is indistinguishable from a real 0 and sorts to the tail, so it can be crowned "safest" | sweep: engine fix (filter allTotal===0 out of hoodRanking + disclose in Reveal) + scanned all 20 cities' normalized data, only Atlanta had no-data hoods (3), other 19 unchanged; Atlanta unrendered so first render is auto-correct + confidence blocker logged | lesson: ANY derived superlative over sparse units (min/least/safest/fewest) must exclude true-no-data units — "absence of data" ≠ "best value"; keep genuinely-low-but-present units (allTotal>0) so you don't hide a real safe area. Guard belongs in the engine, not per-config, so it can't recur for future cities.

## open hypotheses (suspected systemic causes not yet confirmed)
