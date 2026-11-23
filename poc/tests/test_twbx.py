"""The generated HK_ELI.twbx must carry every column and filter the POC's view contract expects."""
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import build_twbx as B  # noqa: E402
from hkeli_poc.stork.tableau_client import _header  # noqa: E402
from hkeli_poc.workbook import VIEWS, query_view  # noqa: E402

AGG = {"Sum": "SUM", "Avg": "AVG", "CountD": "CNTD"}


def test_every_sheet_matches_contract():
    root = ET.fromstring(B.twb().split("\n", 1)[1])
    cap = {c.get("name").strip("[]"): c.get("caption") for c in root.find("datasources/datasource[@name='federated.hkeli']").findall("column")}
    sheets = list(root.iter("worksheet"))
    assert len(sheets) == 14
    for ws in sheets:
        v = next(x for x in VIEWS["proposed"] if x["name"].lstrip("#") == ws.get("name"))
        inst = {ci.get("name"): (ci.get("column").strip("[]"), ci.get("derivation")) for ci in ws.iter("column-instance")}
        enc = ws.find("table/panes/pane/encodings")
        text = (ws.findtext("table/rows") or "") + (ws.findtext("table/cols") or "")
        text += "".join(e.get("column") for e in (enc if enc is not None else []))
        used = dict.fromkeys(re.findall(r"\[federated\.hkeli\]\.(\[[^\]]+\])", text))
        out = [_header(cap[inst[u][0]] if inst[u][1] in ("None", "User") else f"{AGG[inst[u][1]]}({cap[inst[u][0]]})")
               for u in used]
        expected, _, _ = query_view("proposed", v, {})
        assert [c for c in expected if c not in out] == [], ws.get("name")
        filtered = {inst[f.get("column").split(".")[-1]][0].replace("calc_", "") for f in ws.iter("filter")}
        assert [f for f in v["filters"] if f not in filtered] == [], ws.get("name")
