"""Styles du générateur partagé (Kraft, Surligné, Grand chiffre, styles photo)."""
import os

from services import carrousel_service, pexels_service

RACINE = os.path.join(os.path.dirname(__file__), "..", "..")


def test_generateur_identique_a_celui_du_frontend():
    # Une seule source : la copie du backend doit rester identique au fichier de l'aperçu.
    back = open(os.path.join(RACINE, "backend", "assets", "styles_carrousel.js"), encoding="utf-8").read()
    front = open(os.path.join(RACINE, "frontend", "src", "lib", "stylesCarrousel.js"), encoding="utf-8").read()
    assert back == front, "copier frontend/src/lib/stylesCarrousel.js dans backend/assets/styles_carrousel.js"


def test_styles_proposes_a_tous():
    for t in carrousel_service.STYLES_PARTAGES:
        assert t in carrousel_service.TEMPLATES and t not in carrousel_service.EXCLUSIFS


def test_contenu_ne_peut_pas_fermer_le_script():
    html = carrousel_service.build_html({"hook": "x </script><img src=x onerror=alert(1)>", "slides": [], "cta": {}},
                                        "#000", "#111", "#222", "M", "", "kraft")
    assert html.count("</script>") == 2 and "<\/script>" in html


def test_photos_stables_par_carrousel(monkeypatch):
    urls = [f"https://images.pexels.com/{i}.jpg" for i in range(20)]
    monkeypatch.setattr(pexels_service, "_rechercher", lambda q: urls)
    a = pexels_service.photos("Coaching", "contenu-1")
    assert a == pexels_service.photos("Coaching", "contenu-1") and len(a) == 5 and len(set(a)) == 5
    assert a != pexels_service.photos("Coaching", "contenu-2")


def test_sans_cle_pexels_aucune_photo(monkeypatch):
    monkeypatch.setattr(pexels_service, "PEXELS_API_KEY", "")
    pexels_service._CACHE.clear()
    assert pexels_service.photos("Coaching", "x") == []
