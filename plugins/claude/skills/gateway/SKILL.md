---
name: onecli-gateway
description: >-
  OneCLI Gateway: transparent HTTPS proxy that injects stored credentials
  into outbound calls. Only use this skill when prompted by the gateway
  detection hook or when the user explicitly invokes /onecli-gateway.
  Do NOT auto-load this skill based on user intent alone — the hook
  handles detection.
metadata:
  priority: 8
---

# OneCLI Gateway

Your outbound HTTPS traffic is transparently proxied through the OneCLI
gateway, which injects stored credentials at the proxy boundary. You never
see or handle credential values directly.

## How to Access External Services

You have direct HTTP access to external APIs. OAuth apps (Gmail, GitHub,
Google Calendar, Google Drive, etc.) and API key services are all available
through the gateway. Just make the request directly; the gateway injects
credentials if the app is connected. If not, it returns an error with a
connect URL you can present to the user.

## Making Requests

Call the real API URL. The gateway intercepts the request and injects
credentials automatically.

```bash
curl -s "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5"
curl -s "https://api.github.com/user/repos?per_page=10"
curl -s "https://api.stripe.com/v1/charges?limit=5"
curl -s "https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10"
```

Standard HTTP clients (curl, fetch, requests, axios, Go net/http, git) all
honor the `HTTPS_PROXY` environment variable automatically. You do not need
to set any auth headers.

## Credential Stubs for MCP Servers

Some MCP servers need local credential files to start. Stubs for connected
apps are pre-written automatically. Files containing `"onecli-managed"`
values are managed by OneCLI. Do NOT modify or delete them.

If an MCP server won't start due to missing credentials, create stubs
**before** starting it. Use `"onecli-managed"` as the placeholder for all
secret values, with file permissions `0600`.

## When a Request Fails

If you get a 401, 403, or a gateway error (e.g., `app_not_connected`):

**Step 1: Show the user a connect link.** Use the `connect_url` from the
error response:

> To connect [service], open this link:
> [connect_url from the error response]

If there is no `connect_url` in the error, tell the user to open the
OneCLI dashboard and connect the service there.

**Step 2: Retry after the user connects.** Let the user know you will
retry once they have connected. When they confirm, retry the original
request. If the retry still fails, ask if they need help with the setup.

## Multiple Connections

If the gateway returns a `multiple_connections` error (409), it means the user
has multiple accounts connected for the same service. The response includes a
`connections` array with `id` and `label` for each. Ask the user which account
to use, then retry the request with the `x-onecli-connection-id` header set
to the chosen connection ID.

## Policy Errors

If the gateway returns a `blocked_by_policy` error (403 with JSON body),
a policy rule is blocking the request. Show the user the rule name and
reason. Do not retry or circumvent the block.

If the gateway returns a `rate_limited` error (429), wait for `retry_after_secs`
before retrying.

If the gateway returns a `manual_approval_denied` error (403), the request
was denied by a human reviewer. Inform the user and do not retry.

## Rules

- **Never** say "I don't have access to X" without first making the HTTP
  request through the proxy.
- **Never** use browser extensions, gcloud, or manual auth flows. The
  gateway handles credentials for you.
- **Never** ask the user for API keys or tokens directly. Direct them to
  connect the service in the OneCLI dashboard.
- **Never** suggest the user open Gmail/Calendar/GitHub in their browser
  when they ask you to read or interact with those services. You have API
  access. Use it.
- If the gateway returns a policy error (403 with a JSON body), respect
  the block. Do not retry or circumvent it.
