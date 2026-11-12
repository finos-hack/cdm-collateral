/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Same-origin proxy to the collateral services (task-codespaces-live-stack). With VITE_SERVICE_PROXY=1 the console calls
// /svc/A/..., /svc/B/... and /svc/T/... on its own origin and the dev (or preview) server forwards them to 8001 / 8002 / 8003 on the
// machine it runs on (src/domain/liveApi.ts serviceUrl). The browser then needs only the console port forwarded: no
// per-port *.app.github.dev URLs, no cross-origin auth cookie on private Codespaces ports, no CORS. The SSE stream at
// /api/v1/events passes through the proxy unbuffered.
const serviceProxy = {
  "/svc/A": { target: "http://localhost:8001", rewrite: (p: string) => p.replace(/^\/svc\/A/, "") },
  "/svc/B": { target: "http://localhost:8002", rewrite: (p: string) => p.replace(/^\/svc\/B/, "") },
  // The triparty agent BANK-T (wp-adr-triparty-terms-profile).
  "/svc/T": { target: "http://localhost:8003", rewrite: (p: string) => p.replace(/^\/svc\/T/, "") },
  // The market operator's oracle service (operator console, flow-revaluation-top-up).
  "/svc/oracle": { target: "http://localhost:8100", rewrite: (p: string) => p.replace(/^\/svc\/oracle/, "") },
};

// base "./" so the built console also works when served from a sub-path or opened as static files.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173, proxy: serviceProxy },
  preview: { proxy: serviceProxy },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test-setup.ts"], include: ["src/**/*.test.{ts,tsx}"] },
});
