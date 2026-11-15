"""Rewrite the wording stored in data/prebaked.json with the current code, without touching
any number, id, rank or timestamp. Run it after changing the text of the rule reasons or
of the template brief, so the demo data reads the same as freshly generated data.

    python -m scripts.refresh_wording

Every network is re-read by the code rulebook first. If its tier or rule ids no longer
match what is stored, the script stops: that would be a logic change, not a wording one.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["RASTRO_OFFLINE"] = "1"  # wording only; never calls SERV
import app  # noqa: E402,F401
from app import ENGINE_DIR, core  # noqa: E402
from rules import priority  # noqa: E402

SNAPSHOT = Path(os.environ.get("RASTRO_SNAPSHOT") or ENGINE_DIR / "data" / "prebaked.json")
R5_NOTE = "The scam pattern is not clear enough to confirm."


def main() -> dict:
    snap = json.loads(SNAPSHOT.read_text())
    t = snap["tables"]
    cases = {r["id"]: r["data"] for r in t["cases"]}
    nets = {}
    changed = {"reasons": 0, "briefs": 0, "audit": 0}
    for row in t["networks"]:
        net = row["data"]
        cs = [cases[i] for i in net["case_ids"]]
        code = priority.evaluate(priority.facts_for(cs, net["metrics"], core.strong_edge_count(net)))
        p = net["priority"]
        if code["tier"] != p["tier"] or sorted(code["rule_ids"]) != sorted(p["rule_ids"]):
            raise SystemExit(f"{net['id']}: stored {p['tier']} {p['rule_ids']} but the rules now say "
                             f"{code['tier']} {code['rule_ids']}. Re-bake instead of rewording.")
        if p["reasons"] != code["reasons"]:
            p["reasons"] = code["reasons"]
            changed["reasons"] += 1
        b = net.get("brief")
        if b:
            nb = core._template_brief(net, cs)
            notes = core.brief_issues(net, nb, cs)
            if net["typology"]["confidence"] < priority.R5_CONF:
                notes.append(R5_NOTE)
            nb["checked"], nb["check_notes"] = not notes, sorted(set(notes))
            if nb["checked"] != b["checked"]:
                raise SystemExit(f"{net['id']}: the brief check result would change ({b['checked']} → {nb['checked']}).")
            if nb != b:
                net["brief"] = nb
                changed["briefs"] += 1
        nets[net["id"]] = net
    for row in t["audit"]:
        a = row["data"]
        net = nets.get(a["object_id"])
        if not net:
            continue
        old = a["summary"]
        if a["step"] == "decide" and a["actor"] == "code":
            p, ty = net["priority"], net["typology"]
            a["summary"] = (f"{p['tier']}, typology {ty['label']} ({ty['confidence']}), score {p['score']}. "
                            + " ".join(p["reasons"][:4]) + " (offline: code rulebook)")[:500]
        elif a["step"] == "brief" and a["actor"] == "code":
            a["summary"] = "Brief written from the standard template (offline)."
        elif a["step"] == "verify" and (net.get("brief") or {}).get("check_notes"):
            a["summary"] = "Brief failed checks → needs_review: " + "; ".join(net["brief"]["check_notes"][:3])
        changed["audit"] += a["summary"] != old
    SNAPSHOT.write_text(json.dumps(snap))
    print(json.dumps(changed))
    return changed


if __name__ == "__main__":
    main()
