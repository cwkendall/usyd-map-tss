import { defineConfig } from "vite";

// GitHub Pages serves this project at https://<user>.github.io/usyd-map-tss/
// so assets must be referenced under that base path. For local dev/preview the
// base is "/". Override with BASE_PATH env if the repo name changes.
const base = process.env.BASE_PATH ?? "/usyd-map-tss/";

export default defineConfig(({ command }) => ({
  base: command === "build" ? base : "/",
  build: {
    target: "es2022",
    sourcemap: true,
  },
}));
