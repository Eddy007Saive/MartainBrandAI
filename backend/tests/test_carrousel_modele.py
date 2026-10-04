"""Modèles de carrousel créés dans l'éditeur : nettoyage du design et gabarit HTML."""
import re

import pytest

from services import carrousel_custom
from services import carrousel_modele_service as modeles

IMG = "https://res.cloudinary.com/demo/image/upload/v1/fond.jpg"


def _texte(role, text, y=100, **extra):
    return {"type": "texte", "role": role, "text": text, "x": 90, "y": y, "width": 900, "height": 200,
            "fontSize": 60, "fontFamily": "Sora", "fill": "#ffffff", "gras": True, "align": "left", **extra}


def _pages():
    return [
        {"fond": "#05060C", "fondImage": IMG, "elements": [
            _texte("nom", "Postorico", 40), _texte("compteur", "1/5", 40), _texte("accroche", "Ancienne accroche", 300),
            {"type": "image", "src": "/images/mascotte.png", "x": 300, "y": 600, "width": 400, "height": 400,
             "ombre": {"couleur": "#000000", "opacite": .6, "x": 0, "y": 30, "flou": 40}},
        ]},
        {"fond": "#05060C", "elements": [
            _texte("numero", "ÉTAPE 01", 200), _texte("titre", "Ancien titre", 300),
            _texte("texte", "Ancien texte", 500), _texte("fixe", "LE GESTE", 900, uneLigne=True), _texte("astuce", "Ancienne astuce", 950),
        ]},
        {"fond": "#111111", "degrade": {"angle": 160, "stops": [[0, "#5B6CFF"], [1, "#8A6CFF"]]}, "elements": [
            _texte("cta", "Ancien CTA", 400),
        ]},
    ]


def _propres():
    return [modeles._page(p, r, "u1", "perso-0123456789") for p, r in zip(_pages(), modeles.ROLES_PAGES)]


def test_gabarit_respecte_le_contrat_des_templates_importes():
    html = modeles.html_depuis_pages(_propres())
    assert carrousel_custom.valider(html) == []
    for m in ("{{hook}}", "{{titre}}", "{{texte}}", "{{pro_tip}}", "{{cta_titre}}", "{{nom}}", "{{index}}/{{total}}"):
        assert m in html
    assert "ÉTAPE {{numero}}" in html          # seul le nombre devient variable
    assert "LE GESTE" in html                   # texte fixe conservé
    assert "Ancien titre" not in html           # le texte d'exemple est remplacé
    assert "data-fit" in html
    assert "fonts.googleapis.com" in html and "font-family:'Sora'" in html
    # aucun guillemet double ne doit couper un attribut style="…"
    assert not re.search(r'style="[^"]*"(?![\s>/])', html)
    assert "/images/mascotte.png" in html and "drop-shadow" in html
    assert "linear-gradient(160deg" in html


def test_contenu_reel_injecte_et_etape_repetee():
    html = modeles.html_depuis_pages(_propres())
    contenu = {"hook": "Mon accroche", "slides": [{"titre": "Idée A", "texte": "Texte A"}, {"titre": "Idée B", "texte": "Texte B"}],
               "cta": {"titre": "Écris-moi"}}
    doc = carrousel_custom.construire(html, contenu, "#000", "#111", "#3AFFA3", "Ma marque", "", None)
    assert doc.count('class="slide"') == 4
    assert "Mon accroche" in doc and "Idée B" in doc and "Écris-moi" in doc
    assert "ÉTAPE 02" in doc and "1/4" in doc and "Ma marque" in doc
    assert "{{" not in doc


def test_valeurs_hostiles_neutralisees():
    pages = _pages()
    pages[0]["elements"].append(_texte("fixe", "<script>alert(1)</script>{{hook}}", fill="red;background:url(x)",
                                       fontFamily='Sora";}</style><script>'))
    pages[0]["elements"].append({"type": "image", "src": "https://evil.example/x.png", "x": 0, "y": 0, "width": 10, "height": 10})
    pages[0]["elements"].append({"type": "image", "src": "/../../etc/passwd", "x": 0, "y": 0, "width": 10, "height": 10})
    propres = [modeles._page(p, r, "u1", "perso-0123456789") for p, r in zip(pages, modeles.ROLES_PAGES)]
    html = modeles.html_depuis_pages(propres)
    assert "<script>" not in html and "evil.example" not in html and "passwd" not in html
    assert "background:url(x)" not in html
    assert html.count("{{hook}}") == 1          # un texte fixe ne peut pas injecter de marqueur


def test_role_hors_page_retombe_sur_fixe():
    p = modeles._page({"elements": [_texte("titre", "Pas un titre ici")]}, "couverture", "u1", "perso-0123456789")
    assert p["elements"][0]["role"] == "fixe"


def test_creation_refusee_sans_accroche(monkeypatch):
    import asyncio
    monkeypatch.setattr(modeles, "lister", lambda owner: [])
    pages = _pages()
    pages[0]["elements"] = [e for e in pages[0]["elements"] if e.get("role") != "accroche"]
    with pytest.raises(modeles.ModeleInvalide, match="accroche"):
        asyncio.run(modeles.creer("u1", "Mon modèle", pages))


