#!/usr/bin/env bash
# Starts the Angular widget on http://localhost:4200, calling the gateway through the dev proxy (proxy.conf.json, port 8080).
set -euo pipefail
cd "$(dirname "$0")/../web"
[ -d node_modules ] || npm install
exec npx ng serve --configuration gateway --port "${WEB_PORT:-4200}"
