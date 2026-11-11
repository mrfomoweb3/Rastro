"""Case urgency rules U1–U4. Pure code, never the model."""
from __future__ import annotations

from datetime import datetime

from app.timeutil import hours_between


def urgency(paid_at: str, amount: float, now: datetime) -> dict:
    h = round(max(0.0, hours_between(paid_at, now)), 1)
    if h <= 24 and amount >= 1000:
        tier, rule = "P1", "U1"
    elif h <= 72:
        tier, rule = "P2", "U2"
    elif h <= 24 * 7:
        tier, rule = "P3", "U3"
    else:
        tier, rule = "P4", "U4"
    return {"tier": tier, "hours_since_payment": h, "rule_id": rule}
