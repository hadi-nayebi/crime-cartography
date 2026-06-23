---
name: self-compact
description: Autonomously trigger `/compact` + resume work without waking the user. Use when context indicator approaches 50% (Rule 31) AND user is unavailable (sleeping, AFK, or has explicitly authorized autonomous compaction). Sends ESC + `/compact <directive>` + Enter + wait + follow-up to the active Claude Code terminal via X11 or tmux.
version: 0.5.0
owner: architect (Layer 2)
---

# self-compact — autonomous /compact trigger

## When to invoke

**Mandatory conditions (all must hold):**
1. **Context indicator at or past ~50%** (per Rule 31 — the "festered above 50%" threshold).
2. **User is unavailable for AskUserQuestion** — explicitly sleeping, AFK, or has authorized autonomous compaction for the current run.
3. **A clear directive can be composed** — I know what to preserve (rules, current job state, recent commits, failure patterns) vs what to discard (verbose subagent intermediates, tool stdout, redundant chat).
4. **A clear follow-up is composable** — I know what work resumes after compact (which essay, which round, which dispatch).
5. **The Claude Code input is at empty prompt** — no half-typed text I'd clobber. ESC will clear whatever's there.

**Do NOT invoke when:**
- User is available and reachable — use AskUserQuestion to offer compact/handoff/continue (Rule 31 default path).
- Mid-multi-turn-edit-flow where the follow-up isn't obvious (better to ask).
- Context is below 40% — premature compaction wastes the cache TTL.

## How to invoke

```bash
bash hadi-nayebi.github.io/.claude/skills/self-compact/self-compact.sh \
  "<directive-text>" \
  "<follow-up-text>"
```

Both args go through Bash quoting — use single quotes or `"$(cat directive.md)"` for long directives with special chars.

## Required shapes (v0.3.0 SHAPE GATE)

Both args must carry required `## ` sections, each section BODY within a word-count range. A **section** is present iff a line equal to `## <NAME>` exists; its **body** is everything after that header line until the next `## ` line (any section) or end-of-string; the **word count** is whitespace-delimited tokens of the body. Extra `## ` sections are allowed and ignored; order is not enforced.

The shape forces me to articulate metacognition / carry-state / rules / next-action up front rather than emit a vague blob. Each directive section is an **instruction to the summarizing model** (what to extract, how) — NOT a pre-written summary.

**Directive (`$1`) required sections:**

| Section | Words |
|---------|------:|
| `## METACOGNITION` | 25-150 |
| `## STATE-TO-CARRY` | 25-150 |
| `## RULES-IN-FORCE` | 20-120 |
| `## NEXT-ACTION` | 15-100 |

**Follow-up (`$2`) required sections** (validated on the RAW `$2`, BEFORE the context-% prefix is prepended):

| Section | Words |
|---------|------:|
| `## RESUME` | 10-80 |
| `## GUARD` | 8-60 |

On any mismatch the script prints **every** failure (which section missing / actual-vs-range count) and exits 2, so I fix and retry. Validation runs both in the live path (before dispatch) and via `--check-shape`.

### Pre-flight / validate-only: `--check-shape`

```bash
bash .../self-compact.sh --check-shape -- "<directive>" "<follow-up>"
```

Validates both shapes and exits immediately — `0` with `[self-compact] shape OK`, or `2` with the full failure list. No mode detection, no dispatch, no pin. Use it to confirm a directive + follow-up are well-shaped before firing for real.

### Example of a correctly-shaped pair

Directive:

```
## METACOGNITION
I keep defaulting to "generalize everything" when many mechanisms are genuinely
case-by-case. This compact must remind me to research before grilling and to
rationalize each term against design intent rather than enshrine code as gospel.

## STATE-TO-CARRY
Glossary grill is mid-pass over category J terms; the next term to consolidate
is "Multiplier-at-phase-entry" plus several others still in draft awaiting the
user's review. Unpushed root commits since 16512178.

## RULES-IN-FORCE
Rule 54: all sync work goes to background workflows; main session only grills
and orchestrates. Rule 46: never silently consolidate — confirm each term.

## NEXT-ACTION
Resume the category-J grill at the multiplier term; bring concrete code findings
into the consolidation question before presenting it to the user for a typed answer.
```

