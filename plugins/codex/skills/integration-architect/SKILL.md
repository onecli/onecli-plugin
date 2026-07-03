---
name: integration-architect
description: >-
  Design multi-service API integrations through OneCLI Gateway. Use when
  building workflows that combine GitHub, Google, AWS, Atlassian, or other
  services through the OneCLI proxy.
metadata:
  priority: 5
---

# Integration Architect

Help users design, build, and troubleshoot workflows that combine multiple
external APIs through the OneCLI transparent proxy.

## Core Principle

All API requests go through OneCLI via `HTTPS_PROXY`. The gateway injects the
right credentials for each service automatically.

For supported outbound Bash commands, the plugin's `PreToolUse` hook will
conservatively auto-source the OneCLI loader. For multi-step shell scripts or
commands the hook skips, activate the loader explicitly:

```bash
. ~/.onecli/env.sh
```

## Workflow Patterns

### Sequential

One API's output feeds the next. Example: fetch GitHub issues, then create Jira
tickets.

```bash
. ~/.onecli/env.sh

ISSUES=$(curl -s "https://api.github.com/repos/OWNER/REPO/issues?state=open&labels=bug")

echo "$ISSUES" | jq -c '.[]' | while read -r issue; do
  TITLE=$(echo "$issue" | jq -r '.title')
  curl -s -X POST "https://api.atlassian.com/ex/jira/CLOUD_ID/rest/api/3/issue" \
    -H "Content-Type: application/json" \
    -d "{\"fields\":{\"summary\":\"$TITLE\",\"project\":{\"key\":\"PROJ\"},\"issuetype\":{\"name\":\"Bug\"}}}"
done
```

### Fan-Out

One trigger calls multiple services. Example: a deployment event notifies Slack,
updates Jira, and logs to Datadog.

### Aggregation

Gather data from multiple sources, combine it, then push to one destination.

## Error Handling

Handle each service independently:

- If one service returns `app_not_connected`, show the connect URL and continue
  with other services when possible.
- If a gateway policy blocks one request, report it and do not retry that leg.
- Use `set +e` in shell workflows when one failed leg should not stop the full
  workflow.

## Rate Limits

Each service has upstream limits, and OneCLI may add policy limits. If the
gateway returns `429`, respect `retry_after_secs`.

## Multiple Connections

If the user has multiple accounts connected for a service, the gateway returns a
`multiple_connections` error with available connection IDs. Ask which account to
use, then retry with:

```bash
-H "x-onecli-connection-id: CONNECTION_ID"
```

## Recommendations

1. Get one API call working before chaining services.
2. Verify each service is connected before building the full workflow.
3. Use `jq` for JSON parsing.
4. Prefer direct REST calls over service-specific CLIs that may require local
   auth setup.
5. Design write operations to be safely re-run.
