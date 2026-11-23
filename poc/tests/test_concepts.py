"""Concept resolution and value translation (logical-query-mcp rules, re-implemented for HK ELI).

The question set is the discovery transcript's own examples (Concept Resolution section 27), plus
search-quality checks in the style of logical-query-mcp's tests/test_search_quality.py: directly worded
concepts, coded values, reworded concepts through alternatives, absent concepts, and the full-match rule.
"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

from hkeli_poc import catalog as CAT
from hkeli_poc.stork.concepts import matcher, tokens
from hkeli_poc.stork.values import translate

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def cat():
    return CAT.load()


@pytest.fixture(scope="module")
def m(cat):
    return matcher(cat)


def test_committed_catalog_matches_the_builder():
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "build_catalog.py"), "--check"], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout


def test_catalog_has_every_view_and_concept_is_valid(cat):
    assert len(cat.entities) == 14          # 12 views + W2 data-as-of + W8 position scenario
    assert CAT.validate(cat.data) == []
    assert "maturity-calendar-n30-tre" in cat.views_for("predict_maturity")
    assert cat.views_for("coupon") == []    # known concept, no view carries it


def test_broken_catalog_fails_loudly(cat):
    bad = json.loads(json.dumps(cat.data))
    bad["concepts"][0]["kind"] = "nonsense"
    bad["entities"][0]["fields"].append({"name": "not_a_concept"})
    problems = CAT.validate(bad)
    assert any("unknown kind" in p for p in problems) and any("not a concept" in p for p in problems)
    with pytest.raises(ValueError):
        CAT.from_dict(bad)


# discovery examples: question -> concepts (and values) the transcript resolves
DISCOVERY = [
    ("How much TRE ELI is outstanding?", {"bp_div_type": "Treasures(HK)", "volume_bu": None, "deal_status": None}),
    ("How many TRE customers are predicted to KO?", {"bp_div_type": "Treasures(HK)", "predict_result": "KO", "cif_id": None}),
    ("Show maturity calendar for D1 next 30 days.", {"cust_district": "TRE-D1", "predict_maturity": None}),
    ("Which branches in D1 have most maturity?", {"cust_district": "TRE-D1", "cust_branch": None, "predict_maturity": None}),
    ("Show WPS concentration for D2.", {"wps": None, "cust_district": "TRE-D2"}),
    ("Show me the distribution on 9988 HK.", {"mtm_bin": None}),
    ("Simulate PB WPS exposure with market spot at 95%.", {"bp_div_type": "PB", "wps": None, "market_spot": None}),
]


@pytest.mark.parametrize("q,want", DISCOVERY)
def test_discovery_examples_resolve(m, q, want):
    r = m.resolve(q)
    for cid, value in want.items():
        assert cid in r.ids(), f"{cid} missing for {q!r}: {r.summary()}"
        if value:
            assert value in r.values(cid)


def test_glossary_reads_short_forms(m):
    assert m.resolve("Which deals were KO'd?").values("predict_result") == ["KO"]
    assert m.resolve("list the RMs in Central").ids()[:1] == ["rm_name"]
    assert m.resolve("Alibaba exposure").values("wps") == ["9988 HK"]


def test_longer_name_never_hides_a_value(m):
    r = m.resolve("How much is predicted KO next month?")
    assert "predict_result" in r.ids() and r.values("predict_result") == ["KO"]


def test_full_match_rule(m):
    # one shared word is not a match: "tax status" must not land on deal status
    assert "deal_status" not in m.resolve("what is the tax status of the customer").ids()
    assert m.search(["tax status"])["concepts"][0]["status"] == "not_found"
    assert m.search(["dividend"])["concepts"][0]["status"] == "not_found"


def test_concepts_no_view_carries_are_gaps(m):
    for q, cid in [("What coupon do TRE ELIs pay?", "coupon"), ("What is the tenor of live deals?", "tenor"),
                   ("Show the result announcement date for D1", "announcement_date")]:
        gaps = [h.concept for h in m.resolve(q).gaps()]
        assert cid in gaps, q


def test_explicit_search_found_reworded_absent(m):
    out = m.search(["predicted maturity", "KO'd", {"text": "how long the deal runs", "alternatives": ["tenor", "duration"]},
                    "how long the deal runs", "carbon footprint"])
    st = {c["concept"]: c["status"] for c in out["concepts"]}
    assert out["concepts"][0]["fields"][0]["id"] == "predict_maturity"        # exact name first
    assert out["concepts"][1]["fields"][0]["id"] == "predict_result"          # coded value via the glossary
    assert out["concepts"][2]["status"] == "found" and out["concepts"][2]["fields"][0]["id"] == "tenor"
    assert out["concepts"][3]["status"] == "not_found"                         # bare rewording is not guessed
    assert st["carbon footprint"] == "not_found" and "guidance" in out["concepts"][4]
    assert out["coverage"]["missing"] == ["how long the deal runs", "carbon footprint"]


def test_tokens_stem_plurals_and_split_short_forms():
    assert tokens("Branches, RMs and currencies") == ["branch", "rm", "currency"]
    assert tokens("KO'd", keep_filler=True) == ["ko", "d"]


# ---- value translation
def test_translate_exact_unique_ambiguous_none(cat):
    assert translate(cat, "cust_district", "D2").value == "TRE-D2"
    assert translate(cat, "cust_branch", "mong kok").status == "exact"
    r = translate(cat, "cust_branch", "kowloon")
    assert r.status == "unique" and r.value == "Kowloon Bay"
    r = translate(cat, "cust_branch", "bay")
    assert r.status == "ambiguous" and set(r.candidates) == {"Causeway Bay", "Kowloon Bay"}
    r = translate(cat, "cust_district", "D4")
    assert r.status == "none" and r.value is None and r.suggestions


# ---- in the pipeline
def _ask(q):
    from hkeli_poc import app as appmod
    from hkeli_poc.stork.pipeline import answer
    appmod.ensure_started()
    return answer(q, appmod.tableau_http(), "proposed")


def test_unknown_district_is_asked_not_answered():
    a = _ask("How much TRE ELI matures in D4 in the next 30 days?")
    assert a["status"] == "NEEDS_CLARIFICATION" and a["reasons"] == ["VALUE_NOT_FOUND"]
    assert "D4" in a["headline"] and "D1" in a["headline"] and not a["evidence"]
    assert any("D1" in f for f in a["followups"])


def test_ambiguous_branch_is_asked():
    a = _ask("How much TRE ELI matures in Bay branch in the next 30 days?")
    assert a["status"] == "NEEDS_CLARIFICATION" and a["reasons"] == ["VALUE_AMBIGUOUS"]
    assert "Causeway Bay" in a["headline"] and "Kowloon Bay" in a["headline"]
    assert len(a["followups"]) == 2


def test_partial_branch_name_resolves_when_it_fits_one():
    a = _ask("How much TRE ELI matures in Kowloon branch in the next 30 days?")
    assert a["status"].startswith("OK")
    assert "Kowloon Bay" in a["scope"]


def test_concept_no_view_carries_is_unsupported_with_honest_text():
    a = _ask("What coupon do our TRE ELIs pay?")
    assert a["status"] == "UNSUPPORTED" and a["reasons"] == ["CONCEPT_NOT_SUPPORTED"]
    assert "none of the published HK_ELI views carries it" in a["headline"]


def test_trace_shows_concepts_and_the_switch_turns_it_off(monkeypatch):
    a = _ask("Which branches in D1 have the largest TRE maturity in the next 30 days?")
    step = next(s for s in a["trace"] if s["name"] == "Concepts")
    assert "cust_district=TRE-D1" in step["detail"]["found"] and a["meta"]["concept_matcher"] is True
    monkeypatch.setenv("CONCEPT_MATCHER", "false")
    from hkeli_poc import config
    config.reload()
    b = _ask("What coupon do our TRE ELIs pay?")
    assert b["status"] != "UNSUPPORTED" or "views carries" not in b["headline"]
    assert not any(s["name"] == "Concepts" for s in b["trace"]) and b["meta"]["concept_matcher"] is False


def test_office_catalog_path_is_used(tmp_path, monkeypatch, cat):
    data = json.loads(json.dumps(cat.data))
    for c in data["concepts"]:
        if c["id"] == "predict_maturity":
            c["aliases"].append("roll date")
    p = tmp_path / "merged.json"
    p.write_text(json.dumps(data))
    monkeypatch.setenv("CATALOG_PATH", str(p))
    from hkeli_poc import config
    config.reload()
    a = _ask("Which TRE positions have a roll date in the next 30 days?")
    step = next(s for s in a["trace"] if s["name"] == "Concepts")
    assert "predict_maturity" in step["detail"]["found"]


# ---- office importer (runs in the office on the real catalog; here on a made-up file in its 1.3 shape)
OFFICE_SAMPLE = {
    "schema_version": "1.3", "catalog_id": "synthetic-hkeli-example",
    "concepts": [
        {"id": "announcement_date", "kind": "event", "aliases": ["announcement date", "outcome announcement date"],
         "description": "Expected result publication date."},
        {"id": "predict_maturity", "kind": "event", "aliases": ["roll date", "predicted maturity"]},
        {"id": "cust_district", "kind": "dimension", "aliases": ["sales district"],
         "values": ["TRE-D1", "TRE-D2", "TRE-D3", "TRE-D4"]},
        {"id": "asset_geography", "kind": "geo", "aliases": ["underlying 1 country", "outstanding"]},
        {"kind": "dimension", "aliases": ["no id"]},
    ],
    "views": [{"record_id": "x"}],
}


def test_office_import_merges_and_prints_counts_only(tmp_path, cat):
    src = tmp_path / "office.json"
    src.write_text(json.dumps(OFFICE_SAMPLE))
    out = tmp_path / "merged.json"
    r = subprocess.run([sys.executable, str(ROOT / "office" / "import_catalog.py"), "--office", str(src), "--out", str(out)],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    for secret in ("roll date", "underlying 1 country", "TRE-D4", "sales district"):
        assert secret not in r.stdout                   # counts only: nothing from the office catalog is printed
    assert "matched: 3" in r.stdout and "added: 1" in r.stdout and "skipped_no_id: 1" in r.stdout
    assert "value_lists_replaced: 1" in r.stdout and "unknown_kind_mapped: 1" in r.stdout
    merged = CAT.load(str(out))
    assert "roll date" in merged.concept("predict_maturity")["aliases"]
    assert [v["value"] for v in merged.values("cust_district")][-1] == "TRE-D4"
    assert merged.concept("cust_district")["values"][0].get("short") == "D1"   # synthetic details kept for known values
    assert merged.views_for("asset_geography") == []


def test_office_alias_on_a_no_view_concept_cannot_block_an_answer(tmp_path, monkeypatch, cat):
    sys.path.insert(0, str(ROOT / "office"))
    import import_catalog
    merged, _ = import_catalog.merge(cat.data, OFFICE_SAMPLE)
    p = tmp_path / "m.json"
    p.write_text(json.dumps(merged))
    monkeypatch.setenv("CATALOG_PATH", str(p))
    from hkeli_poc import config
    config.reload()
    a = _ask("What is total outstanding ELI?")          # 'outstanding' is also an alias of a no-view concept
    assert a["status"].startswith("OK")
    b = _ask("Show the underlying 1 country for TRE positions")
    assert b["status"] == "UNSUPPORTED" and "views carries" in b["headline"]


@pytest.mark.parametrize("name,cid", [
    ("strike_pct", "strike_percentage"), ("ko_pct", "ko_percentage"), ("ki_pct", "ki_percentage"),
    ("deal_id", "asset_id"), ("mtm_pct", "wps_mtm"), ("notional_hkd", "volume_bu"), ("underlying_2", "asset_tks_2"),
    ("client count", "distinct_customers"),
])
def test_documentation_extract_field_names_land_on_our_fields(cat, m, name, cid):
    """The colleague's extract (eli-extract.md) names the same fields differently; both spellings resolve."""
    if cid == "distinct_customers":
        assert any(name in mt["synonyms"] for mt in cat.data["metrics"] if mt["id"] == cid)
        return
    found = m.search([name])["concepts"][0]
    assert found["status"] == "found" and found["fields"][0]["id"] == cid, found


def test_short_segment_names_still_resolve(m):
    for short, value in [("TRE", "Treasures(HK)"), ("TPC", "Treasures(TPC)"), ("PB", "PB")]:
        assert value in m.resolve(f"How much {short} ELI is outstanding?").values("bp_div_type"), short
