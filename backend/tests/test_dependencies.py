from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

import config
import dependencies
from services import auth_service


def _cred(token):
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _jeton(claims=None, secret=None, delta=timedelta(hours=1), **kw):
    data = {"telegram_id": "u1", "is_admin": False, **(claims or {})}
    data["exp"] = datetime.now(timezone.utc) + delta
    return jwt.encode(data, secret or config.JWT_SECRET, algorithm="HS256", **kw)


def test_jeton_valide_accepte():
    assert dependencies.verify_token(_cred(_jeton()))["telegram_id"] == "u1"


def test_jeton_expire_refuse():
    with pytest.raises(HTTPException) as e:
        dependencies.verify_token(_cred(_jeton(delta=timedelta(seconds=-5))))
    assert e.value.status_code == 401 and "expired" in e.value.detail


def test_jeton_mal_signe_refuse():
    with pytest.raises(HTTPException) as e:
        dependencies.verify_token(_cred(_jeton(secret="autre-secret-de-plus-de-32-caracteres-xxxx")))
    assert e.value.status_code == 401


def test_texte_quelconque_refuse():
    with pytest.raises(HTTPException) as e:
        dependencies.verify_token(_cred("pas-un-jeton"))
    assert e.value.status_code == 401


def test_algorithme_none_refuse():
    sans_signature = jwt.encode({"telegram_id": "u1", "is_admin": True}, key=None, algorithm="none")
    with pytest.raises(HTTPException) as e:
        dependencies.verify_token(_cred(sans_signature))
    assert e.value.status_code == 401


def test_extension_crit_inconnue_refusee():
    """Correctif CVE-2026-32597 (PyJWT 2.12.0) : un en-tête « crit » non géré doit être refusé."""
    piege = _jeton(headers={"crit": ["extension-inconnue"], "extension-inconnue": 1})
    with pytest.raises(HTTPException) as e:
        dependencies.verify_token(_cred(piege))
    assert e.value.status_code == 401


def test_session_invalidee_par_changement_de_mot_de_passe(monkeypatch):
    monkeypatch.setattr(auth_service, "session_valid", lambda tg, fp: False)
    with pytest.raises(HTTPException) as e:
        dependencies.verify_token(_cred(_jeton({"fp": "ancienne-empreinte"})))
    assert e.value.status_code == 401 and "Session" in e.value.detail


def test_session_valide_acceptee(monkeypatch):
    monkeypatch.setattr(auth_service, "session_valid", lambda tg, fp: True)
    assert dependencies.verify_token(_cred(_jeton({"fp": "empreinte"})))["fp"] == "empreinte"


def test_jeton_utilisateur_refuse_sur_route_admin():
    with pytest.raises(HTTPException) as e:
        dependencies.verify_admin_token(_cred(_jeton({"is_admin": False})))
    assert e.value.status_code == 403


def test_jeton_sans_indicateur_admin_refuse_sur_route_admin():
    claims = {"telegram_id": "u1", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    with pytest.raises(HTTPException) as e:
        dependencies.verify_admin_token(_cred(jwt.encode(claims, config.JWT_SECRET, algorithm="HS256")))
    assert e.value.status_code == 403


def test_jeton_admin_accepte_sur_route_admin():
    assert dependencies.verify_admin_token(_cred(_jeton({"is_admin": True})))["is_admin"] is True
