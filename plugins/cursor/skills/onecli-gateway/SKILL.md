---
name: onecli-gateway
description: >-
  OneCLI Gateway for Cursor: transparent HTTPS proxy instructions for outbound
  calls with OneCLI-managed credentials. Use when prompted by the OneCLI
  session hook or when the user explicitly asks to use OneCLI Gateway.
metadata:
  priority: 8
---

# OneCLI Gateway

The OneCLI gateway injects stored credentials at the HTTPS proxy boundary. You
do not see or handle credential values directly.

## Gateway Activation

The plugin writes `~/.onecli/env.sh` as a non-secret loader. Sourcing it fetches
fresh gateway exports for the current shell command; the file itself does not
store live proxy credentials.

For supported outbound shell commands, the Cursor `preToolUse` hook will
conservatively auto-source the loader. The `sessionStart` hook also returns
session-scoped `env` exports when an API key is configured. If a command is not
auto-sourced and `HTTPS_PROXY` is not already set to a OneCLI proxy, prefix it
with:

```bash
. ~/.onecli/env.sh &&
```

Example:

```bash
. ~/.onecli/env.sh && curl -s "https://api.github.com/user"
```

## Making Requests

Call the real API URL. The gateway intercepts the request and injects
credentials automatically.

```bash
. ~/.onecli/env.sh && curl -s "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5"
. ~/.onecli/env.sh && curl -s "https://api.github.com/user/repos?per_page=10"
. ~/.onecli/env.sh && curl -s "https://api.stripe.com/v1/charges?limit=5"
. ~/.onecli/env.sh && curl -s "https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10"
```

Do not set `Authorization` headers manually.

## Credential Stubs

Some tools and MCP servers need local credential files before they start. Under
OneCLI, real credentials are injected by the proxy, so local files only need to
satisfy format checks.

If a tool fails because a credential file is missing:

1. Do not follow the tool's OAuth or API-key setup flow.
2. Use the exact path named in the error.
3. Create a stub file using `onecli-managed` for secret values.
4. Set file permissions to `0600`.
5. Retry the operation through the gateway.

OAuth token stub:

```json
{
  "type": "authorized_user",
  "access_token": "onecli-managed",
  "refresh_token": "onecli-managed",
  "client_id": "onecli-managed",
  "client_secret": "onecli-managed",
  "token_uri": "https://oauth2.googleapis.com/token",
  "expiry": "2099-01-01T00:00:00+00:00"
}
```

API key stub:

```text
onecli-managed
```

JSON credential stub:

```json
{"api_key": "onecli-managed"}
```

Do not modify or delete files containing `onecli-managed` values unless the user
explicitly asks; they are placeholders for gateway-managed auth.

## Error Handling

If a request returns 401, 403, or a gateway error:

- If the JSON body contains `connect_url`, show that URL to the user and retry
  after they connect.
- If the JSON body contains `claim_url`, show that URL to the user and retry
  after they claim the project.
- If the gateway returns `multiple_connections`, ask which account to use, then
  retry with `x-onecli-connection-id`.
- If the gateway returns `blocked_by_policy`, show the policy name and reason.
  Do not retry or circumvent it.
- If the gateway returns `rate_limited`, wait for `retry_after_secs`.

## Rules

- Never say you do not have access before making the HTTP request through the
  gateway.
- Never ask the user for service API keys or OAuth tokens.
- Never follow built-in OAuth setup flows while running through the gateway.
- Prefer direct HTTP requests with curl/fetch over service-specific manual auth.
- Respect gateway policy errors.
