# hk-eli-backend: deploy to OpenShift (UAT)

The HK ELI Chatbot agent: the Python Stork pipeline over the 12 HK_ELI Tableau views, as one container.
It has no screens of its own for users; the web service (`hk-eli-frontend`) is what people open.
*Will be part of Ask-MIRA in future.*

| | |
| --- | --- |
| Image | `Dockerfile` here: Python 3.12.12 slim, packages from the hashed lock `requirements.txt` |
| Port | 8080 (HTTP) |
| User | non-root; works with OpenShift's random UID (group 0 owns `/app/var`) |
| Root filesystem | can be read-only; writes only to `/app/var` (SQLite store) and `/tmp` |
| Health | `GET /healthz` (alive), `GET /readyz` (store, knowledge, prompts, Tableau and model settings) |
| API | `POST /api/v1/ask`, `POST /api/v1/ask/stream` (server-sent events), history, feedback; OpenAPI at `/api/docs` |
| Login | none for UAT: every call runs as `DEFAULT_USER` |
| Data | the fictional HK_ELI workbook built in (`TABLEAU_MODE=mock`); no network needed |

## Build

```bash
docker build -t hk-eli-backend:1.0.0 .
# Bank registry and Artifactory instead of Docker Hub and PyPI:
docker build \
  --build-arg PYTHON_IMAGE=<registry>/python:3.12.12-slim-bookworm \
  --build-arg PIP_INDEX_URL=https://<artifactory>/api/pypi/<repo>/simple \
  --secret id=ca,src=corp-ca.pem \
  -t <registry>/hk-eli/hk-eli-backend:1.0.0 .
```

`--secret id=ca` is only for a proxy that re-signs TLS; the certificate is used during the install step and
is not left in the image. GitHub Actions (`.github/workflows/image.yml`) runs the tests, builds the image,
smoke-tests it as a random UID with a read-only root, and pushes `ghcr.io/<owner>/hk-eli-backend:<sha>`
(plus `latest` on main and `vX.Y.Z` on tags).

## Run locally

```bash
docker run --rm -p 8080:8080 --user 1000770000:0 --read-only --tmpfs /tmp --tmpfs /app/var hk-eli-backend:1.0.0
curl localhost:8080/readyz
```

## Deploy

```bash
oc project <uat-namespace>
cd openshift
kustomize edit set image hk-eli-backend=<registry>/hk-eli/hk-eli-backend:1.0.0   # or edit kustomization.yaml
oc apply -k .
oc rollout status deploy/hk-eli-backend
oc exec deploy/hk-eli-backend -- python -c "import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:8080/readyz').read().decode())"
```

`openshift/` holds: `configmap.yaml` (every setting), `pvc.yaml` (1 Gi for the SQLite store), `deployment.yaml`
(1 replica, probes, limits, restricted security context), `service.yaml` (internal, port 8080),
`secret.example.yaml` (template only) and `route.optional.yaml` (only if UAT wants to call the API directly).

Deploy the API before the web service: the web service forwards to `http://hk-eli-backend:8080`.

## Settings

All settings are environment variables (full list with comments: `.env.example`). The ones UAT is likely to touch:

| Variable | UAT value | Meaning |
| --- | --- | --- |
| `TABLEAU_MODE` | `mock` | `real` reads the bank's Tableau server (then set `TABLEAU_SERVER`, `TABLEAU_SITE`, `TABLEAU_USER` and the Connected App secret) |
| `LLM_MODE` | `off` | `stork` lets Gemini word the answers through the Stork API: build with `--build-arg STORK_SDK="ada_genai==<version>"` and put `ONE_BANK_ID`, `ONE_BANK_PASSWORD` in the Secret (optionally `SSL_CERT_FILE`). No URL is needed. Figures come from data either way |
| `DEMO_TODAY` | `2026-11-19` | business day of the fictional book; empty in real mode |
| `DEFAULT_USER` | `uat.user` | name stored with history while there is no login |
| `DB_PATH` | `/app/var/hkeli.sqlite` | conversation store on the PVC |
| `TRUST_EDGE_HEADERS` | `false` | `true` only once the Java edge (SSO) sits in front |

Secrets (`ONE_BANK_ID`, `ONE_BANK_PASSWORD`, `TABLEAU_SECRET_ID`, `TABLEAU_SECRET_VALUE`) come from the `hk-eli-backend` Secret,
or from Vault-rendered files via `<NAME>_FILE`. They are never in the image or the ConfigMap.

## Known limits for UAT

- One replica only while the store is SQLite. MariaDB support (`DB_URL`) is in a separate change; with it the
  Deployment can scale and the PVC goes away.
- No login. The Java 21 / Spring Boot edge (SSO, limits, audit) is not built yet.
- Mock mode uses fictional data only.
