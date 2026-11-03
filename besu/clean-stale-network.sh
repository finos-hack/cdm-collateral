#!/usr/bin/env bash
# Remove Docker networking state left behind by earlier besu_besu networks (task-codespaces-live-stack).
#
# Observed in a GitHub Codespace (Docker 29.9.2, iptables legacy): after the Besu network was recreated, the bridges of
# the earlier networks stayed behind (DOWN, still holding 172.28.0.1/24) together with their iptables rules:
#   raw PREROUTING  -d 172.28.0.1x/32 ! -i br-<old> -j DROP        drops every packet to a validator on the live bridge
#   nat POSTROUTING -s 172.28.0.0/24 ! -o br-<old> -j MASQUERADE   rewrites validator-to-validator traffic to 172.28.0.1
# and their linkdown routes for 172.28.0.0/24 came before the live bridge's. The validators could not peer, QBFT stalled
# in round changes, and the published RPC ports timed out.
#
# This script deletes (1) br-* bridges that hold the Besu gateway address, have no attached interface and are not the
# live besu_besu bridge, and (2) iptables rules that name a br-* interface that no longer exists. Rules of the live
# network are kept. If anything was removed, running Besu containers are restarted so discovery and QBFT round timers
# start over. Linux only; needs root or passwordless sudo, otherwise it reports and does nothing. Called by
# besu/start-network.sh and scripts/live-e2e.sh (start_besu).
set -euo pipefail

GATEWAY=172.28.0.1/24
NODES=(besu-mkt besu-bank-a besu-bank-b besu-bank-c)

[ "$(uname -s)" = Linux ] || exit 0
command -v ip >/dev/null 2>&1 && command -v iptables-save >/dev/null 2>&1 || exit 0
if [ "$(id -u)" -eq 0 ]; then SUDO=()
elif sudo -n true 2>/dev/null; then SUDO=(sudo -n)
else echo "clean-stale-network: no root or passwordless sudo; skipped" >&2; exit 0
fi

removed=0
net_id="$(docker network inspect besu_besu --format '{{.Id}}' 2>/dev/null || true)"
live="${net_id:+br-${net_id:0:12}}"

# 1. Stale bridges: hold the Besu gateway address, are not the live network's bridge, have nothing attached.
for b in $(ip -o -4 addr show | awk -v a="$GATEWAY" '$4 == a { print $2 }'); do
  case "$b" in br-*) ;; *) continue ;; esac
  [ "$b" = "$live" ] && continue
  [ -n "$(ip -br link show master "$b" 2>/dev/null)" ] && continue
  "${SUDO[@]}" ip link delete "$b"
  echo "clean-stale-network: removed bridge $b"
  removed=1
done

# 2. Rules naming a br-* interface that no longer exists. iptables-save prints each rule as "-A <chain> <spec>";
#    replacing -A with -D deletes exactly that rule.
for t in raw nat filter mangle; do
  while IFS= read -r rule; do
    gone=0
    for b in $(grep -oE 'br-[0-9a-f]{12}' <<<"$rule" | sort -u); do
      ip link show "$b" >/dev/null 2>&1 || gone=1
    done
    [ "$gone" -eq 1 ] || continue
    eval "\"\${SUDO[@]}\" iptables -t $t -D ${rule#-A }"
    echo "clean-stale-network: removed $t rule: $rule"
    removed=1
  done < <("${SUDO[@]}" iptables-save -t "$t" 2>/dev/null | grep -E '^-A .*br-[0-9a-f]{12}' || true)
done

if [ "$removed" -eq 1 ]; then
  running=()
  for n in "${NODES[@]}"; do
    [ "$(docker inspect -f '{{.State.Running}}' "$n" 2>/dev/null || true)" = true ] && running+=("$n")
  done
  if [ "${#running[@]}" -gt 0 ]; then
    docker restart "${running[@]}" >/dev/null
    echo "clean-stale-network: restarted ${running[*]}"
  fi
fi
