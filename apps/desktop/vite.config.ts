import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";

const root = path.resolve(__dirname, "../..");

export default defineConfig({
  root: ".",
  base: "./",
  publicDir: "public",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@minarvabiz/utils": path.resolve(root, "packages/utils/src/index.ts"),
      "@minarvabiz/types": path.resolve(root, "packages/types/src/index.ts"),
      "@minarvabiz/billing": path.resolve(root, "packages/billing/src/index.ts"),
      "@minarvabiz/business-logic": path.resolve(root, "packages/business-logic/src/index.ts"),
      "@minarvabiz/database": path.resolve(root, "packages/database/src/index.ts"),
      "@minarvabiz/licensing": path.resolve(root, "packages/licensing/src/index.ts"),
      "@minarvabiz/sync": path.resolve(root, "packages/sync/src/index.ts"),
      "@minarvabiz/ui": path.resolve(root, "packages/ui/src/index.ts"),
      "@minarvabiz/validation": path.resolve(root, "packages/validation/src/index.ts"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [root] },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "sql.js"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 3000,
    commonjsOptions: { include: [/node_modules/] },
  },
});
