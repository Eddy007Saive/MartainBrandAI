"""
Story : décline un post en visuel VERTICAL plein écran (1080×1920, format 9:16)
prêt pour Instagram/Facebook. HTML brandé -> PNG via Playwright -> Cloudinary.

Même philosophie que le carrousel (carrousel_service) : le HTML des modèles est
FIXE, on n'injecte que le contenu (accroche, sous-texte, CTA) + les couleurs et le
logo de la marque. Le contraste texte/fond est calculé automatiquement pour rester
lisible. Objectif : un vrai reformatage 9:16 — jamais un carré recollé au milieu
avec des bandes vides.

MVP : rendu image seule, 4 modèles SOBRES (pas de mascotte). La story animée
(pipeline Remotion des reels) viendra ensuite.
"""
import asyncio
import os
import re
import json
from datetime import datetime, timedelta, timezone
import cloudinary
import cloudinary.uploader
from config import CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLAUDE_API_KEY, logger, supabase
from services.agent_service import _charger_marque, _messages_create, REGLES_ANTI_IA
# On réutilise tels quels les utilitaires du carrousel : contraste, couleurs, échappement,
# lockup de marque, application des polices, et l'atelier de rendu (sémaphore partagée).
from services.carrousel_service import (
    _esc, _av_span, _lighten, _mix, _near, _ink_on, _acc_light, _acc_dark,
    _apply_font, _rendre, AtelierSature,
)

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)

# 360×640 × 3 = 1080×1920 (9:16 exact, la taille attendue par les stories)
STORY_W, STORY_H, DSF = 360, 640, 3

# Modèles proposés dans le sélecteur (ordre d'affichage).
# `image`: True => le modèle a BESOIN du visuel du post (proposé seulement si le post en a un).
# Les modèles texte restent disponibles même sans visuel.
TEMPLATES = [
    {"id": "epure",     "label": "Épuré",     "hint": "Clair, minimal, accroche en grand",        "image": False},
    {"id": "sombre",    "label": "Sombre",    "hint": "Fond profond, accent lumineux",            "image": False},
    {"id": "editorial", "label": "Éditorial", "hint": "Serif élégant, filets fins",               "image": False},
    {"id": "bloc",      "label": "Bloc",      "hint": "Aplat de couleur, titre massif",           "image": False},
    {"id": "photo",     "label": "Photo",     "hint": "Visuel plein cadre, texte en surimpression","image": True},
    {"id": "photo-flou","label": "Photo (entière)","hint": "Visuel entier + fond flouté, aucune bande vide","image": True},
    {"id": "split",     "label": "Photo + bloc","hint": "Visuel en haut, texte à la charte en bas","image": True},
    {"id": "liste",     "label": "Liste",     "hint": "Jusqu'à 4 points clés + CTA",              "image": False},
    {"id": "citation",  "label": "Citation",  "hint": "Grande citation extraite + attribution",   "image": False},
    {"id": "rico",      "label": "Rico",      "hint": "La mascotte Postorico, fond clair de marque","image": False, "rico": True},
    {"id": "signature", "label": "Signature", "hint": "Riche : Rico, 3 arguments, CTA (maison)","image": False, "rico": True},
]
TEMPLATE_IDS = [t["id"] for t in TEMPLATES]

# Valeurs de départ du modèle « signature » (blocs qu'un post ne fournit pas) :
# l'utilisateur les édite à la retouche. Copie Postorico par défaut (modèle maison).
DEFAULT_SIGNATURE = {
    "points": [
        {"titre": "La [vitesse] d'un logiciel", "desc": "Contenu prêt à publier.", "icon": "eclair"},
        {"titre": "La [qualité] d'une agence", "desc": "Ton calibré. Marque respectée.", "icon": "etoile"},
        {"titre": "Le [contrôle] d'un patron", "desc": "Tu valides, tu pilotes.", "icon": "bouclier"},
    ],
    "baseline": "10x moins cher qu'une agence. [2h par mois]. Maximum.",
}


def templates_story(a_un_visuel: bool = True) -> list:
    """Modèles proposables. Sans visuel de post, on masque les modèles qui en ont besoin."""
    return [t for t in TEMPLATES if a_un_visuel or not t["image"]]


def modeles_pour(telegram_id: str, a_un_visuel: bool) -> list:
    """Modèles proposés à CE compte :
    - les modèles « photo » seulement si le post a un visuel ;
    - le modèle « Rico » (maison) seulement si le compte a droit à la mascotte
      (mêmes comptes que les carrousels Rico, via carrousel_templates_exclusifs)."""
    try:
        from services.carrousel_service import _exclusifs_du_compte
        rico_ok = bool(_exclusifs_du_compte(telegram_id) & {"rico-studio", "rico-scene", "postorico"})
    except Exception as e:
        logger.warning(f"droits Rico story {telegram_id}: {e}")
        rico_ok = False
    out = []
    for t in TEMPLATES:
        if t["image"] and not a_un_visuel:
            continue
        if t.get("rico") and not rico_ok:
            continue
        out.append(t)
    return out


def template_valide(template: str) -> str:
    t = (template or "epure").lower()
    return t if t in TEMPLATE_IDS else "epure"


def _phrase(txt: str) -> str:
    """Première phrase « propre » d'un texte de post, pour le sous-titre de la story."""
    t = re.sub(r"\s+", " ", (txt or "").strip())
    if not t:
        return ""
    m = re.split(r"(?<=[.!?…])\s", t)
    s = (m[0] if m else t).strip()
    if len(s) > 120:
        s = s[:118].rstrip() + "…"
    return s


def parts_depuis_contenu(contenu: dict) -> dict:
    """Dérive {accroche, sous, cta} depuis un post existant.

    L'accroche est le titre (ou la première phrase à défaut) ; le sous-texte est une
    phrase de soutien ; le CTA est un appel à réagir (la story permet le DM / le lien,
    contrairement au feed)."""
    titre = (contenu.get("titre") or "").strip()
    corps = (contenu.get("contenu") or "").strip()
    hook = titre or _phrase(corps)
    sous = "" if titre == "" else _phrase(corps)
    if sous and hook and sous[:40].lower() == hook[:40].lower():
        sous = ""  # évite de répéter le titre en sous-titre
    # Garde-fou : un fragment trop court (« Tu postes. ») ne fait pas un sous-titre.
    if sous and len(sous.split()) < 5:
        sous = ""
    return {"accroche": hook, "sous": sous, "cta": "Réponds en DM 👉",
            "image": contenu.get("lien_visuel") or None}


def texte_story_ia(telegram_id: str, contenu: dict) -> dict:
    """Écrit le TEXTE de la story (accroche + sous-titre + CTA) à partir du post, dans
    la voix de marque — une story = UNE idée reformulée, pas le titre recopié.
    Retombe sur la dérivation heuristique si l'IA est indisponible."""
    base = parts_depuis_contenu(contenu)
    post = ((contenu.get("titre") or "") + "\n\n" + (contenu.get("contenu") or "")).strip()
    if not CLAUDE_API_KEY or not post:
        return base
    try:
        u = _charger_marque(telegram_id)
        system = (
            "Tu écris le TEXTE d'une story Instagram/Facebook à partir d'un post existant. "
            "Une story = UNE idée, reformulée pour la story — surtout PAS le titre du post recopié.\n"
            "Donne exactement :\n"
            "- accroche : très courte et qui claque, 4 à 8 mots, sans guillemets, sans point final ;\n"
            "- sous : UNE phrase de soutien de 8 à 14 mots, ou chaîne vide si rien d'utile "
            "(jamais un fragment de 2-3 mots) ;\n"
            "- cta : appel à l'action bref adapté à une story (ex. « Réponds en DM », « Écris-moi VOIX »).\n"
            f"Voix de marque : {u.get('voix_marque') or '—'}. Secteur : {u.get('secteur') or '—'}.\n"
            'Réponds STRICTEMENT en JSON : {"accroche": "...", "sous": "...", "cta": "..."}.'
            + REGLES_ANTI_IA
        )
        resp = _messages_create(
            model="claude-haiku-4-5", max_tokens=300, system=system,
            messages=[{"role": "user", "content": f"Post :\n\n{post}\n\nÉcris le texte de la story."}],
        )
        brut = "".join(b.text for b in resp.content if b.type == "text").strip()
        m = re.search(r"\{.*\}", brut, re.S)
        data = json.loads(m.group(0) if m else brut)
        acc = (data.get("accroche") or "").strip().strip('"').strip()
        sous = (data.get("sous") or "").strip()
        cta = (data.get("cta") or "").strip()
        if sous and len(sous.split()) < 4:
            sous = ""
        return {
            "accroche": acc or base["accroche"],
            "sous": sous,
            "cta": cta or base["cta"] or "Réponds en DM 👉",
            "image": contenu.get("lien_visuel") or None,
        }
    except Exception as e:
        logger.warning(f"texte story IA {telegram_id}: {e}")
        return base


