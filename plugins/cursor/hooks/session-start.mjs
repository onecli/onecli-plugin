#!/usr/bin/env node

// src/cursor/session-start.mts
import { dirname as dirname2, join as join2 } from "path";
import { fileURLToPath } from "url";

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
  "AWS_CA_BUNDLE",
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
function resolveApiKey(paths = onecliPaths()) {
  if (process.env.ONECLI_API_KEY) return process.env.ONECLI_API_KEY;
  const fileKey = safeReadFile(paths.credentialsPath);
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
  const pluginAuth = safeReadJson(paths.pluginAuthPath);
  if (pluginAuth?.apiKey) return pluginAuth.apiKey;
  return null;
}
function resolveApiHost(paths = onecliPaths()) {
  if (process.env.ONECLI_API_HOST) return process.env.ONECLI_API_HOST;
  const config = safeReadJson(paths.configPath);
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
function writeCABundle(gatewayCert, paths = onecliPaths()) {
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
  const existing = safeReadFile(paths.caBundlePath);
  if (existing !== bundle) {
    writeFilePrivate(paths.caBundlePath, bundle);
  } else {
    chmodSync(paths.caBundlePath, 384);
  }
}
async function readHookInput() {
  if (process.stdin.isTTY) return {};
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += chunk;
  }
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    process.stderr.write("onecli: ignored invalid hook stdin.\n");
    return {};
  }
}

// src/cursor/session-start.mts
var SCRIPT_DIR = dirname2(fileURLToPath(import.meta.url));
var PLUGIN_ROOT = process.env.PLUGIN_ROOT || dirname2(SCRIPT_DIR);
var HELPER_PATH = join2(PLUGIN_ROOT, "bin", "onecli-cursor-env.mjs");
var NODE_PATH = process.execPath;
var ACTIVE_CONTEXT = [
  "OneCLI Gateway active. Call external APIs directly (plain curl/gh); requests route through the gateway and credentials are injected automatically. Never add Authorization headers.",
  "On errors: connect_url \u2192 show it to the user and retry after they connect; blocked_by_policy \u2192 report the rule, do not circumvent; rate_limited \u2192 wait retry_after_secs. Details: onecli-gateway skill."
].join(" ");
var SETUP_CONTEXT = "OneCLI Gateway: installed but not configured. Tell the user to invoke the onecli-setup skill. Do not attempt external API requests until configured.";
function buildLoaderContent({ pluginRoot, helperPath, nodePath, sessionId }) {
  const sessionLine = sessionId ? `export ONECLI_CURSOR_SESSION_ID=${shellQuote(sessionId)}` : "unset ONECLI_CURSOR_SESSION_ID";
  return [
    "# Generated by the OneCLI Cursor plugin.",
    "# This loader contains no gateway credential; sourcing it fetches fresh exports.",
    `export ONECLI_CURSOR_PLUGIN_ROOT=${shellQuote(pluginRoot)}`,
    sessionLine,
    `eval "$(ONECLI_CURSOR_PLUGIN_ROOT="$ONECLI_CURSOR_PLUGIN_ROOT" ONECLI_CURSOR_SESSION_ID="\${ONECLI_CURSOR_SESSION_ID:-}" ${shellQuote(nodePath)} ${shellQuote(helperPath)} --format sh)"`,
    ""
  ].join("\n");
}
function writeLoaderFile(sessionId) {
  const paths = onecliPaths();
  const content = buildLoaderContent({
    pluginRoot: PLUGIN_ROOT,
    helperPath: HELPER_PATH,
    nodePath: NODE_PATH,
    sessionId
  });
  writeFilePrivate(paths.envPath, content);
  return paths.envPath;
}
function buildEnvObject(config, caBundlePath) {
  const raw = config && typeof config.env === "object" && config.env !== null ? config.env : {};
  const env = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (CA_ENV_KEYS.includes(key)) continue;
    env[key] = value;
  }
  if (config?.caCertificate) {
    for (const key of CA_ENV_KEYS) {
      env[key] = caBundlePath;
    }
  }
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_HTTP_PROXY_AUTHMETHOD = "basic";
  env.NODE_USE_ENV_PROXY = "1";
  return env;
}
function emit(output) {
  if (Object.keys(output).length > 0) {
    process.stdout.write(JSON.stringify(output));
  }
}
async function main() {
  const hookInput = await readHookInput();
  const sessionId = typeof hookInput.session_id === "string" ? hookInput.session_id : "";
  const paths = onecliPaths();
  const envPath = writeLoaderFile(sessionId);
  if (isOnecliProxy(process.env.HTTPS_PROXY)) {
    process.stderr.write("onecli: gateway already active.\n");
    emit({ additional_context: ACTIVE_CONTEXT });
    return;
  }
  const apiKey = resolveApiKey(paths);
  if (!apiKey) {
    process.stderr.write("onecli: no API key found.\n");
    emit({ additional_context: SETUP_CONTEXT });
    return;
  }
  const apiHost = resolveApiHost(paths);
  const headers = {};
  if (sessionId) headers["X-OneCLI-Cursor-Session-Id"] = sessionId;
  const result = await fetchContainerConfig(apiHost, apiKey, { headers });
  if (!result.ok) {
    if (result.reason === "unauthorized") {
      emit({
        additional_context: "OneCLI: API key is invalid or expired. Tell the user to run the onecli-setup skill. External API requests will fail this session."
      });
      return;
    }
    emit({
      additional_context: "OneCLI gateway config could not be fetched. Use the onecli-status skill to diagnose. The loader file is ready for per-command sourcing."
    });
    process.stderr.write(`onecli: gateway loader written to ${envPath}.
`);
    return;
  }
  const config = result.config;
  const proxyUrl = config.env.HTTPS_PROXY || config.env.https_proxy;
  if (proxyUrl) {
    const parsed = parseProxyUrl(proxyUrl);
    if (parsed) {
      const reachable = await probeProxy(parsed.host, parsed.port);
      if (!reachable) {
        emit({
          additional_context: "OneCLI gateway proxy is unreachable. Use the onecli-status skill to diagnose. Per-command sourcing may still work once the proxy is available."
        });
        process.stderr.write(`onecli: gateway loader written to ${envPath}.
`);
        return;
      }
    }
  }
  if (config.caCertificate) {
    writeCABundle(config.caCertificate, paths);
  }
  const env = buildEnvObject(config, paths.caBundlePath);
  if (sessionId) {
    env.ONECLI_CURSOR_SESSION_ID = sessionId;
  }
  process.stderr.write(`onecli: gateway loader written to ${envPath}.
`);
  emit({ env, additional_context: ACTIVE_CONTEXT });
}
main().catch((err) => {
  process.stderr.write(
    `onecli: plugin error: ${err instanceof Error ? err.message : String(err)}
`
  );
});
