import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The React app lives in src/web and is built into dist/public, which the Fastify
// server serves in production. In dev, Vite runs on 5173 and proxies API calls to
// the Fastify server on 8000 (same-origin from the browser's perspective).
export default defineConfig({
  root: "src/web",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // API_PROXY lets you run only the UI against another backend, e.g.
      // API_PROXY=https://userelayflow.com npx vite
      "/api": { target: process.env.API_PROXY || "http://localhost:8000", changeOrigin: true, secure: true },
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist/public", import.meta.url)),
    emptyOutDir: true,
  },
});