# Gabarits proposables au choix automatique de l'IA : les génériques (texte, photo,
# liste, citation), jamais « rico »/« signature » — la mascotte reste un choix
# explicite du compte (pose + droit d'accès), pas une décision de contenu.
_CANDIDATS_IA = {"epure", "sombre", "editorial", "bloc", "photo", "photo-flou", "split", "liste", "citation"}


def choisir_story_ia(telegram_id: str, contenu: dict) -> dict:
    """Laisse l'IA choisir le GABARIT le plus adapté au contenu (pas seulement le texte) :
    une liste de points reste une liste, une punchline devient une citation, un post
    avec visuel peut devenir un plein cadre. Retombe sur le choix par défaut actuel
    (photo-flou si visuel sinon épuré) si l'IA est indisponible ou hors clous."""
    a_un_visuel = bool(contenu.get("lien_visuel"))
    defaut_id = "photo-flou" if a_un_visuel else "epure"
    base = parts_depuis_contenu(contenu)
    base_out = {**base, "template": defaut_id, "points": None}
    post = ((contenu.get("titre") or "") + "\n\n" + (contenu.get("contenu") or "")).strip()
    if not CLAUDE_API_KEY or not post:
        return base_out
    try:
        candidats = [t for t in modeles_pour(telegram_id, a_un_visuel)
                     if t["id"] in _CANDIDATS_IA]
        if not candidats:
            return base_out
        catalogue = "\n".join(f"- {t['id']} : {t['hint']}" for t in candidats)
        u = _charger_marque(telegram_id)
        system = (
            "Tu prépares une story Instagram/Facebook (9:16) à partir d'un post existant. "
            "Deux décisions : quel GABARIT convient le mieux à ce contenu, et le texte qui va dedans.\n\n"
            f"Gabarits disponibles :\n{catalogue}\n\n"
            "Le gabarit texte/photo classique (epure, sombre, editorial, bloc, photo, photo-flou, split) "
            "est le choix PAR DÉFAUT — c'est lui qui convient à un post qui développe UNE idée, "
            "un raisonnement, une anecdote ou un script de Reel, même s'il mentionne plusieurs éléments "
            "au passage. C'est le cas la plupart du temps.\n"
            "N'utilise 'liste' QUE si le post énumère déjà, explicitement et structurellement, 2 à 4 "
            "éléments séparés du même ordre (des étapes numérotées, une checklist, des options qu'on "
            "compare). Ne découpe JAMAIS un paragraphe continu ou un raisonnement en puces artificielles "
            "pour remplir le gabarit 'liste' — si tu dois inventer des titres de puces qui ne sont pas "
            "déjà des unités séparées dans le post, ce n'est PAS une liste, choisis un gabarit texte.\n"
            "N'utilise 'citation' QUE si UNE phrase du post, prise telle quelle mot pour mot, fonctionne "
            "seule sortie de son contexte comme une punchline complète (pas une phrase tronquée ou "
            "réécrite).\n\n"
            "Réponds STRICTEMENT en JSON, dont les clés dépendent du gabarit choisi :\n"
            '- texte/photo (epure, sombre, editorial, bloc, photo, photo-flou, split) : '
            '{"template":"...", "accroche":"4 à 8 mots, sans guillemets", '
            '"sous":"UNE phrase de 8 à 14 mots ou chaîne vide", "cta":"appel à l\'action bref"}\n'
            '- liste : {"template":"liste", "accroche":"4 à 8 mots", '
            '"points":[{"titre":"2 à 4 mots","desc":"5 à 9 mots MAX, jamais une phrase complète"}, '
            '... 2 à 4 items], "cta":"appel à l\'action bref"} — desc est un fragment, pas une phrase : '
            'la carte est petite, un texte trop long déborde et casse le rendu.\n'
            '- citation : {"template":"citation", "accroche":"la citation elle-même, mot pour mot, '
            'telle qu\'écrite dans le post", "sous":"attribution courte (ex. « Extrait du post »)"}\n'
            f"Voix de marque : {u.get('voix_marque') or '—'}. Secteur : {u.get('secteur') or '—'}."
            + REGLES_ANTI_IA
        )
        resp = _messages_create(
            model="claude-haiku-4-5", max_tokens=500, system=system,
            messages=[{"role": "user", "content": f"Post :\n\n{post}\n\nChoisis le gabarit et écris le texte."}],
        )
        brut = "".join(b.text for b in resp.content if b.type == "text").strip()
        m = re.search(r"\{.*\}", brut, re.S)
        data = json.loads(m.group(0) if m else brut)
        tpl = (data.get("template") or "").strip().lower()
        if tpl not in {t["id"] for t in candidats}:
            tpl = defaut_id
        acc = (data.get("accroche") or "").strip().strip('"').strip() or base["accroche"]
        sous = (data.get("sous") or "").strip()
        cta = (data.get("cta") or "").strip()
        points = None
        if tpl == "liste":
            bruts = data.get("points") if isinstance(data.get("points"), list) else []
            # Garde-fou dur (au cas où le modèle dépasse la consigne) : la carte est petite,
            # un fragment trop long déborde de sa zone fixe plutôt que d'être tronqué proprement.
            def _court(t, n):
                t = (t or "").strip()
                return t if len(t) <= n else t[:n - 1].rstrip() + "…"
            points = [{"titre": _court(p.get("titre"), 28), "desc": _court(p.get("desc"), 48)}
                      for p in bruts if isinstance(p, dict) and (p.get("titre") or "").strip()][:4]
            if len(points) < 2:
                tpl = defaut_id  # pas assez de points valides : retombe sur un gabarit texte
                points = None
        if sous and tpl != "citation" and len(sous.split()) < 4:
            sous = ""
        return {
            "template": tpl,
            "accroche": acc,
            "sous": sous or (base["sous"] if tpl == defaut_id else ""),
            "cta": cta or base["cta"] or "Réponds en DM 👉",
            "points": points,
            "image": contenu.get("lien_visuel") or None,
        }
    except Exception as e:
        logger.warning(f"choix story IA {telegram_id}: {e}")
        return base_out


# Gabarits proposables pour une SÉRIE : uniquement texte/photo, jamais liste/
# citation/rico/signature — une liste ou une citation répétée sur 3 écrans n'a
# pas de sens narratif, et rico reste un choix explicite du compte.
_CANDIDATS_SERIE = {"epure", "sombre", "editorial", "bloc", "photo", "photo-flou", "split"}


