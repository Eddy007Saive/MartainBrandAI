from datetime import datetime, timedelta, timezone

import pytest

from services import mfa_service


@pytest.mark.parametrize("email,attendu", [
    ("martin@gmail.com", "m***n@gmail.com"),
    ("ab@x.fr", "a***@x.fr"),
    ("a@x.fr", "a***@x.fr"),
    ("abc@x.fr", "a***c@x.fr"),
    ("sans-arobase", "***"),
    ("", "***"),
    ("@x.fr", "***"),
])
def test_masquer_email(email, attendu):
    assert mfa_service.masquer_email(email) == attendu


def test_masquer_email_ne_montre_jamais_l_adresse_complete():
    assert "artin" not in mfa_service.masquer_email("martin@gmail.com")


UTC = timezone.utc


@pytest.mark.parametrize("texte,attendu", [
    ("2026-09-20T10:00:00Z", datetime(2026, 9, 20, 10, 0, 0, tzinfo=UTC)),
    ("2026-09-20T10:00:00+00:00", datetime(2026, 9, 20, 10, 0, 0, tzinfo=UTC)),
    ("2026-09-20T10:00:00.123+00:00", datetime(2026, 9, 20, 10, 0, 0, 123000, tzinfo=UTC)),
    ("2026-09-20T10:00:00.123456+00:00", datetime(2026, 9, 20, 10, 0, 0, 123456, tzinfo=UTC)),
    ("2026-09-20T10:00:00.12345+00:00", datetime(2026, 9, 20, 10, 0, 0, 123450, tzinfo=UTC)),
    ("2026-09-20T10:00:00.1+00:00", datetime(2026, 9, 20, 10, 0, 0, 100000, tzinfo=UTC)),
    ("2026-09-20T10:00:00.1234567+00:00", datetime(2026, 9, 20, 10, 0, 0, 123456, tzinfo=UTC)),
])
def test_parse_accepte_toutes_les_longueurs_de_fraction(texte, attendu):
    """La base renvoie parfois 5 chiffres après la seconde ; Python 3.10 n'en accepte que 3 ou 6."""
    assert mfa_service._parse(texte) == attendu


def test_parse_conserve_le_fuseau():
    d = mfa_service._parse("2026-09-20T12:00:00.5+02:00")
    assert d.utcoffset() == timedelta(hours=2)


def test_hash_deterministe_et_hexadecimal():
    h = mfa_service._hash("123456")
    assert h == mfa_service._hash("123456") and len(h) == 64 and int(h, 16) >= 0


def test_hash_differe_selon_la_valeur():
    assert mfa_service._hash("123456") != mfa_service._hash("654321")


def test_hash_depend_du_secret(monkeypatch):
    avant = mfa_service._hash("123456")
    monkeypatch.setattr(mfa_service, "JWT_SECRET", "un-tout-autre-secret-de-test-0123456789ab")
    assert mfa_service._hash("123456") != avant


def test_un_administrateur_donne_toujours_le_code(monkeypatch):
    monkeypatch.setattr(mfa_service, "appareil_valide", lambda tg, jeton: True)
    assert mfa_service.exige_code({"telegram_id": "a", "is_admin": True}, "jeton") is True


def test_appareil_de_confiance_dispense_un_utilisateur(monkeypatch):
    monkeypatch.setattr(mfa_service, "appareil_valide", lambda tg, jeton: True)
    assert mfa_service.exige_code({"telegram_id": "u", "is_admin": False}, "jeton") is False


def test_appareil_inconnu_exige_le_code(monkeypatch):
    monkeypatch.setattr(mfa_service, "appareil_valide", lambda tg, jeton: False)
    assert mfa_service.exige_code({"telegram_id": "u"}, None) is True
