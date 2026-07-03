# OneCLI Plugin for Claude Code

Connect Claude Code to external APIs without managing credentials. The OneCLI gateway injects stored credentials into outbound requests automatically, so you don't need API keys in your environment or OAuth flows in your terminal.

## What it does

Once installed, every Claude Code session automatically routes all HTTPS traffic through the OneCLI gateway. When you ask Claude to "check my GitHub PRs", "read my emails", or "list Jira tickets", it makes direct HTTP calls and the gateway handles authentication transparently.

All HTTP clients (`curl`, `gh`, `gcloud`, `aws`, language libraries) honor the proxy automatically. Policy rules (block, rate limit, manual approval) are enforced at the gateway level.

## Installation

### From the Claude Code Directory

1. Open Claude Code
2. Go to **Customize → Directory → Plugins**
3. Search for **OneCLI**
4. Click **Install**

### First-time setup

After installation, run `/onecli-setup` in Claude Code:

1. Open **https://app.onecli.sh/projects**
2. Select your project (or create one)
3. Copy your **API Key** from the Overview page (starts with `oc_`)
4. Paste it when prompted

Start a new session. The gateway activates automatically.

If you already use the `onecli` CLI, the plugin automatically reuses your existing credentials from `~/.onecli/credentials/api-key`.

## Commands

| Command | Description |
|---------|-------------|
| `/onecli-setup` | Configure API key and verify gateway connectivity |
| `/onecli-status` | Show gateway status and connected services |

## How it works

1. At session start, a plugin hook reads your API key, calls OneCLI Cloud, verifies the proxy is reachable, and injects `HTTPS_PROXY` and CA certificates into the session (`~/.onecli/env.sh`, sourced via `BASH_ENV`)
2. All HTTPS traffic then routes through the gateway, which intercepts requests and injects the right credentials (OAuth tokens, API keys, AWS SigV4 signatures)
3. If a service isn't connected yet, the gateway returns a `connect_url` that Claude shows you. Click it, authorize, and Claude retries automatically
4. The gateway enforces your policy rules (block, rate limit, manual approval) on every request, including CLI tools like `gh`
5. At session end, a cleanup hook removes `~/.onecli/env.sh` and the `BASH_ENV` setting

## What's included

```
skills/
  gateway/       Core skill: teaches Claude how to use the proxy
  providers/     Reference of all 40+ supported services

commands/
  setup.md       /onecli-setup, first-time API key configuration
  status.md      /onecli-status, gateway and connection health

agents/
  integration-architect.md    Helps design multi-service API workflows

hooks/
  session-start  Auto-configures proxy on every session (built from ../../src/claude)
  session-end    Cleans up on session end (built from ../../src/claude)
```

Hook scripts are built artifacts. Edit the TypeScript sources in `../../src/` and run `npm run build` from the repo root.

## Requirements

- A [OneCLI](https://onecli.sh) account
- At least one connected service in the OneCLI dashboard

## License

Apache-2.0
