# Hook activation across platforms

Why OneCLI uses different hook strategies on Claude Code, Codex, and Cursor — and where `preToolUse` / `PreToolUse` fits today.

## Summary

| Platform | Primary activation | `preToolUse` role |
| -------- | ------------------ | ----------------- |
| **Claude Code** | `sessionStart` + `BASH_ENV` | None — every Bash subprocess auto-sources `~/.onecli/env.sh` |
| **Codex** | `sessionStart` loader + `PreToolUse` rewrite | Required — hooks cannot persist session env |
| **Cursor** | `sessionStart` env + `preToolUse` rewrite | Fallback — session env exists but is not reliably inherited by all shells/subagents |

All platforms route HTTPS through `HTTPS_PROXY` once the gateway env is active. Credentials never live in the agent context.

---

## Why three different models?

Each agent platform exposes different hook capabilities:

**Claude Code** can write live exports to `~/.onecli/env.sh` and set `BASH_ENV` in `~/.claude/settings.json`. Every Bash invocation sources the file automatically. No per-command hook is needed.

**Codex and Cursor** run hooks as child processes. They cannot permanently mutate the parent session environment the way Claude's `BASH_ENV` wiring does. Instead:

1. `sessionStart` writes a **credential-free loader** at `~/.onecli/env.sh`.
2. Sourcing the loader runs `onecli-*-env.mjs`, which fetches fresh gateway exports from OneCLI Cloud for that command.
3. `preToolUse` / `PreToolUse` rewrites selected Shell/Bash commands to prefix:  
   `. "$HOME/.onecli/env.sh" && <original>`

**Cursor-specific:** `sessionStart` also returns session-scoped `env` (including `HTTPS_PROXY`). When Cursor propagates that env to all agent shells, gateway routing works without rewrites. In practice, parent shells and some subagent contexts still miss it — so `preToolUse` remains the reliable path (verified via `api.github.com/rate_limit`: `60` = direct, `~11400` = gateway).

Implementation: [`src/codex/pre-tool-use.mts`](../src/codex/pre-tool-use.mts) and [`src/cursor/pre-tool-use.mts`](../src/cursor/pre-tool-use.mts) share the same `shouldRewrite()` logic today (allowlist, not yet extracted to `src/shared/`).

---

## Why the conservative command allowlist?

Sourcing the loader is not free — it calls OneCLI Cloud on each rewrite. The allowlist limits rewrites to commands likely to hit the network:

- HTTP clients with URLs: `curl`, `wget`, …
- Service CLIs: `gh`, network `aws` / `git` / `terraform` / package-manager subcommands
- Interpreters when the command line contains a URL: `node`, `python`, `npx`, …

Local-only commands are skipped (`git status`, `terraform fmt`, `aws configure`, …). Tests in `tests/test_workflows.py` lock this contract.

**Gap:** Unknown network CLIs (`stripe`, `flyctl`, `kubectl`, …) are not auto-rewritten unless they match URL heuristics. Agents can still prefix manually:

```bash
. ~/.onecli/env.sh && <command>
```

Skills document this fallback (`onecli-gateway`).

---

## Deprecation path: session-only activation

**Goal:** Rely on `sessionStart` (or platform-equivalent persistent env injection) and remove `preToolUse` / `PreToolUse` rewrites.

| Milestone | Cursor | Codex |
| --------- | ------ | ----- |
| **Today** | Hybrid: session env + conservative `preToolUse` | Loader + conservative `PreToolUse` |
| **Cursor step 1** | Cursor reliably applies `sessionStart` `env` to all Shell/subagent processes | — |
| **Cursor step 2** | Drop `preToolUse`; keep loader + skills for manual edge cases | — |
| **Codex blocker** | — | No session env mutation API; needs platform change or `onecli run` wrapper |
| **End state** | Claude-like: one fetch at session start, universal proxy env | Same, if Codex adds session env or official `BASH_ENV` equivalent |

`preToolUse` is **intentionally a compatibility layer**, not the long-term design for Cursor. Remove it once session env propagation is verified across parent agents, subagents, and background shells.

Signals that step 1 is done:

- `HTTPS_PROXY` set in shell without rewrite markers (`ONECLI_CURSOR_AUTOSOURCED`)
- `python3 tests/verify_cursor_agent_gateway.py` passes in parent agent Shell (not only subagents)
- No regression in OneCLI dashboard Activity for plain `curl` / `gh` calls

---

## Future options (not implemented)

Documented for later if the allowlist becomes painful to maintain:

1. **Shared module** — Extract `shouldRewrite()` to `src/shared/pre-tool-use.mts`; thin Codex/Cursor wrappers for I/O format only.

2. **Inverse blocklist** — Rewrite all Shell commands except known-local ones (`ls`, `git status`, `npm test`, …). Broader coverage; more loader invocations on local work.

3. **Cached loader exports** — Cache gateway config for N seconds per session inside `onecli-*-env.mjs` so default-open rewrite (option 2) does not hit OneCLI Cloud on every command.

4. **Platform wrapper** — `onecli run cursor` / `onecli run codex` exports gateway env to the whole process tree (same short-circuit as today when `HTTPS_PROXY` is already a OneCLI proxy).

None of these are required for the initial Cursor plugin merge. The allowlist matches Codex behavior and is covered by tests.
