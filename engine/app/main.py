"""Rastro engine API (contract section 3.2)."""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path
import os
from datetime import timedelta
from typing import List, Optional

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from app import ENGINE_DIR, core, db, intake, serv
from app.log import emit
from app.timeutil import iso, now as utcnow, parse, shift_iso
from contract.schema import (AuditEvent, Case, IntakeReply, LiveEvent, MessageIn, Network, OkReply, Stats)

SNAPSHOT = Path(os.environ.get("RASTRO_SNAPSHOT") or ENGINE_DIR / "data" / "prebaked.json")
MIN_PER_PACKET_H = 0.75   # assumption: analyst time to assemble one bank-ready packet by hand
MIN_PER_BRIEF_H = 2.0     # assumption: analyst time to map + write up one network by hand

@asynccontextmanager
async def lifespan(_app):
    db.init()
    if db.count(db.cases) == 0:
        restore_snapshot()
    yield


app = FastAPI(title="Rastro engine", version="1.0.0", lifespan=lifespan,
              description="Turns scam reports into bank-ready evidence packets and ranks the networks behind them.")
origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_origin_regex=r"https://.*\.vercel\.app",
                   allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(HTTPException)
async def _http_err(_: Request, exc: HTTPException):
    return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)


@app.exception_handler(Exception)
async def _any_err(_: Request, exc: Exception):
    return JSONResponse({"error": f"{type(exc).__name__}: {exc}"[:300]}, status_code=500)


# ------------------------------------------------------------------ snapshot / reset
def _shift_snapshot(snap: dict) -> dict:
    """Move every timestamp forward so the pre-baked state is 'fresh' (hours-since-payment
    and last-7-days stay exactly as they were when baked)."""
    delta = utcnow() - parse(snap["baked_at"])
    delta = timedelta(seconds=int(delta.total_seconds()))
    sh = lambda s: shift_iso(s, delta) if s else s  # noqa: E731
    t = snap["tables"]
    for r in t.get("cases", []):
        d = r["data"]
        d["reported_at"], d["paid_at"] = sh(d["reported_at"]), sh(d["paid_at"])
        r["reported_at"] = d["reported_at"]
    for r in t.get("networks", []):
        d = r["data"]
        d["metrics"]["first_seen"], d["metrics"]["last_seen"] = sh(d["metrics"]["first_seen"]), sh(d["metrics"]["last_seen"])
        d["updated_at"] = sh(d["updated_at"])
    for r in t.get("audit", []):
        r["data"]["created_at"] = sh(r["data"]["created_at"])
    for r in t.get("events", []):
        r["data"]["at"] = sh(r["data"]["at"])
    return t


def restore_snapshot() -> bool:
    if not SNAPSHOT.exists():
        return False
    snap = json.loads(SNAPSHOT.read_text())
    db.load_all(_shift_snapshot(snap))
    db.set_meta("restored_at", iso(utcnow()))
    db.set_meta("prebake", snap.get("stats", {}))
    return True


# ------------------------------------------------------------------ endpoints
@app.get("/health")
def health():
    return {"ok": True, "serv": serv.available(), "cases": db.count(db.cases)}


@app.post("/intake/sessions", response_model=IntakeReply)
def intake_start():
    return intake.start()


@app.post("/intake/sessions/{sid}/messages", response_model=IntakeReply)
def intake_message(sid: str, body: MessageIn):
    r = intake.message(sid, body.text)
    if r is None:
        raise HTTPException(404, f"session {sid} not found")
    return r


@app.get("/cases", response_model=List[Case])
def cases(status: Optional[str] = None, limit: int = Query(100, ge=1, le=1000)):
    ents = {e["id"]: e for e in db.all_entities()}
    return [core.hydrate(c, ents) for c in db.list_cases(status=status or None, limit=limit)]


@app.get("/cases/{cid}", response_model=Case)
def case(cid: str):
    c = db.get_case(cid)
    if not c:
        raise HTTPException(404, f"case {cid} not found")
    return core.hydrate(c)


@app.get("/cases/{cid}/packet.pdf")
def packet(cid: str):
    from app.pdf import render_packet
    pdf = render_packet(cid)
    if pdf is None:
        raise HTTPException(404, f"case {cid} not found")
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="rastro-{cid}.pdf"'})


@app.get("/networks", response_model=List[Network])
def networks(limit: int = Query(50, ge=1, le=500)):
    return db.list_networks(limit=limit)


@app.get("/networks/{nid}", response_model=Network)
def network(nid: str):
    n = db.get_network(nid)
    if not n:
        raise HTTPException(404, f"network {nid} not found")
    return n


@app.post("/networks/{nid}/brief", response_model=Network)
def network_brief(nid: str):
    """Brief on demand (networks outside the pre-baked top 10). Additive to the contract."""
    from graph import network_graph
    n = db.get_network(nid)
    if not n:
        raise HTTPException(404, f"network {nid} not found")
    ents = {e["id"]: e for e in db.all_entities()}
    cs = [core.hydrate(c, ents) for c in db.list_cases(ids=n["case_ids"])]
    n = core.brief(n, cs)
    n = core.verify(n, cs)
    db.put_network(n)
    emit("brief_updated", nid, f"Brief for {nid} generated on demand")
    return n


@app.get("/audit", response_model=List[AuditEvent])
def audit_log(object_id: Optional[str] = None, limit: int = Query(2000, ge=1, le=10000)):
    return db.list_audit(object_id, limit)


@app.get("/stats", response_model=Stats)
def stats():
    n_cases = db.count(db.cases)
    nets = db.list_networks()
    case_review = db.count(db.cases, db.cases.c.status.in_(["needs_review", "flagged_input"]))
    total = db.total_cost() + float((db.get_meta("prebake") or {}).get("serv_cost_usd_not_in_audit", 0.0))
    meta = db.all_case_meta()
    secs = [m["packet_seconds"] for m in meta.values() if "packet_seconds" in m]
    if not secs:
        secs = [(db.get_meta("prebake") or {}).get("avg_seconds_report_to_packet", 0.0)]
    packets = sum(1 for c in db.list_cases() if c["packet_url"])
    briefs = sum(1 for n in nets if (n.get("brief") or {}).get("checked"))
    return {
        "cases_total": n_cases,
        "networks_total": len(nets),
        "needs_review": case_review + sum(1 for n in nets if n["status"] == "needs_review"),
        "total_cost_usd": round(total, 4),
        "avg_cost_per_case_usd": round(total / n_cases, 5) if n_cases else 0.0,
        "avg_seconds_report_to_packet": round(sum(secs) / len(secs), 2) if secs else 0.0,
        "analyst_hours_saved": round(packets * MIN_PER_PACKET_H + briefs * MIN_PER_BRIEF_H, 1),
    }


@app.get("/events", response_model=List[LiveEvent])
def events(after: int = Query(0, ge=0)):
    return db.list_events(after)


@app.post("/demo/reset", response_model=OkReply)
def demo_reset(x_demo_key: Optional[str] = Header(None)):
    key = os.environ.get("DEMO_KEY", "change-me")
    if x_demo_key != key:
        raise HTTPException(401, "missing or wrong X-Demo-Key header")
    if not restore_snapshot():
        raise HTTPException(500, "no pre-baked snapshot; run scripts/prebake.py")
    return {"ok": True}
