import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// Resolve the library from source (mirrors examples/vite.config.ts) so tests
// exercise the same `src/` the demo and consumers do — no build step required.
const fromHere = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  // Automatic JSX through esbuild keeps the test toolchain plugin-free: the
  // @vitejs/plugin-react dep lives in the example workspace, not the library root.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "interconnection-atlas": fromHere("./src/index.ts"),
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "examples/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "examples/scripts/.cache/**"],
  },
})
