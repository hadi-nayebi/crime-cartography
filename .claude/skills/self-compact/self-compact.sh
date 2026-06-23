#!/usr/bin/env bash
# self-compact.sh — Layer-2 standalone autonomous /compact trigger
# v0.1.0 — 2026-05-18 — Hadi Nayebi project
#
# Distilled from .claude/plugins/brain_guard/scripts/self-compact.sh (Layer 1).
# Plugin-coupled bits (voice.xml, data.json, config.conf, 7-strategy ladder,
# 5-section format enforcement) stripped. Single user, single Claude Code
# session, supports X11 (xdotool+xclip) and tmux (send-keys+paste-buffer).
#
# WHY: lets the architect (Layer 2) autonomously compact + resume work when
# context fills, without waking the user. Per CLAUDE.md Rule 31.
#
# USAGE:
#   self-compact.sh "<directive>" "<follow-up>"
#
# ARGS:
#   $1 = compact directive — what /compact should preserve / discard.
#        Required. Typically 200-800 words. The directive will be prefixed
#        with "/compact " before being pasted.
#        SHAPE GATE (v0.3.0): the directive MUST contain these `## ` sections,
#        each section BODY within the given word range (word = whitespace token):
#          ## METACOGNITION   (25-150 words)
#          ## STATE-TO-CARRY  (25-150 words)
#          ## RULES-IN-FORCE  (20-120 words)
#          ## NEXT-ACTION     (15-100 words)
#        Each section is an INSTRUCTION to the summarizing model (what to extract
#        / how), not a pre-written summary. Extra `## ` sections are allowed;
#        order is not enforced. A missing/out-of-range section -> exit 2 with a
#        specific message naming the section + actual-vs-range count.
#   $2 = follow-up command — what to send after /compact completes.
#        SHAPE GATE (v0.3.0): the RAW follow-up (validated BEFORE the context-%
#        prefix is prepended) MUST contain these `## ` sections within range:
#          ## RESUME  (10-80 words)
#          ## GUARD   (8-60 words)
#        MANDATORY (Rule 42). The script REFUSES to run without it: the
#        follow-up is the ONLY thing that resumes the run after /compact;
#        with none, the session halts until the user manually prompts.
#        Keep it SHORT — a continuation kick, e.g. "/goal continue — Phase C-3".
#        Do NOT re-paste an active /goal definition (it persists across compact).
#        CONTEXT PREFIX (v0.1.6): the follow-up is auto-prefixed with a one-line
#        context reading — e.g. "[self-compact: fired at ~62% ctx (620k/1M);
#        context now reset — check statusline for live %] ". It uses the SAME
#        logic as the statusline / brain_guard context-sensor: read the LAST
#        .message.usage entry of the active transcript jsonl (input +
#        cache_creation + cache_read) over the 1M window. The number is the
#        PRE-compact high-water (the level that TRIGGERED this compact),
#        captured at dispatch start — that is the reading reliably available to
#        an external script. It is LABELED "context now reset" so the resumed
#        agent never mistakes it for live post-compact context (which the
#        statusline reports). If the transcript can't be measured, no prefix is
#        added (graceful degradation).
#
# FLAGS:
#   --wid <id>     X11 window ID override (default: $WINDOWID, then
#                  `xdotool getactivewindow`)
#   --pane <addr>  tmux pane override (default: $TMUX_PANE)
#   --dry-run      print the plan, don't dispatch
#   --check-shape  validate the directive + follow-up shapes ONLY, then exit
#                  (0 with "[self-compact] shape OK", or 2 with the full failure
#                  list). No mode detection, dispatch, or pin. The pre-flight +
#                  testable surface. Still requires both positionals.
#   --help         show this header
#
# ENV KNOBS:
#   SELFCOMPACT_PRE_SLEEP    seconds before keystrokes fire (default 0.7)
#                            — gives the parent script time to exit cleanly
#   SELFCOMPACT_FOLLOWUP_DELAY  seconds between submitting /compact and pasting
#                            the follow-up (default 3 — USER REQUIREMENT
#                            2026-06-03: the follow-up must land ~3s after the
#                            compact instruction; it QUEUES in the TUI input and
#                            becomes the new session's first message the moment
#                            compaction finishes — no dead window, no collision
#                            with a user typing into a long-idle prompt).
#   SELFCOMPACT_WAIT_SLEEP   X11 MODE ONLY: alias for the same +3s follow-up
#                            delay (default 3). X11 has no transcript-verify
#                            safety net — tmux is the verified mode.
#                            Still true: the OTHER way to lose the follow-up is
#                            killing the launching Bash call before the detached
#                            subshell reaches "/compact submitted" — invoke this
#                            script BARE, nothing appended.
#   SELFCOMPACT_POLL_INTERVAL  tmux mode: seconds between capture-pane polls for
#                            compact completion (default 3)
#   SELFCOMPACT_POLL_TIMEOUT   tmux mode: max seconds to wait for completion
#                            (default 600). On timeout we proceed to the
#                            transcript verify anyway — fail-open.
#   SELFCOMPACT_POST_SETTLE    tmux mode: pause after completion detected before
#                            starting the transcript verify (default 2)
#   SELFCOMPACT_VERIFY_TIMEOUT tmux mode: max seconds to wait for the follow-up
#                            to appear in the session transcript jsonl after
#                            compaction (default 60). The TRANSCRIPT is ground
#                            truth — the pane renders a multi-line paste as
#                            "[Pasted text #N]", so a pane grep false-negatives
#                            (the v0.4.0 live test double-pasted exactly that
#                            way, hijacking the user's in-progress typing).
#   SELFCOMPACT_RETRY_MAX      tmux mode: follow-up re-pastes when the transcript
#                            verify finds it genuinely missing (default 3).
#                            Re-paste fires ONLY on transcript absence — never
#                            duplicates a delivered follow-up.
#   SELFCOMPACT_LOG          log file (default /tmp/self_compact.log)
#   SELFCOMPACT_TRANSCRIPT_DIR   dir holding the session jsonl transcripts
#                            (default: this project's ~/.claude/projects/<slug>).
#                            The active transcript = newest *.jsonl within it.
#   SELFCOMPACT_CONTEXT_HELPER   path to the shared context-helper.sh whose
#                            compute_context_size is reused (default: the
#                            prototype's lib/context-helper.sh). An inline
#                            fallback is used if the file is absent.
#   SELFCOMPACT_MAX_CONTEXT_TOKENS  window size for the % math (default 1000000,
#                            the Opus 4.7 1M window — matches the sensor).
#
# EXIT CODES:
#   0 = success (the detached subshell was launched; check log for outcome)
#   2 = env / arg validation failed
#
# SAFETY NOTES:
#   - The subshell detaches and runs after the parent exits, so this script
#     returns 0 immediately upon successful dispatch. Errors during the
#     keystroke sequence land in $SELFCOMPACT_LOG, not stdout.
#   - X11 mode: capture the target window BEFORE the subshell so a focus
#     change after dispatch doesn't redirect keystrokes.
#   - tmux mode: $TMUX_PANE auto-resolves to the firing pane (the Claude
#     session). No pane-pin needed.
#   - Don't run this if you can't confirm a Claude Code prompt is at empty
#     input state — Escape will clear whatever's there.

