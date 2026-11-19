"""Offline tests: tools on the real SQLite book, the figure check, the loop with a scripted model,
the Gemini schema cleaner, and the HTTP API. No network, no model.

    cd chatbot && PYTHONPATH=. .venv/bin/python -m unittest discover -s tests -v
"""
from __future__ import annotations

import json
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer

from eli_chat import agent, claims, prompts, skills, tools
from eli_chat.providers.base import ModelTurn, ToolCall
from eli_chat.providers.gemini import GeminiProvider, clean_schema
from eli_chat.providers.offline import OfflineProvider


class Scripted:
    """A fake model: first turn calls the given tool, second turn writes the given text."""
    name, model, written_by = "scripted", "fake", "model"

    def __init__(self, tool: str, args: dict, text: str):
        self.tool, self.args, self.text, self.calls = tool, args, text, 0

    def turn(self, system, messages, tools_, on_text=None):
        self.calls += 1
        if self.calls == 1:
            return ModelTurn(tool_calls=[ToolCall("t1", self.tool, self.args)])
        if on_text:
            on_text(self.text)
        return ModelTurn(text=self.text)


class ToolTests(unittest.TestCase):
    def test_skills_available(self):
        ok, msg = skills.available()
        self.assertTrue(ok, msg)

    def test_every_tool_returns_rows(self):
        for t in tools.TOOLS:
            args = {"query": "c-4821"} if t.name == "client_profile" else {}
            r = tools.run(t.name, args, "wms")
            self.assertIsNone(r.error, t.name)
            self.assertTrue(r.rows, t.name)
            self.assertEqual(r.as_of, "2026-11-02", t.name)
            json.loads(r.for_model())

    def test_concentration_matches_seed(self):
        r = tools.run("book_concentration", {})
        top = r.rows[0]
        self.assertEqual(top["underlying"], "NVDA")
        self.assertAlmostEqual(top["share_pct"], 24.63, places=2)
        self.assertEqual(top["limit_pct"], 25.0)

    def test_lead_stories(self):
        ko = tools.run("knockout_watch", {})
        self.assertIn(("Wong Ka Lok", -1.8), [(x["name"], x["last_vs_ko_pct"]) for x in ko.rows])
        c = tools.run("client_profile", {"query": "Chan Tai Man"})
        self.assertEqual(c.totals["client_id"], "c-4821")

    def test_bad_input_is_an_error_not_a_crash(self):
        self.assertTrue(tools.run("no_such_tool", {}).error)
        self.assertTrue(tools.run("client_profile", {}).error)
        self.assertEqual(tools.run("client_profile", {"query": "Nobody Fake"}).rows, [])
        r = tools.run("maturing_deals", {"business_days": "lots"})   # falls back to the default
        self.assertIsNone(r.error)


class ClaimTests(unittest.TestCase):
    def setUp(self):
        self.payload = tools.run("book_concentration", {}).for_model()

    def test_rounded_figures_match(self):
        c = claims.check("NVDA is USD 147.8m, 24.63% of book, under the 25% limit.", [self.payload])
        self.assertEqual(c.status, "all-matched", c)

    def test_invented_figures_are_caught(self):
        c = claims.check("NVDA is USD 155.2m, 31.5% of book.", [self.payload])
        self.assertEqual(sorted(c.unmatched), ["31.5%", "USD 155.2m"])

    def test_dates_ids_and_followups_ignored(self):
        c = claims.check("As of 2026-11-02, c-4821 deal P00004, 6 months.\nFOLLOWUPS: 99% | x", [self.payload])
        self.assertEqual(c.checked, 0)


class LoopTests(unittest.TestCase):
    def test_tool_then_answer(self):
        model = Scripted("book_concentration", {}, "NVDA is 24.63% of the book.\nFOLLOWUPS: a | b | c")
        events = list(agent.run_turn("How concentrated?", model, "pm"))
        kinds = [e["type"] for e in events]
        self.assertEqual(kinds[0], "start")
        self.assertIn("tool_start", kinds)
        final = events[-1]
        self.assertEqual(final["type"], "final")
        self.assertEqual(final["followups"], ["a", "b", "c"])
        self.assertEqual(final["check"]["status"], "all-matched")
        self.assertNotIn("FOLLOWUPS", final["answer"])

    def test_invented_figure_flagged_in_final(self):
        model = Scripted("book_concentration", {}, "NVDA is 40.1% of the book.")
        final = list(agent.run_turn("How concentrated?", model))[-1]
        self.assertEqual(final["check"]["unmatched"], ["40.1%"])

    def test_offline_provider_end_to_end(self):
        final = list(agent.run_turn("Which deals are near the knock-out barrier?", OfflineProvider()))[-1]
        self.assertEqual(final["type"], "final")
        self.assertEqual(final["tools_used"], ["knockout_watch"])
        self.assertIn("Wong Ka Lok", final["answer"])

    def test_split_followups(self):
        self.assertEqual(agent.split_followups("Hi\nFOLLOWUPS: x | y"), ("Hi", ["x", "y"]))
        self.assertEqual(agent.split_followups("Hi"), ("Hi", []))


class GeminiShapeTests(unittest.TestCase):
    def test_every_tool_schema_is_gemini_clean(self):
        for t in tools.TOOLS:
            s = json.dumps(clean_schema(t.parameters))
            self.assertNotIn('""', s, t.name)
            self.assertNotIn("const", s, t.name)

    def test_contents_round_trip(self):
        msgs = [{"role": "user", "text": "q"},
                {"role": "assistant", "text": "", "tool_calls": [ToolCall("1", "top_clients", {})], "raw": None},
                {"role": "tool", "results": [{"id": "1", "name": "top_clients", "content": "{}"}]}]
        c = GeminiProvider.contents(msgs)
        self.assertEqual([x["role"] for x in c], ["user", "model", "user"])
        self.assertEqual(c[2]["parts"][0]["function_response"]["name"], "top_clients")

    def test_prompt_names_persona_and_date(self):
        p = prompts.system_prompt("tsm", "2026-11-02", "2026-11-03")
        self.assertIn("CBG Treasury Sales Manager", p)
        self.assertIn("2026-11-02", p)


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from eli_chat.server import Handler
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def get(self, path):
        with urllib.request.urlopen(self.base + path) as r:
            return r.status, r.read()

    def test_health_and_page(self):
        status, body = self.get("/api/health")
        h = json.loads(body)
        self.assertTrue(h["ok"], h)
        self.assertEqual(h["note"], "*Will be part of Ask-MIRA in future")
        status, page = self.get("/")
        self.assertIn(b"HK ELI Chatbot", page)

    def test_chat_streams_events(self):
        req = urllib.request.Request(self.base + "/api/chat", method="POST",
                                     data=json.dumps({"question": "How concentrated is the book?",
                                                      "provider": "offline"}).encode(),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req) as r:
            text = r.read().decode()
        events = [json.loads(l[6:]) for l in text.splitlines() if l.startswith("data: ")]
        self.assertEqual(events[-1]["type"], "final")
        self.assertEqual(events[-1]["tools_used"], ["book_concentration"])

    def test_rejects_empty_question(self):
        req = urllib.request.Request(self.base + "/api/chat", method="POST", data=b'{"question": ""}',
                                     headers={"Content-Type": "application/json"})
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req)
        self.assertEqual(ctx.exception.code, 400)

    def test_no_path_traversal(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(self.base + "/assets/../eli_chat/settings.py")
        self.assertEqual(ctx.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
