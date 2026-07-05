#!/usr/bin/env node
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { isOnecliProxy, onecliPaths, readHookInput } from "../shared/runtime.mjs";

const URL_PATTERN = /\b(?:https?:\/\/|ssh:\/\/|git@)/i;
const PACKAGE_NETWORK_COMMANDS = new Set([
  "add",
  "audit",
  "ci",
  "info",
  "install",
  "outdated",
  "publish",
  "search",
  "update",
  "view",
]);
const GIT_NETWORK_COMMANDS = new Set([
  "clone",
  "fetch",
  "ls-remote",
  "pull",
  "push",
  "remote",
  "submodule",
]);
const TERRAFORM_NETWORK_COMMANDS = new Set([
  "apply",
  "destroy",
  "get",
  "import",
  "init",
  "plan",
  "refresh",
]);
const AWS_LOCAL_COMMANDS = new Set(["configure", "help"]);

function splitCommandPrefix(command: string): { name: string; arg: string } {
  const trimmed = command.trimStart();
  const match = trimmed.match(/^([A-Za-z0-9_./-]+)(?:\s+([A-Za-z0-9_./:-]+))?/);
  if (!match) return { name: "", arg: "" };
  return {
    name: basename(match[1]),
    arg: match[2] || "",
  };
}

function isAlreadyHandled(command: string): boolean {
  return (
    command.includes(".onecli/env.sh") ||
    command.includes("ONECLI_CURSOR_AUTOSOURCED") ||
    command.includes("HTTPS_PROXY=") ||
    command.includes("https_proxy=")
  );
}

function isPackageManager(name: string): boolean {
  return ["npm", "pnpm", "yarn", "bun"].includes(name);
}

function isPythonPackageTool(name: string): boolean {
  return ["pip", "pip3"].includes(name);
}

function shouldRewrite(command: string): boolean {
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

function rewrittenCommand(command: string): string {
  return `ONECLI_CURSOR_AUTOSOURCED=1; . "$HOME/.onecli/env.sh" && ${command}`;
}

function writeRewrite(command: string): void {
  process.stdout.write(
    JSON.stringify({
      permission: "allow",
      updated_input: {
        command: rewrittenCommand(command),
      },
    })
  );
}

async function main(): Promise<void> {
  const input = await readHookInput();
  const toolInput = input.tool_input as { command?: unknown } | undefined;
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
    `onecli: pre-tool-use hook error: ${err instanceof Error ? err.message : String(err)}\n`
  );
});