set -uo pipefail

readonly SCRIPT_VERSION="0.5.0"
readonly PRE_SLEEP="${SELFCOMPACT_PRE_SLEEP:-0.7}"
readonly ESCAPE_SETTLE="0.4"
readonly PASTE_SETTLE="0.3"
# Follow-up delay (v0.5.0 — USER REQUIREMENT 2026-06-03): paste the follow-up
# ~3s after submitting /compact. It QUEUES in the TUI input during compaction
# and submits as the new session's first message the instant compaction ends.
# The v0.4.0 wait-then-paste design (paste AFTER completion, ~100s later) left
# a dead window the user mistook for failure and collided with their typing.
readonly FOLLOWUP_DELAY="${SELFCOMPACT_FOLLOWUP_DELAY:-3}"
# X11-mode alias for the same delay (X11 flow has no verify safety net).
readonly WAIT_SLEEP="${SELFCOMPACT_WAIT_SLEEP:-3}"
readonly CLIPBOARD_SETTLE="0.5"
# tmux-mode SAFETY NET (v0.5.0): after the +3s paste, poll for compaction
# completion, then verify the follow-up actually reached the session TRANSCRIPT
# jsonl; re-paste ONLY if it was genuinely dropped (dead-session failure mode
# 2026-06-03). Transcript, not pane: the TUI renders a multi-line paste as
# "[Pasted text #N]", so a pane grep false-negatives and double-pastes.
readonly POLL_INTERVAL="${SELFCOMPACT_POLL_INTERVAL:-3}"
readonly POLL_TIMEOUT="${SELFCOMPACT_POLL_TIMEOUT:-600}"
readonly POST_SETTLE="${SELFCOMPACT_POST_SETTLE:-2}"
readonly VERIFY_TIMEOUT="${SELFCOMPACT_VERIFY_TIMEOUT:-60}"
readonly RETRY_MAX="${SELFCOMPACT_RETRY_MAX:-3}"
# Completion marker = the line Claude Code prints when /compact finishes;
# running marker = the spinner text shown while compaction is in progress.
readonly DONE_MARKER="Compacted ("
readonly RUNNING_MARKER="Compacting"
readonly LOG_FILE="${SELFCOMPACT_LOG:-/tmp/self_compact.log}"

