import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build` makes dist/ for the Opus server to serve.
// `npm run build:preview` makes one self-contained HTML file you can open anywhere.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "preview" ? [viteSingleFile()] : [])],
  build: { outDir: mode === "preview" ? "dist-preview" : "dist", target: "es2020" },
  server: { proxy: { "/api": "http://127.0.0.1:8787" }, fs: { allow: [".."] } },
}));
