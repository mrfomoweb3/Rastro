"""Network exports for bank case-management systems.

* CSV: one row per report, flat columns, the format most case tools import.
* JSON: a self-contained case file (`rastro.casefile/v1`): the network, its priority and
  reasons, the fact-checked brief, every report with its traceable details, and the shared
  audit trail. Victim contact details are never exported; Rastro does not keep them.
"""
from __future__ import annotations

import csv
import io
import json
from typing import Tuple

from app import core, db, wording
from app.timeutil import iso, now

CSV_COLUMNS = ["network_id", "network_pattern", "network_priority", "network_rank", "report_id", "reported_at_utc",
               "paid_at_utc", "amount", "currency", "contact_channel", "scam_type", "urgency", "report_status",
               "flags", "bank_accounts", "phones", "websites", "emails", "wallets", "packet_url"]


def _cases(net: dict):
    ents = {e["id"]: e for e in db.all_entities()}
    return sorted((core.hydrate(c, ents) for c in db.list_cases(ids=net["case_ids"])), key=lambda c: c["reported_at"])


def _details(c: dict, kind: str) -> str:
    return "; ".join(e["value"] for e in c["entities"] if e["kind"] == kind)


def to_csv(net: dict, base_url: str) -> Tuple[bytes, str]:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_COLUMNS)
    p = net["priority"]
    for c in _cases(net):
        w.writerow([net["id"], wording.PATTERN.get(net["typology"]["label"], net["typology"]["label"]), p["tier"],
                    p["rank"], c["id"], c["reported_at"], c["paid_at"], f"{float(c['amount']):.2f}", "USD",
                    c["channel"], c["scam_type"]["label"], c["urgency"]["tier"], c["status"], "; ".join(c["flags"]),
                    _details(c, "account"), _details(c, "phone"), _details(c, "url"), _details(c, "email"),
                    _details(c, "wallet"), f"{base_url}/cases/{c['id']}/packet.pdf"])
    return buf.getvalue().encode("utf-8-sig"), "text/csv; charset=utf-8"


def to_json(net: dict, team: dict, base_url: str) -> Tuple[bytes, str]:
    cases = _cases(net)
    b = net.get("brief") or {}
    doc = {
        "schema": "rastro.casefile/v1",
        "exported_at": iso(now()),
        "exported_by": {"team": team["name"]},
        "notice": "Prepared by Rastro for human review. Rastro does not freeze funds, block accounts or determine "
                  "guilt. All data in this demo is synthetic.",
        "network": {
            "id": net["id"],
            "pattern": wording.PATTERN.get(net["typology"]["label"], net["typology"]["label"]),
            "status": net["status"],
            "priority": {"tier": net["priority"]["tier"], "rank": net["priority"]["rank"],
                         "rules": net["priority"]["rule_ids"], "reasons": net["priority"]["reasons"]},
            "metrics": net["metrics"],
            "shared_details": [{"kind": s["kind"], "label": s["label"], "reports": s["report_count"],
                                "strength": s["strength"]} for s in core.shared_entities(net)],
            "brief": {"summary": b.get("summary"), "why_linked": [w["claim"] for w in b.get("why_linked", [])],
                      "gaps": b.get("gaps", []), "next_steps": b.get("next_steps", []),
                      "fact_checked": bool(b.get("checked")), "check_notes": b.get("check_notes", [])} if b else None,
        },
        "reports": [{
            "id": c["id"], "reported_at": c["reported_at"], "paid_at": c["paid_at"],
            "amount": {"value": float(c["amount"]), "currency": "USD"}, "contact_channel": c["channel"],
            "scam_type": c["scam_type"]["label"], "urgency": c["urgency"]["tier"], "status": c["status"],
            "flags": c["flags"], "narrative": c["narrative"], "scam_messages": c["scam_messages"],
            "details": [{"kind": e["kind"], "value": e["value"], "normalized": e["normalized"]} for e in c["entities"]],
            "packet_url": f"{base_url}/cases/{c['id']}/packet.pdf",
        } for c in cases],
        "audit_trail": [{k: a[k] for k in ("created_at", "step", "actor", "model", "summary", "rule_ids")}
                        for a in db.list_audit(net["id"]) if a["step"] in ("decide", "brief", "verify", "rank", "link")],
    }
    return json.dumps(doc, indent=2).encode(), "application/json"
