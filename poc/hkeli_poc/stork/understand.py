"""Steps 1-2: pre-parse and understanding.

In the target design (rediscovery doc, 06 PL 11.1 C5/C6) a deterministic
pre-parser feeds hints to Gemini call #1, which returns a structured intent.
This POC runs the deterministic path only, so it works with no model key and
gives the same answer every time in front of the workbook owners. The output
shape is the intent contract from agent-intent-classification.md (intent,
grain, filters, time scope, ranking) plus `assumptions[]`.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

from .. import catalog as CAT
from .. import knowledge as KB
from . import concepts as CON
from .values import translate


def _kb():
    from .. import config
    return KB.load(str(config.get().knowledge_dir))


def _catalog():
    from .. import config
    cfg = config.get()
    if not cfg.concept_matcher:
        return None
    return CAT.load(str(cfg.catalog_path) if cfg.catalog_path else None)


GAP_TEXT = ("{label} is in the catalog, but none of the published HK_ELI views carries it, "
            "so there is no figure I can show for it.")
NOT_A_BRANCH = CON.FILLER | {"which", "each", "every", "per", "largest", "biggest", "top", "most", "by", "my", "this",
                             "that", "those", "these", "their", "other", "any", "some", "same", "one", "d1", "d2", "d3"}


MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


@dataclass
class Intent:
    question: str
    intent: str = "unknown"
    grain: str = ""
    segments: list[str] = field(default_factory=list)
    district: str | None = None
    branch: str | None = None
    wps: str | None = None
    result: str | None = None
    window_days: int | None = None
    on_date: str | None = None
    ranking: bool = False
    assumptions: list[str] = field(default_factory=list)
    hints: dict = field(default_factory=dict)
    unsupported: list[dict] = field(default_factory=list)   # glossary concepts this build can't answer
    source: str = "rules"                                   # rules | gateway | gateway->rules
    concepts: list[dict] = field(default_factory=list)      # catalog concepts the question names (concept matcher)
    shock: dict | None = None                               # what-if: {kind, ticker, move, assumption}
    clarify: dict | None = None                             # a value the user named that is ambiguous or unknown
    candidates: list[str] = field(default_factory=list)     # every intent a rule matched, in rule order
    confidence: str = "none"                                # high | medium | none (rules); the model may lift it

    def scope_line(self) -> str:
        bits = []
        bits.append(" + ".join(s.replace("Treasures(HK)", "TRE").replace("Treasures(TPC)", "TPC") for s in self.segments) or "All segments")
        if self.district:
            bits.append(self.district.replace("TRE-", ""))
        if self.branch:
            bits.append(self.branch)
        if self.wps:
            bits.append(f"WPS {self.wps}")
        if self.result:
            bits.append(f"predicted {self.result}")
        if self.shock:
            sh = self.shock
            if sh.get("move") is None:
                bits.append("what-if (move not given)")
            elif sh["kind"] == "market":
                bits.append(f"what-if: market spot {round((1 + sh['move']) * 100)}%")
            else:
                bits.append(f"what-if: {sh['ticker']} {'-' if sh['move'] < 0 else '+'}{abs(round(sh['move'] * 100))}%")
        if self.on_date:
            bits.append(f"predicted maturity on {self.on_date}")
        elif self.window_days:
            bits.append(f"predicted maturity next {self.window_days} days")
        return " · ".join(bits)


def preparse(q: str, today: date) -> dict:
    """Deterministic hints from the glossary. These are facts the model may not override."""
    kb = _kb()
    s, fixes = normalise(q, kb)
    hints: dict = {"segments": [], "text": s, "corrections": fixes}
    for pat, val in kb.value_patterns("bp_div_type"):
        if re.search(pat, s) and val not in hints["segments"]:
            hints["segments"].append(val)
    for pat, val in kb.value_patterns("cust_district"):
        if re.search(pat, s):
            hints["district"] = val
            break
    for b in kb.branches:
        if b.lower() in s:
            hints["branch"] = b
    m = re.search(r"\b(\d{3,4})\s*(?:\.?\s?hk)\b", s)
    if m:
        hints["wps"] = f"{int(m.group(1))} HK"
    else:
        # a bare stock code ("9988 mtm dist?") counts only when it is a ticker the glossary knows
        known = set(kb.ticker_aliases.values())
        m = re.search(r"(?<![\d.%-])\b(\d{3,4})\b(?!\s*(?:%|days?|weeks?|months?|bn|b\b|m\b|k\b))", s)
        if m and f"{int(m.group(1))} HK" in known:
            hints["wps"] = f"{int(m.group(1))} HK"
    for alias, t in kb.ticker_aliases.items():
        if re.search(rf"\b{alias}\b", s):
            hints["wps"] = t
    for pat, val in kb.value_patterns("predict_result"):
        if re.search(pat, s):
            hints["result"] = val
            break
    hints["unsupported"] = [c["id"] for c in kb.unsupported_hits(s)]
    m = re.search(r"\b(?:next|within|coming|over the next|in the next|in)\s+(\d+)\s*(day|week|month)", s) or \
        re.search(r"\b(\d+)\s*(day|week|month)s?\b", s)
    if m:
        n = int(m.group(1))
        hints["window_days"] = n * {"day": 1, "week": 7, "month": 30}[m.group(2)]
    elif re.search(r"\b(next|coming|this) week\b|\bnext 7\b", s):
        hints["window_days"] = 7
    elif re.search(r"\bnext fortnight\b|\bnext two weeks\b", s):
        hints["window_days"] = 14
    elif re.search(r"\b(next|coming) month\b", s):
        hints["window_days"] = 30
    m = re.search(r"\b(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", s)
    if m:
        mo = MONTHS[m.group(2)]
        yr = today.year if mo >= today.month - 1 else today.year + 1
        hints["on_date"] = date(yr, mo, int(m.group(1))).isoformat()
    if hints.get("window_days") and not 1 <= hints["window_days"] <= 366:
        hints.pop("window_days")
    hints["ranking"] = bool(re.search(r"\b(largest|top|most|biggest|highest|rank|which)\b", s))
    cat = _catalog()
    if cat is not None:
        _catalog_hints(s, s, cat, hints)
    return hints


def _catalog_hints(q: str, s: str, cat, hints: dict) -> None:
    """Concept matcher (logical-query-mcp rules) on top of the regex pre-parse.

    Regex hints win. The matcher fills values the regex missed (catalog aliases, for example the office
    catalog's synonyms), reports concepts no view carries, and asks when a named value is ambiguous
    or unknown. Every value still comes from the catalog's lists.
    """
    res = CON.matcher(cat).resolve(q)
    hints["concepts"] = [dict(c, flag=True) if cat.has(c["concept"]) and cat.concept(c["concept"])["kind"] == "flag" else c
                         for c in res.summary()]
    seg = [v for v in res.values("bp_div_type") if v not in hints["segments"]]
    if not hints["segments"] and seg:
        hints["segments"] = seg
    for key, cid in (("district", "cust_district"), ("branch", "cust_branch"), ("result", "predict_result"), ("wps", "wps")):
        vals = res.values(cid)
        if not hints.get(key) and len(vals) == 1:
            hints[key] = vals[0]
    hints["gaps"] = [{"id": h.concept, "label": h.label} for h in res.gaps() if h.reason == "no published view carries it"]
    # an unknown district number ("D4") is a value the user named: say so instead of answering for all districts
    m = re.search(r"\b(?:district\s*|d\s?)(\d{1,2})\b", s)
    if m and not hints.get("district") and cat.has("cust_district"):
        r = translate(cat, "cust_district", f"D{int(m.group(1))}")
        if r.status in ("exact", "unique"):
            hints["district"] = r.value
        elif r.status == "none":
            hints["clarify"] = {"code": "VALUE_NOT_FOUND", "concept": "cust_district", "text": m.group(0),
                                "options": r.suggestions}
    # "<name> branch": a partial branch name resolves when it fits one branch and is asked about when it fits several
    if not hints.get("branch") and cat.has("cust_branch"):
        for m in re.finditer(r"\b((?:[a-z]+\s)?[a-z]+)\s+branch(?:es)?\b", s):
            words = [w for w in m.group(1).split() if w not in NOT_A_BRANCH]
            if not words:
                continue
            r = translate(cat, "cust_branch", " ".join(words))
            if r.status in ("exact", "unique"):
                hints["branch"] = r.value
                break
            if r.status == "ambiguous":
                hints["clarify"] = {"code": "VALUE_AMBIGUOUS", "concept": "cust_branch", "text": " ".join(words),
                                    "options": r.candidates}
                break


WHATIF = re.compile(r"what\s*if|\bif\b.*\b(fall|falls|fell|drop|drops|decline|declines|crash|crashes|"
                    r"rise|rises|rally|rallies|gain|gains|jump|jumps|move|moves|goes|go|slides?|sinks?|tumbles?)\b|simulat|scenario|stress|shock|"
                    r"market\s*spot|spot\s+(at|to|of)\b|\b(suppose|supposing|assume|assuming|imagine|hypothetically)\b|"
                    r"\b(impact|affect|affected|happens?)\b.*\b(fall|falls|drop|drops|crash|rise|rises|down|up)\b|"
                    r"\b(fall|falls|drop|drops|crash|crashes|rise|rises|down|up)\b.*\b(impact|affect|affected|happens?)\b|"
                    r"(?<![\w.])[-+−]\s*\d+(?:\.\d+)?\s*%", re.I)
DOWN = r"(?:fall|falls|fell|falling|drop|drops|dropped|declines?|crash(?:es)?|down|lower|slides?|sinks?|tumbles?)"
UP = r"(?:rise|rises|rising|rally|rallies|gains?|jumps?|up|higher|climbs?)"


def parse_shock(q: str, ticker: str | None) -> dict | None:
    """What-if wording -> {kind, ticker, move, assumption}. move is None when no size was given (ask, never guess).

    "NVDA falls 10%", "if Nvidia drops by 10 %", "NVDA -10%", "NVDA falls below 10%" (read as a 10% drop, and
    said so), "market spot 80%", "market at 0.8", "market falls 20%" (= spot 80%).
    """
    s = q.lower()
    if not WHATIF.search(s):
        return None
    assumption = None
    # "from 100 to 80%": the level it goes to is the one that counts
    m = re.search(r"spot\b[^?.]*?\bfrom\s+\d+(?:\.\d+)?\s*%?\s*(?:to|->|→)\s*(\d+(?:\.\d+)?)\s*(%?)", s) or \
        re.search(r"market\s*spot\s*(?:is|at|to|of|=|becomes|goes to|changes to|moves to)?\s*(\d+(?:\.\d+)?)\s*(%?)", s) or \
        re.search(r"spot\s+(?:at|to|of)\s+(\d+(?:\.\d+)?)\s*(%?)", s)
    if m:
        x = float(m.group(1))
        spot = x / 100 if (m.group(2) or x > 3) else x
        if not 0.3 <= spot <= 1.6:
            return {"kind": "market", "ticker": None, "move": None, "assumption": None}
        return {"kind": "market", "ticker": None, "move": round(spot - 1, 4), "assumption": None}
    market = bool(re.search(r"\b(market|everything|all (stocks|underlyings)|whole book|across the board)\b", s)) and not ticker
    num = r"(\d+(?:\.\d+)?)\s*(?:%|percent|pc\b)"
    move = None
    m = re.search(rf"{DOWN}\s+(?:by\s+)?(below\s+|under\s+)?(?:about\s+|another\s+)?{num}", s)
    if m:
        move = -float(m.group(2)) / 100
        if m.group(1):
            assumption = (f"Read '{m.group(0).strip()}' as a {m.group(2)}% drop from today's level, "
                          f"not a fall to {m.group(2)}% of the initial price.")
    else:
        m = re.search(rf"{UP}\s+(?:by\s+)?(?:about\s+)?{num}", s)
        if m:
            move = float(m.group(1)) / 100
        else:
            m = re.search(r"(?<![\w.])([-+−])\s*(\d+(?:\.\d+)?)\s*%", s)
            if m:
                move = (-1 if m.group(1) in "-−" else 1) * float(m.group(2)) / 100
    if move is not None and not -0.6 <= move <= 0.5:
        move = None
    if not ticker and not market:
        if move is None and not re.search(r"market|spot", s):
            return {"kind": "single", "ticker": None, "move": None, "assumption": None}
        market = True
    return {"kind": "market" if market else "single", "ticker": None if market else ticker,
            "move": None if move is None else round(move, 4), "assumption": assumption}


# ---------------------------------------------------------------- normalise: shorthand and typos
# Hong Kong desk shorthand and Cantonese particles. Applied to a lower-case copy; the user's words stay as typed.
SHORTHAND = [
    (r"\bo/s\b", "outstanding"), (r"\bmark[\s-]to[\s-]market\b", "mtm"), (r"\bmkt\b", "market"),
    (r"\bamt\b", "amount"), (r"\bcusts?\b", "customers"), (r"\bmths?\b", "month"), (r"\bwks?\b", "week"),
    (r"\bnxt\b", "next"), (r"\bmat\b", "maturity"), (r"\bdist\b", "distribution"), (r"\bdte\b", "date"),
    (r"\bppl\b", "people"), (r"\bpct\b", "percent"), (r"\b(\d+)\s*d\b", r"\1 days"), (r"\b(\d+)\s*w\b", r"\1 weeks"),
    (r"\b(?:pls|plz|please|kindly)\b", " "), (r"\b(?:ah|lah|la|lor|leh|mah|meh|ar|wor|ga|ge|ho)\b", " "),
    (r"\bgot how many\b", "how many"), (r"\bhow many got\b", "how many"), (r"\bwhat happen\b", "what happens"),
    (r"\b(?:falls?|falling|comes?|coming|come) due\b", "maturing"), (r"\bdue (?:in|within)\b", "maturing within"),
]
# Words the rules and the glossary act on: a misspelt word close to one of these is read as it, and said so.
KEYWORDS = {
    "outstanding", "total", "share", "percentage", "percent", "proportion", "portion", "fraction", "customers",
    "customer", "clients", "client", "maturity", "mature", "maturing", "matures", "calendar", "branch", "branches",
    "district", "districts", "distribution", "worst", "performing", "performer", "exposure", "underlying",
    "stocks", "stock", "positions", "position", "latest", "trade", "date", "fresh", "refresh", "updated",
    "predicted", "predict", "expected", "containing", "contains", "basket", "contractual", "scheduled", "market",
    "spot", "falls", "drops", "rises", "happens", "simulate", "scenario", "compare", "distinct", "number",
    "treasures", "private", "banking", "knock", "exercise", "expire", "notional", "amount", "list", "segment",
    "segments", "concentration", "largest", "biggest", "highest", "weakest", "follow",
}
COMMON = {
    "what", "whats", "which", "where", "when", "who", "whom", "whose", "how", "many", "much", "show", "tell", "give",
    "list", "rank", "count", "find", "this", "that", "these", "those", "there", "their", "them", "they", "with",
    "from", "into", "over", "under", "within", "about", "across", "between", "next", "last", "week", "weeks",
    "month", "months", "days", "year", "years", "today", "tomorrow", "right", "now", "have", "has", "had", "does",
    "will", "would", "could", "should", "were", "been", "being", "some", "every", "each", "most", "more", "less",
    "than", "then", "also", "only", "just", "book", "books", "live", "hold", "holds", "sits", "sit", "carry",
    "carries", "spread", "levels", "level", "bins", "suppose", "imagine", "impact", "affected", "flip", "status",
    "changes", "change", "portfolio", "portfolios", "booked", "recent", "data", "big", "biggest", "down", "goes",
    "slides", "nvidia", "alibaba", "tencent", "tesla", "apple", "intel", "meituan", "xiaomi", "break", "breakdown",
    "coming", "upcoming", "whole", "everything", "test", "stress", "funny", "something", "joke", "weather", "kong",
    "hong", "time", "call", "calls", "please", "help", "need", "want", "know", "names", "name", "people", "team",
    "lead", "leader", "manager", "relationship", "elis", "deal", "deals", "ratio", "split", "mix", "rest",
    "remaining", "away", "falls", "fall", "drop", "drops", "rise", "rises", "move", "moves", "price", "prices",
    "value", "values", "line", "view", "views", "report", "chart", "table", "page", "screen", "working", "work",
    "same", "other", "another", "again", "still", "good", "best", "worse", "worst", "high", "low", "lower",
    "higher", "large", "small", "whats", "wheres", "hows", "dont", "cant", "doesnt", "isnt", "arent", "should",
    "kowloon", "central", "admiralty", "causeway", "tsim", "mong", "kwun", "tsuen", "tuen", "yuen", "long",
}
_WORD = re.compile(r"[a-z]+")


def normalise(q: str, kb=None) -> tuple[str, list[dict]]:
    """Lower-case, expand desk shorthand, and fix misspelt keywords. Returns (text, corrections).

    Only a word that is neither a keyword, a common word, a glossary term nor a name is corrected, and only to a
    keyword it is very close to (difflib ratio >= 0.8). Each correction is reported, so the answer can say
    "Read 'custmers' as 'customers'".
    """
    import difflib
    s = q.lower()
    for pat, rep in SHORTHAND:
        s = re.sub(pat, rep, s)
    known = KEYWORDS | COMMON
    if kb is not None:
        for c in kb.glossary["concepts"]:
            for t in c.get("terms", []):
                known |= set(_WORD.findall(t.lower()))
        known |= set(kb.ticker_aliases)
        for b in kb.branches:
            known |= set(_WORD.findall(b.lower()))
    fixes: list[dict] = []

    def fix(m: re.Match) -> str:
        w = m.group(0)
        if len(w) < 4 or w in known or w.rstrip("s") in known:
            return w
        best = difflib.get_close_matches(w, sorted(KEYWORDS), n=1, cutoff=0.8)
        if not best:
            return w
        fixes.append({"from": w, "to": best[0]})
        return best[0]
    s = _WORD.sub(fix, s)
    return re.sub(r"\s+", " ", s).strip(), fixes


# ---------------------------------------------------------------- the rules, in priority order
MATURITY = r"matur|calendar|\broll|\bdue\b|expir"
CUSTOMERS = (r"how many\b[^?]*?\b(customers|clients)|\b(customers|clients)\b[^?]*\bhow many\b|number of\b[^?]*?\b(customers|clients)|"
             r"\bcount\b[^?]*?\b(customers|clients)|customer count|distinct customers|headcount")
DETAIL = (r"\b(which|list|names?|who)\b[^?]*\b(clients?|customers?|rms?)\b|\b(clients?|customers?)\b[^?]*\blist\b|"
          r"\brm list\b|client (and|&) rm|follow[\s-]?up|\bwho\b|\b(which|list|show)\b[^?]*\bpositions\b")
# A later rule that the winning rule refines does not make the reading unsure
# (a client list filtered by WPS is still a client list).
REFINES = {
    "maturity_detail": {"wps_exposure", "maturity_branch", "district"},
    "mtm_distribution": {"wps_exposure", "maturity_detail"},
    "customer_count_maturity": {"district", "maturity_branch", "maturity_detail", "customer_count"},
    "maturity_branch": {"district"},
    "segment_result_share": {"customer_count"},
}
CATCH_ALL = {"maturity_calendar", "outstanding_total"}


def _rule_hits(s: str, it: Intent) -> list[str]:
    """Every intent whose rule matches, in priority order. The first is the rules' reading."""
    maturity = bool(re.search(MATURITY, s))
    customers = bool(re.search(CUSTOMERS, s))
    hits = []
    if re.search(r"as of\b|how fresh|\bfresh\b|data date|\brefresh|up to date|how old|last updated|\bupdated\b", s):
        hits.append("data_as_of")
    if re.search(r"trade date|(latest|last|most recent|recent|newest)\b[^?]*\btrades?\b", s):
        hits.append("data_recency")
    if customers and (maturity or it.district or it.branch):
        hits.append("customer_count_maturity")
    elif customers:
        hits.append("customer_count")
    if re.search(r"\bshare\b|percent|%|proportion|portion|fraction|\bratio\b|\bsplit\b", s):
        hits.append("segment_result_share" if it.result else "segment_share")
    if re.search(r"distribution|\bmtm\b|histogram|spread across|\bbins?\b", s):
        hits.append("mtm_distribution")
    if re.search(DETAIL, s) or (re.search(r"\b(clients|customers)\b", s) and maturity and not customers):
        hits.append("maturity_detail")
    if re.search(r"\bwps\b|worst|weakest|exposure|which stocks?|underlying|concentration", s):
        hits.append("wps_exposure")
    if re.search(r"\bbranch", s) and (maturity or it.window_days):
        hits.append("maturity_branch")
    if re.search(r"district|compare d", s):
        hits.append("district")
    if maturity:
        hits.append("maturity_calendar")
    if re.search(r"outstanding|total|how much|" + WEAK_TOTAL, s):
        hits.append("outstanding_total")
    return list(dict.fromkeys(hits))


# words that hint at the book total but also appear in other questions ("slice of the book"): alone, they are
# not enough for a confident reading, so the model (when on) is asked
WEAK_TOTAL = r"how big|\bbook\b|\bhold\b|notional|\bsize\b|\bamount\b"


def _confidence(hits: list[str], s: str = "") -> str:
    if not hits:
        return "none"
    if hits == ["outstanding_total"] and not re.search(r"outstanding|total|how much", s):
        return "medium"
    top, rest = hits[0], [h for h in hits[1:] if h not in CATCH_ALL]
    return "high" if all(h in REFINES.get(top, set()) for h in rest) else "medium"


def understand(q: str, today: date) -> Intent:
    h = preparse(q, today)
    s = h["text"]
    it = Intent(question=q, segments=h["segments"], district=h.get("district"), branch=h.get("branch"),
                wps=h.get("wps"), result=h.get("result"), window_days=h.get("window_days"),
                on_date=h.get("on_date"), ranking=h["ranking"], hints=h)
    kb = _kb()
    it.unsupported = [{"id": r["id"], "label": r["label"], "rule": "refuse", "user_text": r["user_text"]}
                      for r in kb.refuse_hits(q) + [x for x in kb.refuse_hits(s) if x not in kb.refuse_hits(q)]]
    it.unsupported += [{"id": c["id"], "label": c["label"], "rule": c.get("rule", ""),
                       "user_text": c.get("user_text") or f"Questions about {c['label'].lower()} are not supported yet."}
                       for c in kb.unsupported_hits(s)]
    it.unsupported += [{"id": g["id"], "label": g["label"], "rule": "catalog: no published view carries it",
                        "user_text": GAP_TEXT.format(label=g["label"][:1].upper() + g["label"][1:])} for g in h.get("gaps", [])
                       if g["id"] not in {u["id"] for u in it.unsupported}]
    it.concepts = h.get("concepts", [])
    it.clarify = h.get("clarify")
    for f in h.get("corrections", []):
        it.assumptions.append(f"Read '{f['from']}' as '{f['to']}'.")

    shock = parse_shock(s, it.wps)
    if shock:
        it.intent, it.grain, it.shock = "scenario_analysis", "position", shock
        it.candidates, it.confidence = ["scenario_analysis"], "high"
        it.wps = None   # the named stock is the shocked underlying (any place in the basket), not a WPS filter
        if shock.get("assumption"):
            it.assumptions.append(shock["assumption"])
        if shock["kind"] == "single" and shock.get("ticker"):
            it.assumptions.append(f"Counts every live ELI with {shock['ticker']} anywhere in the basket, "
                              f"not only where it is the worst performer.")
        it.assumptions.append("A 'portfolio' is counted as one customer (CIF).")
        return apply_defaults(it)

    it.candidates = _rule_hits(s, it)
    it.confidence = _confidence(it.candidates, s)
    if it.candidates:
        it.intent = it.candidates[0]
        it.grain = grain_for(it)
    elif not it.unsupported and not it.clarify:
        opts = readings(it)
        if opts:
            it.clarify = reading_clarify(it, opts)
    return apply_defaults(it)


# ---------------------------------------------------------------- "Did you mean": readings as chips
SHORT_SEG = {"Treasures(HK)": "TRE", "Treasures(TPC)": "TPC", "PB": "PB"}


def readings(it: Intent, first: list[str] | None = None, limit: int = 3) -> list[str]:
    """2-3 likely intents for a question the rules could not settle, from the values it names.

    `first` (for example the rules' and the model's readings) go in front, in order. Every option is an intent
    from the list, and the question behind each chip is written by `canonical`, so a press always lands.
    """
    out = [i for i in (first or []) if i and i != "unknown"]
    by_slot = []
    if it.wps:
        by_slot += ["wps_exposure", "mtm_distribution", "maturity_detail"]
    if it.branch:
        by_slot += ["maturity_branch", "customer_count_maturity", "maturity_detail"]
    if it.district:
        by_slot += ["district", "maturity_branch", "customer_count_maturity"]
    if it.window_days or it.on_date:
        by_slot += ["maturity_calendar", "maturity_detail", "maturity_branch"]
    if it.result:
        by_slot += ["segment_result_share", "customer_count"]
    if it.segments:
        by_slot += ["outstanding_total", "segment_share", "maturity_calendar"]
    for i in by_slot + it.candidates:
        if i not in out:
            out.append(i)
    if any(s != "Treasures(HK)" for s in it.segments):
        out = [i for i in out if not (i.startswith("maturity") or i == "customer_count_maturity")] or out
    return out[:limit]


def canonical(intent: str, it: Intent) -> str:
    """A plain question for one reading, built from the values already read. The rules read it back as that
    intent with high confidence (tested), so pressing the chip answers exactly what it says."""
    seg = " + ".join(SHORT_SEG.get(x, x) for x in it.segments)
    seg_ = f"{seg} " if seg else ""
    w = it.window_days or 30
    district = it.district or (_kb().branches.get(it.branch) if intent == "maturity_branch" and it.branch else None)
    dist = (district or "").replace("TRE-", "")
    place = f" at {it.branch}" if it.branch else (f" in {dist}" if dist else "")
    res = it.result or "KO"
    if intent == "outstanding_total":
        return f"What is {seg_}outstanding ELI?"
    if intent == "segment_share":
        return f"What share of outstanding ELI is {seg or 'each segment'}?"
    if intent == "segment_result_share":
        return f"What percentage of outstanding ELI is {seg_}predicted {res}?"
    if intent == "customer_count":
        return f"How many {seg_}customers are predicted to {res}?"
    if intent == "customer_count_maturity":
        return f"How many TRE customers{place} have predicted maturity in the next {w} days?"
    if intent == "maturity_calendar":
        return f"How much TRE ELI{place} is predicted to mature in the next {w} days?"
    if intent == "maturity_branch":
        return f"Which branches{f' in {dist}' if dist else ''} have the largest TRE predicted maturity in the next {w} days?"
    if intent == "maturity_detail":
        wps = f" with WPS {it.wps}" if it.wps else ""
        return f"Which TRE clients{wps}{place} are maturing in the next {w} days?"
    if intent == "district":
        return "Compare outstanding ELI across districts" + (f" for {seg}" if seg else "")
    if intent == "wps_exposure":
        return f"Which worst-performing stocks carry the most {seg_}outstanding ELI?"
    if intent == "mtm_distribution":
        return (f"Show me the MTM distribution on {it.wps}" if it.wps else "Show me the MTM distribution by WPS") + place
    if intent == "data_recency":
        return "What is the latest trade date?"
    if intent == "data_as_of":
        return "How fresh is the data?"
    if intent == "scenario_analysis":
        return f"What happens if {it.wps or 'the market'} falls?"
    return it.question


def reading_clarify(it: Intent, intents: list[str]) -> dict:
    kb = _kb()
    return {"code": "INTENT_UNSURE", "concept": "intent", "text": "",
            "options": [{"intent": i, "label": kb.intent(i)["label"], "question": canonical(i, it)} for i in intents]}


GRAIN = {"outstanding_total": "kpi", "segment_share": "segment", "segment_result_share": "segment_result",
         "customer_count": "segment_result", "mtm_distribution": "mtm_bin", "maturity_detail": "position",
         "wps_exposure": "wps", "maturity_branch": "branch", "district": "district", "maturity_calendar": "date",
         "data_recency": "kpi", "data_as_of": "kpi", "scenario_analysis": "position", "unknown": ""}


def grain_for(it: Intent) -> str:
    if it.intent == "customer_count_maturity":
        return "branch" if it.branch else "district"
    return GRAIN.get(it.intent, "")


def apply_defaults(it: Intent) -> Intent:
    """Business defaults the spec fixes in code, whoever classified the question (rules or model)."""
    s = it.hints.get("text") or it.question.lower()
    maturity = bool(re.search(MATURITY, s))
    if it.intent.startswith("maturity") or it.intent == "customer_count_maturity":
        if not it.segments:
            it.segments = ["Treasures(HK)"]
            it.assumptions.append("Maturity answers cover Treasures (HK) only, so TRE is assumed.")
        if not it.window_days and not it.on_date:
            it.window_days = 30
            it.assumptions.append("No window given, so the standard next 30 days is used.")
        if maturity:
            it.assumptions.append("'Maturity' means predicted maturity, not contractual maturity.")
    if it.intent == "wps_exposure" and it.window_days is None and ("Treasures(HK)" in it.segments and len(it.segments) == 1):
        it.window_days = 30
        it.assumptions.append("TRE WPS exposure uses the standard next 30 days.")
    return it
