import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"

// Resolve the library from source so edits to ../src hot-reload with no build.
const fromHere = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "interconnection-atlas": fromHere("../src/index.ts"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    // Pinned uncommon high port (avoids the usual 5173/3000 collisions).
    port: 47654,
    strictPort: true,
    open: false,
  },
})
