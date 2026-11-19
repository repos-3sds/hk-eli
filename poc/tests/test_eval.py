"""Evaluation set v1 (tests/eval_questions.json) in rules mode: every case must pass."""
import json
from pathlib import Path

import pytest

from hkeli_poc.mock_tableau import InProcessMock
from hkeli_poc.stork.pipeline import answer

CASES = json.loads((Path(__file__).parent / "eval_questions.json").read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["q"][:50] for c in CASES])
def test_eval_case(case):
    a = answer(case["q"], InProcessMock(), "proposed")
    status = "OK" if a["status"] == "OK_WITH_WARNING" else a["status"]
    assert status == case["status"], a["headline"]
    if case["intent"] != "*":
        assert a["intent"] == case["intent"]
    got_view = a["evidence"][0]["record_id"] if a["evidence"] else None
    assert got_view == case["view"]
    if status == "OK":
        assert a["numbers"] and a["headline"]
