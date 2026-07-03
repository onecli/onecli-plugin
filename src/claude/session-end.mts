import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { onecliPaths, userHome } from "../shared/runtime.mjs";

const paths = onecliPaths();
const SETTINGS_PATH = join(userHome(), ".claude", "settings.json");

function removeEnvFile(): void {
  try {
    unlinkSync(paths.envPath);
  } catch {
    // already gone
  }
}

function removeBashEnv(): void {
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
    const env = settings.env;
    if (!env || env.BASH_ENV !== paths.envPath) return;

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
