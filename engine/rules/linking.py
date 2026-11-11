"""Linking + clustering (step `link`). Pure code.

* Strong kinds (account/phone/url/email/wallet) match exactly on `normalized`.
* Names match with RapidFuzz token_sort_ratio ≥ 92 and only ever make a WEAK edge.
* Networks = connected components over strong edges only (golden rule 3).
"""
from __future__ import annotations

from typing import Dict, Iterable, List, Set, Tuple

import networkx as nx
from rapidfuzz import fuzz

from contract.schema import STRONG_KINDS

NAME_THRESHOLD = 92


def weak_name_pairs(name_entities: List[dict], only_ids: Iterable[str] | None = None
                    ) -> List[Tuple[str, str, float]]:
    """(entity_id_a, entity_id_b, similarity 0..1) for distinct name entities that look alike.
    If only_ids is given, only pairs touching those entities are returned."""
    only = set(only_ids) if only_ids is not None else None
    out = []
    for i, a in enumerate(name_entities):
        for b in name_entities[i + 1:]:
            if only is not None and a["id"] not in only and b["id"] not in only:
                continue
            s = fuzz.token_sort_ratio(a["normalized"], b["normalized"])
            if s >= NAME_THRESHOLD:
                out.append((a["id"], b["id"], round(s / 100.0, 3)))
    return out


def strong_components(cases: List[dict]) -> List[Set[str]]:
    """Components of ≥2 cases joined through shared strong entities."""
    g = nx.Graph()
    for c in cases:
        g.add_node(c["id"])
        for e in c["entities"]:
            if e["kind"] in STRONG_KINDS:
                g.add_edge(c["id"], "ent:" + e["kind"] + ":" + e["normalized"])
    comps = []
    for comp in nx.connected_components(g):
        cids = {n for n in comp if not n.startswith("ent:")}
        if len(cids) >= 2:
            comps.append(cids)
    return comps


def assign_network_ids(components: List[Set[str]], current: Dict[str, str | None],
                       existing_ids: Iterable[str]) -> Tuple[Dict[str, Set[str]], List[Tuple[str, str]]]:
    """Keep ids stable: a component keeps the id most of its cases already carry.
    Returns ({network_id: case_ids}, merges[(absorbed_id, kept_id)])."""
    used: Set[str] = set()
    result: Dict[str, Set[str]] = {}
    merges: List[Tuple[str, str]] = []
    nums = [int(x.split("-")[1]) for x in existing_ids if x.startswith("N-")]
    next_num = max(nums, default=0) + 1
    # big components choose first so they keep their ids
    for comp in sorted(components, key=len, reverse=True):
        votes: Dict[str, int] = {}
        for cid in comp:
            nid = current.get(cid)
            if nid:
                votes[nid] = votes.get(nid, 0) + 1
        ranked = sorted((n for n in votes if n not in used), key=lambda n: (-votes[n], n))
        if ranked:
            nid = ranked[0]
            merges += [(other, nid) for other in ranked[1:]]
        else:
            nid = f"N-{next_num:03d}"
            next_num += 1
        used.add(nid)
        result[nid] = comp
    return result, merges


def build_graph(case_list: List[dict], entity_index: Dict[str, dict],
                weak_pairs: List[Tuple[str, str, float]]) -> dict:
    """Network graph: case nodes + entities shared inside the network + weak name links."""
    cids = {c["id"] for c in case_list}
    nodes, edges = [], []
    for c in sorted(case_list, key=lambda c: c["id"]):
        nodes.append({"id": c["id"], "type": "case", "label": c["id"], "tier": c["urgency"]["tier"]})
    used_entities: Dict[str, dict] = {}
    for c in case_list:
        for e in c["entities"]:
            ent = entity_index.get(e["id"], e)
            inside = [x for x in ent["case_ids"] if x in cids]
            if len(inside) >= 2:
                used_entities[ent["id"]] = ent
    name_ids_in_net = {e["id"] for c in case_list for e in c["entities"] if e["kind"] == "name"}
    weak_here = [(a, b, s) for a, b, s in weak_pairs if a in name_ids_in_net and b in name_ids_in_net]
    for a, b, _ in weak_here:
        for x in (a, b):
            if x in entity_index:
                used_entities[x] = entity_index[x]
    for eid in sorted(used_entities):
        ent = used_entities[eid]
        nodes.append({"id": eid, "type": "entity", "label": _label(ent), "kind": ent["kind"]})
        strong = ent["kind"] in STRONG_KINDS
        for cid in sorted(x for x in ent["case_ids"] if x in cids):
            edges.append({"id": f"X-{cid}-{eid}", "source": cid, "target": eid,
                          "strength": "strong" if strong else "weak", "similarity": 1.0})
    for a, b, s in weak_here:
        edges.append({"id": f"W-{a}-{b}", "source": a, "target": b, "strength": "weak", "similarity": s})
    return {"nodes": nodes, "edges": edges}


def _label(ent: dict) -> str:
    v = ent["normalized"]
    if ent["kind"] in ("account", "phone") and len(v) > 6:
        return f"{ent['kind']} …{v[-4:]}" if ent["kind"] == "phone" else f"acct {v}"
    return v
