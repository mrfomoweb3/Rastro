"""USD per 1M tokens, used to track what SERV costs.

SERV does not publish its own per-token prices. The default is OpenAI's list price for
the base model gpt-5.4-mini ($0.75 input, $4.50 output per 1M tokens,
https://developers.openai.com/api/docs/models/gpt-5.4-mini, checked 15 Nov 2026).
Multipath and Kronos runs are charged by the tokens they actually use, which SERV
reports in `usage`, so no extra multiplier is applied. Override with PRICE_IN_PER_M and
PRICE_OUT_PER_M once SERV's own rate is known."""
from __future__ import annotations

import os

PRICE_SOURCE = "OpenAI list price for gpt-5.4-mini (SERV's own rate is not published)"
PRICES = {
    # model base: (input $/1M, output $/1M). An empty value in .env counts as "not set".
    "gpt-5.4-mini": (float(os.environ.get("PRICE_IN_PER_M") or "0.75"),
                     float(os.environ.get("PRICE_OUT_PER_M") or "4.50")),
}


def cost(model: str, usage) -> float:
    if usage is None:
        return 0.0
    base = next((b for b in PRICES if model.startswith(b)), None)
    if base is None:
        return 0.0
    pin, pout = PRICES[base]
    tin = getattr(usage, "prompt_tokens", 0) or 0
    tout = getattr(usage, "completion_tokens", 0) or 0
    return round(((tin * pin) + (tout * pout)) / 1_000_000, 6)
