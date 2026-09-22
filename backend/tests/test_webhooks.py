import base64
import hashlib
import hmac
import json
import time

import pytest

from services import billing_service, late_service

SECRET_STRIPE = "whsec_secret_de_test"
SECRET_LATE = "secret-late-de-test"


def _entete_stripe(corps: bytes, secret=SECRET_STRIPE, horodatage=None):
    t = int(horodatage if horodatage is not None else time.time())
    signe = f"{t}.".encode() + corps
    v1 = hmac.new(secret.encode(), signe, hashlib.sha256).hexdigest()
    return f"t={t},v1={v1}"


def _evenement(type_="invoice.paid", id_="evt_1"):
    return json.dumps({"id": id_, "object": "event", "type": type_, "data": {"object": {}}}).encode()


@pytest.fixture
def stripe_configure(monkeypatch):
    monkeypatch.setattr(billing_service, "_ready", lambda: True)
    monkeypatch.setattr(billing_service, "STRIPE_WEBHOOK_SECRET", SECRET_STRIPE)
    monkeypatch.setattr(billing_service, "_deja_traite", lambda event_id, etype: True)


def test_stripe_signature_valide_acceptee(stripe_configure):
    corps = _evenement()
    r = billing_service.handle_webhook(corps, _entete_stripe(corps))
    assert r == {"ok": True, "event": "invoice.paid", "duplicate": True}


def test_stripe_mauvaise_signature_rejetee(stripe_configure):
    corps = _evenement()
    r = billing_service.handle_webhook(corps, _entete_stripe(corps, secret="autre_secret"))
    assert r == {"ok": False, "error": "bad signature"}


def test_stripe_corps_modifie_apres_signature_rejete(stripe_configure):
    original = _evenement()
    entete = _entete_stripe(original)
    falsifie = _evenement(type_="checkout.session.completed")
    assert billing_service.handle_webhook(falsifie, entete)["ok"] is False


def test_stripe_signature_trop_ancienne_rejetee(stripe_configure):
    corps = _evenement()
    entete = _entete_stripe(corps, horodatage=time.time() - 3600)
    assert billing_service.handle_webhook(corps, entete)["ok"] is False


def test_stripe_entete_absent_rejete(stripe_configure):
    assert billing_service.handle_webhook(_evenement(), "")["ok"] is False


def test_stripe_sans_secret_configure_refuse_tout(monkeypatch):
    """Échec fermé : sans secret, aucun événement n'est accepté, même bien formé."""
    monkeypatch.setattr(billing_service, "_ready", lambda: True)
    monkeypatch.setattr(billing_service, "STRIPE_WEBHOOK_SECRET", "")
    corps = _evenement()
    r = billing_service.handle_webhook(corps, _entete_stripe(corps, secret=""))
    assert r["ok"] is False and "non configuré" in r["error"]


def test_stripe_desactive_refuse(monkeypatch):
    monkeypatch.setattr(billing_service, "_ready", lambda: False)
    assert billing_service.handle_webhook(_evenement(), "x") == {"ok": False}


@pytest.fixture
def late_configure(monkeypatch):
    monkeypatch.setattr(late_service, "LATE_WEBHOOK_SECRET", SECRET_LATE)


def _hmac_hex(corps: bytes):
    return hmac.new(SECRET_LATE.encode(), corps, hashlib.sha256).hexdigest()


def test_late_signature_hex_valide_acceptee(late_configure):
    corps = b'{"event":"post.published"}'
    assert late_service.verify_signature(corps, _hmac_hex(corps)) is True


def test_late_signature_base64_valide_acceptee(late_configure):
    corps = b'{"event":"post.published"}'
    b64 = base64.b64encode(hmac.new(SECRET_LATE.encode(), corps, hashlib.sha256).digest()).decode()
    assert late_service.verify_signature(corps, b64) is True


def test_late_sans_signature_acceptee(late_configure):
    assert late_service.verify_signature(b"{}", "") is True


def test_late_sans_secret_acceptee(monkeypatch):
    monkeypatch.setattr(late_service, "LATE_WEBHOOK_SECRET", "")
    assert late_service.verify_signature(b"{}", "n'importe quoi") is True


def test_late_signature_invalide_est_acceptee_comportement_actuel(late_configure):
    """COMPORTEMENT ACTUEL, limite documentée : la signature Late n'est pas exigée, seulement journalisée
    (sa spécification n'est pas publiée). Contrairement à Stripe, l'échec n'est pas fermé."""
    assert late_service.verify_signature(b'{"event":"post.published"}', "signature-forgee") is True
