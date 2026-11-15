# Contract changelog

Every change to `schema.py` / `schema.ts`, dated, with who agreed. Engine + Screen must both 👍.

| Date | Change | Proposed by | Agreed by |
|---|---|---|---|
| 2026-11-10 | Initial contract, copied word for word from BUILD_ENGINE.md §3. Examples in `examples/` generated from real engine output (`python -m scripts.export_examples`). | Engine | — |
| 2026-11-10 | **Proposed, additive:** `POST /networks/{id}/brief` → `Network`. Generates the brief for networks outside the pre-baked top 10 (the "Brief generated on demand" button). | Engine | Screen: pending |
| 2026-11-10 | **Note, no shape change:** `Case.flags` may contain `name_lookalike:<case_id>` (weak name-only link to another report) besides `injection_attempt`. `GET /health` also returns `serv` and `cases` fields. | Engine | Screen: pending |
| 2026-11-15 | **Additive:** analyst login. `POST /auth/login` (`LoginIn` → `Team`, sets an HTTP-only session cookie), `GET /auth/me`, `POST /auth/logout`. `/cases*`, `/networks*`, `/audit`, `/events` and `/demo/reset` now need a session; a victim reads their own case and packet with `?session=<intake session id>`. `GET /public/networks` is an open preview for the landing page. | Engine | — |
| 2026-11-15 | **Additive:** `POST /networks/{id}/feedback` (`FeedbackIn`) and `GET /networks/{id}/feedback` (the caller's team only). Stored as `AuditEvent` rows with `actor: "human"`, `step: "feedback"`, private to the team. | Engine | — |
| 2026-11-15 | **Additive:** `GET /networks/{id}/export.csv` and `/export.json` (case file `rastro.casefile/v1`) for bank case-management import. Each export is an `AuditEvent` with `step: "export"`, private to the team. | Engine | — |
| 2026-11-15 | **Note, no shape change:** intake asks for the victim's own phone or email (stored only as a one-way code, never as an entity). `missing_fields` may contain `"contact"`. `Case.flags` may contain `repeat_reporter`; the same reporter always gets the same `victim_alias`. | Engine | — |
