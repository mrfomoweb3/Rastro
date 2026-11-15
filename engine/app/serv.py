"""SERV Reasoning client (OpenAI-compatible) + feature tools.

If SERV_API_KEY is not set, `available()` is False and every caller uses its code
fallback; the audit log then records actor="code", model="offline-fallback" so nobody
mistakes a fallback for a SERV call.

Two guards keep a public demo safe:
* every call has a short time limit and no silent retry, so a slow SERV call can never
  stall the pipeline for minutes: the caller falls back instead;
* a spending cap (SERV_BUDGET_USD, counted since the server started). Once it is used
  up, `available()` turns False and the engine runs on its code rulebook.
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
from typing import Optional, Tuple

from app.pricing import cost

BASE_URL = os.environ.get("SERV_BASE_URL") or "https://inference-api.openserv.ai/v1"
MODEL_BASE = os.environ.get("SERV_MODEL_BASE") or "gpt-5.4-mini"
USE_KRONOS = (os.environ.get("USE_KRONOS") or "true").lower() == "true"
FALLBACK_MODEL = "offline-fallback"

MODEL_PLAIN = MODEL_BASE
MODEL_MULTIPATH = f"{MODEL_BASE}-serv-multipath"
MODEL_KRONOS = f"{MODEL_BASE}-serv-kronos-multipath"

# Seconds to wait for one SERV call before the caller falls back.
TIMEOUT_INTAKE = 12.0
TIMEOUT_EXTRACT = 20.0
TIMEOUT_DECIDE_KRONOS = float(os.environ.get("SERV_TIMEOUT_KRONOS_S") or 40)
TIMEOUT_DECIDE = 25.0
TIMEOUT_BRIEF = 45.0
DEFAULT_TIMEOUT = 30.0

BUDGET_USD = float(os.environ.get("SERV_BUDGET_USD") or 5)

_client = None
_json_mode_ok: Optional[bool] = None  # learned on first call
_lock = threading.Lock()
_spent_usd = 0.0
_calls = 0


def has_key() -> bool:
    return bool(os.environ.get("SERV_API_KEY")) and os.environ.get("RASTRO_OFFLINE") != "1"


def available() -> bool:
    return has_key() and _spent_usd < BUDGET_USD


def status() -> dict:
    """For /health: is SERV in use, and how much of the cap is spent."""
    return {"serv": available(), "serv_budget_usd": BUDGET_USD, "serv_spent_usd": round(_spent_usd, 4),
            "serv_calls": _calls, "serv_budget_reached": has_key() and not available()}


def _add_spend(usd: float) -> None:
    global _spent_usd, _calls
    with _lock:
        _spent_usd += float(usd)
        _calls += 1


def client():
    global _client
    if _client is None:
        from openai import OpenAI
        _client = OpenAI(base_url=BASE_URL, api_key=os.environ["SERV_API_KEY"], timeout=DEFAULT_TIMEOUT,
                         max_retries=0)
    return _client


def shadow_tool(hint: str, max_iterations: int = 2) -> dict:
    return {"type": "function", "function": {
        "name": "serv_shadow_agent",
        "description": "Enable SERV shadow-agent validation.",
        "parameters": {"type": "object", "properties": {
            "hint": {"type": "string", "default": hint},
            "max_iterations": {"type": "integer", "default": max_iterations}}}}}


PROMPT_GUARD = {"type": "function", "function": {
    "name": "serv_prompt_guard",
    "description": "Enable SERV prompt guard.",
    "parameters": {"type": "object", "properties": {}}}}


def call(model, system, user, tools=None, json_mode=True, timeout: Optional[float] = None):
    t0 = time.time()
    kwargs = dict(model=model, messages=[{"role": "system", "content": system},
                                         {"role": "user", "content": user}])
    if tools:
        kwargs["tools"] = tools
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    r = client().with_options(timeout=timeout or DEFAULT_TIMEOUT, max_retries=0).chat.completions.create(**kwargs)
    return r, int((time.time() - t0) * 1000)


def _parse_json(text: str) -> dict:
    text = (text or "").strip()
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("no JSON object in model output")
    return json.loads(m.group(0))


def call_json(model: str, system: str, user: str, tools=None, timeout: Optional[float] = None) -> Tuple[dict, dict]:
    """Call SERV and return (parsed_json, meta{model,cost_usd,latency_ms}).

    Tries response_format first; if SERV rejects it alongside tools, retries without and
    asks for JSON in the prompt. A reply that is not JSON gets one more try. A timeout or
    an API error is raised straight away: the caller has a fallback and must not wait."""
    global _json_mode_ok
    total_ms, total_cost, last_err = 0, 0.0, None
    sys_json = system + "\n\nReply with a single JSON object and nothing else."
    for _attempt in range(2):
        use_json = _json_mode_ok is not False
        try:
            r, ms = call(model, sys_json, user, tools=tools, json_mode=use_json, timeout=timeout)
            if _json_mode_ok is None and use_json:
                _json_mode_ok = True
        except Exception as e:  # noqa: BLE001
            if use_json and _json_mode_ok is None and "response_format" in str(e).lower():
                _json_mode_ok = False
                continue
            raise
        total_ms += ms
        c = cost(model, getattr(r, "usage", None))
        total_cost += c
        _add_spend(c)
        try:
            msg = r.choices[0].message
            return _parse_json(msg.content or ""), {"model": model, "cost_usd": round(total_cost, 6),
                                                    "latency_ms": total_ms}
        except Exception as e:  # noqa: BLE001
            last_err = e
    raise RuntimeError(f"SERV call failed: {last_err}")
