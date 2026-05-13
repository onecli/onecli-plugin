# OneCLI Plugin

Claude Code plugin for the OneCLI gateway — transparent HTTPS proxy that injects stored credentials into outbound API calls.

## Development

```bash
npm install        # Install dependencies
npm run build      # Compile hooks (TypeScript → ESM)
npm run typecheck   # Type-check hooks
```

## Structure

```
.claude-plugin/     Plugin manifest and marketplace listing
skills/             Skill definitions (SKILL.md files)
  gateway/          Core gateway skill — how to route API calls
  providers/        Supported providers reference
commands/           Slash commands (markdown)
  setup.md          /onecli-setup — first-time auth config
  status.md         /onecli-status — connection health
  connect.md        /onecli-connect — add a service
agents/             Sub-agent definitions
  integration-architect.md
hooks/              Session lifecycle hooks
  hooks.json        Hook registration
  src/              TypeScript source
  *.mjs             Compiled hooks (committed)
```

## How It Works

The session-start hook runs on every Claude Code session:
1. Resolves API key (env var → CLI credentials file → macOS keychain → plugin config)
2. Calls OneCLI Cloud `/api/container-config` to get proxy config
3. Writes CA certificate bundle to `~/.onecli/ca-bundle.pem`
4. Injects `HTTPS_PROXY` and CA trust env vars via `CLAUDE_ENV_FILE`
5. Gateway skill teaches Claude to make HTTP requests through the proxy

## Local Testing

Install the plugin locally by adding to Claude Code settings:
```json
{
  "plugins": {
    "onecli": {
      "path": "/path/to/onecli-plugin"
    }
  }
}
```

Restart Claude Code. The session-start hook should fire and configure the gateway.
