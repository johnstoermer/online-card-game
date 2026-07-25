import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
    assetsInlineLimit: 4096
  },
  server: {
    port: 5173
  }
});
