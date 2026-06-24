"""
Agents de contenu propulsés par Claude (SDK Anthropic, en direct).

- generer_sujets : propose des idées de sujets selon la marque + le secteur du client
- rediger_post   : écrit un post prêt à publier sur un sujet donné

La "mémoire" de chaque client est lue depuis Supabase (table users), isolée par
telegram_id. La voix de marque est mise en cache (prompt caching) → coût réduit.
"""

import json
import time
import anthropic
from config import CLAUDE_API_KEY, CLAUDE_MODEL, supabase, logger

_client = anthropic.Anthropic(api_key=CLAUDE_API_KEY) if CLAUDE_API_KEY else None


class GenerationError(Exception):
    """Erreur de génération présentée à l'utilisateur (message générique, sans fuite du fournisseur)."""


def _messages_create(**kwargs):
    """Appel LLM centralisé : retry sur surcharge/limite (529/429/5xx) + message propre.
    Ne laisse jamais remonter l'erreur brute du fournisseur (anti-fuite)."""
    last = None
    for attempt in range(4):
        try:
            return _client.messages.create(**kwargs)
        except Exception as e:
            last = e
            code = getattr(e, "status_code", None)
            msg = str(getattr(e, "message", "") or e).lower()
            retryable = (code in (408, 409, 429, 500, 502, 503, 504, 529)
                         or "overloaded" in msg or "rate" in msg
                         or isinstance(e, getattr(anthropic, "APIConnectionError", ())))
            if not retryable or attempt == 3:
                break
            time.sleep(0.8 * (2 ** attempt))  # 0.8s, 1.6s, 3.2s
    logger.error(f"LLM generation error (after retries): {last}")
    raise GenerationError(
        "Le service de génération est momentanément surchargé. Réessaie dans quelques secondes."
    )

RESEAUX = {
    "linkedin": "LinkedIn",
    "instagram": "Instagram",
    "facebook": "Facebook",
    "tiktok": "TikTok",
    "youtube": "YouTube",
}

# Niveaux de qualité (noms neutres côté UI) → modèle réel (jamais exposé)
QUALITE_MODELS = {
    "rapide": "claude-haiku-4-5",
    "equilibre": "claude-sonnet-4-6",
    "premium": "claude-opus-4-8",
}

# Les sujets sont des idées jetables -> Haiku suffit (3x moins cher que Sonnet)
SUJETS_MODEL = "claude-haiku-4-5"

# Note caching : on N'UTILISE PAS le prompt caching ici. Les générations sont espacées
# (cache ephemeral = TTL 5 min) et le préfixe diffère à chaque appel -> le cache n'était
# jamais relu mais ré-écrit (+25% sur l'input). Sans cache, l'input est au tarif normal.


# ---------------------------------------------------------------------------
# Mémoire de la marque (depuis Supabase)
# ---------------------------------------------------------------------------
def _charger_marque(telegram_id: str) -> dict:
    res = supabase.table("users").select("*").eq("telegram_id", telegram_id).execute()
    return res.data[0] if res.data else {}


def _contexte_marque(u: dict) -> str:
    """Construit le bloc 'voix de marque' à partir des champs disponibles."""
    nom = u.get("nom") or u.get("username") or "le client"
    lignes = [f"# MARQUE : {nom}"]
    # Champs optionnels — utilisés s'ils existent (ajoutés via le formulaire "Voix de marque")
    if u.get("secteur"):
        lignes.append(f"Secteur / activité : {u['secteur']}")
    if u.get("voix_marque"):
        lignes.append(f"Voix & ton : {u['voix_marque']}")
    if u.get("audience"):
        lignes.append(f"Audience cible : {u['audience']}")
    if u.get("piliers"):
        lignes.append(f"Piliers / thèmes : {u['piliers']}")
    if u.get("a_eviter"):
        lignes.append(f"À éviter absolument : {u['a_eviter']}")
    if u.get("hooks"):
        lignes.append(f"Hooks/accroches qui marchent (inspire-toi de ce style d'accroche) :\n{u['hooks']}")
    if u.get("ctas"):
        lignes.append(f"CTA habituels (réutilise-en un quand c'est pertinent) :\n{u['ctas']}")
    if u.get("style_vestimentaire"):
        lignes.append(f"Style : {u['style_vestimentaire']}")
    if u.get("regles"):
        lignes.append(
            "\n## RÈGLES ÉDITORIALES — À RESPECTER SCRUPULEUSEMENT "
            "(elles priment sur tout le reste ; ne viole jamais une règle) :\n"
            + u["regles"]
        )
    if len(lignes) == 1:
        lignes.append(
            "(Profil de marque peu renseigné — reste générique, professionnel et "
            "crédible ; évite les promesses chiffrées et le jargon creux.)"
        )
    return "\n".join(lignes)


