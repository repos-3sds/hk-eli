# hk-eli-chatbot-web: deploy to OpenShift (UAT)

The HK ELI Chatbot widget (Angular 21 + Material, dark Digimarkets style: Today, Chat, Prompts), served by
nginx. This is the service people open. Every figure and client in it comes from the agent
(`hk-eli-chatbot-api`). *Will be part of Ask-MIRA in future.*

| | |
| --- | --- |
| Image | `Dockerfile` here: Node 22.21.1 builds the app, `nginx-unprivileged:1.28.0-alpine` serves it |
| Port | 8080 (HTTP) |
| User | non-root; works with OpenShift's random UID |
| Health | `GET /healthz` (this container only) |
| Talks to | the agent, through nginx: `/api/stork/*` -> `${API_URL}/api/*`, `/tableau/*` -> `${API_URL}/tableau/*` |
| Login | none for UAT |

**One image for every environment.** Nothing environment-specific is built in. At start the container
writes `config/app-config.json` from its environment and points nginx at `API_URL`. The browser only ever
calls this service, so there is no CORS to set up and the agent needs no public Route.

## Build

```bash
docker build -t hk-eli-chatbot-web:1.0.0 .
# Bank registry and Artifactory instead of Docker Hub and npmjs:
docker build \
  --build-arg NODE_IMAGE=<registry>/node:22.21.1-bookworm-slim \
  --build-arg NGINX_IMAGE=<registry>/nginx-unprivileged:1.28.0-alpine \
  --build-arg NPM_REGISTRY=https://<artifactory>/api/npm/<repo>/ \
  --secret id=ca,src=corp-ca.pem \
  -t <registry>/hk-eli/hk-eli-chatbot-web:1.0.0 .
```

GitHub Actions (`.github/workflows/image.yml`) runs the unit tests, builds the image, smoke-tests it
(random UID, config written, agent-down answer) and pushes `ghcr.io/<owner>/hk-eli-chatbot-web:<sha>`
(plus `latest` on main and `vX.Y.Z` on tags).

## Deploy

```bash
oc project <uat-namespace>
cd openshift
kustomize edit set image hk-eli-chatbot-web=<registry>/hk-eli/hk-eli-chatbot-web:1.0.0
oc apply -k .
oc rollout status deploy/hk-eli-chatbot-web
oc get route hk-eli-chatbot-web -o jsonpath='{.spec.host}'    # open https://<host>/
```

`openshift/` holds `configmap.yaml`, `deployment.yaml` (2 replicas, probes, limits, restricted security
context), `service.yaml` and `route.yaml` (edge TLS, 120 s timeout for streamed answers).

## Settings (ConfigMap `hk-eli-chatbot-web`)

| Variable | UAT value | Meaning |
| --- | --- | --- |
| `API_URL` | `http://hk-eli-chatbot-api:8080` | the agent's Service; change only if it lives elsewhere |
| `AS_OF_DATE` | `2026-11-19` | pins "today" for the fictional book; empty = real date |
| `REQUEST_TIMEOUT_MS` | `20000` | how long the widget waits for an answer |
| `APP_TIMEZONE` | `Asia/Hong_Kong` | business time zone |
| `MARKET_HOLIDAYS` | `2026-12-25,2026-12-26,2027-01-01` | comma-separated |
| `APP_NAME` | `HK ELI Chatbot` | title in the widget |

A bad value stops the container at start with a plain message in the pod log. Restart the pods after
changing the ConfigMap (`oc rollout restart deploy/hk-eli-chatbot-web`).

## What users see if the agent is down

nginx answers `/api/stork/*` with a 503 in the agent's own error shape within about 5 seconds, so the widget
shows its error card with "Try again" instead of hanging.

## Not in this image yet

- The `<hk-eli-chatbot>` web component bundle for Digimarkets is a separate change (PR #13 in hk-eli);
  UAT runs the standalone widget.
- No login; the Java edge with SSO comes later.
