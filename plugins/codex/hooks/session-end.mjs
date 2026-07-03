#!/usr/bin/env node

// src/codex/session-end.mts
import { unlinkSync } from "fs";

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

// src/codex/session-end.mts
function removeEnvFile() {
  try {
    unlinkSync(onecliPaths().envPath);
  } catch {
  }
}
removeEnvFile();
process.stderr.write("onecli: gateway session cleaned up.\n");
