# Harness requests — for the harness-improver

Routine/tooling changes requested by operator notes. The harness-improver picks
these up; producer/driver may act on the ones that gate production.

## requested

### driver/producer should verify the custom thumbnail actually landed after a publish, and re-push if not  (from owner DC note 2026-07-20T16:45, resolved by note-watcher 2026-07-20)
The publish engine now retries YouTube `thumbnails.set` through the fresh-upload "still processing"
race and exposes a re-apply path (POST `/api/publish/<slug>/setthumb` + a "⤴ Push thumbnail" button
on the publish result, the already-published modal, and the published-video detail page) — so the
owner never has to set the thumbnail by hand in YouTube Studio. Remaining automation ask: whichever
routine tracks a just-published videoId should, once the video finishes processing, confirm the live
thumbnail matches the chosen `thumbnail.jpg` (via `videos.list part=snippet` — the same batched call
the dashboard already makes) and, if it doesn't, POST `setthumb` once to re-apply it. Honesty note:
only ever push the committed `thumbnail.jpg` built from real render frames; never invent an image.
Root category: *an outward metadata write after a long async platform op (upload/transcode) must
retry the processing race + carry a re-apply path* — never a fire-once silent side effect.

### state-sync must reconcile local `youtube.json` privacy/thumbnail from the LIVE YouTube API  (from owner boston note 2026-07-20T16:30, resolved by note-watcher 2026-07-20)
The dashboard now renders published videos from the live YouTube state (server.mjs `videos.list`
part=snippet,statistics,status → `youtube.live`), which fixed the UI: a video the owner flips to
public / re-thumbnails on YouTube no longer shows here as stale "private" with our composed
thumbnail. But the *local* `videos/<slug>/youtube.json` still drifts — boston + DC both read
`status:uploaded-private` / `privacyStatus:private` locally while they are actually **public** on
YouTube. The channel-manager / state-sync routine should, on each run, pull `videos.list` for every
`videoId` and write back the real `privacyStatus` (and `status`) into youtube.json, so the committed
record matches reality even when the dashboard is offline / the API is unreachable. Honesty note:
never invent a status — only write what the API returns. Root category: *published-state read from
local pre-publish artifacts instead of live truth* — the same class as the dashboard fix.

