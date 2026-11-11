"""Audit trail + live events."""
from __future__ import annotations

from typing import List, Optional

from app import db
from app.timeutil import iso, now


def audit(object_type: str, object_id: str, step: str, actor: str, summary: str,
          rule_ids: Optional[List[str]] = None, model: Optional[str] = None,
          cost_usd: float = 0.0, latency_ms: int = 0) -> dict:
    return db.add_audit({
        "id": "", "object_type": object_type, "object_id": object_id, "step": step,
        "actor": actor, "model": model, "summary": summary[:500], "rule_ids": rule_ids or [],
        "cost_usd": round(float(cost_usd), 6), "latency_ms": int(latency_ms), "created_at": iso(now()),
    })


def emit(type_: str, object_id: str, message: str) -> dict:
    return db.add_event({"id": 0, "type": type_, "object_id": object_id, "message": message, "at": iso(now())})