Follow-up:

```
## RESUME
Resume the category-J grill pass at the multiplier-at-phase-entry term and present
a falsifiable consolidation question to the user for review.

## GUARD
Do not silently consolidate any term — wait for the user to confirm each one
before flipping the draft flag.
```

**Recommended pattern for long directives:** stage the directive in `~/.claude/projects/.../memory/compact_instruction.md`, then:

```bash
DIRECTIVE="$(cat ~/.claude/projects/.../memory/compact_instruction.md)"
FOLLOWUP="Resume B5.4 R3 — dispatch quality+ref-tag+coherence auditors in parallel per Rule 19 template, target blog/b5/05_4-job-core.md. Counter is 2; this round should take it to GOAL."
bash hadi-nayebi.github.io/.claude/skills/self-compact/self-compact.sh "$DIRECTIVE" "$FOLLOWUP"
```

## The dispatch sequence

The script auto-detects mode and runs in a **detached subshell** so this script returns 0 immediately:

**X11 mode** (when `$DISPLAY` set + xdotool + xclip):
1. Stage `/compact <directive>` on X11 clipboard (detached xclip)
2. Sleep `PRE_SLEEP` (0.7s) — let parent exit
3. `xdotool windowactivate --sync <wid>` — re-focus the Claude terminal
4. `xdotool key Escape` — interrupt any pending reply
5. Sleep 0.4s (ESCAPE_SETTLE)
6. `xdotool key ctrl+shift+v` — paste the /compact command
7. Sleep 0.3s, `xdotool key Return` — submit
8. Sleep `WAIT_SLEEP` (**3s** — user requirement 2026-06-03)
9. Re-stage follow-up on clipboard, re-focus, paste, submit — it **queues** in the TUI input during compaction and becomes the new session's first message the moment compaction finishes

**tmux mode** (when `$TMUX` set) — the **verified** mode, v0.5.0:
1. Same paste mechanics via `tmux set-buffer` + `tmux paste-buffer -p -d`. Pane target is `$TMUX_PANE`.
2. Follow-up pastes at **+3s** (`FOLLOWUP_DELAY`) — queues until compaction ends.
3. **Safety net:** the detached subshell then polls `capture-pane` for the `Compacted (` marker (baseline-relative), and after completion verifies the follow-up actually landed in the **session transcript jsonl** (fragment count > pre-paste baseline). Re-pastes ONLY if genuinely dropped (max `RETRY_MAX`=3) — never duplicates a delivered follow-up. The transcript is ground truth because the pane renders a multi-line paste as `[Pasted text #N]` (a pane grep false-negatives — the v0.4.0 live test double-pasted that way).

## Dry-run before live invocation

```bash
bash .../self-compact.sh --dry-run "<directive>" "<follow-up>"
```

Prints the plan (mode, target, payload lengths, first-200-char previews) without dispatching. Use to confirm targeting before firing for real.

## Targeting overrides

- `--wid <id>` — force X11 window ID (default: `$WINDOWID` → `xdotool getactivewindow`)
- `--pane <addr>` — force tmux pane (default: `$TMUX_PANE`)

## Logging

Subshell stdout/stderr → `$SELFCOMPACT_LOG` (default `/tmp/self_compact.log`). Tail this after dispatch to see what happened.

## Env knobs

- `SELFCOMPACT_PRE_SLEEP` — seconds before keystrokes fire (default 0.7)
- `SELFCOMPACT_FOLLOWUP_DELAY` — tmux: seconds between /compact submission and the follow-up paste (default **3** — user requirement; the paste queues during compaction)
- `SELFCOMPACT_WAIT_SLEEP` — X11 alias for the same delay (default 3)
- `SELFCOMPACT_POLL_INTERVAL` / `SELFCOMPACT_POLL_TIMEOUT` — tmux safety net: completion-poll cadence (3s) / cap (600s, fail-open)
- `SELFCOMPACT_VERIFY_TIMEOUT` — tmux: max wait for the follow-up to appear in the transcript jsonl post-compact (default 60)
- `SELFCOMPACT_RETRY_MAX` — tmux: re-pastes when the transcript shows the follow-up genuinely missing (default 3)
- `SELFCOMPACT_LOG` — log file (default `/tmp/self_compact.log`)

