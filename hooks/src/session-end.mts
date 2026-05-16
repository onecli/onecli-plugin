import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENV_SH_PATH = join(homedir(), ".onecli", "env.sh");
const SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

function removeEnvFile(): void {
  try {
    unlinkSync(ENV_SH_PATH);
  } catch {
    // already gone
  }
}

function removeBashEnv(): void {
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
    // settings file missing or malformed
  }
}

removeEnvFile();
removeBashEnv();
process.stderr.write("onecli: gateway session cleaned up.\n");
