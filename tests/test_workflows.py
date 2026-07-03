#!/usr/bin/env python3
"""Workflow tests for both OneCLI plugins (Claude Code and Codex).

Runs the built hook scripts against a fake OneCLI Cloud API and proxy on
localhost, and asserts on manifests, skills, and hook wiring.
"""
import contextlib
import json
import os
import shutil
import socketserver
import stat
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
CLAUDE = REPO / "plugins" / "claude"
CODEX = REPO / "plugins" / "codex"
API_KEY = "oc_test_workflows"


class ProbeServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, server_address, handler_class):
        super().__init__(server_address, handler_class)
        self.probes = 0


class ProbeHandler(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        self.server.probes += 1


class ConfigServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, server_address, handler_class):
        super().__init__(server_address, handler_class)
        self.expected_key = API_KEY
        self.proxy_url = ""
        self.extra_env = {}
        self.ca_certificate = "-----BEGIN CERTIFICATE-----\nMIIBoneclitest\n-----END CERTIFICATE-----"
        self.requests = []


class ConfigHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:
        return

    def do_GET(self) -> None:
        self.server.requests.append(
            {
                "path": self.path,
                "authorization": self.headers.get("Authorization"),
                "session_id": self.headers.get("X-OneCLI-Codex-Session-Id"),
            }
        )
        if self.path != "/api/container-config":
            self.send_error(404)
            return
        if self.headers.get("Authorization") != f"Bearer {self.server.expected_key}":
            self.send_error(401)
            return

        env = {
            "HTTPS_PROXY": self.server.proxy_url,
            "HTTP_PROXY": self.server.proxy_url,
        }
        env.update(self.server.extra_env)
        body = json.dumps({"env": env, "caCertificate": self.server.ca_certificate}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@contextlib.contextmanager
def fake_onecli_services():
    proxy = ProbeServer(("127.0.0.1", 0), ProbeHandler)
    proxy_thread = threading.Thread(target=proxy.serve_forever, daemon=True)
    proxy_thread.start()

    api = ConfigServer(("127.0.0.1", 0), ConfigHandler)
    api.proxy_url = f"http://127.0.0.1:{proxy.server_address[1]}"
    api_thread = threading.Thread(target=api.serve_forever, daemon=True)
    api_thread.start()

    try:
        yield {
            "api_url": f"http://127.0.0.1:{api.server_address[1]}",
            "proxy_url": api.proxy_url,
            "api": api,
            "proxy": proxy,
        }
    finally:
        api.shutdown()
        proxy.shutdown()
        api.server_close()
        proxy.server_close()


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text())


def read(path: str) -> str:
    return (REPO / path).read_text()


def squashed(text: str) -> str:
    return " ".join(text.split())


def assert_contains(path: str, snippets: list[str], *, normalize: bool = False) -> None:
    text = read(path)
    haystack = squashed(text) if normalize else text
    missing = []
    for snippet in snippets:
        needle = squashed(snippet) if normalize else snippet
        if needle not in haystack:
            missing.append(snippet)
    check(not missing, f"{path} missing expected snippets: {missing}")


def node_bin() -> str:
    node = shutil.which("node")
    check(node is not None, "node is required for OneCLI plugin workflow tests")
    return node


def clean_env(home: Path, api_url: str) -> dict[str, str]:
    env = os.environ.copy()
    for key in (
        "ALL_PROXY",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "NO_PROXY",
        "all_proxy",
        "http_proxy",
        "https_proxy",
        "no_proxy",
        "CLAUDE_ENV_FILE",
        "ONECLI_API_KEY",
        "ONECLI_CODEX_PLUGIN_ROOT",
        "ONECLI_CODEX_SESSION_ID",
        "PLUGIN_ROOT",
    ):
        env.pop(key, None)
    env["HOME"] = str(home)
    env["ONECLI_API_HOST"] = api_url
    return env


def write_api_key(home: Path) -> None:
    path = home / ".onecli" / "credentials" / "api-key"
    path.parent.mkdir(parents=True)
    path.write_text(f"{API_KEY}\n")


