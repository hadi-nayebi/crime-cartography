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

2. Superlative / minimum-reward claims ("safest / fewest / least / lowest") carry a
   no-data→winner failure mode: a spatial-join artifact with zero joined records reads
   identically to a real zero and gets crowned. When you spot one, file the INVARIANT
   ("exclude true-no-data units from any min-reward ranking"), not a specific predicate —
   the watcher fixed my proposed "months-with-activity" test with the simpler+stricter
   `allTotal===0`, and the "sweep all 20 cities" framing is what turned it into a
   one-change engine fix. Over-specifying the exact condition just gives the watcher a
   worse test to override; specify the property, name the sweep.

3. Min-reward exclusion is TIERED, and the watcher's first fix only clears tier 1.
   The resolved superlative note got `allTotal>0` (excludes EXACT-zero). Re-auditing
   found the residual: near-empty slivers (1-6 records / 60mo) and non-residential
   polygons with real counts still get crowned "safest neighborhood" — milwaukee Zoo=1,
   baltimore Dundalk Marine Terminal=2, atlanta Bankhead Courts=3, philly 77th·Airport=4435.
   When you see a resolved threshold guard, probe the value JUST ABOVE it — the simplest
   guard the watcher shipped (==0) leaves the whole near-zero tail. Tiers: exact-zero
   (fixed) -> near-empty coverage sliver -> non-residential zone (zoo/airport/terminal/park).

4. For any "fewest/safest/most" claim, EXTRACT THE REVEAL FRAME (~305s) and read the
   crowned unit's NAME — it's a faster artifact-tell than recomputing. "Zoo",
   "Marine Terminal", "Airport", "State Facility" = non-residential; a 1-2 count = coverage
   gap. The rendered value (window-bundle groupATotalAll) is what actually ships, and
   near-empty crowns only surface in the frame, not the config.

5. VERIFY the friendly-name mapping is APPLIED (in the rendered frame) before filing an
   "opaque codes" note. The raw cell key ("C11","15") is NOT what ships: boston maps
   A1->"Downtown & Beacon Hill", philly maps 12->"12th · Kingsessing / Elmwood" via
   neighborhoods.json .map[].name, and the video uses the friendly string. Measure/inspect
   the DISPLAY string (frame or the .name field), never the data key, or you file a phantom.

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
2. "Field authored but wrong slot" beats "field missing" as a note: the 6 generic-title
   cities already HAD a strong data-led hook sitting in titleOptions[0] — it was just
   parked there instead of being the primary `title` that publishes. Check whether the
   strong version already exists somewhere in the record before proposing new copy; a
   swap is near-zero-effort for the watcher and dodges any fabrication risk (you're
   promoting an already-authored, verifiable string, not inventing one).
3. Audit the DEFAULT/primary value, not the pool. titleOptions/tags/thumbs are pools;
   what actually ships is title[0]/thumbnail.jpg/the first-3-hashtags. Cohort quality
   lives in which pool element is promoted to the shipping slot — enumerate the shipping
   slot across all N and look for the ones that regressed to a generic default.
4. Two-stage pipeline gaps: a routine that produces CANDIDATES (thumbs/ frames) is not
   the routine that produces the SHIPPED artifact (composed thumbnail.jpg). When stage-1
   is 20/20 done but stage-2 is 0/20, the missing stage-2 is the highest-leverage note —
   and the owner often already spec'd the desired stage-2 output in a per-video note
   (boston's stats+map thumbnail) that should be generalized into a routine, not fixed once.
5. VERIFY PUBLISH WIRING before filing a distribution gap (mirror of ops #5). "youtube.json
   has no playlist field" looked like a coverage gap but server.mjs auto-files each video
   into its FORMAT playlist on publish — no per-video field needed. Grep the publish handler
   for the field's auto-population before claiming it's unpopulated. Also cross-check
   DECISIONS.md rulings before proposing a format (Shorts/vertical were RULED OUT in D5).

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

5. A logged "fleet-wide" change is a coverage claim to AUDIT, not trust. When HARNESS.md
   records a sweep ("crash-safe locks added to all routines"), diff EACH routine's SKILL
   against the claim — sweeps miss members. The 2026-07-19 lock hardening upgraded
   driver/producer/note-watcher but SKIPPED production-critic (its entry got only a cadence
   change), leaving the critic's own .critic.lock mtime-only/PID-less/trap-less while
   FLEET.md asserts all three locks are crash-safe. The gap between a shared-invariant DOC
   (FLEET.md) and a per-routine SKILL is a reliable infra note vein.
6. A policy with an EMPTY rulings/decisions log while its "pending" items are already
   live is advisory-only — file it. Cross-check PUBLIC-POLICY.md's PRIVATE-candidate list
   against `git ls-files`: all 5 unratified classes were tracked in the public repo, the
   Rulings log was empty, and a "personal-emails" class (briefings/) literally carried a
   contact email publicly. The tell: a governance doc that says "keep out until ruled"
   plus zero logged rulings plus the files already committed = policy-vs-practice drift.
7. Engine/template CONSTANTS go stale after a spec change and hide as "defaults." When a
   parameter moved (video length 300s→330s), grep for the old literal: Root.tsx still hard-
   coded durationInFrames={9000} (300s) as the Composition default while every config
   (durationSec:330), calculateMetadata (9900f), and all 20 render.lock/ffprobe say 330.048s
   — a latent truncation trap. Check declared static defaults against the DERIVED value and
   the shipped artifact (render.lock/ffprobe), not just against each other.

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

5. When the DATA looks wrong, the ENGINE often already handles it — extract the actual
   frame + read the guard's real logic BEFORE filing. This run, two would-be notes died:
   (a) DC window-zero "Cluster 42" is EXCLUDED + disclaimed by the engine (`allTotal>0`
   catches it since DC other==0, so window all-cats==groupA==0); (b) boston/philly "opaque
   codes" — the friendly-name map is applied in the render. Both looked filable from the
   data alone; the frame/logic refuted them. Cost of over-eager filing = a phantom note the
   watcher wastes a cycle deflecting. The frame is ground truth; the config/data is a hint.
