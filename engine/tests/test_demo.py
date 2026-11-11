"""Definition-of-done checks against the pre-baked seed + the live hero report."""
import json
import time

from fastapi.testclient import TestClient

from app import ENGINE_DIR, REPO_ROOT, core
from contract.schema import AuditEvent, Case, IntakeReply, LiveEvent, Network, Stats


def _rank(db, nid):
    return db.get_network(nid)["priority"]["rank"]


def test_hero_starts_at_6(baked):
    n = baked.get_network("N-007")
    assert n["priority"]["rank"] == 6
    assert n["priority"]["tier"] == "P2"
    assert n["typology"]["label"] == "mule_network"
    assert n["metrics"]["total_loss"] < 50_000 and n["metrics"]["cases_last_7d"] == 6
    assert baked.list_networks()[0]["id"] == "N-001"


def test_injection_case(baked):
    c = baked.get_case("C-0450")
    assert "injection_attempt" in c["flags"] and c["status"] == "flagged_input"
    assert any(e["kind"] == "account" for e in c["entities"])  # account NOT removed
    net = baked.get_network(c["network_id"])
    # ranking computed only from code facts → identical to the rulebook without the text
    from rules import priority
    cases = [x for x in baked.list_cases() if x["network_id"] == net["id"]]
    expected = priority.evaluate(priority.facts_for(cases, net["metrics"], core.strong_edge_count(net)))
    assert net["priority"]["tier"] == expected["tier"] == "P1"
    assert any(e["step"] == "guard" and "Instruction-like" in e["summary"] for e in baked.list_audit("C-0450"))


def test_lookalike_pair_weak_only(baked):
    a, b = baked.get_case("C-0300"), baked.get_case("C-0301")
    assert a["network_id"] is None and b["network_id"] is None
    assert "name_lookalike:C-0301" in a["flags"] and "name_lookalike:C-0300" in b["flags"]


def test_every_brief_checked_or_review(baked):
    for n in baked.list_networks():
        if n["brief"]:
            assert n["brief"]["checked"] or (n["status"] == "needs_review" and n["brief"]["check_notes"])
        assert n["priority"]["rule_ids"]


def test_verify_catches_bad_brief(baked):
    net = baked.get_network("N-007")
    cases = [core.hydrate(x) for x in baked.list_cases(ids=net["case_ids"])]
    bad = json.loads(json.dumps(net))
    bad["brief"]["why_linked"].append({"claim": "Also linked to N-099 via 12 reports.", "edge_ids": ["X-FAKE"]})
    bad["brief"]["summary"] += f" {cases[0]['victim_alias']} lost $999,999 and is guilty."
    out = core.verify(bad, cases)
    notes = " ".join(out["brief"]["check_notes"])
    assert not out["brief"]["checked"] and out["status"] == "needs_review"
    assert "X-FAKE" in notes and "999,999" in notes and "name" in notes and "guilt" in notes


def test_live_report_end_to_end(fresh):
    db = fresh
    assert _rank(db, "N-007") == 6
    client = TestClient(__import__("app.main", fromlist=["app"]).app)
    last_event = max([e["id"] for e in client.get("/events").json()] or [0])
    r = client.post("/intake/sessions")
    assert r.status_code == 200
    IntakeReply(**r.json())
    sid = r.json()["session_id"]
    turns = json.loads((REPO_ROOT / "demo" / "hero_cases.json").read_text())["live_case"]["turns"]
    t0 = time.time()
    reply = None
    for t in turns:
        reply = client.post(f"/intake/sessions/{sid}/messages", json={"text": t}).json()
        IntakeReply(**reply)
        if reply["done"]:
            break
    assert reply["done"], reply
    cid = reply["case_id"]
    for _ in range(300):
        c = client.get(f"/cases/{cid}").json()
        if c.get("packet_url"):
            break
        time.sleep(0.2)
    secs = time.time() - t0
    c = Case(**client.get(f"/cases/{cid}").json())
    assert c.packet_url and secs < 60
    assert c.urgency.tier == "P1" and c.urgency.rule_id == "U1"
    assert c.network_id == "N-007"
    n = Network(**client.get("/networks/N-007").json())
    assert n.priority.rank == 1 and n.priority.tier == "P1" and "R3" in n.priority.rule_ids
    assert n.brief and n.brief.checked
    pdf = client.get(f"/cases/{cid}/packet.pdf")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    evs = [LiveEvent(**e) for e in client.get(f"/events?after={last_event}").json()]
    types = {e.type for e in evs}
    assert {"case_created", "case_linked", "network_reranked", "brief_updated"} <= types
    assert any("#6 → #1" in e.message for e in evs if e.type == "network_reranked")


def test_contract_endpoints(baked):
    from app.main import app
    client = TestClient(app)
    assert client.get("/health").json()["ok"] is True
    [Case(**x) for x in client.get("/cases?limit=20").json()]
    [Case(**x) for x in client.get("/cases?status=needs_review").json()]
    nets = [Network(**x) for x in client.get("/networks").json()]
    assert [n.priority.rank for n in nets] == sorted(n.priority.rank for n in nets)
    [AuditEvent(**x) for x in client.get("/audit?object_id=N-007").json()]
    Stats(**client.get("/stats").json())
    assert client.get("/cases/C-9999").status_code == 404 and "error" in client.get("/cases/C-9999").json()
    assert client.post("/demo/reset").status_code == 401
    assert client.post("/demo/reset", headers={"X-Demo-Key": "test-key"}).json() == {"ok": True}
    assert client.get("/networks/N-007").json()["priority"]["rank"] == 6
    on_demand = client.post("/networks/N-012/brief")
    assert on_demand.status_code == 200 and on_demand.json()["brief"] is not None
