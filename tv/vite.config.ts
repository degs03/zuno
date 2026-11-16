import legacy from "@vitejs/plugin-legacy";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/*
 * Zuno TV targets LG webOS 3.5, whose web engine is Chromium 38: no ES2015 syntax guarantees,
 * no fetch, no CSS custom properties. plugin-legacy runs Babel + core-js over the whole bundle
 * (dependencies included) and `renderModernChunks: false` drops the ES-module copy the TV
 * could never load. `es-check es5` in `npm run tv:build` is the gate that proves it worked.
 */
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  publicDir: "webos",
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  plugins: [
    legacy({
      targets: ["chrome >= 38"],
      renderModernChunks: false,
      modernPolyfills: false,
      polyfills: true,
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    cssTarget: "chrome38",
    assetsInlineLimit: 0,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  server: { port: 5181, strictPort: true },
});
