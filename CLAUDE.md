# OneCLI Plugin

Claude Code plugin for the OneCLI gateway — transparent HTTPS proxy that injects stored credentials into outbound API calls.

## Development

```bash
npm install        # Install dependencies
npm run build      # Compile hooks (TypeScript → ESM)
npm run typecheck  # Type-check hooks
```

## Structure

```
.claude-plugin/     Plugin manifest and marketplace listing
skills/             Skill definitions (SKILL.md files)
  gateway/          Core gateway skill — how to route API calls
  providers/        Supported providers reference
commands/           Slash commands (markdown)
  setup.md          /onecli-setup — first-time auth config
  status.md         /onecli-status — gateway and connection health
agents/             Sub-agent definitions
  integration-architect.md
hooks/              Session lifecycle hooks
  hooks.json        Hook registration
  src/              TypeScript source
  *.mjs             Compiled hooks (committed)
```

## How It Works

The session-start hook runs on every Claude Code session:
1. Checks if HTTPS_PROXY is already set (skips if `onecli run` is active)
2. Resolves API key (env var → CLI credentials file → macOS keychain → plugin config)
3. Calls OneCLI Cloud `/api/container-config` to get proxy config
4. Writes CA certificate bundle to `~/.onecli/ca-bundle.pem`
5. Injects `export HTTPS_PROXY` and CA trust env vars via `CLAUDE_ENV_FILE`
6. If no API key found, injects context telling Claude to guide user to `/onecli-setup`

## Local Testing

```bash
claude --plugin-dir /path/to/onecli-plugin
```

To test the setup flow (disconnect → reconnect):
```bash
rm ~/.onecli/credentials/api-key ~/.config/onecli-plugin/auth.json 2>/dev/null
claude --plugin-dir /path/to/onecli-plugin
# Run /onecli-setup, paste API key, start new session
```
