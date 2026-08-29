import { defineConfig } from "vite";
import path from "path";

/**
 * Vite config for the desktop renderer.
 * Install: pnpm add -D vite @vitejs/plugin-react electron electron-builder
 * then: pnpm --filter @minarvabiz/desktop dev
 */
export default defineConfig({
  root: ".",
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
