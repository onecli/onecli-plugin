# OneCLI Plugin for Cursor

Connect Cursor Agent to external APIs through the OneCLI gateway without managing service credentials locally. The gateway injects stored credentials (OAuth tokens, API keys, AWS SigV4 signatures) at the proxy boundary.

## Installation

See [INSTALL.md](./INSTALL.md) for install steps and [docs/CURSOR_SETUP.md](./docs/CURSOR_SETUP.md) for the screenshot walkthrough.

Quick symlink fallback:

```bash
ln -sf "$(pwd)/plugins/cursor" ~/.cursor/plugins/local/onecli
```

## Runtime behavior

Cursor hooks use a hybrid activation model:

- **`sessionStart`** writes `~/.onecli/env.sh` as a non-secret loader, fetches gateway config when an API key exists, and returns session-scoped `env` exports plus `additional_context`.
- **`preToolUse` (Shell)** conservatively rewrites outbound network commands to auto-source the loader when session env is not enough.
- **`sessionEnd`** removes the loader file automatically.

Manual sourcing remains available:

```bash
. ~/.onecli/env.sh && curl -s "https://api.github.com/user"
```

If the helper fails (no API key, OneCLI Cloud unreachable, proxy down), the command still runs without the gateway and the reason is printed to stderr.

## Skills

| Skill | Purpose |
| ----- | ------- |
| `onecli-setup` | Configure the OneCLI API key |
| `onecli-status` | Show gateway status and connected services |
| `onecli-gateway` | Core gateway usage rules for the agent |
| `onecli-providers` | Reference of supported services and endpoints |
| `integration-architect` | Design multi-service API workflows |
| `onecli-cleanup` | Explicit deactivation / uninstall cleanup |

## Development

Hook scripts (`hooks/*.mjs`) and the env helper (`bin/onecli-cursor-env.mjs`) are built artifacts. Edit the TypeScript sources in `../../src/cursor/` and run `npm run build` from the repo root.

```bash
npm install
npm run build
npm run test
```

## License

Apache-2.0
