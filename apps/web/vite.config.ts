import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@xdarkoy/schema": path.resolve(__dirname, "../../packages/schema/src/index.ts"),
      "@xdarkoy/designer": path.resolve(__dirname, "../../packages/designer/src/index.ts"),
    },
  },
  // strictPort: fail instead of silently picking another port — keeps the
  // dev origin at :5173 so it stays within the backend's CORS allowlist.
  server: { port: 5173, strictPort: true, open: true },
});
