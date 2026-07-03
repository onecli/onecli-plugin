import { defineConfig, type Options } from "tsup";

// Each plugin directory must stay self-contained after installation (both
// Claude Code and Codex copy only the plugin directory into their cache), so
// src/shared is bundled into every output file.
function bundle(entry: string[], outDir: string): Options {
  return {
    entry,
    outDir,
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    bundle: true,
    splitting: false,
    noExternal: [/.*/],
    sourcemap: false,
    dts: false,
    clean: false,
    target: "node20",
  };
}

export default defineConfig([
  bundle(
    ["src/claude/session-start.mts", "src/claude/session-end.mts"],
    "plugins/claude/hooks"
  ),
  bundle(
    [
      "src/codex/session-start.mts",
      "src/codex/pre-tool-use.mts",
      "src/codex/session-end.mts",
    ],
    "plugins/codex/hooks"
  ),
  bundle(["src/codex/onecli-codex-env.mts"], "plugins/codex/bin"),
]);
