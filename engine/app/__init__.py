"""Rastro engine. Makes the repo root importable so `contract.schema` resolves."""
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = ENGINE_DIR.parent
for p in (str(REPO_ROOT), str(ENGINE_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

try:  # local .env support
    from dotenv import load_dotenv
    load_dotenv(REPO_ROOT / ".env")
    load_dotenv(ENGINE_DIR / ".env")
except Exception:  # pragma: no cover
    pass
