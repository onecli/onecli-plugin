#!/usr/bin/env node
// Invoked by the ~/.onecli/env.sh loader on every sourced command. Writes
// shell exports to stdout (captured by eval) and diagnostics to stderr, and
// exits non-zero on any failure so the command proceeds without the gateway
// but the user sees why.
import {
  buildEnvLines,
  fetchContainerConfig,
  onecliPaths,
  parseProxyUrl,
  probeProxy,
  resolveApiHost,
  resolveApiKey,
  shellQuote,
  writeCABundle,
} from "../shared/runtime.mjs";

function fail(message: string): never {
  process.stderr.write(`onecli: ${message}\n`);
  process.exit(1);
}

function parseFormat(argv: string[]): string {
  const idx = argv.indexOf("--format");
  if (idx === -1) return "sh";
  return argv[idx + 1] ?? "sh";
}

async function main(): Promise<void> {
  const format = parseFormat(process.argv.slice(2));
  if (format !== "sh") {
    fail(`unsupported output format '${format}'.`);
  }

  const paths = onecliPaths();
  const sessionId = process.env.ONECLI_CODEX_SESSION_ID || "";

  const apiKey = resolveApiKey(paths);
  if (!apiKey) {
    fail("no API key configured. Use the onecli-setup skill, then retry. This command runs without the gateway.");
  }

  const apiHost = resolveApiHost(paths);
  const headers: Record<string, string> = {};
  if (sessionId) headers["X-OneCLI-Codex-Session-Id"] = sessionId;

  const result = await fetchContainerConfig(apiHost, apiKey, { headers });
  if (!result.ok) {
    if (result.reason === "unauthorized") {
      fail("API key is invalid or expired. Use the onecli-setup skill to reconfigure.");
    }
    if (result.reason === "http") {
      fail(`gateway config request returned HTTP ${result.status}. Use the onecli-status skill to diagnose.`);
    }
    fail(`could not reach OneCLI Cloud (${result.message}). This command runs without the gateway.`);
  }

  const config = result.config;
  const proxyUrl = config.env.HTTPS_PROXY || config.env.https_proxy;
  if (proxyUrl) {
    const parsed = parseProxyUrl(proxyUrl);
    if (parsed) {
      const reachable = await probeProxy(parsed.host, parsed.port);
      if (!reachable) {
        fail(
          `gateway proxy unreachable at ${parsed.host}:${parsed.port}. Your API key may target a different environment. This command runs without the gateway.`
        );
      }
    }
  }

  if (config.caCertificate) {
    writeCABundle(config.caCertificate, paths);
  }

  const lines: string[] = [];
  if (sessionId) {
    lines.push(`export ONECLI_CODEX_SESSION_ID=${shellQuote(sessionId)}`);
  }
  lines.push(...buildEnvLines(config, { caBundlePath: paths.caBundlePath }));
  process.stdout.write(lines.join("\n") + "\n");
}

main().catch((err) => {
  process.stderr.write(
    `onecli: env helper error - ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
