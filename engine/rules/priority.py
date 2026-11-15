"""Code copy of the network rulebook (R0–R7) + the score formula.

SERV applies the rulebook in `decide`; this module (a) supplies the numbers, (b) is the
offline fallback when no SERV key is set, and (c) cross-checks SERV's answer: if SERV
disagrees, R7 picks the more cautious outcome and the audit log says so.
"""
from __future__ import annotations

from collections import Counter
from typing import Dict, List

TIERS = ["P1", "P2", "P3", "P4"]
TIER_BASE = {"P1": 300.0, "P2": 200.0, "P3": 100.0, "P4": 0.0}

TYPOLOGY_FOR_SCAM = {
    "investment": "investment_ring",
    "impersonation": "impersonation_ring",
    "romance": "romance_ring",
    "phishing": "phishing_kit",
    "fake_job": "mixed",
    "purchase": "mixed",
    "unknown": "unknown",
}

# Rulebook thresholds — also the only "free" numbers a brief may mention.
R1_LOSS, R1_RECENT, R2_VICTIMS, R6_LOSS, R5_CONF = 50_000, 5, 3, 1_000, 0.6


def raise_tier(t: str) -> str:
    return TIERS[max(0, TIERS.index(t) - 1)]


def more_urgent(a: str, b: str) -> str:
    return a if TIERS.index(a) <= TIERS.index(b) else b


def score(tier: str, metrics: dict) -> float:
    """score = f(tier, total_loss, cases_last_7d) (+ victims, so wide mule nets count)."""
    s = (TIER_BASE[tier]
         + 0.4 * min(metrics["total_loss"] / 1000.0, 100.0)
         + 4.0 * min(metrics["cases_last_7d"], 15)
         + 1.0 * min(metrics["victim_count"], 50))
    return round(s, 1)


def facts_for(cases: List[dict], metrics: dict, strong_edges: int) -> dict:
    """Everything the rulebook needs, computed in code. Passed verbatim to SERV."""
    acct_victims: Dict[str, set] = {}
    for c in cases:
        for e in c["entities"]:
            if e["kind"] == "account":
                acct_victims.setdefault(e["normalized"], set()).add(c["victim_alias"])
    top_acct = max(acct_victims.items(), key=lambda kv: len(kv[1]), default=(None, set()))
    return {
        "case_count": metrics["case_count"],
        "victim_count": metrics["victim_count"],
        "total_loss": metrics["total_loss"],
        "cases_last_7d": metrics["cases_last_7d"],
        "p1_case_count": sum(1 for c in cases if c["urgency"]["tier"] == "P1"),
        "max_victims_on_one_account": len(top_acct[1]),
        "strong_edge_count": strong_edges,
        "scam_type_counts": dict(Counter(c["scam_type"]["label"] for c in cases)),
    }


def guess_typology(f: dict) -> tuple[str, float]:
    if f["max_victims_on_one_account"] >= R2_VICTIMS:
        share = f["max_victims_on_one_account"] / max(1, f["victim_count"])
        return "mule_network", round(0.75 + 0.2 * min(1.0, share), 2)
    counts = f["scam_type_counts"]
    total = sum(counts.values()) or 1
    label, n = max(counts.items(), key=lambda kv: kv[1], default=("unknown", 0))
    share = n / total
    if label == "unknown":
        return "unknown", 0.4
    if share > 0.6:
        return TYPOLOGY_FOR_SCAM[label], round(min(0.95, 0.5 + share / 2), 2)
    return "mixed", 0.65


