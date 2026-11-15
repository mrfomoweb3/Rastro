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

SHADOW_HINT = ("Every item in why_linked must cite detail ids that appear in shared_details. "
               "Every number must equal a number in the input. Do not include any person's name. "
               "Do not state anyone is guilty. If a claim cannot be supported, remove it.")

BRIEF_SYSTEM = (
    "You write short briefs for analysts in a bank's fraud team. Write plain English that a busy person can read "
    "once. Return JSON with the keys summary (2 to 4 sentences), why_linked (a list of {claim, detail_ids}), "
    "gaps (a list of short sentences about what is not known) and next_steps (a list of short suggestions).\n"
    "Rules:\n"
    "- Use only the facts in the input. Copy every number exactly as it is given. Write money the way the input "
    "does, for example $43,780.02.\n"
    "- Do not mention dates, times, scores, ranks, confidence values, rule ids, detail ids or field names. Say "
    "\"mule network\", never \"mule_network\".\n"
    "- Each why_linked item is an object {\"claim\": one full sentence, \"detail_ids\": [...]} and explains one shared detail (an account, phone, website, email or wallet) and how many "
    "reports share it. Put that detail's detail_id in detail_ids.\n"
    "- Never name a person or a victim. Never say anyone is guilty or a criminal.\n"
    "- Rastro never freezes money or blocks accounts. next_steps are suggestions for human investigators.\n"
    + SHADOW_HINT)


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
    tried = False
    if serv.available():
        tried = True
        user = ("Network " + net["id"] + ". Facts computed by code (do not change any number):\n"
                + json.dumps(facts, indent=1) + "\nCurrent typology: " + json.dumps(net["typology"]))
        plan = [(serv.MODEL_MULTIPATH, serv.TIMEOUT_DECIDE)]
        if serv.USE_KRONOS:
            plan.insert(0, (serv.MODEL_KRONOS, serv.TIMEOUT_DECIDE_KRONOS))
        for model, limit in plan:
            try:
                out, meta = serv.call_json(model, RULEBOOK, user, tools=[serv.PROMPT_GUARD], timeout=limit)
                result, notes = priority.reconcile(out, code_out)
                break
            except Exception as e:  # noqa: BLE001
                result, notes, meta = code_out, [], None
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
               + " ".join(result["reasons"][:4]))
    if meta:
        # After " | " come the technical notes; screens show only the part before it.
        tech = " ".join(notes) if notes else "SERV agreed with the code rulebook."
        audit("network", net["id"], "decide", "serv", summary + " | " + tech, result["rule_ids"], meta["model"],
              meta["cost_usd"], meta["latency_ms"])
    else:
        why = "SERV did not answer in time: code rulebook" if tried else "offline: code rulebook"
        audit("network", net["id"], "decide", "code", f"{summary} ({why})", result["rule_ids"], serv.FALLBACK_MODEL)
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


def pattern_words(label: str) -> str:
    """The scam pattern in words an analyst would use."""
    return {"mixed": "a mix of scam types", "unknown": "not clear yet"}.get(label, label.replace("_", " "))


def _brief_inputs(net: dict, cases: List[dict]) -> dict:
    """What SERV gets to write a brief from: plain facts only. No dates, scores or rule ids,
    so there is nothing technical to copy, and no victim text at all."""
    m = net["metrics"]
    se = shared_entities(net)
    return {
        "network_id": net["id"],
        "reports": m["case_count"],
        "victims": m["victim_count"],
        "total_loss": f"${m['total_loss']:,.2f}",
        "reports_in_the_last_7_days": m["cases_last_7d"],
        "reports_paid_in_the_last_24_hours": sum(1 for c in cases if c["urgency"]["tier"] == "P1"),
        "pattern": pattern_words(net["typology"]["label"]),
        "priority": net["priority"]["tier"],
        "why_it_is_ranked_here": list(net["priority"]["reasons"]),
        "shared_details": [{"detail_id": s["entity_id"], "kind": s["kind"],
                            "label": s["label"].replace("acct ", "account "),
                            "reports_sharing_it": s["report_count"]} for s in se if s["strength"] == "strong"][:8],
        "some_reports_only_share_a_similar_name": any(s["strength"] == "weak" for s in se),
        "a_report_tried_to_instruct_the_system": any("injection_attempt" in c["flags"] for c in cases),
    }


