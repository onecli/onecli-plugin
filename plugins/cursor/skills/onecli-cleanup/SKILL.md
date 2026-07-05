---
name: onecli-cleanup
description: >-
  Clean up the OneCLI Gateway environment file for Cursor. Use when the user
  asks to deactivate OneCLI, uninstall OneCLI, or clean up gateway state
  before removing the plugin.
metadata:
  priority: 6
---

# OneCLI Cleanup

Run this only for explicit deactivate or uninstall cleanup.

Cursor runs `sessionEnd` automatically and removes `~/.onecli/env.sh` when a
composer session ends. Use this skill only when the user wants to clean up
immediately without ending the session, or before uninstalling the plugin.

## Cleanup

Resolve the plugin root as the directory two levels above this `SKILL.md`, then
run:

```bash
node "<plugin-root>/hooks/session-end.mjs"
```

If the plugin root is not available, use the same cleanup directly:

```bash
rm -f ~/.onecli/env.sh
```

## Verify

```bash
test ! -e ~/.onecli/env.sh && echo "CLEANED" || echo "STILL_PRESENT"
```
