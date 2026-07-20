# Harness requests — for the harness-improver

Routine/tooling changes requested by operator notes. The harness-improver picks
these up; producer/driver may act on the ones that gate production.

## requested

### derived-superlative no-data guard  (from critic note 2026-07-19, resolved by note-watcher)
Any engine feature that reports a SUPERLATIVE over sparse spatial units — "safest /
fewest / least / lowest / best" (the min tail of a ranking) — must exclude
true-no-data units (a unit with zero incidents in EVERY category across EVERY
month, i.e. `allTotal===0`), because absence of data reads identically to a real
zero and would crown a spatial-join artifact. Done for `hoodRanking` in
`surface/remotion/src/data/derive.ts` (filter `allTotal>0`) + Reveal disclosure.
GUARD FOR FUTURE FEATURES: when the producer/driver adds a new "least/fewest"
overlay (e.g. beat-level safest, per-category safest, county rollups), apply the
same `allTotal>0` filter and keep genuinely-low-but-present units eligible — do
not use a blanket minimum-incident floor, which would hide real low-crime areas.
Producer config note: cities with disclosed zero-mapped neighborhoods (Atlanta's
Bankhead/Englewood Manor/Midwest Cascade) are handled by the engine now; no
per-config action needed, but re-verify after any change to the ranking logic.

### note-placement QA reviewer routine  (from dashboard note 2026-07-19)
The studio dashboard now shows a **note-placement QA badge** per video card
(icon `○` unreviewed · `✅` readable · `⚠️` flagged) and a QA line on the video
detail page. It reads `videos/<slug>/qa.json`. **No routine writes that file
yet** — every video currently reads "unreviewed".

Add a routine (or fold into the producer's post-render verify) that, for each
rendered video, spawns a subagent to review the encoded mp4 specifically for the
**storytelling annotations / notes**, and writes the result:

`videos/<slug>/qa.json`
```json
{
  "notePlacement": {
    "status": "pass" | "fail" | "pending",
    "issues": ["<one line per problem found>"],
    "reviewedAt": "<ISO8601>",
    "reviewer": "note-placement-reviewer",
    "commit": "<render commit these notes were reviewed against>"
  }
}
```

Pass criteria the reviewer must confirm (all true → `status:"pass"`):
1. Every storytelling annotation is **not overlaid on top of other text** (title,
   counters, feed, source credit, clock).
2. Each annotation sits on a **distinct background shade** (a panel/scrim, not
   raw over the map) so it is readable against the moving heat/points.
3. Placement does not cover the map region the annotation is describing.

If the reviewer can flag **no** issues → `status:"pass"` (video earns the badge).
Any issue → `status:"fail"` with the issue list; the dashboard then ranks that
video up ("note placement flagged") and the producer should add a re-render
blocker to `experiment/confidence.json`. Set `status:"pending"` only while a
review is in flight. `reviewedAt.commit` != current render commit ⇒ treat as
stale (re-review). Honesty: do not write `pass` without an actual review.

## requested (2026-07-19 late, orchestrator)
- harness-improver MUST check every scheduled task's `enabled` flag each audit: batch1-production-driver was found silently DISABLED tonight (last run 19:25, likely auto-disabled when a run died in the 529/session-limit window) — cost ~2h of idle GPU before the orchestrator caught it. Also verify lastRunAt vs schedule for every routine, not just commit signatures.

## 2026-07-19 ~22:15 — fleet-wide routine update (orchestrator, user-directed: "update all routines so our project grows more effectively")
Evidence-based changes (SKILL.md prompts edited; every change verbatim in the files):
- driver: crash-safe PID-liveness lock; CLEAR-THE-QUEUE rule (process every ready item per run, not one — the one-item-then-idle pattern wasted GPU hours); steps 130→140 (aligned with proven chain); GPU zombie preflight (never kill a live holder); NO-OP RUNS ARE CHEAP (one line max, no reports — the 07-19 essay-runs were waste).
- producer: SURGE DOCTRINE (queue >3 similar items → parallel agent fan-out + self re-verification; proven 07-19); crash-safe lock; richer templates (milwaukee/detroit/denver); D5-conditional staged-wave publishing (only on Hadi's ruling).
- briefing: when email undeliverable (no gmail token) cap at ~15 lines — unsent essays are waste.
- channel-manager: new task 0 PRE-PUBLISH READINESS (quota ledger vs ~6/day cap, playlist integrity, per-city metadata/thumbnail QA → readiness table + gap notes into the ratchet).
- harness-improver: MANDATORY scheduler-truth check (enabled flags + lastRunAt vs cron for every task; silently-disabled production tasks get re-enabled + logged — the 07-19 driver incident); token-efficiency audit of routine outputs.
- note-watcher: crash-safe PID-liveness lock (dead watcher stranded .notes.lock ~13 min on 07-19).
- critic: cadence 5min→15min (measured over-provisioning: files 3+/run vs watcher's ~1 fix/run — most 5-min wakeups would exit on backpressure).
