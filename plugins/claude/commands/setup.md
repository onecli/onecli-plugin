---
description: First-time setup for OneCLI gateway plugin. Configures API key and verifies gateway connectivity.
---

# OneCLI Setup

Configure the OneCLI gateway plugin. Only needs to be done once.

## Steps

In every command below, `WS` and `AGENT` come from `~/.onecli/config.json` (empty if unset). An empty `X-Workspace-Id:` header is not sent.

### 1. Check Existing Configuration

```bash
test -s ~/.onecli/credentials/api-key && echo "FOUND" || echo "NOT_FOUND"
```

If a key exists, verify it works:

```bash
WS=$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/.onecli/config.json"))).get("workspace",""))' 2>/dev/null); AGENT=$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/.onecli/config.json"))).get("agent",""))' 2>/dev/null); curl -s -w "\n%{http_code}" -H "Authorization: Bearer $(cat ~/.onecli/credentials/api-key)" -H "X-Workspace-Id:${WS:+ $WS}" "https://api.onecli.sh/v1/container-config${AGENT:+?agent=$AGENT}" | python3 -c 'import sys;b,c=sys.stdin.read().rsplit("\n",1);print(c);c=="200" or print(b[:300])'
```

If the status is `200`, tell the user OneCLI is already configured and working. Stop here. If the error mentions `X-Workspace-Id` or `agent`, go to step 4.

### 2. Get API Key

If no key exists, tell the user:

> To set up OneCLI, you need an API key from the dashboard at **https://app.onecli.sh** (organization or personal key, starts with `oc_`). Paste it here.

Wait for the user to provide the key.

### 3. Store the Key

Store the key without printing it back:

```bash
mkdir -p ~/.onecli/credentials && printf '%s' "USER_PROVIDED_KEY" > ~/.onecli/credentials/api-key && chmod 600 ~/.onecli/credentials/api-key && echo '{"api-host":"https://api.onecli.sh"}' > ~/.onecli/config.json && chmod 600 ~/.onecli/config.json
```

### 4. Pick Workspace and Agent

An organization key (`oc_org_...`) needs a workspace. A workspace without a default agent needs an agent. List both:

```bash
K=$(cat ~/.onecli/credentials/api-key); curl -s -H "Authorization: Bearer $K" https://api.onecli.sh/v1/workspaces | python3 -c 'import sys,json;[print("workspace",w["id"],w["name"]) for w in json.load(sys.stdin)]'
```

```bash
K=$(cat ~/.onecli/credentials/api-key); curl -s -H "Authorization: Bearer $K" -H "X-Workspace-Id: WORKSPACE_ID" https://api.onecli.sh/v1/agents | python3 -c 'import sys,json;[print("agent",a["identifier"],a["name"]) for a in json.load(sys.stdin)]'
```

If there is more than one of either, ask the user which to use. Save the choice (omit `workspace` for a personal key):

```bash
printf '{"api-host":"https://api.onecli.sh","workspace":"%s","agent":"%s"}\n' "WORKSPACE_ID" "AGENT_IDENTIFIER" > ~/.onecli/config.json && chmod 600 ~/.onecli/config.json
```

Then re-run the check in step 1. If the status is `200`, tell the user:

> OneCLI is configured! **Start a new session** to activate the gateway.
> The plugin will automatically configure the proxy on every future session.

If the status is `401` and the error does not mention `X-Workspace-Id`, the key is invalid. Ask the user to double-check it.
