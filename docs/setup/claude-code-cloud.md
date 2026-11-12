# Claude Code cloud environment for cdm-collateral

A Claude Code cloud session (started from claude.ai/code, the Claude desktop or mobile app, or `claude --cloud`) clones
this repository into an Anthropic-managed Ubuntu 24.04 VM. The session runs in a *cloud environment*: a saved
configuration with a network access level, environment variables and a setup script. Claude Code runs the setup
script as root before it launches and caches the result, so later sessions start with its downloads on disk
([Configure cloud environments](https://code.claude.com/docs/en/cloud-environments)).

[`claude-code-cloud-setup.sh`](claude-code-cloud-setup.sh) is the setup script for this repository. It:

1. starts the Docker daemon and pulls the Besu image named in `besu/docker-compose.yml`;
2. runs the one-time build `bash scripts/live-e2e.sh build` (Node dependencies of `contracts`, `gateway`, `store` and
   `console`; `cdm-ext` installed into `~/.m2`; the collateral and oracle service jars);
3. runs `npx hardhat compile` in `contracts/` once, which downloads solc 0.8.28 into Hardhat's compiler cache;
4. links the preinstalled Playwright Chromium (`/opt/pw-browsers/chromium-*/chrome-linux*/chrome`) to
   `/usr/local/bin/cdm-chromium`, a path that does not change when the image updates the browser revision.

Each step prints a `setup:` line, reports a failure as a warning and continues; the script exits 0.

## 1. Create the environment

At claude.ai/code, open the environment selector, then add an environment (or edit one of your own). In the dialog:

| Field | Value |
|---|---|
| Name | `cdm-collateral` |
| Network access | **Limited**, with **Allow package managers** checked |
| Allowed domains | the list below, one per line |
| Environment variables | `CHROMIUM_PATH=/usr/local/bin/cdm-chromium` |
| Setup script | the contents of [`claude-code-cloud-setup.sh`](claude-code-cloud-setup.sh) (paste it, or **Choose file**) |

Allowed domains. The default allowlist that **Allow package managers** adds covers package registries, GitHub and
container registries including Docker Hub; the entries below repeat the hosts this repository needs so the list does
not depend on what the default contains:

```
repo1.maven.org
repo.maven.apache.org
registry-1.docker.io
auth.docker.io
production.cloudflare.docker.com
*.docker.com
binaries.soliditylang.org
```

| Host | Needed by |
|---|---|
| `repo1.maven.org`, `repo.maven.apache.org` | `build`: Maven dependencies of `cdm-ext` and the services |
| `registry-1.docker.io`, `auth.docker.io`, `production.cloudflare.docker.com`, `*.docker.com` | the Besu image pull; layers come from `production.cloudfront.docker.com` |
| `binaries.soliditylang.org` | `hardhat test`, `hardhat compile` and `npm run deploy:besu` (solc download) |

Save with **Add environment** (or **Save changes**), then select the environment when you start a session on this
repository.

## 2. In a session

Processes started by the setup script do not continue into the session, so start the Docker daemon before `up`, and
run `up` and `check` in the same turn:

```bash
bash docs/setup/claude-code-cloud-setup.sh --docker   # start dockerd; no-op when it is running
bash scripts/live-e2e.sh up                           # Besu, contracts if not deployed, store, gateways, services, console
bash scripts/live-e2e.sh check                        # the live specs; CHROMIUM_PATH skips the Playwright download
bash scripts/live-e2e.sh down
```

The shell user is root. `besu/start-network.sh` runs the genesis step with `--entrypoint /opt/besu/bin/besu`, so a
first `up` works as root (`wp-dec-besu-genesis-entrypoint`, `docs/runbook-e2e.md` section 4).

The VM has 2 cores: a full `check` took 13.9 to 15.2 min in the claude.ai workspace (`docs/runbook-e2e.md`
section 10).

## Verification status

Tested on 2026-11-11 in a claude.ai web session workspace (Ubuntu, shell user root, Docker 29.9.2, Node 22.23.4,
JDK 21.0.12), at `main` `05b165e`, with the allowlist above:

- The full script, run from `/tmp`, exited 0 in 97 s: it started dockerd, found the clone from its own path, pulled
  `hyperledger/besu:26.9.0`, ran `build`, cached solc 0.8.28 and linked `/usr/local/bin/cdm-chromium` to
  `chromium-1243` (Chrome for Testing 153.0.8010.12).
- A copy outside the repository found the clone by its search under `/home`; `--docker` exited 0 with the daemon
  running.
- `up` exited 0, then `CHROMIUM_PATH=/usr/local/bin/cdm-chromium bash scripts/live-e2e.sh check --grep flow-return`
  passed (1 spec, 53 s) without a Playwright download.

Not yet run in a Claude Code cloud environment: the repository path there, the setup-script cache, and whether
`/opt/pw-browsers` exists in that image (when it does not, the script warns and `check` falls back to
`npx playwright install chromium`, which needs the Playwright download host allowed).
