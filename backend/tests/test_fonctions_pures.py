import socket

import pytest

from services import admin_service, contenu_service, image_service, site_service


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


# ------------------------------------------------------------------ taux de réécriture (H2)
def test_taux_reecriture_texte_valide_tel_quel():
    texte = "Trois acheteurs professionnels sur quatre regardent les réseaux avant d'acheter."
    assert contenu_service._taux_reecriture(texte, texte) == 0.0


def test_taux_reecriture_quasi_totale():
    taux = contenu_service._taux_reecriture(
        "Un texte généré par l'IA, assez long pour que la comparaison soit significative.",
        "Autre chose, entièrement différente, sans aucun rapport avec la phrase de départ.",
    )
    assert taux > 0.7


def test_taux_reecriture_correction_mineure():
    taux = contenu_service._taux_reecriture(
        "Trois acheteurs professionnels sur quatre regardent les réseaux avant d'acheter.",
        "Trois acheteurs professionnels sur quatre regardent les réseaux sociaux avant d'acheter.",
    )
    assert 0 < taux < 0.15


@pytest.mark.parametrize("original,final", [
    (None, "un texte final"),
    ("", "un texte final"),
    ("un texte original", None),
])
def test_taux_reecriture_sans_base_de_comparaison(original, final):
    assert contenu_service._taux_reecriture(original, final) is None


# ---------------------------------------------------------------------------
# Filet de sécurité anti-Markdown / anti-tirets (agent_service.nettoyer_texte_genere)
# Un client a signalé des « ** » et des tirets cadratins dans ses posts (1er octobre 2026) :
# 6 posts sur 41 en septembre. Le prompt les interdit, ce filet rattrape la désobéissance.
# ---------------------------------------------------------------------------
from services import agent_service


@pytest.mark.parametrize("entree, attendu", [
    ("Un **mot fort** et *un autre*.", "Un mot fort et un autre."),
    ("__souligné__", "souligné"),
    ("## Mon titre\nTexte #postorico #pme", "Mon titre\nTexte #postorico #pme"),
    ("* premier\n* second\n— troisième", "• premier\n• second\n• troisième"),
    ("Publier souvent — même imparfait – compte.", "Publier souvent, même imparfait, compte."),
    ("Tape `yarn start`  deux  fois.", "Tape yarn start deux fois."),
    ("2*3 = 6, un savoir-faire", "2*3 = 6, un savoir-faire"),
])
def test_nettoyer_texte_genere(entree, attendu):
    assert agent_service.nettoyer_texte_genere(entree) == attendu


def test_nettoyer_texte_genere_idempotent_et_texte_propre():
    propre = "Trois erreurs, une solution.\nOn en parle ?\n\n#linkedin"
    assert agent_service.nettoyer_texte_genere(propre) == propre
    une_fois = agent_service.nettoyer_texte_genere("**a** — b")
    assert agent_service.nettoyer_texte_genere(une_fois) == une_fois


def test_nettoyer_profond_carrousel():
    content = {"hook": "**Hook**", "slides": [{"titre": "# Un", "texte": "a — b", "pills": ["*x*"]}], "cta": {"titre": "ok"}}
    assert agent_service.nettoyer_profond(content) == {
        "hook": "Hook", "slides": [{"titre": "Un", "texte": "a, b", "pills": ["x"]}], "cta": {"titre": "ok"}}


# ---------------------------------------------------------------------------
# Retouche du texte des slides (agent_service.normaliser_carrousel_data), 2026-10-01
# ---------------------------------------------------------------------------
ANCIEN_CARROUSEL = {
    "hook": "Accroche", "legende": "Légende",
    "slides": [{"titre": "Un", "texte": "a", "pills": [], "pro_tip": "", "icon": "rocket", "chiffre": ""},
               {"titre": "Deux", "texte": "b", "pills": ["x"], "pro_tip": "", "icon": "", "chiffre": ""}],
    "cta": {"titre": "On en parle ?", "texte": ""},
}


def test_normaliser_carrousel_data_retouche_texte_et_garde_icone():
    nouveau = {"hook": "**Nouvelle** accroche", "legende": "Légende",
               "slides": [{"titre": "Un bis", "texte": "a — b", "pills": "p1, p2", "icon": "inconnue"},
                          {"titre": "Deux", "texte": "b"}],
               "cta": {"titre": "Écris-moi", "texte": "en DM"}}
    out = agent_service.normaliser_carrousel_data(nouveau, ANCIEN_CARROUSEL)
    assert out["hook"] == "Nouvelle accroche"
    assert out["slides"][0] == {"titre": "Un bis", "texte": "a, b", "pills": ["p1", "p2"], "pro_tip": "", "icon": "rocket", "chiffre": ""}
    assert out["slides"][1]["icon"] == ""
    assert out["cta"] == {"titre": "Écris-moi", "texte": "en DM"}


def test_normaliser_carrousel_data_borne_et_rejette_le_vide():
    long = "x" * 500
    out = agent_service.normaliser_carrousel_data({"slides": [{"titre": long, "texte": long, "pills": ["a"] * 9}]}, ANCIEN_CARROUSEL)
    assert len(out["slides"][0]["titre"]) == 90 and len(out["slides"][0]["texte"]) == 400 and len(out["slides"][0]["pills"]) == 4
    assert out["hook"] == "Accroche"  # repris de l'ancien quand absent
    assert agent_service.normaliser_carrousel_data({"slides": []}, ANCIEN_CARROUSEL) is ANCIEN_CARROUSEL
    assert agent_service.normaliser_carrousel_data("n'importe quoi", ANCIEN_CARROUSEL) is ANCIEN_CARROUSEL
