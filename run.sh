#!/usr/bin/env bash
# terminal-lite — one-command run. Use `./run.sh --build` to force a frontend rebuild.
set -euo pipefail
cd "$(dirname "$0")"

[ -d node_modules ] || npm install
[ -d web/node_modules ] || (cd web && npm install)
if [ ! -d web/dist ] || [ "${1:-}" = "--build" ]; then
  (cd web && npm run build)
fi

exec node server/index.mjs
