"""Pipeline building blocks. LangGraph nodes (graph/) call these; so does the pre-bake."""
from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Dict, Iterable, List, Optional, Tuple

from app import ENGINE_DIR, db, serv
from app.log import audit, emit
from app.timeutil import hours_between, iso, now as utcnow, parse
from contract.schema import STRONG_KINDS, Brief, Network
from rules import linking, priority
from rules.guard import as_evidence
from rules.normalize import normalize

RULEBOOK = (ENGINE_DIR / "rules" / "rulebook.md").read_text()
BRIEF_TOP_N = 10

SHADOW_HINT = ("Every item in why_linked must cite edge ids that appear in the provided graph. "
               "Every number must equal a number in the provided metrics. Do not include any person's name. "
               "Do not state anyone is guilty. If a claim cannot be supported, remove it.")


# ------------------------------------------------------------------ entities
def register_entities(case: dict, raw: Iterable[dict], index: Optional[Dict[Tuple[str, str], dict]] = None
                      ) -> List[dict]:
    """Normalise raw {kind,value} items, attach them to existing Entity rows or create new
    ones, and return the case's Entity list. Writes to DB unless an index is supplied
    (bulk mode — caller persists)."""
    bulk = index is not None
    if index is None:
        index = {(e["kind"], e["normalized"]): e for e in db.all_entities()}
    nums = [int(e["id"].split("-")[1]) for e in index.values()]
    next_num = max(nums, default=0) + 1
    out, touched, seen = [], [], set()
    for r in raw:
        kind = r.get("kind")
        if kind not in ("account", "phone", "url", "email", "wallet", "name"):
            continue
        norm = normalize(kind, str(r.get("value", "")))
        if not norm or (kind in ("account", "phone") and len(norm) < 6) or (kind, norm) in seen:
            continue
        seen.add((kind, norm))
        ent = index.get((kind, norm))
        if ent is None:
            ent = {"id": f"E-{next_num:05d}", "kind": kind, "value": str(r["value"]).strip(),
                   "normalized": norm, "case_ids": []}
            next_num += 1
            index[(kind, norm)] = ent
        if case["id"] not in ent["case_ids"]:
            ent["case_ids"].append(case["id"])
        touched.append(ent)
        out.append({**ent, "value": str(r["value"]).strip(), "case_ids": list(ent["case_ids"])})
    if not bulk:
        db.put_entities(touched)
    return out


def hydrate(case: dict, entity_by_id: Optional[Dict[str, dict]] = None) -> dict:
    """Refresh case.entities[].case_ids from the entity table (other cases may have joined)."""
    if entity_by_id is None:
        ids = {e["id"] for e in case["entities"]}
        entity_by_id = {e["id"]: e for e in db.all_entities() if e["id"] in ids}
    ents = []
    for e in case["entities"]:
        cur = entity_by_id.get(e["id"])
        ents.append({**e, "case_ids": list(cur["case_ids"]) if cur else e["case_ids"]})
    return {**case, "entities": ents}


# ------------------------------------------------------------------ clustering
def recluster(all_cases: Optional[List[dict]] = None) -> Tuple[Dict[str, set], List[Tuple[str, str]], set]:
    """Recompute strong components over every case. Updates case.network_id/status.
    Returns ({nid: case_ids}, merges, changed_network_ids)."""
    cases = all_cases if all_cases is not None else db.list_cases()
    comps = linking.strong_components(cases)
    current = {c["id"]: c["network_id"] for c in cases}
    existing = {n["id"] for n in db.list_networks()} | {v for v in current.values() if v}
    assigned, merges = linking.assign_network_ids(comps, current, existing)
    case_to_net = {cid: nid for nid, cids in assigned.items() for cid in cids}
    changed = set()
    for c in cases:
        new = case_to_net.get(c["id"])
        if new != c["network_id"]:
            changed.update(x for x in (new, c["network_id"]) if x)
            c["network_id"] = new
            if c["status"] not in ("flagged_input", "needs_review"):
                c["status"] = "linked" if new else "standalone"
            if all_cases is None:
                db.put_case(c)
    for absorbed, kept in merges:
        db.delete_network(absorbed)
        audit("network", kept, "link", "code", f"Merged {absorbed} into {kept}: a new report shares an "
              f"account/phone/link with both.", ["link.merge"])
    for nid in list(assigned):
        if db.get_network(nid) is None:
            changed.add(nid)
    for n in db.list_networks():
        if n["id"] not in assigned:
            db.delete_network(n["id"])
    return assigned, merges, changed


