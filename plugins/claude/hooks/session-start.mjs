// src/claude/session-start.mts
import { appendFileSync, mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "fs";
import { dirname as dirname2, join as join2 } from "path";

// src/shared/runtime.mts
import { execSync } from "child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { createConnection } from "net";
import { homedir } from "os";
import { dirname, join } from "path";
var DEFAULT_API_HOST = "https://app.onecli.sh";
var KEYCHAIN_SERVICE = "onecli-api-key";
var SYSTEM_CA_PATHS = [
  "/etc/ssl/cert.pem",
  "/etc/ssl/certs/ca-certificates.crt",
  "/etc/pki/tls/certs/ca-bundle.crt",
  "/etc/ssl/ca-bundle.pem"
];
var CA_ENV_KEYS = [
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "REQUESTS_CA_BUNDLE",
  "CURL_CA_BUNDLE",
  "GIT_SSL_CAINFO",
  "DENO_CERT"
];
function userHome() {
  return process.env.HOME || homedir();
}
function onecliPaths(home = userHome()) {
  const onecliDir = join(home, ".onecli");
  return {
    home,
    onecliDir,
    envPath: join(onecliDir, "env.sh"),
    caBundlePath: join(onecliDir, "ca-bundle.pem"),
    credentialsPath: join(onecliDir, "credentials", "api-key"),
    configPath: join(onecliDir, "config.json"),
    pluginAuthPath: join(home, ".config", "onecli-plugin", "auth.json")
  };
}
function safeReadFile(path) {
  try {
    return readFileSync(path, "utf-8").trim();
  } catch {
    return null;
  }
}
function safeReadJson(path) {
  const content = safeReadFile(path);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
function ensurePrivateDir(path) {
  mkdirSync(path, { recursive: true, mode: 448 });
  try {
    chmodSync(path, 448);
  } catch {
  }
}
function writeFilePrivate(path, content) {
  ensurePrivateDir(dirname(path));
  writeFileSync(path, content, { mode: 384 });
  chmodSync(path, 384);
}
function isOnecliProxy(value) {
  if (!value) return false;
  return value.includes("onecli") || value.includes(":10255") || value.includes("aoc_");
}
function resolveApiKey(paths2 = onecliPaths()) {
  if (process.env.ONECLI_API_KEY) return process.env.ONECLI_API_KEY;
  const fileKey = safeReadFile(paths2.credentialsPath);
  if (fileKey) return fileKey;
  if (process.platform === "darwin") {
    try {
      const result = execSync(
        `security find-generic-password -s "${KEYCHAIN_SERVICE}" -w 2>/dev/null`,
        { encoding: "utf-8", timeout: 3e3 }
      ).trim();
      if (result) return result;
    } catch {
    }
  }
  const pluginAuth = safeReadJson(paths2.pluginAuthPath);
  if (pluginAuth?.apiKey) return pluginAuth.apiKey;
  return null;
}
function resolveApiHost(paths2 = onecliPaths()) {
  if (process.env.ONECLI_API_HOST) return process.env.ONECLI_API_HOST;
  const config = safeReadJson(paths2.configPath);
  if (config?.["api-host"]) return config["api-host"];
  return DEFAULT_API_HOST;
}
async function fetchContainerConfig(apiHost, apiKey, opts = {}) {
  try {
    const response = await fetch(`${apiHost}/api/container-config`, {
      headers: { Authorization: `Bearer ${apiKey}`, ...opts.headers },
      signal: AbortSignal.timeout(1e4)
    });
    if (response.status === 401) return { ok: false, reason: "unauthorized" };
    if (!response.ok) return { ok: false, reason: "http", status: response.status };
    return { ok: true, config: await response.json() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, reason: "network", message };
  }
}
function parseProxyUrl(proxyUrl) {
  try {
    const url = new URL(proxyUrl);
    const port = url.port ? parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80;
    return { host: url.hostname, port };
  } catch {
    return null;
  }
}
function probeProxy(host, port, timeoutMs = 3e3) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: timeoutMs }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}
function writeCABundle(gatewayCert, paths2 = onecliPaths()) {
  let systemCAs = "";
  for (const caPath of SYSTEM_CA_PATHS) {
    const content = safeReadFile(caPath);
    if (content) {
      systemCAs = content;
      break;
    }
  }
  const bundle = systemCAs ? `${systemCAs}
${gatewayCert}` : gatewayCert;
  const existing = safeReadFile(paths2.caBundlePath);
  if (existing !== bundle) {
    writeFilePrivate(paths2.caBundlePath, bundle);
  } else {
    chmodSync(paths2.caBundlePath, 384);
  }
}
function buildEnvLines(config, opts) {
  const env = config && typeof config.env === "object" && config.env !== null ? config.env : {};
  const lines = [];
  for (const [key, value] of Object.entries(env)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (CA_ENV_KEYS.includes(key)) continue;
    lines.push(`export ${key}=${shellQuote(value)}`);
  }
  if (config?.caCertificate) {
    for (const key of CA_ENV_KEYS) {
      lines.push(`export ${key}=${shellQuote(opts.caBundlePath)}`);
    }
  }
  lines.push("export GIT_TERMINAL_PROMPT=0");
  lines.push("export GIT_HTTP_PROXY_AUTHMETHOD=basic");
  lines.push("export NODE_USE_ENV_PROXY=1");
  return lines;
}

