"""Analyst login, one account per fraud team.

Teams come from ANALYST_TEAMS: entries separated by ";", each `slug|Display name|password`.
Without it, one demo team is used (slug `demo`, password `demo`) so the hackathon demo
works out of the box. A session is a signed token (HMAC-SHA256 over team + expiry) kept in
an HTTP-only cookie; there is no session table, so a restart does not log anyone out.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import time
from typing import Dict, Optional

from fastapi import HTTPException, Request

COOKIE = "rastro_session"
TTL_S = 12 * 3600
DEFAULT_TEAMS = "demo|Demo Bank fraud team|demo"


def teams() -> Dict[str, dict]:
    out = {}
    for raw in (os.environ.get("ANALYST_TEAMS") or DEFAULT_TEAMS).split(";"):
        parts = [p.strip() for p in raw.split("|")]
        if len(parts) == 3 and all(parts):
            out[parts[0]] = {"slug": parts[0], "name": parts[1], "password": parts[2]}
    return out


def _secret() -> bytes:
    s = os.environ.get("AUTH_SECRET") or os.environ.get("DEMO_KEY") or "change-me"
    return hashlib.sha256(("rastro-auth:" + s).encode()).digest()


def _sign(payload: str) -> str:
    return base64.urlsafe_b64encode(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest()).decode().rstrip("=")


def issue(slug: str) -> str:
    payload = f"{slug}.{int(time.time()) + TTL_S}"
    return f"{payload}.{_sign(payload)}"


def check_password(slug: str, password: str) -> Optional[dict]:
    t = teams().get(slug)
    if t and hmac.compare_digest(t["password"].encode(), password.encode()):
        return t
    return None


def team_from_token(token: Optional[str]) -> Optional[dict]:
    if not token or token.count(".") != 2:
        return None
    slug, exp, sig = token.split(".")
    if not hmac.compare_digest(sig, _sign(f"{slug}.{exp}")):
        return None
    try:
        if int(exp) < time.time():
            return None
    except ValueError:
        return None
    return teams().get(slug)


def current_team(request: Request) -> Optional[dict]:
    token = request.cookies.get(COOKIE)
    h = request.headers.get("authorization", "")
    if h.lower().startswith("bearer "):
        token = h[7:].strip()
    return team_from_token(token)


def require_team(request: Request) -> dict:
    t = current_team(request)
    if t is None:
        raise HTTPException(401, "analyst login required")
    return t


def public(t: dict) -> dict:
    return {"slug": t["slug"], "name": t["name"]}
