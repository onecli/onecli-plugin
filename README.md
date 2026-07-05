# OneCLI Agent Plugins

Connect AI coding agents to external APIs without managing credentials. The OneCLI gateway injects stored credentials into outbound requests automatically, so you don't need API keys in your environment or OAuth flows in your terminal.

This repo ships the OneCLI gateway plugin for three agent platforms from a single shared codebase:

| Plugin | Platform | Path |
|--------|----------|------|
| **onecli** for Claude Code | [Claude Code](https://claude.com/claude-code) | [`plugins/claude/`](plugins/claude/) |
| **onecli** for Codex | [OpenAI Codex](https://developers.openai.com/codex) | [`plugins/codex/`](plugins/codex/) |
| **onecli** for Cursor | [Cursor](https://cursor.com) | [`plugins/cursor/`](plugins/cursor/) |

**Supported services**: GitHub, Gmail, Google Calendar, Google Drive, Google Docs, Google Sheets, Jira, Confluence, AWS, Datadog, Notion, Cloudflare, Todoist, Outlook, Microsoft Word, YouTube, and more.

## How it works

All HTTPS traffic from the agent routes through the OneCLI gateway (`HTTPS_PROXY`), which intercepts requests and injects the right credentials (OAuth tokens, API keys, AWS SigV4 signatures). If a service isn't connected yet, the gateway returns a `connect_url` the agent shows you. Policy rules (block, rate limit, manual approval) are enforced at the gateway on every request.

The three plugins share the same runtime but activate differently, matching what each platform's hooks can do.

On Claude Code, the `SessionStart` hook fetches the gateway config once, writes live exports to `~/.onecli/env.sh`, and wires `BASH_ENV` so every Bash command picks them up. A `SessionEnd` hook cleans up.

On Codex, hooks run as child processes and cannot mutate the session environment, and there is no `SessionEnd` event. The `SessionStart` hook therefore writes `~/.onecli/env.sh` as a **credential-free loader**; a conservative `PreToolUse` hook auto-sources it for outbound Bash commands (such as `curl`, `gh`, `git push`, `npm install`), fetching fresh gateway exports per command via `bin/onecli-codex-env.mjs`. Cleanup is an explicit skill (`onecli-cleanup`), deliberately not wired to the turn-scoped `Stop` event.

On Cursor, the `sessionStart` hook writes the same loader, fetches gateway config when an API key exists, and returns session-scoped `env` exports. A conservative `preToolUse` hook (Shell matcher) auto-sources the loader as a fallback. `sessionEnd` cleans up automatically.

## Install on Claude Code

From the Claude Code Directory: **Customize → Directory → Plugins**, search **OneCLI**, click **Install**. Or from the marketplace in this repo:

```
/plugin marketplace add onecli/onecli-plugin
/plugin install onecli@onecli
```

Then run `/onecli-setup` once and start a new session. See [`plugins/claude/README.md`](plugins/claude/README.md).

## Install on Codex

```bash
codex plugin marketplace add https://github.com/onecli/onecli-plugin.git
codex plugin add onecli@onecli
```

Start a new thread, then invoke the `onecli-setup` skill (`@onecli:onecli-setup`). See [`plugins/codex/README.md`](plugins/codex/README.md).

## Install on Cursor

```bash
ln -sf "$(pwd)/plugins/cursor" ~/.cursor/plugins/local/onecli
```

Reload Cursor, then invoke the `onecli-setup` skill. See [`plugins/cursor/README.md`](plugins/cursor/README.md).

## Repo layout

```
src/                      TypeScript sources (single source of truth)
  shared/runtime.mts      gateway config, key resolution, CA bundle, quoting, probing
  claude/                 Claude Code hooks
  codex/                  Codex hooks + env helper
  cursor/                 Cursor hooks + env helper
plugins/
  claude/                 self-contained Claude Code plugin (built hooks committed)
  codex/                  self-contained Codex plugin (built hooks committed)
  cursor/                 self-contained Cursor plugin (built hooks committed)
.claude-plugin/marketplace.json    Claude Code marketplace → ./plugins/claude
.cursor-plugin/marketplace.json    Cursor marketplace → ./plugins/cursor
.claude-plugin/plugin.json         root compatibility shim (see below)
hooks/hooks.json                   hooks for the root shim
.agents/plugins/marketplace.json   Codex marketplace → ./plugins/codex
tests/test_workflows.py   end-to-end tests for both plugins (fake gateway + API)
```

**Root compatibility shim**: the Anthropic community marketplace (`claude-community`) entry for `onecli` uses a `url` source pinned to a commit of this repo, treating the **repo root** as the plugin. The root `.claude-plugin/plugin.json` therefore remains a valid manifest that points `commands`, `agents`, `skills`, and `hooks` into `./plugins/claude/`, so root installs keep working and Anthropic's CI can continue auto-bumping the SHA pin safely. The shim's `version` must always match `plugins/claude/.claude-plugin/plugin.json` (enforced by tests). It can be removed once the community entry migrates to a `git-subdir` source pointing at `plugins/claude`.

Both platforms copy only the plugin directory into their install cache, so each `plugins/*` directory must stay self-contained: `src/shared` is bundled into every built hook by tsup. **Edit `src/`, never `plugins/*/hooks` or `plugins/*/bin` directly**, then rebuild.

## Development

```bash
npm install
npm run typecheck   # tsc over src/
npm run build       # tsup: src/ → plugins/{claude,codex,cursor}/{hooks,bin}
npm run test        # python3 tests/test_workflows.py
```

Built hook files are committed (plugins install straight from git). After changing `src/`, run `npm run build` and commit the outputs together with the sources.

## Requirements

- A [OneCLI](https://onecli.sh) account
- At least one connected service in the OneCLI dashboard

## License

Apache-2.0
