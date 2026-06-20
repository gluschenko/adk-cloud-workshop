#!/bin/sh
set -eu

pids=""

start_service() {
  name="$1"
  shift
  echo "[container] starting ${name}: $*"
  "$@" &
  pid="$!"
  pids="${pids} ${pid}"
}

stop_all() {
  echo "[container] stopping services"
  for pid in $pids; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}

trap stop_all INT TERM

echo "[container] seeding SQLite database"
npm run seed

storefront_port="${STOREFRONT_PORT:-${PORT:-8010}}"

start_service gemma env PORT=8016 GEMMA_API_PORT=8016 GEMMA_API_HOST=127.0.0.1 node_modules/.bin/tsx --env-file-if-exists=.env shared/src/gemma-server.ts
start_service inventory env PORT=8001 node_modules/.bin/tsx --env-file-if-exists=.env agents/inventory/src/server.ts
start_service orders env PORT=8002 node_modules/.bin/tsx --env-file-if-exists=.env agents/orders/src/server.ts
start_service pricing env PORT=8003 node_modules/.bin/tsx --env-file-if-exists=.env agents/pricing/src/server.ts
start_service orchestrator env PORT=8004 node_modules/.bin/tsx --env-file-if-exists=.env agents/orchestrator/src/server.ts
start_service storefront env STOREFRONT_PORT="$storefront_port" ORCHESTRATOR_URL=http://localhost:8004 node_modules/.bin/tsx --env-file-if-exists=.env web/storefront/src/server.tsx

echo "[container] storefront:   http://localhost:${storefront_port}"
echo "[container] orchestrator: http://localhost:8004"
echo "[container] agents:       inventory=8001 orders=8002 pricing=8003 gemma=8016"

while :; do
  for pid in $pids; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[container] service process ${pid} exited; shutting down"
      stop_all
      exit 1
    fi
  done
  sleep 2
done
