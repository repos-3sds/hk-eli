#!/usr/bin/env bash
# Starts the Java gateway on http://localhost:8080/api/hk-eli with the skills service switched on.
set -euo pipefail
cd "$(dirname "$0")/../gateway"
export ELI_SKILLS_ENABLED=true ELI_SKILLS_URL="${ELI_SKILLS_URL:-http://127.0.0.1:${SKILLS_PORT:-8031}}"
exec mvn -q spring-boot:run -Dspring-boot.run.profiles=demo -Dspring-boot.run.arguments="--server.port=${GATEWAY_PORT:-8080} --eli.allowed-origins=http://localhost:${WEB_PORT:-4200}"
