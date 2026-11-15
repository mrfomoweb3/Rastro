"""Analyst login, team-private feedback and exports, and reporter identity checks."""
import csv
import io
import json
import time

from fastapi.testclient import TestClient

from app import db
from app.main import app
from conftest import login

TURNS = ["Someone called me pretending to be my bank and told me to move my money.", "I sent $1,500.",
         "About 5 hours ago.", "The account was Demo Bank 0123456789. They called from +234 803 555 0142.",
         "You can reach me on +234 701 555 9911.", "skip"]


def _file(client, turns=TURNS):
    r = client.post("/intake/sessions").json()
    for t in turns:
        r = client.post(f"/intake/sessions/{r['session_id']}/messages", json={"text": t}).json()
        if r["done"]:
            return r
    raise AssertionError(r)


def _wait(cid):
    for _ in range(300):
        if db.get_case_meta(cid).get("network_done"):
            return
        time.sleep(0.1)
    raise AssertionError("pipeline did not finish")


def test_login_me_logout_and_tokens():
    c = TestClient(app)
    assert c.get("/auth/me").status_code == 401
    login(c, "north", "north-pass")
    assert c.get("/auth/me").json() == {"slug": "north", "name": "North Bank fraud team"}
    assert c.get("/auth/teams").json() and "password" not in json.dumps(c.get("/auth/teams").json())
    c.post("/auth/logout")
    assert c.get("/auth/me").status_code == 401
    assert TestClient(app).get("/networks", headers={"authorization": "Bearer demo.9999999999.forged"}).status_code == 401


def test_feedback_is_private_to_the_team_and_survives_a_reset(fresh):
    demo, north = login(TestClient(app)), login(TestClient(app), "north", "north-pass")
    r = demo.post("/networks/N-007/feedback", json={"about": "priority", "verdict": "too_low", "note": "  urgent  "})
    assert r.status_code == 200 and r.json()["actor"] == "human" and "Priority should be higher" in r.json()["summary"]
    assert demo.post("/networks/N-007/feedback", json={"about": "brief", "verdict": "too_low"}).status_code == 422
    assert [a["summary"] for a in demo.get("/networks/N-007/feedback").json()][-1].endswith("Note: urgent")
    assert north.get("/networks/N-007/feedback").json() == []
    assert not any(a["step"] == "feedback" for a in north.get("/audit?object_id=N-007").json())
    assert any(a["step"] == "feedback" for a in demo.get("/audit?object_id=N-007").json())
    assert demo.post("/demo/reset", headers={"X-Demo-Key": "test-key"}).json() == {"ok": True}
    assert len(demo.get("/networks/N-007/feedback").json()) == 1


def test_exports_csv_and_json(fresh):
    c = login(TestClient(app))
    assert TestClient(app).get("/networks/N-007/export.csv").status_code == 401
    r = c.get("/networks/N-007/export.csv")
    rows = list(csv.DictReader(io.StringIO(r.content.decode("utf-8-sig"))))
    assert r.status_code == 200 and len(rows) == 39 and rows[0]["network_id"] == "N-007"
    assert all("0123456789" in x["bank_accounts"] for x in rows)
    doc = c.get("/networks/N-007/export.json").json()
    assert doc["schema"] == "rastro.casefile/v1" and len(doc["reports"]) == 39 and doc["network"]["brief"]["fact_checked"]
    assert c.get("/networks/N-007/export.xml").status_code == 404
    assert sum(a["step"] == "export" for a in c.get("/audit?object_id=N-007").json()) == 2


def test_reporter_contact_is_private_and_repeat_reports_count_once(fresh):
    victim = TestClient(app)
    first = _file(victim)
    assert first["done"] and "contact" not in first["missing_fields"]
    _wait(first["case_id"])
    cid = first["case_id"]
    c = db.get_case(cid)
    assert "+234 701 555 9911" not in json.dumps(c) and "07015559911" not in json.dumps(c)   # never stored as data
    assert all(e["kind"] != "phone" or e["normalized"] != "07015559911" for e in c["entities"])
    assert "repeat_reporter" not in c["flags"]
    # the victim can read their own report and packet, nobody else's
    sid = db.get_case_meta(cid)["session_id"]
    assert victim.get(f"/cases/{cid}").status_code == 401
    assert victim.get(f"/cases/{cid}?session={sid}").status_code == 200
    assert victim.get(f"/cases/{cid}/packet.pdf?session={sid}").content[:4] == b"%PDF"
    assert victim.get(f"/cases/C-0001?session={sid}").status_code == 401
    victims_before = db.get_network("N-007")["metrics"]["victim_count"]
    second = _file(TestClient(app))                      # same person files again
    _wait(second["case_id"])
    c2 = db.get_case(second["case_id"])
    assert "repeat_reporter" in c2["flags"] and c2["victim_alias"] == c["victim_alias"]
    net = db.get_network("N-007")
    assert net["metrics"]["case_count"] == 41 and net["metrics"]["victim_count"] == victims_before
    assert net["status"] == "needs_review" and any("reported before" in n for n in net["brief"]["check_notes"])


def test_contact_question_asks_again_when_unreadable(fresh):
    c = TestClient(app)
    r = c.post("/intake/sessions").json()
    for t in TURNS[:4]:
        r = c.post(f"/intake/sessions/{r['session_id']}/messages", json={"text": t}).json()
    assert r["missing_fields"] == ["contact"]
    r = c.post(f"/intake/sessions/{r['session_id']}/messages", json={"text": "I'd rather not"}).json()
    assert r["missing_fields"] == ["contact"] and "couldn't read" in r["reply"]
