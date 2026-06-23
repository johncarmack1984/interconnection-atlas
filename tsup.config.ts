import { defineConfig } from "tsup"

// Library build. ESM-only on purpose: the sole runtime dependency, d3 v7, ships
// ESM-only, so a CJS build would be unusable anyway. React / react-dom / d3 are
// left external (peers + runtime dep) so consumers dedupe their own copies.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  treeshake: true,
  clean: true,
  target: "es2020",
  external: ["react", "react-dom", "d3"],
})
