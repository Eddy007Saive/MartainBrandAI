"""
Templates de carrousel IMPORTÉS depuis le back-office.

Un template importé est un HTML qui décrit **trois** slides seulement ; le moteur
répète celle du milieu autant de fois que le contenu l'exige :

    <div class="slide" data-role="couverture"> … {{hook}} … </div>
    <div class="slide" data-role="etape">      … {{numero}} {{titre}} {{texte}} … </div>
    <div class="slide" data-role="final">      … {{cta_titre}} … </div>

Les couleurs de la marque arrivent en variables CSS (--principale, --secondaire,
--accent, --encre, --sourdine) : le même gabarit s'adapte donc à chaque client.

Sécurité : le HTML vient d'un humain de confiance (admin) mais il est rendu par un
navigateur **sur le serveur**. On retire donc scripts, iframes et gestionnaires
d'évènements — un template ne doit jamais exécuter de code ni appeler une URL
arbitraire depuis notre infrastructure.
"""
import re
import html as _html

from config import supabase, logger

# Marqueurs reconnus (documentés à l'identique dans l'écran d'import).
PLACEHOLDERS = {
    "commun": ["{{nom}}", "{{secteur}}", "{{logo}}", "{{index}}", "{{total}}"],
    "couverture": ["{{hook}}"],
    "etape": ["{{numero}}", "{{titre}}", "{{texte}}", "{{pills}}", "{{pro_tip}}"],
    "final": ["{{cta_titre}}", "{{cta_texte}}"],
}

_BALISES_INTERDITES = re.compile(
    r"<\s*(script|iframe|object|embed|form|input|button|meta|base)\b[^>]*>.*?<\s*/\s*\1\s*>|"
    r"<\s*(script|iframe|object|embed|form|input|meta|base)\b[^>]*/?>",
    re.I | re.S,
)
_ATTR_EVENT = re.compile(r"\son[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", re.I)
_URL_JS = re.compile(r"(href|src|action)\s*=\s*(\"|')?\s*javascript:[^\"'>\s]*", re.I)


def nettoyer(html: str) -> str:
    """Retire tout ce qui pourrait exécuter du code au moment du rendu."""
    out = _BALISES_INTERDITES.sub("", html or "")
    out = _ATTR_EVENT.sub("", out)
    out = _URL_JS.sub("", out)
    return out


def _bloc(html: str, role: str) -> str:
    """Extrait le bloc <div data-role="role"> … </div> en gérant les div imbriquées."""
    m = re.search(r'<div[^>]*data-role\s*=\s*["\']%s["\'][^>]*>' % role, html, re.I)
    if not m:
        return ""
    i, profondeur, pos = m.end(), 1, m.end()
    for tag in re.finditer(r"<\s*(/?)div\b[^>]*>", html[i:], re.I):
        profondeur += -1 if tag.group(1) else 1
        if profondeur == 0:
            pos = i + tag.start()
            return html[m.start():i + tag.end()]
    return html[m.start():pos]


def valider(html: str) -> list:
    """Renvoie la liste des problèmes bloquants (vide = template utilisable)."""
    erreurs = []
    for role in ("couverture", "etape", "final"):
        if not _bloc(html, role):
            erreurs.append(f'Bloc manquant : aucun élément avec data-role="{role}".')
    if "{{hook}}" not in html:
        erreurs.append("Le marqueur {{hook}} est absent : la couverture n'affichera aucun titre.")
    if "{{titre}}" not in html:
        erreurs.append("Le marqueur {{titre}} est absent : les slides d'étape seront vides.")
    return erreurs


def _remplacer(bloc: str, valeurs: dict) -> str:
    for cle, val in valeurs.items():
        bloc = bloc.replace("{{%s}}" % cle, val)
    # Un marqueur non fourni (ex. {{pro_tip}} sans pro tip) disparaît proprement.
    return re.sub(r"\{\{[a-z_]+\}\}", "", bloc)


def construire(html_gabarit: str, content, p, s, a, nom, secteur, logo, styles_globaux: str = "") -> str:
    """Assemble le document final : entête + N slides issues des 3 blocs du gabarit."""
    from services.carrousel_service import _parts, _esc, _pills, _acc_dark, _ink_on, _mix

    html_gabarit = nettoyer(html_gabarit)
    hook, slides, cta = _parts(content)
    n = 2 + len(slides)
    A = _acc_dark(a or "#3AFFA3")
    commun = {
        "nom": _esc(nom), "secteur": _esc(secteur), "total": str(n),
        "logo": logo or "",
    }

    b_cov, b_etape, b_fin = (_bloc(html_gabarit, r) for r in ("couverture", "etape", "final"))
    out = [_remplacer(b_cov, {**commun, "hook": _esc(hook), "index": "1"})]
    for i, sl in enumerate(slides):
        out.append(_remplacer(b_etape, {
            **commun,
            "numero": f"{i + 1:02d}",
            "titre": _esc(sl.get("titre")),
            "texte": _esc(sl.get("texte")),
            "pills": _pills(sl.get("pills")),
            "pro_tip": _esc(sl.get("pro_tip")),
            "index": str(i + 2),
        }))
    out.append(_remplacer(b_fin, {
        **commun, "cta_titre": _esc(cta["titre"]), "cta_texte": _esc(cta["texte"]), "index": str(n),
    }))

    # Tout ce qui précède le premier bloc (styles, polices) est conservé tel quel.
    tete = html_gabarit[:html_gabarit.find(b_cov)] if b_cov else html_gabarit
    variables = (
        ":root{"
        f"--principale:{p};--secondaire:{s};--accent:{A};"
        f"--encre:{_ink_on(p)};--sourdine:{_mix(_ink_on(p), p, .45)};"
        "}"
    )
    return (
        '<!DOCTYPE html><html><head><meta charset="utf-8">'
        f"<style>{variables}{styles_globaux}</style>{tete}</head><body>{''.join(out)}</body></html>"
    )


# ---------------------------------------------------------------- persistance
def lister() -> list:
    try:
        r = supabase.table("carrousel_templates_custom").select("id,label,preview_url,created_at") \
            .order("created_at", desc=True).execute()
        return r.data or []
    except Exception as e:
        logger.warning(f"carrousels custom: {e}")
        return []


def charger(tpl_id: str) -> dict | None:
    try:
        r = supabase.table("carrousel_templates_custom").select("*").eq("id", tpl_id).limit(1).execute()
        return r.data[0] if r.data else None
    except Exception as e:
        logger.warning(f"carrousel custom {tpl_id}: {e}")
        return None


def ids() -> set:
    return {t["id"] for t in lister()}


def enregistrer(tpl_id: str, label: str, html: str, preview_url: str | None, admin_id: str | None) -> dict:
    row = {"id": tpl_id, "label": label, "html": nettoyer(html), "created_by": admin_id}
    if preview_url:
        row["preview_url"] = preview_url
    supabase.table("carrousel_templates_custom").upsert(row, on_conflict="id").execute()
    return row


def supprimer(tpl_id: str) -> None:
    supabase.table("carrousel_templates_custom").delete().eq("id", tpl_id).execute()