def run_checked(
    cmd,
    *,
    env: dict[str, str],
    cwd: Path,
    shell: bool = False,
    input_text: str | None = None,
) -> subprocess.CompletedProcess:
    result = subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        shell=shell,
        executable="/bin/sh" if shell else None,
        input=input_text,
        text=True,
        capture_output=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise AssertionError(
            f"command failed: {cmd}\nstdout={result.stdout}\nstderr={result.stderr}"
        )
    return result


def event_commands(hooks: dict, event: str) -> list[str]:
    commands = []
    for entry in hooks["hooks"].get(event, []):
        for hook in entry["hooks"]:
            if hook.get("type") == "command":
                commands.append(hook["command"])
    return commands


def assert_manifests_and_hooks() -> str:
    claude_manifest = load_json(CLAUDE / ".claude-plugin" / "plugin.json")
    codex_manifest = load_json(CODEX / ".codex-plugin" / "plugin.json")

    check(claude_manifest["name"] == "onecli", "claude plugin name drifted")
    check(codex_manifest["name"] == "onecli", "codex plugin name drifted")
    check(
        claude_manifest["version"] == codex_manifest["version"],
        "claude and codex plugin versions drifted apart",
    )

    # Root compatibility shim: keeps the repo root installable as the "onecli"
    # plugin for existing url-source installs (e.g. the claude-community
    # marketplace entry pinned at the repo root) while the real plugin lives
    # in plugins/claude/.
    shim = load_json(REPO / ".claude-plugin" / "plugin.json")
    check(shim["name"] == "onecli", "root shim plugin name drifted")
    check(
        shim["version"] == claude_manifest["version"],
        "root shim version must match plugins/claude version",
    )
    for rel in shim["commands"] + shim["agents"]:
        check((REPO / rel).exists(), f"root shim references missing file: {rel}")
    check((REPO / shim["skills"]).is_dir(), "root shim skills path missing")
    check(shim["hooks"] == "./hooks/hooks.json", "root shim hooks path drifted")

    shim_hooks = load_json(REPO / "hooks" / "hooks.json")
    for event in ("SessionStart", "SessionEnd"):
        for command in event_commands(shim_hooks, event):
            check(
                "${CLAUDE_PLUGIN_ROOT}/plugins/claude/hooks/" in command,
                f"root shim {event} must run the built hooks in plugins/claude",
            )
            script = command.split("${CLAUDE_PLUGIN_ROOT}/")[1].rstrip('"')
            check((REPO / script).exists(), f"root shim {event} references missing script: {script}")
    check(codex_manifest.get("skills") == "./skills/", "codex skills path drifted")
    # Codex's validate_plugin.py rejects a `hooks` manifest field; hooks load
    # from the default hooks/hooks.json location instead.
    check("hooks" not in codex_manifest, "codex manifest must not declare hooks (validator rejects it)")
    for rel in claude_manifest.get("commands", []) + claude_manifest.get("agents", []):
        check((CLAUDE / rel).exists(), f"claude manifest references missing file: {rel}")

    marketplace = load_json(REPO / ".claude-plugin" / "marketplace.json")
    check(
        marketplace["plugins"][0]["source"] == "./plugins/claude",
        "claude marketplace must point at ./plugins/claude",
    )
    agents_marketplace = load_json(REPO / ".agents" / "plugins" / "marketplace.json")
    check(
        agents_marketplace["plugins"][0]["source"]["path"] == "./plugins/codex",
        "codex marketplace must point at ./plugins/codex",
    )

    claude_hooks = load_json(CLAUDE / "hooks" / "hooks.json")
    check(
        event_commands(claude_hooks, "SessionStart")
        == ['node "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs"'],
        "claude SessionStart command must use CLAUDE_PLUGIN_ROOT",
    )
    check(
        event_commands(claude_hooks, "SessionEnd")
        == ['node "${CLAUDE_PLUGIN_ROOT}/hooks/session-end.mjs"'],
        "claude SessionEnd command must use CLAUDE_PLUGIN_ROOT",
    )

    codex_hooks = load_json(CODEX / "hooks" / "hooks.json")
    events = set(codex_hooks["hooks"])
    check("SessionStart" in events, "codex SessionStart hook is missing")
    check("PreToolUse" in events, "codex PreToolUse hook is missing")
    check("SessionEnd" not in events, "Codex has no SessionEnd hook event")
    check("Stop" not in events, "OneCLI cleanup must not run on Codex Stop")
    check("plugins/cache" not in json.dumps(codex_hooks), "hooks must not search plugin cache")
    check(not (CODEX / "hooks.json").exists(), "root hooks.json is redundant with hooks/hooks.json")
    check(not (CODEX / "commands").exists(), "commands directory is not ingested by Codex plugins")

    commands = event_commands(codex_hooks, "SessionStart")
    check(len(commands) == 1, f"expected one codex SessionStart command, got {len(commands)}")
    command = commands[0]
    check(
        command == 'node "$PLUGIN_ROOT/hooks/session-start.mjs"',
        "codex SessionStart command must use PLUGIN_ROOT",
    )
    check(
        event_commands(codex_hooks, "PreToolUse")
        == ['node "$PLUGIN_ROOT/hooks/pre-tool-use.mjs"'],
        "codex PreToolUse command must use PLUGIN_ROOT",
    )
    check(
        codex_hooks["hooks"]["PreToolUse"][0].get("matcher") == "Bash",
        "codex PreToolUse must match Bash",
    )
    check((CODEX / "hooks" / "session-end.mjs").exists(), "codex cleanup script is missing")
    check((CODEX / "bin" / "onecli-codex-env.mjs").exists(), "codex env helper is missing")
    return command


