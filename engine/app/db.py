"""Storage. Objects are stored as contract-shaped JSON plus a few indexed columns.
Same code on SQLite (local) and Postgres (Supabase)."""
from __future__ import annotations

import json
import os
import threading
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import (JSON, Column, Float, Integer, MetaData, String, Table, Text,
                        create_engine, delete, func, insert, select, update)

from app import ENGINE_DIR

DATABASE_URL = os.environ.get("DATABASE_URL") or f"sqlite:///{ENGINE_DIR / 'rastro.db'}"
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]

_kw: Dict[str, Any] = {"future": True}
if DATABASE_URL.startswith("sqlite"):
    _kw["connect_args"] = {"check_same_thread": False}
engine = create_engine(DATABASE_URL, **_kw)
LOCK = threading.RLock()  # one writer at a time (SQLite + background pipeline)

md = MetaData()
cases = Table("cases", md,
              Column("id", String(16), primary_key=True),
              Column("status", String(24), index=True),
              Column("network_id", String(16), index=True),
              Column("reported_at", String(32), index=True),
              Column("data", JSON, nullable=False),
              Column("meta", JSON))
entities = Table("entities", md,
                 Column("id", String(16), primary_key=True),
                 Column("kind", String(16), index=True),
                 Column("normalized", String(256), index=True),
                 Column("data", JSON, nullable=False))
networks = Table("networks", md,
                 Column("id", String(16), primary_key=True),
                 Column("rank", Integer, index=True),
                 Column("data", JSON, nullable=False))
audit = Table("audit", md,
              Column("seq", Integer, primary_key=True, autoincrement=True),
              Column("object_id", String(16), index=True),
              Column("cost_usd", Float, default=0.0),
              Column("data", JSON, nullable=False))
events = Table("events", md,
               Column("id", Integer, primary_key=True, autoincrement=True),
               Column("data", JSON, nullable=False))
sessions = Table("sessions", md,
                 Column("id", String(40), primary_key=True),
                 Column("data", JSON, nullable=False))
meta = Table("meta", md,
             Column("key", String(64), primary_key=True),
             Column("value", Text))

TABLES = [cases, entities, networks, audit, events, sessions, meta]


def init() -> None:
    md.create_all(engine)


def wipe() -> None:
    with LOCK, engine.begin() as cx:
        for t in TABLES:
            cx.execute(delete(t))


# ---------- meta ----------
def get_meta(key: str, default=None):
    with engine.connect() as cx:
        v = cx.execute(select(meta.c.value).where(meta.c.key == key)).scalar()
    return json.loads(v) if v is not None else default


def set_meta(key: str, value) -> None:
    with LOCK, engine.begin() as cx:
        cx.execute(delete(meta).where(meta.c.key == key))
        cx.execute(insert(meta).values(key=key, value=json.dumps(value)))


# ---------- cases ----------
def put_case(c: dict, meta_: Optional[dict] = None) -> None:
    row = dict(id=c["id"], status=c["status"], network_id=c["network_id"],
               reported_at=c["reported_at"], data=c)
    with LOCK, engine.begin() as cx:
        old = cx.execute(select(cases.c.meta).where(cases.c.id == c["id"])).first()
        if old is None:
            cx.execute(insert(cases).values(**row, meta=meta_ or {}))
        else:
            if meta_ is not None:
                row["meta"] = {**(old[0] or {}), **meta_}
            cx.execute(update(cases).where(cases.c.id == c["id"]).values(**row))


def put_cases_bulk(rows: Iterable[dict]) -> None:
    vals = [dict(id=c["id"], status=c["status"], network_id=c["network_id"],
                 reported_at=c["reported_at"], data=c, meta={}) for c in rows]
    with LOCK, engine.begin() as cx:
        if vals:
            cx.execute(insert(cases), vals)


def get_case(cid: str) -> Optional[dict]:
    with engine.connect() as cx:
        r = cx.execute(select(cases.c.data).where(cases.c.id == cid)).first()
    return r[0] if r else None


def get_case_meta(cid: str) -> dict:
    with engine.connect() as cx:
        r = cx.execute(select(cases.c.meta).where(cases.c.id == cid)).first()
    return (r[0] or {}) if r else {}


def list_cases(status: Optional[str] = None, limit: Optional[int] = None,
               ids: Optional[Iterable[str]] = None) -> List[dict]:
    q = select(cases.c.data).order_by(cases.c.reported_at.desc(), cases.c.id.desc())
    if status:
        q = q.where(cases.c.status == status)
    if ids is not None:
        q = q.where(cases.c.id.in_(list(ids)))
    if limit:
        q = q.limit(limit)
    with engine.connect() as cx:
        return [r[0] for r in cx.execute(q)]


def all_case_meta() -> Dict[str, dict]:
    with engine.connect() as cx:
        return {r[0]: (r[1] or {}) for r in cx.execute(select(cases.c.id, cases.c.meta))}


