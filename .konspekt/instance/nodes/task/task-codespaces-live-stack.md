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
updatedAt: 2026-11-02T23:50:07Z
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

## Progress — 2026-11-01: tunnel first

The project owner chose to reach the Codespace from the Windows host through `gh codespace ports forward` before
working on the forwarded-URL questions above. Result: `live-e2e.sh check`, run on Windows against a six-port tunnel,
passed both live specs (runbook §10, 2026-11-01 Codespace entry). Findings:

- Only ports in `forwardPorts` can be tunnelled; 8201, 8202 and 8300 were added (`cbaf7ed`) so `check`'s health
  precondition passes over the tunnel.
- `gh` 2.83.2 rejected re-forwarding a port with `400: Bad Request`, surviving restart and full rebuild; `gh` 2.103.3
  does not. Minimum `gh` version for this path: 2.103.3 (lowest version verified, not the lowest that works).
- The image has no sshd, so `gh codespace ssh` fails.

Still open: the browser-in-Codespaces path (console calling `*.app.github.dev` URLs, port visibility, CORS).

## Progress — 2026-11-02: same-origin proxy

Proposed approach for the browser path: [[wp-adr-console-same-origin-proxy]]. With `VITE_SERVICE_PROXY=1`
(devcontainer `containerEnv`) the console calls `/svc/A` and `/svc/B` on its own origin and the Vite server forwards
them to 8001 / 8002, so the browser needs only 5173 and the URL-derivation, private-port cookie and CORS questions do
not arise. Verified on Windows against stub services on 8001 / 8002: JSON requests proxied for both parties, SSE events
arrived unbuffered at the stub's 400 ms interval; all 46 console unit tests pass. Not yet verified: the live flow in a
browser on a running codespace (needs a rebuild so `containerEnv` applies).

After the rebuild (2026-11-02) the codespace was at `e4f86ee` with `VITE_SERVICE_PROXY=1`, but only the four Besu
containers were running; `live-e2e.sh status` showed 8300, 8201, 8202, 8001, 8002 and 5173 not responding, and
`stack.log` held only the pre-rebuild run. Why `postStartCommand` did not bring the rest of the stack up is not yet
known: `gh codespace logs` fails without an SSH server in the image. The `sshd` devcontainer feature was added so the
creation log and in-codespace commands are reachable through `gh codespace logs` / `gh codespace ssh`.
