# Rastro web

Front end for Rastro: a landing page, a victim report chat and an analyst console.
It talks to the engine in `../engine` through a proxy, so there is no CORS setup.

## Run it

```bash
# 1. engine (from the repo root, see the main README)
cd engine && .venv/bin/uvicorn app.main:app --port 8000

# 2. web
cd web
cp .env.example .env.local     # set DEMO_KEY to the engine's DEMO_KEY
npm install
npm run dev                    # http://localhost:3000
```

| Route | What it is |
|---|---|
| `/` | Landing page. Live numbers come from `/stats`, the preview from `/networks`. |
| `/report` | Victim chat on `/intake`. Ends with the PDF packet. No account. |
| `/console` | Analyst console: ranked networks, link graph, brief, agent activity, reports. |
| `/console?demo=1` | Same, with the live demo panel open. |

The live demo resets the data, files the scripted report from `demo/hero_cases.json`,
and shows network N-007 move from #6 to #1.

## Deploy

Set `RASTRO_API_URL` to the deployed engine and `DEMO_KEY` to its demo key (server side only).

UI components copied from [EasyUI](https://easyui.site): `AIAgentActivity` (the agent timeline) and `AnimatedNumber` (the rolling counters).
