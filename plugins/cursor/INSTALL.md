# Install OneCLI for Cursor (local repo)

## 1. Build the plugin

From the `onecli-plugin` repo root:

```bash
npm install
npm run build
```

## 2. Add via Customize → Plugins → + Add

1. Open **Customize** (left sidebar) → **Plugins** tab → **+ Add**
2. Select this folder:

   ```
   onecli-plugin/plugins/cursor
   ```

   Cursor expects `.cursor-plugin/marketplace.json` in the folder you pick (now included).

3. Install the **onecli** plugin from the local marketplace entry.

## 3. Enable third-party extensibility

In **Cursor Settings → Features**, turn on:

**Include third-party Plugins, Skills, and other configs**

Without this, plugin hooks may not register (skills/rules can still load).

## 4. Reload and start a new Agent session

- `Cmd+Shift+P` → **Developer: Reload Window**
- Open a **new** Agent composer chat (so `sessionStart` runs)

## 5. Configure OneCLI (once)

Invoke the **onecli-setup** skill, or ensure `~/.onecli/credentials/api-key` exists.

## 6. Verify hooks are loaded

**Settings → Hooks** should list:

- `sessionStart` → `node ./hooks/session-start.mjs`
- `preToolUse` (Shell) → `node ./hooks/pre-tool-use.mjs`
- `sessionEnd` → `node ./hooks/session-end.mjs`

If plugin hooks are missing (known Cursor bug), use the project-level fallback in your workspace:

```bash
# from secrets-leak-protection repo root
./onecli-plugin/plugins/cursor/scripts/install-project-hooks.sh
```

## 7. Verify gateway routing (subagent-safe)

Ask any Agent to run **only**:

```bash
curl -s https://api.github.com/rate_limit | python3 -c "import json,sys; print(json.load(sys.stdin)['resources']['core']['limit'])"
```

**Expected when gateway is active:** `11400` (or similar high GitHub App limit)  
**Direct / unauthenticated:** `60`

Then check **OneCLI dashboard → Activity** for a new `GET api.github.com/rate_limit` row.

Or run the automated check from repo root:

```bash
python3.12 onecli-plugin/tests/verify_cursor_agent_gateway.py
```
