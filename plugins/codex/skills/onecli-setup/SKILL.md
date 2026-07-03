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
  https://app.onecli.sh/api/container-config
```

If the response is `200`, tell the user OneCLI is already configured.

## Get an API Key

If no key exists, tell the user:

```text
Open https://app.onecli.sh/projects, select or create a project, copy the API
key from the Overview page, and paste it here.
```

The key should start with `oc_`.

## Store and Verify

After the user provides the key, store it without printing it back:

```bash
umask 077
mkdir -p ~/.onecli/credentials
printf '%s' "USER_PROVIDED_KEY" > ~/.onecli/credentials/api-key
printf '%s\n' '{"api-host":"https://app.onecli.sh"}' > ~/.onecli/config.json
chmod 600 ~/.onecli/credentials/api-key ~/.onecli/config.json
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer USER_PROVIDED_KEY" \
  https://app.onecli.sh/api/container-config
```

If the response is `200`, tell the user setup succeeded and they should start a
new Codex thread. The loader file does not store live proxy credentials; it
fetches gateway exports when sourced. If they need to use the gateway in the
current thread, resolve the plugin root as the directory two levels above this
`SKILL.md` and run:

```bash
node "<plugin-root>/hooks/session-start.mjs"
```

If the response is `401`, ask the user to check the key in the OneCLI dashboard.