def metrics_for(cases: List[dict], now: datetime) -> dict:
    paid = sorted(c["paid_at"] for c in cases)
    return {
        "case_count": len(cases),
        "victim_count": len({c["victim_alias"] for c in cases}),
        "total_loss": round(sum(float(c["amount"]) for c in cases), 2),
        "first_seen": paid[0],
        "last_seen": paid[-1],
        "cases_last_7d": sum(1 for c in cases if hours_between(c["paid_at"], now) <= 24 * 7),
    }


def build_network(nid: str, cases: List[dict], entity_by_id: Dict[str, dict], weak_pairs, now: datetime) -> dict:
    prev = db.get_network(nid) or {}
    m = metrics_for(cases, now)
    graph = linking.build_graph(cases, entity_by_id, weak_pairs)
    return {
        "id": nid,
        "case_ids": sorted(c["id"] for c in cases),
        "graph": graph,
        "metrics": m,
        "typology": prev.get("typology") or {"label": "unknown", "confidence": 0.0},
        "priority": prev.get("priority") or {"tier": "P4", "score": 0.0, "rank": 999, "rule_ids": [], "reasons": []},
        "brief": prev.get("brief"),
        "status": prev.get("status", "ok"),
        "updated_at": iso(now),
    }


def strong_edge_count(net: dict) -> int:
    return sum(1 for e in net["graph"]["edges"] if e["strength"] == "strong")


# ------------------------------------------------------------------ decide
def decide(net: dict, cases: List[dict]) -> dict:
    facts = priority.facts_for(cases, net["metrics"], strong_edge_count(net))
    code_out = priority.evaluate(facts)
    result, notes, meta = code_out, [], None
    if serv.available():
        user = ("Network " + net["id"] + ". Facts computed by code (do not change any number):\n"
                + json.dumps(facts, indent=1) + "\nCurrent typology: " + json.dumps(net["typology"]))
        for model in ([serv.MODEL_KRONOS, serv.MODEL_MULTIPATH] if serv.USE_KRONOS else [serv.MODEL_MULTIPATH]):
            try:
                out, meta = serv.call_json(model, RULEBOOK, user, tools=[serv.PROMPT_GUARD])
                result, notes = priority.reconcile(out, code_out)
                break
            except Exception as e:  # noqa: BLE001
                audit("network", net["id"], "decide", "code", f"SERV {model} failed ({type(e).__name__}); "
                      "trying fallback.", [], model)
    tier = result["tier"]
    sc = priority.score(tier, net["metrics"])
    net["typology"] = {"label": result["typology"], "confidence": round(float(result["typology_confidence"]), 2)}
    net["priority"] = {**net["priority"], "tier": tier, "score": sc,
                       "rule_ids": list(result["rule_ids"]), "reasons": list(result["reasons"])}
    review = bool(result.get("needs_review"))
    net["status"] = "needs_review" if review else "ok"
    summary = (f"{tier}, typology {net['typology']['label']} ({net['typology']['confidence']}), score {sc}. "
               + " ".join(result["reasons"][:3]))
    if meta:
        audit("network", net["id"], "decide", "serv", summary, result["rule_ids"], meta["model"],
              meta["cost_usd"], meta["latency_ms"])
    else:
        audit("network", net["id"], "decide", "code", summary + " (offline: code rulebook)",
              result["rule_ids"], serv.FALLBACK_MODEL)
    return net


# ------------------------------------------------------------------ brief
def shared_entities(net: dict) -> List[dict]:
    nodes = {n["id"]: n for n in net["graph"]["nodes"]}
    out = []
    for nid, n in nodes.items():
        if n["type"] != "entity":
            continue
        eids = [e["id"] for e in net["graph"]["edges"] if e["target"] == nid and e["source"] in net["case_ids"]]
        out.append({"entity_id": nid, "kind": n["kind"], "label": n["label"], "report_count": len(eids),
                    "edge_ids": eids, "strength": "strong" if n["kind"] in STRONG_KINDS else "weak"})
    return sorted(out, key=lambda x: (x["strength"] != "strong", -x["report_count"], x["entity_id"]))


def _brief_inputs(net: dict, cases: List[dict]) -> dict:
    return {
        "network_id": net["id"],
        "metrics": net["metrics"],
        "typology": net["typology"],
        "priority": {k: net["priority"][k] for k in ("tier", "rank", "rule_ids", "reasons")},
        "shared_entities": shared_entities(net),
        "weak_edges": [e for e in net["graph"]["edges"] if e["id"].startswith("W-")],
        "cases": [{"case_id": c["id"], "amount": c["amount"], "paid_at": c["paid_at"], "channel": c["channel"],
                   "scam_type": c["scam_type"]["label"], "urgency": c["urgency"]["tier"],
                   "flags": c["flags"]} for c in sorted(cases, key=lambda c: c["paid_at"])],
    }