def evaluate(f: dict) -> dict:
    """Deterministic reading of the rulebook. Returns the same shape SERV must return."""
    rules: List[str] = []
    reasons: List[str] = []
    typology, conf = guess_typology(f)

    tier = None
    if f["total_loss"] >= R1_LOSS and f["cases_last_7d"] >= R1_RECENT:
        tier = "P1"; rules.append("R1")
        reasons.append(f"${f['total_loss']:,.0f} lost in total, with {f['cases_last_7d']} new reports in the last 7 days.")
    if f["max_victims_on_one_account"] >= R2_VICTIMS:
        tier = more_urgent(tier or "P2", "P2"); rules.append("R2")
        reasons.append(f"One receiving account is linked to {f['max_victims_on_one_account']} different victims.")
    if tier is None and f["case_count"] == 2 and f["total_loss"] < R6_LOSS:
        tier = "P4"; rules.append("R6")
        reasons.append(f"Only 2 reports, with ${f['total_loss']:,.0f} lost in total.")
    if tier is None:
        tier = "P3"; rules.append("R0")
        reasons.append("Nothing here calls for a higher priority yet.")
    if f["p1_case_count"] >= 1 and f["victim_count"] >= 2 and tier != "P1":
        new = raise_tier(tier)
        rules.append("R3")
        n = f['p1_case_count']
        reasons.append(f"{n} {'report was' if n == 1 else 'reports were'} paid in the last 24 hours, "
                       f"so a bank hold may still work. Priority raised to {new}.")
        tier = new

    needs_review = False
    if f["strong_edge_count"] == 0:
        rules.append("R4"); needs_review = True
        if tier in ("P1", "P2"):
            tier = "P3"
        reasons.append("Only similar names connect these reports, so a person should review them.")
    if conf < R5_CONF:
        rules.append("R5"); needs_review = True
        reasons.append("The scam pattern is not clear enough, so a person should review it.")
    return {"typology": typology, "typology_confidence": conf, "tier": tier,
            "needs_review": needs_review, "rule_ids": rules, "reasons": reasons}


def reconcile(model_out: dict, code_out: dict) -> tuple[dict, List[str]]:
    """R7: when SERV and code disagree, the more cautious outcome wins.

    Returns (result, notes). `notes` are the technical details for the audit log. The
    `reasons` an analyst reads are always the code rulebook's own sentences (the numbers in
    them come from code), plus one plain line whenever SERV saw it differently."""
    notes: List[str] = []
    said: List[str] = []
    out = dict(model_out)
    if model_out.get("tier") not in TIERS:
        out["tier"] = code_out["tier"]; notes.append("SERV tier invalid; used code tier.")
    elif model_out["tier"] != code_out["tier"]:
        out["tier"] = more_urgent(model_out["tier"], code_out["tier"])
        if out["tier"] in ("P1", "P2") and "R4" in code_out["rule_ids"]:
            out["tier"] = code_out["tier"]
        notes.append(f"SERV said {model_out['tier']}, code rules say {code_out['tier']}; R7 kept {out['tier']}.")
        said.append(f"SERV suggested {model_out['tier']}. The written rules say {code_out['tier']}, so the more "
                    f"cautious rating, {out['tier']}, was kept.")
    if code_out["needs_review"] and not model_out.get("needs_review"):
        out["needs_review"] = True; notes.append("Code rules require review (R4/R5); SERV did not flag it.")
    elif model_out.get("needs_review") and not code_out["needs_review"]:
        out["needs_review"] = True
        said.append("SERV asked for a person to review this network.")
    try:
        c = float(model_out.get("typology_confidence", 0))
    except (TypeError, ValueError):
        c = 0.0
    out["typology_confidence"] = max(0.0, min(1.0, c))
    if out.get("typology") not in TYPOLOGY_FOR_SCAM.values() and out.get("typology") != "mule_network":
        out["typology"] = code_out["typology"]; notes.append("SERV typology invalid; used code typology.")
    if "R2" in code_out["rule_ids"] and (out.get("typology") != "mule_network" or out["typology_confidence"] < R5_CONF):
        # R2 fixes the typology: one account shared by 3+ victims is a mule network. The
        # model cannot overrule a rule that code has already established from the facts.
        notes.append(f"SERV said {out.get('typology')} ({out['typology_confidence']}); R2 sets mule_network.")
        out["typology"], out["typology_confidence"] = "mule_network", code_out["typology_confidence"]
        if not code_out["needs_review"]:
            out["needs_review"] = bool(model_out.get("needs_review"))
    if out["typology_confidence"] < R5_CONF:
        if not out.get("needs_review"):
            said.append("SERV was not confident about the scam pattern, so a person should review it.")
        out["needs_review"] = True
    known = {f"R{i}" for i in range(8)}
    rid = {str(r) for r in (out.get("rule_ids") or []) if str(r) in known}
    missing = [r for r in code_out["rule_ids"] if r not in rid]
    if missing:
        notes.append("Rules SERV did not cite: " + ", ".join(missing))
    out["rule_ids"] = sorted(rid | set(code_out["rule_ids"]) | ({"R7"} if notes else set()))
    out["serv_reasons"] = [str(x) for x in (model_out.get("reasons") or []) if isinstance(x, (str, int, float))][:4]
    out["reasons"] = list(code_out["reasons"]) + said
    return out, notes
