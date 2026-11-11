from __future__ import annotations

from datetime import datetime, timedelta, timezone


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse(s: str) -> datetime:
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def hours_between(earlier_iso: str, later: datetime) -> float:
    return (later - parse(earlier_iso)).total_seconds() / 3600.0


def shift_iso(s: str, delta: timedelta) -> str:
    return iso(parse(s) + delta)
