// hooks/src/session-end.mts
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";
var ENV_SH_PATH = join(homedir(), ".onecli", "env.sh");
var SETTINGS_PATH = join(homedir(), ".claude", "settings.json");
function removeEnvFile() {
  try {
    unlinkSync(ENV_SH_PATH);
  } catch {
  }
}
function removeBashEnv() {
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
    const env = settings.env;
    if (!env || env.BASH_ENV !== ENV_SH_PATH) return;
    delete env.BASH_ENV;
    if (Object.keys(env).length === 0) {
      delete settings.env;
    }
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
  } catch {
  }
}
removeEnvFile();
removeBashEnv();
process.stderr.write("onecli: gateway session cleaned up.\n");
