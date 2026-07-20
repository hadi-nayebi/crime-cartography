# Harness requests — for the harness-improver

Routine/tooling changes requested by operator notes. The harness-improver picks
these up; producer/driver may act on the ones that gate production.

## requested

### title-authoring step must emit ≥2 titleOptions per config  (from channel note 2026-07-20, resolved by note-watcher)
The producer's title/`youtube.json`-authoring step does not guarantee the
`titleOptions` field, so 3 late configs (denver-co, detroit-mi, milwaukee-wi)
shipped with it absent while the other 17 carried 2 — the studio publish modal's
title picker then had no alternates to offer for those cities. Back-filled all 3
by hand (2026-07-20): 2 verified alternates each, ≤100 chars, using only the
city's own producer-verified hook/punchline figures and never crossing the
FBI↔incident measurement seam. FIX AT THE PRODUCING LAYER so it can't recur: when
the routine authors a city's `youtube.json`, it must also author (or assert the
presence of) exactly 2 `titleOptions` — each ≤100 chars, each built only from
that city's already-verified figures, matching the style of the primary title.
A cheap guard: a pre-publish check that flags any `youtube.json` with
`titleOptions.length !== 2` or any option >100 chars. Related but SEPARATE open
critic note (2026-07-20T15:24, growth): 6 cities park their strong data-led hook
in `titleOptions[0]` while the generic "Forty Years Mapped" string is the
PRIMARY `title` — the same routine should default the headline stat/turn to the
primary title, not options.

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

### pre-warm publish thumbnail candidates at render landing  (from channel note 2026-07-20, resolved by note-watcher)
The studio generates the 6 publish-thumbnail candidate frames (`videos/<slug>/thumbs/tNNN.jpg`)
LAZILY — `ensureThumbs` in `pipeline/dashboard/server.mjs` only runs on publish-preview load — and
`thumbs/` is gitignored, so every newly-rendered city arrives with an empty candidate picker until
someone opens its publish modal. Batch-1's original 8 were warmed by hand; the 12 newer renders
were not, silently blocking the publish flow until the note-watcher back-filled all 12 (2026-07-20).
FIX AT THE PRODUCING LAYER so it can't recur: the producer/driver routine that lands a render must
pre-warm that city's candidates in the same step — either POST `/api/publish/<slug>/thumbs` (studio
running) or run the identical recipe directly:
`ffmpeg -ss {4,45,110,155,210,290} -i out/<slug>.mp4 -frames:v 1 -vf scale=1280:720 -q:v 3 -y thumbs/tNNN.jpg`.
Then every rendered city reaches the publish gate with real candidates already on disk. Honesty:
candidates must be composed only from real rendered frames — never external art.

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

---

# Audit log — harness-improver (nightly meta-runs)

## 2026-07-19 23:34 EDT — nightly audit (BASELINE stage table; first audit-log entry)

### Stage counts — `node pipeline/status.mjs --md`
| city | data | trend | basemap | config | music | render | score | blk |
|------|:--:|:--:|:--:|:--:|:--:|:--:|--:|--:|
| atlanta-ga | ✅ | ✅ | ✅ | ✅ | ✅ | · | 64 | 4 |
| baltimore-md | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 64 | 3 |
| boston-ma | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 91 | 3 |
| buffalo-ny | ✅ | ✅ | ✅ | ✅ | ✅ | · | 64 | 3 |
| charlotte-nc | ✅ | ✅ | ✅ | ✅ | ✅ | · | 64 | 3 |
| chicago-il | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 90 | 2 |
| cincinnati-oh | ✅ | ✅ | ✅ | ✅ | ✅ | · | 64 | 3 |
| dallas-tx | ✅ | ✅ | ✅ | ✅ | ✅ | · | 64 | 3 |
| denver-co | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 64 | 3 |
| detroit-mi | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 64 | 3 |
| grand-rapids-mi | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 88 | 2 |
| kansas-city-mo | ✅ | ✅ | ✅ | ✅ | ✅ | · | 64 | 3 |
| memphis-tn | ✅ | ✅ | ✅ | ✅ | ✅ | · | 64 | 3 |
| milwaukee-wi | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 64 | 3 |
| minneapolis-mn | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 91 | 1 |
| nashville-tn | ✅ | ✅ | ✅ | ✅ | ✅ | · | 64 | 3 |
| philadelphia-pa | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 90 | 2 |
| san-francisco-ca | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 90 | 2 |
| seattle-wa | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 90 | 3 |
| washington-dc | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 91 | 4 |
| **20 cities** | 20 | 20 | 20 | 20 | 20 | **12** | 0@100 | – |

STAGE COUNTS (/20): data 20 · trend 20 · basemap 20 · config 20 · music 20 · **render 12**.
Upstream (data→music) is saturated at 20/20. Render = 12 and **actively draining tonight** —
detroit 03:36→denver 03:41→milwaukee 03:47→baltimore 03:53 (UTC), buffalo-ny in flight at audit
close: NOT stagnant, the driver's clear-the-queue doctrine is working. No prior audit table existed
to diff against — this is the baseline the next audit's STAGE COUNTS line compares to.

