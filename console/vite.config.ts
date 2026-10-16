/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the built console also works when served from a sub-path or opened as static files.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173 },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test-setup.ts"], include: ["src/**/*.test.{ts,tsx}"] },
});