def _brief_from_model(raw: dict, net: dict) -> dict:
    """Turn SERV's JSON into a Brief. The model points at shared details by id; code looks up
    the real links for each one. An id it made up is kept as-is so the fact-check rejects it."""
    by_id = {s["entity_id"]: s for s in shared_entities(net)}
    strong = [s for s in by_id.values() if s["strength"] == "strong"]
    kinds = {"account": r"account", "phone": r"phone", "url": r"website|site|link|url", "email": r"e-?mail",
             "wallet": r"wallet"}
    used: set = set()

    def match(claim: str) -> List[str]:
        """A claim given as a bare sentence: find the one shared detail it describes, by its
        kind and its report count. No unique match means no ids, and the fact-check fails it."""
        nums = {int(n) for n in re.findall(r"\b\d+\b", claim)}
        for s in strong:
            if s["entity_id"] in used or s["report_count"] not in nums:
                continue
            if re.search(kinds.get(s["kind"], "^$"), claim, re.I):
                used.add(s["entity_id"])
                return [s["entity_id"]]
        return []

    why = []
    for w in (raw.get("why_linked") or []):
        if isinstance(w, str):
            w = {"claim": w, "detail_ids": match(w)}
        if not isinstance(w, dict):
            continue
        for d in (w.get("detail_ids") or []):
            used.add(str(d))
        ids: List[str] = []
        for d in (w.get("detail_ids") or []):
            s = by_id.get(str(d))
            ids += s["edge_ids"] if s else [str(d)]
        ids += [str(x) for x in (w.get("edge_ids") or [])]
        text = next((w[k] for k in ("claim", "text", "reason", "explanation", "description", "statement")
                     if isinstance(w.get(k), str) and w[k].strip()), "")
        if not text.strip() and len(w.get("detail_ids") or []) == 1 and str(w["detail_ids"][0]) in by_id:
            text = _claim_for(by_id[str(w["detail_ids"][0])])  # the model gave the link but no words
        why.append({"claim": text.strip()[:400], "edge_ids": list(dict.fromkeys(ids))})
    def strs(x) -> List[str]:
        return [str(i)[:300] for i in x if isinstance(i, str) and i.strip()][:6] if isinstance(x, list) else []

    summary = next((raw[k] for k in ("summary", "overview", "brief", "text")
                    if isinstance(raw.get(k), str) and raw[k].strip()), "")
    return {"summary": summary[:1200], "why_linked": why[:6],
            "gaps": strs(raw.get("gaps")), "next_steps": strs(raw.get("next_steps")),
            "checked": False, "check_notes": []}


_KIND_WORDS = {"account": "paid into the same receiving account", "phone": "were contacted from the same phone number",
               "url": "were sent to the same website", "email": "dealt with the same email address",
               "wallet": "paid into the same crypto wallet"}


def _claim_for(s: dict) -> str:
    return (f"{s['report_count']} reports {_KIND_WORDS.get(s['kind'], 'share the same detail')} "
            f"({s['label'].replace('acct ', 'account ')}).")


