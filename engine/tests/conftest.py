import os
import sys
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="rastro-test-"))
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP / 'test.db'}"
os.environ["RASTRO_SNAPSHOT"] = str(_TMP / "prebaked.json")
os.environ["RASTRO_OFFLINE"] = "1"          # tests never spend SERV credit
os.environ["DEMO_KEY"] = "test-key"

ENGINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ENGINE))
import app  # noqa: E402,F401

import pytest  # noqa: E402


@pytest.fixture(scope="session")
def baked():
    from app import db
    from scripts import gen_seed, prebake
    if not (ENGINE / "data" / "seed_cases.json").exists():
        gen_seed.main()
    committed = ENGINE / "data" / "prebaked.json"
    if committed.exists():
        # prebake.main() ranks against the real clock, but seed dates are fixed, so a fresh
        # bake drifts as days pass. Restore the committed snapshot (shifted to now) instead.
        import shutil
        from app.main import restore_snapshot
        shutil.copy(committed, os.environ["RASTRO_SNAPSHOT"])
        db.init()
        assert restore_snapshot()
    else:
        prebake.main()
    return db


@pytest.fixture()
def fresh(baked):
    """Restore the pre-baked snapshot before a test that mutates state."""
    from app.main import restore_snapshot
    assert restore_snapshot()
    return baked
