# Pre-publish readiness QA — 2026-07-20

Channel manager daily run. Project published: **0 / 20**. Main job while published=0 is
pre-publish readiness. Checks per city: `youtube.json` (title ≤100ch, titleOptions,
description w/ chapters + MADE-BY-AN-AI block + tags), thumbnail (`thumbnail.jpg` OR
`thumbs/` candidates), and supporting `config.json` / rendered `mp4` / `render.lock.json`.

> **Intraday update (10:45 run).** An earlier run today (10:29, commit 6975676) flagged
> 12 batch-1 cities as missing thumbnail candidates. Between the two runs a routine ran the
> thumbnail extraction, and **all 12 now carry 6 real `thumbs/` candidate frames** — Gap 1
> is resolved (the studio-feedback note is already marked `resolved`). This table reflects
> the 10:45 state: **20/20 clear the thumbnail bar**. Only the titleOptions gap remains.

Legend: ✓ present · — missing · **bold** = gap filed to studio-feedback.json.

| City | title | titleOpts | desc+chapters | AI-block | tags | thumb.jpg | thumbs/ | mp4 | lock | verdict |
|------|:----:|:--------:|:-------------:|:--------:|:---:|:---------:|:-------:|:---:|:----:|---------|
| atlanta-ga | 92 | 2 | ✓ | ✓ | 11 | — | ✓ 6 | ✓ | ✓ | READY* |
| baltimore-md | 77 | 2 | ✓ | ✓ | 11 | — | ✓ 6 | ✓ | ✓ | READY* |
| boston-ma | 66 | 2 | ✓ | ✓ | 10 | — | ✓ 6 | ✓ | ✓ | READY* |
| buffalo-ny | 89 | 2 | ✓ | ✓ | 10 | — | ✓ 6 | ✓ | ✓ | READY* |
| charlotte-nc | 69 | 2 | ✓ | ✓ | 11 | — | ✓ 6 | ✓ | ✓ | READY* |
| chicago-il | 75 | 2 | ✓ | ✓ | 11 | — | ✓ 6 | ✓ | ✓ | READY* |
| cincinnati-oh | 76 | 2 | ✓ | ✓ | 10 | — | ✓ 6 | ✓ | ✓ | READY* |
| dallas-tx | 80 | 2 | ✓ | ✓ | 11 | — | ✓ 6 | ✓ | ✓ | READY* |
| denver-co | 66 | **0** | ✓ | ✓ | 10 | — | ✓ 6 | ✓ | ✓ | OPTS |
| detroit-mi | 65 | **0** | ✓ | ✓ | 11 | — | ✓ 6 | ✓ | ✓ | OPTS |
| grand-rapids-mi | 71 | 2 | ✓ | ✓ | 10 | — | ✓ 6 | ✓ | ✓ | READY* |
| kansas-city-mo | 82 | 2 | ✓ | ✓ | 11 | — | ✓ 6 | ✓ | ✓ | READY* |
| memphis-tn | 83 | 2 | ✓ | ✓ | 11 | — | ✓ 6 | ✓ | ✓ | READY* |
| milwaukee-wi | 68 | **0** | ✓ | ✓ | 11 | — | ✓ 6 | ✓ | ✓ | OPTS |
| minneapolis-mn | 74 | 2 | ✓ | ✓ | 11 | — | ✓ 6 | ✓ | ✓ | READY* |
| nashville-tn | 81 | 2 | ✓ | ✓ | 11 | — | ✓ 6 | ✓ | ✓ | READY* |
| philadelphia-pa | 70 | 2 | ✓ | ✓ | 10 | — | ✓ 6 | ✓ | ✓ | READY* |
| san-francisco-ca | 81 | 2 | ✓ | ✓ | 10 | — | ✓ 6 | ✓ | ✓ | READY* |
| seattle-wa | 76 | 2 | ✓ | ✓ | 11 | — | ✓ 6 | ✓ | ✓ | READY* |
| washington-dc | 71 | 2 | ✓ | ✓ | 9 | — | ✓ 6 | ✓ | ✓ | READY* |

\* READY = clears the readiness bar (candidates present + full metadata). It does NOT mean
publishable — publish is gated on the owner's manual verify/Approve light + zero producer
blockers in the confidence ledger, which this run does not assess.

## Findings

**Metadata is in excellent shape.** 20/20 have config, rendered mp4, render.lock, a title
≤100ch, a description carrying a chapter block (0:00 …) and the MADE-BY-AN-AI transparency
block, and non-empty tags. Every video is private (correct default).

**Gap 1 — thumbnails — RESOLVED (was: 12 cities).** The earlier 10:29 run flagged 12
batch-1 cities (atlanta-ga, baltimore-md, buffalo-ny, charlotte-nc, cincinnati-oh, dallas-tx,
denver-co, detroit-mi, kansas-city-mo, memphis-tn, milwaukee-wi, nashville-tn) as having
neither a `thumbnail.jpg` nor any `thumbs/` candidate. As of this 10:45 run **all 12 have 6
`thumbs/` candidate frames**, matching the original 8. The studio-feedback note is already
`resolved`. All 20 can now reach the studio publish modal's frame picker.

**Gap 2 — titleOptions (3 cities, still open).** denver-co, detroit-mi, milwaukee-wi still
have an empty `titleOptions` array, so the publish modal's title picker has no alternates to
offer. (These same 3 are the ledger's lowest-confidence cities at ~64/100.) The
studio-feedback note filed at 10:29 remains open (`resolved:false`) — not re-filed this run
to avoid duplication. Fix = author 2 verified alternates each, using only producer-verified
hook/punchline figures, ≤100 ch.

**Soft note (not filed).** No video has a *committed* `thumbnail.jpg` yet — that is by
design (the chosen/composed frame is written at publish time by the studio flow), so the
READY cities are not blocked, but a chosen thumbnail is still required before each upload.

## Playlist integrity
`PLWw8s8_dq_Co` "US Cities · Crime, Mapped" — verified live on the channel (this run):
exists, 0 items (nothing published to add yet). No drift. The `En Vocab as Categories`
playlist (6 items) is the unrelated pre-existing project, not managed here.
