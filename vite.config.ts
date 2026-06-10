import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";
import { notBundle } from "vite-plugin-electron/plugin";

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
        vite: {
          build: {
            rolldownOptions: {
              external: [/^taglib-wasm(?:\/.*)?$/],
            },
          },
          plugins: [notBundle()],
        },
      },
      preload: {
        input: path.join(__dirname, "electron/preload.ts"),
        vite: {
          build: {
            rolldownOptions: {
              output: {
                entryFileNames: "[name].cjs",
                chunkFileNames: "[name].cjs",
                assetFileNames: "[name].[ext]",
              },
            },
          },
        },
      },
    }),
  ],
  build: {
    target: "es2022",
  },
});
