"""Write one contract-valid JSON example per object to contract/examples/ (from real
pre-baked data + a live hero report). Run after prebake.

    python -m scripts.export_examples
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("RASTRO_OFFLINE", os.environ.get("RASTRO_OFFLINE", "0"))
import app  # noqa: E402,F401
from app import REPO_ROOT  # noqa: E402

OUT = REPO_ROOT / "contract" / "examples"


def main():
    from fastapi.testclient import TestClient
    from app.main import app as api
    from contract.schema import AuditEvent, Case, IntakeReply, LiveEvent, Network, Stats

    with TestClient(api) as c:
        key = os.environ.get("DEMO_KEY", "change-me")
        c.post("/demo/reset", headers={"X-Demo-Key": key})
        ex = {}
        r = c.post("/intake/sessions").json(); ex["IntakeReply.start"] = r
        sid = r["session_id"]
        turns = json.loads((REPO_ROOT / "demo" / "hero_cases.json").read_text())["live_case"]["turns"]
        r = c.post(f"/intake/sessions/{sid}/messages", json={"text": turns[0]}).json(); ex["IntakeReply.mid"] = r
        for t in turns[1:]:
            r = c.post(f"/intake/sessions/{sid}/messages", json={"text": t}).json()
            if r["done"]:
                break
        ex["IntakeReply.done"] = r
        for _ in range(300):
            if c.get(f"/cases/{r['case_id']}").json().get("packet_url"):
                break
            time.sleep(0.2)
        ex["Case.live"] = c.get(f"/cases/{r['case_id']}").json()
        ex["Case.injection"] = c.get("/cases/C-0450").json()
        ex["Case.lookalike"] = c.get("/cases/C-0300").json()
        ex["Network.hero"] = c.get("/networks/N-007").json()
        ex["Network.needs_review"] = next(n for n in c.get("/networks?limit=100").json() if n["status"] == "needs_review")
        ex["AuditEvent.list"] = c.get(f"/audit?object_id=N-007").json()[-6:]
        ex["Stats"] = c.get("/stats").json()
        ex["LiveEvent.list"] = c.get("/events").json()[-6:]
        c.post("/demo/reset", headers={"X-Demo-Key": key})

    models = {"IntakeReply": IntakeReply, "Case": Case, "Network": Network, "AuditEvent": AuditEvent,
              "Stats": Stats, "LiveEvent": LiveEvent}
    OUT.mkdir(parents=True, exist_ok=True)
    for name, obj in ex.items():
        m = models[name.split(".")[0]]
        for o in (obj if isinstance(obj, list) else [obj]):
            m(**o)  # validate
        (OUT / f"{name}.json").write_text(json.dumps(obj, indent=2))
    print(f"wrote {len(ex)} examples → {OUT}")


if __name__ == "__main__":
    main()
