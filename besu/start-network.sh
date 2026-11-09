#!/usr/bin/env bash
# Start the four-node QBFT Besu network (one validator per default participant).
# First run: generates the genesis file and four validator keys, gives each node one key and writes the
# bootnode address to besu/.env. Later runs: starts the existing network. Used by the dev container
# (.devcontainer/devcontainer.json) and usable on any Linux or macOS machine with Docker, and from Git Bash on Windows.
set -euo pipefail
cd "$(dirname "$0")"
IMAGE=hyperledger/besu:26.9.0
NODES=(mkt bank-a bank-b bank-c)

# The Docker daemon may still be starting when the dev container runs this script.
for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done
docker info >/dev/null 2>&1 || { echo "Docker is not running" >&2; exit 1; }

if [ ! -f networkFiles/genesis.json ]; then
  rm -rf networkFiles
  # MSYS_NO_PATHCONV: Git Bash on Windows otherwise rewrites the container paths /data/... to C:/Program Files/Git/...
  # (no effect on Linux or macOS).
  # --entrypoint: the image entrypoint besu-entry.sh, when the container runs as uid 0, first runs
  # `besu --print-paths-and-exit "$@"` and then the command. For generate-blockchain-config the first run writes
  # networkFiles/ and the second fails with "Output directory already exists". Calling the binary directly runs the
  # command once for any uid (root shells: claude.ai web sessions, sudo).
  MSYS_NO_PATHCONV=1 docker run --rm --entrypoint /opt/besu/bin/besu --user "$(id -u):$(id -g)" -v "$PWD:/data" "$IMAGE" \
    operator generate-blockchain-config \
    --config-file=/data/qbftConfigFile.json --to=/data/networkFiles --private-key-file-name=key
  mapfile -t KEYS < <(find networkFiles/keys -mindepth 1 -maxdepth 1 -type d | sort)
  [ "${#KEYS[@]}" -eq 4 ] || { echo "expected 4 validator keys, found ${#KEYS[@]}" >&2; exit 1; }
  for i in 0 1 2 3; do
    mkdir -p "${NODES[$i]}/data"
    cp "${KEYS[$i]}/key" "${NODES[$i]}/data/key"
  done
  PUB=$(tr -d '[:space:]' < "${KEYS[0]}/key.pub"); PUB=${PUB#0x}
  printf 'BOOTNODE_ENODE=enode://%s@172.28.0.11:30303\nBESU_USER=%s:%s\n' "$PUB" "$(id -u)" "$(id -g)" > .env
fi

bash ./clean-stale-network.sh
docker compose up -d
echo "Besu nodes: mkt 8545, bank-a 8547, bank-b 8549, bank-c 8551 (JSON-RPC); WebSocket on the next port up."
