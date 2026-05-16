---
description: First-time setup for OneCLI gateway plugin. Configures API key and verifies gateway connectivity.
---

# OneCLI Setup

Configure the OneCLI gateway plugin. Only needs to be done once.

## Steps

### 1. Check Existing Configuration

```bash
cat ~/.onecli/credentials/api-key 2>/dev/null || echo "NOT_FOUND"
```

If a key exists, verify it works:

```bash
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $(cat ~/.onecli/credentials/api-key)" https://app.onecli.sh/api/container-config
```

If the response is `200`, tell the user OneCLI is already configured and working. Stop here.

### 2. Get API Key

If no key exists, tell the user:

> To set up OneCLI, you need an API key from your dashboard.
>
> 1. Open **https://app.onecli.sh/projects**
> 2. Select your project (or create one)
> 3. Copy your **API Key** from the Overview page (starts with `oc_`)
> 4. Paste it here

Wait for the user to provide the key.

### 3. Store and Verify

Store the key, set the production api-host, and verify it works:

```bash
mkdir -p ~/.onecli/credentials && echo -n "USER_PROVIDED_KEY" > ~/.onecli/credentials/api-key && chmod 600 ~/.onecli/credentials/api-key && echo '{"api-host":"https://app.onecli.sh"}' > ~/.onecli/config.json && curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer USER_PROVIDED_KEY" https://app.onecli.sh/api/container-config
```

If the response is `200`, tell the user:

> OneCLI is configured! **Start a new session** to activate the gateway.
> The plugin will automatically configure the proxy on every future session.

If the response is `401`, the key is invalid. Ask the user to double-check it.
