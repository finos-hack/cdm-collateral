```yaml
id: wp-adr-console-same-origin-proxy
kind: decision
timestamp: 2026-11-02T23:15:24Z
review: accepted
provenance:
  conversationId: 988875b8-4ec1-4971-aceb-47c0f58236c5
  sourceRef: 11d6ad3ea1a0518924d73887fa242027bcf2ddd1
  contentHash: 11d6ad3ea1a0518924d73887fa242027bcf2ddd1
  timestamp: 2026-11-02T23:15:24Z
  confidence: 0.7
createdAt: 2026-11-02T23:15:24Z
updatedAt: 2026-11-06T21:48:08Z
```
# ADR: The console reaches the collateral services through a same-origin proxy in the dev container

In the dev container (local and GitHub Codespaces) the console calls the collateral services on its own origin at
`/svc/A/...` and `/svc/B/...`; the Vite dev and preview servers forward those requests to 8001 and 8002 on the
machine they run on. The dev container enables this with `VITE_SERVICE_PROXY=1`. Outside the dev container the console
keeps calling `http://localhost:8001` / `http://localhost:8002` directly, and an explicit `VITE_SERVICE_A_URL` /
`VITE_SERVICE_B_URL` takes precedence over both.

**Context.** In a codespace the browser reaches each forwarded port at its own
`https://<codespace-name>-<port>.app.github.dev` origin. Calling the services directly would require deriving those
URLs at start-up, sending the GitHub auth cookie on cross-origin requests and the SSE stream to private ports, and
CORS for the `*.app.github.dev` origin.

**Consequences.** The browser needs only the console port (5173) forwarded and visible. The services keep their
current `Access-Control-Allow-Origin: *`, which the proxied path does not use. A static build of the console served
without the Vite server does not have the proxy; it uses the direct URLs. Rejected alternative: per-port URLs derived
from `CODESPACE_NAME` / `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`, which leaves the private-port cookie and CORS
questions open.

Accepted by the project owner on 2026-11-03 (source `5c190e38fe670e7310d923d91fea67ab10d39ab9`) after the browser check on the clean codespace.
