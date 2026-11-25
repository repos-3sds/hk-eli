"""Side by side: the Dify Chatflow and the Dify Agent app on the same questions, through one running agent.

    python scripts/compare_dify.py --base http://127.0.0.1:8051 [--questions file.json] [--out compare.md]

The agent must run with ORCHESTRATOR=dify (or dify_agent) and both DIFY_API_KEY and DIFY_AGENT_API_KEY set,
so each question can pick its app with "engine". Prints a Markdown table; --out also writes it with a JSON copy.
Answers are about the fictional mock workbook; nothing here reads real data.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import httpx

QUESTIONS = [
    "What is total outstanding ELI?",
    "Which Treasures clients have ELIs maturing next week?",
    "Who are the top 10 clients by ELI notional?",
    "How concentrated is the book by underlying?",
    "Compare outstanding ELI for Treasures and Treasures Private Client",
    "anything I should worry about with my book this month",
    "What is predicted to knock out this week?",
    "Should my client buy the NVDA ELI?",
]


def ask(c: httpx.Client, base: str, q: str, engine: str) -> dict:
    t0 = time.perf_counter()
    try:
        r = c.post(f"{base}/api/v1/ask", json={"question": q, "engine": engine})
        a = r.json()
    except (httpx.HTTPError, ValueError) as e:
        return {"engine": engine, "question": q, "error": type(e).__name__, "ms": round((time.perf_counter() - t0) * 1000)}
    m = a.get("meta") or {}
    return {"engine": engine, "question": q, "http": r.status_code, "status": a.get("status"),
            "insight": m.get("insight"), "orchestrator": m.get("orchestrator"), "headline": a.get("headline", ""),
            "bullets": a.get("bullets", [])[:5], "tools": [t.get("tool") for t in (m.get("agent") or {}).get("tools", [])],
            "attempts": (m.get("agent") or {}).get("attempts") or m.get("attempts"),
            "problems": m.get("agent_problems"), "ms": round((time.perf_counter() - t0) * 1000)}


def table(rows: list[dict]) -> str:
    out = ["| # | Question | App | Status | Path | Tools | ms | Answer |", "|---|---|---|---|---|---|---|---|"]
    for i, r in enumerate(rows):
        ans = (r.get("headline") or r.get("error") or "").replace("|", "/")[:220]
        out.append(f"| {i // 2 + 1} | {r['question'][:60]} | {r['engine']} | {r.get('status')} | {r.get('insight')} | "
                   f"{', '.join(r.get('tools') or []) or '-'} | {r['ms']} | {ans} |")
    return "\n".join(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8051")
    ap.add_argument("--questions")
    ap.add_argument("--out")
    args = ap.parse_args()
    qs = json.loads(Path(args.questions).read_text()) if args.questions else QUESTIONS
    rows = []
    with httpx.Client(timeout=180) as c:
        for q in qs:
            for engine in ("chatflow", "agent"):
                rows.append(ask(c, args.base.rstrip("/"), q, engine))
    md = table(rows)
    print(md)
    if args.out:
        Path(args.out).write_text(md + "\n")
        Path(args.out).with_suffix(".json").write_text(json.dumps(rows, indent=2))


if __name__ == "__main__":
    main()