# ---------- per-session pin store ----------
# Multiple concurrent Claude sessions (other terminal tabs) each run THIS shared
# script. A single hardcoded window made EVERY session fire its /compact at the
# same tab. Instead each session targets ITS OWN pane/window, keyed by session-id
# in a machine-local data.json. PRIMARY mode is tmux: $TMUX_PANE is uniquely
# addressable (tmux send-keys -t <pane> reaches a BACKGROUND tab; X11 keystrokes
# cannot reach a background gnome-terminal tab). NO global hardcoded window — an
# unresolved target ERRORs rather than guessing (never mis-fire into another tab).
readonly PIN_STORE="${SELFCOMPACT_PIN_STORE:-$HOME/.claude/self-compact/data.json}"
SESSION_ID=""   # resolved after arg-parse: --session > $CLAUDE_SESSION_ID

# pin_lookup <field>  -> this session's pinned pin_pane / pin_wid (or empty)
pin_lookup() {
  [[ -z "$SESSION_ID" || ! -f "$PIN_STORE" ]] && return 0
  jq -r --arg s "$SESSION_ID" --arg f "$1" '.sessions[$s][$f] // empty' "$PIN_STORE" 2>/dev/null || true
}

# pin_write  -> record THIS session's current tmux pane + X11 window in the store
pin_write() {
  local pane="${TMUX_PANE:-}" wid="" ts tmp
  ts=$(date -Iseconds 2>/dev/null || echo "")
  [[ -n "${DISPLAY:-}" ]] && command -v xdotool >/dev/null 2>&1 && wid=$(xdotool getactivewindow 2>/dev/null || true)
  mkdir -p "$(dirname "$PIN_STORE")"
  [[ -f "$PIN_STORE" ]] || printf '{"schema_version":1,"sessions":{}}\n' > "$PIN_STORE"
  tmp=$(mktemp)
  jq --arg s "$SESSION_ID" --arg pane "$pane" --arg wid "$wid" \
     --arg tty "$(tty 2>/dev/null || echo '')" --arg ts "$ts" \
     '.sessions[$s] = {pin_pane:$pane, pin_wid:$wid, tty:$tty, pinned_at:$ts}' \
     "$PIN_STORE" > "$tmp" && mv "$tmp" "$PIN_STORE"
  echo "[self-compact] pinned session '$SESSION_ID' -> pane='${pane:-<none>}' wid='${wid:-<none>}'" >&2
}

# ---------- shape validation (v0.3.0) ----------
# Both the DIRECTIVE ($1, the summarizer instruction) and the FOLLOWUP ($2, the
# post-compact resume kick) must carry required `## ` sections, each within a
# word-count range. The shape COMPELS the caller to articulate metacognition /
# carry-state / rules / next-action (directive) and resume / guard (follow-up)
# rather than emit a vague blob. On mismatch we collect ALL failures and exit 2
# so the caller fixes-and-retries. Empty (extra non-required) `## ` sections are
# allowed and ignored; order is NOT enforced (presence + ranges only).

