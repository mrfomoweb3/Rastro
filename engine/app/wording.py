"""Plain-language labels for anything a person reads (the PDF packet). The data keeps its
exact ids and rule numbers; this module only decides how they are worded on paper."""
from __future__ import annotations

import re
from datetime import timezone

from app.timeutil import parse

KIND = {"account": "Bank account", "phone": "Phone number", "url": "Website", "email": "Email address",
        "wallet": "Crypto wallet", "name": "Name the scammer used"}
CHANNEL = {"whatsapp": "WhatsApp", "sms": "SMS", "email": "Email", "phone": "Phone call",
           "social": "Social media", "website": "Website", "other": "Other"}
SCAM = {"investment": "Investment scam", "impersonation": "Impersonation of a bank or official",
        "romance": "Romance scam", "phishing": "Phishing", "fake_job": "Fake job offer",
        "purchase": "Fake purchase", "unknown": "Not clear yet"}
PATTERN = {"mule_network": "Mule network", "investment_ring": "Investment ring",
           "impersonation_ring": "Impersonation ring", "romance_ring": "Romance ring",
           "phishing_kit": "Phishing kit", "mixed": "Mixed scam types", "unknown": "Not clear yet"}
TIER = {"P1": "P1, most urgent", "P2": "P2, high", "P3": "P3, normal", "P4": "P4, low"}
ACTOR = {"code": "Rules", "serv": "SERV", "shadow": "SERV shadow agent", "human": "Analyst"}
STEP = {"intake": "Report received", "guard": "Screened for manipulation",
        "completeness": "Checked the report is complete", "urgency": "Urgency set",
        "extract": "Accounts, phones and links found", "link": "Matched to earlier reports",
        "packet": "Evidence packet ready", "decide": "Priority set", "brief": "Brief written",
        "verify": "Brief fact-checked", "rank": "Ranking updated", "pipeline": "Processing problem",
        "identity": "Reporter checked", "feedback": "Analyst feedback", "export": "Exported"}


def when(iso_text: str) -> str:
    """2026-11-15T07:09:05Z → 15 Nov 2026, 07:09 UTC"""
    try:
        d = parse(iso_text).astimezone(timezone.utc)
        return f"{d.day} {d.strftime('%b %Y, %H:%M')} UTC"
    except Exception:  # noqa: BLE001
        return iso_text


def ago(hours: float) -> str:
    h = float(hours)
    if h < 1.5:
        return "about an hour"
    if h < 48:
        return f"about {round(h)} hours"
    return f"about {round(h / 24)} days"


def urgency(u: dict) -> str:
    t = u.get("tier", "P4")
    paid = f"Paid {ago(u.get('hours_since_payment', 0))} before the report."
    tail = " A bank hold may still be possible." if t == "P1" else ""
    return f"{TIER.get(t, t)}. {paid}{tail}"


def others(n_reports: int) -> str:
    n = max(0, int(n_reports) - 1)
    if n == 0:
        return "not seen in any other report"
    return f"also named in {n} other report{'' if n == 1 else 's'}"


def step_detail(a: dict) -> str:
    """One short sentence per audit step, without scores, model names or rule ids."""
    s = a.get("summary", "")
    step = a.get("step")
    if step == "intake":
        return "Chat with the victim." if a.get("actor") == "serv" else "The victim finished the report."
    if step == "guard":
        return ("Nothing suspicious in the text." if s.startswith("No injection") else
                "The text tried to instruct the system. It was kept as evidence and could not change the result.")
    if step == "urgency":
        m = re.match(r"(P\d): paid ([\d.]+) h ago, (\$[\d,.]+)", s)
        return f"{m.group(1)}: {m.group(3)} paid {ago(float(m.group(2)))} earlier." if m else s
    if step == "extract":
        if s.startswith("Seed case"):
            return "Details came with the imported report."
        m = re.search(r"\(([^)]*)\)", s)
        return f"Found: {m.group(1)}." if m else s
    if step == "link":
        return re.sub(r" via shared account/phone/link", " through a shared account, phone or link", s)
    if step == "packet":
        return "One-page PDF, ready to hand to the bank."
    if step == "pipeline":
        return "Something went wrong while processing. A person should review this report."
    return s.split(" | ")[0]
