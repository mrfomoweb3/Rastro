"""Small LangGraph for one network: decide → (brief) → verify."""
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


GRAPH = build()


def run(net: dict, cases: List[dict], want_brief: bool) -> dict:
    return GRAPH.invoke({"net": net, "cases": cases, "want_brief": want_brief})["net"]