## Failure history (why this design)

- **2026-06-03 night (dead session):** follow-up pasted at +2s was DROPPED — compact landed, no follow-up message, session sat dead. The +3s paste normally queues safely; the drop is rare but real. The v0.5.0 **transcript-verify safety net** catches exactly this: if the fragment never reaches the session jsonl after compaction, the follow-up is re-pasted.
- **2026-06-03 live test (v0.4.0):** pasting AFTER completion (~100s later) left a dead window the user read as failure, collided with their typing, and the pane-grep verify false-negatived (TUI shows `[Pasted text #N]`) → double-paste. Hence: paste at +3s, verify via transcript only, re-paste only on transcript absence.

## Composing the directive

The directive becomes the body of `/compact <directive>` — Claude Code passes it to the compacting model as guidance for what to preserve/discard. Good directives are:

- **Specific about what to preserve verbatim** (named brain rules, the active goal, current job state, recent unpushed commits, failure patterns)
- **Specific about what's safe to drop** (verbose intermediate subagent output already persisted in commits/memory, tool stdout, redundant chat drafts)
- **Concise** — typically 200-800 words. The model needs guidance, not the full conversation re-stated.

See `memory/compact_instruction.md` for a paste-ready template the user maintains.

## Composing the follow-up

The follow-up is the first user-message after compact — it's what kicks the new session into action. Good follow-ups are:

- **Action-imperative** ("Resume B5.4 R3", "Continue with the B6.1 first-clean round", "Pick up where B7 audit left off")
- **Self-contained** — the compacted summary will have context, but the follow-up should name the next specific dispatch so I don't dither
- **Single-purpose** — one essay, one round, one type of work. Resist bundling.

## Safety guardrails

- **Don't fire if a paid action is mid-flight** (TTS generation, image gen). The ESC will interrupt it and cost you the spend.
- **Don't fire during a partial commit** — the follow-up may collide with git prompts.
- **Don't fire if I haven't first written the latest state to a memory file** — context loss between compact and follow-up is real; the memory file is the ground truth.

## Origin

Built 2026-05-18 per user request after the user observed multiple sessions running past 85% before asking for compact. User said: "compact often to keep the context healthy; can you imitate the brain guard way of executing ESC and paste compact command yourself, I will be sleeping and not available to do this for you."

Distilled from `.claude/plugins/brain_guard/scripts/self-compact.sh` (1177 lines, plugin-coupled). Plugin dependencies (voice.xml, data.json, config.conf, 7-strategy window-targeting, 5-section format enforcement) stripped for Layer-2 standalone use.

## Related rules

- Rule 31 — Ask via AskUserQuestion BEFORE passing 50% context (the user-available default).
- Rule 29 — Memory-first rhythmic workflow (always persist state to memory BEFORE compacting).
- Rule 13 — Memory-as-job-file (the job memory file is what survives compact, not chat).

## v0.2.0 — per-session window/pane pin (multi-tab safety, 2026-06-01)

Multiple concurrent Claude sessions (terminal tabs) share this one script. Targeting is now **per-session**, not a global hardcoded window.

- **Always pass `--session <session-id>`** (the transcript jsonl basename). Pin store: `~/.claude/self-compact/data.json` keyed by session-id.
- **tmux is the recommended setup**: run each session in its own tmux pane; live `$TMUX_PANE` auto-targets it (`send-keys -t <pane>` reaches a background pane). No pin step needed.
- **x11 fallback**: gnome-terminal tabs share one X11 window, so X11 cannot isolate a background tab. Either pin from the target tab (`self-compact.sh pin --session <id>`) or pass `--wid`. An unpinned x11 session REFUSES (exit 2) rather than mis-fire.
- `pin` subcommand: `self-compact.sh pin --session <id>` records this session's pane+window.
