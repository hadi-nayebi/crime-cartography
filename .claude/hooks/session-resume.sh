#!/usr/bin/env bash
# SessionStart hook: surface the durable job memory + self-compact reminder so a
# freshly-compacted/resumed session re-grounds immediately. Fail-safe (always exit 0).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MEM="$ROOT/.claude/memory/jobs/ACTIVE.md"
echo "── Crime Cartography · session resume ──────────────────────────────"
if [ -f "$MEM" ]; then
  echo "Durable state: .claude/memory/jobs/ACTIVE.md (READ IT FIRST). Recent status:"
  # print the Status/next-actions section
  awk '/^## Status/{f=1} f{print} /^## Self-compact command/{f=0}' "$MEM" | sed 's/^/  /' | head -30
else
  echo "  (no ACTIVE.md yet)"
fi
echo "Context hygiene: at ~40% context, update ACTIVE.md then run"
echo "  bash .claude/skills/self-compact/self-compact.sh \"<DIRECTIVE>\" \"<FOLLOWUP>\"  (targets pane \$TMUX_PANE only)"
echo "Data honesty: NEVER fabricate points; every figure needs a sourced link."
echo "────────────────────────────────────────────────────────────────────"
exit 0