def _usage(resp) -> dict:
    u = resp.usage
    return {
        "input": u.input_tokens,
        "cache_write": getattr(u, "cache_creation_input_tokens", 0) or 0,
        "cache_read": getattr(u, "cache_read_input_tokens", 0) or 0,
        "output": u.output_tokens,
    }


def _texte(resp) -> str:
    return "".join(b.text for b in resp.content if b.type == "text").strip()


def _system(role: str, contexte: str, extra: str = "", cache: bool = False):
    """Construit le bloc system.

    cache=True (génération en rafale) : la VOIX DE MARQUE (contexte, identique pour
    toutes les générations d'un client) est mise en cache -> relue à 0,1× sur les
    générations suivantes de la rafale. Le rôle + exemples (variables) restent hors cache.
    cache=False (génération unique) : pas de cache (évite le surcoût d'écriture).
    """
    if cache:
        return [
            {"type": "text", "text": contexte, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": role + extra},
        ]
    return role + contexte + extra


# ---------------------------------------------------------------------------
# Agent SUJETS
# ---------------------------------------------------------------------------
ROLE_SUJETS = (
    "Tu es un stratège de contenu pour la marque personnelle décrite ci-dessous. "
    "Tu proposes des idées de sujets de posts pertinents pour son secteur et son audience.\n\n"
)


def generer_sujets(telegram_id: str, nombre: int = 6) -> dict:
    if not _client:
        return {"error": "no_api_key"}
    u = _charger_marque(telegram_id)
    if not (u.get("secteur") or "").strip():
        return {"error": "profil_incomplet"}
    contexte = _contexte_marque(u)

    resp = _messages_create(
        model=SUJETS_MODEL,
        max_tokens=900,
        system=ROLE_SUJETS + contexte,
        messages=[{
            "role": "user",
            "content": (
                f"Propose {nombre} idées de sujets de contenu pertinents pour cette marque "
                f"(angles concrets, accrocheurs, exploitables aussi bien en post qu'en vidéo). "
                f"Réponds UNIQUEMENT avec un sujet par ligne — pas de numéro, pas de puce, pas d'intro."
            ),
        }],
    )
    texte = _texte(resp)
    sujets = [l.strip(" -•\t0123456789.").strip() for l in texte.splitlines() if l.strip()]
    sujets = [s for s in sujets if s][:nombre]
    return {"sujets": sujets, "usage": _usage(resp)}


# ---------------------------------------------------------------------------
# Agent RÉDACTION
# ---------------------------------------------------------------------------
ROLE_REDACTION = (
    "Tu es le rédacteur attitré de la marque personnelle décrite ci-dessous. "
    "Tu écris EXCLUSIVEMENT dans sa voix. Tu produis un post prêt à publier : "
    "pas d'explications, pas de méta-commentaire, pas de 'Voici votre post'. "
    "Réponds uniquement avec le texte du post, en français.\n\n"
)


def rediger_post(telegram_id: str, sujet: str, reseau: str = "linkedin", model: str = None, cache: bool = False) -> dict:
    if not _client:
        return {"error": "no_api_key"}
    reseau_label = RESEAUX.get(reseau, "LinkedIn")
    u = _charger_marque(telegram_id)
    if not (u.get("secteur") or "").strip():
        return {"error": "profil_incomplet"}
    contexte = _contexte_marque(u)
    exemples = (u.get(f"exemples_{reseau}") or "").strip()
    extra = ""
    if exemples:
        extra = (
            f"\n\n## EXEMPLES DE POSTS {reseau_label} DU CLIENT "
            f"(imite ce style, cette structure et ce ton — n'invente pas un autre style)\n\n{exemples}"
        )

    resp = _messages_create(
        model=model or CLAUDE_MODEL,
        max_tokens=1200,
        system=_system(ROLE_REDACTION, contexte, extra, cache),
        messages=[{
            "role": "user",
            "content": (
                f"Écris UN post {reseau_label} prêt à publier sur le sujet :\n\n\"{sujet}\"\n\n"
                f"Format {reseau_label} : accroche forte en 1ʳᵉ ligne, lignes courtes et aérées, "
                f"une seule idée centrale, et une question/appel à l'engagement en fin. "
                f"Donne uniquement le texte du post."
            ),
        }],
    )
    return {"contenu": _texte(resp), "usage": _usage(resp)}


def rediger_depuis_photo(telegram_id: str, img_b64: str, media_type: str,
                         reseau: str = "linkedin", model: str = None) -> dict:
    """Vision : analyse une photo fournie et écrit un post adapté au réseau, dans la voix de marque."""
    if not _client:
        return {"error": "no_api_key"}
    u = _charger_marque(telegram_id)
    if not (u.get("secteur") or "").strip():
        return {"error": "profil_incomplet"}
    reseau_label = RESEAUX.get(reseau, "LinkedIn")
    contexte = _contexte_marque(u)
    exemples = (u.get(f"exemples_{reseau}") or "").strip()
    extra = (f"\n\n## EXEMPLES DE POSTS {reseau_label} DU CLIENT (imite ce style)\n\n{exemples}" if exemples else "")
    role = (
        "Tu es le rédacteur attitré de la marque ci-dessous. On te donne une PHOTO. "
        "Observe ce qu'elle montre (sujet, contexte, ambiance, détails) et écris un post prêt à publier "
        "qui s'APPUIE sur cette photo, dans la voix de la marque — sans décrire la photo platement, "
        "mais en t'en servant comme point de départ d'un message pertinent pour l'audience. "
        "Accroche forte, lignes courtes, une idée, un appel à l'engagement. Donne uniquement le texte du post.\n\n"
    )
    resp = _messages_create(
        model=model or CLAUDE_MODEL,
        max_tokens=1200,
        system=role + contexte + extra,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": img_b64}},
                {"type": "text", "text": f"Écris UN post {reseau_label} prêt à publier à partir de cette photo, "
                                         f"dans la voix de la marque. Donne uniquement le texte."},
            ],
        }],
    )
    return {"contenu": _texte(resp), "usage": _usage(resp)}


