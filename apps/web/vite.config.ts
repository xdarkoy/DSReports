import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@reporting/schema": path.resolve(__dirname, "../../packages/schema/src/index.ts"),
      "@reporting/designer": path.resolve(__dirname, "../../packages/designer/src/index.ts"),
    },
  },
  server: { port: 5173, open: true },
});
