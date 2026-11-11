"""USD per 1M tokens. PLACEHOLDERS — fill from the SERV model catalog on day 1
(docs.openserv.ai). Suffixes (-serv-multipath, -serv-kronos-…) may add cost on top;
run scripts/cost_probe.py and correct these numbers."""
from __future__ import annotations

import os

PRICES = {
    # model base: (input $/1M, output $/1M)
    "gpt-5.4-mini": (float(os.environ.get("PRICE_IN_PER_M", "0.25")),
                     float(os.environ.get("PRICE_OUT_PER_M", "2.00"))),
}
# Extra multiplier per SERV feature suffix (placeholder until measured).
SUFFIX_MULT = {"multipath": 1.5, "kronos": 1.5}


def cost(model: str, usage) -> float:
    if usage is None:
        return 0.0
    base = next((b for b in PRICES if model.startswith(b)), None)
    if base is None:
        return 0.0
    pin, pout = PRICES[base]
    mult = 1.0
    for s, m in SUFFIX_MULT.items():
        if f"-{s}" in model:
            mult *= m
    tin = getattr(usage, "prompt_tokens", 0) or 0
    tout = getattr(usage, "completion_tokens", 0) or 0
    return round(((tin * pin) + (tout * pout)) / 1_000_000 * mult, 6)
