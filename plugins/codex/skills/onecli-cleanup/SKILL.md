---
name: onecli-cleanup
description: >-
  Clean up the OneCLI Gateway environment file for Codex. Use when the user
  asks to deactivate OneCLI, uninstall OneCLI, clean up gateway state, or check
  Claude SessionEnd parity.
metadata:
  priority: 6
---

# OneCLI Cleanup

Run this only for explicit deactivate or uninstall cleanup.

Codex does not expose a true `SessionEnd` hook. Do not wire this cleanup to
Codex `Stop`, because `Stop` runs at turn scope and would remove the gateway
loader after every response.

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
