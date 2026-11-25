# Office guide: run both Dify apps (Chatflow and Agent)

\*Will be part of Ask-MIRA in future

The two YML files hold the apps, not the tools. Both apps call our Python service for every figure, so that
service must be running and reachable from Dify **before** you link anything:

| App | File | How it reaches our tools |
| --- | --- | --- |
| HK ELI Chatbot (Chatflow) | `dify/hk-eli-chat.yml` | HTTP steps to `/tools/context`, `/tools/answer`, `/tools/reword` |
| HK ELI Agent (Agent) | `dify/hk-eli-agent.yml` | MCP server at `/mcp`, tools `eli_ask` and `eli_views` |

Both use one bearer key, the **tool key**. Dify never calls Tableau; only Python does.

Start with `TABLEAU_MODE=mock`. Move to office Tableau only once both apps answer. Get the platform team's OK
for the network opening in step 2, and for sending masked figures and rows to the model Dify uses.

## 1. Install the service

Unzip `hk-eli-dify.zip` beside your other projects, then install as before (JFrog, hashed pins):

```bash
cd Projects/hk-eli-dify
python3.12 -m venv .venv
.venv/bin/python -m pip install --require-hashes -r requirements.txt
```

## 2. Make the tool key

Run once and keep the value only in ENAAS or an owner-only file. Never paste it in chat or config:

```bash
umask 077; python3 -c "import secrets;print(secrets.token_urlsafe(32))" > ~/.config/hk-eli/dify_tool_key
```

The same value goes in three places: the Python service (`DIFY_TOOL_KEY_FILE`), the Chatflow's
`ELI_TOOL_KEY`, and the MCP server header.

## 3. Run Python where Dify can reach it

Pick the case you have:

- **A. Dify in Docker on the same machine.** The address is `http://host.docker.internal:8051` (on Linux, add
  that host to Dify's `api` and `ssrf_proxy` containers). Dify's SSRF proxy blocks private hosts, so allow only
  that host and port in `docker/ssrf_proxy/squid.conf.template`, and raise `SSRF_DEFAULT_READ_TIME_OUT` in
  Dify's `.env` from 5 to 60 seconds. Restart Dify.
- **B. Dify on a bank server or OpenShift.** It cannot reach 127.0.0.1 on your laptop. Deploy the container
  (`Dockerfile`, `openshift/`, see `DEPLOY.md`). From the same namespace the address is
  `http://hk-eli-backend:8080`; otherwise an internal HTTPS address. The platform team allows that one host and
  port in Dify's proxy, and Dify must trust the bank CA.

**Warning:** `/tools/*` and `/mcp` need the key, but `/api/v1/ask` does not yet. With no SSO edge, anyone who
can reach the port can ask questions as the configured user. Keep it internal and use mock data until the edge
is in place.

First start (case A):

```bash
PORT=8051 TABLEAU_MODE=mock ORCHESTRATOR=native \
DIFY_TOOL_KEY_FILE=~/.config/hk-eli/dify_tool_key \
DIFY_TOOL_BASE_URL=http://host.docker.internal:8051 \
./run.sh
```

For case B put the same settings in the ConfigMap, and the key in the Secret (the OpenShift files have no
`DIFY_*` entries yet).

## 4. Prove the link from inside Dify

From Dify's `api` container (`docker exec -it docker-api-1 sh` in case A):

```bash
curl -s <address>/healthz                                 # {"ok":true}
curl -s -x http://ssrf_proxy:3128 <address>/healthz       # must also work: Dify's steps go through the proxy
curl -s -o /dev/null -w '%{http_code}\n' -X POST <address>/mcp   # 401 without the key: good
```

## 5. Link the Agent's tools (MCP)

1. Studio > Import DSL file > `hk-eli-agent.yml`.
2. **Tools > MCP > Add MCP server (HTTP)**
   - Server URL: `<address>/mcp`
   - Name: `HK ELI tools`
   - Server identifier: `hk-eli`
   - Headers: `Authorization` = `Bearer <tool key>`
   It must list `eli_ask` and `eli_views`.
3. Open **HK ELI Agent** > Tools > Add > HK ELI tools > tick both > **Publish**.

The Agent file's tool list is empty on purpose, so repeat step 3 after every re-import.

## 6. Link the Chatflow's tools (HTTP)

1. Studio > Import DSL file > `hk-eli-chat.yml`.
2. Open **HK ELI Chatbot** > Environment variables (the `{x}` icon):
   - `ELI_TOOL_BASE_URL` = `<address>` (no `/mcp`; the file's default is port 8050, so change it)
   - `ELI_TOOL_KEY` = `<tool key>` (secret)
3. **Publish**.

## 7. Choose the model

Both files use the Gemini plugin with `gemini-3.5-flash`. If the office Dify offers another model, change it on
the three LLM steps of the Chatflow (Understand, Word, Reword) and once in the Agent. The Agent's model must
support function calling. Only Gemini 3.5 Flash has been tested.

## 8. Turn both on

Each app > API Access > create a key (starts `app-`), each saved to its own owner-only file. Restart Python
with these added:

```bash
ORCHESTRATOR=dify \
DIFY_BASE_URL=<Dify address, without /v1> \
DIFY_API_KEY_FILE=~/.config/hk-eli/dify_chat_key \
DIFY_AGENT_API_KEY_FILE=~/.config/hk-eli/dify_agent_key \
```

(case A: `DIFY_BASE_URL=http://localhost`). One service now runs both apps. The Chatflow is the default;
`ORCHESTRATOR=dify_agent` makes the Agent the default, and each request can pick with `"engine": "chatflow"`
or `"engine": "agent"`.

## 9. Test both

```bash
.venv/bin/python scripts/compare_dify.py --base http://127.0.0.1:8051 --out compare.md
```

Use the container's address in case B. Bring back only pass/fail counts and differences, not the answers.

## If it fails

| You see | It means |
| --- | --- |
| 401 from a tool or MCP | The tool key differs between Python and Dify |
| 403, or "connection refused" in Dify | Dify's SSRF proxy blocks the address |
| Timeout on "Answer from data" | Dify's read timeout is still 5 s |
| 404 `UNKNOWN_REQUEST` | The request id expired (5 minutes), or more than one Python copy runs: keep one replica |
| Certificate error | Dify doesn't trust the bank CA |
| `DIFY_HTTP_401` in the widget | The app's API key file is wrong |
| Answers but every one is the template | The model step fails: check the model provider key in Dify |

Still open: per-user row-level security has not been tested; every question runs as the configured user.
