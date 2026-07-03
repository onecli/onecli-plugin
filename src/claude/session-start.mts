import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  buildEnvLines,
  fetchContainerConfig,
  isOnecliProxy,
  onecliPaths,
  parseProxyUrl,
  probeProxy,
  resolveApiHost,
  resolveApiKey,
  userHome,
  writeCABundle,
  writeFilePrivate,
  type ContainerConfig,
} from "../shared/runtime.mjs";

const paths = onecliPaths();

const ACTIVE_CONTEXT = [
  "# OneCLI Gateway Active",
  "",
  "IMPORTANT: You MUST use curl for ALL external API requests (Gmail, GitHub, Calendar, Stripe, etc.).",
  "NEVER use MCP tools (Gmail MCP, Google Calendar MCP, Google Drive MCP, etc.) for these services.",
  "The OneCLI gateway handles authentication automatically through HTTPS_PROXY; just use curl.",
  "",
  "## Rules",
  "- ALWAYS use curl for external API requests; NEVER use MCP tools for Gmail, Calendar, Drive, GitHub, etc.",
  "- Credentials are injected automatically; do not set Authorization headers manually",
  "- If a request returns 401/403 with a `connect_url` in the JSON response, show that URL to the user to connect the service, then retry",
  "- If a request returns 401/403 WITHOUT a `connect_url`, guide the user to connect the service via /onecli-connect or at https://app.onecli.sh/projects",
  "- If the gateway returns `blocked_by_policy` (403), show the rule name; do not retry or circumvent",
  "- If the gateway returns `rate_limited` (429), wait for `retry_after_secs` before retrying",
  "- Never say 'I don't have access' without making the request first",
  "",
  "Available commands: /onecli-setup (configure API key), /onecli-status (check connections)",
].join("\n");

const SETUP_CONTEXT = [
  "# OneCLI Gateway: Setup Required",
  "",
  "The OneCLI gateway plugin is installed but NOT configured; there is no API key and no active proxy.",
  "DO NOT attempt any external API requests (curl, fetch, gh, etc.); they will all fail without auth.",
  "Instead, tell the user to run /onecli-setup to configure their API key. After setup, they start a new session and the gateway activates automatically.",
].join("\n");

// SessionStart structured output: `systemMessage` is shown to the user in the
// UI (the wrapper-style one-liner); `additionalContext` goes to the model.
function emit(systemMessage: string | null, additionalContext: string | null): void {
  const out: Record<string, unknown> = {};
  if (systemMessage) out.systemMessage = systemMessage;
  if (additionalContext) {
    out.hookSpecificOutput = {
      hookEventName: "SessionStart",
      additionalContext,
    };
  }
  if (Object.keys(out).length > 0) {
    process.stdout.write(JSON.stringify(out));
  }
}

function injectEnvVars(envFile: string | undefined, config: ContainerConfig): void {
  const lines = buildEnvLines(config, { caBundlePath: paths.caBundlePath });
  const content = lines.join("\n") + "\n";

  writeFilePrivate(paths.envPath, content);

  if (envFile) {
    appendFileSync(envFile, content);
  }

  ensureBashEnv();
}

function ensureBashEnv(): void {
  const settingsPath = join(userHome(), ".claude", "settings.json");
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
  } catch {
    // no settings file yet
  }

  const env = (settings.env ?? {}) as Record<string, string>;
  if (env.BASH_ENV === paths.envPath) return;

  env.BASH_ENV = paths.envPath;
  settings.env = env;
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

async function main(): Promise<void> {
  if (isOnecliProxy(process.env.HTTPS_PROXY)) {
    process.stderr.write("onecli: gateway already active (via onecli run).\n");
    // The wrapper already announced the connection; give the model the rules
    // without repeating a user-facing message.
    emit(null, ACTIVE_CONTEXT);
    return;
  }

  const apiKey = resolveApiKey(paths);
  if (!apiKey) {
    process.stderr.write("onecli: no API key found. Run /onecli-setup to configure.\n");
    emit(
      "onecli: gateway installed but not configured. Run /onecli-setup to connect external APIs.",
      SETUP_CONTEXT
    );
    return;
  }

  const apiHost = resolveApiHost(paths);
  const result = await fetchContainerConfig(apiHost, apiKey);
  if (!result.ok) {
    if (result.reason === "unauthorized") {
      emit(
        "onecli: API key is invalid or expired. Run /onecli-setup to reconfigure.",
        "OneCLI: API key is invalid or expired. Tell the user to run /onecli-setup to reconfigure. External API requests will fail this session."
      );
    } else if (result.reason === "http") {
      emit(
        `onecli: gateway returned ${result.status}. Run /onecli-status to diagnose.`,
        `OneCLI: Gateway returned ${result.status}. Run /onecli-status to diagnose. External API requests may fail this session.`
      );
    } else {
      emit(
        `onecli: could not reach gateway (${result.message}). Requests will not be proxied this session.`,
        `OneCLI: Could not reach gateway (${result.message}). Requests will not be proxied this session.`
      );
    }
    return;
  }

  const config = result.config;
  const proxyUrl = config.env.HTTPS_PROXY || config.env.https_proxy;
  if (proxyUrl) {
    const parsed = parseProxyUrl(proxyUrl);
    if (parsed) {
      const reachable = await probeProxy(parsed.host, parsed.port);
      if (!reachable) {
        process.stderr.write(
          `onecli: proxy unreachable at ${parsed.host}:${parsed.port}\n`
        );
        emit(
          `onecli: gateway proxy unreachable at ${parsed.host}:${parsed.port}. Run /onecli-setup to reconfigure.`,
          [
            "# OneCLI Gateway: Proxy Unreachable",
            "",
            `The gateway returned a proxy address (\`${parsed.host}:${parsed.port}\`) that is not reachable from this machine.`,
            "This usually means the API key is configured for a different environment (e.g., a local dev gateway that is not running).",
            "Tell the user to run /onecli-setup to reconfigure, or to start the local gateway if they intend to use it.",
          ].join("\n")
        );
        return;
      }
    }
  }

  if (config.caCertificate) {
    writeCABundle(config.caCertificate, paths);
  }

  const envFile = process.env.CLAUDE_ENV_FILE;
  injectEnvVars(envFile, config);
  process.stderr.write("onecli: gateway connected.\n");
  emit(
    "onecli: gateway connected. External API requests are authenticated automatically.",
    ACTIVE_CONTEXT
  );
}

main().catch((err) => {
  process.stderr.write(
    `onecli: plugin error: ${err instanceof Error ? err.message : String(err)}\n`
  );
});
