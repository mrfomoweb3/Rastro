"""The SERV path, tested without calling SERV: a fake stands in for the model."""
import importlib
import re
import threading

from app import core, serv
from rules import priority

META = {"model": "gpt-5.4-mini", "cost_usd": 0.001, "latency_ms": 5}


def _hero(db):
    net = db.get_network("N-007")
    return net, [core.hydrate(x) for x in db.list_cases(ids=net["case_ids"])]


def _fake_serv(monkeypatch, reply):
    monkeypatch.setattr(serv, "available", lambda: True)
    monkeypatch.setattr(serv, "has_key", lambda: True)
    monkeypatch.setattr(serv, "call_json", lambda *a, **k: (reply, dict(META)))


def test_empty_price_lines_in_env_do_not_crash(monkeypatch):
    from app import pricing
    monkeypatch.setenv("PRICE_IN_PER_M", "")
    monkeypatch.setenv("PRICE_OUT_PER_M", "")
    importlib.reload(pricing)
    assert pricing.PRICES["gpt-5.4-mini"] == (0.25, 2.0)


def test_reasons_stay_plain_when_serv_disagrees():
    code = priority.evaluate(dict(case_count=40, victim_count=40, total_loss=43780, cases_last_7d=7, p1_case_count=1,
                                  max_victims_on_one_account=40, strong_edge_count=50,
                                  scam_type_counts={"impersonation": 40}))
    out, notes = priority.reconcile({"typology": "mule_network", "typology_confidence": 0.95, "tier": "P2",
                                     "rule_ids": ["R2", "R3", "R9"],
                                     "reasons": ["R3: raises the priority one tier to P2."]}, code)
    assert out["tier"] == "P1" and notes
    assert out["reasons"][:len(code["reasons"])] == code["reasons"]
    assert any(r.startswith("SERV suggested P2") for r in out["reasons"])
    assert not any(re.match(r"R\d", r) for r in out["reasons"])
    assert "R9" not in out["rule_ids"] and "R7" in out["rule_ids"]


def test_serv_brief_that_passes_the_fact_check_is_kept(fresh, monkeypatch):
    net, cases = _hero(fresh)
    acct = next(s for s in core.shared_entities(net) if s["kind"] == "account")
    _fake_serv(monkeypatch, {
        "summary": "39 reports from 39 victims lost $41,380.02 in total. They all paid into one account.",
        "why_linked": [{"claim": "39 reports paid into the same account.", "detail_ids": [acct["entity_id"]]}],
        "gaps": ["Who holds the account is not known."],
        "next_steps": ["Ask the receiving bank to review the account."]})
    out = core.verify(core.brief(net, cases), cases)
    assert out["brief"]["checked"] and out["status"] == "ok"
    assert out["brief"]["summary"].startswith("39 reports from 39 victims lost")
    assert out["brief"]["why_linked"][0]["edge_ids"] == acct["edge_ids"]  # code looked up the real links
    assert any(a["actor"] == "shadow" and "Brief written by SERV" in a["summary"] for a in fresh.list_audit("N-007")[-3:])


def test_serv_brief_that_fails_the_fact_check_is_replaced_by_the_template(fresh, monkeypatch):
    net, cases = _hero(fresh)
    acct = next(s for s in core.shared_entities(net) if s["kind"] == "account")
    _fake_serv(monkeypatch, {
        "summary": "This network is labeled mule_network with confidence 0.95, first seen on 2026-11-05T12:59:42Z.",
        "why_linked": [{"claim": "A single account is linked to all 39 cases.", "detail_ids": [acct["entity_id"]]}],
        "gaps": [], "next_steps": []})
    out = core.verify(core.brief(net, cases), cases)
    assert out["brief"]["checked"] and out["status"] == "ok"
    assert out["brief"]["summary"] == core._template_brief(net, cases)["summary"]
    tail = fresh.list_audit("N-007")[-4:]
    assert any(a["actor"] == "shadow" and "failed the fact-check" in a["summary"] and a["cost_usd"] > 0 for a in tail)
    assert any(a["actor"] == "code" and a["step"] == "brief" for a in tail)


def test_serv_brief_citing_an_invented_link_is_rejected(fresh, monkeypatch):
    net, cases = _hero(fresh)
    _fake_serv(monkeypatch, {"summary": "39 reports share one account.",
                             "why_linked": [{"claim": "39 reports share an account.", "detail_ids": ["E-99999"]}],
                             "gaps": [], "next_steps": []})
    out = core.brief(net, cases)
    assert out["brief"]["summary"] == core._template_brief(net, cases)["summary"]


def test_spending_cap_switches_serv_off(monkeypatch):
    monkeypatch.setenv("SERV_API_KEY", "test-key")
    monkeypatch.delenv("RASTRO_OFFLINE", raising=False)
    monkeypatch.setattr(serv, "BUDGET_USD", 0.01)
    monkeypatch.setattr(serv, "_spent_usd", 0.0)
    assert serv.available()
    serv._add_spend(0.02)
    assert not serv.available() and serv.status()["serv_budget_reached"]


