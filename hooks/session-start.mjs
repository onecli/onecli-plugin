// hooks/src/session-start.mts
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync
} from "fs";
import { homedir } from "os";
import { join } from "path";
import { execSync } from "child_process";
import { createConnection } from "net";
var ONECLI_DIR = join(homedir(), ".onecli");
var ENV_SH_PATH = join(ONECLI_DIR, "env.sh");
var CA_BUNDLE_PATH = join(ONECLI_DIR, "ca-bundle.pem");
var CREDENTIALS_PATH = join(ONECLI_DIR, "credentials", "api-key");
var CONFIG_PATH = join(ONECLI_DIR, "config.json");
var PLUGIN_AUTH_PATH = join(
  homedir(),
  ".config",
  "onecli-plugin",
  "auth.json"
);
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
function isOnecliProxy(value) {
  if (!value) return false;
  return value.includes("onecli") || value.includes(":10255");
}
function resolveApiKey() {
  if (process.env.ONECLI_API_KEY) {
    return process.env.ONECLI_API_KEY;
  }
  const fileKey = safeReadFile(CREDENTIALS_PATH);
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
  const pluginAuth = safeReadJson(PLUGIN_AUTH_PATH);
  if (pluginAuth?.apiKey) return pluginAuth.apiKey;
  return null;
}
function resolveApiHost() {
  if (process.env.ONECLI_API_HOST) {
    return process.env.ONECLI_API_HOST;
  }
  const config = safeReadJson(CONFIG_PATH);
  if (config?.["api-host"]) return config["api-host"];
  return DEFAULT_API_HOST;
}
async function fetchContainerConfig(apiHost, apiKey) {
  try {
    const response = await fetch(`${apiHost}/api/container-config`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(1e4)
    });
    if (response.status === 401) {
      process.stdout.write(
        "OneCLI: API key is invalid or expired. Run /onecli-setup to reconfigure.\n"
      );
      return null;
    }
    if (!response.ok) {
      process.stdout.write(
        `OneCLI: Gateway returned ${response.status}. Run /onecli-status to diagnose.
`
      );
      return null;
    }
    return await response.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    process.stdout.write(
      `OneCLI: Could not reach gateway (${message}). Requests will not be proxied this session.
`
    );
    return null;
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
function writeCABundle(gatewayCert) {
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
  const existing = safeReadFile(CA_BUNDLE_PATH);
  if (existing === bundle) return;
  mkdirSync(ONECLI_DIR, { recursive: true, mode: 448 });
  writeFileSync(CA_BUNDLE_PATH, bundle, { mode: 384 });
}
function buildEnvLines(config) {
  const lines = [];
  for (const [key, value] of Object.entries(config.env)) {
    if (key === "NODE_EXTRA_CA_CERTS" || key === "SSL_CERT_FILE" || key === "REQUESTS_CA_BUNDLE" || key === "CURL_CA_BUNDLE" || key === "GIT_SSL_CAINFO" || key === "DENO_CERT") {
      continue;
    }
    lines.push(`export ${key}=${value}`);
  }
  if (config.caCertificate) {
    for (const key of CA_ENV_KEYS) {
      lines.push(`export ${key}=${CA_BUNDLE_PATH}`);
    }
  }
  lines.push("export GIT_TERMINAL_PROMPT=0");
  lines.push("export GIT_HTTP_PROXY_AUTHMETHOD=basic");
  lines.push("export NODE_USE_ENV_PROXY=1");
  return lines;
}
function injectEnvVars(envFile, config) {
  const lines = buildEnvLines(config);
  const content = lines.join("\n") + "\n";
  mkdirSync(ONECLI_DIR, { recursive: true, mode: 448 });
  writeFileSync(ENV_SH_PATH, content, { mode: 384 });
  if (envFile) {
    appendFileSync(envFile, content);
  }
  ensureBashEnv();
}
function ensureBashEnv() {
  const settingsPath = join(homedir(), ".claude", "settings.json");
  let settings = {};
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
  } catch {
  }
  const env = settings.env ?? {};
  if (env.BASH_ENV === ENV_SH_PATH) return;
  env.BASH_ENV = ENV_SH_PATH;
  settings.env = env;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}
async function main() {
  if (isOnecliProxy(process.env.HTTPS_PROXY)) {
    process.stderr.write("onecli: gateway already active (via onecli run).\n");
    return;
  }
  const apiKey = resolveApiKey();
  if (!apiKey) {
    process.stderr.write("onecli: no API key found. Run /onecli-setup to configure.\n");
    process.stdout.write(
      [
        "# OneCLI Gateway \u2014 Setup Required",
        "",
        "The OneCLI gateway plugin is installed but NOT configured \u2014 no API key, no proxy, no credentials.",
        "DO NOT attempt any external API requests (curl, fetch, gh, etc.) \u2014 they will all fail without auth.",
        "Instead, tell the user to run /onecli-setup to configure their API key. After setup, they start a new session and the gateway activates automatically.",
        ""
      ].join("\n")
    );
    return;
  }
  const apiHost = resolveApiHost();
  const config = await fetchContainerConfig(apiHost, apiKey);
  if (!config) return;
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
        process.stdout.write(
          [
            "# OneCLI Gateway \u2014 Proxy Unreachable",
            "",
            `The gateway returned a proxy address (\`${parsed.host}:${parsed.port}\`) that is not reachable from this machine.`,
            "This usually means your API key is configured for a different environment (e.g., a local dev gateway that is not running).",
            "",
            "**To fix:** Run `/onecli-setup` to reconfigure with the correct API key for your environment,",
            "or start the local gateway if you intend to use it.",
            ""
          ].join("\n")
        );
        return;
      }
    }
  }
  if (config.caCertificate) {
    writeCABundle(config.caCertificate);
  }
  const envFile = process.env.CLAUDE_ENV_FILE;
  injectEnvVars(envFile, config);
  process.stderr.write("onecli: gateway connected.\n");
  process.stdout.write(
    [
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
      "Available commands: /onecli-setup (configure API key), /onecli-status (check connections)",
      ""
    ].join("\n")
  );
}
main().catch((err) => {
  process.stderr.write(
    `onecli: plugin error \u2014 ${err instanceof Error ? err.message : String(err)}
`
  );
});
