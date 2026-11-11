"""Normalisation of entity values so the same account/phone/link matches exactly."""
from __future__ import annotations

import re

_TWO_LEVEL_SUFFIXES = {
    "co.uk", "org.uk", "ac.uk", "com.ng", "org.ng", "gov.ng", "edu.ng", "com.au",
    "co.za", "com.br", "co.in", "com.gh", "co.ke", "com.mx", "co.jp",
}
_TITLES = {"mr", "mrs", "ms", "miss", "dr", "prof", "coach", "agent", "officer", "sir", "madam"}


def digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def norm_phone(s: str) -> str:
    d = digits(s)
    if d.startswith("234") and len(d) == 13:      # +234 803 … → 0803 …
        d = "0" + d[3:]
    elif d.startswith("1") and len(d) == 11:      # +1 NANP
        d = d[1:]
    elif d.startswith("44") and len(d) == 12:     # +44 7…
        d = "0" + d[2:]
    return d


def norm_url(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"^[a-z][a-z0-9+.-]*://", "", s)
    s = s.split("/")[0].split("?")[0].split("#")[0].split("@")[-1].split(":")[0]
    s = s.strip(".")
    if s.startswith("www."):
        s = s[4:]
    labels = [p for p in s.split(".") if p]
    if len(labels) >= 3 and ".".join(labels[-2:]) in _TWO_LEVEL_SUFFIXES:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:]) if len(labels) >= 2 else s


def norm_email(s: str) -> str:
    return (s or "").strip().lower()


def norm_wallet(s: str) -> str:
    s = (s or "").strip()
    return s.lower() if s.lower().startswith("0x") else s


def norm_name(s: str) -> str:
    words = re.sub(r"[^a-z\s]", " ", (s or "").lower()).split()
    return " ".join(w for w in words if w not in _TITLES)


def normalize(kind: str, value: str) -> str:
    return {
        "account": digits,
        "phone": norm_phone,
        "url": norm_url,
        "email": norm_email,
        "wallet": norm_wallet,
        "name": norm_name,
    }[kind](value)