def test_a_run_from_before_a_reset_cannot_write(fresh):
    from graph import case_graph
    db, seen = fresh, {}

    def direct():
        db.bind_epoch(db.EPOCH - 1)
        try:
            db.put_network(db.get_network("N-007"))
            seen["direct"] = "wrote"
        except db.Stale:
            seen["direct"] = "stale"

    def through_the_graph():
        db.bind_epoch(db.EPOCH - 1)
        try:
            case_graph.run_case({"id": "C-9998", "narrative": "x", "scam_messages": [], "flags": []}, [])
            seen["graph"] = "ran"
        except db.Stale:
            seen["graph"] = "stale"

    for fn in (direct, through_the_graph):
        t = threading.Thread(target=fn)
        t.start()
        t.join()
    assert seen == {"direct": "stale", "graph": "stale"}
    assert db.get_case("C-9998") is None and not db.list_audit("C-9998")


def test_packet_says_so_while_the_network_is_still_being_reviewed(fresh):
    from app.pdf import render_packet
    db = fresh
    c = db.get_case(db.get_network("N-007")["case_ids"][0])
    live = {**c, "id": "C-9997", "source": "live"}
    db.put_case(live, meta_={})                     # packet ready, network step not finished yet
    assert render_packet("C-9997")[:4] == b"%PDF"
    db.put_case(live, meta_={"network_done": True})
    assert render_packet("C-9997")[:4] == b"%PDF"


def test_bare_sentence_claims_are_matched_to_the_right_detail(fresh, monkeypatch):
    net, cases = _hero(fresh)
    strong = [s for s in core.shared_entities(net) if s["strength"] == "strong"]
    acct = next(s for s in strong if s["kind"] == "account")
    phone = next(s for s in strong if s["kind"] == "phone")
    _fake_serv(monkeypatch, {
        "summary": f"{acct['report_count']} reports share one account.",
        "why_linked": [f"The account is shared across {acct['report_count']} reports.",
                       f"One phone is shared across {phone['report_count']} reports."],
        "gaps": [], "next_steps": []})
    out = core.verify(core.brief(net, cases), cases)
    assert out["brief"]["checked"]
    assert out["brief"]["why_linked"][0]["edge_ids"] == acct["edge_ids"]
    assert out["brief"]["why_linked"][1]["edge_ids"] in [s["edge_ids"] for s in strong if s["kind"] == "phone"]


def test_bare_sentence_with_a_wrong_count_is_rejected(fresh, monkeypatch):
    net, cases = _hero(fresh)
    _fake_serv(monkeypatch, {"summary": "Reports share an account.",
                             "why_linked": ["The account is shared across 12 reports."], "gaps": [], "next_steps": []})
    out = core.brief(net, cases)
    assert out["brief"]["summary"] == core._template_brief(net, cases)["summary"]


def test_serv_cannot_overrule_r2_on_the_pattern():
    code = priority.evaluate(dict(case_count=40, victim_count=40, total_loss=43780, cases_last_7d=7, p1_case_count=1,
                                  max_victims_on_one_account=40, strong_edge_count=50,
                                  scam_type_counts={"impersonation": 20, "investment": 20}))
    out, notes = priority.reconcile({"typology": "mixed", "typology_confidence": 0.52, "tier": "P1",
                                     "needs_review": False, "rule_ids": ["R2", "R3"], "reasons": []}, code)
    assert out["typology"] == "mule_network" and out["typology_confidence"] >= priority.R5_CONF
    assert not out["needs_review"] and any("R2 sets mule_network" in n for n in notes)


def test_claim_with_a_link_but_no_words_gets_code_wording(fresh, monkeypatch):
    net, cases = _hero(fresh)
    acct = next(s for s in core.shared_entities(net) if s["kind"] == "account")
    _fake_serv(monkeypatch, {"overview": f"{acct['report_count']} reports share one account.",
                             "why_linked": [{"claim": "", "detail_ids": [acct["entity_id"]]}],
                             "gaps": [], "next_steps": []})
    out = core.verify(core.brief(net, cases), cases)
    assert out["brief"]["checked"] and out["brief"]["why_linked"][0]["claim"].startswith(f"{acct['report_count']} reports paid")


def test_rules_serv_cites_without_support_are_not_recorded():
    code = priority.evaluate(dict(case_count=40, victim_count=40, total_loss=43780, cases_last_7d=7, p1_case_count=1,
                                  max_victims_on_one_account=40, strong_edge_count=50,
                                  scam_type_counts={"impersonation": 40}))
    out, notes = priority.reconcile({"typology": "mule_network", "typology_confidence": 0.95, "tier": "P1",
                                     "rule_ids": ["R1", "R2", "R3"], "reasons": []}, code)
    assert "R1" not in out["rule_ids"] and set(code["rule_ids"]) <= set(out["rule_ids"])
    assert any("R1" in n for n in notes)


def test_extract_confidence_given_as_a_word():
    from graph.case_graph import _confidence
    assert _confidence("high") == 0.9 and _confidence("0.8") == 0.8 and _confidence(None) == 0.5 and _confidence(7) == 1.0
