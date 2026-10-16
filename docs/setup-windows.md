# Setting up the development machine (Windows)

For the prototype in [`../architecture/README.md`](../architecture/README.md). These steps install the tools and start
a local four-node Besu network (one node per default participant). The prototype code itself is not built yet; later steps will add it.

Version pins as of 2026-10-16. **Tested:** the QBFT configuration, `generate-blockchain-config` and the node flags in
step 6 were run with Besu 26.9.0 (native binary, Java 25, Linux) on 2026-10-16: four nodes on one machine with the
first as bootnode; each node had 3 peers, `qbft_getValidatorsByBlockNumber` listed 4 validators, blocks came every 2
seconds, and blocks continued with one node stopped. **Not tested:** the Windows and Docker parts (steps 2–5, the
PowerShell commands and `besu/docker-compose.yml`), since no Windows machine or Docker daemon was available; the
Compose file was only checked to parse as YAML. The Besu Docker image bundles its own Java, so you do not need
to install Java; running Besu natively instead would need Java 25 or later. Reference: Besu QBFT tutorial,
https://besu.hyperledger.org/private-networks/tutorials/qbft.

## 1. Prerequisites

- Windows 11, or Windows 10 version 22H2 or later, with administrator rights.
- Hardware virtualization enabled in the BIOS/UEFI (needed by WSL2). Task Manager → Performance → CPU shows
  "Virtualization: Enabled".
- About 20 GB of free disk space.

## 2. WSL2

In PowerShell **as administrator**:

```powershell
wsl --install
```

Restart when asked. Then check:

```powershell
wsl --status        # "Default Version: 2"
```

## 3. Docker Desktop

```powershell
winget install -e --id Docker.DockerDesktop
```

Start Docker Desktop, then in Settings → General make sure **Use the WSL 2 based engine** is ticked. Check in a new
PowerShell window:

```powershell
docker version
docker run --rm hello-world
```

## 4. Git, Python, Node.js (and an editor)

```powershell
winget install -e --id Git.Git
winget install -e --id Python.Python.3.12
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Microsoft.VisualStudioCode   # optional
```

Open a new PowerShell window and check:

```powershell
git --version
py -3.12 --version
node -v
npm -v
```

## 5. The repository

```powershell
cd $HOME
git clone https://github.com/denisurusov/cdm-collateral.git
cd cdm-collateral
```

## 6. Local Besu network (four-node QBFT, one node per participant)

Each default participant runs its own Besu validator node (`wp-adr-per-participant-services`). QBFT needs at least four
validators to keep producing blocks when one node is down, so the default network has four:

| Node (container) | Participant | JSON-RPC HTTP | WebSocket | Docker IP |
|---|---|---|---|---|
| `mkt` (`besu-mkt`) | Market data operator; bootnode | 8545 | 8546 | 172.28.0.11 |
| `bank-a` (`besu-bank-a`) | BANK-A, pledgor | 8547 | 8548 | 172.28.0.12 |
| `bank-b` (`besu-bank-b`) | BANK-B, secured party | 8549 | 8550 | 172.28.0.13 |
| `bank-c` (`besu-bank-c`) | BANK-C, second pledgor (multi-party tests) | 8551 | 8552 | 172.28.0.14 |

Each participant's ledger gateway talks to its own node. The repository already holds the two configuration files:
[`besu/qbftConfigFile.json`](../besu/qbftConfigFile.json) (chain id 1337, 2-second blocks, no gas fees, 4 validator
keys) and [`besu/docker-compose.yml`](../besu/docker-compose.yml) (the four nodes on a Docker network with fixed IPs).

Pull the image (26.9.0 is the newest release at least two weeks old on 2026-10-16):

```powershell
docker pull hyperledger/besu:26.9.0
```

Generate the genesis file and the four validator keys (the command fails if `besu\networkFiles` already exists; delete
it first to start over):

