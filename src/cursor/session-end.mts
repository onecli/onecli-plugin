#!/usr/bin/env node
import { unlinkSync } from "node:fs";
import { onecliPaths } from "../shared/runtime.mjs";

function removeEnvFile(): void {
  try {
    unlinkSync(onecliPaths().envPath);
  } catch {
    // Missing cleanup target is already clean.
  }
}

removeEnvFile();
process.stderr.write("onecli: gateway session cleaned up.\n");