def assert_skill_inventory() -> None:
    expected = {
        CLAUDE: {"gateway": "onecli-gateway", "providers": "onecli-providers"},
        CODEX: {
            "integration-architect": "integration-architect",
            "onecli-cleanup": "onecli-cleanup",
            "onecli-gateway": "onecli-gateway",
            "onecli-providers": "onecli-providers",
            "onecli-setup": "onecli-setup",
            "onecli-status": "onecli-status",
        },
    }
    for plugin, skills in expected.items():
        for directory, name in skills.items():
            path = plugin / "skills" / directory / "SKILL.md"
            check(path.exists(), f"missing skill: {plugin.name}/{directory}")
            text = path.read_text()
            check(text.startswith("---\n"), f"{directory} missing frontmatter")
            check(f"name: {name}" in text, f"{directory} skill name drifted")


def assert_workflow_docs() -> None:
    assert_contains(
        "plugins/codex/skills/onecli-setup/SKILL.md",
        [
            "test -s ~/.onecli/credentials/api-key",
            "Authorization: Bearer $(cat ~/.onecli/credentials/api-key)",
            "Open https://app.onecli.sh/projects",
            "After the user provides the key, store it without printing it back",
            "umask 077",
            "chmod 600 ~/.onecli/credentials/api-key ~/.onecli/config.json",
            "non-secret loader",
            'node "<plugin-root>/hooks/session-start.mjs"',
            "If the response is `401`",
        ],
    )
    assert_contains(
        "plugins/codex/skills/onecli-status/SKILL.md",
        [
            "`~/.onecli/env.sh` is a loader, not a static secret file.",
            ". ~/.onecli/env.sh",
            "GATEWAY: active",
            "NO_API_KEY",
            "/api/container-config",
            "/api/apps",
            "Connected (",
            "Available (",
            "https://app.onecli.sh/projects",
        ],
    )
    assert_contains(
        "plugins/codex/skills/onecli-cleanup/SKILL.md",
        [
            "explicit deactivate or uninstall cleanup",
            "Codex does not expose a true `SessionEnd` hook.",
            "Do not wire this cleanup to Codex `Stop`",
            'node "<plugin-root>/hooks/session-end.mjs"',
            "rm -f ~/.onecli/env.sh",
            "CLEANED",
        ],
        normalize=True,
    )
    assert_contains(
        "plugins/codex/skills/onecli-gateway/SKILL.md",
        [
            "non-secret loader",
            "PreToolUse",
            "HTTPS_PROXY",
            "Call the real API URL.",
            "Do not set `Authorization` headers manually.",
            "onecli-managed",
            "Set file permissions to `0600`.",
            "connect_url",
            "claim_url",
            "multiple_connections",
            "x-onecli-connection-id",
            "blocked_by_policy",
            "rate_limited",
            "retry_after_secs",
            "Never ask the user for service API keys or OAuth tokens.",
            "Respect gateway policy errors.",
        ],
    )
    assert_contains(
        "plugins/codex/skills/integration-architect/SKILL.md",
        [
            "PreToolUse",
            "### Sequential",
            "### Fan-Out",
            "### Aggregation",
            "set +e",
            "retry_after_secs",
            "x-onecli-connection-id",
            "Get one API call working before chaining services.",
            "Design write operations to be safely re-run.",
        ],
    )
    assert_contains(
        "plugins/codex/skills/onecli-providers/SKILL.md",
        [
            "gmail.googleapis.com",
            "api.github.com",
            "api.atlassian.com/ex/jira/*",
            "*.amazonaws.com",
            "api.todoist.com",
            "Cloud-Only Services",
            "Custom Services",
        ],
    )


