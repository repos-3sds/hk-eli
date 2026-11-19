#!/usr/bin/env bash
# Starts the Java gateway on http://localhost:8080/api/hk-eli with the HK ELI agents (chatbot/, :8040) and the skills
# service (:8031) switched on. Either can be down: the gateway falls back and says so on the answer.
set -euo pipefail
cd "$(dirname "$0")/../gateway"
export ELI_SKILLS_ENABLED=true ELI_SKILLS_URL="${ELI_SKILLS_URL:-http://127.0.0.1:${SKILLS_PORT:-8031}}"
export ELI_AGENTS_ENABLED="${ELI_AGENTS_ENABLED:-true}" ELI_AGENTS_URL="${ELI_AGENTS_URL:-http://127.0.0.1:${AGENTS_PORT:-8040}}"
exec mvn -q spring-boot:run -Dspring-boot.run.profiles=demo -Dspring-boot.run.arguments="--server.port=${GATEWAY_PORT:-8080} --eli.allowed-origins=http://localhost:${WEB_PORT:-4200}"