def test_texte_fixe_sur_une_ligne_ne_passe_pas_a_la_ligne():
    html = modeles.html_depuis_pages(_propres())
    geste = re.search(r'<div data-fit[^>]*style="([^"]*)">LE GESTE</div>', html).group(1)
    titre = re.search(r'<div data-fit[^>]*style="([^"]*)">\{\{titre\}\}</div>', html).group(1)
    assert "white-space:nowrap" in geste
    assert "white-space:pre-wrap" in titre       # un texte de l'IA garde ses retours à la ligne


def test_logo_couleurs_de_marque_et_mots_en_couleur():
    pages = _pages()
    pages[0]["fondMarque"] = "principale"
    pages[0]["elements"].append({"type": "image", "role": "logo", "rond": True, "src": IMG,
                                 "x": 40, "y": 40, "width": 90, "height": 90})
    pages[0]["elements"][2].update(couleurMarque="accent", accentMots=2, accentCouleur="#3AFFA3", accentMarque="secondaire")
    propres = [modeles._page(p, r, "u1", "perso-0123456789") for p, r in zip(pages, modeles.ROLES_PAGES)]
    html = modeles.html_depuis_pages(propres)
    assert 'src="{{logo}}"' in html and "border-radius:50%" in html
    assert "background:var(--marque-p,#05060C)" in html
    assert "color:var(--marque-a,#ffffff)" in html
    assert 'data-accent-mots="2" data-accent="var(--marque-s,#3AFFA3)"' in html
    doc = carrousel_custom.construire(html, {"hook": "A B C", "slides": [{"titre": "T"}], "cta": {}},
                                      "#111111", "#222222", "#333333", "M", "", "https://res.cloudinary.com/x/logo.png")
    assert 'src="https://res.cloudinary.com/x/logo.png"' in doc
    assert "--marque-p:#111111;--marque-s:#222222;--marque-a:#333333;" in doc
    assert "data-accent-mots" in carrousel_custom.FIT_JS


def test_valeurs_de_marque_inconnues_ignorees():
    pages = _pages()
    pages[0]["fondMarque"] = "url(x)"
    pages[0]["elements"][2].update(couleurMarque="};body{", accentMots=99, accentMarque="x")
    p = modeles._page(pages[0], "couverture", "u1", "perso-0123456789")
    assert p["fondMarque"] is None
    acc = next(e for e in p["elements"] if e.get("role") == "accroche")
    assert acc["couleurMarque"] is None and acc["accentMarque"] is None and acc["accentMots"] == 5


def test_modifier_refuse_le_modele_d_un_autre(monkeypatch):
    import asyncio
    monkeypatch.setattr(modeles, "charger", lambda owner, tid: None)
    assert asyncio.run(modeles.modifier("u2", "perso-0123456789", "x", _pages())) is None


def test_police_choisie_appliquee_aux_titres_et_au_texte():
    from services.carrousel_service import _apply_font
    pages = _pages()
    pages[1]["elements"][2]["fontFamily"] = "Inter"   # le texte de l'étape dans une autre police
    pages[1]["elements"][4]["fontFamily"] = "Inter"   # l'astuce aussi
    html = modeles.html_depuis_pages([modeles._page(p, r, "u1", "perso-0123456789") for p, r in zip(pages, modeles.ROLES_PAGES)])
    assert 'data-police="titre"' in html and 'data-police="corps"' in html
    # « LE GESTE » (texte fixe en Sora, comme les titres) suit la police des titres
    assert re.search(r'data-police="titre" style="[^"]*">LE GESTE<', html)
    doc = carrousel_custom.construire(html, {"hook": "H", "slides": [{"titre": "T"}], "cta": {}}, "#000", "#111", "#222", "M", "", None)
    rendu = _apply_font(doc, "Anton|b", "Lora")
    assert "[data-police=titre]{font-family:'Anton',sans-serif !important;letter-spacing:normal !important;font-weight:700 !important;}" in rendu
    assert "[data-police=corps]{font-family:'Lora',sans-serif !important;letter-spacing:normal !important;}" in rendu
    assert rendu.index("<head><style>[data-police") < rendu.index("</head>")
    assert _apply_font(doc, None, None) == doc        # « Auto » : le modèle garde ses polices


def test_formes_dessinees_en_svg():
    pages = _pages()
    pages[0]["elements"] += [
        {"type": "forme", "forme": "rect", "x": 0, "y": 0, "width": 400, "height": 200, "fill": "#3AFFA3",
         "rayon": 30, "couleurMarque": "accent"},
        {"type": "forme", "forme": "etoile", "x": 0, "y": 0, "width": 300, "height": 300, "fill": "#ffffff",
         "stroke": "#000000", "strokeWidth": 6},
        {"type": "forme", "forme": "fleche", "x": 0, "y": 0, "width": 500, "height": 60, "stroke": "#ffffff", "strokeWidth": 10},
        {"type": "forme", "forme": "<script>", "x": 0, "y": 0, "width": 10, "height": 10},
    ]
    html = modeles.html_depuis_pages([modeles._page(p, r, "u1", "perso-0123456789") for p, r in zip(pages, modeles.ROLES_PAGES)])
    assert '<rect x="0" y="0" width="400" height="200" rx="30" style="fill:var(--marque-a,#3AFFA3);stroke:none"/>' in html
    assert "<polygon points=" in html and "stroke:#000000;stroke-width:6" in html
    assert '<path d="M0 30 L500 30 M475 5 L500 30 L475 55" style="fill:none;stroke:#ffffff;stroke-width:10' in html
    assert html.count("<svg ") == 3 and "<script>" not in html