def assert_node_syntax(node: str) -> None:
    scripts = [
        CLAUDE / "hooks" / "session-start.mjs",
        CLAUDE / "hooks" / "session-end.mjs",
        CODEX / "hooks" / "session-start.mjs",
        CODEX / "hooks" / "session-end.mjs",
        CODEX / "hooks" / "pre-tool-use.mjs",
        CODEX / "bin" / "onecli-codex-env.mjs",
    ]
    for script in scripts:
        run_checked([node, "--check", str(script)], env=os.environ.copy(), cwd=REPO)


def assert_loader_file(home: Path) -> None:
    env_file = home / ".onecli" / "env.sh"
    check(env_file.exists(), "session-start did not write ~/.onecli/env.sh")
    mode = stat.S_IMODE(env_file.stat().st_mode)
    check(mode == 0o600, f"env.sh mode should be 0600, got {oct(mode)}")
    content = env_file.read_text()
    check("onecli-codex-env.mjs" in content, "env.sh must invoke the loader helper")
    check("ONECLI_CODEX_SESSION_ID='sess_test'" in content, "env.sh must persist Codex session id")
    check("HTTPS_PROXY" not in content, "env.sh must not contain live proxy exports")
    check("HTTP_PROXY" not in content, "env.sh must not contain live proxy exports")
    check(API_KEY not in content, "env.sh must not contain the API key")


def assert_ca_bundle_permissions(home: Path) -> None:
    ca_bundle = home / ".onecli" / "ca-bundle.pem"
    check(ca_bundle.exists(), "helper did not write CA bundle")
    mode = stat.S_IMODE(ca_bundle.stat().st_mode)
    check(mode == 0o600, f"ca-bundle.pem mode should be 0600, got {oct(mode)}")
    check("MIIBoneclitest" in ca_bundle.read_text(), "CA bundle did not include gateway cert")


def assert_codex_setup_status_cleanup(node: str) -> None:
    with tempfile.TemporaryDirectory() as tmp, fake_onecli_services() as services:
        home = Path(tmp) / "home"
        home.mkdir()
        write_api_key(home)
        env = clean_env(home, services["api_url"])
        hook_input = json.dumps({"hook_event_name": "SessionStart", "session_id": "sess_test"})

        stale_env = home / ".onecli" / "env.sh"
        stale_env.parent.mkdir(parents=True, exist_ok=True)
        stale_env.write_text("export HTTPS_PROXY='http://old-token@example.invalid'\n")
        stale_env.chmod(0o644)

        run_checked(
            [node, str(CODEX / "hooks" / "session-start.mjs")],
            env=env,
            cwd=CODEX,
            input_text=hook_input,
        )
        assert_loader_file(home)
        check(not services["api"].requests, "session-start should not fetch live gateway config")

        status_check = (
            ". ~/.onecli/env.sh && "
            'test "$ONECLI_CODEX_SESSION_ID" = sess_test && '
            f'test "$HTTPS_PROXY" = {services["proxy_url"]} && '
            'test -n "$HTTPS_PROXY" && '
            'test "$GIT_TERMINAL_PROMPT" = 0 && '
            'test "$NODE_USE_ENV_PROXY" = 1'
        )
        run_checked(status_check, env=env, cwd=CODEX, shell=True)
        check(services["api"].requests, "helper did not fetch fake OneCLI API config")
        check(
            services["api"].requests[-1]["session_id"] == "sess_test",
            "helper did not forward Codex session id",
        )
        assert_ca_bundle_permissions(home)

        # Re-running against existing loose files must restore private modes.
        stale_env.chmod(0o644)
        (home / ".onecli" / "ca-bundle.pem").chmod(0o644)
        run_checked(
            [node, str(CODEX / "hooks" / "session-start.mjs")],
            env=env,
            cwd=CODEX,
            input_text=hook_input,
        )
        run_checked(". ~/.onecli/env.sh >/dev/null", env=env, cwd=CODEX, shell=True)
        assert_loader_file(home)
        assert_ca_bundle_permissions(home)

        run_checked([node, str(CODEX / "hooks" / "session-end.mjs")], env=env, cwd=CODEX)
        check(not (home / ".onecli" / "env.sh").exists(), "session-end did not clean env.sh")


