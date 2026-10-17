#!/usr/bin/env bash
# Build the console and serve the production build on port 5173 in the background.
# Run by the dev container on every start (.devcontainer/devcontainer.json); safe to run again by hand
# after `git pull` — it reinstalls only if the lockfile changed, rebuilds, and replaces the running server.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${CONSOLE_PORT:-5173}"

if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund
fi
npm run build

# Stop a server started by an earlier run: setsid made it a process-group leader, so signal the whole group.
if [ -f .preview.pid ] && kill -0 "$(cat .preview.pid)" 2>/dev/null; then
  kill -- "-$(cat .preview.pid)" 2>/dev/null || kill "$(cat .preview.pid)"
  for _ in $(seq 1 10); do curl -fs "http://localhost:$PORT/" > /dev/null || break; sleep 1; done
fi
if curl -fs "http://localhost:$PORT/" > /dev/null; then
  echo "Port $PORT is in use by another process; stop it or set CONSOLE_PORT" >&2
  exit 1
fi
setsid nohup node_modules/.bin/vite preview --host 0.0.0.0 --port "$PORT" --strictPort > .preview.log 2>&1 < /dev/null &
echo $! > .preview.pid

for _ in $(seq 1 30); do
  if curl -fs "http://localhost:$PORT/" > /dev/null; then
    echo "Collateral Console running on port $PORT (Codespaces: Ports panel → \"Collateral Console\"). Log: console/.preview.log"
    exit 0
  fi
  sleep 1
done
echo "Console did not start; see console/.preview.log" >&2
exit 1
