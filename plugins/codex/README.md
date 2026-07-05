# OneCLI Plugin for Codex

Connect OpenAI Codex to external APIs through the OneCLI gateway without managing service credentials locally. The gateway injects stored credentials (OAuth tokens, API keys, AWS SigV4 signatures) at the proxy boundary.

## Installation

Add this repo as a Codex plugin marketplace, then install:

```bash
codex plugin marketplace add https://github.com/onecli/onecli-plugin.git
codex plugin add onecli@onecli
```

Restart Codex (or start a new thread), review and trust the plugin hook definitions when prompted, then run the setup skill:

```
@onecli:onecli-setup
```

### Updating

Codex has no plugin auto-update. To get a new version, refresh the marketplace snapshot and reinstall:

```bash
codex plugin marketplace upgrade
codex plugin add onecli@onecli
```

Codex caches installed plugins by the `version` in `.codex-plugin/plugin.json`, so every release must bump it (the test suite keeps it in lockstep with the Claude plugin's version).

## Runtime behavior

Codex hooks run as child processes, so they cannot mutate the Codex session environment the way the Claude Code plugin does. This plugin therefore uses a deferred design:

- The `SessionStart` hook writes `~/.onecli/env.sh` as a **non-secret loader**. It records the Codex `session_id` and the plugin helper path, but contains no live proxy credential.
- Sourcing the loader runs `bin/onecli-codex-env.mjs`, which resolves the OneCLI API key, fetches the gateway config from OneCLI Cloud, verifies the proxy is reachable, refreshes the CA bundle, and emits shell exports for the current command only.
- A conservative `PreToolUse` hook auto-sources the loader for supported outbound Bash commands (`curl`, `wget`, `gh`, `aws`, network `git`/`npm`/`pip`/`terraform` subcommands, and interpreter invocations that reference URLs). When Codex was launched through `onecli run`, the wrapper already exported the gateway env to the whole process tree, so the hook stays out of the way. Manual sourcing remains available:

```bash
. ~/.onecli/env.sh && curl -s "https://api.github.com/user"
```

See [`docs/hook-activation.md`](../../docs/hook-activation.md) for why this allowlist exists, how it compares to Claude's `BASH_ENV` model, and future options.

If the helper fails (no API key, OneCLI Cloud unreachable, proxy down), the command still runs without the gateway, and the reason is printed to stderr.

Codex documents `SessionStart`, `PreToolUse`, `SubagentStart`/`SubagentStop`, and turn-scoped `Stop`, but no true `SessionEnd`. Cleanup is therefore not automatic: use the `onecli-cleanup` skill (or `hooks/session-end.mjs`) for explicit deactivation or uninstall. Wiring it to `Stop` would remove the gateway loader after every turn.

## Skills

| Skill | Purpose |
|-------|---------|
| `onecli-setup` | Configure the OneCLI API key |
| `onecli-status` | Show gateway status and connected services |
| `onecli-gateway` | Core gateway usage rules for the agent |
| `onecli-providers` | Reference of supported services and endpoints |
| `integration-architect` | Design multi-service API workflows |
| `onecli-cleanup` | Explicit deactivation / uninstall cleanup |

## Development

Hook scripts (`hooks/*.mjs`) and the env helper (`bin/onecli-codex-env.mjs`) are built artifacts. Edit the TypeScript sources in `../../src/` and run `npm run build` from the repo root. Tests: `npm run test` (covers manifest wiring, the loader flow against a fake gateway, and the PreToolUse rewrite rules).

## License

Apache-2.0