### config-authoring must emit a verified `copy.countTerm` per city  (from critic videos note 2026-07-19T23:45, resolved by note-watcher 2026-07-20)
The engine no longer hardcodes the NIBRS term "Group A" — the on-screen counted-category
label (reveal/quiz/timeline) is now routed through `config.copy.countTerm`, with a NEUTRAL
engine default of `"reported"` so a config that omits the field can never assert a taxonomy
the source doesn't use. But the RIGHT term is per-source and honesty-critical, so the
authoring step must SET it explicitly for every new city, verified against that source's real
taxonomy — the reliable signal is the city's own `trend.json` recent-era label + `PROVENANCE.md`
(does it carry a native `nibrs_crimeagainst`/crimes-against field?). Rule applied this sweep:
`"Group A"` ONLY for genuine native-NIBRS-Group-A sources; `"major"` for Buffalo's ten
major-crime types; `"reported"` (neutral, always-true) for any source that merely maps its own
categories into persons/property/society via the NIBRS convention (STARS, RMS, "all recorded
incidents", etc.). ALSO: authored annotation/quiz text must use the SAME term — never write
"Group A" into a non-NIBRS city's annotations (that reintroduces the bug the config field fixed).
Cheap check: flag any config where `copy.countTerm` is absent, OR where an annotation/quizQuestion
string contains "Group A" while `copy.countTerm != "Group A"`.

### producer/driver must (re)compose the designed thumbnail when a render lands  (from boston owner note 2026-07-20T15:36 + critic growth 2026-07-20T15:24, resolved by note-watcher)
The thumbnail STANDARD now exists: `pipeline/publish/compose-thumbnail.py` builds
`videos/<slug>/thumbnail.jpg` ("theme 1: map + stats") from the real rendered map frame +
each city's VERIFIED config figures (hook.stat, hook.line, copy.cityName) plus an optional
per-city `videos/<slug>/thumb.json` (frame/crop override, verified yearRange/kicker/
busiest/safest). This run generated all 20 by hand (`--all`), but nothing wires it into the
production chain. FIX AT THE PRODUCING LAYER: (1) when the driver/producer lands or re-renders
a city's mp4, it must run `python3 pipeline/publish/compose-thumbnail.py <slug>` so the
committed thumbnail.jpg tracks the current cut (a render that changes the map must refresh the
thumbnail's map hero); (2) the config/publish-authoring step should author a verified
`thumb.json` per city carrying that city's safest/busiest neighborhood (from the render's own
hoodRanking — mirror the render's window slice exactly, per WATCHER-LENS) so every thumbnail
reaches Boston's richness, not just the guaranteed core. Honesty guard: neighborhood chips must
NEVER render from a recomputed/uncertain figure — only from a verified thumb.json; the composer
already omits them when absent. Cheap check: flag any slug with an out/<slug>.mp4 newer than its
thumbnail.jpg, or a config whose reveal names a safest/busiest hood with no thumb.json chip.

### config-authoring must emit a verified seamExplain for any seamed trend  (from grand-rapids owner note 2026-07-20T15:30, resolved by note-watcher)
Every city's `trend.json` joins FBI UCR to the city's own incident/NIBRS data at an
explicit measure seam (all 20 cities have `seamInSpan=YES`), and the engine renders a
"why the jump?" card at that seam. But `copy.seamExplain` is an OPTIONAL, hand-authored
field: 14 cities had a verified city-specific string; 6 (chicago-il, grand-rapids-mi,
minneapolis-mn, philadelphia-pa, san-francisco-ca, seattle-wa) shipped WITHOUT one, so
`FullTrend.tsx` fell back to the generic engine default ("newer, broader incident-based
system") — honest but not city-tailored, and slightly loose for the "all recorded
incidents/offenses" cities that aren't strictly NIBRS. The owner (watching grand-rapids)
asked that every multi-dataset/measure-change chart briefly explain the change, like
Boston. Back-filled all 6 by hand (2026-07-20), each grounded in that city's committed
`trend.json` note. FIX AT THE PRODUCING LAYER so it can't recur: when the config-authoring
routine lands a city whose `trend.json` has a real seam (`seamYear` within the years span),
it must also author (or assert the presence of) a verified `copy.seamExplain` — built ONLY
from that city's provenance facts (the `trend.json` note + eras labels), matching Boston's
style. Cheap guard: a pre-render check that flags any config whose bundle has a seam but no
`copy.seamExplain`. SECONDARY (engine safety net, not done here — would need tsc+still and
is out of scope for this note): the `FullTrend.tsx` generic default asserts "incident-based
system" for ALL seams; harden it to a measure-neutral phrasing so a future un-authored city
is never mislabeled — but authored per-city copy is the intended path, the default is only
a fallback.

### re-render verify step must clear ALL blockers the render satisfies, not one  (from washington-dc owner APPROVE 2026-07-20, resolved by note-watcher)
When the producer/driver re-renders a city and encode-verifies the mp4, it clears
confidence.json blockers by hand — one at a time, from memory. But a SINGLE render
routinely satisfies MULTIPLE `re-render to pick up X` blockers at once: DC's
2026-07-20 00:43 render carried BOTH the zero-count 'safest' fix AND the seamExplain
'WHY THE JUMP?' fix, yet the verify pass logged `[blockers cleared: 1]` and stripped
only the zero-count — the seamExplain re-render blocker stayed stale (found + cleared
by the watcher on the owner APPROVE, still @96s confirming the seam card renders).
FIX AT THE PRODUCING LAYER: after a re-render, the verify step must enumerate EVERY
open blocker of the form `re-render to pick up …` for that city and confirm/clear
each against the fresh mp4 (a cheap still per fix), never a running "cleared: 1".
A `[blockers cleared: 1]` following a render that landed 2+ fixes is a drift smell.

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

## 2026-07-20 11:43 EDT — nightly audit (render queue DRAINED 12→20; +canonical FLOW tool)

### Stage counts — `node pipeline/status.mjs --md`
| city | data | trend | basemap | config | music | render | score | blk |
|------|:--:|:--:|:--:|:--:|:--:|:--:|--:|--:|
| (all 20) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 87–91 | 1–2 |

STAGE COUNTS (/20): data 20 · trend 20 · basemap 20 · config 20 · music 20 · **render 20**.
**Diff vs last audit (2026-07-19 23:34): render 12 → 20 (+8).** The driver's clear-the-queue
doctrine drained the whole render backlog overnight (03:36–04:47 UTC batch + SF re-render 13:11
UTC today). Every mechanical stage is now saturated at 20/20. **NO STAGNATION** — nothing sat
unchanged-while-incomplete; the one stage that was incomplete last audit (render) completed.

### FLOW SLO — `node pipeline/status.mjs --flow` (NEW canonical scoreboard, see Changes #1)
```
review-ready     18   (rendered · owner not yet approved — his queue)
awaiting-publish  2   (APPROVED · one publish-click from live)  -> boston-ma, washington-dc
published (24h)   0/6 (all-time published: 0)
last cut landed  2.6h ago
STARVATION       no — queue stocked / fresh cut within 24h
```
**NOT starving:** review queue is stocked (18) AND a fresh cut landed 2.6h ago (well inside 24h).
**Key discovery the flow computation surfaced:** boston-ma AND washington-dc are **APPROVED and
awaiting Hadi's publish click** — their studio `verified` light is GREEN (fresh owner APPROVE in
feedback.json, 15:17Z & 15:28Z, both newer than their mp4s at 04:47Z/04:43Z). The confidence-ledger
narrative ("0/20 at score 100 · certification wall") diverged from the studio's real verify lights:
score/blockers are producer context, NOT the flow gate. The machine is fully caught up; the ONLY
thing between "ready" and "live" is the owner's manual watch-through + publish clicks (correctly
outside the machine). This is why the flow tool reads verify from feedback.json, not the ledger.

### Scheduler truth (all 8 tasks — mandatory; audit at 15:43 UTC / 11:43 EDT)
| task | enabled | cadence | lastRun (EDT) | verdict |
|------|:--:|------|------|------|
| earth-one-channel-briefing | Y | 8h | 08:54 | on-cadence (next 16:09); emails still DRAFT (no gmail token) |
| batch1-production-driver | Y | 2h | 10:32 | on-cadence, queue drained — HEALTHY |
| producer-work-session | Y | 4h | 09:17 | on-cadence — HEALTHY |
| youtube-channel-manager | Y | daily | 10:55 | ran today — HEALTHY |
| harness-improver | Y | 2x/day | 11:35 | this run |
| **note-watcher** | Y | **5min** | **11:32** | **RECOVERED** (was STALLED ~4h last audit) |
| repo-hygiene-reviewer | Y | daily | 10:26 | ran today — OK |
| **production-critic** | Y | **15min** | **11:16** | **RECOVERED** (was STALLED ~4h last audit) |

All 8 `enabled`; none silently disabled. The two sub-hourly tasks that were session-capacity-starved
last audit (note-watcher, production-critic, dark ~4h at ~20:00 EDT) are firing again — the capacity
window cleared. Nothing to re-enable. Observed but NOT acted on: `experiment/.critic.lock` is a
0-byte file (no PID inside), but only 2 min old = an in-flight critic run, NOT a stale crash (delete
rule is >3h + no process). If it's still 0-byte and stale next audit -> tighten the critic's lock
discipline (PID-inside like the others).

### Routine health verdicts
- **driver — IMPROVING**: proved clear-the-queue at scale (render 12->20 in one overnight sweep, 0 gaps).
- **producer — HEALTHY**: citywide-fidelity fixes, matrix, blocker restatements landed; scores steady 87–91.
- **note-watcher / production-critic — RECOVERED**: both firing on cadence again (root cause was
  external session capacity, not a config/path defect — correctly left untouched last audit).
- **channel-manager — HEALTHY**: readiness QA + quota ledger current; thumbnail gap (12 cities) and
  titleOptions gap (denver/detroit/milwaukee) both RESOLVED intraday -> 20/20 clear the readiness bar.
- **briefing — DEGRADED (external)**: no gmail token -> drafts unsent; already capped at 15 lines.
- **Token efficiency:** no fresh no-op/essay waste this window; the 07-19 fleet update's fixes hold.

### Changes made this run
1. **`pipeline/status.mjs --flow`** (committed) — NEW canonical FLOW SCOREBOARD subcommand +
   `.flow` folded into `--json`. Computes, from the studio's OWN light semantics (mirrors
   `pipeline/dashboard/server.mjs` cityRow/gateOf exactly): **verified** = a fresh owner APPROVE in
   `videos/<slug>/feedback.json` (kind:"decision", /^APPROVE/, `at` >= mp4 mtime) — NOT confidence
   blockers; **published** = `youtube.json` url set. Emits review-ready · awaiting-publish (named) ·
   published-24h/6 · hours-since-last-cut · STARVATION verdict. Removes the recurring friction of
   THREE routines (producer flow-alarm, briefing scoreboard, harness FLOW SLO) each hand-deriving
   the same numbers and risking disagreement. Verified: correctly caught boston+DC as awaiting-publish
   (the ledger view had missed it); all 4 modes run clean; default table unchanged.
