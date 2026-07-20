# Pre-publish readiness QA — 2026-07-20

Channel manager daily run. Project published: **0 / 20**. Main job while published=0 is
pre-publish readiness. Checks per city: `youtube.json` (title ≤100ch, titleOptions,
description w/ chapters + MADE-BY-AN-AI block + tags), thumbnail (`thumbnail.jpg` OR
`thumbs/` candidates), and supporting `config.json` / rendered `mp4` / `render.lock.json`.

Legend: ✓ present · �— missing · **bold** = gap filed to studio-feedback.json.

| City | title | titleOpts | desc+chapters | AI-block | tags | thumb.jpg | thumbs/ | mp4 | lock | verdict |
|------|:----:|:--------:|:-------------:|:--------:|:---:|:---------:|:-------:|:---:|:----:|---------|
| atlanta-ga | 92 | 2 | ✓ | ✓ | 11 | �— | **�— 0** | ✓ | ✓ | THUMBS |
| baltimore-md | 77 | 2 | ✓ | ✓ | 11 | �— | **�— 0** | ✓ | ✓ | THUMBS |
| boston-ma | 66 | 2 | ✓ | ✓ | 10 | �— | ✓ 6 | ✓ | ✓ | READY* |
| buffalo-ny | 89 | 2 | ✓ | ✓ | 10 | �— | **�— 0** | ✓ | ✓ | THUMBS |
| charlotte-nc | 69 | 2 | ✓ | ✓ | 11 | �— | **�— 0** | ✓ | ✓ | THUMBS |
| chicago-il | 75 | 2 | ✓ | ✓ | 11 | �— | ✓ 6 | ✓ | ✓ | READY* |
| cincinnati-oh | 76 | 2 | ✓ | ✓ | 10 | �— | **�— 0** | ✓ | ✓ | THUMBS |
| dallas-tx | 80 | 2 | ✓ | ✓ | 11 | �— | **�— 0** | ✓ | ✓ | THUMBS |
| denver-co | 66 | **0** | ✓ | ✓ | 10 | �— | **�— 0** | ✓ | ✓ | THUMBS+OPTS |
| detroit-mi | 65 | **0** | ✓ | ✓ | 11 | �— | **�— 0** | ✓ | ✓ | THUMBS+OPTS |
| grand-rapids-mi | 71 | 2 | ✓ | ✓ | 10 | �— | ✓ 6 | ✓ | ✓ | READY* |
| kansas-city-mo | 82 | 2 | ✓ | ✓ | 11 | �— | **�— 0** | ✓ | ✓ | THUMBS |
| memphis-tn | 83 | 2 | ✓ | ✓ | 11 | �— | **�— 0** | ✓ | ✓ | THUMBS |
| milwaukee-wi | 68 | **0** | ✓ | ✓ | 11 | �— | **�— 0** | ✓ | ✓ | THUMBS+OPTS |
| minneapolis-mn | 74 | 2 | ✓ | ✓ | 11 | �— | ✓ 6 | ✓ | ✓ | READY* |
| nashville-tn | 81 | 2 | ✓ | ✓ | 11 | �— | **�— 0** | ✓ | ✓ | THUMBS |
| philadelphia-pa | 70 | 2 | ✓ | ✓ | 10 | �— | ✓ 6 | ✓ | ✓ | READY* |
| san-francisco-ca | 81 | 2 | ✓ | ✓ | 10 | �— | ✓ 6 | ✓ | ✓ | READY* |
| seattle-wa | 76 | 2 | ✓ | ✓ | 11 | �— | ✓ 6 | ✓ | ✓ | READY* |
| washington-dc | 71 | 2 | ✓ | ✓ | 9 | �— | ✓ 6 | ✓ | ✓ | READY* |

\* READY = clears the readiness bar (candidates present + full metadata). It does NOT mean
publishable — publish is gated on the owner's manual verify/Approve light + zero producer
blockers in the confidence ledger, which this run does not assess.

## Findings

**Metadata is in excellent shape.** 20/20 have config, rendered mp4, render.lock, a title
≤100ch, a description carrying a chapter block (0:00 …) and the MADE-BY-AN-AI transparency
block, and non-empty tags. Every video is private (correct default).

**Gap 1 — thumbnails (12 cities, publish blocker).** The 12 batch-1 cities
(atlanta-ga, baltimore-md, buffalo-ny, charlotte-nc, cincinnati-oh, dallas-tx, denver-co,
detroit-mi, kansas-city-mo, memphis-tn, milwaukee-wi, nashville-tn) have **neither a
`thumbnail.jpg` nor any `thumbs/` candidate frames**. The all-green publish gate and the
studio publish modal both need real candidate frames to pick or compose from, so these 12
cannot reach the publish modal. The original 8 (boston, chicago, grand-rapids, minneapolis,
philadelphia, san-francisco, seattle, washington-dc) have 6 pre-warmed candidates each and
clear this bar. → filed to studio-feedback.json.

**Gap 2 — titleOptions (3 cities).** denver-co, detroit-mi, milwaukee-wi have an empty
`titleOptions` array; the publish modal's title picker has no alternates to offer. (These
same 3 are the ledger's lowest-confidence cities at ~64/100.) → filed to studio-feedback.json.

**Soft note (not filed).** No video has a *committed* `thumbnail.jpg` yet — that is by
design (the chosen/composed frame is written at publish time by the studio flow), so the 8
READY cities are not blocked, but a chosen thumbnail is still required before each actual
upload.

## Playlist integrity
`PLWw8s8_dq_Co` "US Cities · Crime, Mapped" — verified live on the channel: exists, public,
0 items (nothing published to add yet). No drift.
