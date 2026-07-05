#!/usr/bin/env python3
"""Verify Cursor agent shell traffic uses the OneCLI gateway.

Run this FROM an Agent/subagent Shell tool after the plugin is installed and a
new composer session started. Do not source ~/.onecli/env.sh manually.

Pass criteria:
- GitHub rate_limit core limit > 1000 (authenticated via gateway)
- Optional: ONECLI activity row appears (manual dashboard check)
"""
from __future__ import annotations

import json
import subprocess
import sys
import time


def main() -> int:
    marker = f"cursor-agent-verify-{int(time.time())}"
    cmd = (
        f'curl -s -H "X-OneCLI-Agent-Verify: {marker}" '
        "https://api.github.com/rate_limit"
    )
    result = subprocess.run(
        ["/bin/bash", "-lc", cmd],
        text=True,
        capture_output=True,
        timeout=30,
    )
    if result.returncode != 0:
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "curl_failed",
                    "stderr": result.stderr,
                    "stdout": result.stdout,
                },
                indent=2,
            )
        )
        return 1

    try:
        payload = json.loads(result.stdout)
        core_limit = payload["resources"]["core"]["limit"]
    except (json.JSONDecodeError, KeyError) as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "bad_rate_limit_response",
                    "error": str(exc),
                    "stdout": result.stdout[:500],
                },
                indent=2,
            )
        )
        return 1

    via_gateway = core_limit > 1000
    print(
        json.dumps(
            {
                "ok": via_gateway,
                "marker": marker,
                "core_limit": core_limit,
                "interpretation": "gateway" if via_gateway else "direct_unauthenticated",
                "hint": (
                    "Gateway active. Check OneCLI Activity for GET /rate_limit."
                    if via_gateway
                    else "Hooks not active. Install plugin, reload, new session, or run install-project-hooks.sh"
                ),
            },
            indent=2,
        )
    )
    return 0 if via_gateway else 1


if __name__ == "__main__":
    raise SystemExit(main())
