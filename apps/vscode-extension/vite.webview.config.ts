import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Build the React webview into ./media so the extension can load it.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@reporting/schema": path.resolve(__dirname, "../../packages/schema/src/index.ts"),
      "@reporting/designer": path.resolve(__dirname, "../../packages/designer/src/index.ts"),
    },
  },
  build: {
    outDir: "media",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "src/webview/index.html"),
      output: {
        entryFileNames: "designer.js",
        chunkFileNames: "designer-[name].js",
        assetFileNames: "designer.[ext]",
      },
    },
  },
});
