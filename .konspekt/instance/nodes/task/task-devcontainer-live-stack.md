```yaml
id: task-devcontainer-live-stack
type: task
title: Stand up the full live e2e stack in the devcontainer/Codespaces as a browser-clickable environment
status: resolved
review: accepted
provenance:
  conversationId: ci-live-e2e-stack
  sourceRef: ni:///sha-256;RyMRvRd3KmnPb5uY5MVY8D6TLw_YxMgsCIdmvVRd15w
  timestamp: 2026-10-30T01:30:09Z
  confidence: 0.7
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: e139780d8f166473110d16140fa7d1113340e17b
    contentHash: e139780d8f166473110d16140fa7d1113340e17b
createdAt: 2026-10-30T01:30:09Z
updatedAt: 2026-11-01T00:40:00Z
```
# Task: run the full live e2e stack in the devcontainer/Codespaces as a browser-clickable environment

Give the engineer a persistent, browser-reachable live stack from the devcontainer
(`.devcontainer/devcontainer.json`: Ubuntu 24.04, `docker-in-docker`, JDK 21, Node LTS), which runs both locally (VS
Code Dev Containers) and in GitHub Codespaces. `docker-in-docker` runs the Besu `docker compose` network and the
backend inside the container with a shared localhost, so the docker-in-a-container reachability problem does not
apply. The engineer drives the collateral flow (issue → agree → propose → accept → pledge/transfer, i.e. post and
pay) by hand through the console UI; this is the manual counterpart to the automated Playwright live specs
(`console/e2e/live.spec.ts`).

Current gaps (observed 2026-10-30):

- `postStartCommand` starts only `besu/start-network.sh` and `console/serve.sh`. It does not deploy the contracts or
  run `orchestrate.mjs`, so the store, gateways and services are not up and the live flow cannot be driven. The local
  bring-up `scripts/live-e2e.sh up` already performs deploy-if-needed + `orchestrate.mjs` + health checks with
  stop-and-replace, and runs inside the devcontainer; wire it (or equivalent) into start-up.
- The console SPA calls the services directly from the browser (`console/src/domain/liveApi.ts`: default
  `http://localhost:8001` / `http://localhost:8002`, SSE at `/api/v1/events`). `forwardPorts` forwarded 5173 and the
  Besu RPC ports but not 8001/8002, so the browser could not reach the services. **Done** in commit `d4b0fcb`
  (8001/8002 forwarded); not yet verified inside a running devcontainer.
- In Codespaces (cloud), a forwarded port is reached at `https://<name>-8001.app.github.dev`, not `localhost:8001`, so
  the browser default does not resolve to the Codespace. Set `VITE_SERVICE_A_URL` / `VITE_SERVICE_B_URL` to the
  forwarded Codespaces URLs. In a local devcontainer, forwarded ports map to `localhost`, so the defaults work and
  only the `forwardPorts` entries are needed.

Scope: a push does not drive the flow; CI (`task-ci-live-e2e-stack`) runs the automated Playwright specs on a
throwaway stack, while this task provides a running, clickable environment for manual flows. Relates to
[[task-ci-live-e2e-stack]] and [[task-e2e-wiring]]; builds on [[artifact-setup-codespaces]],
[[artifact-live-console-wiring]] and [[artifact-e2e-runbook]].

## Resolution (2026-11-01)

The project owner resolved this task on 2026-11-01 after a run of `scripts/live-e2e.sh up` on the Windows host
(Docker Desktop), where the engineer drove the collateral flow by hand in the console. Nothing had been run inside
the devcontainer or a Codespace when it was resolved. At resolution these gaps were still open: `postStartCommand`
does not start the backend (deploy + `orchestrate.mjs`), the 8001/8002 forwarding (commit `d4b0fcb`) has not been
checked in a running devcontainer, and Codespaces still needs `VITE_SERVICE_A_URL` / `VITE_SERVICE_B_URL`.
