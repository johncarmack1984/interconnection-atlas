# ADR 0001 — Publishable library build

Status: accepted · 2026-06-23

## Context

The package is the product (`InterconnectionAtlas` is the exported module; `examples/` is one consumer). Until now `package.json` resolved `main`/`module`/`types`/`exports` to the raw `./src/index.ts` and shipped `files: ["src"]`, so there was no compiled artifact and no `.d.ts`. That works for the in-repo example (a Vite alias maps `interconnection-atlas` → `src/index.ts`) but is not cleanly installable from a registry: a consumer would receive uncompiled TSX and have to configure their own transpile. There was also no `LICENSE` file despite a declared MIT license.

## Decision

- **Build with `tsup`** (esbuild + `rollup-plugin-dts`) emitting `dist/index.js` + `dist/index.d.ts`, sourcemaps on. `tsup` is a thin, well-maintained config over esbuild and matches the small single-entry surface.
- **ESM-only** (`format: ["esm"]`). The sole runtime dependency, d3 v7, is ESM-only, so a CJS build would be unusable in practice; emitting one would imply false compatibility.
- **`d3` stays a runtime `dependency`; `react`/`react-dom` stay `peerDependencies`.** d3 is an implementation detail consumers should not have to install; React must dedupe against the host app, so it is external and peer. All three are marked `external` in the build so none are bundled.
- **`exports` map points at `dist`**, `types` first; `files: ["dist"]` (npm includes `LICENSE` + `README.md` automatically). `prepublishOnly` builds, so a stale/missing `dist` can never be published.
- **Releases are tag-driven and gated.** `.github/workflows/release.yml` runs on `v*` tags: it type-checks, tests, and builds every time, but only publishes (`npm publish --provenance --access public`) when a `NPM_TOKEN` secret is present. The library is therefore release-ready without being auto-published.

## Consequences

- A consumer can `npm install interconnection-atlas` and get compiled ESM + types; React stays a single deduped copy.
- CJS-only / non-bundler consumers are unsupported — acceptable given the d3 v7 constraint and the React-19/Vite-era target audience.
- The in-repo example is unaffected: it still imports from `src/` through the Vite alias, so source edits hot-reload and the build path is orthogonal to local development.
- Enabling real publishing is a one-time action: add the `NPM_TOKEN` repo secret and push a `v*` tag.
