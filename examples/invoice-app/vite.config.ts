import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Resolve the workspace packages from source for instant HMR. Once
// @xdarkoy/* is installed from npm in a standalone project, delete these
// aliases — the bare imports resolve from node_modules.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@xdarkoy/schema": path.resolve(__dirname, "../../packages/schema/src/index.ts"),
      "@xdarkoy/designer": path.resolve(__dirname, "../../packages/designer/src/index.ts"),
    },
  },
  server: { port: 5174, strictPort: true, open: true },
});
