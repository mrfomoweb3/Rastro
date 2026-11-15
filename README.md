# Rastro

Scam report triage for bank fraud teams.

![Live demo](https://img.shields.io/badge/live%20demo-rastro.mrfomolabs.xyz-2a56f0) ![Python](https://img.shields.io/badge/python-3.12-3776ab) ![Next.js](https://img.shields.io/badge/next.js-16-000000) ![SERV](https://img.shields.io/badge/AI-OpenServ%20SERV-6b46c1) ![Tests](https://img.shields.io/badge/tests-33%20passing-0f7a55) ![License: MIT](https://img.shields.io/badge/license-MIT-blue)

Rastro (Spanish for "trail") turns one scam victim's chat report into a bank-ready evidence packet in seconds. It then links the report to every earlier report that shares an account, phone or link, and ranks the networks behind them so a fraud team knows which one to act on first. The AI drafts and explains; written rules in code decide, and every AI claim is fact-checked before anyone reads it.

Built for the OpenServ SERV Hackathon, Edition 02 (Open Track). **All data is synthetic.** Rastro never freezes money, never blocks an account and never says anyone is guilty. It ranks, packages and explains. People act.

## Demo

- **Live site:** https://rastro.mrfomolabs.xyz
- **Analyst console with the live demo panel:** https://rastro.mrfomolabs.xyz/console?demo=1
- **Victim report chat:** https://rastro.mrfomolabs.xyz/report
- **Engine health:** https://rastro-engine.fly.dev/health

> 🎥 Demo video: _add link_

![Analyst console](docs/console.png)

## Contents

- [Problem](#problem)
- [Solution](#solution)
- [How to test](#how-to-test)
- [Architecture](#architecture)
- [Flowchart](#flowchart)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [Deployment](#deployment)
- [Usage / API](#usage--api)
- [How SERV is used](#how-serv-is-used)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Team / Acknowledgements](#team--acknowledgements)

## Problem

When someone is scammed, they report it to their bank as a story: a phone call, an amount, an account number, maybe a pasted message. A fraud analyst then has to turn that story into evidence the receiving bank can act on, and check by hand whether the same account or phone shows up in earlier reports.

- **Time is short.** A hold on the receiving account is only realistic within about 24 hours of the payment. Reports wait in a queue in the order they arrived, not in order of urgency.
- **Networks stay hidden.** One mule account can collect money from dozens of victims, but each report is read alone. Forty $1,000 reports look like forty small cases instead of one $40,000 network.
- **Manual work.** Rastro's own estimate is about 45 minutes to build one bank-ready packet by hand, and about 2 hours to map and write up one network.

## Solution

A victim answers a short chat. Rastro extracts the facts, builds a one-page PDF packet, and links the report to earlier ones that share a strong detail (an account, phone, website, email or wallet). It then re-ranks every network using a written rulebook, and gives analysts a short brief explaining why the reports are linked. SERV writes the chat and the brief and reads the rulebook; code computes every number and has the final say.

**Key features**

- **Chat intake.** One question at a time until the amount, time of payment, contact channel and receiving account are known. No form, no account.
- **Evidence packet in seconds.** A one-page PDF in plain language, ready before the ranking finishes.
- **Network linking.** Reports join only through shared accounts, phones, links, emails or wallets. Similar names show up as a weak hint and never join reports.
- **Priority queue.** Written rules (R0–R7) set each network's priority from code-computed facts. SERV (Kronos multipath) reads the same rules; when it disagrees, the more cautious result wins and the disagreement is shown.
- **Fact-checked briefs.** Every claim must point to real links in the graph, every number must match the data, and no names or accusations are allowed. A failed AI draft is replaced by a template brief built only from code facts.
- **Prompt-injection safe.** Text in a report that tries to instruct the system is flagged, kept as evidence and cannot change the ranking. A test proves it.
- **Full audit trail.** Every step records who did it (rules, SERV, shadow agent, or a person), the model, cost and time.
- **Team logins.** Each fraud team signs in to its own account. Its reviews and exports are private to the team.
- **Analyst feedback.** Analysts mark a brief accurate or not and say whether the priority is right. Each review is saved to the audit trail.
- **Repeat-reporter check.** The victim's own phone or email is kept only as a one-way code. The same person filing twice counts as one victim, and the network goes to a person for review.
- **Case-management export.** Any network downloads as CSV (one row per report) or as a JSON case file with the brief, the reports and the audit trail.

## How to test

No wallet or API key is needed. The data is synthetic.

### How to sign in to the demo

1. Open https://rastro.mrfomolabs.xyz/console?demo=1. The sign-in screen appears.
2. Press **Continue as the demo team**. Or pick **Demo Bank fraud team**, type the password `demo` and press **Sign in**.

![Sign-in screen](docs/login.png)

3. The console opens. Your team name shows at the top right, next to the sign-out button.

![Console after signing in](docs/console-signed-in.png)

4. To leave a review, scroll to the bottom of the **Analyst brief** panel, under **Your team's review**. Only your team sees these reviews.

![Team review panel](docs/review.png)

The session lasts 12 hours. The sign-out button (arrow icon, top right) ends it.

**Try this** on https://rastro.mrfomolabs.xyz/console?demo=1

1. Sign in as the demo team. Look at the **Priority queue**. Network **N-007** (Mule network, 39 reports) is at **#6**, priority P2.
2. In the **Live demo** panel, press **Play the demo**. It resets the data, then a scripted victim reports a $2,400 bank-impersonation scam paid 3 hours ago. You see the chat happen.
3. Within about 5 seconds of the chat ending, N-007 moves **from #6 to #1** and becomes **P1**. The **Why it's ranked here** list explains it, including a line if SERV suggested a different rating.
4. Within about 15–40 seconds, the **Analyst brief** updates and shows **Fact-checked**.
5. Open the **Reports** tab and download the PDF for the new report marked **New**.
6. Open the **Activity** tab to see each step and whether rules, SERV or the shadow agent did it.
7. Under **Your team's review**, mark the brief **Accurate** and the priority **Right**, add a note and press **Save review**. It appears under the panel and in the Activity tab as an Analyst step.
8. Press **Export CSV** or **Export case file** in the network header to download it for a case-management system.

Other things to check:

- **Injection attempt:** report `C-0450` contains text that tries to give the system orders. Find its network in the queue: the report is flagged and the network keeps its priority.
- **Names never merge networks:** reports `C-0300` and `C-0301` ("John Okafor" and "Jon Okafor") share only a similar name and stay separate.
- **Needs a person:** network **N-011** is held for review because its scam pattern is unclear.
- **File your own report:** https://rastro.mrfomolabs.xyz/report. It asks for your own phone or email last. File a second report with the same contact: it is flagged *Same reporter as an earlier report*, counts as the same victim, and its network goes to review.

Only one person should run the live demo at a time, because the demo data is shared.

**Automated tests**

```bash
cd engine
.venv/bin/python -m pytest -q
```

Passing looks like `33 passed`. The tests run offline: the SERV path is tested with a fake model, so they spend no credit.

## Architecture

```mermaid
graph LR
  V["Victim (browser)"] -->|chat| W["Next.js web app (Vercel)"]
  A["Analyst (browser)"] -->|console| W
  W -->|"/api/rastro/* proxy + session cookie"| E["FastAPI engine (Fly.io)"]
  W -->|"/api/reset + X-Demo-Key"| E
  E -->|"intake, extract, brief"| S["SERV gpt-5.4-mini + PromptGuard + shadow agent"]
  E -->|"decide"| K["SERV Kronos multipath"]
  E --> CG["LangGraph case graph"]
  CG --> NG["LangGraph network graphs"]
  CG -->|rules R0-R7| R["Code rulebook + fact-check"]
  NG --> R
  E -->|"cases, networks, audit, events"| D[("SQLite / Postgres")]
  E -->|"one-page PDF"| P["reportlab packet"]
```

- **Web app** (`web/`): landing page, victim chat and analyst console. The browser only talks to this app, which forwards `/api/rastro/*` to the engine with the analyst's session cookie, so there is no CORS setup. The demo reset key stays on the server.
- **Auth** (`engine/app/auth.py`): one login per team from `ANALYST_TEAMS`. A session is an HMAC-signed token in an HTTP-only cookie. Reports and networks need a session; victims reach only their own report, by chat session.
- **Engine** (`engine/app/main.py`): FastAPI API. Intake runs synchronously; each finished report runs the case graph in a background thread.
- **LangGraph graphs** (`engine/graph/`): the case graph (guard, completeness, urgency, extract, link, structure, packet, networks) and the network graphs (decide, then brief and verify).
- **Code rulebook** (`engine/rules/`): urgency U1–U4, network rules R0–R7, the score formula, linking, normalising and the injection guard. These are the source of every number.
- **SERV** (`engine/app/serv.py`): every call has a time limit and a code fallback, and spending stops at `SERV_BUDGET_USD`.
- **Storage** (`engine/app/db.py`): contract-shaped JSON in SQLite locally or Postgres; the demo resets from `engine/data/prebaked.json`.

## Flowchart

```mermaid
flowchart TD
  A[Victim sends a message] --> B{"Amount, time, channel and receiving account known?"}
  B -- no --> C[Ask one more question] --> A
  B -- yes --> D[Create report]
  D --> G{Instruction-like text?}
  G -- yes --> G1[Flag it, keep it as evidence only] --> X
  G -- no --> X["Extract details (SERV, regex fallback)"]
  X --> L{"Shares an account, phone, link, email or wallet?"}
  L -- no --> S[Standalone report] --> P
  L -- yes --> N[Add to network] --> P[Evidence packet PDF ready]
  P --> DC["Decide priority: SERV Kronos + code rules"]
  DC --> R7{SERV agrees with the rules?}
  R7 -- no --> C7[Keep the more cautious result, note it] --> RR
  R7 -- yes --> RR[Re-rank all networks]
  RR --> BR[SERV drafts brief, shadow agent on]
  BR --> FC{Passes the fact-check?}
  FC -- no --> T[Use template brief from code facts] --> V
  FC -- yes --> V{"Pattern clear and all checks pass?"}
  V -- yes --> OK[Brief shown as Fact-checked]
  V -- no --> NR[Network marked Needs review]
```

## Tech stack

| Area | Tools |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Framer Motion, lucide-react |
| Backend | Python 3.12, FastAPI, Uvicorn, Pydantic 2, SQLAlchemy 2 |
| AI / Agent | OpenServ SERV via the `openai` SDK (`gpt-5.4-mini`, `-serv-multipath`, `-serv-kronos-multipath`, PromptGuard, shadow agent), LangGraph |
| Linking | networkx (connected components), RapidFuzz (name look-alikes) |
| Documents | reportlab (PDF packet) |
| Data | SQLite (default), Postgres supported |
| Infra | Fly.io (engine, Docker), Vercel (web) |
| Tooling | pytest, uv, TypeScript, ESLint |

## Getting started

### Prerequisites

- Python 3.12 and [uv](https://docs.astral.sh/uv/) (or plain `venv` + `pip`)
- Node.js 20.9 or newer, and npm
- Optional: an OpenServ SERV API key. Without one, the engine runs fully offline on its code fallbacks.

### Installation

```bash
git clone https://github.com/mrfomoweb3/Rastro.git
cd Rastro
cp .env.example .env          # then edit .env

cd engine
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.txt

cd ../web
npm install
```

### Environment variables

Engine (`.env` at the repo root, or Fly secrets):

| Variable | What it is for | Required |
|---|---|---|
| `SERV_API_KEY` | OpenServ SERV key. Empty means offline mode (code fallbacks). | No |
| `DEMO_KEY` | Key for `POST /demo/reset`. Change it from the default. | Yes, for reset |
| `DATABASE_URL` | `sqlite:///rastro.db` by default; a Postgres URL also works. | No |
| `SERV_BUDGET_USD` | SERV spending cap per server start, default `5`. | No |
| `SERV_MODEL_BASE` | Base model, default `gpt-5.4-mini`. | No |
| `USE_KRONOS` | `true` to try Kronos multipath first in `decide`. | No |
| `SERV_BASE_URL` | Default `https://inference-api.openserv.ai/v1`. | No |
| `PRICE_IN_PER_M`, `PRICE_OUT_PER_M` | USD per 1M tokens for cost tracking. Placeholders are used when empty. | No |
| `ALLOWED_ORIGINS` | CORS origins, only needed if a browser calls the engine directly. | No |
| `RASTRO_OFFLINE` | `1` forces offline mode even with a key (tests use this). | No |
| `ANALYST_TEAMS` | Team logins: `slug\|Team name\|password` entries separated by `;`. Default: one demo team (`demo` / `demo`). | Yes, in production |
| `AUTH_SECRET` | Signs analyst session tokens. Falls back to `DEMO_KEY`. | Yes, in production |
| `REPORTER_SALT` | Salt for the one-way reporter code. Falls back to `AUTH_SECRET`. | No |

Web (`web/.env.local`, or Vercel environment variables):

| Variable | What it is for | Required |
|---|---|---|
| `RASTRO_API_URL` | Engine address, default `http://localhost:8000`. Read at build time. | Yes, in production |
| `DEMO_KEY` | Same value as the engine's. Used only on the server for `/api/reset`. | Yes, for reset |

### Run locally

Terminal 1, the engine:

```bash
cd engine
.venv/bin/uvicorn app.main:app --reload --port 8000
```

On first start with an empty database it loads `engine/data/prebaked.json` (499 synthetic reports, 21 networks).

Terminal 2, the web app:

```bash
cd web
npm run dev
```

Open http://localhost:3000, or http://localhost:3000/console?demo=1 for the console with the demo panel.

To rebuild the demo data from scratch:

```bash
cd engine
.venv/bin/python -m scripts.gen_seed   # 499 synthetic cases -> data/seed_cases.json
.venv/bin/python -m scripts.prebake    # full pipeline over the seed -> data/prebaked.json
```

## Project structure

```text
Rastro/
├── contract/            Shared contract: schema.py (Pydantic), schema.ts, JSON examples, CHANGELOG
├── demo/
│   └── hero_cases.json  Hero seed stories and the scripted live report
├── engine/
│   ├── app/             FastAPI app, DB layer, SERV client, intake chat, PDF, pipeline steps (core.py)
│   ├── graph/           LangGraph case graph and network graphs
│   ├── rules/           rulebook.md (SERV system prompt), urgency, R0–R7 + score, linking, injection guard
│   ├── scripts/         gen_seed, prebake, cost_probe, export_examples, refresh_wording
│   ├── data/            seed_cases.json and prebaked.json (the demo snapshot)
│   └── tests/           33 tests: rules, the live demo end to end, the SERV path, logins, exports
├── web/
│   └── src/             Next.js app: landing (/), report chat (/report), console (/console)
├── docs/                Screenshots
├── Dockerfile           Engine image (built from the repo root)
└── fly.toml             Fly.io config for the engine
```

## Deployment

| Part | Where | Address |
|---|---|---|
| Web app | Vercel, project root `web/`, deploys on every push to `main` | https://rastro.mrfomolabs.xyz |
| Engine | Fly.io app `rastro-engine`, region `lhr`, one machine | https://rastro-engine.fly.dev |

Engine, from the repo root:

```bash
fly secrets set SERV_API_KEY=your-key DEMO_KEY=your-demo-key -a rastro-engine
fly deploy --ha=false
```

Keep exactly **one** machine: the demo data lives in that machine's SQLite file, and two machines would each have their own copy.

Web: set `RASTRO_API_URL=https://rastro-engine.fly.dev` and the same `DEMO_KEY` in the Vercel project, then redeploy. The engine address is read at build time.

## Usage / API

All endpoints return contract JSON (`contract/schema.py`). Through the web app they live under `/api/rastro/`. Reports, networks, the audit trail and events need an analyst session; a victim reads their own report and packet with `?session=<chat session id>`.

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | Engine status, whether SERV is on, spend so far |
| POST | `/auth/login` | Sign in `{ "team": "demo", "password": "demo" }`; sets the session cookie |
| GET | `/auth/me`, `/auth/teams` | Signed-in team; team names for the login screen |
| POST | `/auth/logout` | Sign out |
| GET | `/public/networks` | Open preview of the top 8 networks (landing page) |
| POST | `/networks/{id}/feedback` | Team review `{ "about": "brief" \| "priority", "verdict": "...", "note": "..." }` |
| GET | `/networks/{id}/feedback` | Your team's reviews of a network |
| GET | `/networks/{id}/export.csv`, `/export.json` | Case-management export |
| POST | `/intake/sessions` | Start a victim chat |
| POST | `/intake/sessions/{sid}/messages` | Send one message `{ "text": "..." }` |
| GET | `/cases`, `/cases/{id}` | Reports |
| GET | `/cases/{id}/packet.pdf` | The evidence packet |
| GET | `/networks`, `/networks/{id}` | Networks, ranked |
| POST | `/networks/{id}/brief` | Write a brief on demand |
| GET | `/audit?object_id=...` | Audit trail for a report or network |
| GET | `/stats` | Totals, cost, analyst hours saved |
| GET | `/events?after=...` | Live events (case created, linked, re-ranked, brief updated) |
| POST | `/demo/reset` | Restore the demo data; needs the `X-Demo-Key` header |

Example: sign in, then export a network.

```bash
curl -s -c jar.txt -H "content-type: application/json" -d '{"team":"demo","password":"demo"}' \
  https://rastro.mrfomolabs.xyz/api/rastro/auth/login
curl -s -b jar.txt -o N-007.csv https://rastro.mrfomolabs.xyz/api/rastro/networks/N-007/export.csv
```

Start a chat and send one message (no login needed):

```bash
curl -s -X POST https://rastro-engine.fly.dev/intake/sessions
curl -s -X POST https://rastro-engine.fly.dev/intake/sessions/S-xxxxxxxxxxxx/messages \
  -H "content-type: application/json" -d '{"text": "I sent $2,400 about 3 hours ago."}'
```

## How SERV is used

| SERV feature | Where | File |
|---|---|---|
| `gpt-5.4-mini` | Intake chat, detail extraction, brief | `engine/app/intake.py`, `engine/graph/case_graph.py`, `engine/app/core.py` |
| Kronos multipath (`-serv-kronos-multipath`) | `decide`: reads the rulebook and rates each network | `engine/app/core.py` (`decide`) |
| Multipath (`-serv-multipath`) | `decide` fallback if Kronos does not answer in time | `engine/app/core.py` (`decide`) |
| PromptGuard (`serv_prompt_guard`) | Every SERV call | `engine/app/serv.py` |
| Shadow agent (`serv_shadow_agent`, with a hint) | Brief: validate-and-retry loop | `engine/app/core.py` (`brief`) |

How code keeps the AI honest:

1. **Numbers come from code.** Metrics, urgency and score are computed in Python. The fact-check rejects any number in a brief that does not match.
2. **No invented links.** Every claim in a brief must point to links that exist in the graph.
3. **Names never merge networks.** Networks are connected components over strong links only.
4. **The cautious result wins (R7).** When SERV and the rules disagree on priority, the more urgent result is kept and the reason is shown. SERV cannot overrule a rule the facts already prove (for example R2: one account shared by 3+ victims is a mule network).
5. **Victim text is data.** It is sent inside `<evidence>` tags, flagged if it tries to instruct the system, and can only add details that literally appear in it.
6. **Fallbacks are labelled.** Without SERV, the audit log records `actor: "code"` and `model: "offline-fallback"`, so a fallback is never shown as an AI step.

**Cost and speed, measured on the live deployment (15 Nov 2026):** about **$0.003 of SERV per live report** (9 calls) at the old placeholder prices. **Prices:** SERV does not publish its own per-token rates, so `engine/app/pricing.py` now uses OpenAI's list price for the base model `gpt-5.4-mini` ($0.75 input, $4.50 output per 1M tokens, [source](https://developers.openai.com/api/docs/models/gpt-5.4-mini)); multipath and Kronos are charged by the tokens SERV reports. Measured at those prices: about **$0.006 per live report**. After the victim's last message: packet ready in 2–7 s, queue re-ranked in 4–14 s, brief ready in 15–40 s. Every SERV call has a 12–45 s time limit.

## Known limits

- The repeat-reporter check matches a victim by the phone or email they give. It is not a verified identity: no one-time code is sent, so someone using a new number each time is not caught. A bank deployment would confirm the contact with an SMS or email code.
- Reports and networks are shared intelligence across teams; what is private to a team is its reviews and exports. Splitting reports per bank is a deployment choice that is not built.
- The demo team's password is public (`demo`), so anyone can sign in and press reset. Two people running the live demo at once will see each other's report.
- Exports are files a case-management system can import (CSV, JSON). There is no direct connection to a specific vendor's system.
- Prices use OpenAI's list price for the base model until SERV publishes its own.

## Roadmap

- [x] Chat intake with PromptGuard and code-checked fields
- [x] Network linking on strong details only, with name look-alikes as weak hints
- [x] Rulebook priority with SERV Kronos and R7 reconciliation
- [x] Fact-checked briefs with a template fallback
- [x] One-page PDF evidence packet
- [x] Analyst console with link map, brief and audit trail
- [x] Live deployment on Fly.io and Vercel with a SERV spending cap
- [x] Real prices in the cost table (OpenAI list price for `gpt-5.4-mini`; SERV publishes no own rate)
- [x] Analyst login per team, with team-private reviews and exports
- [x] Repeat-reporter check so one person cannot inflate a network
- [x] Analyst feedback on briefs and rankings, stored in the audit trail
- [x] Export for bank case-management systems (CSV and JSON case file)

## Contributing

1. Fork the repo and create a branch: `git checkout -b my-change`.
2. Keep `contract/schema.py` and `contract/schema.ts` in step, and log any contract change in `contract/CHANGELOG.md`.
3. Run the engine tests (`cd engine && .venv/bin/python -m pytest -q`) and the web type check (`cd web && npx tsc --noEmit`). Both must pass.
4. Open a pull request that says what changed and why.

Rules: numbers shown to users must come from code, never from a model. Any new SERV call needs a time limit and a code fallback. Keep all data synthetic.

## License

[MIT](LICENSE). Copyright (c) 2026 mrfomoweb3 and benita2001.

## Team / Acknowledgements

- [mrfomoweb3](https://github.com/mrfomoweb3)
- [benita2001](https://github.com/benita2001)
- Built for the **OpenServ SERV Hackathon, Edition 02**, on [SERV Reasoning](https://docs.openserv.ai).
- Libraries: FastAPI, LangGraph, networkx, RapidFuzz, reportlab, Next.js, Tailwind CSS, Framer Motion, lucide-react. UI pieces adapted from [EasyUI](https://easyui.site).