# ---------------------------------------------------------------------------
# Agent CARROUSEL (slides)
# ---------------------------------------------------------------------------
# Icônes 3D disponibles (clé -> thème) pour illustrer les slides
ICON_HINTS = {
    "chart": "croissance/données", "bars": "stats/chiffres", "money": "argent/revenus", "cash": "cash/flux",
    "brain": "réflexion/stratégie", "idea": "idée/insight", "rocket": "scale/croissance rapide", "gem": "valeur",
    "trophy": "réussite/résultat", "briefcase": "business/pro", "handshake": "vente/partenariat", "gear": "process/système",
    "search": "analyse/audit", "clock": "temps/urgence", "hourglass": "temps qui file", "fire": "urgence/hot",
    "bolt": "énergie/rapidité", "megaphone": "marketing/communication", "key": "clé/solution", "lock": "sécurité",
    "calendar": "planning/régularité", "check": "validation/checklist", "warning": "erreur/risque", "package": "produit/offre",
    "cart": "ventes/e-commerce", "phone": "mobile/digital", "laptop": "outil/digital", "people": "équipe/audience",
    "star": "excellence", "crown": "premium/leader", "shield": "protection/fiabilité",
}

ROLE_CARROUSEL = (
    "Tu crées des CARROUSELS pour la marque personnelle décrite ci-dessous, dans sa voix. "
    "Structure : un HOOK (accroche très courte qui stoppe le scroll), des ÉTAPES/IDÉES "
    "(une idée forte chacune), et un CTA final. Chaque idée a un titre TRÈS court (2-5 mots, "
    "façon gros titre), 1 à 2 phrases d'explication, 2 à 4 mots-clés (pills), un 'pro_tip' "
    "(une phrase de conseil concret) et un 'icon' (le mot-clé d'illustration le plus pertinent "
    "dans cette liste : " + ", ".join(ICON_HINTS.keys()) + "). "
    "Texte court, percutant, lisible sur une slide. "
    "Réponds UNIQUEMENT avec du JSON valide de cette forme :\n"
    '{"hook":"...","slides":[{"titre":"...","texte":"...","pills":["..",".."],"pro_tip":"...","icon":"chart"}],'
    '"cta":{"titre":"...","texte":"..."}}\n\n'
)


