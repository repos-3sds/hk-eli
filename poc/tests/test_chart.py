"""Our own answer charts must be drawn from the same view rows as the answer: totals reconcile with the headline."""
import pytest
from fastapi.testclient import TestClient

from hkeli_poc.app import app

client = TestClient(app)


def ask(q):
    return client.post("/api/ask", json={"question": q, "site": "proposed"}).json()


@pytest.mark.parametrize("q,kind", [
    ("Which branches in D1 have the largest TRE maturity in the next 30 days?", "hbar"),
    ("How much TRE ELI is predicted to mature in the next 30 days?", "columns"),
    ("Compare outstanding ELI across districts for TRE", "hbar"),
    ("Which WPS has the largest outstanding ELI exposure overall?", "hbar"),
    ("Show me the distribution on 9988 HK", "bubble"),
    ("What is total outstanding ELI?", "kpi"),
])
def test_chart_matches_answer_total(q, kind):
    a = ask(q)
    c = a["chart"]
    assert a["status"] == "OK" and c and c["kind"] == kind
    hkd = [n["value"] for n in a["numbers"] if n["measure"] == "hkd"]
    if kind == "kpi":
        assert c["value"] == pytest.approx(hkd[0])
    elif kind == "bubble":
        assert sum(p["size"] for p in c["points"]) == pytest.approx(hkd[0], rel=1e-6)
    else:
        # The largest bar and the chart's grand total are both figures the headline states.
        total = sum(x["total"] for x in c["categories"])
        assert any(abs(max(x["total"] for x in c["categories"]) - v) < 1 for v in hkd)
        assert c.get("more") or any(abs(total - v) < 1 for v in hkd) or len(hkd) == 1


def test_branch_chart_highlights_the_lead_branch():
    c = ask("Which branches in D1 have the largest TRE maturity in the next 30 days?")["chart"]
    assert c["highlight"] == [c["categories"][0]["key"]]
