// src/claude/session-end.mts
import { readFileSync as readFileSync2, unlinkSync, writeFileSync as writeFileSync2 } from "fs";
import { join as join2 } from "path";

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

// src/claude/session-end.mts
var paths = onecliPaths();
var SETTINGS_PATH = join2(userHome(), ".claude", "settings.json");
function removeEnvFile() {
  try {
    unlinkSync(paths.envPath);
  } catch {
  }
}
function removeBashEnv() {
  try {
    const settings = JSON.parse(readFileSync2(SETTINGS_PATH, "utf-8"));
    const env = settings.env;
    if (!env || env.BASH_ENV !== paths.envPath) return;
    delete env.BASH_ENV;
    if (Object.keys(env).length === 0) {
      delete settings.env;
    }
    writeFileSync2(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
  } catch {
  }
}
removeEnvFile();
removeBashEnv();
process.stderr.write("onecli: gateway session cleaned up.\n");
