# Setting up the development machine (Windows)

For the prototype in [`../architecture/README.md`](../architecture/README.md). These steps install the tools and start
a local single-node Besu network. The prototype code itself is not built yet; later steps will add it.

Version pins as of 2026-10-16. **Tested:** the QBFT configuration, `generate-blockchain-config` and the node flags in
step 6 were run with Besu 26.9.0 (native binary, Java 25, Linux) on 2026-10-16: the node produced a block every 2
seconds with one validator. **Not tested:** the Windows and Docker parts (steps 2–5 and the `docker run` wrapping),
since no Windows machine or Docker daemon was available. The Besu Docker image bundles its own Java, so you do not need
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

## 6. Local Besu network (single-node QBFT)

Pull the image (26.9.0 is the newest release at least two weeks old on 2026-10-16):

```powershell
docker pull hyperledger/besu:26.9.0
```

Create `besu\qbftConfigFile.json` with this content (chain id 1337, 2-second blocks, no gas fees):

```json
{
  "genesis": {
    "config": {
      "chainId": 1337,
      "berlinBlock": 0,
      "londonBlock": 0,
      "zeroBaseFee": true,
      "qbft": { "blockperiodseconds": 2, "epochlength": 30000, "requesttimeoutseconds": 4 }
    },
    "nonce": "0x0",
    "timestamp": "0x58ee40ba",
    "gasLimit": "0x1fffffffffffff",
    "difficulty": "0x1",
    "mixHash": "0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365",
    "coinbase": "0x0000000000000000000000000000000000000000",
    "alloc": {}
  },
  "blockchain": { "nodes": { "generate": true, "count": 1 } }
}
```

Generate the genesis file and the validator key:

```powershell
docker run --rm -v "${PWD}\besu:/data" hyperledger/besu:26.9.0 `
  operator generate-blockchain-config `
  --config-file=/data/qbftConfigFile.json `
  --to=/data/networkFiles `
  --private-key-file-name=key
```

`besu\networkFiles\keys\` now contains one folder named after the validator address, holding `key` and `key.pub`.
Copy that `key` file to `besu\node\data\key`:

```powershell
New-Item -ItemType Directory -Force besu\node\data | Out-Null
$keyDir = (Get-ChildItem besu\networkFiles\keys -Directory | Select-Object -First 1).FullName
Copy-Item (Join-Path $keyDir 'key') besu\node\data\key
```

Start the node:

```powershell
docker run -d --name besu-dev -p 8545:8545 -p 8546:8546 -v "${PWD}\besu:/data" hyperledger/besu:26.9.0 `
  --data-path=/data/node/data `
  --genesis-file=/data/networkFiles/genesis.json `
  --min-gas-price=0 `
  --rpc-http-enabled --rpc-http-api=ETH,NET,QBFT,WEB3,TXPOOL `
  --rpc-ws-enabled --rpc-ws-api=ETH,NET,QBFT,WEB3 `
  --host-allowlist="*" --rpc-http-cors-origins="all"
```

Check that blocks are produced (run twice, a few seconds apart; the number should increase):

```powershell
Invoke-RestMethod -Uri http://localhost:8545 -Method Post -ContentType 'application/json' `
  -Body '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

Stop and start later with `docker stop besu-dev` and `docker start besu-dev`. The chain state is kept in
`besu\node\data`.

## 7. Later (when the prototype is built)

- Funded test accounts (pledgor, secured party, oracle publisher, contract admin) will be added to the genesis `alloc`
  section, so the network will be regenerated once.
- Python virtual environments for the workflow and oracle services; `npm install` for the ledger gateway, the
  contracts and the party console; Playwright browsers for the end-to-end tests.

## Troubleshooting

| Symptom | Check |
|---|---|
| `wsl --install` fails or Docker reports WSL errors | Virtualization enabled in BIOS; Windows updated; `wsl --update` |
| `docker` not found | Open a new terminal after installing; Docker Desktop is running |
| Port 8545 or 8546 in use | `netstat -ano | findstr 8545`; stop the other process or change the `-p` mapping |
| `eth_blockNumber` stays at `0x0` | `docker logs besu-dev`; the `key` file must be the one generated in step 6 |
| Log shows `WARN … Forcing price bump … zero basefee network` | Expected on a gas-free network; not an error |