def assert_codex_loader_failure_is_visible(node: str) -> None:
    with tempfile.TemporaryDirectory() as tmp, fake_onecli_services() as services:
        home = Path(tmp) / "home"
        home.mkdir()
        write_api_key(home)
        env = clean_env(home, services["api_url"])

        run_checked(
            [node, str(CODEX / "hooks" / "session-start.mjs")],
            env=env,
            cwd=CODEX,
            input_text=json.dumps({"hook_event_name": "SessionStart", "session_id": "sess_test"}),
        )

        # Point the helper at a dead API host: the sourced command must still
        # run (without the gateway) and the failure must be visible on stderr.
        env["ONECLI_API_HOST"] = "http://127.0.0.1:9"
        result = run_checked(
            '. ~/.onecli/env.sh && test -z "$HTTPS_PROXY" && echo ran_without_gateway',
            env=env,
            cwd=CODEX,
            shell=True,
        )
        check("ran_without_gateway" in result.stdout, "command must run even when the helper fails")
        check("onecli:" in result.stderr, "helper failure must be reported on stderr")


def assert_codex_plugin_root_hook_command(node: str, command: str) -> None:
    with tempfile.TemporaryDirectory() as home_tmp, fake_onecli_services() as services:
        home = Path(home_tmp)
        write_api_key(home)

        env = clean_env(home, services["api_url"])
        env["PLUGIN_ROOT"] = str(CODEX)
        run_checked(
            command,
            env=env,
            cwd=CODEX.parent,
            shell=True,
            input_text=json.dumps({"hook_event_name": "SessionStart", "session_id": "sess_test"}),
        )
        assert_loader_file(home)


def run_pre_tool(node: str, home: Path, command: str) -> str:
    env = os.environ.copy()
    env["HOME"] = str(home)
    payload = {
        "hook_event_name": "PreToolUse",
        "tool_name": "Bash",
        "tool_input": {"command": command},
    }
    result = run_checked(
        [node, str(CODEX / "hooks" / "pre-tool-use.mjs")],
        env=env,
        cwd=CODEX,
        input_text=json.dumps(payload),
    )
    return result.stdout


def assert_pre_tool_use(node: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp)

        missing = run_pre_tool(node, home, "curl -s https://api.github.com/user")
        check(missing == "", "PreToolUse should skip when env.sh is missing")

        env_file = home / ".onecli" / "env.sh"
        env_file.parent.mkdir(parents=True)
        env_file.write_text("# loader\n")

        rewritten = run_pre_tool(node, home, "curl -s https://api.github.com/user")
        parsed = json.loads(rewritten)
        updated = parsed["hookSpecificOutput"]["updatedInput"]["command"]
        check(
            parsed["hookSpecificOutput"]["permissionDecision"] == "allow",
            "PreToolUse must allow rewritten commands",
        )
        check(
            updated.startswith('ONECLI_CODEX_AUTOSOURCED=1; . "$HOME/.onecli/env.sh" && curl'),
            "curl command was not auto-sourced",
        )

        already = run_pre_tool(node, home, '. "$HOME/.onecli/env.sh" && curl -s https://api.github.com/user')
        check(already == "", "PreToolUse should skip already-sourced commands")

        local = run_pre_tool(node, home, "git status --short")
        check(local == "", "PreToolUse should skip local git commands")

        git_network = run_pre_tool(node, home, "git pull")
        check("updatedInput" in git_network, "PreToolUse should rewrite network git commands")

        node_local = run_pre_tool(node, home, "node scripts/build.js")
        check(node_local == "", "PreToolUse should skip local node commands")


