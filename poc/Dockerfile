# HK ELI Chatbot API (the Python Stork agent) for OpenShift UAT.
#   docker build -t hk-eli-backend:local .
#   docker run -p 8080:8080 hk-eli-backend:local
# Base image and package index are build arguments so the bank build can point at its own registry and
# Artifactory without editing this file. Versions are pinned; Python packages install from the hashed lock.
ARG PYTHON_IMAGE=python:3.12.12-slim-bookworm

FROM ${PYTHON_IMAGE} AS deps
ARG PIP_INDEX_URL=https://pypi.org/simple
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY requirements.txt .
# Optional corporate CA for a proxy that re-signs TLS: docker build --secret id=ca,src=corp-ca.pem .
# It is used for this step only and never lands in the image.
RUN --mount=type=secret,id=ca,required=false \
    python -m venv /opt/venv \
 && if [ -s /run/secrets/ca ]; then export PIP_CERT=/run/secrets/ca; fi \
 && /opt/venv/bin/pip install --index-url "${PIP_INDEX_URL}" --require-hashes --no-deps -r requirements.txt

FROM ${PYTHON_IMAGE}
LABEL org.opencontainers.image.title="hk-eli-backend" \
      org.opencontainers.image.description="HK ELI Chatbot agent API. *Will be part of Ask-MIRA in future." \
      io.openshift.expose-services="8080:http"
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 PORT=8080 ALLOW_PUBLIC_BIND=true \
    DB_PATH=/app/var/hkeli.sqlite \
    TABLEAU_MODE=mock LLM_MODE=off
WORKDIR /app
COPY --from=deps /opt/venv /opt/venv
COPY hkeli_poc ./hkeli_poc
# OpenShift runs the pod as a random UID in group 0: give group 0 the same rights as the owner on var/.
RUN mkdir -p /app/var && chgrp -R 0 /app && chmod -R g=u /app
USER 1001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD python -c "import urllib.request,os;urllib.request.urlopen('http://127.0.0.1:%s/healthz'%os.environ.get('PORT','8080'),timeout=2)"
CMD ["python", "-m", "hkeli_poc"]