2. **PROMPT EDIT — producer-work-session/SKILL.md** (outside repo, applied verbatim). FLOW SLO line
   now opens: *"FLOW SLO (read the canonical scoreboard FIRST — `node pipeline/status.mjs --flow`
   prints review-ready / awaiting-publish / published-24h / hours-since-last-cut / STARVATION verdict
   from the studio's own light semantics, so your alarm matches the board and you never re-derive it
   by hand): … if that command shows fewer than 2 videos review-ready AND nothing new became ready
   across your last two runs (or it prints STARVATION YES), that is a FLOW ALARM: …"*
3. **PROMPT EDIT — earth-one-channel-briefing/SKILL.md** (outside repo, applied verbatim). Section
   1 now: *"FLOW scoreboard FIRST — take it VERBATIM from `node pipeline/status.mjs --flow`
   (review-ready N · awaiting-Hadi-publish N · published-last-24h N/6 max · hours-since-last-cut ·
   STARVATION verdict, all from the studio's own verify/publish light semantics so the number you
   email matches the board Hadi clicks in; if it prints STARVATION YES or nothing new became ready in
   24h, say so in the subject line) then per-stage counts + confidence movement"*
4. **PROMPT EDIT — harness-improver/SKILL.md** (this task, applied verbatim). Step 6 FLOW SLO now:
   *"compute the flow state with `node pipeline/status.mjs --flow` — the canonical scoreboard …
   computed from the studio's OWN verify/publish light semantics: verified = a fresh owner APPROVE in
   videos/<slug>/feedback.json newer than the mp4 (NOT confidence-ledger blockers, which are producer
   context and never a flow gate), published = youtube.json url set. Do NOT hand-derive these — the
   tool is the single source of truth all three flow-reading routines share."*

### Biggest remaining bottleneck
**Owner publish throughput — and it is correctly outside the machine.** The production machine is
fully caught up: 20/20 rendered, 18 review-ready, **2 approved-and-unpublished**. Zero published
all-time. The gate from "ready" -> "live" is Hadi's watch-through + one publish click per video, which
the fleet must never automate (FLEET.md: "the owner is the only publisher"). The highest-leverage
lever left for the machine is therefore *surfacing* — making "2 videos are approved and awaiting your
publish click" the loud top line of his window. That is now wired: the briefing takes its scoreboard
verbatim from `--flow`, which names the awaiting-publish cities. If the awaiting-publish count keeps
climbing without a publish across the next 2–3 briefings, that is a signal to escalate (is the studio
publish button reachable / is Hadi blocked?), not a machine defect.
