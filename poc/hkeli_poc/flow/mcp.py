"""A small MCP server (Streamable HTTP, JSON responses) with the tools the Dify Agent may call.

Dify 1.16 adds it under Tools > MCP: URL http(s)://<agent>/mcp, header Authorization: Bearer <DIFY_TOOL_KEY>.
Every tool takes the request_id from the agent's instructions, so it runs as the user who asked, and every
figure it returns joins the evidence the grade checks the agent's answer against.

Only the methods Dify uses are served: initialize, notifications/initialized, ping, tools/list, tools/call.
"""
from __future__ import annotations

import json

from .. import config
from ..catalog import load as load_catalog
from . import agentic
from .tools import ToolError, turn

PROTOCOL = "2025-03-26"
VERSIONS = {"2024-11-05", "2025-03-26", "2025-06-18"}

TOOLS = [
    {"name": "eli_ask",
     "description": ("Answer one more HK ELI data question from the Tableau views, as the asking user. Code picks "
                     "the view, filters and figures; you get figures, a few masked rows, scope and freshness. Use it "
                     "only when the context you were given does not cover what the user asked. Ask one specific "
                     "question per call, in plain words (e.g. 'Outstanding ELI for Treasures by underlying')."),
     "inputSchema": {"type": "object", "required": ["request_id", "question"], "properties": {
         "request_id": {"type": "string", "description": "The request_id from your instructions"},
         "question": {"type": "string", "description": "One specific data question"}}}},
    {"name": "eli_views",
     "description": "List the HK ELI Tableau views: what each covers, its grain and the questions it answers.",
     "inputSchema": {"type": "object", "required": ["request_id"], "properties": {
         "request_id": {"type": "string", "description": "The request_id from your instructions"}}}},
]


def views() -> list[dict]:
    cfg = config.get()
    cat = load_catalog(str(cfg.catalog_path) if cfg.catalog_path else None)
    return [{"view": e["recordId"], "purpose": e.get("purpose", ""), "grain": e.get("grain", ""),
             "intents": e.get("intents", [])} for e in cat.entities if e.get("enabled", True)]


def _result(id_, result):
    return {"jsonrpc": "2.0", "id": id_, "result": result}


def _error(id_, code: int, msg: str):
    return {"jsonrpc": "2.0", "id": id_, "error": {"code": code, "message": msg}}


def call(name: str, args: dict, answer_fn) -> dict:
    try:
        t = turn(str(args.get("request_id") or ""))
    except ToolError as e:
        return {"error": e.code}
    if name == "eli_ask":
        q = str(args.get("question") or "").strip()
        if not q:
            return {"error": "QUESTION_REQUIRED"}
        return agentic.tool_ask(t, q, answer_fn)
    if name == "eli_views":
        t.extra.setdefault("tools_used", []).append({"tool": "eli_views"})
        return {"views": views()}
    return {"error": "UNKNOWN_TOOL"}


def handle(msg: dict, answer_fn) -> dict | None:
    """One JSON-RPC message in, one response out (None for notifications)."""
    if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0" or "method" not in msg:
        return _error(msg.get("id") if isinstance(msg, dict) else None, -32600, "Invalid Request")
    id_, method, params = msg.get("id"), msg["method"], msg.get("params") or {}
    if id_ is None:                       # notification (notifications/initialized, cancelled ...)
        return None
    if method == "initialize":
        v = params.get("protocolVersion")
        return _result(id_, {"protocolVersion": v if v in VERSIONS else PROTOCOL,
                             "capabilities": {"tools": {"listChanged": False}},
                             "serverInfo": {"name": "hk-eli-tools", "version": "1.0.0"},
                             "instructions": "HK ELI data tools. Figures come from code; pass the request_id you were given."})
    if method == "ping":
        return _result(id_, {})
    if method == "tools/list":
        return _result(id_, {"tools": TOOLS})
    if method == "tools/call":
        name = params.get("name")
        if name not in {t["name"] for t in TOOLS}:
            return _error(id_, -32602, f"Unknown tool: {name}")
        out = call(name, params.get("arguments") or {}, answer_fn)
        return _result(id_, {"content": [{"type": "text", "text": json.dumps(out, separators=(",", ":"))}],
                             "isError": "error" in out})
    return _error(id_, -32601, f"Method not found: {method}")
