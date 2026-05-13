# OneCLI Plugin for Claude Code

Connect Claude Code to external APIs with zero credential management. The OneCLI gateway injects stored credentials into outbound requests automatically — no API keys in your environment, no OAuth flows in your terminal.

## What It Does

Once installed, every Claude Code session automatically routes API requests through the OneCLI gateway. When you ask Claude to "check my GitHub PRs" or "send an email", it makes direct HTTP calls and the gateway handles authentication transparently.

**Supported services**: GitHub, Gmail, Google Calendar, Google Drive, Jira, Confluence, AWS, Stripe, Datadog, Notion, Cloudflare, Todoist, and more.

## Installation

### From the Claude Code Directory

1. Open Claude Code
2. Go to **Customize → Directory → Plugins**
3. Search for **OneCLI**
4. Click **Install**

### First-Time Setup

After installation, run `/onecli-setup` in Claude Code to configure your API key.

If you already use the `onecli` CLI, the plugin automatically reuses your existing credentials.

## Commands

| Command | Description |
|---------|-------------|
| `/onecli-setup` | Configure API key and verify gateway connectivity |
| `/onecli-status` | Show connected services and gateway health |
| `/onecli-connect` | Connect a new service (GitHub, Gmail, etc.) |

## How It Works

1. **Session start** — Plugin hook calls OneCLI Cloud to get proxy configuration
2. **Proxy injection** — Sets `HTTPS_PROXY` so all HTTP requests route through the gateway
3. **Credential injection** — Gateway intercepts requests and adds the right auth headers
4. **Transparent** — Standard HTTP clients (curl, fetch, axios) work without any changes

## Requirements

- A [OneCLI](https://onecli.sh) account
- At least one connected service in the OneCLI dashboard

## License

Apache-2.0