def decouper_story_ia(telegram_id: str, contenu: dict) -> dict:
    """Découpe un post riche en 2 à 4 stories qui se lisent à la suite (Instagram
    n'a pas de story multi-écrans — ce sont plusieurs stories du même compte
    postées proches dans le temps). UN SEUL gabarit texte/photo, partagé par tous
    les écrans pour la cohérence visuelle de la série ; chaque écran développe UNE
    étape d'un raisonnement qui progresse, le dernier porte le CTA.
    Retombe sur un seul écran (choisir_story_ia) si l'IA est indisponible ou si
    elle ne renvoie pas assez d'écrans exploitables — dégrade, n'échoue jamais."""
    a_un_visuel = bool(contenu.get("lien_visuel"))
    defaut_id = "photo-flou" if a_un_visuel else "epure"
    base = parts_depuis_contenu(contenu)
    repli_un_ecran = {"template": defaut_id, "ecrans": [
        {"accroche": base["accroche"], "sous": base["sous"], "cta": base["cta"]}]}
    post = ((contenu.get("titre") or "") + "\n\n" + (contenu.get("contenu") or "")).strip()
    if not CLAUDE_API_KEY or not post:
        return repli_un_ecran
    try:
        candidats = [t for t in modeles_pour(telegram_id, a_un_visuel)
                     if t["id"] in _CANDIDATS_SERIE]
        if not candidats:
            return repli_un_ecran
        catalogue = "\n".join(f"- {t['id']} : {t['hint']}" for t in candidats)
        u = _charger_marque(telegram_id)
        system = (
            "Tu découpes un post en une SÉRIE de stories Instagram/Facebook (9:16) "
            "qui se lisent à la suite — pas une story unique, plusieurs stories "
            "postées l'une après l'autre. 2 à 4 écrans selon la matière du post : "
            "ne force pas 4 écrans si le post ne tient qu'en 2 idées.\n\n"
            f"Gabarits disponibles (UN SEUL choisi, partagé par tous les écrans) :\n{catalogue}\n\n"
            "Chaque écran développe UNE étape qui fait progresser le raisonnement — "
            "jamais deux écrans qui répètent la même idée reformulée. Le dernier "
            "écran conclut et porte le CTA le plus fort ; les écrans précédents "
            "peuvent avoir un CTA vide ou implicite (« Swipe pour la suite » par "
            "exemple) si ça sert mieux la progression.\n\n"
            "Réponds STRICTEMENT en JSON :\n"
            '{"template":"...", "ecrans":[{"accroche":"4 à 8 mots, sans guillemets", '
            '"sous":"UNE phrase de 8 à 14 mots ou chaîne vide", "cta":"appel à l\'action bref ou vide"}, '
            '... 2 à 4 items]}\n'
            f"Voix de marque : {u.get('voix_marque') or '—'}. Secteur : {u.get('secteur') or '—'}."
            + REGLES_ANTI_IA
        )
        resp = _messages_create(
            model="claude-haiku-4-5", max_tokens=800, system=system,
            messages=[{"role": "user", "content": f"Post :\n\n{post}\n\nDécoupe-le en série de stories."}],
        )
        brut = "".join(b.text for b in resp.content if b.type == "text").strip()
        m = re.search(r"\{.*\}", brut, re.S)
        data = json.loads(m.group(0) if m else brut)
        tpl = (data.get("template") or "").strip().lower()
        if tpl not in {t["id"] for t in candidats}:
            tpl = defaut_id
        bruts = data.get("ecrans") if isinstance(data.get("ecrans"), list) else []
        ecrans = []
        for e in bruts:
            if not isinstance(e, dict):
                continue
            acc = (e.get("accroche") or "").strip().strip('"').strip()
            if not acc:
                continue
            sous = (e.get("sous") or "").strip()
            if sous and len(sous.split()) < 4:
                sous = ""
            ecrans.append({"accroche": acc, "sous": sous, "cta": (e.get("cta") or "").strip()})
        ecrans = ecrans[:4]
        if len(ecrans) < 2:
            return repli_un_ecran  # pas assez d'écrans exploitables : une seule story plutôt qu'une série boiteuse
        # Le dernier écran porte le CTA le plus fort : jamais vide, retombe sur le post si l'IA l'a laissé vide.
        if not ecrans[-1]["cta"]:
            ecrans[-1]["cta"] = base["cta"] or "Réponds en DM 👉"
        return {"template": tpl, "ecrans": ecrans}
    except Exception as e:
        logger.warning(f"decoupage story IA {telegram_id}: {e}")
        return repli_un_ecran


def a_deja_une_story(telegram_id: str, contenu_id: str) -> bool:
    """Un post ne peut avoir qu'UNE story active a la fois (simple/serie/animee).
    Requete live, pas de flag : si la story est supprimee (DELETE reel, voir
    contenu_service.delete_contenu), cette ligne disparait et le post redevient
    declinable sans rien a faire de plus."""
    try:
        r = (supabase.table("contenu").select("id")
             .eq("telegram_id", telegram_id).eq("story_source_id", contenu_id).limit(1).execute())
        return bool(r.data)
    except Exception:
        return False  # colonne pas encore migree / erreur reseau -> ne bloque pas