### Scheduler truth (all 8 tasks; audit at 03:34 UTC / 23:34 EDT)
| task | enabled | cadence | lastRun (EDT) | verdict |
|------|:--:|------|------|------|
| earth-one-channel-briefing | ✓ | 8h | 16:09 | on-cadence; emails still go to DRAFT (no gmail token) |
| batch1-production-driver | ✓ | 2h | 22:36 | on-cadence, rendering — HEALTHY (the 07-19 silent-disable is resolved) |
| producer-work-session | ✓ | 4h | 21:23 | on-cadence — HEALTHY |
| youtube-channel-manager | ✓ | daily | (never) | no lastRunAt; expected (0 published) — no action |
| harness-improver | ✓ | 2×/day | 23:34 | this run |
| repo-hygiene-reviewer | ✓ | daily | — | next 12:02 — OK |
| **note-watcher** | ✓ | **5min** | **20:01** | **STALLED ~4h** |
| **production-critic** | ✓ | **15min** | **19:59** | **STALLED ~4h** |

STALL DIAGNOSIS (recorded, not fabricated-fixed): both sub-hourly tasks stopped at ~20:00 EDT and
have not fired since (~4h). note-watcher's 23:51 scheduled fire was skipped and its nextRunAt kept
slipping forward (03:51→04:01 UTC across two list calls) → the scheduler is repeatedly deferring
them, a persistent stall not a transient. The 2h/4h/8h tasks fired normally in the same window
(driver 22:36, producer 21:23) → host is NOT down. Both stopped at the tail of tonight's documented
19:25 session-limit/529 window (same window that silently disabled the driver). Read: **session-
capacity starvation of the highest-frequency tasks** — the API/session pool can't absorb 288+96
runs/day on top of renders. All 8 tasks are `enabled`, so there is nothing to re-enable; not a
config defect and **not harness-fixable tonight** (it's capacity, not a flag or a path). Left cadence
UNCHANGED (owner just tuned it 22:15). If still stalled next audit → recommend note-watcher */5→*/10.

### Routine health verdicts
- **driver — IMPROVING**: clear-the-queue proven (5 renders in ~30 min; picked buffalo-ny next, matching `status.mjs --next`).
- **producer — HEALTHY**: landed matrix.json (20 vectors) + confidence ledger + citywide-fidelity audit (seattle/nashville fixed) in the last 24h.
- **note-watcher / production-critic — STALLED** (external: session capacity, see above).
- **briefing — DEGRADED** (external: no gmail token → drafts unsent; already capped at 15 lines).
- **channel-manager — IDLE by design** (nothing published yet).
- **repo-hygiene-reviewer — OK**.
- Token efficiency: no fresh no-op/essay-run waste this window — the 22:15 fleet update already fixed the driver essay-runs, briefing length, and critic over-provisioning. Nothing new to tighten.

### Changes made this run
1. **NEW `pipeline/status.mjs`** (committed) — canonical read-only status probe: stage×city grid
   (data/trend/basemap/config/music/render) + score/blockers, with `--md` (paste-ready table),
   `--json` (for routines), `--next` (driver's next render-ready city). Replaces the ad-hoc
   ls/node one-liners each routine re-derived. Keys the music stage off each config's real
   `audioSrc` (not a name convention) → fixed a would-be false gap (grand-rapids uses the legacy
   filename `grand-rapids-music-sao.wav`; music is correctly 20/20, not 19/20). Verified: counts
   match the filesystem; `--next`→buffalo-ny, which the driver then rendered.
2. **PROMPT EDIT — batch1-production-driver/SKILL.md** (outside repo; applied directly, verbatim).
   Into the READ-FIRST/stage-selection line, appended: *"For a fast one-shot picture of where all 20
   cities stand, run `node pipeline/status.mjs` (read-only probe — stage×city grid
   data/trend/basemap/config/music/render + score/blockers + STAGE COUNTS line); `node
   pipeline/status.mjs --next` prints the next render-ready city (config+music present, no mp4,
   fewest blockers first) so you don't re-derive the queue by hand."*
3. **PROMPT EDIT — harness-improver/SKILL.md** (outside repo; applied directly, verbatim). Step 2
   changed from *"compute per-stage counts … from the filesystem"* to: *"get per-stage counts
   (data/trend/basemap/config/music/render across the 20 cities) from `node pipeline/status.mjs` —
   the canonical status probe; use `node pipeline/status.mjs --md` for a paste-ready table for the
   log. Compare its STAGE COUNTS line against the counts recorded in the last HARNESS.md entry."*

### Biggest remaining bottleneck
**The certification wall, not a broken routine.** 0/20 at score=100 with cohort publish targeted
7/25 (6 days out). Render is draining well (12/20, climbing tonight), so the gate is the producer's
verify/score pass: 8 cities sit at 88–91 held below 100 by re-render blockers that must be cleared,
and 12 sit at 64 awaiting the full verify. Secondary risk: the note-watcher/critic feedback loop has
been dark ~4h on session capacity — it slows note resolution but does not block renders; watch it
next audit.
