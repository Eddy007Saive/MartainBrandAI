import os
import sys
from pathlib import Path

# Environnement hermétique : les tests ne lisent jamais les vrais secrets et n'ouvrent aucune connexion.
os.environ["SUPABASE_URL"] = "http://localhost:54321"
os.environ["SUPABASE_ANON_KEY"] = "sb_publishable_cle_de_test"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""
os.environ["JWT_SECRET"] = "secret-de-test-assez-long-pour-hs256-0123456789"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _rate_limit_propre():
    from services import rate_limit
    rate_limit._buckets.clear()
    yield
    rate_limit._buckets.clear()
