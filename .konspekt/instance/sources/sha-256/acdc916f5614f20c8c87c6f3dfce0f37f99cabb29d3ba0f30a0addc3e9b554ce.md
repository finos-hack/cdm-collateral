## User

restore yesterday's session - it lists the binding task

## Maintainer

Binding: the last binding in yesterday's transcript was `task-codespaces-live-stack`; this conversation binds to it.
Next work (the browser-in-Codespaces path): (1) derive `VITE_SERVICE_A_URL` / `_B_URL` from `CODESPACE_NAME` /
`GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`, (2) the private-port auth cookie on cross-origin fetch and the SSE stream
at `/api/v1/events`, (3) CORS on the services for `*.app.github.dev`.
Open items: 1. Starting point — (a) read `liveApi.ts` and the services' CORS config and plan all three, (b) begin with
the cookie question by starting the Codespace and testing one cross-origin fetch, (c) other.

## User

go

## Maintainer

Implemented a same-origin proxy: with `VITE_SERVICE_PROXY=1` (devcontainer `containerEnv`) the console calls
`/svc/A/...` and `/svc/B/...` on its own origin and the Vite dev/preview server forwards them to 8001 / 8002
(`console/vite.config.ts`, `serviceUrl` in `console/src/domain/liveApi.ts`). The browser needs only 5173, so the three
open questions (per-port URLs, cross-origin auth cookie on private ports, CORS) do not arise. Verified locally against
stub services: JSON on /svc/A and /svc/B proxied, SSE events arrived unbuffered at 400 ms intervals; 46 console unit
tests pass. Not yet verified in a running Codespace.
