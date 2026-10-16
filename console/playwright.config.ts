import { defineConfig } from "@playwright/test";

// CHROMIUM_PATH lets environments with a preinstalled browser (Codespaces image, cloud sessions) skip the download.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:4173", launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
  webServer: { command: "npm run build && npm run preview -- --port 4173 --strictPort", port: 4173, reuseExistingServer: true, timeout: 120_000 },
});
