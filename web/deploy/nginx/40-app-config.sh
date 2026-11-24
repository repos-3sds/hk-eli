#!/bin/sh
# Writes config/app-config.json from the container's environment at start, so one image serves every
# environment. The browser always calls the agent through this nginx (/api/stork), never directly.
set -eu
out=/usr/share/nginx/html/config/app-config.json
json_str() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
case "${REQUEST_TIMEOUT_MS:-20000}" in ''|*[!0-9]*) echo "REQUEST_TIMEOUT_MS must be a whole number" >&2; exit 1;; esac
if [ -n "${AS_OF_DATE:-}" ]; then
  echo "$AS_OF_DATE" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' || { echo "AS_OF_DATE must look like 2026-11-19" >&2; exit 1; }
  as_of="\"$AS_OF_DATE\""
else
  as_of=null
fi
holidays=""
for d in $(echo "${MARKET_HOLIDAYS:-}" | tr ',' ' '); do
  echo "$d" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' || { echo "MARKET_HOLIDAYS has a bad date: $d" >&2; exit 1; }
  holidays="${holidays:+$holidays, }\"$d\""
done
cat > "$out" <<JSON
{
  "appName": "$(json_str "${APP_NAME:-HK ELI Chatbot}")",
  "gatewayBaseUrl": "/api/stork",
  "requestTimeoutMs": ${REQUEST_TIMEOUT_MS:-20000},
  "asOfDate": $as_of,
  "timeZone": "$(json_str "${APP_TIMEZONE:-Asia/Hong_Kong}")",
  "marketHolidays": [$holidays]
}
JSON
echo "40-app-config.sh: wrote $out (API via ${API_URL:-unset})"
