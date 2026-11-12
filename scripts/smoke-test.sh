#!/usr/bin/env bash
# Asks the running gateway one question per routed scenario and checks each answer came from the skills service.
set -euo pipefail
GW="http://localhost:${GATEWAY_PORT:-8080}/api/hk-eli/chat/answers"
fail=0
check() {
  local q="$1" want="$2"
  local body; body=$(curl -s -m 30 -H 'Content-Type: application/json' -d "{\"text\":\"$q\"}" "$GW")
  local got; got=$(printf '%s' "$body" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('sourceMode') or 'local', len(d.get('evidence') or []))")
  if [[ "$got" == $want* ]]; then echo "ok    $q -> $got"; else echo "FAIL  $q -> $got (wanted $want)"; fail=1; fi
}
check "Top concentrations against limit" MOCK
check "Maturities and rollovers across the book" MOCK
check "Concentration by branch" MOCK
check "Regional performance by district" MOCK
check "Digibank journey this month" MOCK
check "Coupons by product" MOCK
check "Who matures this week?" local
check "Brief me on Chan" local
exit $fail
