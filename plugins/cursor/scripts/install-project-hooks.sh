#!/usr/bin/env bash
# Fallback: wire OneCLI hooks into the current workspace when plugin hooks don't load.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WS_ROOT="$(git -C "${1:-.}" rev-parse --show-toplevel 2>/dev/null || pwd)"

mkdir -p "$WS_ROOT/.cursor/hooks"
cat > "$WS_ROOT/.cursor/hooks.json" <<EOF
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "command": "node \"$ROOT/hooks/session-start.mjs\"",
        "timeout": 30
      }
    ],
    "preToolUse": [
      {
        "command": "node \"$ROOT/hooks/pre-tool-use.mjs\"",
        "matcher": "Shell",
        "timeout": 5
      }
    ],
    "sessionEnd": [
      {
        "command": "node \"$ROOT/hooks/session-end.mjs\"",
        "timeout": 10
      }
    ]
  }
}
EOF

echo "Wrote $WS_ROOT/.cursor/hooks.json"
echo "Reload Cursor window and start a new Agent session."
