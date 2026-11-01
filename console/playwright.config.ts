import { defineConfig } from "@playwright/test";

// CHROMIUM_PATH lets environments with a preinstalled browser (Codespaces image, cloud sessions) skip the download.
// E2E_BASE_URL points the tests at a console that is already served (e.g. the dev container's dev server published on
// http://localhost:5173, task-devcontainer-stack-startup); Playwright then starts no preview of its own. Unset, the
// tests build and serve a local preview on 4173 as before.
const externalBaseURL = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: externalBaseURL ?? "http://localhost:4173", launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
  webServer: externalBaseURL
    ? undefined
    : { command: "npm run build && npm run preview -- --port 4173 --strictPort", port: 4173, reuseExistingServer: true, timeout: 120_000 },
});
