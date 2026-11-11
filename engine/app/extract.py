"""Regex/keyword extraction. Used (a) to fill the intake draft every turn, (b) as the
offline fallback for the `extract` step, and (c) as a safety net next to SERV: anything
SERV returns must still normalise cleanly, and anything regex finds is never dropped."""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from app.timeutil import iso

URL_RE = re.compile(r"\b((?:https?://)?(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|ng|xyz|top|app|info|biz|site|online|live|vip|club|shop|link|us|uk|me|cc|pro)(?:\.[a-z]{2})?(?:/[^\s,;\"')]*)?)",
                    re.I)
EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b")
WALLET_RE = re.compile(r"\b(0x[a-fA-F0-9]{40}|bc1[a-z0-9]{25,60}|T[1-9A-HJ-NP-Za-km-z]{33})\b")
PHONE_RE = re.compile(r"(?<![\w])(\+?\d[\d\s-]{8,16}\d)(?![\w])")
MONEY_RE = re.compile(r"(?:\$|usd\s*|us\$)\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?|([\d,]+(?:\.\d{1,2})?)\s*(k)?\s*(?:usd|dollars?)\b", re.I)
NAME_RE = re.compile(r"\b(?:named|called|name is|calls? (?:him|her)self|introduced (?:him|her)self as|from)\s+((?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Coach|Agent|Officer)?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)")
TITLE_NAME_RE = re.compile(r"\b((?:Mr|Mrs|Ms|Dr|Coach|Agent|Officer)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)")

CHANNEL_WORDS = [
    ("whatsapp", ["whatsapp", "whats app", "wa group"]),
    ("sms", ["sms", "text message", "texted"]),
    ("email", ["email", "e-mail", "inbox", "gmail"]),
    ("phone", ["phone call", "called me", "rang me", "call from", "on the phone", "voice call"]),
    ("social", ["instagram", "facebook", "telegram", "twitter", " x ", "tiktok", "linkedin", "social media", "dating app", "tinder"]),
    ("website", ["website", "site", "online store", "web page", "platform"]),
]
SCAM_WORDS = [
    ("investment", ["invest", "returns", "profit", "trading", "crypto", "forex", "double", "roi", "mining"]),
    ("impersonation", ["pretend", "claimed to be", "from the bank", "bank officer", "customer care", "efcc", "police", "irs", "support team", "your bank", "bvn"]),
    ("romance", ["boyfriend", "girlfriend", "love", "dating", "relationship", "met online", "marry"]),
    ("phishing", ["link", "login", "otp", "verify your", "password", "pin", "click"]),
    ("fake_job", ["job", "recruit", "hiring", "task", "salary", "interview", "work from home"]),
    ("purchase", ["bought", "order", "delivery", "seller", "item", "product", "never arrived", "paid for"]),
]
NUM_WORDS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
             "seven": 7, "eight": 8, "nine": 9, "ten": 10, "twelve": 12}


def find_amount(text: str) -> Optional[float]:
    best = None
    for m in MONEY_RE.finditer(text):
        raw = (m.group(1) or m.group(3) or "").replace(",", "")
        if not raw:
            continue
        v = float(raw) * (1000 if (m.group(2) or m.group(4)) else 1)
        if v > 0:
            best = v if best is None else max(best, v)
    if best is None:
        m = re.search(r"\b(?:paid|sent|transferred|lost)\s+(?:them\s+)?([\d,]{3,}(?:\.\d{1,2})?)\b", text, re.I)
        if m:
            best = float(m.group(1).replace(",", ""))
    return best


def find_paid_at(text: str, now: datetime) -> Optional[str]:
    t = text.lower()
    m = re.search(r"\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(minute|min|hour|hr|day|week)s?\s+ago\b", t)
    if m:
        n = int(m.group(1)) if m.group(1).isdigit() else NUM_WORDS[m.group(1)]
        unit = m.group(2)
        delta = {"minute": timedelta(minutes=n), "min": timedelta(minutes=n), "hour": timedelta(hours=n),
                 "hr": timedelta(hours=n), "day": timedelta(days=n), "week": timedelta(weeks=n)}[unit]
        return iso(now - delta)
    if "this morning" in t or "earlier today" in t or re.search(r"\btoday\b", t):
        return iso(now - timedelta(hours=3))
    if "last night" in t:
        return iso(now - timedelta(hours=14))
    if "yesterday" in t:
        return iso(now - timedelta(days=1))
    m = re.search(r"\b(20\d\d-\d\d-\d\d)(?:[ t](\d\d:\d\d))?", t)
    if m:
        try:
            dt = datetime.fromisoformat(m.group(1) + ("T" + m.group(2) if m.group(2) else "T12:00"))
            return iso(dt.replace(tzinfo=now.tzinfo))
        except ValueError:
            return None
    return None


def find_channel(text: str) -> Optional[str]:
    t = f" {text.lower()} "
    for ch, words in CHANNEL_WORDS:
        if any(w in t for w in words):
            return ch
    return None


def guess_scam_type(text: str) -> Dict[str, float | str]:
    t = text.lower()
    scores = {k: sum(t.count(w) for w in words) for k, words in SCAM_WORDS}
    best = max(scores, key=scores.get)
    total = sum(scores.values())
    if scores[best] == 0:
        return {"label": "unknown", "confidence": 0.3}
    return {"label": best, "confidence": round(min(0.9, 0.45 + 0.45 * scores[best] / total), 2)}


def find_entities(text: str) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    seen = set()

    def add(kind: str, value: str):
        value = value.strip().strip(".,;:")
        key = (kind, value.lower())
        if value and key not in seen:
            seen.add(key)
            out.append({"kind": kind, "value": value})

    emails = EMAIL_RE.findall(text)
    for e in emails:
        add("email", e)
    scrub = EMAIL_RE.sub(" ", text)
    for w in WALLET_RE.findall(scrub):
        add("wallet", w)
    scrub = WALLET_RE.sub(" ", scrub)
    for u in URL_RE.findall(scrub):
        if not re.fullmatch(r"[\d.]+", u):
            add("url", u)
    scrub = URL_RE.sub(" ", scrub)
    for m in PHONE_RE.finditer(scrub):
        raw = m.group(1)
        d = re.sub(r"\D", "", raw)
        ctx = scrub[max(0, m.start() - 40):m.start()].lower()
        is_account_ctx = any(w in ctx for w in ("account", "acct", "a/c", "acc no", "bank", "transfer", "nuban", "paid into", "sent to"))
        is_phone_ctx = any(w in ctx for w in ("phone", "number", "call", "whatsapp", "text", "sms", "line"))
        if len(d) == 10 and not raw.startswith("+") and (is_account_ctx or not is_phone_ctx):
            add("account", d)
        elif 10 <= len(d) <= 14:
            add("phone", raw)
    for m in list(NAME_RE.finditer(text)) + list(TITLE_NAME_RE.finditer(text)):
        nm = m.group(1).strip()
        if nm.split()[0].lower() not in {"the", "my", "a", "an", "demo", "bank", "whatsapp"} and len(nm) > 3:
            add("name", nm)
    return out
