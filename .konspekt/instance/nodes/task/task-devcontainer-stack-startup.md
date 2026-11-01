```yaml
id: task-devcontainer-stack-startup
type: task
title: Build and start the full live stack automatically when the devcontainer is created and started
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
# Task: build and start the full live stack automatically in the devcontainer

Follow-up to [[task-devcontainer-live-stack]] (resolved 2026-11-01 with these gaps open). Scope is the local
devcontainer (VS Code Dev Containers); Codespaces-specific work is [[task-codespaces-live-stack]].

Gaps, as observed in `.devcontainer/devcontainer.json` on 2026-11-01:

1. `postStartCommand` (`bash besu/start-network.sh; bash console/serve.sh`) does not deploy the contracts or run
   `orchestrate.mjs`, so the store, gateways and services are not running after a container start.
2. The 8001/8002 forwarding (commit `d4b0fcb`) has not been checked in a running devcontainer from a host browser.
3. `postCreateCommand` runs only `npm --prefix console ci`. `scripts/live-e2e.sh up` stops with
   `missing services/collateral/target/collateral-service.jar` without the one-time build of
   [[artifact-e2e-runbook]] section 3 (cdm-ext install, service jar, `npm ci` in contracts, gateway, store, console).
4. `console/serve.sh` (production preview, `--strictPort`) and the `orchestrate.mjs` dev server both use 5173.

Done when: creating the container runs the one-time build, starting it runs `scripts/live-e2e.sh up` and leaves
the stack healthy, and a host browser drives one flow through the forwarded 5173, 8001 and 8002.
