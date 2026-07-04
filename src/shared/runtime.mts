import { execSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_API_HOST = "https://app.onecli.sh";
export const KEYCHAIN_SERVICE = "onecli-api-key";

export const SYSTEM_CA_PATHS = [
  "/etc/ssl/cert.pem",
  "/etc/ssl/certs/ca-certificates.crt",
  "/etc/pki/tls/certs/ca-bundle.crt",
  "/etc/ssl/ca-bundle.pem",
];

export const CA_ENV_KEYS = [
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "REQUESTS_CA_BUNDLE",
  "AWS_CA_BUNDLE",
  "CURL_CA_BUNDLE",
  "GIT_SSL_CAINFO",
  "DENO_CERT",
];

export interface OnecliPaths {
  home: string;
  onecliDir: string;
  envPath: string;
  caBundlePath: string;
  credentialsPath: string;
  configPath: string;
  pluginAuthPath: string;
}

export function userHome(): string {
  return process.env.HOME || homedir();
}

export function onecliPaths(home: string = userHome()): OnecliPaths {
  const onecliDir = join(home, ".onecli");
  return {
    home,
    onecliDir,
    envPath: join(onecliDir, "env.sh"),
    caBundlePath: join(onecliDir, "ca-bundle.pem"),
    credentialsPath: join(onecliDir, "credentials", "api-key"),
    configPath: join(onecliDir, "config.json"),
    pluginAuthPath: join(home, ".config", "onecli-plugin", "auth.json"),
  };
}

export function safeReadFile(path: string): string | null {
  try {
    return readFileSync(path, "utf-8").trim();
  } catch {
    return null;
  }
}

export function safeReadJson<T>(path: string): T | null {
  const content = safeReadFile(path);
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export function shellQuote(value: unknown): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function ensurePrivateDir(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  try {
    chmodSync(path, 0o700);
  } catch {
    // Best effort; the file writes below still enforce file mode.
  }
}

export function writeFilePrivate(path: string, content: string): void {
  ensurePrivateDir(dirname(path));
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function isOnecliProxy(value: string | undefined): boolean {
  if (!value) return false;
  return value.includes("onecli") || value.includes(":10255") || value.includes("aoc_");
}

export function resolveApiKey(paths: OnecliPaths = onecliPaths()): string | null {
  if (process.env.ONECLI_API_KEY) return process.env.ONECLI_API_KEY;

  const fileKey = safeReadFile(paths.credentialsPath);
  if (fileKey) return fileKey;

  if (process.platform === "darwin") {
    try {
      const result = execSync(
        `security find-generic-password -s "${KEYCHAIN_SERVICE}" -w 2>/dev/null`,
        { encoding: "utf-8", timeout: 3000 }
      ).trim();
      if (result) return result;
    } catch {
      // Keychain lookup is best effort.
    }
  }

  const pluginAuth = safeReadJson<{ apiKey?: string }>(paths.pluginAuthPath);
  if (pluginAuth?.apiKey) return pluginAuth.apiKey;
  return null;
}

export function resolveApiHost(paths: OnecliPaths = onecliPaths()): string {
  if (process.env.ONECLI_API_HOST) return process.env.ONECLI_API_HOST;
  const config = safeReadJson<{ "api-host"?: string }>(paths.configPath);
  if (config?.["api-host"]) return config["api-host"];
  return DEFAULT_API_HOST;
}

export interface ContainerConfig {
  env: Record<string, string>;
  caCertificate?: string;
  caCertificateContainerPath?: string;
}

export type ConfigResult =
  | { ok: true; config: ContainerConfig }
  | { ok: false; reason: "unauthorized" }
  | { ok: false; reason: "http"; status: number }
  | { ok: false; reason: "network"; message: string };

export async function fetchContainerConfig(
  apiHost: string,
  apiKey: string,
  opts: { headers?: Record<string, string> } = {}
): Promise<ConfigResult> {
  try {
    const response = await fetch(`${apiHost}/api/container-config`, {
      headers: { Authorization: `Bearer ${apiKey}`, ...opts.headers },
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 401) return { ok: false, reason: "unauthorized" };
    if (!response.ok) return { ok: false, reason: "http", status: response.status };
    return { ok: true, config: (await response.json()) as ContainerConfig };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, reason: "network", message };
  }
}

export function parseProxyUrl(proxyUrl: string): { host: string; port: number } | null {
  try {
    const url = new URL(proxyUrl);
    const port = url.port
      ? parseInt(url.port, 10)
      : url.protocol === "https:"
        ? 443
        : 80;
    return { host: url.hostname, port };
  } catch {
    return null;
  }
}

export function probeProxy(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
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

export function writeCABundle(gatewayCert: string, paths: OnecliPaths = onecliPaths()): void {
  let systemCAs = "";
  for (const caPath of SYSTEM_CA_PATHS) {
    const content = safeReadFile(caPath);
    if (content) {
      systemCAs = content;
      break;
    }
  }

  const bundle = systemCAs ? `${systemCAs}\n${gatewayCert}` : gatewayCert;
  const existing = safeReadFile(paths.caBundlePath);
  if (existing !== bundle) {
    writeFilePrivate(paths.caBundlePath, bundle);
  } else {
    chmodSync(paths.caBundlePath, 0o600);
  }
}

export function buildEnvLines(
  config: ContainerConfig,
  opts: { caBundlePath: string }
): string[] {
  const env = config && typeof config.env === "object" && config.env !== null ? config.env : {};
  const lines: string[] = [];

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

export async function readHookInput(): Promise<Record<string, unknown>> {
  if (process.stdin.isTTY) return {};
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += chunk;
  }
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    process.stderr.write("onecli: ignored invalid hook stdin.\n");
    return {};
  }
}