def next_case_id() -> str:
    with engine.connect() as cx:
        ids = [r[0] for r in cx.execute(select(cases.c.id))]
    n = max((int(i.split("-")[1]) for i in ids), default=0) + 1
    return f"C-{n:04d}"


def count(table: Table, *where) -> int:
    q = select(func.count()).select_from(table)
    for w in where:
        q = q.where(w)
    with engine.connect() as cx:
        return int(cx.execute(q).scalar() or 0)


# ---------- entities ----------
def all_entities() -> List[dict]:
    with engine.connect() as cx:
        return [r[0] for r in cx.execute(select(entities.c.data).order_by(entities.c.id))]


def put_entities(rows: Iterable[dict]) -> None:
    rows = list(rows)
    with LOCK, engine.begin() as cx:
        for e in rows:
            cx.execute(delete(entities).where(entities.c.id == e["id"]))
        if rows:
            cx.execute(insert(entities), [dict(id=e["id"], kind=e["kind"], normalized=e["normalized"], data=e)
                                          for e in rows])


# ---------- networks ----------
def put_network(n: dict) -> None:
    with LOCK, engine.begin() as cx:
        cx.execute(delete(networks).where(networks.c.id == n["id"]))
        cx.execute(insert(networks).values(id=n["id"], rank=n["priority"]["rank"], data=n))


def delete_network(nid: str) -> None:
    with LOCK, engine.begin() as cx:
        cx.execute(delete(networks).where(networks.c.id == nid))


def get_network(nid: str) -> Optional[dict]:
    with engine.connect() as cx:
        r = cx.execute(select(networks.c.data).where(networks.c.id == nid)).first()
    return r[0] if r else None


def list_networks(limit: Optional[int] = None) -> List[dict]:
    q = select(networks.c.data).order_by(networks.c.rank.asc(), networks.c.id.asc())
    if limit:
        q = q.limit(limit)
    with engine.connect() as cx:
        return [r[0] for r in cx.execute(q)]


# ---------- audit ----------
def add_audit(ev: dict) -> dict:
    with LOCK, engine.begin() as cx:
        seq = cx.execute(insert(audit).values(object_id=ev["object_id"], cost_usd=ev["cost_usd"], data={})
                         ).inserted_primary_key[0]
        ev = {**ev, "id": f"A-{seq:06d}"}
        cx.execute(update(audit).where(audit.c.seq == seq).values(data=ev))
    return ev


def list_audit(object_id: Optional[str] = None, limit: int = 2000) -> List[dict]:
    q = select(audit.c.data).order_by(audit.c.seq.asc())
    if object_id:
        q = q.where(audit.c.object_id == object_id)
    with engine.connect() as cx:
        return [r[0] for r in cx.execute(q.limit(limit))]


def total_cost() -> float:
    with engine.connect() as cx:
        return float(cx.execute(select(func.coalesce(func.sum(audit.c.cost_usd), 0.0))).scalar() or 0.0)


# ---------- events ----------
def add_event(ev: dict) -> dict:
    with LOCK, engine.begin() as cx:
        eid = cx.execute(insert(events).values(data={})).inserted_primary_key[0]
        ev = {**ev, "id": int(eid)}
        cx.execute(update(events).where(events.c.id == eid).values(data=ev))
    return ev


def list_events(after: int = 0, limit: int = 200) -> List[dict]:
    q = select(events.c.data).where(events.c.id > after).order_by(events.c.id.asc()).limit(limit)
    with engine.connect() as cx:
        return [r[0] for r in cx.execute(q)]


# ---------- intake sessions ----------
def get_session(sid: str) -> Optional[dict]:
    with engine.connect() as cx:
        r = cx.execute(select(sessions.c.data).where(sessions.c.id == sid)).first()
    return r[0] if r else None


def put_session(s: dict) -> None:
    with LOCK, engine.begin() as cx:
        cx.execute(delete(sessions).where(sessions.c.id == s["id"]))
        cx.execute(insert(sessions).values(id=s["id"], data=s))


# ---------- snapshot (pre-bake / demo reset) ----------
def dump_all() -> Dict[str, List[dict]]:
    out = {}
    with engine.connect() as cx:
        for t in TABLES:
            out[t.name] = [dict(r._mapping) for r in cx.execute(select(t))]
    return out


def load_all(snapshot: Dict[str, List[dict]]) -> None:
    with LOCK, engine.begin() as cx:
        for t in TABLES:
            cx.execute(delete(t))
            rows = snapshot.get(t.name) or []
            if rows:
                cx.execute(insert(t), rows)
    _reset_sequences()


def _reset_sequences() -> None:
    if not DATABASE_URL.startswith("postgres"):
        return
    with engine.begin() as cx:
        for t, col in (("audit", "seq"), ("events", "id")):
            cx.exec_driver_sql(
                f"SELECT setval(pg_get_serial_sequence('{t}','{col}'), COALESCE((SELECT MAX({col}) FROM {t}),0)+1, false)")