// src/claude/session-start.mts
var paths = onecliPaths();
var ACTIVE_CONTEXT = [
  "# OneCLI Gateway Active",
  "",
  "IMPORTANT: You MUST use curl for ALL external API requests (Gmail, GitHub, Calendar, Stripe, etc.).",
  "NEVER use MCP tools (Gmail MCP, Google Calendar MCP, Google Drive MCP, etc.) for these services.",
  "The OneCLI gateway handles authentication automatically through HTTPS_PROXY \u2014 just use curl.",
  "",
  "## Rules",
  "- ALWAYS use curl for external API requests \u2014 NEVER use MCP tools for Gmail, Calendar, Drive, GitHub, etc.",
  "- Credentials are injected automatically \u2014 do not set Authorization headers manually",
  "- If a request returns 401/403 with a `connect_url` in the JSON response, show that URL to the user to connect the service, then retry",
  "- If a request returns 401/403 WITHOUT a `connect_url`, guide the user to connect the service via /onecli-connect or at https://app.onecli.sh/projects",
  "- If the gateway returns `blocked_by_policy` (403), show the rule name \u2014 do not retry or circumvent",
  "- If the gateway returns `rate_limited` (429), wait for `retry_after_secs` before retrying",
  "- Never say 'I don't have access' without making the request first",
  "",
  "Available commands: /onecli-setup (configure API key), /onecli-status (check connections)"
].join("\n");
var SETUP_CONTEXT = [
  "# OneCLI Gateway \u2014 Setup Required",
  "",
  "The OneCLI gateway plugin is installed but NOT configured \u2014 no API key, no proxy, no credentials.",
  "DO NOT attempt any external API requests (curl, fetch, gh, etc.) \u2014 they will all fail without auth.",
  "Instead, tell the user to run /onecli-setup to configure their API key. After setup, they start a new session and the gateway activates automatically."
].join("\n");
function emit(systemMessage, additionalContext) {
  const out = {};
  if (systemMessage) out.systemMessage = systemMessage;
  if (additionalContext) {
    out.hookSpecificOutput = {
      hookEventName: "SessionStart",
      additionalContext
    };
  }
  if (Object.keys(out).length > 0) {
    process.stdout.write(JSON.stringify(out));
  }
}
function injectEnvVars(envFile, config) {
  const lines = buildEnvLines(config, { caBundlePath: paths.caBundlePath });
  const content = lines.join("\n") + "\n";
  writeFilePrivate(paths.envPath, content);
  if (envFile) {
    appendFileSync(envFile, content);
  }
  ensureBashEnv();
}
function ensureBashEnv() {
  const settingsPath = join2(userHome(), ".claude", "settings.json");
  let settings = {};
  try {
    settings = JSON.parse(readFileSync2(settingsPath, "utf-8"));
  } catch {
  }
  const env = settings.env ?? {};
  if (env.BASH_ENV === paths.envPath) return;
  env.BASH_ENV = paths.envPath;
  settings.env = env;
  mkdirSync2(dirname2(settingsPath), { recursive: true });
  writeFileSync2(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}
async function main() {
  if (isOnecliProxy(process.env.HTTPS_PROXY)) {
    process.stderr.write("onecli: gateway already active (via onecli run).\n");
    emit(null, ACTIVE_CONTEXT);
    return;
  }
  const apiKey = resolveApiKey(paths);
  if (!apiKey) {
    process.stderr.write("onecli: no API key found. Run /onecli-setup to configure.\n");
    emit(
      "onecli: gateway installed but not configured \u2014 run /onecli-setup to connect external APIs.",
      SETUP_CONTEXT
    );
    return;
  }
  const apiHost = resolveApiHost(paths);
  const result = await fetchContainerConfig(apiHost, apiKey);
  if (!result.ok) {
    if (result.reason === "unauthorized") {
      emit(
        "onecli: API key is invalid or expired \u2014 run /onecli-setup to reconfigure.",
        "OneCLI: API key is invalid or expired. Tell the user to run /onecli-setup to reconfigure. External API requests will fail this session."
      );
    } else if (result.reason === "http") {
      emit(
        `onecli: gateway returned ${result.status} \u2014 run /onecli-status to diagnose.`,
        `OneCLI: Gateway returned ${result.status}. Run /onecli-status to diagnose. External API requests may fail this session.`
      );
    } else {
      emit(
        `onecli: could not reach gateway (${result.message}) \u2014 requests will not be proxied this session.`,
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
          `onecli: proxy unreachable at ${parsed.host}:${parsed.port}
`
        );
        emit(
          `onecli: gateway proxy unreachable at ${parsed.host}:${parsed.port} \u2014 run /onecli-setup to reconfigure.`,
          [
            "# OneCLI Gateway \u2014 Proxy Unreachable",
            "",
            `The gateway returned a proxy address (\`${parsed.host}:${parsed.port}\`) that is not reachable from this machine.`,
            "This usually means the API key is configured for a different environment (e.g., a local dev gateway that is not running).",
            "Tell the user to run /onecli-setup to reconfigure, or to start the local gateway if they intend to use it."
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
    "onecli: gateway connected \u2014 external API requests are authenticated automatically.",
    ACTIVE_CONTEXT
  );
}
main().catch((err) => {
  process.stderr.write(
    `onecli: plugin error \u2014 ${err instanceof Error ? err.message : String(err)}
`
  );
});
