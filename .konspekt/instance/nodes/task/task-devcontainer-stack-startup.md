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
updatedAt: 2026-11-01T19:34:00Z
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

## Progress (2026-11-01)

Commit `383a6f5`: `postCreateCommand` runs `scripts/live-e2e.sh build` (new subcommand, gap 3), `postStartCommand`
runs `scripts/live-e2e.sh up` in place of Besu plus `console/serve.sh` (gaps 1 and 4), `up` starts `orchestrate.mjs`
under `setsid`, and `mvnw` keeps LF endings. A fresh dev container created with `@devcontainers/cli` 0.90.0 ran the
build and the start-up and passed all five health checks plus console `HTTP 200`; the stack was still running after
the start command ended (`docs/runbook-e2e.md` section 10). Open: gap 2, port forwarding to a host browser through
VS Code, with one flow driven in the console.

## Progress (2026-11-01, gap 2)

Gap 2 is closed without an IDE. `forwardPorts` is applied only by a dev-container client (VS Code, Codespaces), so
commit `c9e0983` adds `appPort` (5173, 8001, 8002 published on `127.0.0.1`) and runs the console dev server on
`CONSOLE_HOST=0.0.0.0` inside the container; this followed the project owner's choice of the non-IDE option. The
Playwright config takes `E2E_BASE_URL` to test an already-served console. A fresh container from `c9e0983` started
the stack, and from the Windows host both live specs passed against the container's console and services
(`flow-im-margin-call-pledge`, `flow-vm-margin-call-transfer`), with both parties showing the calls `settled`
(`docs/runbook-e2e.md` section 10). Every condition in "Done when" is met; resolving the task is the project owner's
decision.
