# OneCLI Plugin for Claude Code

Connect Claude Code to external APIs with zero credential management. The OneCLI gateway injects stored credentials into outbound requests automatically — no API keys in your environment, no OAuth flows in your terminal.

## What It Does

Once installed, every Claude Code session automatically routes all HTTPS traffic through the OneCLI gateway. When you ask Claude to "check my GitHub PRs", "read my emails", or "list Jira tickets", it makes direct HTTP calls and the gateway handles authentication transparently.

All HTTP clients — `curl`, `gh`, `gcloud`, `aws`, language libraries — honor the proxy automatically. Policy rules (block, rate limit, manual approval) are enforced at the gateway level.

**Supported services**: GitHub, Gmail, Google Calendar, Google Drive, Google Docs, Google Sheets, Jira, Confluence, AWS, Stripe, Datadog, Notion, Cloudflare, Todoist, Outlook, Microsoft Word, YouTube, and more.

## Installation

### From the Claude Code Directory

1. Open Claude Code
2. Go to **Customize → Directory → Plugins**
3. Search for **OneCLI**
4. Click **Install**

### First-Time Setup

After installation, run `/onecli-setup` in Claude Code:

1. Open **https://app.onecli.sh/projects**
2. Select your project (or create one)
3. Copy your **API Key** from the Overview page (starts with `oc_`)
4. Paste it when prompted

Start a new session — the gateway activates automatically.

If you already use the `onecli` CLI, the plugin automatically reuses your existing credentials from `~/.onecli/credentials/api-key`.

## Commands

| Command | Description |
|---------|-------------|
| `/onecli-setup` | Configure API key and verify gateway connectivity |
| `/onecli-status` | Show gateway status and connected services |

## How It Works

1. **Session start** — Plugin hook reads your API key, calls OneCLI Cloud, and injects `HTTPS_PROXY` + CA certificates into the session
2. **Transparent proxy** — All HTTPS traffic routes through `gateway.onecli.sh`, which intercepts requests and injects the right credentials (OAuth tokens, API keys, AWS SigV4 signatures)
3. **Service connection** — If a service isn't connected yet, the gateway returns a `connect_url` that Claude shows you. Click it, authorize, and Claude retries automatically
4. **Policy enforcement** — Gateway enforces your policy rules (block, rate limit, manual approval) on every request, including CLI tools like `gh`

## What's Included

```
skills/
  gateway/       Core skill — teaches Claude how to use the proxy
  providers/     Reference of all 40+ supported services

commands/
  setup.md       /onecli-setup — first-time API key configuration
  status.md      /onecli-status — gateway and connection health

agents/
  integration-architect.md — helps design multi-service API workflows

hooks/
  session-start  Auto-configures proxy on every session
```

## Requirements

- An [OneCLI](https://onecli.sh) account
- At least one connected service in the OneCLI dashboard

## License

Apache-2.0
