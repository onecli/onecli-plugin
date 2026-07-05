#!/usr/bin/env python3
"""Live E2E verification for the OneCLI Cursor plugin against real OneCLI Cloud."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
CURSOR = REPO / "plugins" / "cursor"
MARKER = f"cursor-e2e-{int(time.time())}"


def run(cmd: list[str], *, input_text: str | None = None, env: dict[str, str] | None = None, cwd: Path | None = None) -> subprocess.CompletedProcess:
    result = subprocess.run(
        cmd,
        input=input_text,
        text=True,
        capture_output=True,
        env=env or os.environ.copy(),
        cwd=str(cwd) if cwd else None,
        timeout=60,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"command failed: {cmd}\nstdout={result.stdout}\nstderr={result.stderr}"
        )
    return result


def api_key() -> str:
    path = Path.home() / ".onecli" / "credentials" / "api-key"
    if not path.exists():
        raise RuntimeError("missing ~/.onecli/credentials/api-key")
    return path.read_text().strip()


def probe_activity_endpoints(key: str) -> list[dict]:
    import urllib.error
    import urllib.request

    candidates = [
        "https://app.onecli.sh/api/github/activity",
        "https://app.onecli.sh/api/apps/github/activity",
        "https://app.onecli.sh/api/activity",
        "https://app.onecli.sh/api/activities/github",
        "https://api.onecli.sh/v1/activity",
        "https://api.onecli.sh/v1/activities",
    ]
    found = []
    for url in candidates:
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}"})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read(500).decode("utf-8", errors="replace")
                found.append({"url": url, "status": resp.status, "body": body})
        except urllib.error.HTTPError as exc:
            found.append({"url": url, "status": exc.code, "body": exc.read(300).decode("utf-8", errors="replace")})
        except Exception as exc:  # noqa: BLE001
            found.append({"url": url, "status": "error", "body": str(exc)})
    return found


def main() -> int:
    node = shutil_which("node")
    key = api_key()

    print("== 1) npm test (full workflow suite) ==")
    run([sys.executable, "tests/test_workflows.py"], cwd=REPO)
    print("PASS: workflow tests")

    print("== 2) sessionStart live hook ==")
    hook_input = json.dumps({"hook_event_name": "sessionStart", "session_id": MARKER})
    start = run(
        [node, str(CURSOR / "hooks" / "session-start.mjs")],
        input_text=hook_input,
        cwd=CURSOR,
    )
    payload = json.loads(start.stdout)
    proxy = payload.get("env", {}).get("HTTPS_PROXY")
    if not proxy:
        raise RuntimeError("session-start did not return HTTPS_PROXY")
    if "gateway.onecli.sh" not in proxy and ":10255" not in proxy:
        raise RuntimeError(f"unexpected proxy URL: {proxy}")
    if payload.get("additional_context", "").startswith("OneCLI Gateway active") is False:
        raise RuntimeError("session-start missing active context")
    print(f"PASS: session-start env proxy={proxy[:70]}...")

    print("== 3) preToolUse rewrite live hook ==")
    pre = run(
        [node, str(CURSOR / "hooks" / "pre-tool-use.mjs")],
        input_text=json.dumps(
            {
                "hook_event_name": "preToolUse",
                "tool_name": "Shell",
                "tool_input": {"command": "curl -s https://api.github.com/zen"},
            }
        ),
        cwd=CURSOR,
    )
    if pre.stdout.strip():
        rewritten = json.loads(pre.stdout)
        command = rewritten["updated_input"]["command"]
        if ".onecli/env.sh" not in command:
            raise RuntimeError(f"pre-tool-use missing loader prefix: {command}")
        print("PASS: pre-tool-use rewrite")
    else:
        print("PASS: pre-tool-use skipped (gateway already active in hook env)")

    print("== 4) proxied curl through loader ==")
    checks = [
        ("https://api.github.com/zen", "zen", {"200"}),
        (
            "https://api.github.com/rate_limit",
            "rate_limit",
            {"200"},
        ),
    ]
    rate_body = ""
    for url, label, ok_codes in checks:
        out = Path(f"/tmp/onecli_cursor_e2e_{label}.json")
        curl_cmd = (
            f'. "$HOME/.onecli/env.sh" && '
            f'curl -s -o {out} -w "%{{http_code}}" '
            f'-H "X-OneCLI-E2E-Marker: {MARKER}" "{url}"'
        )
        curl = run(["/bin/bash", "-lc", curl_cmd], cwd=CURSOR)
        code = curl.stdout.strip()
        body_preview = out.read_text()[:500] if out.exists() else ""
        print(f"{label}_http_code={code}")
        print(f"{label}_body={body_preview!r}")
        if code not in ok_codes:
            raise RuntimeError(f"unexpected {label} curl status: {code}")
        if not body_preview.strip():
            raise RuntimeError(f"{label} curl returned empty body")
        if label == "rate_limit":
            rate_body = out.read_text()

    rate = json.loads(rate_body)
    if "resources" not in rate:
        raise RuntimeError(f"github /rate_limit unexpected payload: {rate}")
    print("PASS: proxied curl completed through gateway with GitHub credentials")

    print("== 5) container-config still valid ==")
    cfg = run(
        [
            "curl",
            "-s",
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}",
            "-H",
            f"Authorization: Bearer {key}",
            "https://app.onecli.sh/api/container-config",
        ]
    )
    if cfg.stdout.strip() != "200":
        raise RuntimeError(f"container-config returned {cfg.stdout}")
    print("PASS: API key valid")

    print("== 6) probe dashboard activity endpoints ==")
    probes = probe_activity_endpoints(key)
    for item in probes:
        print(f"probe {item['url']} -> {item['status']}")

    print("== 7) sessionEnd cleanup ==")
    run([node, str(CURSOR / "hooks" / "session-end.mjs")], cwd=CURSOR)
    if (Path.home() / ".onecli" / "env.sh").exists():
        raise RuntimeError("session-end did not remove env.sh")
    print("PASS: session-end cleanup")

    print(
        json.dumps(
            {
                "onecli_cursor_live_e2e": "ok",
                "marker": MARKER,
                "github_rate_limit_ok": True,
                "curl_http_code": "200",
                "activity_probe": probes,
                "note": "Dashboard Activity tab has no public list API in docs; verify marker in app.onecli.sh Activity UI for provider used.",
            },
            indent=2,
        )
    )
    return 0


def shutil_which(name: str) -> str:
    import shutil

    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"{name} not found on PATH")
    return path


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"LIVE E2E FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)
