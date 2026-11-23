# HK ELI Chatbot web (the Angular widget) for OpenShift UAT.
#   docker build -t hk-eli-chatbot-web:local .
#   docker run -p 8081:8080 -e API_URL=http://hk-eli-chatbot-api:8080 hk-eli-chatbot-web:local
# One image for every environment: the agent's address (API_URL) and the app settings are read when the
# container starts, not baked in at build time. The browser only ever talks to this nginx; nginx forwards
# /api/stork/* and /tableau/* to the agent, so there is no CORS to configure and the mock Tableau views stay
# same-origin (the widget only frames /tableau/... from its own origin).
ARG NODE_IMAGE=node:22.21.1-bookworm-slim
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.28.0-alpine

FROM ${NODE_IMAGE} AS build
ARG NPM_REGISTRY=https://registry.npmjs.org/
WORKDIR /src
COPY package.json package-lock.json ./
# Optional corporate CA for a proxy that re-signs TLS: docker build --secret id=ca,src=corp-ca.pem .
RUN --mount=type=secret,id=ca,required=false \
    if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca npm_config_cafile=/run/secrets/ca; fi \
 && npm ci --registry "${NPM_REGISTRY}" --no-audit --no-fund
COPY . .
RUN npm run build -- --configuration production

FROM ${NGINX_IMAGE}
LABEL org.opencontainers.image.title="hk-eli-chatbot-web" \
      org.opencontainers.image.description="HK ELI Chatbot widget. *Will be part of Ask-MIRA in future." \
      io.openshift.expose-services="8080:http"
# Defaults; override per environment in the ConfigMap.
ENV API_URL=http://hk-eli-chatbot-api:8080 \
    APP_NAME="HK ELI Chatbot" \
    REQUEST_TIMEOUT_MS=20000 \
    AS_OF_DATE="" \
    APP_TIMEZONE=Asia/Hong_Kong \
    MARKET_HOLIDAYS="2026-12-25,2026-12-26,2027-01-01" \
    NGINX_ENVSUBST_FILTER="^(API_URL)$"
USER 0
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/nginx/40-app-config.sh /docker-entrypoint.d/40-app-config.sh
COPY --from=build /src/dist/web/browser /usr/share/nginx/html
# OpenShift runs the pod as a random UID in group 0: the config folder is rewritten at start, so group 0 owns it.
RUN rm -f /etc/nginx/conf.d/default.conf \
 && chmod 0755 /docker-entrypoint.d/40-app-config.sh \
 && chgrp -R 0 /usr/share/nginx/html/config /etc/nginx/conf.d \
 && chmod -R g=u /usr/share/nginx/html/config /etc/nginx/conf.d
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
