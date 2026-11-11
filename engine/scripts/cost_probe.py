"""Day-1 cost probe: 3 cases × (extract, decide plain-multipath, decide kronos, brief+shadow).
Prints cost and latency per call. Needs SERV_API_KEY. Also checks that response_format
works together with SERV tools (serv.call_json falls back automatically if not).

    python -m scripts.cost_probe
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import app  # noqa: E402,F401
from app import ENGINE_DIR, core, serv  # noqa: E402
from graph.case_graph import EXTRACT_SYSTEM  # noqa: E402
from rules import priority  # noqa: E402
from rules.guard import as_evidence  # noqa: E402


def main():
    if not serv.available():
        sys.exit("SERV_API_KEY is not set — nothing to probe.")
    seed = json.loads((ENGINE_DIR / "data" / "seed_cases.json").read_text())["cases"]
    picks = [c for c in seed if c["truth_network"] == "N-007"][:1] + [c for c in seed if c["id"] == "C-0450"] + \
            [c for c in seed if c["truth_network"] is None][:1]
    rows = []

    def run(label, model, system, user, tools):
        try:
            out, meta = serv.call_json(model, system, user, tools)
            rows.append((label, model, meta["cost_usd"], meta["latency_ms"], "ok"))
            return out
        except Exception as e:  # noqa: BLE001
            rows.append((label, model, 0.0, 0, f"FAIL {type(e).__name__}: {str(e)[:80]}"))

    for c in picks:
        run(f"extract {c['id']}", serv.MODEL_PLAIN, EXTRACT_SYSTEM, as_evidence([c["narrative"], *c["scam_messages"]]),
            [serv.PROMPT_GUARD])
        facts = {"case_count": 39, "victim_count": 39, "total_loss": 41380, "cases_last_7d": 6, "p1_case_count": 1,
                 "max_victims_on_one_account": 39, "strong_edge_count": 50,
                 "scam_type_counts": {"investment": 22, "impersonation": 17}}
        user = "Facts computed by code:\n" + json.dumps(facts)
        for m in (serv.MODEL_MULTIPATH, serv.MODEL_KRONOS):
            out = run(f"decide {c['id']}", m, core.RULEBOOK, user, [serv.PROMPT_GUARD])
            if out:
                print(m, "→", out.get("tier"), out.get("rule_ids"), "| code says", priority.evaluate(facts)["tier"])
        run(f"brief {c['id']}", serv.MODEL_PLAIN, "Write a 2-sentence JSON {summary} about these facts. " + core.SHADOW_HINT,
            json.dumps(facts), [serv.PROMPT_GUARD, serv.shadow_tool(core.SHADOW_HINT)])

    print(f"\n{'call':<16}{'model':<42}{'cost $':>10}{'ms':>8}  status")
    for r in rows:
        print(f"{r[0]:<16}{r[1]:<42}{r[2]:>10.6f}{r[3]:>8}  {r[4]}")
    print(f"\nresponse_format with tools: {serv._json_mode_ok}")
    print("NOTE: cost uses app/pricing.py placeholders until you fill real SERV prices.")


if __name__ == "__main__":
    main()
