import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ONECLI_DIR = join(homedir(), ".onecli");
const CA_BUNDLE_PATH = join(ONECLI_DIR, "ca-bundle.pem");
const CREDENTIALS_PATH = join(ONECLI_DIR, "credentials", "api-key");
const CONFIG_PATH = join(ONECLI_DIR, "config.json");
const PLUGIN_AUTH_PATH = join(
  homedir(),
  ".config",
  "onecli-plugin",
  "auth.json"
);
const DEFAULT_API_HOST = "https://app.onecli.sh";
const KEYCHAIN_SERVICE = "onecli-api-key";

const SYSTEM_CA_PATHS = [
  "/etc/ssl/cert.pem",
  "/etc/ssl/certs/ca-certificates.crt",
  "/etc/pki/tls/certs/ca-bundle.crt",
  "/etc/ssl/ca-bundle.pem",
];

const CA_ENV_KEYS = [
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "REQUESTS_CA_BUNDLE",
  "CURL_CA_BUNDLE",
  "GIT_SSL_CAINFO",
  "DENO_CERT",
];

function safeReadFile(path: string): string | null {
  try {
    return readFileSync(path, "utf-8").trim();
  } catch {
    return null;
  }
}

function safeReadJson<T>(path: string): T | null {
  const content = safeReadFile(path);
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function isOnecliProxy(value: string | undefined): boolean {
  if (!value) return false;
  return value.includes("onecli") || value.includes(":10255");
}

function resolveApiKey(): string | null {
  if (process.env.ONECLI_API_KEY) {
    return process.env.ONECLI_API_KEY;
  }

  const fileKey = safeReadFile(CREDENTIALS_PATH);
  if (fileKey) return fileKey;

  if (process.platform === "darwin") {
    try {
      const result = execSync(
        `security find-generic-password -s "${KEYCHAIN_SERVICE}" -w 2>/dev/null`,
        { encoding: "utf-8", timeout: 3000 }
      ).trim();
      if (result) return result;
    } catch {
      // keychain not available or entry not found
    }
  }

  const pluginAuth = safeReadJson<{ apiKey?: string }>(PLUGIN_AUTH_PATH);
  if (pluginAuth?.apiKey) return pluginAuth.apiKey;

  return null;
}

function resolveApiHost(): string {
  if (process.env.ONECLI_API_HOST) {
    return process.env.ONECLI_API_HOST;
  }

  const config = safeReadJson<{ "api-host"?: string }>(CONFIG_PATH);
  if (config?.["api-host"]) return config["api-host"];

  return DEFAULT_API_HOST;
}

interface ContainerConfig {
  env: Record<string, string>;
  caCertificate?: string;
  caCertificateContainerPath?: string;
}

async function fetchContainerConfig(
  apiHost: string,
  apiKey: string
): Promise<ContainerConfig | null> {
  try {
    const response = await fetch(`${apiHost}/api/container-config`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 401) {
      process.stdout.write(
        "OneCLI: API key is invalid or expired. Run /onecli-setup to reconfigure.\n"
      );
      return null;
    }

    if (!response.ok) {
      process.stdout.write(
        `OneCLI: Gateway returned ${response.status}. Run /onecli-status to diagnose.\n`
      );
      return null;
    }

    return (await response.json()) as ContainerConfig;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error";
    process.stdout.write(
      `OneCLI: Could not reach gateway (${message}). Requests will not be proxied this session.\n`
    );
    return null;
  }
}

function writeCABundle(gatewayCert: string): void {
  let systemCAs = "";
  for (const caPath of SYSTEM_CA_PATHS) {
    const content = safeReadFile(caPath);
    if (content) {
      systemCAs = content;
      break;
    }
  }

  const bundle = systemCAs
    ? `${systemCAs}\n${gatewayCert}`
    : gatewayCert;

  const existing = safeReadFile(CA_BUNDLE_PATH);
  if (existing === bundle) return;

  mkdirSync(ONECLI_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CA_BUNDLE_PATH, bundle, { mode: 0o600 });
}

function injectEnvVars(
  envFile: string,
  config: ContainerConfig
): void {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(config.env)) {
    if (
      key === "NODE_EXTRA_CA_CERTS" ||
      key === "SSL_CERT_FILE" ||
      key === "REQUESTS_CA_BUNDLE" ||
      key === "CURL_CA_BUNDLE" ||
      key === "GIT_SSL_CAINFO" ||
      key === "DENO_CERT"
    ) {
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

  appendFileSync(envFile, lines.join("\n") + "\n");
}

async function main(): Promise<void> {
  if (isOnecliProxy(process.env.HTTPS_PROXY)) {
    process.stderr.write("onecli: gateway already active (via onecli run).\n");
    return;
  }

  const apiKey = resolveApiKey();
  if (!apiKey) {
    process.stderr.write("onecli: no API key found. Run /onecli-setup to configure.\n");
    process.stdout.write(
      [
        "# OneCLI Gateway — Setup Required",
        "",
        "The OneCLI gateway plugin is installed but NOT configured — no API key, no proxy, no credentials.",
        "DO NOT attempt any external API requests (curl, fetch, gh, etc.) — they will all fail without auth.",
        "Instead, tell the user to run /onecli-setup to configure their API key. After setup, they start a new session and the gateway activates automatically.",
        "",
      ].join("\n")
    );
    return;
  }

  const apiHost = resolveApiHost();
  const config = await fetchContainerConfig(apiHost, apiKey);
  if (!config) return;

  if (config.caCertificate) {
    writeCABundle(config.caCertificate);
  }

  const envFile = process.env.CLAUDE_ENV_FILE;
  if (envFile) {
    injectEnvVars(envFile, config);
  }

  process.stderr.write("onecli: gateway connected.\n");
  process.stdout.write(
    [
      "# OneCLI Gateway Active",
      "",
      "HTTPS_PROXY is configured. All outbound HTTP requests (curl, CLI tools, language HTTP clients)",
      "are transparently proxied through the OneCLI gateway, which injects stored credentials",
      "(OAuth tokens, API keys) at the proxy boundary.",
      "",
      "- The gateway intercepts all HTTPS traffic — curl, gh, gcloud, aws CLI, and any HTTP client all route through it",
      "- Credentials are injected automatically — do not set Authorization headers manually",
      "- If a request returns 401/403 with a `connect_url` in the JSON response, show that URL to the user to connect the service, then retry",
      "- If a request returns 401/403 WITHOUT a `connect_url`, guide the user to connect the service via /onecli-connect or at https://app.onecli.sh/projects",
      "- If the gateway returns `blocked_by_policy` (403), show the rule name — do not retry or circumvent",
      "- If the gateway returns `rate_limited` (429), wait for `retry_after_secs` before retrying",
      "- Never say 'I don't have access' without making the request first",
      "",
      "Available commands: /onecli-setup (configure API key), /onecli-status (check connections)",
      "",
    ].join("\n")
  );
}

main().catch((err) => {
  process.stderr.write(
    `onecli: plugin error — ${err instanceof Error ? err.message : String(err)}\n`
  );
});
