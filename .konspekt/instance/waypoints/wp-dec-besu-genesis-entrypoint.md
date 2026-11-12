```yaml
id: wp-dec-besu-genesis-entrypoint
kind: decision
timestamp: 2026-11-09T00:49:00Z
review: accepted
provenance:
  conversationId: claude-ai-web-live-spec
  sourceRef: e765ec4d7d239f00f16330ce6c7b942512cd3359
  contentHash: e765ec4d7d239f00f16330ce6c7b942512cd3359
  timestamp: 2026-11-09T00:49:00Z
  confidence: 0.9
createdAt: 2026-11-09T00:49:00Z
updatedAt: 2026-11-11T23:18:36Z
```
# Decision: the Besu genesis step calls the Besu binary, not the image entrypoint

`besu/start-network.sh` runs `operator generate-blockchain-config` with `--entrypoint /opt/besu/bin/besu`. The image
entrypoint `besu-entry.sh` (image `hyperledger/besu:26.9.0`), for a container running as uid 0, runs
`besu --print-paths-and-exit "$@"` and then the command, so the genesis step wrote `besu/networkFiles/` twice and failed
with `Output directory already exists`. The script passes `--user "$(id -u):$(id -g)"`, which is `0:0` when the shell
user is root (claude.ai web sessions, `sudo`).

The project owner chose this option (a) over option (b), passing a non-root `--user` when `id -u` is 0. Option (a) runs
the command once for every uid and keeps the output owned by the caller. Its dependency: the binary path
`/opt/besu/bin/besu` in the image; a future image that moves the binary breaks the genesis step.

A tooling decision with no architectural force behind it, so no `subtype: adr` and no `drives` edge.
