"""Small LangGraphs for one network.

`run`        decide → (brief) → verify, in one go. Used by the pre-bake.
`run_decide` decide only.
`run_brief`  brief → verify.

A live report uses the last two with a re-rank in between, so the queue moves as soon as
the priority is known and does not wait for the brief to be written.
"""
from __future__ import annotations

from typing import List, TypedDict

from langgraph.graph import END, START, StateGraph

from app import core


class NetState(TypedDict, total=False):
    net: dict
    cases: List[dict]
    want_brief: bool


def _decide(s: NetState) -> NetState:
    return {"net": core.decide(s["net"], s["cases"])}


def _brief(s: NetState) -> NetState:
    return {"net": core.brief(s["net"], s["cases"])}


def _verify(s: NetState) -> NetState:
    return {"net": core.verify(s["net"], s["cases"])}


def _route(s: NetState) -> str:
    return "brief" if s.get("want_brief") else "verify"


def build():
    g = StateGraph(NetState)
    g.add_node("decide", _decide)
    g.add_node("brief", _brief)
    g.add_node("verify", _verify)
    g.add_edge(START, "decide")
    g.add_conditional_edges("decide", _route, {"brief": "brief", "verify": "verify"})
    g.add_edge("brief", "verify")
    g.add_edge("verify", END)
    return g.compile()


def build_decide():
    g = StateGraph(NetState)
    g.add_node("decide", _decide)
    g.add_edge(START, "decide")
    g.add_edge("decide", END)
    return g.compile()


def build_brief():
    g = StateGraph(NetState)
    g.add_node("brief", _brief)
    g.add_node("verify", _verify)
    g.add_edge(START, "brief")
    g.add_edge("brief", "verify")
    g.add_edge("verify", END)
    return g.compile()


GRAPH = build()
GRAPH_DECIDE = build_decide()
GRAPH_BRIEF = build_brief()


def run(net: dict, cases: List[dict], want_brief: bool) -> dict:
    return GRAPH.invoke({"net": net, "cases": cases, "want_brief": want_brief})["net"]


def run_decide(net: dict, cases: List[dict]) -> dict:
    return GRAPH_DECIDE.invoke({"net": net, "cases": cases})["net"]


def run_brief(net: dict, cases: List[dict]) -> dict:
    return GRAPH_BRIEF.invoke({"net": net, "cases": cases})["net"]
