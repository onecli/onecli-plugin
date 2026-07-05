#!/usr/bin/env node

// src/cursor/pre-tool-use.mts
import { existsSync } from "fs";
import { basename } from "path";

// src/shared/runtime.mts
import { execSync } from "child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { createConnection } from "net";
import { homedir } from "os";
import { dirname, join } from "path";
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
function isOnecliProxy(value) {
  if (!value) return false;
  return value.includes("onecli") || value.includes(":10255") || value.includes("aoc_");
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

// src/cursor/pre-tool-use.mts
var URL_PATTERN = /\b(?:https?:\/\/|ssh:\/\/|git@)/i;
var PACKAGE_NETWORK_COMMANDS = /* @__PURE__ */ new Set([
  "add",
  "audit",
  "ci",
  "info",
  "install",
  "outdated",
  "publish",
  "search",
  "update",
  "view"
]);
var GIT_NETWORK_COMMANDS = /* @__PURE__ */ new Set([
  "clone",
  "fetch",
  "ls-remote",
  "pull",
  "push",
  "remote",
  "submodule"
]);
var TERRAFORM_NETWORK_COMMANDS = /* @__PURE__ */ new Set([
  "apply",
  "destroy",
  "get",
  "import",
  "init",
  "plan",
  "refresh"
]);
var AWS_LOCAL_COMMANDS = /* @__PURE__ */ new Set(["configure", "help"]);
function splitCommandPrefix(command) {
  const trimmed = command.trimStart();
  const match = trimmed.match(/^([A-Za-z0-9_./-]+)(?:\s+([A-Za-z0-9_./:-]+))?/);
  if (!match) return { name: "", arg: "" };
  return {
    name: basename(match[1]),
    arg: match[2] || ""
  };
}
function isAlreadyHandled(command) {
  return command.includes(".onecli/env.sh") || command.includes("ONECLI_CURSOR_AUTOSOURCED") || command.includes("HTTPS_PROXY=") || command.includes("https_proxy=");
}
function isPackageManager(name) {
  return ["npm", "pnpm", "yarn", "bun"].includes(name);
}
function isPythonPackageTool(name) {
  return ["pip", "pip3"].includes(name);
}
function shouldRewrite(command) {
  const { name, arg } = splitCommandPrefix(command);
  if (!name) return false;
  if (["curl", "wget", "http", "https"].includes(name)) {
    return URL_PATTERN.test(command);
  }
  if (name === "gh") {
    return true;
  }
  if (name === "aws") {
    return Boolean(arg) && !arg.startsWith("-") && !AWS_LOCAL_COMMANDS.has(arg);
  }
  if (name === "terraform" || name === "tofu") {
    return TERRAFORM_NETWORK_COMMANDS.has(arg);
  }
  if (name === "git") {
    return GIT_NETWORK_COMMANDS.has(arg);
  }
  if (isPackageManager(name) || isPythonPackageTool(name)) {
    return PACKAGE_NETWORK_COMMANDS.has(arg);
  }
  if (["node", "python", "python3", "deno", "bunx", "npx"].includes(name)) {
    return URL_PATTERN.test(command);
  }
  return false;
}
function rewrittenCommand(command) {
  return `ONECLI_CURSOR_AUTOSOURCED=1; . "$HOME/.onecli/env.sh" && ${command}`;
}
function writeRewrite(command) {
  process.stdout.write(
    JSON.stringify({
      permission: "allow",
      updated_input: {
        command: rewrittenCommand(command)
      }
    })
  );
}
async function main() {
  const input = await readHookInput();
  const toolInput = input.tool_input;
  const command = toolInput?.command;
  if (input.tool_name !== "Shell" || typeof command !== "string") return;
  if (isOnecliProxy(process.env.HTTPS_PROXY)) return;
  if (!existsSync(onecliPaths().envPath)) return;
  if (isAlreadyHandled(command)) return;
  if (!shouldRewrite(command)) return;
  writeRewrite(command);
}
main().catch((err) => {
  process.stderr.write(
    `onecli: pre-tool-use hook error: ${err instanceof Error ? err.message : String(err)}
`
  );
});
