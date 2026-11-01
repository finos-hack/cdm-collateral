# Running the prototype environment in GitHub Codespaces

For the prototype in [`../architecture/README.md`](../architecture/README.md). A codespace is a Linux machine in
GitHub's cloud, opened in the browser (or in VS Code), built from this repository's dev container definition
[`.devcontainer/devcontainer.json`](../.devcontainer/devcontainer.json). It needs nothing installed on your own
machine. The Windows install ([`setup-windows.md`](setup-windows.md)) remains for working locally.

**What the codespace contains:** Ubuntu 24.04, Docker (Docker-in-Docker), Java 21 (Maven through the wrapper `cdm-ext/mvnw`), Python 3.12 (documentation scripts), Node.js LTS, and the four-node
QBFT Besu network from [`../besu/`](../besu/). When the container is created it runs the one-time build
(`bash scripts/live-e2e.sh build`: Node dependencies, the `cdm-ext` install and the collateral service jar). Every time
it starts it runs `bash scripts/live-e2e.sh up`, which starts the Besu network, deploys the contracts if they are not
deployed, and starts the store, gateways, services and the console dev server on 5173
([`runbook-e2e.md`](runbook-e2e.md) section 4). In a codespace the console does not yet reach the services: see
section 4 below.

**Tested** (2026-10-16): `start-network.sh` with the `docker` command replaced by a native Besu 26.9.0 binary (Java 25,
Linux): it generated the genesis and four keys, gave each node its key and wrote `besu/.env`; a second run reused
them; four nodes started from those files reached the same blocks, each with 3 peers and 4 validators
(`check-network.sh`). The dev container CLI 0.80.0 read the configuration and resolved its three features. **Run in
a real codespace** by the project owner on 2026-10-16 (4-core machine, branch `main`): the codespace built, the
network started on its own, and `check-network.sh` showed the same block (`0xd`) on all four nodes, 3 peers and four
validators.

## 1. Create the codespace

Use a desktop browser, signed in to GitHub. Either:

- **Direct link:** open https://codespaces.new/denisurusov/cdm-collateral — it shows the "Create codespace" options
  page; or
- **From the repository page:** open https://github.com/denisurusov/cdm-collateral. Above the file list, on the right,
  is a green **`<> Code`** button. Click it; the panel that opens has two tabs, **Local** and **Codespaces**. Choose
  **Codespaces**, then the **…** menu at the top right of that tab → **New with options…**.

On the options page:

1. Branch `main`; machine type **4-core** (16 GB memory) — the dev container asks for at least 4 cores and 16 GB, as
   four Besu nodes plus the services need about that much.
2. **Create codespace.** A VS Code editor opens in the browser. The first build takes several minutes; later starts
   are faster.

To reopen it later: https://github.com/codespaces lists your codespaces.

Free allowance for personal accounts (check GitHub's billing page for current figures): reported as 120 core-hours a
month, about 30 hours on a 4-core machine. A codespace stops after 30 minutes without activity (default); stopped
codespaces use only storage.

## 2. Check the Besu network

When the codespace has started, open a terminal (**Terminal → New Terminal**) and run:

```bash
bash besu/check-network.sh
```

Expected: the same block number (rising every 2 seconds) on ports 8545, 8547, 8549 and 8551; `peers` `0x3`;
four validator addresses. If the network is not running (for example after a failed start), run
`bash besu/start-network.sh` and check again; `docker compose -f besu/docker-compose.yml logs mkt` shows a node's log.

The chain state stays in the codespace while it exists (stop and restart keep it). To start a fresh chain:
`docker compose -f besu/docker-compose.yml down`, `rm -rf besu/networkFiles besu/mkt besu/bank-* besu/.env`, then
`bash besu/start-network.sh`.

## 3. Sharing a demo

The **Ports** panel lists the forwarded ports (Besu RPC 8545–8552; later the consoles and services). Ports are private
by default: only you, signed in to GitHub, can open them. For a demo with other people, right-click a port →
**Port Visibility** → **Public**; the forwarded URL then works for anyone while the codespace runs.

**Caution:** a public Besu RPC port lets anyone send transactions to the network. Make public only the ports the demo
needs (later: the party consoles), keep test keys only, and set the ports back to private afterwards.

## 4. The party console

Every time the container starts, `scripts/live-e2e.sh up` starts the console dev server on 5173 together with the
services on 8001 and 8002. Open it from the **Ports** panel ("Collateral Console"). Check the stack from the terminal
with `bash scripts/live-e2e.sh status`; its log is `stack.log` at the repository root.

**In a local dev container** (VS Code Dev Containers) the forwarded ports map to `localhost`, so the console reaches
the services at its default `http://localhost:8001` / `http://localhost:8002`.

**In a codespace** the browser reaches forwarded ports at `https://<codespace-name>-<port>.app.github.dev`, so the
console's default service URLs do not resolve and the live pages show no data. Making this work (setting
`VITE_SERVICE_A_URL` / `VITE_SERVICE_B_URL`, port visibility, CORS) is `task-codespaces-live-stack`.

**After new commits**, rebuild and restart from the terminal:

```bash
git pull
bash scripts/live-e2e.sh build
bash scripts/live-e2e.sh up
```

`up` replaces the running stack. A production build of the console only, without the services, is still available with
`bash console/serve.sh` (port 5173; stop the stack first with `bash scripts/live-e2e.sh down`, or set `CONSOLE_PORT`).
Tests and modes: [`../console/README.md`](../console/README.md).

## Troubleshooting

| Symptom | Check |
|---|---|
| Codespace creation offers no 4-core machine | The account's allowed machine types or quota; a 2-core machine can run the network but may be slow |
| `check-network.sh` shows `Connection refused` | `docker compose -f besu/docker-compose.yml ps`; run `bash scripts/live-e2e.sh up`; the creation log (**View Creation Log**) shows the post-create and post-start output |
| `live-e2e.sh`: `missing services/collateral/target/collateral-service.jar` | The post-create build failed or did not run; run `bash scripts/live-e2e.sh build` and read its output |
| `Docker is not running` from `start-network.sh` | The Docker-in-Docker daemon did not start; rebuild the container (**Codespaces: Rebuild Container**) |
| Blocks stay at `0x0` | At least three nodes must run; `docker compose -f besu/docker-compose.yml logs` |
