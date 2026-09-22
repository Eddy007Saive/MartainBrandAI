from datetime import datetime, timedelta, timezone

import jwt
import pytest

import config
from services import auth_service


def _decode(token):
    return jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])


def _duree(payload):
    return datetime.fromtimestamp(payload["exp"], tz=timezone.utc) - datetime.now(timezone.utc)


@pytest.fixture(scope="module")
def hash_de_test():
    return auth_service.hash_password("Mot-de-passe-1!")


def test_hash_utilise_bcrypt_douze_tours(hash_de_test):
    assert hash_de_test.startswith("$2b$12$")


def test_bon_mot_de_passe_accepte(hash_de_test):
    assert auth_service.verify_password("Mot-de-passe-1!", hash_de_test) is True


def test_mauvais_mot_de_passe_refuse(hash_de_test):
    assert auth_service.verify_password("mauvais", hash_de_test) is False


@pytest.mark.parametrize("mdp,hache", [("", "x"), ("x", ""), (None, "x"), ("x", None)])
def test_mot_de_passe_ou_hash_vide_refuse(mdp, hache):
    assert auth_service.verify_password(mdp, hache) is False


def test_hash_malforme_refuse_sans_planter():
    assert auth_service.verify_password("x", "ceci-n-est-pas-un-hash-bcrypt") is False


def test_deux_hachages_du_meme_mot_de_passe_different():
    assert auth_service.hash_password("abc") != auth_service.hash_password("abc")


def test_jeton_contient_les_donnees_et_expire_dans_sept_jours():
    p = _decode(auth_service.create_token({"telegram_id": "u1", "is_admin": False}))
    assert p["telegram_id"] == "u1" and p["is_admin"] is False
    assert timedelta(days=6, hours=23) < _duree(p) <= timedelta(days=7)


def test_jeton_admin_court():
    p = _decode(auth_service.create_token({"is_admin": True}, expires_delta=timedelta(hours=8)))
    assert timedelta(hours=7, minutes=55) < _duree(p) <= timedelta(hours=8)


def test_creation_de_jeton_ne_modifie_pas_les_donnees():
    data = {"telegram_id": "u1"}
    auth_service.create_token(data)
    assert data == {"telegram_id": "u1"}


def test_jeton_signe_avec_un_autre_secret_est_rejete():
    faux = jwt.encode({"telegram_id": "u1"}, "autre-secret-de-plus-de-32-caracteres-xxxx", algorithm="HS256")
    with pytest.raises(jwt.InvalidSignatureError):
        _decode(faux)


def test_sanitize_retire_le_hash():
    u = auth_service.sanitize_user({"email": "a@b.c", "password_hash": "secret"})
    assert "password_hash" not in u and u["email"] == "a@b.c"


def test_sanitize_accepte_none():
    assert auth_service.sanitize_user(None) is None


def test_empreinte_stable_et_courte():
    f = auth_service._pwd_fingerprint("hash-1")
    assert f == auth_service._pwd_fingerprint("hash-1") and len(f) == 16


def test_empreinte_change_avec_le_mot_de_passe():
    assert auth_service._pwd_fingerprint("hash-1") != auth_service._pwd_fingerprint("hash-2")


def test_empreinte_tolere_un_hash_absent():
    assert len(auth_service._pwd_fingerprint(None)) == 16


def test_jeton_de_reinitialisation_valable_une_heure_et_lie_au_mot_de_passe():
    p = _decode(auth_service.create_reset_token("u1", "hash-actuel"))
    assert p["type"] == "reset" and p["telegram_id"] == "u1"
    assert p["fp"] == auth_service._pwd_fingerprint("hash-actuel")
    assert timedelta(minutes=59) < _duree(p) <= timedelta(hours=1)


def test_jeton_de_reinitialisation_invalide_apres_changement_du_mot_de_passe():
    ancien = _decode(auth_service.create_reset_token("u1", "hash-ancien"))
    assert ancien["fp"] != auth_service._pwd_fingerprint("hash-nouveau")


@pytest.mark.parametrize("courante,attendu", [("fp-ok", True), ("fp-autre", False), (None, False)])
def test_session_valide_compare_les_empreintes(monkeypatch, courante, attendu):
    monkeypatch.setattr(auth_service, "_current_fp", lambda tg: courante)
    assert auth_service.session_valid("u1", "fp-ok") is attendu
