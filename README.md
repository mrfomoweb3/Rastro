# Rastro

> Rastro (Spanish: "trail") turns one scam victim's report into a bank-ready evidence packet in minutes, then links it to every earlier report that shares an account, phone or link, so fraud teams see the network behind the scam and know which one to hit first.

OpenServ SERV Hackathon Edition 02, Open Track. **All data is synthetic.**

Rastro never freezes money, never blocks an account and never says anyone is guilty. It ranks, packages and explains. Humans act.

## Run the engine locally

```bash
cd engine
uv venv .venv --python 3.12 && uv pip install --python .venv/bin/python -r requirements.txt
cp ../.env.example ../.env            # add SERV_API_KEY to use SERV; without it the engine runs offline
.venv/bin/python -m scripts.gen_seed  # 499 synthetic cases → data/seed_cases.json
.venv/bin/python -m scripts.prebake   # full pipeline over the seed → data/prebaked.json
.venv/bin/uvicorn app.main:app --reload --port 8000
.venv/bin/python -m pytest -q         # 14 tests, including the demo checks
```

On first boot with an empty DB the API loads `data/prebaked.json`. `POST /demo/reset` with the header `X-Demo-Key: $DEMO_KEY` restores it. Every timestamp moves forward to "now", so hours-since-payment and last-7-days counts stay the same as when it was baked.

## Architecture

```
victim ──chat──► /intake (SERV + PromptGuard; code checks the fields)
                    │ done
                    ▼
         LangGraph case graph (one run per report, in the background)
  guard → completeness → urgency → extract → link → networks → packet
  code     code           code      SERV      code     │         code (PDF)
                                                       ▼
                     LangGraph network graph (per network the report touched)
                     decide ───────────────► brief ─────────────► verify
                     SERV kronos-multipath   SERV + shadow agent   code
                     (checked against the    (edge ids, numbers,   (fails → needs_review)
                      code rulebook, R7)      no names, no guilt)
                                                       ▼
                           re-rank all networks by score (code) → /events
```

| Folder | What it holds |
|---|---|
| `contract/` | The shared contract (`schema.py` for Pydantic, `schema.ts` for TypeScript), one real JSON example per object, and the CHANGELOG |
| `engine/app/` | FastAPI, the DB layer (SQLite locally, Postgres in production; same code), SERV client, intake, PDF, pipeline steps (`core.py`) |
| `engine/graph/` | LangGraph `case_graph.py` and `network_graph.py` |
| `engine/rules/` | `rulebook.md` (the SERV system prompt), urgency U1–U4, a code copy of R0–R7 with the score formula, linking, normalising, injection guard |
| `engine/scripts/` | `gen_seed.py`, `prebake.py`, `cost_probe.py`, `export_examples.py` |
| `demo/hero_cases.json` | 5 hero seed stories and the live demo script (Screen owner can rewrite them) |

### How the golden rules are enforced in code

1. **No freezing or guilt.** The PDF footer and brief prompts say so, and `verify` rejects any brief that uses wording like "guilty" or "criminal".
2. **No invented links.** `verify` checks that every `why_linked[].edge_ids` entry exists in the network graph.
3. **Names never merge networks.** Clusters are connected components over **strong** edges only (`rules/linking.py`). A name look-alike (RapidFuzz `token_sort_ratio ≥ 92`) shows up only as a weak edge or a `name_lookalike:<case>` flag.
4. **Numbers come from code.** Metrics, urgency and score are computed in Python. `verify` rejects any number in the brief that doesn't match a metric, a case amount or a rulebook threshold.
5. **When in doubt, `needs_review`.** If SERV and the code rulebook disagree, R7 keeps the more cautious result, and the audit log records the disagreement. Any failed check, or typology confidence below 0.6, means `needs_review`.
6. **Synthetic only.** The seed generator makes every name, phone, account and domain.

## SERV features used, and where

| Feature | Where | File |
|---|---|---|
| `gpt-5.4-mini` | intake chat, `extract`, `brief` | `app/intake.py`, `graph/case_graph.py`, `app/core.py` |
| Multipath (`-serv-multipath`) | `decide` fallback model | `app/core.py: decide` |
| Kronos (`-serv-kronos-multipath`) | `decide`: audits SERV's reasoning against the rulebook | `app/core.py: decide`, `USE_KRONOS` |
| PromptGuard (`serv_prompt_guard` tool) | every SERV call | `app/serv.py: PROMPT_GUARD` |
| Shadow agent (`serv_shadow_agent` tool, with a hint) | `brief`: validates and retries the output | `app/core.py: brief` |

PromptGuard protects the system prompt. A separate code check in `rules/guard.py` flags text in a report that tries to give the model instructions (`C-0450`). That text is always sent to models inside `<evidence>…</evidence>` as data. The model can only add entities that literally appear in the victim's text, and priority is computed only from code-supplied facts. So the injected text cannot change the ranking, and a test asserts this.

Without `SERV_API_KEY` (or with `RASTRO_OFFLINE=1`), every SERV step uses a code fallback: the code rulebook, a template brief, and regex extraction. The audit log then records `actor: "code"` and `model: "offline-fallback"`, so a fallback is never presented as a SERV call.

## Cost

* Seed cases never call SERV (ground-truth entities). The pre-bake runs `decide` for all 21 networks and `brief` for the top 10 only, and stops spending past $3.
* During the demo, only the live report and the networks it touches call SERV: about 6 intake turns, 1 `extract`, 1 `decide` and 1 `brief`.
* `/stats` shows `total_cost_usd` and `avg_cost_per_case_usd` from the audit log. **Prices in `app/pricing.py` are placeholders.** Run `python -m scripts.cost_probe` with a key and fill in the real numbers before quoting a cost per case.
* `analyst_hours_saved` assumes 0.75 h per hand-built packet and 2 h per hand-written network brief (`app/main.py`).

## Demo facts (fixed)

* The hero network is `N-007`: 39 reports, all paying into Demo Bank account `0123456789`, with 3 shared phones. Before the live report it is P2 under R2 at rank **#6**.
* The live report ($2,400, paid 3 hours ago) is U1/P1. R3 raises N-007 to P1 and it becomes rank **#1**. The events show `case_created → case_linked → brief_updated → network_reranked "N-007 moved #6 → #1"`. The packet is ready in under a second offline.
* `C-0450` has the injection attempt. It is flagged, its account is kept, and its network stays P1 under R1.
* `C-0300` / `C-0301` ("John Okafor" / "Jon Okafor") are linked by a weak name match only and stay standalone.
* `N-011` is in `needs_review` under R5 (typology confidence 0.4).

## Deploy (Railway + Supabase)

Deploy from the repo root (`railway.json` and `Procfile` start `uvicorn` inside `engine/`). Set `DATABASE_URL` to the Supabase Postgres URL, plus `SERV_API_KEY`, `DEMO_KEY` and `ALLOWED_ORIGINS`. Commit `engine/data/prebaked.json` so the first boot can seed itself. Any `*.vercel.app` origin is allowed by regex.
