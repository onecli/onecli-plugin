#!/usr/bin/env node

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

// src/cursor/onecli-cursor-env.mts
function fail(message) {
  process.stderr.write(`onecli: ${message}
`);
  process.exit(1);
}
function parseFormat(argv) {
  const idx = argv.indexOf("--format");
  if (idx === -1) return "sh";
  return argv[idx + 1] ?? "sh";
}
async function main() {
  const format = parseFormat(process.argv.slice(2));
  if (format !== "sh") {
    fail(`unsupported output format '${format}'.`);
  }
  const paths = onecliPaths();
  const sessionId = process.env.ONECLI_CURSOR_SESSION_ID || "";
  const apiKey = resolveApiKey(paths);
  if (!apiKey) {
    fail("no API key configured. Use the onecli-setup skill, then retry. This command runs without the gateway.");
  }
  const apiHost = resolveApiHost(paths);
  const headers = {};
  if (sessionId) headers["X-OneCLI-Cursor-Session-Id"] = sessionId;
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
  const lines = [];
  if (sessionId) {
    lines.push(`export ONECLI_CURSOR_SESSION_ID=${shellQuote(sessionId)}`);
  }
  lines.push(...buildEnvLines(config, { caBundlePath: paths.caBundlePath }));
  process.stdout.write(lines.join("\n") + "\n");
}
main().catch((err) => {
  process.stderr.write(
    `onecli: env helper error: ${err instanceof Error ? err.message : String(err)}
`
  );
  process.exit(1);
});
