import { defineConfig } from "tsup"

// Library build. ESM-only on purpose: the sole runtime dependency, d3 v7, ships
// ESM-only, so a CJS build would be unusable anyway. React / react-dom / d3 are
// left external (peers + runtime dep) so consumers dedupe their own copies.
//
// JS only — declarations come from `tsc -p tsconfig.build.json`. tsup's DTS step
// is rollup-plugin-dts, which needs the TypeScript JS compiler API (`ts.sys`);
// TypeScript 7's native port no longer exposes it, and rollup-plugin-dts caps its
// peer range at TS 6. Revisit `dts: true` once it supports TS 7.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  sourcemap: true,
  treeshake: true,
  clean: true,
  target: "es2020",
  external: ["react", "react-dom", "d3"],
})