def _template_brief(net: dict, cases: List[dict]) -> dict:
    m, t, p = net["metrics"], net["typology"], net["priority"]
    se = shared_entities(net)
    strong = [s for s in se if s["strength"] == "strong"]
    p1 = [c for c in cases if c["urgency"]["tier"] == "P1"]
    summary = (f"{m['case_count']} reports from {m['victim_count']} victims with a combined loss of "
               f"${m['total_loss']:,.2f}, {m['cases_last_7d']} of them in the last 7 days. "
               f"The reports are tied together by shared payment and contact details, not by names. "
               f"Pattern looks like {t['label'].replace('_', ' ')}; rated {p['tier']} under "
               f"{', '.join(p['rule_ids'])}.")
    if p1:
        summary += f" {len(p1)} report(s) are inside the 24-hour window where a bank hold may still be possible."
    kind_words = {"account": "paid into the same receiving account", "phone": "were contacted from the same phone number",
                  "url": "were sent to the same website", "email": "dealt with the same email address",
                  "wallet": "paid into the same crypto wallet"}
    why = [{"claim": f"{s['report_count']} reports {kind_words[s['kind']]} ({s['label']}).", "edge_ids": s["edge_ids"]}
           for s in strong[:5]]
    gaps = ["Account-holder identity behind the shared details is not known to Rastro."]
    if any(s["kind"] == "account" for s in strong):
        gaps.append("No confirmation yet from the receiving bank on the account's other inflows.")
    if any(e["id"].startswith("W-") for e in net["graph"]["edges"]) or any(s["strength"] == "weak" for s in se):
        gaps.append("Name look-alikes are shown as weak links only and were not used to join reports.")
    if any("injection_attempt" in c["flags"] for c in cases):
        gaps.append("One report contains text that tried to instruct the system; it was kept as evidence only.")
    steps = []
    if p1:
        steps.append("Contact the receiving bank about the newest reports first, while a hold may still be possible.")
    if any(s["kind"] == "account" for s in strong):
        steps.append("Ask the receiving bank to review the shared account under its own procedures.")
    if any(s["kind"] == "phone" for s in strong):
        steps.append("Request subscriber and usage records for the shared phone numbers through the usual channel.")
    if any(s["kind"] in ("url", "email") for s in strong):
        steps.append("Report the shared website or email domain for takedown review.")
    steps.append("Open the evidence packets of the most recent reports and confirm the details with the victims.")
    return {"summary": summary, "why_linked": why, "gaps": gaps, "next_steps": steps,
            "checked": False, "check_notes": []}


def brief(net: dict, cases: List[dict]) -> dict:
    inputs = _brief_inputs(net, cases)
    out, meta = None, None
    if serv.available():
        system = ("You write investigator briefs for a bank fraud team. Output JSON with keys summary (2-4 sentences), "
                  "why_linked (list of {claim, edge_ids}), gaps (list), next_steps (list). Use only the facts given. "
                  "Copy numbers exactly from the input. Never name a person. Never say anyone is guilty. Rastro never "
                  "freezes money or blocks accounts; next steps are suggestions for human investigators. "
                  + SHADOW_HINT)
        user = as_evidence([json.dumps(inputs)]).replace("victim-supplied data", "case data")
        try:
            raw, meta = serv.call_json(serv.MODEL_PLAIN, system, user,
                                       tools=[serv.PROMPT_GUARD, serv.shadow_tool(SHADOW_HINT)])
            out = {"summary": str(raw.get("summary", ""))[:1200],
                   "why_linked": [{"claim": str(w.get("claim", "")), "edge_ids": [str(x) for x in w.get("edge_ids", [])]}
                                  for w in (raw.get("why_linked") or []) if isinstance(w, dict)],
                   "gaps": [str(x) for x in (raw.get("gaps") or [])][:8],
                   "next_steps": [str(x) for x in (raw.get("next_steps") or [])][:8],
                   "checked": False, "check_notes": []}
        except Exception as e:  # noqa: BLE001
            audit("network", net["id"], "brief", "code", f"SERV brief failed ({type(e).__name__}); using template.")
    if out is None:
        out = _template_brief(net, cases)
        audit("network", net["id"], "brief", "code", "Brief written from code template (offline).", [],
              serv.FALLBACK_MODEL)
    else:
        audit("network", net["id"], "brief", "shadow", "Brief written with shadow-agent validation loop.", [],
              meta["model"], meta["cost_usd"], meta["latency_ms"])
    net["brief"] = Brief(**out).model_dump()
    return net