# _section_word_count <text> <section-name>  -> prints the body word count.
# Body = everything AFTER the "## <name>" header line, UNTIL the next line that
# begins with "## " (any section) OR end-of-string. Prints -1 if the section is
# ABSENT (no line equal to "## <name>", trailing whitespace allowed).
_section_word_count() {
  local text="$1" name="$2"
  awk -v target="## $name" '
    BEGIN { found=0; capturing=0; body="" }
    {
      line=$0
      # strip trailing whitespace for the header-equality test
      hdr=line; sub(/[ \t]+$/, "", hdr)
      if (hdr == target) { found=1; capturing=1; next }
      if (capturing && line ~ /^## /) { capturing=0 }
      if (capturing) { body = body " " line }
    }
    END {
      if (!found) { print -1; exit }
      n=split(body, a, /[ \t\n\r]+/)
      # split leaves an empty leading token when body starts with whitespace
      cnt=0
      for (i=1; i<=n; i++) if (a[i] != "") cnt++
      print cnt
    }
  ' <<< "$text"
}

# _shape_check <text> <label> <spec...>   spec = "NAME:LO:HI"
# Appends every failure (missing OR out-of-range) to the global SHAPE_FAILURES
# array. Does NOT exit — caller aggregates across directive + follow-up.
_shape_check() {
  local text="$1" label="$2"; shift 2
  local spec name lo hi cnt
  for spec in "$@"; do
    name="${spec%%:*}"
    lo="${spec#*:}"; lo="${lo%%:*}"
    hi="${spec##*:}"
    cnt="$(_section_word_count "$text" "$name")"
    if [[ "$cnt" -eq -1 ]]; then
      SHAPE_FAILURES+=("[self-compact] SHAPE ERROR: missing required section '## $name' in $label")
    elif [[ "$cnt" -lt "$lo" || "$cnt" -gt "$hi" ]]; then
      SHAPE_FAILURES+=("[self-compact] SHAPE ERROR: section '## $name' in $label has $cnt words, needs $lo-$hi")
    fi
  done
}

# validate_directive_shape <directive>  -> appends failures to SHAPE_FAILURES
validate_directive_shape() {
  _shape_check "$1" "directive" \
    "METACOGNITION:25:150" \
    "STATE-TO-CARRY:25:150" \
    "RULES-IN-FORCE:20:120" \
    "NEXT-ACTION:15:100"
}

# validate_followup_shape <raw-follow-up>  -> appends failures to SHAPE_FAILURES
# IMPORTANT: validate the RAW $2, BEFORE the context-% prefix is prepended.
validate_followup_shape() {
  _shape_check "$1" "follow-up" \
    "RESUME:10:80" \
    "GUARD:8:60"
}

# ---------- arg parsing ----------

DIRECTIVE=""
FOLLOWUP=""
OVERRIDE_WID=""
OVERRIDE_PANE=""
OVERRIDE_SESSION=""
DRY_RUN=0
PIN_MODE=0
CHECK_SHAPE=0
SHAPE_FAILURES=()

# Subcommand: `self-compact.sh pin --session <id>` records THIS session's target.
if [[ "${1:-}" == "pin" ]]; then PIN_MODE=1; shift; fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --wid)      OVERRIDE_WID="$2"; shift 2 ;;
    --pane)     OVERRIDE_PANE="$2"; shift 2 ;;
    --session)  OVERRIDE_SESSION="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=1; shift ;;
    --check-shape) CHECK_SHAPE=1; shift ;;
    --help|-h)  sed -n '2,62p' "$0"; exit 0 ;;
    --)         # everything after `--` is positional (end-of-flags). Assign the
                # remaining args as <directive> <follow-up> rather than dropping
                # them — lets callers safely pass directives that start with `-`.
                shift
                if [[ $# -gt 0 ]]; then DIRECTIVE="$1"; shift; fi
                if [[ $# -gt 0 ]]; then FOLLOWUP="$1"; shift; fi
                if [[ $# -gt 0 ]]; then echo "[self-compact] ERROR: too many positional args" >&2; exit 2; fi
                break ;;
    --*)        echo "[self-compact] ERROR: unknown flag: $1" >&2; exit 2 ;;
    *)
      if [[ -z "$DIRECTIVE" ]]; then DIRECTIVE="$1"
      elif [[ -z "$FOLLOWUP" ]]; then FOLLOWUP="$1"
      else echo "[self-compact] ERROR: too many positional args" >&2; exit 2
      fi
      shift ;;
  esac
done

SESSION_ID="${OVERRIDE_SESSION:-${CLAUDE_SESSION_ID:-}}"

# pin subcommand: record THIS session's pane/window and exit (no directive needed)
if [[ "$PIN_MODE" -eq 1 ]]; then
  [[ -z "$SESSION_ID" ]] && { echo "[self-compact] ERROR: 'pin' needs --session <id> (or \$CLAUDE_SESSION_ID set)." >&2; exit 2; }
  command -v jq >/dev/null 2>&1 || { echo "[self-compact] ERROR: jq required for pin." >&2; exit 2; }
  pin_write
  exit 0
fi

if [[ -z "$DIRECTIVE" ]]; then
  echo "[self-compact] ERROR: missing required <directive>. See --help." >&2
  exit 2
fi
# Follow-up is MANDATORY (Rule 42). No silent default: a self-compact with no
# follow-up halts the run until the user prompts. Refuse loudly instead of
# substituting a generic prompt that doesn't drive the active goal forward.
if [[ -z "$FOLLOWUP" ]]; then
  echo "[self-compact] ERROR: missing required <follow-up> (Rule 42). The follow-up is the ONLY thing that resumes the run after /compact — without it the session halts. Pass a short continuation kick, e.g. '/goal continue — Phase C-3'. See --help." >&2
  exit 2
fi

# ---------- shape gate (v0.3.0) ----------
# Validate the DIRECTIVE and the RAW FOLLOWUP ($2, BEFORE the context-% prefix is
# prepended further down) against their required `## ` section shapes. Collect
# ALL failures, print them, exit 2 on any mismatch. --check-shape stops here
# (pre-flight / testable surface: no mode detection, dispatch, or pin).
validate_directive_shape "$DIRECTIVE"
validate_followup_shape "$FOLLOWUP"
if [[ "${#SHAPE_FAILURES[@]}" -gt 0 ]]; then
  printf '%s\n' "${SHAPE_FAILURES[@]}" >&2
  exit 2
fi
if [[ "$CHECK_SHAPE" -eq 1 ]]; then
  echo "[self-compact] shape OK"
  exit 0
fi

# Sanity guard against accidentally-massive payloads
if [[ ${#DIRECTIVE} -gt 16384 ]]; then
  echo "[self-compact] ERROR: directive >16KB; that's almost certainly wrong" >&2
  exit 2
fi

# ---------- context measurement (prefix the follow-up) ----------
# Mirror the statusline / brain_guard context-sensor: read the LAST
# .message.usage entry of the active transcript jsonl (input + cache_creation
# + cache_read) and express it as a % of the 1M window. Captured HERE — before
# /compact runs — because the pre-compact high-water is the reading reliably
# available to an external script (the post-compact reset turn isn't logged yet
# at follow-up-paste time). We REUSE the prototype's shared helper so the math
# stays single-sourced (Rule 41 reuse>extend>add); an inline fallback covers
# path drift. The prefix is LABELED "context now reset" so the resumed agent
# treats it as the level it compacted FROM, not as live context.
MAX_CONTEXT_TOKENS="${SELFCOMPACT_MAX_CONTEXT_TOKENS:-1000000}"
TRANSCRIPT_DIR="${SELFCOMPACT_TRANSCRIPT_DIR:-$HOME/.claude/projects/-home-hadinayebi-CodingProjects-hadosh-academy-hadi-nayebi-github-io}"
CONTEXT_HELPER_SH="${SELFCOMPACT_CONTEXT_HELPER:-$HOME/CodingProjects/hadosh_academy/.claude/plugins/lib/context-helper.sh}"

if [[ -f "$CONTEXT_HELPER_SH" ]]; then
  source "$CONTEXT_HELPER_SH" 2>/dev/null || true
fi
# Inline fallback: identical pipeline to lib/context-helper.sh compute_context_size.
if ! declare -f compute_context_size >/dev/null 2>&1; then
  compute_context_size() {
    local tx="${1:-}"
    [[ -z "$tx" || ! -f "$tx" ]] && { echo 0; return 0; }
    local u
    u=$(grep '"message"' "$tx" 2>/dev/null | grep '"usage"' 2>/dev/null \
        | tail -n 1 | jq -c '.message.usage' 2>/dev/null || echo "")
    [[ -z "$u" ]] && { echo 0; return 0; }
    echo "$u" | jq '(.input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0)' 2>/dev/null || echo 0
  }
fi

CTX_PREFIX=""
if [[ -d "$TRANSCRIPT_DIR" ]]; then
  # Prefer THIS session's own transcript (avoids reading a CONCURRENT session's
  # jsonl when several run in the same project); fall back to newest.
  if [[ -n "$SESSION_ID" && -f "$TRANSCRIPT_DIR/$SESSION_ID.jsonl" ]]; then
    _tx="$TRANSCRIPT_DIR/$SESSION_ID.jsonl"
  else
    _tx=$(ls -t "$TRANSCRIPT_DIR"/*.jsonl 2>/dev/null | head -1)
  fi
  if [[ -n "$_tx" ]]; then
    _total=$(compute_context_size "$_tx")
    if [[ "$_total" =~ ^[0-9]+$ ]] && [[ "$_total" -gt 0 ]]; then
      _pct=$(( _total * 100 / MAX_CONTEXT_TOKENS ))
      _total_k=$(( _total / 1000 ))
      CTX_PREFIX="[self-compact: fired at ~${_pct}% ctx (${_total_k}k/1M); context now reset — check statusline for live %] "
    fi
  fi
fi
FOLLOWUP="${CTX_PREFIX}${FOLLOWUP}"
# The session transcript jsonl — ground truth for the follow-up verify
# (empty string when no transcript dir / file was resolvable: verify skips).
TRANSCRIPT_FILE="${_tx:-}"

# ---------- mode detection ----------

select_mode() {
  if [[ -n "${TMUX:-}" ]]; then echo "tmux"; return; fi
  if [[ -n "${DISPLAY:-}" ]] && command -v xdotool >/dev/null 2>&1 \
       && command -v xclip >/dev/null 2>&1; then echo "x11"; return; fi
  echo "none"
}

MODE=$(select_mode)

# ---------- target resolution ----------

resolve_target() {
  case "$MODE" in
    tmux)
      # Per-pane targeting: live $TMUX_PANE (this session's OWN pane) wins, then
      # --pane override, then this session's pinned pane. tmux send-keys reaches
      # a BACKGROUND pane, so concurrent sessions never collide.
      local p="${OVERRIDE_PANE:-${TMUX_PANE:-}}"
      [[ -z "$p" ]] && p="$(pin_lookup pin_pane)"
      if [[ -z "$p" ]]; then
        echo "[self-compact] ERROR: tmux mode but no \$TMUX_PANE / --pane / pinned pane for session '${SESSION_ID:-<none>}'. Pin first: self-compact.sh pin --session <id>" >&2; exit 2
      fi
      if ! tmux list-panes -a -F '#{pane_id}' 2>/dev/null | grep -qx "$p"; then
        echo "[self-compact] ERROR: tmux pane '$p' does not exist" >&2; exit 2
      fi
      echo "$p" ;;
    x11)
      # NO global hardcoded window, NO getactivewindow guess: an explicit --wid,
      # or THIS session's pinned wid, or ERROR. (X11 keystrokes cannot isolate a
      # background gnome-terminal TAB — prefer tmux for concurrent sessions.)
      local w="${OVERRIDE_WID:-}"
      [[ -z "$w" ]] && w="$(pin_lookup pin_wid)"
      if [[ -z "$w" ]]; then
        echo "[self-compact] ERROR: x11 mode, no --wid and no pinned wid for session '${SESSION_ID:-<none>}'. Pin from the target tab: self-compact.sh pin --session <id> (or pass --wid). NOTE: X11 can't isolate a background gnome-terminal tab — use tmux for concurrent sessions." >&2; exit 2
      fi
      if ! xdotool getwindowname "$w" >/dev/null 2>&1; then
        echo "[self-compact] ERROR: x11 window id '$w' does not exist (stale pin? re-pin from the target tab)" >&2; exit 2
      fi
      echo "$w" ;;
    none)
      echo "[self-compact] ERROR: no dispatch mode available. Need TMUX env OR (DISPLAY+xdotool+xclip)." >&2
      exit 2 ;;
  esac
}

# NOTE: resolve_target's `exit 2` runs inside this command substitution's
# subshell, so it does NOT abort the parent on its own — we must propagate it.
if ! TARGET=$(resolve_target); then exit 2; fi
[[ -z "$TARGET" ]] && { echo "[self-compact] ERROR: empty dispatch target — refusing (no guess)." >&2; exit 2; }

# ---------- dispatch ----------

# wait_for_compact_done <pane> <baseline-count>
# Poll capture-pane until /compact actually completes. Two signals, either
# suffices: (a) DONE_MARKER count exceeds the baseline captured BEFORE /compact
# was pasted (baseline-relative so a marker left from an earlier compact never
# counts); (b) RUNNING_MARKER ("Compacting" spinner) was observed then gone —
# covers the edge where an old marker scrolls off and the count never exceeds
# baseline. capture-pane -J joins wrapped lines so width never splits a match.
# On timeout: return 0 anyway (FAIL-OPEN — proceed to the transcript verify;
# the follow-up was already pasted at +3s). Never non-zero: must not kill the
# detached sequence.
wait_for_compact_done() {
  local pane="$1" baseline="$2"
  local max_iter waited=0 saw_running=0 pane_text done_count
  # awk, not $(( )): POLL_INTERVAL may be fractional in tests.
  max_iter=$(awk -v t="$POLL_TIMEOUT" -v i="$POLL_INTERVAL" \
    'BEGIN { if (i <= 0) i = 1; n = int(t / i); print (n > 0 ? n : 1) }')
  echo "[$(date -Iseconds)] polling for compact completion (every ${POLL_INTERVAL}s, timeout ${POLL_TIMEOUT}s, baseline=${baseline})"
  while (( waited < max_iter )); do
    sleep "$POLL_INTERVAL"
    waited=$((waited + 1))
    pane_text=$(tmux capture-pane -t "$pane" -p -J 2>/dev/null || true)
    done_count=$(printf '%s' "$pane_text" | grep -cF "$DONE_MARKER" || true)
    if (( done_count > baseline )); then
      echo "[$(date -Iseconds)] compact COMPLETED (marker ${done_count} > baseline ${baseline}, ${waited} polls)"
      return 0
    fi
    if printf '%s' "$pane_text" | grep -qF "$RUNNING_MARKER"; then
      saw_running=1
    elif (( saw_running == 1 )); then
      echo "[$(date -Iseconds)] compact COMPLETED (running-marker observed then gone, ${waited} polls)"
      return 0
    fi
  done
  echo "[$(date -Iseconds)] WARNING: compact completion NOT detected in ${POLL_TIMEOUT}s — proceeding fail-open"
  return 0
}

# followup_fragment
# A single-line, JSON-safe fragment of FOLLOWUP for the transcript grep.
# The jsonl stores newlines as the two characters \n, so a multi-line fragment
# never matches raw. Quotes/backslashes are JSON-escaped — truncate before the
# first one. Use the first line that still has >=15 plain chars.
followup_fragment() {
  local line frag
  while IFS= read -r line; do
    frag="${line%%[\"\\]*}"
    frag="${frag:0:60}"
    if (( ${#frag} >= 15 )); then printf '%s' "$frag"; return 0; fi
  done <<< "$FOLLOWUP"
  printf '%s' "${FOLLOWUP:0:15}"
}

# verify_followup_in_transcript <baseline-count> <fragment>
# Ground truth: the follow-up was DELIVERED iff its fragment count in the
# session transcript jsonl EXCEEDS the pre-paste baseline (baseline-relative so
# a similar earlier message never counts). The queued follow-up only lands in
# the jsonl once the post-compact turn starts, so poll patiently. Returns 0 on
# delivered, 1 on timeout. No transcript file => 0 (fail-open, can't verify).
verify_followup_in_transcript() {
  local baseline="$1" frag="$2" iter=0 max_iter count
  if [[ -z "$TRANSCRIPT_FILE" || ! -f "$TRANSCRIPT_FILE" ]]; then
    echo "[$(date -Iseconds)] no transcript file to verify against — skipping verify (fail-open)"
    return 0
  fi
  # awk, not $(( )): POLL_INTERVAL may be fractional in tests.
  max_iter=$(awk -v t="$VERIFY_TIMEOUT" -v i="$POLL_INTERVAL" \
    'BEGIN { if (i <= 0) i = 1; n = int(t / i); print (n > 0 ? n : 1) }')
  while (( iter < max_iter )); do
    count=$(grep -cF "$frag" "$TRANSCRIPT_FILE" 2>/dev/null || true)
    if (( count > baseline )); then
      echo "[$(date -Iseconds)] follow-up VERIFIED in transcript (${count} > baseline ${baseline})"
      return 0
    fi
    sleep "$POLL_INTERVAL"
    iter=$((iter + 1))
  done
  return 1
}

dispatch_tmux() {
  local pane="$1"
  # Run detached so the parent (this script) can exit cleanly
  (
    exec </dev/null >>"$LOG_FILE" 2>&1
    echo "[$(date -Iseconds)] tmux dispatch START pane=$pane pid=$$"
    sleep "$PRE_SLEEP"

    local frag tx_baseline baseline
    frag=$(followup_fragment)
    # Baselines BEFORE any paste — both checks are baseline-relative.
    tx_baseline=$(grep -cF "$frag" "$TRANSCRIPT_FILE" 2>/dev/null || true)
    baseline=$(tmux capture-pane -t "$pane" -p -J 2>/dev/null | grep -cF "$DONE_MARKER" || true)

    # Robust clear to a known-EMPTY prompt before pasting /compact. ONE Escape
    # is NOT reliable across all TUI states (residual typed text, an open
    # menu/autocomplete, a mid-render frame): if the input is not empty, the
    # bracketed /compact paste APPENDS to it, Enter submits a normal message,
    # /compact never fires, and the poller hangs to timeout. Escape (dismiss any
    # mode) -> C-u (kill-line: clear residual input) -> Escape again, each with a
    # settle, makes the fixed clear reliable. Hardcoded here so the clear can
    # never be dropped or reassembled per call.
    tmux send-keys -t "$pane" Escape; sleep "$ESCAPE_SETTLE"
    tmux send-keys -t "$pane" C-u;    sleep "$ESCAPE_SETTLE"
    tmux send-keys -t "$pane" Escape; sleep "$ESCAPE_SETTLE"

    tmux set-buffer -- "/compact $DIRECTIVE"
    tmux paste-buffer -t "$pane" -p -d
    sleep "$PASTE_SETTLE"
    tmux send-keys -t "$pane" Enter
    echo "[$(date -Iseconds)] /compact submitted"

    # FOLLOW-UP AT +${FOLLOWUP_DELAY}s (user requirement 2026-06-03): the paste
    # QUEUES in the TUI input while compaction runs and submits as the new
    # session's first message the instant it finishes. Pasting AFTER completion
    # (v0.4.0) left a ~100s dead window and collided with the user's typing.
    sleep "$FOLLOWUP_DELAY"
    tmux set-buffer -- "$FOLLOWUP"
    tmux paste-buffer -t "$pane" -p -d
    sleep "$PASTE_SETTLE"
    tmux send-keys -t "$pane" Enter
    echo "[$(date -Iseconds)] follow-up pasted at +${FOLLOWUP_DELAY}s (queued for post-compact delivery)"

    # SAFETY NET — wait out the compaction, then confirm delivery in the
    # TRANSCRIPT. Re-paste ONLY if the follow-up was genuinely dropped (the
    # 2026-06-03 dead-session failure mode). Never duplicates a delivered one.
    wait_for_compact_done "$pane" "$baseline"
    sleep "$POST_SETTLE"
    local attempt=0
    until verify_followup_in_transcript "$tx_baseline" "$frag"; do
      attempt=$((attempt + 1))
      if (( attempt > RETRY_MAX )); then
        echo "[$(date -Iseconds)] ERROR: follow-up NOT in transcript after ${RETRY_MAX} re-pastes — session may need a manual kick"
        break
      fi
      echo "[$(date -Iseconds)] follow-up MISSING from transcript — re-pasting (attempt ${attempt}/${RETRY_MAX})"
      tmux set-buffer -- "$FOLLOWUP"
      tmux paste-buffer -t "$pane" -p -d
      sleep "$PASTE_SETTLE"
      tmux send-keys -t "$pane" Enter
    done
    echo "[$(date -Iseconds)] dispatch DONE"
  ) &
  disown 2>/dev/null || true
}

dispatch_x11() {
  local wid="$1"

  # Stage the /compact payload on clipboard BEFORE the subshell.
  # ( cmd & ) detaches xclip so it can hold the selection without blocking us.
  printf '%s' "/compact $DIRECTIVE" | ( xclip -selection clipboard >/dev/null 2>&1 & )
  sleep "$CLIPBOARD_SETTLE"

  (
    exec </dev/null >>"$LOG_FILE" 2>&1
    echo "[$(date -Iseconds)] x11 dispatch START wid=$wid pid=$$"
    sleep "$PRE_SLEEP"

    xdotool windowactivate --sync "$wid"
    # Robust clear to a known-EMPTY prompt before pasting /compact (mirror of the
    # tmux path): one Escape is not reliable across TUI states, so Escape (dismiss
    # mode) -> ctrl+u (kill-line) -> Escape again, each with a settle. Hardcoded
    # so the clear can never be dropped per call.
    xdotool key Escape;  sleep "$ESCAPE_SETTLE"
    xdotool key ctrl+u;  sleep "$ESCAPE_SETTLE"
    xdotool key Escape;  sleep "$ESCAPE_SETTLE"

    xdotool key ctrl+shift+v
    sleep "$PASTE_SETTLE"
    xdotool key Return

    # Follow-up at +${WAIT_SLEEP}s (user requirement 2026-06-03): it QUEUES in
    # the TUI input during compaction and submits when compaction finishes.
    # X11 cannot read window content (xdotool sends keys only), so there is no
    # transcript-verify safety net here — tmux is the verified mode; prefer it.
    echo "[$(date -Iseconds)] /compact submitted; pasting follow-up in ${WAIT_SLEEP}s (queues until compact finishes)"
    sleep "$WAIT_SLEEP"

    # Re-stage clipboard with follow-up payload
    printf '%s' "$FOLLOWUP" | ( xclip -selection clipboard >/dev/null 2>&1 & )
    sleep "$CLIPBOARD_SETTLE"

    xdotool windowactivate --sync "$wid"
    xdotool key ctrl+shift+v
    sleep "$PASTE_SETTLE"
    xdotool key Return

    echo "[$(date -Iseconds)] follow-up sent; dispatch DONE"
  ) &
  disown 2>/dev/null || true
}

# ---------- main ----------

if [[ "$DRY_RUN" -eq 1 ]]; then
  printf "MODE=%s\nTARGET=%s\nDIRECTIVE_LEN=%d\nFOLLOWUP_LEN=%d\nLOG=%s\n--- DIRECTIVE PREVIEW (first 200 chars) ---\n%s\n--- FOLLOWUP PREVIEW (first 200 chars) ---\n%s\n" \
    "$MODE" "$TARGET" "${#DIRECTIVE}" "${#FOLLOWUP}" "$LOG_FILE" \
    "${DIRECTIVE:0:200}" "${FOLLOWUP:0:200}"
  exit 0
fi

echo "[self-compact v$SCRIPT_VERSION] mode=$MODE target=$TARGET log=$LOG_FILE" >&2

case "$MODE" in
  tmux) dispatch_tmux "$TARGET" ;;
  x11)  dispatch_x11 "$TARGET" ;;
esac

echo "[self-compact] dispatched; check $LOG_FILE for outcome" >&2
exit 0