def _template_brief(net: dict, cases: List[dict]) -> dict:
    m, t, p = net["metrics"], net["typology"], net["priority"]
    se = shared_entities(net)
    strong = [s for s in se if s["strength"] == "strong"]
    p1 = [c for c in cases if c["urgency"]["tier"] == "P1"]
    recent = f"{m['cases_last_7d']} of them" if m["cases_last_7d"] else "none of them"
    summary = (f"{m['case_count']} reports from {m['victim_count']} victims with a combined loss of "
               f"${m['total_loss']:,.2f}, {recent} in the last 7 days. "
               f"The reports are tied together by shared payment and contact details, not by names. "
               + (f"The pattern looks like {'an' if t['label'][0] in 'aeiou' else 'a'} {t['label'].replace('_', ' ')}." if t["label"] not in ("unknown", "mixed")
                  else "The scam pattern is mixed or not yet clear."))
    if p1:
        summary += (f" {len(p1)} {'report is' if len(p1) == 1 else 'reports are'} inside the 24-hour window"
                    " where a bank hold may still be possible.")
    why = [{"claim": _claim_for(s), "edge_ids": s["edge_ids"]} for s in strong[:5]]
    gaps = ["Account-holder identity behind the shared details is not known to Rastro."]
    if any(s["kind"] == "account" for s in strong):
        gaps.append("No confirmation yet from the receiving bank on the account's other inflows.")
    if any(e["id"].startswith("W-") for e in net["graph"]["edges"]) or any(s["strength"] == "weak" for s in se):
        gaps.append("Similar names are shown as dotted lines only. They were not used to join reports.")
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
    """Write the network brief. SERV drafts it (shadow agent on); code fact-checks the draft
    straight away. A draft that fails any check is dropped and the template brief, which is
    built only from code facts, is used instead. The audit log records which one it was."""
    out = None
    if serv.available():
        user = as_evidence([json.dumps(_brief_inputs(net, cases))]).replace("victim-supplied data", "case data")
        try:
            raw, meta = serv.call_json(serv.MODEL_PLAIN, BRIEF_SYSTEM, user, timeout=serv.TIMEOUT_BRIEF,
                                       tools=[serv.PROMPT_GUARD, serv.shadow_tool(SHADOW_HINT)])
            draft = _brief_from_model(raw, net)
            issues = brief_issues(net, draft, cases, strict=True)
            if issues:
                audit("network", net["id"], "brief", "shadow",
                      f"SERV draft failed the fact-check ({len(issues)} issue(s): {'; '.join(issues[:2])}). "
                      "The standard template was used instead.", [], meta["model"], meta["cost_usd"], meta["latency_ms"])
            else:
                out = draft
                audit("network", net["id"], "brief", "shadow", "Brief written by SERV with the shadow-agent "
                      "validation loop.", [], meta["model"], meta["cost_usd"], meta["latency_ms"])
        except Exception as e:  # noqa: BLE001
            audit("network", net["id"], "brief", "code", f"SERV brief failed ({type(e).__name__}); using the "
                  "standard template.")
    if out is None:
        out = _template_brief(net, cases)
        audit("network", net["id"], "brief", "code", "Brief written from the standard template"
              + (" (offline)." if not serv.has_key() else "."), [], serv.FALLBACK_MODEL)
    net["brief"] = Brief(**out).model_dump()
    return net


# ------------------------------------------------------------------ verify
_ID_RE = re.compile(r"\b[A-Z]{1,2}-[A-Z0-9-]*\d")
_NUM_RE = re.compile(r"(?<![A-Za-z\d.])\$?(\d[\d,]*(?:\.\d+)?)")
_BANNED = re.compile(r"\b(guilty|convicted|criminal|is a (?:scammer|fraudster)|are (?:scammers|fraudsters))\b", re.I)
_REVIEW = re.compile(r"\b(?:review is (?:still )?(?:needed|required|warranted)|needs? (?:a )?(?:human |manual )?review|requires? (?:human |manual )?review)\b", re.I)
# Internal wording that must never reach an analyst's screen in a SERV-written brief.
_INTERNAL = re.compile(r"\b(?:R[0-7]|U[1-4])\b|[a-z]_[a-z]|\b(?:confidence|typology|score|edge|detail_id)\b"
                       r"|\d{4}-\d{2}-\d{2}", re.I)


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


def brief_issues(net: dict, b: dict, cases: List[dict], strict: bool = False) -> List[str]:
    """Fact-check one brief against the graph and the code-computed numbers.

    Always: every claim points at real links, every number in the summary and the claims
    matches a metric, no person is named, nobody is called guilty. With `strict` (used on
    SERV drafts before they are accepted) the number check also covers gaps and next steps,
    the draft must not be empty, and internal wording such as rule ids is not allowed."""
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
    if strict:
        texts += list(b["gaps"]) + list(b["next_steps"])
        if not b["summary"].strip():
            notes.append("Draft has no summary.")
        if not b["why_linked"]:
            notes.append("Draft does not explain how the reports are linked.")
        if any(not w["claim"].strip() for w in b["why_linked"]):
            notes.append("Draft has an empty claim.")
        if any(_INTERNAL.search(t) for t in texts):
            notes.append("Draft uses internal wording (rule ids, field names or dates).")
        if net.get("status") != "needs_review" and any(_REVIEW.search(t) for t in texts):
            notes.append("Draft asks for a review the rules did not ask for.")
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
    return notes


def verify(net: dict, cases: List[dict]) -> dict:
    b = net.get("brief")
    if not b:
        return net
    notes = brief_issues(net, b, cases)
    if net["typology"]["confidence"] < priority.R5_CONF:
        notes.append("The scam pattern is not clear enough to confirm.")
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
