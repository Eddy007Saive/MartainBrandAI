import socket

import pytest

from services import admin_service, image_service, site_service


# ------------------------------------------------------------------ noms de couleurs
@pytest.mark.parametrize("hexa,nom", [
    ("#000000", "black"),
    ("#FFFFFF", "white"),
    ("#FFF", "white"),
    ("#ffffff", "white"),
    ("#FF0000", "red"),
    ("#0000FF", "blue"),
    ("#808080", "grey"),
])
def test_nom_de_couleur_en_anglais(hexa, nom):
    assert image_service._nom_couleur(hexa) == nom


@pytest.mark.parametrize("langue,attendu", [("fr", "rouge"), ("es", "rojo"), ("en", "red"), ("de", "red")])
def test_nom_de_couleur_traduit(langue, attendu):
    assert image_service._nom_couleur("#FF0000", langue) == attendu


@pytest.mark.parametrize("entree", ["zzz", "#12", "", None])
def test_couleur_illisible_ne_plante_pas(entree):
    assert image_service._nom_couleur(entree) == (entree or "")


def test_traduction_des_couleurs_composees():
    assert image_service._traduire_couleur("deep navy", "fr") == "bleu marine profond"
    assert image_service._traduire_couleur("pale violet", "es") == "violeta pálido"
    assert image_service._traduire_couleur("deep navy", "en") == "deep navy"


# ------------------------------------------------------------------ anti-SSRF
def _dns(monkeypatch, *ips):
    monkeypatch.setattr(socket, "getaddrinfo", lambda h, p: [(2, 1, 6, "", (ip, 0)) for ip in ips])


def test_adresse_vide_refusee():
    with pytest.raises(site_service.SiteIllisible):
        site_service.normaliser("   ")


def test_schema_manquant_complete(monkeypatch):
    _dns(monkeypatch, "93.184.216.34")
    assert site_service.normaliser("example.com") == "https://example.com"


def test_adresse_publique_conservee(monkeypatch):
    _dns(monkeypatch, "93.184.216.34")
    assert site_service.normaliser("http://example.com/page") == "http://example.com/page"


@pytest.mark.parametrize("url", [
    "http://127.0.0.1",
    "http://localhost",
    "http://10.0.0.5/admin",
    "http://192.168.1.1",
    "http://169.254.169.254/latest/meta-data",
])
def test_adresses_internes_refusees(url):
    """Un client ne doit pas pouvoir faire lire le réseau interne ou les métadonnées du cloud."""
    with pytest.raises(site_service.SiteIllisible):
        site_service.normaliser(url)


def test_nom_qui_pointe_vers_une_adresse_privee_refuse(monkeypatch):
    _dns(monkeypatch, "10.0.0.7")
    with pytest.raises(site_service.SiteIllisible):
        site_service.normaliser("https://interne.exemple.com")


def test_un_seul_resultat_dns_prive_suffit_a_refuser(monkeypatch):
    _dns(monkeypatch, "93.184.216.34", "127.0.0.1")
    with pytest.raises(site_service.SiteIllisible):
        site_service.normaliser("https://piege.exemple.com")


def test_domaine_inexistant_refuse(monkeypatch):
    def introuvable(h, p):
        raise socket.gaierror("inconnu")
    monkeypatch.setattr(socket, "getaddrinfo", introuvable)
    with pytest.raises(site_service.SiteIllisible, match="n'existe pas"):
        site_service.normaliser("https://nexiste-pas.exemple")


# ------------------------------------------------------------------ champs d'abonnement (admin)
def test_sans_abonnement_le_compte_est_gratuit():
    c = admin_service._champs_abonnement(None)
    assert c["plan"] == "gratuit" and c["plan_libelle"] == "Essai" and c["prix_cents"] == 0


def test_forfait_essai_est_affiche_gratuit():
    assert admin_service._champs_abonnement({"plan": "Essai"})["plan"] == "gratuit"


def test_forfait_pro_en_minuscules_avec_ses_dates():
    c = admin_service._champs_abonnement({
        "plan": "Pro", "renouvelle_le": "2026-10-01", "resilie_le": None,
        "stripe_subscription_id": "sub_1", "prix_cents": 25900,
    })
    assert c["plan"] == "pro" and c["plan_libelle"] == "Pro"
    assert c["plan_renews_at"] == "2026-10-01" and c["plan_cancel_at"] is None
    assert c["stripe_subscription_id"] == "sub_1" and c["prix_cents"] == 25900
