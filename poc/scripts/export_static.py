"""Freeze the POC into one self-contained HTML page (for sharing without a server).

It runs the real pipeline against the mock Tableau for every demo, stores the
answer objects and the rendered embedded views, and inlines the page's CSS/JS.

    cd poc && python scripts/export_static.py out/hk-eli-poc.html
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from hkeli_poc import demos  # noqa: E402
from hkeli_poc.app import app  # noqa: E402
from hkeli_poc.mock_tableau import EMBED_CSS, embed_html  # noqa: E402
from hkeli_poc.workbook import find_view  # noqa: E402

STATIC = ROOT / "hkeli_poc" / "static"
client = TestClient(app)


def embed_doc(a: dict) -> str | None:
    e = a.get("embed")
    if not e:
        return None
    view = find_view(a["site"], e["view"])
    inner = embed_html(a["site"], view, e["filters"], e["highlight"], stale=a.get("scenario") == "stale", frame=False)
    return (f"<!doctype html><html><head><meta charset='utf-8'><style>{EMBED_CSS}</style></head>"
            f"<body>{inner}</body></html>")


def ask(q, site="proposed", scenario=None):
    a = client.post("/api/ask", json={"question": q, "site": site, "scenario": scenario}).json()
    a["embed_doc"] = embed_doc(a)
    return a


def main(out: Path):
    results = {}
    for d in demos.DEMOS:
        r = client.get(f"/api/demos/{d['id']}").json()
        results[d["id"]] = {"current": r["current"], "proposed": r["proposed"],
                            "embeds": {"current": embed_doc(r["current"]), "proposed": embed_doc(r["proposed"])}}
    first = ask("Which branches in D1 have the largest TRE maturity in the next 30 days?")
    second = ask(first["followups"][0])
    flow = [first, second, ask("Show me the distribution on 9988 HK"), ask("Who are the PB clients maturing next week?")]
    data = {"demos": demos.DEMOS, "results": results, "flow": flow}

    css = (STATIC / "app.css").read_text()
    js = (STATIC / "app.js").read_text()
    tpl = (Path(__file__).parent / "static_template.html").read_text()
    html = (tpl.replace("/*APP_CSS*/", css).replace("/*APP_JS*/", js)
               .replace("/*DATA*/", "window.STATIC_DATA = " + json.dumps(data).replace("</", "<\\/") + ";"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)
    print(f"wrote {out} ({len(html) // 1024} KB)")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "out" / "hk-eli-poc.html"))
