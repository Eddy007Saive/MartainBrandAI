"""
Agents de contenu propulsés par Claude (SDK Anthropic, en direct).

- generer_sujets : propose des idées de sujets selon la marque + le secteur du client
- rediger_post   : écrit un post prêt à publier sur un sujet donné

La "mémoire" de chaque client est lue depuis Supabase (table users), isolée par
telegram_id. La voix de marque est mise en cache (prompt caching) → coût réduit.
"""

import json
import anthropic
from config import CLAUDE_API_KEY, CLAUDE_MODEL, supabase, logger

_client = anthropic.Anthropic(api_key=CLAUDE_API_KEY) if CLAUDE_API_KEY else None

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
def _charger_marque(telegram_id: int) -> dict:
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


def generer_sujets(telegram_id: int, nombre: int = 6) -> dict:
    if not _client:
        return {"error": "no_api_key"}
    u = _charger_marque(telegram_id)
    if not (u.get("secteur") or "").strip():
        return {"error": "profil_incomplet"}
    contexte = _contexte_marque(u)

    resp = _client.messages.create(
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


def rediger_post(telegram_id: int, sujet: str, reseau: str = "linkedin", model: str = None, cache: bool = False) -> dict:
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

    resp = _client.messages.create(
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


# ---------------------------------------------------------------------------
# Agent CARROUSEL (slides)
# ---------------------------------------------------------------------------
ROLE_CARROUSEL = (
    "Tu crées des CARROUSELS pour la marque personnelle décrite ci-dessous, dans sa voix. "
    "Structure imposée : slide 1 = HOOK très court et percutant (une accroche qui stoppe le scroll), "
    "slides du milieu = UNE idée forte chacune (titre court + 1 à 2 phrases max), "
    "dernière slide = CTA (appel à l'action). Texte court, percutant, lisible sur une slide. "
    "Réponds UNIQUEMENT avec du JSON valide : "
    '{"slides":[{"titre":"...","texte":"..."}]} — le hook et le CTA peuvent avoir un texte vide.\n\n'
)


def rediger_carrousel(telegram_id: int, sujet: str, nb_slides: int = 5, model: str = None, cache: bool = False) -> dict:
    if not _client:
        return {"error": "no_api_key"}
    u = _charger_marque(telegram_id)
    if not (u.get("secteur") or "").strip():
        return {"error": "profil_incomplet"}
    contexte = _contexte_marque(u)
    resp = _client.messages.create(
        model=model or CLAUDE_MODEL,
        max_tokens=1300,
        system=_system(ROLE_CARROUSEL, contexte, "", cache),
        messages=[{
            "role": "user",
            "content": (f"Sujet du carrousel : \"{sujet}\".\n"
                        f"Donne EXACTEMENT {nb_slides} slides en JSON (slide 1 = hook, dernière = CTA)."),
        }],
    )
    txt = _texte(resp)
    if "{" in txt and "}" in txt:
        txt = txt[txt.find("{"):txt.rfind("}") + 1]
    try:
        slides = json.loads(txt).get("slides", [])
    except Exception as e:
        logger.error(f"carrousel parse error: {e} | {txt[:200]}")
        return {"error": "parse"}
    slides = [{"titre": (s.get("titre") or "").strip(), "texte": (s.get("texte") or "").strip()}
              for s in slides if (s.get("titre") or s.get("texte"))][:nb_slides]
    if not slides:
        return {"error": "parse"}
    return {"slides": slides, "usage": _usage(resp)}


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


def rediger_script(telegram_id: int, sujet: str, type_video: str = "Reel", model: str = None, cache: bool = False) -> dict:
    if not _client:
        return {"error": "no_api_key"}
    u = _charger_marque(telegram_id)
    if not (u.get("secteur") or "").strip():
        return {"error": "profil_incomplet"}
    contexte = _contexte_marque(u)
    tv = TYPES_VIDEO.get(type_video, type_video)

    resp = _client.messages.create(
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
