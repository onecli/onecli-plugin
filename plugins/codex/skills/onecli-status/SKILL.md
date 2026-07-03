---
name: onecli-status
description: >-
  Show OneCLI Gateway status and connected services. Use when the user asks for
  OneCLI status, gateway status, connected services, or invokes /onecli-status.
metadata:
  priority: 7
---

# OneCLI Status

Show whether the gateway is configured and which services are connected.

## Check Local Gateway Environment

`~/.onecli/env.sh` is a loader, not a static secret file. Sourcing it fetches
fresh gateway exports for the current shell.

```bash
if [ -r ~/.onecli/env.sh ]; then
  . ~/.onecli/env.sh
fi

if [ -n "$HTTPS_PROXY" ]; then
  echo "GATEWAY: active"
  echo "HTTPS_PROXY: $HTTPS_PROXY"
else
  echo "GATEWAY: not active"
fi
```

## Check API Key

```bash
API_KEY="$(
  cat ~/.onecli/credentials/api-key 2>/dev/null ||
  python3 -c 'import json,os; p=os.path.expanduser("~/.config/onecli-plugin/auth.json"); print(json.load(open(p)).get("apiKey",""))' 2>/dev/null
)"

if [ -n "$API_KEY" ]; then
  curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $API_KEY" \
    https://app.onecli.sh/api/container-config
else
  echo "NO_API_KEY"
fi
```

`200` means the API key is valid. `401` means it needs to be replaced.

## List Connected Services

```bash
API_KEY="$(
  cat ~/.onecli/credentials/api-key 2>/dev/null ||
  python3 -c 'import json,os; p=os.path.expanduser("~/.config/onecli-plugin/auth.json"); print(json.load(open(p)).get("apiKey",""))' 2>/dev/null
)"

if [ -n "$API_KEY" ]; then
  curl -s -H "Authorization: Bearer $API_KEY" https://app.onecli.sh/api/apps |
    python3 -c '
import json, sys
apps = json.load(sys.stdin)
connected = [a for a in apps if a.get("connection", {}).get("status") == "connected"]
available = [a for a in apps if a.get("available") and a.get("connection", {}).get("status") != "connected"]
if connected:
    print(f"Connected ({len(connected)}):")
    for app in connected:
        name = app.get("name", "unknown")
        print(f"  + {name}")
if available:
    print(f"Available ({len(available)}):")
    for app in available[:5]:
        name = app.get("name", "unknown")
        print(f"  - {name}")
    if len(available) > 5:
        print(f"  ... and {len(available) - 5} more")
if not connected and not available:
    print("No services found.")
'
else
  echo "No API key configured. Use the onecli-setup skill first."
fi
```

If services are not connected, direct the user to
`https://app.onecli.sh/projects`.
