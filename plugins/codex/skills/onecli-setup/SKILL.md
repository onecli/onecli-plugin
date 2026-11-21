---
name: onecli-setup
description: >-
  Configure the OneCLI Gateway API key for Codex. Use when the user asks to set
  up OneCLI, configure OneCLI, or invokes /onecli-setup.
metadata:
  priority: 7
---

# OneCLI Setup

Configure OneCLI once, then start a new Codex thread so the session-start hook
can write `~/.onecli/env.sh` as a non-secret loader.

## Check Existing Configuration

```bash
test -s ~/.onecli/credentials/api-key && echo "FOUND" || echo "NOT_FOUND"
```

If a key exists, verify it:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $(cat ~/.onecli/credentials/api-key)" \
  https://api.onecli.sh/v1/container-config
```

If the response is `200`, tell the user OneCLI is already configured.

## Get an API Key

If no key exists, tell the user:

```text
Open https://app.onecli.sh, copy an organization or personal API key, and
paste it here.
```

The key should start with `oc_`.

## Store and Verify

After the user provides the key, store it without printing it back:

```bash
umask 077
mkdir -p ~/.onecli/credentials
printf '%s' "USER_PROVIDED_KEY" > ~/.onecli/credentials/api-key
printf '%s\n' '{"api-host":"https://api.onecli.sh"}' > ~/.onecli/config.json
chmod 600 ~/.onecli/credentials/api-key ~/.onecli/config.json
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer USER_PROVIDED_KEY" \
  https://api.onecli.sh/v1/container-config
```

If the response is `200`, tell the user setup succeeded and they should start a
new Codex thread. The loader file does not store live proxy credentials; it
fetches gateway exports when sourced. If they need to use the gateway in the
current thread, resolve the plugin root as the directory two levels above this
`SKILL.md` and run:

```bash
node "<plugin-root>/hooks/session-start.mjs"
```

If the response is `401` with `X-Workspace-Id ... is required`, or `404` with
`AGENT_REQUIRED`, the key is an organization key or the workspace has no default
agent. List the choices, ask the user if there is more than one, and save them:

```bash
K=$(cat ~/.onecli/credentials/api-key)
curl -s -H "Authorization: Bearer $K" https://api.onecli.sh/v1/workspaces
curl -s -H "Authorization: Bearer $K" -H "X-Workspace-Id: WORKSPACE_ID" https://api.onecli.sh/v1/agents
printf '{"api-host":"https://api.onecli.sh","workspace":"%s","agent":"%s"}\n' \
  "WORKSPACE_ID" "AGENT_IDENTIFIER" > ~/.onecli/config.json
```

Omit `workspace` for a personal key. Any other `401` means the key is invalid;
ask the user to check it in the OneCLI dashboard.
