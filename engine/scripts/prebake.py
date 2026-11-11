"""Run the pipeline over the seed once, store it, and dump data/prebaked.json.
`/demo/reset` restores that snapshot (timestamps shifted to "now").

    python -m scripts.gen_seed && python -m scripts.prebake

Seed cases skip SERV extraction (ground truth). `decide` runs for every network,
`brief` only for the top 10. Pre-bake stops spending SERV credit past $3.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import app  # noqa: E402,F401
from app import ENGINE_DIR, core, db, serv  # noqa: E402
from app.log import audit  # noqa: E402
from app.timeutil import iso, now as utcnow  # noqa: E402
from graph import network_graph  # noqa: E402
from rules import linking  # noqa: E402
from rules.guard import scan  # noqa: E402
from rules.urgency import urgency  # noqa: E402

SEED = ENGINE_DIR / "data" / "seed_cases.json"
SNAPSHOT = Path(os.environ.get("RASTRO_SNAPSHOT") or ENGINE_DIR / "data" / "prebaked.json")
COST_CAP = 3.0


def main(brief_top: int = core.BRIEF_TOP_N) -> dict:
    t_start = time.time()
    db.init()
    db.wipe()
    seed = json.loads(SEED.read_text())["cases"]
    now = utcnow()
    index: dict = {}
    cases = []
    per_case = []
    for s in seed:
        t0 = time.time()
        truth = s.pop("truth_entities")
        net = s.pop("truth_network")
        c = {**s, "entities": [], "flags": [], "network_id": net, "status": "processing",
             "packet_url": f"/cases/{s['id']}/packet.pdf",
             "urgency": urgency(s["paid_at"], s["amount"], now)}
        hits = scan([c["narrative"], *c["scam_messages"]])
        if hits:
            c["flags"].append("injection_attempt")
            audit("case", c["id"], "guard", "code", f"Instruction-like text found ({', '.join(hits)}). Kept as quoted "
                  "evidence; it cannot change rules, priority or entities.", ["G-injection"])
        else:
            audit("case", c["id"], "guard", "code", "No injection patterns found.", ["G-injection"])
        u = c["urgency"]
        audit("case", c["id"], "urgency", "code", f"{u['tier']}: paid {u['hours_since_payment']} h ago, "
              f"${c['amount']:,.2f}.", [u["rule_id"]])
        audit("case", c["id"], "extract", "code", f"Seed case: {len(truth)} ground-truth entities (no SERV call).")
        c["entities"] = core.register_entities(c, truth, index)
        cases.append(c)
        per_case.append(time.time() - t0)

    # entity case_ids are final now → refresh copies inside cases
    ent_by_id = {e["id"]: e for e in index.values()}
    cases = [core.hydrate(c, ent_by_id) for c in cases]
    assigned, _, _ = core.recluster(cases)
    truth = {}
    for c in cases:
        if c["network_id"]:
            truth.setdefault(c["network_id"], set()).add(c["id"])
    mism = [n for n in assigned if assigned[n] != truth.get(n)]
    if mism:
        print("WARNING: clustering differs from ground truth for", mism)

    names = [e for e in ent_by_id.values() if e["kind"] == "name"]
    weak = linking.weak_name_pairs(names)
    for a, b, sim in weak:
        ca, cb = ent_by_id[a]["case_ids"], ent_by_id[b]["case_ids"]
        for x in ca:
            for y in cb:
                if x == y:
                    continue
                c = next(cc for cc in cases if cc["id"] == x)
                d = next(cc for cc in cases if cc["id"] == y)
                for p, q in ((c, d), (d, c)):
                    if f"name_lookalike:{q['id']}" not in p["flags"]:
                        p["flags"].append(f"name_lookalike:{q['id']}")
                        same = p["network_id"] and p["network_id"] == q["network_id"]
                        audit("case", p["id"], "link", "code", f"Name look-alike with {q['id']} (similarity {sim}). "
                              + ("Same network via shared details." if same else
                                 "Weak link only — names never merge networks."), ["golden-3"])
    for c in cases:
        if c["network_id"]:
            audit("case", c["id"], "link", "code", f"Linked to {c['network_id']} via shared account/phone/link.",
                  ["link.exact"])
        else:
            audit("case", c["id"], "link", "code", "No shared account/phone/link/email/wallet. Standalone.",
                  ["link.exact"])
        c["status"] = "flagged_input" if "injection_attempt" in c["flags"] else (
            "linked" if c["network_id"] else "standalone")
    db.put_entities(ent_by_id.values())
    db.put_cases_bulk(cases)

    # ---- networks: decide all, rank, brief top N
    by_net = {}
    for c in cases:
        if c["network_id"]:
            by_net.setdefault(c["network_id"], []).append(c)
    for nid in sorted(by_net):
        net = core.build_network(nid, by_net[nid], ent_by_id, weak, now)
        net = network_graph.run(net, by_net[nid], want_brief=False)
        db.put_network(net)
    core.rerank()
    for net in db.list_networks()[:brief_top]:
        if serv.available() and db.total_cost() > COST_CAP:
            print("Cost cap reached; remaining briefs on demand.")
            break
        net = core.verify(core.brief(net, by_net[net["id"]]), by_net[net["id"]])
        db.put_network(net)
    core.rerank()

    # timing sample: seed processing + packet render
    from app.pdf import render_packet
    t0 = time.time()
    for c in cases[:20]:
        render_packet(c["id"])
    avg_packet = (time.time() - t0) / 20 + sum(per_case) / len(per_case)

    stats = {"avg_seconds_report_to_packet": round(avg_packet, 2), "seconds_total": round(time.time() - t_start, 1),
             "serv": serv.available(), "serv_cost_usd": round(db.total_cost(), 4)}
    db.set_meta("prebake", stats)
    snap = {"baked_at": iso(now), "stats": stats, "tables": db.dump_all()}
    SNAPSHOT.write_text(json.dumps(snap))
    print(json.dumps(stats))
    for n in db.list_networks()[:8]:
        p = n["priority"]
        print(f"#{p['rank']:>2} {n['id']} {p['tier']} score={p['score']:>6} {n['typology']['label']:<18} "
              f"cases={n['metrics']['case_count']:>2} loss=${n['metrics']['total_loss']:>9,.0f} "
              f"7d={n['metrics']['cases_last_7d']} rules={','.join(p['rule_ids'])} status={n['status']}")
    return stats


if __name__ == "__main__":
    main()
