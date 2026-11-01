```yaml
id: task-codespaces-live-stack
type: task
title: Run the live stack in GitHub Codespaces with the console reaching the services through forwarded URLs
status: open
review: proposed
provenance:
  conversationId: devcontainer-live-stack
  sourceRef: 95c5dff4cf00f514d0354f18696dd767033021e8
  contentHash: 95c5dff4cf00f514d0354f18696dd767033021e8
  timestamp: 2026-11-01T01:00:00Z
  confidence: 0.8
createdAt: 2026-11-01T01:00:00Z
updatedAt: 2026-11-01T01:00:00Z
```
# Task: run the live stack in GitHub Codespaces

Split from [[task-devcontainer-live-stack]] by the project owner on 2026-11-01 ("running in codespaces needs its own
task"). Builds on [[task-devcontainer-stack-startup]] and [[artifact-setup-codespaces]].

The console calls the collateral services from the browser (`console/src/domain/liveApi.ts`), defaulting to
`http://localhost:8001` / `http://localhost:8002` unless `VITE_SERVICE_A_URL` / `VITE_SERVICE_B_URL` are set. In a
Codespace the browser reaches a forwarded port at `https://<codespace-name>-8001.app.github.dev`, so the defaults do
not resolve. Open questions: how the URLs are derived at start-up (`CODESPACE_NAME`,
`GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`), port visibility (private ports need the GitHub auth cookie, which a
cross-origin fetch and the SSE stream at `/api/v1/events` may not send), and CORS on the services for the
`*.app.github.dev` origin.
