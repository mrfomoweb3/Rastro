# Contract changelog

Every change to `schema.py` / `schema.ts`, dated, with who agreed. Engine + Screen must both 👍.

| Date | Change | Proposed by | Agreed by |
|---|---|---|---|
| 2026-11-10 | Initial contract, copied word for word from BUILD_ENGINE.md §3. Examples in `examples/` generated from real engine output (`python -m scripts.export_examples`). | Engine | — |
| 2026-11-10 | **Proposed, additive:** `POST /networks/{id}/brief` → `Network`. Generates the brief for networks outside the pre-baked top 10 (the "Brief generated on demand" button). | Engine | Screen: pending |
| 2026-11-10 | **Note, no shape change:** `Case.flags` may contain `name_lookalike:<case_id>` (weak name-only link to another report) besides `injection_attempt`. `GET /health` also returns `serv` and `cases` fields. | Engine | Screen: pending |
