import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
  },
  preview: {
    host: "127.0.0.1",
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      reporter: ["text", "json-summary"],
    },
  },
});