# ------------------------------------------------------------------ verify
_ID_RE = re.compile(r"\b[A-Z]{1,2}-[A-Z0-9-]*\d")
_NUM_RE = re.compile(r"(?<![A-Za-z\d.])\$?(\d[\d,]*(?:\.\d+)?)")
_BANNED = re.compile(r"\b(guilty|convicted|criminal|is a (?:scammer|fraudster)|are (?:scammers|fraudsters))\b", re.I)


def _num(s: str) -> float:
    return float(s.replace(",", ""))


def allowed_numbers(net: dict, cases: List[dict]) -> set:
    m = net["metrics"]
    vals = {m["case_count"], m["victim_count"], m["total_loss"], m["cases_last_7d"],
            net["priority"]["rank"], net["priority"]["score"],
            priority.R1_LOSS, priority.R1_RECENT, priority.R2_VICTIMS, priority.R6_LOSS, priority.R5_CONF,
            24, 72, 7}  # rulebook constants (thresholds, windows)
    vals.add(net["typology"]["confidence"]); vals.add(round(net["typology"]["confidence"] * 100))
    for c in cases:
        vals.add(float(c["amount"])); vals.add(c["urgency"]["hours_since_payment"])
    for s in shared_entities(net):
        vals.add(s["report_count"])
        if s["label"]:
            for d in re.findall(r"\d+", s["label"]):
                vals.add(_num(d))
    for n in net["graph"]["nodes"]:
        for d in re.findall(r"\d{4,}", n["label"]):
            vals.add(_num(d))
    vals.add(sum(1 for c in cases if c["urgency"]["tier"] == "P1"))
    return {round(float(v), 2) for v in vals}


def verify(net: dict, cases: List[dict]) -> dict:
    b = net.get("brief")
    if not b:
        return net
    notes: List[str] = []
    edge_ids = {e["id"] for e in net["graph"]["edges"]}
    for w in b["why_linked"]:
        if not w["edge_ids"]:
            notes.append(f"Claim cites no edges: \"{w['claim'][:60]}\"")
        bad = [x for x in w["edge_ids"] if x not in edge_ids]
        if bad:
            notes.append(f"Claim cites edges not in graph: {', '.join(bad[:3])}")
    allowed = allowed_numbers(net, cases)
    texts = [b["summary"]] + [w["claim"] for w in b["why_linked"]]
    for t in texts:
        for raw in _NUM_RE.findall(_ID_RE.sub(" ", t)):
            v = round(_num(raw), 2)
            if v not in allowed:
                notes.append(f"Number {raw} does not match any computed metric or case amount.")
    full = json.dumps(b).lower()
    names = {c["victim_alias"].lower() for c in cases}
    for c in cases:
        for e in c["entities"]:
            if e["kind"] == "name":
                names.update({e["value"].lower(), e["normalized"].lower()})
    for nm in sorted(names):
        if nm and nm in full:
            notes.append("Brief contains a person's name or victim alias.")
            break
    if _BANNED.search(full):
        notes.append("Brief states or implies guilt.")
    if net["typology"]["confidence"] < priority.R5_CONF:
        notes.append(f"Typology confidence {net['typology']['confidence']} below {priority.R5_CONF} (R5).")
    b["checked"] = not notes
    b["check_notes"] = sorted(set(notes))
    if notes:
        net["status"] = "needs_review"
    audit("network", net["id"], "verify", "code",
          "Brief passed all checks (edges exist, numbers match, no names, no guilt)." if not notes
          else "Brief failed checks → needs_review: " + "; ".join(b["check_notes"][:3]),
          ["V-edges", "V-numbers", "V-names", "V-guilt", "R5"])
    return net


# ------------------------------------------------------------------ rank
def rerank(emit_for: Iterable[str] = ()) -> List[Tuple[str, int, int]]:
    nets = db.list_networks()
    old = {n["id"]: n["priority"]["rank"] for n in nets}
    nets.sort(key=lambda n: (-n["priority"]["score"], n["id"]))
    moves = []
    for i, n in enumerate(nets, start=1):
        if n["priority"]["rank"] != i:
            n["priority"]["rank"] = i
            db.put_network(n)
        if old[n["id"]] != i:
            moves.append((n["id"], old[n["id"]], i))
    for nid, a, b in moves:
        if nid in set(emit_for):
            before = f"#{a}" if a < 999 else "new"
            emit("network_reranked", nid, f"{nid} moved {before} → #{b}")
            audit("network", nid, "rank", "code", f"Re-ranked {before} → #{b} by score.", ["score"])
    return moves


def all_networks_by_case() -> Dict[str, dict]:
    return {cid: n for n in db.list_networks() for cid in n["case_ids"]}