```powershell
docker run --rm -v "${PWD}\besu:/data" hyperledger/besu:26.9.0 `
  operator generate-blockchain-config `
  --config-file=/data/qbftConfigFile.json `
  --to=/data/networkFiles `
  --private-key-file-name=key
```

`besu\networkFiles\keys\` now holds four folders, one per validator address, each with `key` and `key.pub`. Give each
node one key, and write the bootnode address (the `mkt` node's public key) to `besu\.env` for Docker Compose:

```powershell
$keys  = Get-ChildItem besu\networkFiles\keys -Directory | Sort-Object Name
$nodes = 'mkt', 'bank-a', 'bank-b', 'bank-c'
for ($i = 0; $i -lt 4; $i++) {
  New-Item -ItemType Directory -Force "besu\$($nodes[$i])\data" | Out-Null
  Copy-Item (Join-Path $keys[$i].FullName 'key') "besu\$($nodes[$i])\data\key"
}
$pub = (Get-Content (Join-Path $keys[0].FullName 'key.pub') -Raw).Trim() -replace '^0x', ''
"BOOTNODE_ENODE=enode://$pub@172.28.0.11:30303" | Set-Content -Encoding ascii besu\.env
```

Start the network:

```powershell
cd besu
docker compose up -d
docker compose ps        # four containers, State "running"
cd ..
```

Check it (wait about 20 seconds after start):

```powershell
function Rpc($port, $method, $params = '[]') {
  Invoke-RestMethod -Uri "http://localhost:$port" -Method Post -ContentType 'application/json' `
    -Body "{""jsonrpc"":""2.0"",""method"":""$method"",""params"":$params,""id"":1}"
}
Rpc 8545 eth_blockNumber                                   # increases every 2 seconds
Rpc 8545 net_peerCount                                     # 0x3
Rpc 8551 eth_blockNumber                                   # same block number on bank-c
(Rpc 8545 qbft_getValidatorsByBlockNumber '["latest"]').result   # four addresses
```

Optional fault test: `docker stop besu-bank-c`, check that `eth_blockNumber` on 8545 still increases, then
`docker start besu-bank-c`.

Stop and start later with `docker compose stop` and `docker compose start` in `besu\`. Chain state is kept in
`besu\<node>\data`. `besu\networkFiles`, the node folders and `besu\.env` are ignored by git.

More participants than four: a further participant's gateway can use any existing node, or a new node can join as a
non-validator (same genesis, `--bootnodes`) and be voted in as a validator with `qbft_proposeValidatorVote`.

## 7. Later (when the prototype is built)

- Funded test accounts (one per participant, plus the oracle publisher and contract admin) will be added to the genesis
  `alloc` section, so the network will be regenerated once.
- Python virtual environments for the workflow and oracle services; `npm install` for the ledger gateway, the
  contracts and the party console; Playwright browsers for the end-to-end tests.

## Troubleshooting

| Symptom | Check |
|---|---|
| `wsl --install` fails or Docker reports WSL errors | Virtualization enabled in BIOS; Windows updated; `wsl --update` |
| `docker` not found | Open a new terminal after installing; Docker Desktop is running |
| A port between 8545 and 8552 in use | `netstat -ano | findstr 8545`; stop the other process or change the `ports` mapping in `besu/docker-compose.yml` |
| `eth_blockNumber` stays at `0x0` | `docker logs besu-mkt`; at least three of the four nodes must be running; each node folder must hold a different `key` from step 6; `net_peerCount` must be `0x3` |
| `net_peerCount` is `0x0` on `bank-*` nodes | `besu\.env` exists and `BOOTNODE_ENODE` holds the `mkt` node's public key without `0x`; run `docker compose up -d` from inside `besu\` |
| `docker compose up` reports `Pool overlaps with other one on this address space` | Another Docker network uses 172.28.0.0/24; change the subnet and the four IPs in `besu/docker-compose.yml` and in `besu\.env` |
| Log shows `WARN … Forcing price bump … zero basefee network` | Expected on a gas-free network; not an error |