def rediger_carrousel(telegram_id: str, sujet: str, nb_slides: int = 5, model: str = None, cache: bool = False) -> dict:
    if not _client:
        return {"error": "no_api_key"}
    u = _charger_marque(telegram_id)
    if not (u.get("secteur") or "").strip():
        return {"error": "profil_incomplet"}
    contexte = _contexte_marque(u)
    nb_idees = max(1, nb_slides - 2)  # hook + idées + cta
    resp = _messages_create(
        model=model or CLAUDE_MODEL,
        max_tokens=1600,
        system=_system(ROLE_CARROUSEL, contexte, "", cache),
        messages=[{
            "role": "user",
            "content": (f"Sujet du carrousel : \"{sujet}\".\n"
                        f"Donne le hook, EXACTEMENT {nb_idees} idées (avec titre court, texte, pills, pro_tip) "
                        f"et le cta, en JSON."),
        }],
    )
    txt = _texte(resp)
    if "{" in txt and "}" in txt:
        txt = txt[txt.find("{"):txt.rfind("}") + 1]
    try:
        data = json.loads(txt)
    except Exception as e:
        logger.error(f"carrousel parse error: {e} | {txt[:200]}")
        return {"error": "parse"}

    def _clean_slide(s):
        pills = s.get("pills") or []
        if isinstance(pills, str):
            pills = [pills]
        icon = (s.get("icon") or "").strip().lower()
        return {
            "titre": (s.get("titre") or "").strip(),
            "texte": (s.get("texte") or "").strip(),
            "pills": [str(p).strip() for p in pills if str(p).strip()][:4],
            "pro_tip": (s.get("pro_tip") or s.get("protip") or "").strip(),
            "icon": icon if icon in ICON_HINTS else "",
        }

    slides = [_clean_slide(s) for s in (data.get("slides") or []) if (s.get("titre") or s.get("texte"))]
    slides = slides[:nb_idees]
    cta = data.get("cta") or {}
    if isinstance(cta, str):
        cta = {"titre": cta, "texte": ""}
    content = {
        "hook": (data.get("hook") or "").strip(),
        "slides": slides,
        "cta": {"titre": (cta.get("titre") or "On en parle ?").strip(), "texte": (cta.get("texte") or "").strip()},
    }
    if not content["hook"] and not slides:
        return {"error": "parse"}
    return {"content": content, "usage": _usage(resp)}


# ---------------------------------------------------------------------------
# Agent SCRIPT VIDÉO
# ---------------------------------------------------------------------------
TYPES_VIDEO = {
    "Reel": "Reel Instagram (15-45s, vertical, rythme rapide)",
    "Short": "Short YouTube/TikTok (15-60s, vertical, hook immédiat)",
    "Video": "Vidéo longue (face caméra, structurée)",
    "Interview": "Interview / discussion",
}

ROLE_SCRIPT = (
    "Tu es scénariste vidéo pour la marque personnelle décrite ci-dessous. "
    "Tu écris des scripts vidéo prêts à tourner, percutants, dans la voix de la marque. "
    "Structure imposée : un HOOK très fort (les 3 premières secondes), puis le CORPS "
    "(scènes / idées avec le texte exact à dire), puis un CTA final. "
    "Réponds uniquement avec le script, en français.\n\n"
)


def rediger_script(telegram_id: str, sujet: str, type_video: str = "Reel", model: str = None, cache: bool = False) -> dict:
    if not _client:
        return {"error": "no_api_key"}
    u = _charger_marque(telegram_id)
    if not (u.get("secteur") or "").strip():
        return {"error": "profil_incomplet"}
    contexte = _contexte_marque(u)
    tv = TYPES_VIDEO.get(type_video, type_video)

    resp = _messages_create(
        model=model or CLAUDE_MODEL,
        max_tokens=1500,
        system=_system(ROLE_SCRIPT, contexte, "", cache),
        messages=[{
            "role": "user",
            "content": (
                f"Écris un script vidéo de type « {tv} » sur le sujet :\n\n\"{sujet}\"\n\n"
                f"Format de sortie clair :\n"
                f"[HOOK] — l'accroche des 3 premières secondes\n"
                f"[CORPS] — les scènes / idées avec le texte exact à dire\n"
                f"[CTA] — l'appel à l'action final\n"
                f"Adapte la longueur au format. Donne uniquement le script."
            ),
        }],
    )
    return {"script": _texte(resp), "usage": _usage(resp)}
