import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["hooks/src/session-start.mts", "hooks/src/session-end.mts"],
  format: ["esm"],
  outDir: "hooks",
  outExtension: () => ({ js: ".mjs" }),
  bundle: true,
  splitting: false,
  noExternal: [/.*/],
  sourcemap: false,
  dts: false,
  clean: false,
  target: "node20",
});
