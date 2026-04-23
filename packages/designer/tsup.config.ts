import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom"],
  loader: { ".css": "copy" },
  injectStyle: false,
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
