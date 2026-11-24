# HK ELI Chatflow on Dify

\*Will be part of Ask-MIRA in future

This folder holds the Dify side of the chatbot. The flow is: the UI sends a question, Python assembles the
context, Dify reads the question (only when our rules are unsure), fetches through our Python tool, words
the answer and streams it, and Python grades the figures and asks for one rewrite before falling back to
the template.

Dify never sees rows, client or position ids, or Tableau secrets. It sees a request id, prompts with
identifiers masked, and short JSON. Every figure still comes from code.

| File | What it is |
| --- | --- |
| `hk-eli-chat.yml` | The Chatflow to import into Dify 1.16 (generated, do not edit by hand) |
| `build_dsl.py` | Builds the file. `python dify/build_dsl.py`, or `--check` in tests |

## The graph

```
Start (request_id, mode)
 └ Mode? ── reword ─> Reword (HTTP) > Read reword > Word (LLM) > Answer (rewrite)
    └ answer ─> Context (HTTP) > Read context > Needs model?
                  ├ yes > Understand (LLM) ┐
                  └ no  > No model ────────┴> Model text > Answer from data (HTTP) > Read answer > Wordable?
                                                              ├ yes > Word (LLM) > Answer (worded)
                                                              └ no  > Answer (headline)
```

The three HTTP nodes call our tool service: `POST /tools/context`, `/tools/answer`, `/tools/reword`, with
`Authorization: Bearer <DIFY_TOOL_KEY>`. `GET /tools/openapi.json` describes the same three tools if you
prefer a Dify custom tool provider over HTTP nodes.

## Run it on a laptop (local Dify in Docker)

1. Start Dify: `cd ~/Documents/dify/docker && docker compose up -d`, then open http://localhost.
2. In Dify, Settings > Model Provider: install **Gemini** and add a key (or pick any chat model you have,
   then change the model on the three LLM nodes).
3. Studio > Import DSL file > `hk-eli-chat.yml`.
4. In the app, Environment variables: set `ELI_TOOL_KEY` to a long random value. Leave
   `ELI_TOOL_BASE_URL` as `http://host.docker.internal:8050` when the agent runs on the same Mac.
5. Publish, then API Access > create an API key (starts with `app-`).
6. Start the agent with:

   ```
   ORCHESTRATOR=dify \
   DIFY_BASE_URL=http://localhost \
   DIFY_API_KEY=app-... \
   DIFY_TOOL_KEY=<same value as ELI_TOOL_KEY> \
   ./run.sh
   ```

   `DIFY_BASE_URL` is the Dify host without `/v1`. In the bank, put the
   keys in ENAAS and use `DIFY_API_KEY_FILE` and `DIFY_TOOL_KEY_FILE`; nothing goes in code or config.

7. Ask a question in the widget. Stages show as Context, Understand, Answer from data, Word, then
   "Checking the figures". The draft headline streams marked as checking; the graded answer replaces it.

`ORCHESTRATOR=local` runs the same graph in-process with no Dify, which is what the tests use.
`ORCHESTRATOR=native` (the default) is the original pipeline.

## Errors

If Dify is down or its key is wrong, the stream sends an `error` event with code `DIFY_UNREACHABLE`,
`DIFY_TIMEOUT` or `DIFY_HTTP_401`, and `/api/v1/ask` returns 503. If a tool call fails, the Read node stops
the run with `ELI_TOOL_<status>` and the same error path applies. If an LLM node fails it returns empty text:
the answer tool then uses the rules reading, and the word step falls back to the template.

## The Agent variant (to compare)

`hk-eli-agent.yml` is Dify's **Agent** app type (agent-chat, function calling on Gemini). Our code still does
the context engineering first: it reads the question, picks the view and filters, fetches as the user, checks
the figures and masks client and position ids. That context pack goes to the agent with the question. The
agent writes the answer and decides by itself when to call our MCP tools for more:

| MCP tool | What it does |
| --- | --- |
| `eli_ask` | One more data question, answered by code from the views as the same user (at most 4 per question) |
| `eli_views` | Which views exist, what each covers |

Python then grades the agent's text against every figure it was given (the pack plus each tool result), asks
once for a rewrite in the same conversation, and otherwise keeps the template answer. Refusals,
clarifications and empty results are answered by code and never reach the agent.

Set it up:

1. Studio > Import DSL file > `hk-eli-agent.yml` (app "HK ELI Agent").
2. Tools > MCP > Add MCP server: URL `http://host.docker.internal:8051/mcp`, name `HK ELI tools`,
   server identifier `hk-eli`, header `Authorization: Bearer <DIFY_TOOL_KEY>`. It lists `eli_ask` and `eli_views`.
3. In the HK ELI Agent app, Tools > Add > HK ELI tools > both tools. Publish, then create its API key.
4. Run the agent with `DIFY_AGENT_API_KEY_FILE` as well as `DIFY_API_KEY_FILE`. `ORCHESTRATOR=dify` keeps the
   Chatflow as the default; `ORCHESTRATOR=dify_agent` makes the Agent the default. Each question can also pick
   with `"engine": "chatflow"` or `"engine": "agent"` in the request body.
5. Compare: `python scripts/compare_dify.py --base http://127.0.0.1:8051 --out compare.md`.
