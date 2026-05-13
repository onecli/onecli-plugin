---
description: Show OneCLI gateway status and connected services.
---

# OneCLI Status

Show whether the gateway is active and which services are connected.

## Steps

### 1. Check Gateway

```bash
if [ -n "$HTTPS_PROXY" ]; then echo "GATEWAY: active"; else echo "GATEWAY: not configured (run /onecli-setup)"; fi
```

### 2. List Connected Services

Resolve the API key and fetch services:

```bash
API_KEY=$(cat ~/.onecli/credentials/api-key 2>/dev/null || cat ~/.config/onecli-plugin/auth.json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('apiKey',''))" 2>/dev/null)
if [ -n "$API_KEY" ]; then
  curl -s -H "Authorization: Bearer $API_KEY" https://app.onecli.sh/api/apps | python3 -c "
import sys, json
apps = json.load(sys.stdin)
connected = [a for a in apps if a.get('connection', {}).get('status') == 'connected']
available = [a for a in apps if a.get('available') and a.get('connection', {}).get('status') != 'connected']
if connected:
    print(f'Connected ({len(connected)}):')
    for a in connected: print(f'  + {a[\"name\"]}')
if available:
    print(f'Available ({len(available)}):')
    for a in available[:5]: print(f'  - {a[\"name\"]}')
    if len(available) > 5: print(f'  ... and {len(available)-5} more')
if not connected and not available:
    print('No services found.')
" 2>/dev/null || echo "Could not fetch services"
else
  echo "No API key configured. Run /onecli-setup first."
fi
```

### 3. Present Results

Show a clean summary to the user. If services aren't connected, mention they can connect them from the OneCLI dashboard at https://app.onecli.sh/projects.