async def creer_serie_stories(telegram_id: str, contenu_id: str) -> dict:
    """Découpe un post en 2-4 stories (decouper_story_ia), les rend et les crée
    en base « À valider » — comme une story simple, la programmation Zernio
    reste un pas séparé déclenché par le compte (« Valider & programmer »),
    donc rien à orchestrer de ce côté ici. Retourne {"ids": [...], "count": n}
    ou {"error": "..."}."""
    from services import planning_service, quota_service
    res = supabase.table("contenu").select("*").eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    if not res.data:
        return {"error": "Contenu introuvable."}
    cur = res.data[0]
    if cur.get("reseau_cible") not in ("Instagram", "Facebook"):
        return {"error": "Les stories ne sont possibles que sur Instagram ou Facebook."}
    if a_deja_une_story(telegram_id, contenu_id):
        return {"error": "Ce post a déjà une story. Supprime-la pour en refaire une.", "conflict": True}

    # Réserve le pire cas (4 écrans) AVANT de dépenser quoi que ce soit — on ne
    # connaît le nombre réel qu'après le découpage IA — puis rembourse la
    # différence une fois ce nombre connu (voir plus bas).
    q = quota_service.consume(telegram_id, "story", qty=4)
    if not q.get("ok"):
        return {"error": q.get("message") or "Quota story épuisé.", "quota": True}

    decoupe = decouper_story_ia(telegram_id, cur)
    template = template_valide(decoupe["template"])
    ecrans = decoupe["ecrans"]
    n = len(ecrans)

    slides = cur.get("slides_images") or []
    titre_source = (cur.get("titre") or "").strip()
    reseau = cur["reseau_cible"]

    # Un seul créneau pour toute la série (prochain_creneau est déterministe pour
    # un même (compte, réseau, famille, jour) tant que rien n'est inséré entre
    # deux appels) ; chaque écran est ensuite décalé de 90s pour garantir l'ordre
    # d'affichage (aucune garantie d'ordre côté API Zernio/Instagram).
    creneau = planning_service.prochain_creneau(telegram_id, reseau, "Story")
    creneau_dt = datetime.fromisoformat(creneau) if creneau else None

    ids = []
    for i, ecran in enumerate(ecrans):
        image = slides[i % len(slides)] if slides else cur.get("lien_visuel")
        content = {"accroche": ecran["accroche"], "sous": ecran["sous"], "cta": ecran["cta"], "image": image}
        try:
            # Index préfixé AVANT troncature : generer_story tronque contenu_id à
            # 16 caractères pour le public_id Cloudinary — sans ce préfixe, les
            # écrans partageraient le même public_id et s'écraseraient entre eux.
            render_res = await generer_story(telegram_id, content, template, colors=None,
                                              contenu_id=f"{i}{contenu_id}")
        except AtelierSature:
            break  # rendus saturés : on garde ce qui a déjà été créé plutôt que tout perdre
        image_url = render_res.get("image")
        if not image_url:
            logger.warning(f"serie story ecran {i} rendu echoue, {telegram_id}")
            continue
        row = {
            "telegram_id": telegram_id,
            "titre": f"{titre_source[:100]} — écran {i + 1}/{n}" if titre_source else f"Story {i + 1}/{n}",
            # Texte PROPRE à cet écran, jamais le post source verbatim : Late
            # rejette un post dont le texte est identique à un post récent du
            # même compte (garde-fou anti-doublon, voir _story_contenu ailleurs).
            "contenu": (ecran["accroche"] + (f" — {ecran['sous']}" if ecran["sous"] else "")).strip(),
            "lien_visuel": image_url,
            "reseau_cible": reseau,
            "type": "Story",
            "statut": "A valider",
            # Relie les 2-4 lignes pour l'affichage groupé côté frontend (une
            # carte, badge "N écrans") — réutilise l'id du post source, pas de
            # nouvel UUID à générer. NULL pour tout contenu hors-série.
            "serie_id": contenu_id,
            # Meme valeur que serie_id ici, mais un role different : story_source_id
            # sert a bloquer un second declin du post (a_deja_une_story), pas a
            # grouper l'affichage (voir Contexte migrations/story_source.sql).
            "story_source_id": contenu_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if creneau_dt:
            row["date_publication"] = (creneau_dt + timedelta(seconds=90 * i)).isoformat()
        try:
            ins = supabase.table("contenu").insert(row).execute()
        except Exception as e:
            # Colonnes serie_id/story_source_id pas encore migrees : on degrade
            # proprement plutot que de perdre tout le rendu deja fait.
            if any(m in str(e) for m in ("PGRST204", "42703", "does not exist", "schema cache")):
                row.pop("serie_id", None)
                row.pop("story_source_id", None)
                ins = supabase.table("contenu").insert(row).execute()
            else:
                raise
        new_id = ins.data[0]["id"] if ins.data else None
        if new_id:
            ids.append(new_id)

    manques = 4 - len(ids)
    if manques > 0:
        quota_service.refund({**q, "qty": manques})
    if not ids:
        return {"error": "Le rendu de la série a échoué, réessaie."}
    quota_service.confirm({**q, "qty": len(ids)})
    return {"ids": ids, "count": len(ids), "serie_id": contenu_id}


def _fit(text: str, base: int, seuils=((26, 1.0), (40, 0.82), (58, 0.66), (999, 0.54))) -> int:
    n = len((text or ""))
    for lim, f in seuils:
        if n <= lim:
            return round(base * f)
    return round(base * 0.5)


def _lockup(logo, nom, secteur, ink, mut, accent):
    # Le compte (nom + photo) s'affiche déjà nativement en haut de la story sur
    # Instagram/Facebook : un bloc marque dans l'image ferait doublon. On l'omet.
    return ""


def _doc(head, css, body):
    return f'<!DOCTYPE html><html><head><meta charset="utf-8">{head}{css}</head><body>{body}</body></html>'


# =============================================================================
# Modèle « Épuré » — fond clair teinté marque, accroche noire massive, CTA chip
# =============================================================================
def _tpl_epure(c, p, s, a, nom, secteur, logo):
    A = a or "#3AFFA3"; Aink = _ink_on(A); accL = _acc_light(A)
    BG = _lighten(p or "#003D2E", .95); INK = "#151a17"; MUT = "rgba(0,0,0,.5)"
    head = '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
    css = f'''<style>*{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:'Plus Jakarta Sans',sans-serif}}
  .story{{width:{STORY_W}px;height:{STORY_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;
    padding:64px 40px 72px;background:{BG};color:{INK}}}
  .story::after{{content:"";position:absolute;right:-90px;top:-90px;width:280px;height:280px;border-radius:50%;
    background:radial-gradient(circle,{_mix(A,BG,.35)},transparent 70%);opacity:.5}}
  .mid{{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;justify-content:center}}
  h1{{font-weight:800;line-height:1.08;letter-spacing:-.6px;color:{INK}}}
  .sous{{font-size:17px;line-height:1.5;color:{MUT};margin-top:18px;max-width:92%}}
  .cta{{position:relative;z-index:2;display:inline-flex;align-items:center;align-self:flex-start;gap:8px;background:{A};color:{Aink};
    font-weight:800;font-size:16px;padding:14px 24px;border-radius:30px;margin-top:22px}}
  .lockup{{position:relative;z-index:2;display:flex;align-items:center;gap:11px;margin-top:26px}}
  .av{{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:17px;overflow:hidden}}
  .lk-nm{{font-size:16px;font-weight:800}} .lk-hd{{font-size:12.5px}}
</style>'''
    sous = f'<div class="sous">{_esc(c["sous"])}</div>' if c.get("sous") else ""
    body = (f'<div class="story">'
            f'<div class="mid"><h1 style="font-size:{_fit(c["accroche"],46)}px">{_esc(c["accroche"])}</h1>{sous}'
            f'<span class="cta">{_esc(c["cta"])}</span></div>'
            f'{_lockup(logo, nom, secteur, INK, MUT, A)}</div>')
    return _doc(head, css, body)


# =============================================================================
# Modèle « Sombre » — fond profond teinté marque, texte blanc, accent lumineux
# =============================================================================
def _tpl_sombre(c, p, s, a, nom, secteur, logo):
    A = a or "#3AFFA3"; accD = _acc_dark(A)
    NEAR = _near(p or "#003D2E"); grad = f"linear-gradient(160deg,{NEAR},{_mix(NEAR, A, .16)})"
    INK = "#ffffff"; MUT = "rgba(255,255,255,.66)"
    head = '<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">'
    css = f'''<style>*{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .story{{width:{STORY_W}px;height:{STORY_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;
    padding:64px 40px 72px;background:{grad};color:{INK}}}
  .story::after{{content:"";position:absolute;left:-110px;bottom:60px;width:320px;height:320px;border-radius:50%;
    background:radial-gradient(circle,{accD}33,transparent 70%);pointer-events:none}}
  .mid{{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;justify-content:center}}
  h1{{font-family:Sora;font-weight:800;line-height:1.04;letter-spacing:-.5px}}
  .accent{{color:{accD}}}
  .sous{{font-size:17px;line-height:1.55;color:{MUT};margin-top:18px;max-width:92%}}
  .cta{{position:relative;z-index:2;align-self:flex-start;display:inline-flex;align-items:center;gap:8px;background:{accD};
    color:{_ink_on(accD)};font-family:Sora;font-weight:800;font-size:16px;padding:14px 24px;border-radius:12px;margin-top:22px}}
  .lockup{{position:relative;z-index:2;display:flex;align-items:center;gap:11px;margin-top:26px}}
  .av{{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;font-family:Sora;font-weight:800;font-size:17px;overflow:hidden}}
  .lk-nm{{font-size:16px;font-weight:700}} .lk-hd{{font-size:12.5px}}
</style>'''
    # accent sur les derniers mots de l'accroche
    words = (c["accroche"] or "").split(" ")
    if len(words) >= 3:
        cut = len(words) - max(1, len(words) // 3)
        acc_html = _esc(" ".join(words[:cut])) + ' <span class="accent">' + _esc(" ".join(words[cut:])) + "</span>"
    else:
        acc_html = f'<span class="accent">{_esc(c["accroche"])}</span>'
    sous = f'<div class="sous">{_esc(c["sous"])}</div>' if c.get("sous") else ""
    body = (f'<div class="story">'
            f'<div class="mid"><h1 style="font-size:{_fit(c["accroche"],44)}px">{acc_html}</h1>{sous}'
            f'<span class="cta">{_esc(c["cta"])}</span></div>'
            f'{_lockup(logo, nom, secteur, INK, MUT, accD)}</div>')
    return _doc(head, css, body)


# =============================================================================
# Modèle « Éditorial » — crème, serif Fraunces, filets fins, sobre et haut de gamme
# =============================================================================
def _tpl_editorial(c, p, s, a, nom, secteur, logo):
    A = a or "#3AFFA3"; accL = _acc_light(A)
    BG = _lighten(p or "#003D2E", .94); INK = "#1a201d"; MUT = "rgba(0,0,0,.55)"
    head = '<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">'
    css = f'''<style>*{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .story{{width:{STORY_W}px;height:{STORY_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;
    padding:66px 42px 74px;background:{BG};color:{INK}}}
  .mid{{flex:1;display:flex;flex-direction:column;justify-content:center}}
  h1{{font-family:Fraunces;font-weight:600;line-height:1.1;letter-spacing:-.2px}}
  .sous{{font-size:16px;line-height:1.6;color:{MUT};margin-top:20px;max-width:94%}}
  .cta{{align-self:flex-start;display:inline-block;margin-top:24px;padding:11px 22px;border-radius:30px;font-size:14px;
    font-weight:600;border:1.5px solid {accL};color:{accL}}}
  .lockup{{display:flex;align-items:center;gap:11px}}
  .av{{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-family:Fraunces;font-weight:600;font-size:16px;overflow:hidden}}
  .lk-nm{{font-size:15px;font-weight:600;font-family:Fraunces}} .lk-hd{{font-size:12px}}
</style>'''
    sous = f'<div class="sous">{_esc(c["sous"])}</div>' if c.get("sous") else ""
    body = (f'<div class="story">'
            f'<div class="mid"><h1 style="font-size:{_fit(c["accroche"],40)}px">{_esc(c["accroche"])}</h1>{sous}'
            f'<span class="cta">{_esc(c["cta"])}</span></div></div>')
    return _doc(head, css, body)


# =============================================================================
# Modèle « Bloc » — aplat de couleur d'accent plein cadre, titre condensé massif
# =============================================================================
def _tpl_bloc(c, p, s, a, nom, secteur, logo):
    A = a or "#3AFFA3"; Aink = _ink_on(A)
    head = '<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
    css = f'''<style>*{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .story{{width:{STORY_W}px;height:{STORY_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;
    padding:60px 40px 70px;background:{A};color:{Aink}}}
  .mid{{flex:1;display:flex;flex-direction:column;justify-content:center}}
  h1{{font-family:Anton;line-height:.98;letter-spacing:.4px;text-transform:uppercase}}
  .sous{{font-size:16px;line-height:1.5;font-weight:500;margin-top:18px;max-width:92%;opacity:.86}}
  .cta{{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;background:{Aink};color:{A};font-family:Anton;
    font-size:16px;letter-spacing:.5px;padding:13px 24px;border-radius:8px;margin-top:22px;text-transform:uppercase}}
  .lockup{{display:flex;align-items:center;gap:11px}}
  .av{{width:38px;height:38px;border-radius:50%;background:{Aink};color:{A};display:grid;place-items:center;font-family:Anton;font-size:17px;overflow:hidden}}
  .lk-nm{{font-size:16px;font-weight:700}} .lk-hd{{font-size:12.5px;opacity:.8}}
</style>'''
    sous = f'<div class="sous">{_esc(c["sous"])}</div>' if c.get("sous") else ""
    body = (f'<div class="story">'
            f'<div class="mid"><h1 style="font-size:{_fit(c["accroche"],56)}px">{_esc(c["accroche"])}</h1>{sous}'
            f'<span class="cta">{_esc(c["cta"])}</span></div>'
            f'{_lockup(logo, nom, secteur, Aink, Aink, Aink)}</div>')
    return _doc(head, css, body)


# =============================================================================
# Modèle « Photo » — visuel du post PLEIN CADRE, voile dégradé, texte en surimpression
# =============================================================================
def _tpl_photo(c, p, s, a, nom, secteur, logo):
    A = a or "#3AFFA3"; Aink = _ink_on(A); accD = _acc_dark(A)
    img = c.get("image") or ""
    head = '<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">'
    css = f'''<style>*{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .story{{width:{STORY_W}px;height:{STORY_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;
    justify-content:flex-end;padding:0;background:#0b1020;color:#fff}}
  .photo{{position:absolute;inset:0;background:url('{img}') center/cover no-repeat}}
  /* Voile dégradé bas -> haut : le texte reste lisible quelle que soit la photo */
  .scrim{{position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,10,20,.10) 0%,rgba(6,10,20,0) 34%,rgba(6,10,20,.72) 74%,rgba(6,10,20,.92) 100%)}}
  .body{{position:relative;z-index:3;padding:0 40px 68px}}
  h1{{font-family:Sora;font-weight:800;line-height:1.05;letter-spacing:-.5px;text-shadow:0 2px 22px rgba(0,0,0,.5)}}
  .accent{{color:{accD}}}
  .sous{{font-size:16px;line-height:1.5;color:rgba(255,255,255,.85);margin-top:14px;max-width:92%;text-shadow:0 1px 14px rgba(0,0,0,.5)}}
  .cta{{display:inline-flex;align-items:center;gap:8px;background:{A};color:{Aink};font-family:Sora;font-weight:800;font-size:16px;padding:14px 24px;border-radius:12px;margin-top:20px}}
  .lockup{{display:flex;align-items:center;gap:11px;margin-top:22px}}
  .av{{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-family:Sora;font-weight:800;font-size:16px;overflow:hidden}}
  .lk-nm{{font-size:15px;font-weight:700}} .lk-hd{{font-size:12px;color:rgba(255,255,255,.7)}}
</style>'''
    words = (c["accroche"] or "").split(" ")
    if len(words) >= 3:
        cut = len(words) - max(1, len(words) // 3)
        acc_html = _esc(" ".join(words[:cut])) + ' <span class="accent">' + _esc(" ".join(words[cut:])) + "</span>"
    else:
        acc_html = _esc(c["accroche"])
    sous = f'<div class="sous">{_esc(c["sous"])}</div>' if c.get("sous") else ""
    body = (f'<div class="story"><div class="photo"></div><div class="scrim"></div>'
            f'<div class="body"><h1 style="font-size:{_fit(c["accroche"],42)}px">{acc_html}</h1>{sous}'
            f'<span class="cta">{_esc(c["cta"])}</span>'
            f'{_lockup(logo, nom, secteur, "#fff", "rgba(255,255,255,.7)", A)}</div></div>')
    return _doc(head, css, body)


# =============================================================================
# Modèle « Photo entière » — le visuel ENTIER (contain) sur un fond flouté de lui-même
# => aucune bande vide même si la photo est carrée ou portrait
# =============================================================================
def _tpl_photo_flou(c, p, s, a, nom, secteur, logo):
    A = a or "#3AFFA3"; Aink = _ink_on(A)
    img = c.get("image") or ""
    head = '<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">'
    css = f'''<style>*{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .story{{width:{STORY_W}px;height:{STORY_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;justify-content:flex-end;background:#0b1020;color:#fff}}
  .blur{{position:absolute;inset:-6%;background:url('{img}') center/cover no-repeat;filter:blur(26px) brightness(.55);transform:scale(1.12)}}
  .photo{{position:absolute;left:0;right:0;top:0;bottom:150px;background:url('{img}') center/contain no-repeat}}
  .scrim{{position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,10,20,.35) 0%,rgba(6,10,20,0) 26%,rgba(6,10,20,.55) 72%,rgba(6,10,20,.9) 100%)}}
  .body{{position:relative;z-index:3;padding:0 40px 58px}}
  h1{{font-family:Sora;font-weight:800;line-height:1.06;letter-spacing:-.4px;font-size:30px;text-shadow:0 2px 20px rgba(0,0,0,.6)}}
  .cta{{display:inline-flex;align-items:center;gap:8px;background:{A};color:{Aink};font-family:Sora;font-weight:800;font-size:15px;padding:13px 22px;border-radius:12px;margin-top:16px}}
  .lockup{{display:flex;align-items:center;gap:10px;margin-top:18px}}
  .av{{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-family:Sora;font-weight:800;font-size:15px;overflow:hidden}}
  .lk-nm{{font-size:14px;font-weight:700}} .lk-hd{{font-size:11.5px;color:rgba(255,255,255,.7)}}
</style>'''
    body = (f'<div class="story"><div class="blur"></div><div class="photo"></div><div class="scrim"></div>'
            f'<div class="body"><h1>{_esc(c["accroche"])}</h1>'
            f'<span class="cta">{_esc(c["cta"])}</span>'
            f'{_lockup(logo, nom, secteur, "#fff", "rgba(255,255,255,.7)", A)}</div></div>')
    return _doc(head, css, body)


# =============================================================================
# Modèle « Photo + bloc » — visuel en haut (~60%), bloc texte à la charte en bas
# =============================================================================
def _tpl_split(c, p, s, a, nom, secteur, logo):
    A = a or "#3AFFA3"; Aink = _ink_on(A); accD = _acc_dark(A)
    img = c.get("image") or ""
    NEAR = _near(p or "#003D2E"); INK = "#fff"; MUT = "rgba(255,255,255,.66)"
    head = '<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">'
    css = f'''<style>*{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .story{{width:{STORY_W}px;height:{STORY_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;background:{NEAR};color:{INK}}}
  .pic{{height:58%;background:url('{img}') center/cover no-repeat;position:relative}}
  .blk{{flex:1;display:flex;flex-direction:column;justify-content:center;padding:32px 40px 40px}}
  h1{{font-family:Sora;font-weight:800;line-height:1.06;letter-spacing:-.4px}}
  .accent{{color:{accD}}}
  .sous{{font-size:15px;line-height:1.5;color:{MUT};margin-top:12px;max-width:94%}}
  .cta{{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;background:{accD};color:{_ink_on(accD)};font-family:Sora;font-weight:800;font-size:15px;padding:13px 22px;border-radius:12px;margin-top:18px}}
  .lockup{{display:flex;align-items:center;gap:10px;margin-top:18px}}
  .av{{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-family:Sora;font-weight:800;font-size:15px;overflow:hidden}}
  .lk-nm{{font-size:14px;font-weight:700}} .lk-hd{{font-size:11.5px;color:{MUT}}}
</style>'''
    words = (c["accroche"] or "").split(" ")
    if len(words) >= 3:
        cut = len(words) - max(1, len(words) // 3)
        acc_html = _esc(" ".join(words[:cut])) + ' <span class="accent">' + _esc(" ".join(words[cut:])) + "</span>"
    else:
        acc_html = _esc(c["accroche"])
    sous = f'<div class="sous">{_esc(c["sous"])}</div>' if c.get("sous") else ""
    body = (f'<div class="story"><div class="pic"></div>'
            f'<div class="blk"><h1 style="font-size:{_fit(c["accroche"],32)}px">{acc_html}</h1>{sous}'
            f'<span class="cta">{_esc(c["cta"])}</span>'
            f'{_lockup(logo, nom, secteur, INK, MUT, accD)}</div></div>')
    return _doc(head, css, body)


# =============================================================================
# Modèle « Liste » — accroche + jusqu'à 4 points (icône numérotée/titre/desc) + CTA
# =============================================================================
def _tpl_liste(c, p, s, a, nom, secteur, logo):
    P_ = p or "#003D2E"; S_ = s or "#8A6CFF"; A_ = a or "#3AFFA3"; Aink = _ink_on(A_)
    BG1 = _mix(S_, "#050409", .86); BG2 = "#050409"
    INK = "#ffffff"; MUT = "rgba(255,255,255,.66)"; LINE = "rgba(255,255,255,.10)"
    marque = (f'<img src="{logo}" style="height:26px;width:auto;display:block" alt="">' if logo
              else f'<span style="width:28px;height:28px;border-radius:8px;background:{A_};color:{Aink};display:grid;place-items:center;font-weight:800;font-family:Sora">{_esc((nom or "?")[:1].upper())}</span>')
    points = (c.get("points") or [])[:4]
    head = '<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
    rows = []
    for i, pt in enumerate(points):
        div = f'<div style="height:1px;background:{LINE};margin:13px 0"></div>' if i else ""
        rows.append(
            f'{div}<div style="display:flex;align-items:flex-start;gap:13px">'
            f'<span style="flex:0 0 auto;width:36px;height:36px;border-radius:10px;background:{_mix(A_,BG2,.82)};'
            f'border:1px solid {_mix(A_,BG2,.45)};display:grid;place-items:center;font-family:Sora;font-weight:800;'
            f'font-size:13px;color:{A_}">{i+1}</span>'
            f'<div><div style="font-family:Sora;font-weight:700;font-size:16px;color:{INK};line-height:1.25">{_accentuer(pt.get("titre"), A_)}</div>'
            f'<div style="font-size:13px;color:{MUT};margin-top:3px;line-height:1.4">{_esc(pt.get("desc"))}</div></div></div>')
    cta = (f'<span style="align-self:flex-start;display:inline-flex;align-items:center;gap:7px;background:{A_};color:{Aink};'
           f'font-family:Sora;font-weight:800;font-size:15px;padding:13px 22px;border-radius:30px;margin-top:24px">{_esc(c.get("cta"))} →</span>') if c.get("cta") else ""
    css = f'''<style>*{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .story{{width:{STORY_W}px;height:{STORY_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;
    padding:56px 36px 60px;background:linear-gradient(160deg,{BG1},{BG2});color:{INK}}}
  .story::after{{content:"";position:absolute;left:-100px;bottom:-100px;width:300px;height:300px;border-radius:50%;
    background:radial-gradient(circle,{_mix(A_,BG2,.3)},transparent 70%);opacity:.45;pointer-events:none}}
  .brand{{position:relative;z-index:3;display:flex;align-items:center;gap:9px;font-family:Sora;font-weight:800;font-size:15px;color:{INK}}}
  h1{{position:relative;z-index:3;font-family:Sora;font-weight:800;line-height:1.08;letter-spacing:-.4px;margin-top:22px}}
  .card{{position:relative;z-index:3;margin-top:26px;border:1px solid {LINE};border-radius:16px;background:rgba(255,255,255,.035);padding:18px 18px}}
</style>'''
    body = (f'<div class="story"><div class="brand">{marque}<span>{_esc(nom or "Story")}</span></div>'
            f'<h1 style="font-size:{_fit(c["accroche"],36)}px">{_esc(c["accroche"])}</h1>'
            f'<div class="card">{"".join(rows)}</div>{cta}</div>')
    return _doc(head, css, body)


# =============================================================================
# Modèle « Citation » — grand guillemet décoratif + citation + attribution
# =============================================================================
def _tpl_citation(c, p, s, a, nom, secteur, logo):
    P_ = p or "#003D2E"; A_ = a or "#3AFFA3"
    BG = _near(P_ or "#0b1020"); INK = "#ffffff"; MUT = "rgba(255,255,255,.62)"
    head = '<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">'
    css = f'''<style>*{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .story{{width:{STORY_W}px;height:{STORY_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;
    justify-content:center;padding:70px 44px;background:{BG};color:{INK}}}
  .mark{{font-family:Fraunces;font-weight:600;font-size:96px;line-height:.5;color:{A_};opacity:.9;margin-bottom:6px}}
  blockquote{{font-family:Fraunces;font-weight:500;font-style:italic;line-height:1.24;letter-spacing:-.2px;margin:0}}
  .rule{{width:38px;height:3px;border-radius:3px;background:{A_};margin:24px 0 14px}}
  .attrib{{font-size:13.5px;color:{MUT};font-weight:500}}
</style>'''
    body = (f'<div class="story"><div class="mark">&ldquo;</div>'
            f'<blockquote style="font-size:{_fit(c["accroche"],34)}px">{_esc(c["accroche"])}</blockquote>'
            f'<div class="rule"></div><div class="attrib">{_esc(c.get("sous"))}</div></div>')
    return _doc(head, css, body)


# =============================================================================
# Modèle « Rico » — MAISON : la mascotte Postorico détourée, fond clair de marque,
# accroche à gauche, Rico à droite. Réservé aux comptes qui utilisent la mascotte.
# =============================================================================
def _tpl_rico(c, p, s, a, nom, secteur, logo):
    from services import rico_poses
    P = p or "#003D2E"; A = a or "#3AFFA3"; Aink = _ink_on(A); accL = _acc_light(A)
    BG = _lighten(P, .95); BG2 = _lighten(P, .88); INK = "#151a17"; MUT = "rgba(0,0,0,.5)"
    rico = c.get("rico_pose") or "presente-cote"
    rico_url = rico_poses.url(rico)
    head = '<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">'
    # En 9:16 (cadre étroit), Rico ne tient pas À CÔTÉ du texte : on empile.
    # Texte en haut, mascotte centrée en bas, marque dans l'en-tête.
    css = f'''<style>*{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .story{{width:{STORY_W}px;height:{STORY_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;
    padding:52px 40px 0;background:linear-gradient(160deg,{BG},{BG2});color:{INK}}}
  .story::after{{content:"";position:absolute;right:-120px;top:-70px;width:320px;height:320px;border-radius:50%;
    background:radial-gradient(circle,{_mix(A,BG,.25)},transparent 70%);opacity:.6}}
  .head{{position:relative;z-index:3;display:flex;align-items:center;justify-content:flex-start}}
  .lockup{{display:flex;align-items:center;gap:9px}}
  .av{{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-family:Sora;font-weight:800;font-size:15px;overflow:hidden}}
  .lk-nm{{font-size:13.5px;font-weight:800}} .lk-hd{{font-size:11px}}
  .mid{{position:relative;z-index:3;margin-top:32px}}
  h1{{font-family:Sora;font-weight:800;line-height:1.06;letter-spacing:-.5px;max-width:96%}}
  .sous{{font-size:16px;line-height:1.5;color:{MUT};margin-top:13px;max-width:90%}}
  .cta{{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;background:{A};color:{Aink};font-family:Sora;
    font-weight:800;font-size:16px;padding:13px 23px;border-radius:30px;margin-top:18px}}
  .rico{{position:absolute;right:-18px;bottom:0;height:47%;z-index:2;
    filter:drop-shadow(0 16px 26px rgba(0,0,0,.20))}}
</style>'''
    sous = f'<div class="sous">{_esc(c["sous"])}</div>' if c.get("sous") else ""
    lock = _lockup(logo, nom, secteur, INK, MUT, A)
    body = (f'<div class="story">'
            f'<div class="head">{lock}</div>'
            f'<div class="mid"><h1 style="font-size:{_fit(c["accroche"],38)}px">{_esc(c["accroche"])}</h1>{sous}'
            f'<span class="cta">{_esc(c["cta"])}</span></div>'
            f'<img class="rico" src="{rico_url}" alt=""></div>')
    return _doc(head, css, body)


# =============================================================================
# Modèle « Signature » — MAISON, le visuel riche : Rico (pouce levé), accroche avec
# mot accent, filet vert, sous-texte à mots colorés, carte de 3 arguments à icônes,
# ligne d'offre + bouton CTA. Fond sombre à cercles concentriques.
# Blocs extra (points, ligne d'offre) fournis via le contenu (édités à la retouche).
# =============================================================================
def _ico(key, color):
    p = {
        "eclair": '<polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
        "etoile": '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>',
        "bouclier": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
        "fusee": '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8a2 2 0 0 0-3 .8z"/><path d="M12 15l-3-3a22 22 0 0 1 8-11c2 0 4 2 4 4a22 22 0 0 1-11 8z"/>',
        "coche": '<path d="M20 6L9 17l-5-5"/>',
    }.get(key, '<circle cx="12" cy="12" r="9"/>')
    return (f'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="{color}" '
            f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{p}</svg>')


def _accentuer(text, color):
    """Colorie les segments marqués entre [crochets] dans un texte (échappe le reste).
    Ex. « ta [présence] » -> « présence » en couleur d'accent. Simple à saisir en retouche."""
    out, i = [], 0
    for m in re.finditer(r"\[([^\]]+)\]", text or ""):
        out.append(_esc(text[i:m.start()]))
        out.append(f'<span style="color:{color}">{_esc(m.group(1))}</span>')
        i = m.end()
    out.append(_esc((text or "")[i:]))
    return "".join(out)


def _tpl_signature(c, p, s, a, nom, secteur, logo):
    from services import rico_poses
    P = p or "#003D2E"; S = s or "#8A6CFF"; A = a or "#3AFFA3"; Aink = _ink_on(A)
    BG1 = _mix(S, "#050409", .84); BG2 = "#050409"          # sombre teinté violet
    INK = "#ffffff"; MUT = "rgba(255,255,255,.66)"; LINE = "rgba(255,255,255,.10)"
    rico_url = rico_poses.url(c.get("rico_pose") or "pouce-leve")
    # accroche : dernier mot en accent secondaire (violet)
    words = (c["accroche"] or "").split(" ")
    if len(words) >= 2:
        acc_html = _esc(" ".join(words[:-1])) + f' <span style="color:{S}">' + _esc(words[-1]) + "</span>"
    else:
        acc_html = _esc(c["accroche"])
    marque = (f'<img src="{logo}" style="height:28px;width:auto;display:block" alt="">' if logo
              else f'<span style="width:30px;height:30px;border-radius:9px;background:{A};color:{Aink};display:grid;place-items:center;font-weight:800;font-family:Sora">{_esc((nom or "?")[:1].upper())}</span>')
    points = (c.get("points") or [])[:3]
    baseline = c.get("baseline") or ""
    head = '<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
    carte = ""
    if points:
        rows = []
        default_icons = ["eclair", "etoile", "bouclier"]
        for i, pt in enumerate(points):
            div = '<div style="height:1px;background:%s;margin:9px 0"></div>' % LINE if i else ""
            icone = pt.get("icon") or default_icons[i % len(default_icons)]
            rows.append(
                f'{div}<div style="display:flex;align-items:flex-start;gap:11px">'
                f'<span style="flex:0 0 auto;width:32px;height:32px;border-radius:9px;background:{_mix(A,BG2,.82)};'
                f'border:1px solid {_mix(A,BG2,.5)};display:grid;place-items:center">{_ico(icone, A)}</span>'
                f'<div><div style="font-family:Sora;font-weight:700;font-size:14.5px;color:{INK}">{_accentuer(pt.get("titre"), A)}</div>'
                f'<div style="font-size:12.5px;color:{MUT};margin-top:1px">{_esc(pt.get("desc"))}</div></div></div>')
        carte = (f'<div style="position:relative;z-index:3;margin-top:14px;border:1px solid {LINE};border-radius:15px;'
                 f'background:rgba(255,255,255,.03);padding:13px 15px">{"".join(rows)}</div>')
    bas = ""
    if baseline or c.get("cta"):
        bl = f'<div style="flex:1;min-width:0;font-size:13px;font-weight:600;color:{MUT};line-height:1.4">{_accentuer(baseline, A)}</div>' if baseline else "<div style=\"flex:1\"></div>"
        cta = (f'<span style="flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;background:{A};color:{Aink};'
               f'font-family:Sora;font-weight:800;font-size:14px;padding:12px 20px;border-radius:30px">{_esc(c.get("cta"))} →</span>') if c.get("cta") else ""
        bas = (f'<div style="position:relative;z-index:3;margin-top:16px;display:flex;align-items:center;'
               f'justify-content:space-between;gap:12px">{bl}{cta}</div>')
    css = f'''<style>*{{box-sizing:border-box;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
  .story{{width:{STORY_W}px;height:{STORY_H}px;overflow:hidden;position:relative;display:flex;flex-direction:column;
    padding:38px 32px 36px;background:linear-gradient(155deg,{BG1},{BG2});color:{INK}}}
  /* cercles concentriques derrière la mascotte (coin haut-droit) */
  .rings{{position:absolute;right:-104px;top:-72px;width:340px;height:340px;z-index:1;pointer-events:none;opacity:.8}}
  .rings i{{position:absolute;border-radius:50%;border:1px solid {_mix(S,BG2,.55)}}}
  .brand{{position:relative;z-index:3;display:flex;align-items:center;gap:9px;font-family:Sora;font-weight:800;font-size:18px;color:{INK}}}
  .rico{{position:absolute;right:-10px;top:58px;width:45%;height:auto;z-index:2;filter:drop-shadow(0 16px 26px rgba(0,0,0,.4))}}
  h1{{position:relative;z-index:3;font-family:Sora;font-weight:800;line-height:1.02;letter-spacing:-.5px;margin-top:16px;max-width:54%}}
  .rule{{position:relative;z-index:3;width:44px;height:3px;border-radius:3px;background:{A};margin:12px 0}}
  .sous{{position:relative;z-index:3;font-size:15px;line-height:1.45;color:{MUT};max-width:82%}}
</style>'''
    rings = '<div class="rings">' + "".join(
        f'<i style="inset:{v}px"></i>' for v in (0, 30, 66, 108, 156)) + '</div>'
    sous = f'<div class="sous">{_accentuer(c["sous"], A)}</div>' if c.get("sous") else ""
    body = (f'<div class="story">{rings}'
            f'<img class="rico" src="{rico_url}" alt="">'
            f'<div class="brand">{marque}<span>{_esc(nom or "postorico")}</span></div>'
            f'<h1 style="font-size:{_fit(c["accroche"],32)}px">{acc_html}</h1><div class="rule"></div>{sous}'
            f'{carte}{bas}</div>')
    return _doc(head, css, body)


_FN = {"epure": _tpl_epure, "sombre": _tpl_sombre, "editorial": _tpl_editorial, "bloc": _tpl_bloc,
       "photo": _tpl_photo, "photo-flou": _tpl_photo_flou, "split": _tpl_split, "rico": _tpl_rico,
       "signature": _tpl_signature, "liste": _tpl_liste, "citation": _tpl_citation}


def build_story_html(content: dict, p, s, a, nom, secteur, template="epure", logo=None) -> str:
    fn = _FN.get(template_valide(template), _tpl_epure)
    return fn(content, p, s, a, nom, secteur, logo)


def _render_story_bytes(content, p, s, a, nom, secteur, template, logo, font, font_corps):
    """Rendu synchrone d'UNE story -> PNG (bytes). Utilisé par _rendre (hors boucle)."""
    from playwright.sync_api import sync_playwright
    html_str = _apply_font(build_story_html(content, p, s, a, nom, secteur, template, logo), font, font_corps)
    with sync_playwright() as pw:
        args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        try:
            browser = pw.chromium.launch(args=args)
        except Exception:
            browser = pw.chromium.launch(channel="chromium", args=args)
        page = browser.new_page(viewport={"width": STORY_W, "height": STORY_H}, device_scale_factor=DSF)
        page.set_content(html_str, wait_until="load")
        try:
            page.wait_for_selector(".story", timeout=15000)
        except Exception:
            pass
        try:
            page.evaluate("() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 4000))])")
        except Exception:
            pass
        page.wait_for_timeout(300)
        # Auto-ajustement : réduit le titre tant qu'il déborde (accroche longue).
        try:
            page.evaluate("""() => {
              var sl = document.querySelector('.story'); if(!sl) return;
              var h = sl.querySelector('h1'); var guard = 0;
              while (sl.scrollHeight > sl.clientHeight + 1 && guard < 140) {
                var c = parseFloat(getComputedStyle(h).fontSize);
                if (c > 20) { h.style.fontSize = (c - 1.5) + 'px'; }
                else {
                  var sub = sl.querySelector('.sous');
                  if (sub) { var cs = parseFloat(getComputedStyle(sub).fontSize); if (cs > 12) { sub.style.fontSize = (cs-1)+'px'; } else break; }
                  else break;
                }
                guard++;
              }
            }""")
        except Exception:
            pass
        page.wait_for_timeout(60)
        png = page.locator(".story").screenshot(type="png")
        browser.close()
    return png


def _couleurs_marque(u, colors):
    co = colors or {}
    p = co.get("p") or u.get("carrousel_couleur_principale") or u.get("couleur_principale") or "#003D2E"
    s = co.get("s") or u.get("carrousel_couleur_secondaire") or u.get("couleur_secondaire") or "#0077FF"
    a = co.get("a") or u.get("carrousel_couleur_accent") or u.get("couleur_accent") or "#3AFFA3"
    return p, s, a


async def generer_story(telegram_id: str, content: dict, template: str = "epure",
                        colors: dict = None, contenu_id: str = None,
                        font: str = None, font_corps: str = None) -> dict:
    """Rend une story 9:16 et l'envoie sur Cloudinary. Renvoie {'image': url} (ou vide)."""
    u = _charger_marque(telegram_id)
    p, s, a = _couleurs_marque(u, colors)
    nom = u.get("nom") or u.get("username") or ""
    secteur = u.get("secteur") or ""
    logo = u.get("logo_url") or None
    font = ((font if font is not None else u.get("carrousel_font")) or "").strip() or None
    font_corps = ((font_corps if font_corps is not None else u.get("carrousel_font_corps")) or "").strip() or None
    template = template_valide(template)
    base = (contenu_id or "tmp").replace("-", "")[:16]
    args = (content, p, s, a, nom, secteur, template, logo, font, font_corps)
    for attempt in (1, 2):
        try:
            png = await _rendre(_render_story_bytes, *args)
            if png:
                up = cloudinary.uploader.upload(png, resource_type="image",
                                                folder=f"stories/{telegram_id}",
                                                public_id=f"{base}_{template}", overwrite=True)
                return {"image": up["secure_url"], "template": template}
        except AtelierSature:
            raise
        except Exception as e:
            logger.error(f"Story render error (essai {attempt}): {e}")
    return {"image": None, "template": template}


async def generer_story_animee(telegram_id: str, accroche: str, sous: str, cta: str,
                                colors: dict = None, mot_accent: str = None,
                                contenu_id: str = None) -> dict:
    """Rend une story ANIMÉE (Remotion, ~5s, gabarit « StoryAnime ») et l'envoie sur
    Cloudinary en vidéo. Renvoie {'video_url', 'video_preview_url'} (ou vide si échec).

    Texte/couleurs viennent déjà écrits/édités par l'utilisateur (StoryDialog) —
    aucun appel Claude ici, contrairement au choix de gabarit statique."""
    from services import remotion_service
    u = _charger_marque(telegram_id)
    p, _s, a = _couleurs_marque(u, colors)
    nom = u.get("nom") or u.get("username") or "Ma marque"
    logo = u.get("logo_url") or None
    props = {
        "brand": {"nom": nom, "principale": p, "accent": a, "fond": "#0b1020", "logo": logo},
        "accroche": accroche or "", "motAccent": mot_accent or "",
        "sous": sous or "", "cta": cta or "",
    }
    try:
        mp4 = await asyncio.to_thread(
            remotion_service.render_mp4, props, "StoryAnime",
            telegram_id=telegram_id, etiquette="story_anime", prefix="story_anime")
    except Exception as e:
        logger.error(f"Story animée rendu error: {e}")
        return {"video_url": None}
    base = (contenu_id or "tmp").replace("-", "")[:16]
    try:
        up = cloudinary.uploader.upload(
            mp4, resource_type="video",
            folder=f"stories/{telegram_id}", public_id=f"{base}_anime",
            overwrite=True, invalidate=True,
        )
        url = up["secure_url"]
        preview = url.rsplit(".", 1)[0] + ".jpg"
        return {"video_url": url, "video_preview_url": preview}
    except Exception as e:
        logger.error(f"Story animée upload error: {e}")
        return {"video_url": None}
    finally:
        try:
            os.unlink(mp4)
        except OSError:
            pass
