#!/usr/bin/env bash
# Check the four-node network: block number on every node, peer count and validators.
set -euo pipefail
rpc() { curl -s -X POST -H 'Content-Type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"$2\",\"params\":${3:-[]},\"id\":1}" "http://localhost:$1"; echo; }
for port in 8545 8547 8549 8551 8553; do printf 'node %s block: ' "$port"; rpc "$port" eth_blockNumber; done
printf 'peers (expect 0x3): '; rpc 8545 net_peerCount
printf 'validators (expect 4): '; rpc 8545 qbft_getValidatorsByBlockNumber '["latest"]'
