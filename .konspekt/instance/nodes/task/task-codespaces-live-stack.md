```yaml
id: task-codespaces-live-stack
type: task
title: Run the live stack in GitHub Codespaces with the console reaching the services through forwarded URLs
status: resolved
review: accepted
provenance:
  conversationId: devcontainer-live-stack
  sourceRef: 95c5dff4cf00f514d0354f18696dd767033021e8
  contentHash: 95c5dff4cf00f514d0354f18696dd767033021e8
  timestamp: 2026-11-01T01:00:00Z
  confidence: 0.8
createdAt: 2026-11-01T01:00:00Z
updatedAt: 2026-11-03T03:05:59Z
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

## Finding — 2026-11-03: stale Docker networking state blocks Besu peering

After the sshd rebuild (`b46022a`), `gh codespace ssh` worked (`gh codespace logs` still exited 255; the creation log
was read from `/workspaces/.codespaces/.persistedshare/creation.log`). `postStartCommand` failed with `besu did not
produce a block within 120 s`. All four validators were in QBFT round changes (round 8 after ~17 min) with 0 peers.
Cause, observed in the codespace (Docker 29.9.2, iptables 1.8.10 legacy):

- two DOWN bridges `br-17073ca2b38b`, `br-9c19116227d8` from earlier `besu_besu` networks, each holding
  `172.28.0.1/24`, with `linkdown` routes for `172.28.0.0/24` ahead of the live `br-18e880927686`. Host-to-container
  traffic (published RPC ports) timed out. Deleting the two bridges restored host RPC (block `0x841`).
- the `raw` table `PREROUTING` chain still holds Docker's per-network rules for those bridges
  (`-d 172.28.0.1x/32 ! -i br-<old> -j DROP`), which drop every packet to the Besu containers arriving on the live
  bridge, so validator-to-validator TCP fails. Not yet removed (the agent's permission check denied the iptables
  change).

How the stale networks survive a full rebuild is not yet known.

Recovery (the project owner ran the iptables deletions in the codespace terminal): the eight stale `raw` DROP rules
and two stale `nat` `POSTROUTING -s 172.28.0.0/24 ! -o br-<old> -j MASQUERADE` rules were deleted. The MASQUERADE
rules matched container-to-container traffic on the live bridge and rewrote its source to `172.28.0.1`; after their
removal and a restart of the four Besu containers, peering recovered and blocks resumed (`0x841` → `0x847` within
30 s). `live-e2e.sh up` then brought the whole stack up. Through the proxy inside the codespace:
`/svc/B/api/v1/context` and `/svc/A/api/v1/health` return the service responses, and `/svc/B/api/v1/events` with
`Accept: text/event-stream` returns `text/event-stream` and holds the connection open, matching the direct service.
Pending: the browser check on the forwarded 5173 URL.

## Progress — 2026-11-03: clean codespace reconstruction

`besu/clean-stale-network.sh` (`e167324`) now runs before Besu starts and removes leftover bridges and the iptables
rules that name them; `start_besu` waits for the block height to advance. Verified in the old codespace with a seeded
leftover bridge and rule. A new codespace `clean-try-vgx4wrxppjcpp9r` (display name `clean_try`, `standardLinux32gb`,
`e2e-wiring` at `3e16dee`) was created at the project owner's request. With no manual step, `postCreateCommand` and
`postStartCommand` both exited 0; the new chain advanced `0x0 -> 0x2`; the cleanup script found nothing to remove; all
six ports report healthy; the console proxy serves `/svc/A`, `/svc/B` and the SSE stream. Pending: the browser check
on the forwarded 5173 URL, then deletion of the old codespace `automatic-fiesta-7rgqw5gv5vfxw4j` (the project owner's
choice).

## Result — 2026-11-03: browser path verified; resolved

In the browser, on the private forwarded console URL of `clean_try`
(`https://clean-try-vgx4wrxppjcpp9r-5173.app.github.dev`), the project owner opened the secured-party console
(`/#/live/B`) and issued an IM call ($5,000,000, B to A; observed in service B's state through the proxy as
`issued`), then opened the pledgor console (`/#/live/A`) and responded; both worked ("node A works, looks good").
The console reached both services and the SSE stream through the same-origin proxy with only 5173 forwarded and
private. The codespace also survived a stop and restart with the stack up and the ports still forwarded.

Accepted and resolved by the project owner (source `5c190e38fe670e7310d923d91fea67ab10d39ab9`), together with [[wp-adr-console-same-origin-proxy]]. The
old codespace `automatic-fiesta-7rgqw5gv5vfxw4j` was deleted at the project owner's request.