def assert_claude_session_flow(node: str) -> None:
    with tempfile.TemporaryDirectory() as tmp, fake_onecli_services() as services:
        home = Path(tmp) / "home"
        home.mkdir()
        write_api_key(home)
        env = clean_env(home, services["api_url"])

        claude_env_file = Path(tmp) / "claude-env-file"
        claude_env_file.touch()
        env["CLAUDE_ENV_FILE"] = str(claude_env_file)

        tricky_value = "has space'and$chars"
        services["api"].extra_env = {"ONECLI_TEST_VALUE": tricky_value}

        result = run_checked(
            [node, str(CLAUDE / "hooks" / "session-start.mjs")],
            env=env,
            cwd=CLAUDE,
        )
        payload = json.loads(result.stdout)
        check(
            "gateway connected" in payload.get("systemMessage", ""),
            "claude session-start must surface a user-visible systemMessage",
        )
        hook_output = payload["hookSpecificOutput"]
        check(hook_output["hookEventName"] == "SessionStart", "wrong hookEventName")
        check(
            "OneCLI Gateway Active" in hook_output["additionalContext"],
            "claude session-start did not inject gateway context",
        )
        check(services["api"].requests, "claude session-start did not fetch gateway config")

        env_file = home / ".onecli" / "env.sh"
        check(env_file.exists(), "claude session-start did not write env.sh")
        mode = stat.S_IMODE(env_file.stat().st_mode)
        check(mode == 0o600, f"claude env.sh mode should be 0600, got {oct(mode)}")
        content = env_file.read_text()
        check("export HTTPS_PROXY='" in content, "claude env.sh must contain quoted proxy export")
        check(claude_env_file.read_text() == content, "CLAUDE_ENV_FILE must receive the same exports")
        assert_ca_bundle_permissions(home)

        settings = load_json(home / ".claude" / "settings.json")
        check(
            settings.get("env", {}).get("BASH_ENV") == str(env_file),
            "claude session-start must persist BASH_ENV in ~/.claude/settings.json",
        )

        # Values must round-trip through shell sourcing exactly (quoting).
        out_path = Path(tmp) / "roundtrip.txt"
        run_checked(
            f'. "$HOME/.onecli/env.sh" && printf %s "$ONECLI_TEST_VALUE" > {out_path}',
            env=env,
            cwd=CLAUDE,
            shell=True,
        )
        check(
            out_path.read_text() == tricky_value,
            f"env value did not round-trip: {out_path.read_text()!r}",
        )

        run_checked([node, str(CLAUDE / "hooks" / "session-end.mjs")], env=env, cwd=CLAUDE)
        check(not env_file.exists(), "claude session-end did not remove env.sh")
        settings_after = load_json(home / ".claude" / "settings.json")
        check(
            "BASH_ENV" not in settings_after.get("env", {}),
            "claude session-end must remove BASH_ENV from settings",
        )


def main() -> int:
    node = node_bin()
    command = assert_manifests_and_hooks()
    assert_skill_inventory()
    assert_workflow_docs()
    assert_node_syntax(node)
    assert_codex_setup_status_cleanup(node)
    assert_codex_loader_failure_is_visible(node)
    assert_codex_plugin_root_hook_command(node, command)
    assert_pre_tool_use(node)
    assert_claude_session_flow(node)
    print(
        json.dumps(
            {
                "onecli_plugin_workflows": "ok",
                "checked": [
                    "manifests_and_marketplaces",
                    "hook_wiring",
                    "skill_inventory",
                    "gateway_workflow_guidance",
                    "integration_workflow_guidance",
                    "provider_matrix",
                    "node_syntax",
                    "codex_setup_status_cleanup",
                    "codex_loader_failure_visibility",
                    "codex_plugin_root_hook_command",
                    "codex_pre_tool_use_rewrite",
                    "claude_session_flow_and_quoting",
                ],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"onecli plugin workflow test failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
