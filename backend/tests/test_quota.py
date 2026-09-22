from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from services import quota_service


def test_image_hd_pour_nano3():
    assert quota_service.image_action("nano3") == "image_pro"


@pytest.mark.parametrize("modele", ["nano2", "", None, "autre"])
def test_image_standard_par_defaut(modele):
    assert quota_service.image_action(modele) == "image_standard"


@pytest.mark.parametrize("reason,fragment", [
    ("no_subscription", "14 jours d'essai"),
    ("canceled", "Réactive ton abonnement"),
    ("impaye", "dernier prélèvement"),
    ("suspendu", "réseaux ont été déconnectés"),
    ("expired", "essai est terminé"),
    ("inconnue", "Quota indisponible"),
])
def test_message_par_raison(reason, fragment):
    assert fragment in quota_service._message("post", reason)


def test_message_hors_forfait_nomme_le_type():
    assert "Les posts sont inclus" in quota_service._message("post", "not_in_plan")


def test_message_type_reserve_au_pro_quand_limite_nulle():
    assert "réservés à l'offre Pro" in quota_service._message("image_pro", "quota", limit=0)


def test_message_quota_epuise():
    assert "tous tes posts" in quota_service._message("post", "quota", limit=10)


def test_type_inconnu_utilise_un_libelle_generique():
    assert "générations" in quota_service._message("type-inconnu", "not_in_plan")


def test_le_client_ne_voit_jamais_d_euros():
    for r in ("no_subscription", "canceled", "impaye", "suspendu", "expired", "not_in_plan", "quota"):
        assert "€" not in quota_service._message("post", r, limit=5)


UTC = timezone.utc


def test_parse_lit_une_date_a_cinq_chiffres_sans_retomber_sur_maintenant():
    assert quota_service._parse("2026-09-20T10:00:00.12345+00:00") == datetime(2026, 9, 20, 10, 0, 0, 123450, tzinfo=UTC)


def test_parse_lit_le_suffixe_z():
    assert quota_service._parse("2026-09-20T10:00:00Z") == datetime(2026, 9, 20, 10, 0, tzinfo=UTC)


@pytest.mark.parametrize("illisible", ["n'importe quoi", None, ""])
def test_parse_illisible_retombe_sur_maintenant(illisible):
    ecart = abs((quota_service._parse(illisible) - datetime.now(UTC)).total_seconds())
    assert ecart < 5


class _Rpc:
    def __init__(self, reponse=None, erreur=None):
        self.reponse, self.erreur, self.appels = reponse, erreur, []

    def rpc(self, nom, args):
        self.appels.append((nom, args))
        return self

    def execute(self):
        if self.erreur:
            raise self.erreur
        return SimpleNamespace(data=self.reponse)


@pytest.fixture
def base(monkeypatch):
    """Compte actif, ni en pause ni impayé, ni « boss »."""
    monkeypatch.setattr(quota_service, "ensure_subscription", lambda tg: None)
    monkeypatch.setattr(quota_service, "en_pause", lambda tg: False)
    monkeypatch.setattr(quota_service, "statut_abonnement", lambda tg: "active")
    monkeypatch.setattr(quota_service, "est_boss", lambda tg: False)

    def installer(rpc):
        monkeypatch.setattr(quota_service, "supabase", rpc)
        return rpc
    return installer


def test_consommation_acceptee_transmet_le_type_et_la_quantite(base):
    rpc = base(_Rpc({"ok": True, "subscription_id": "s1"}))
    r = quota_service.consume("u1", "post", 2)
    assert r["ok"] is True and r["action_type"] == "post" and r["qty"] == 2
    assert rpc.appels == [("consume_quota", {"p_user": "u1", "p_action": "post", "p_qty": 2})]


def test_depassement_refuse_avec_message_du_type(base):
    base(_Rpc({"ok": False, "reason": "quota", "limit": 10}))
    r = quota_service.consume("u1", "post")
    assert r["ok"] is False and "tous tes posts" in r["message"]


def test_compte_en_pause_refuse_sans_appeler_la_base(monkeypatch, base):
    rpc = base(_Rpc({"ok": True}))
    monkeypatch.setattr(quota_service, "en_pause", lambda tg: True)
    r = quota_service.consume("u1", "post")
    assert r["ok"] is False and r["reason"] == "pause" and rpc.appels == []


@pytest.mark.parametrize("statut,raison", [("past_due", "impaye"), ("suspended", "suspendu")])
def test_impaye_ou_suspendu_refuse_sans_appeler_la_base(monkeypatch, base, statut, raison):
    rpc = base(_Rpc({"ok": True}))
    monkeypatch.setattr(quota_service, "statut_abonnement", lambda tg: statut)
    r = quota_service.consume("u1", "post")
    assert r["ok"] is False and r["reason"] == raison and rpc.appels == []


def test_le_boss_n_est_pas_bloque_par_l_impaye(monkeypatch, base):
    base(_Rpc({"ok": True}))
    monkeypatch.setattr(quota_service, "statut_abonnement", lambda tg: "past_due")
    monkeypatch.setattr(quota_service, "est_boss", lambda tg: True)
    assert quota_service.consume("u1", "post")["ok"] is True


def test_erreur_de_la_base_renvoie_un_refus_propre(base):
    base(_Rpc(erreur=RuntimeError("base injoignable")))
    r = quota_service.consume("u1", "post")
    assert r["ok"] is False and r["reason"] == "error"


def test_sans_abonnement_la_raison_est_affinee(monkeypatch, base):
    base(_Rpc({"ok": False, "reason": "no_subscription"}))
    monkeypatch.setattr(quota_service, "_raison_sans_abonnement", lambda tg: ("canceled", "x"))
    r = quota_service.consume("u1", "post")
    assert r["reason"] == "canceled" and "Réactive" in r["message"]
