#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_SRC="$ROOT/plugins/cursor"
LOCAL_DIR="${HOME}/.cursor/plugins/local/onecli"

echo "Building OneCLI plugin hooks..."
(cd "$ROOT" && npm run build)

echo "Linking local Cursor plugin -> $LOCAL_DIR"
mkdir -p "${HOME}/.cursor/plugins/local"
ln -sfn "$PLUGIN_SRC" "$LOCAL_DIR"

echo ""
echo "Local plugin installed at: $LOCAL_DIR"
echo ""
echo "Next steps in Cursor:"
echo "  1. Settings -> Features -> enable 'Include third-party Plugins, Skills, and other configs'"
echo "  2. Customize -> Plugins -> + Add -> select this repo's .cursor-plugin/marketplace.json"
echo "     (or install the 'onecli' plugin from the onecli-local marketplace)"
echo "  3. Cmd+Shift+P -> Developer: Reload Window"
echo "  4. Start a NEW composer session (sessionStart hook runs once per session)"
echo "  5. Settings -> Hooks: confirm sessionStart / preToolUse / sessionEnd are listed"
echo "  6. Run verification: python3 onecli-plugin/tests/verify_cursor_agent_gateway.py"
echo ""
echo "If plugin hooks do not appear in Settings -> Hooks, project hooks in"
echo "  <workspace>/.cursor/hooks.json"
echo "are wired to the same scripts as a fallback."
