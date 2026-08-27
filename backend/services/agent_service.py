"""
Agents de contenu propulsés par Claude (SDK Anthropic, en direct).

- generer_sujets : propose des idées de sujets selon la marque + le secteur du client
- rediger_post   : écrit un post prêt à publier sur un sujet donné

La "mémoire" de chaque client est lue depuis Supabase (table users), isolée par
telegram_id. La voix de marque est mise en cache (prompt caching) → coût réduit.
"""

import json
import time
import unicodedata
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
    "googlebusiness": "Google Business",
    "twitter": "X (Twitter)",
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
    """Le compte + sa fiche de marque, fusionnés en un seul dictionnaire.

    Depuis la normalisation, la fiche vit dans `marques` ; on la refusionne ici pour
    que tous les appelants (prompts, carrousels, reels, images) continuent de lire
    u["voix_marque"], u["couleur_accent"]… sans rien changer chez eux.
    """
    from services import marque_service
    res = supabase.table("users").select("*").eq("telegram_id", telegram_id).execute()
    if not res.data:
        return {}
    return {**res.data[0], **marque_service.fiche(telegram_id)}


LANGUES_CONTENU = {"fr": "français", "en": "anglais (English)", "es": "espagnol (Español)"}

# Règles d'écriture humaine (distillées du guide « Signs of AI writing »), appliquées à
# TOUTES les générations via le contexte de marque. Objectif : que le contenu ne « sente » pas l'IA.
REGLES_ANTI_IA = (
    "\n## STYLE — HUMAN WRITING (mandatory; overrides everything else if in doubt)\n"
    "Write like a real person with an opinion, never like an AI. In the OUTPUT LANGUAGE:\n"
    "- Punctuation: NEVER use an em dash (—) or en dash (–), neither as separator nor as an aside. "
    "Rewrite with a comma, period, colon or parentheses. Hyphen (-) only inside a compound word. "
    "Use the target language's proper quotes (French uses « »), never curly quotes “ ”.\n"
    "- Ban AI-cliché vocabulary and filler. When writing FRENCH, avoid: « au cœur de », « à l'ère de », "
    "« dans un monde où », « véritable », « incontournable », « riche »/« vibrant », « profond », "
    "« révolutionnaire », « témoigne de », « s'inscrit dans une dynamique », « en constante évolution », "
    "« il est important de noter », « force est de constater », « plongeons/découvrons ensemble », « à ne pas manquer ». "
    "In other languages, avoid the equivalent LLM clichés.\n"
    "- No forced triplets (rule of three) and no negative parallelisms (\"it's not X, it's Y\", \"not only… but also\").\n"
    "- Direct verbs (is/has/does), not \"constitutes\", \"represents\", \"positions itself as\".\n"
    "- No decorative present-participle padding that inflates sentences.\n"
    "- No promotional superlatives, no generic upbeat conclusion.\n"
    "- No plan announcement (\"in this post we will see\"), no meta-commentary.\n"
    "- Emoji only if the brand actually uses them and it serves the point; never as mechanical bullet/title decoration.\n"
    "- Vary sentence rhythm (short AND long), take a stance, stay concrete (specific examples, real numbers), "
    "and cut filler and pompous phrasing."
)


def _contexte_marque(u: dict, inclure_hooks: bool = True) -> str:
    """Construit le bloc 'voix de marque' à partir des champs disponibles.

    inclure_hooks=False : omet la liste d'exemples d'accroches du client. À utiliser pour
    les tâches d'EXTRACTION strictes depuis un texte déjà donné (ex. composer_gabarit) —
    sinon le modèle pioche une accroche de la liste au lieu de condenser le texte fourni
    (cause du bug "image hors-sujet", ex. post train en retard -> visuel "panne").
    """
    nom = u.get("nom") or u.get("username") or "le client"
    lignes = [f"# MARQUE : {nom}"]
    # Langue de rédaction du client (clients étrangers) — s'applique à TOUTES les générations
    # (sujets, posts, carrousels, scripts, gabarits) car ce contexte est injecté partout.
    lang = (u.get("langue") or "fr").lower()
    langue_sortie = LANGUES_CONTENU.get(lang, lang)
    # Toujours explicite (fr inclus) : les instructions sont en anglais pour économiser des tokens,
    # mais TOUTE la sortie doit être dans la langue du client.
    lignes.append(
        f"OUTPUT LANGUAGE: write ALL produced content (titles, posts, hooks, slides, scripts, CTAs, hashtags) "
        f"in {langue_sortie}. The instructions below may be in English, but the output MUST be in {langue_sortie}. "
        f"Never mix languages within a single piece of content."
    )
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
    if u.get("hooks") and inclure_hooks:
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
    lignes.append(REGLES_ANTI_IA)
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
    "You are a content strategist for the personal brand described below. "
    "You propose post topic ideas relevant to its sector and audience.\n\n"
)

# Chaque sujet n'est pas une simple phrase : c'est un brief à 4 dimensions, pour que
# le générateur de contenu ait une instruction exploitable (pas juste un thème).
# Valeurs FIGÉES : l'IA choisit dedans, jamais en dehors (sinon l'UI ne sait pas afficher).
DIMENSIONS = {
    "objectif": ["Engagement", "Notoriété", "Éducation", "Conversion",
                 "Génération de prospects", "Fidélisation", "Preuve sociale"],
    "angle":    ["Problème → solution", "Astuce", "Comparaison", "Controverse",
                 "Storytelling", "Témoignage", "Démonstration", "Inspiration",
                 "Humour", "Curiosité"],
    "cible":    ["Nouvelle audience", "Prospect", "Client", "Client fidèle", "Segment spécifique"],
    "format":   ["Reel", "Post", "Carrousel", "Story", "Article", "Vidéo longue"],
}
_DIM_LABELS = {"objectif": "Objective", "angle": "Angle", "cible": "Target", "format": "Format"}

# Un format n'a de sens que si un réseau capable de le publier est connecté.
# (au moins un des réseaux listés suffit)
FORMAT_PLATEFORMES = {
    "Post":         {"linkedin", "facebook", "instagram", "googlebusiness", "twitter"},
    "Carrousel":    {"linkedin", "instagram", "facebook"},
    "Story":        {"instagram", "facebook"},
    "Reel":         {"tiktok", "instagram", "youtube"},
    "Article":      {"linkedin"},
    "Vidéo longue": {"youtube"},
}


def _formats_disponibles(telegram_id: str) -> list:
    """Sous-ensemble de DIMENSIONS['format'] réellement publiable vu les réseaux
    connectés de ce compte. Repli sur ['Post','Carrousel'] si rien de connecté."""
    try:
        from services import social_service
        connectes = set(social_service.comptes(telegram_id).keys())
    except Exception:
        connectes = set()
    dispo = [f for f in DIMENSIONS["format"] if FORMAT_PLATEFORMES.get(f, set()) & connectes]
    return dispo or ["Post", "Carrousel"]


def dimensions_pour(telegram_id: str) -> dict:
    """Les 4 listes de dimensions pour ce compte — 'format' filtré sur ses réseaux."""
    return {**DIMENSIONS, "format": _formats_disponibles(telegram_id)}


def _valider_dimension(cle: str, valeur) -> str | None:
    """Garde une valeur de dimension seulement si elle appartient à la liste figée."""
    v = (valeur or "").strip() if isinstance(valeur, str) else ""
    return v if v in DIMENSIONS.get(cle, ()) else None


def _valider_format(valeur, autorises: list) -> str:
    """Valide un format ET le contraint aux formats publiables ; repli sur Post."""
    v = _valider_dimension("format", valeur)
    if v and v in autorises:
        return v
    return "Post" if "Post" in autorises else (autorises[0] if autorises else "Post")


def brief_dimensions(dims: dict) -> str:
    """Transforme les dimensions d'un sujet en BRIEF injecté dans la rédaction.
    Vide si aucune dimension exploitable — la rédaction retombe alors sur son
    comportement d'avant (le sujet seul)."""
    if not isinstance(dims, dict):
        return ""
    lignes = []
    for cle, label in _DIM_LABELS.items():
        v = _valider_dimension(cle, dims.get(cle))
        if v:
            lignes.append(f"- {label} : {v}")
    if not lignes:
        return ""
    txt = ("\n\nCONTENT BRIEF (respect its tone and intent):\n" + "\n".join(lignes))
    # CTA driven by the whole brief: action = objective, tone = angle, audience = target.
    # No fixed table: the model writes the CTA by combining the three (+ the brand's usual CTAs).
    if _valider_dimension("objectif", dims.get("objectif")):
        txt += ("\nEnd with a call to action (CTA) that follows this brief: the objective sets the action, "
                "the angle sets the tone, the target sets who you address. Reuse one of the brand's usual CTAs "
                "if it fits, otherwise write a natural, specific one, never generic.")
    return txt


def _sans_tiret(txt: str) -> str:
    """Voix Postorico : aucun tiret cadratin/demi-cadratin. On les remplace par
    une virgule (séparateur/incise) et on nettoie les espaces."""
    if not isinstance(txt, str):
        return txt
    t = (txt.replace(" — ", ", ").replace(" – ", ", ")
            .replace(" —", ", ").replace(" –", ", ")
            .replace("— ", ", ").replace("– ", ", ")
            .replace("—", ", ").replace("–", ", "))
    while "  " in t:
        t = t.replace("  ", " ")
    return t.replace(" ,", ",").replace(",,", ",").strip(" ,")


def _norm(s: str) -> str:
    """Normalise un titre pour comparer (minuscules, sans accents, alphanumérique)."""
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")  # retire les accents
    s = "".join(c if c.isalnum() else " " for c in s)
    return " ".join(s.split())


def _sujets_historique(telegram_id: str, limit: int = 60) -> list:
    """Titres des sujets déjà proposés (brouillons) ou publiés (contenus), récents d'abord.

    Sert de MÉMOIRE anti-répétition : on la réinjecte dans le prompt et on filtre la sortie.
    """
    titres = []
    for table, col in (("brouillons", "created_at"), ("contenu", "created_at")):
        try:
            rows = (supabase.table(table).select("titre, " + col)
                    .eq("telegram_id", telegram_id).order(col, desc=True).limit(limit).execute().data or [])
        except Exception:
            # Table sans created_at (ou autre) : repli sans tri
            try:
                rows = (supabase.table(table).select("titre")
                        .eq("telegram_id", telegram_id).limit(limit).execute().data or [])
            except Exception as e:
                logger.warning(f"historique {table}: {e}")
                rows = []
        titres += [r.get("titre") for r in rows if r.get("titre")]
    # Dédup en gardant l'ordre (récents d'abord)
    seen, out = set(), []
    for t in titres:
        k = _norm(t)
        if k and k not in seen:
            seen.add(k)
            out.append(t.strip())
    return out


def generer_sujets(telegram_id: str, nombre: int = 6, filtres: dict = None) -> dict:
    """Propose des sujets TAGGÉS (objectif/angle/cible/format), pas une liste plate.
    `filtres` : dimensions imposées par l'utilisateur (ex. {objectif:'Conversion',
    format:'Reel'}) ; celles laissées libres sont variées automatiquement."""
    if not _client:
        return {"error": "no_api_key"}
    u = _charger_marque(telegram_id)
    if not (u.get("secteur") or "").strip():
        return {"error": "profil_incomplet"}
    contexte = _contexte_marque(u)

    # Mémoire anti-boucle : sujets déjà vus (à éviter dans le prompt + filtrer en sortie)
    historique = _sujets_historique(telegram_id)
    consigne = ""
    if historique:
        deja = "\n".join(f"- {t}" for t in historique[:20])  # petite liste = coût négligeable
        consigne = (
            f"\n\nTopics ALREADY proposed or published for this brand. You must NOT repeat them, "
            f"rephrase them, or propose simple variants:\n{deja}\n"
            f"Propose genuinely new angles, different from this list."
        )

    # Formats limités aux réseaux connectés (pas de Reel si aucun compte adapté).
    formats_ok = _formats_disponibles(telegram_id)

    # Dimensions : imposées par l'utilisateur (filtres) OU variées par l'IA pour la diversité.
    filtres = {k: v for k in DIMENSIONS if (v := _valider_dimension(k, (filtres or {}).get(k)))}
    contraintes = []
    for cle, label in _DIM_LABELS.items():
        valeurs = formats_ok if cle == "format" else DIMENSIONS[cle]
        if cle in filtres:
            contraintes.append(f"{label} = \"{filtres[cle]}\" for ALL topics (imposed).")
        else:
            contraintes.append(f"{label}: pick ONE from [{', '.join(valeurs)}], varying it from one topic to the next.")
    menu = "\n".join(f"- {c}" for c in contraintes)

    # On demande quelques sujets de rab : après filtrage des doublons, il en reste assez.
    demande = nombre + 4
    resp = _messages_create(
        model=SUJETS_MODEL,
        max_tokens=1600,
        system=ROLE_SUJETS + contexte,
        messages=[{
            "role": "user",
            "content": (
                f"Propose {demande} content topic ideas for this brand. Each topic is an actionable "
                f"BRIEF described by 4 dimensions:\n{menu}\n\n"
                f"Answer ONLY with a JSON array (no surrounding text), one object per topic:\n"
                f'[{{"sujet":"…","objectif":"…","angle":"…","cible":"…","format":"…"}}]\n'
                f'"sujet" = a concrete, catchy hook (not a vague theme), written in the output language. '
                f"The other fields take EXACTLY one value from the lists above."
                + consigne
            ),
        }],
    )
    texte = _texte(resp)
    try:
        brut = json.loads(texte[texte.index("["):texte.rindex("]") + 1])
    except Exception as e:
        logger.warning(f"sujets JSON illisible ({e}) — repli liste plate")
        brut = [{"sujet": l.strip(" -•\t0123456789.").strip()} for l in texte.splitlines() if l.strip()]

    # Filtre anti-doublon : vs l'historique ET entre eux (sécurité si le modèle répète)
    existants = {_norm(t) for t in historique}
    seen, uniques = set(), []
    for o in brut:
        s = (o.get("sujet") if isinstance(o, dict) else str(o)) or ""
        s = _sans_tiret(s.strip())
        k = _norm(s)
        if not k or k in existants or k in seen:
            continue
        seen.add(k)
        d = o if isinstance(o, dict) else {}
        uniques.append({
            "sujet": s,
            "objectif": filtres.get("objectif") or _valider_dimension("objectif", d.get("objectif")),
            "angle":    filtres.get("angle")    or _valider_dimension("angle", d.get("angle")),
            "cible":    filtres.get("cible")    or _valider_dimension("cible", d.get("cible")),
            "format":   filtres.get("format")   or _valider_format(d.get("format"), formats_ok),
        })
    return {"sujets": uniques[:nombre], "usage": _usage(resp)}


# ---------------------------------------------------------------------------
# Agent RÉDACTION
# ---------------------------------------------------------------------------
# Longueur cible par réseau : (cible confortable, limite dure de la plateforme).
# La cible laisse ~10-15% de marge sous la limite (hashtags, émojis comptent double
# sur certains réseaux) pour que Zernio n'ait jamais à refuser une légende.
LONGUEURS = {
    "instagram": (1800, 2200),
    "tiktok": (1800, 2200),
    "googlebusiness": (1200, 1500),
    "twitter": (250, 280),
    "linkedin": (2500, 3000),
    "facebook": (2500, 60000),
    "youtube": (3500, 5000),
}


def _consigne_longueur(reseau: str) -> str:
    cible, limite = LONGUEURS.get(reseau, (2500, 3000))
    return (
        f" LONGUEUR STRICTE : {cible} caractères MAXIMUM, espaces et hashtags compris "
        f"(limite {RESEAUX.get(reseau, reseau)} : {limite} — un post trop long est refusé à la publication)."
    )


ROLE_REDACTION = (
    "Tu es le rédacteur attitré de la marque personnelle décrite ci-dessous. "
    "Tu écris EXCLUSIVEMENT dans sa voix. Tu produis un post prêt à publier : "
    "pas d'explications, pas de méta-commentaire, pas de 'Voici votre post'. "
    "Réponds uniquement avec le texte du post, en français.\n\n"
)


def rediger_post(telegram_id: str, sujet: str, reseau: str = "linkedin", model: str = None, cache: bool = False, dimensions: dict = None) -> dict:
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
                f"Écris UN post {reseau_label} prêt à publier sur le sujet :\n\n\"{sujet}\""
                + brief_dimensions(dimensions)
                + f"\n\nFormat {reseau_label} : accroche forte en 1ʳᵉ ligne, lignes courtes et aérées, "
                f"une seule idée centrale, et une question/appel à l'engagement en fin."
                + _consigne_longueur(reseau)
                + " Donne uniquement le texte du post."
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
                                         f"dans la voix de la marque.{_consigne_longueur(reseau)} "
                                         f"Donne uniquement le texte."},
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
    "La 'legende' est le TEXTE DU POST (la description au-dessus du carrousel) : COURTE (2 à 4 lignes). "
    "Un hook qui stoppe le scroll + une invitation à swiper/enregistrer + UN SEUL CTA. Elle NE répète PAS "
    "le contenu des slides — le carrousel porte le fond, la légende ne fait qu'accrocher. "
    "Tu peux terminer par 2 à 4 hashtags ciblés. "
    "Réponds UNIQUEMENT avec du JSON valide de cette forme :\n"
    '{"hook":"...","legende":"...","slides":[{"titre":"...","texte":"...","pills":["..",".."],"pro_tip":"...","icon":"chart"}],'
    '"cta":{"titre":"...","texte":"..."}}\n\n'
)


def rediger_carrousel(telegram_id: str, sujet: str, nb_slides: int = 5, model: str = None, cache: bool = False, dimensions: dict = None) -> dict:
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
            "content": (f"Sujet du carrousel : \"{sujet}\"." + brief_dimensions(dimensions) + "\n"
                        f"Donne le hook, la legende (courte : accroche + invitation à swiper + 1 CTA, sans répéter les slides), "
                        f"EXACTEMENT {nb_idees} idées (avec titre court, texte, pills, pro_tip) et le cta, en JSON."),
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
        "legende": (data.get("legende") or "").strip(),
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


def rediger_script(telegram_id: str, sujet: str, type_video: str = "Reel", model: str = None, cache: bool = False, dimensions: dict = None) -> dict:
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
                f"Écris un script vidéo de type « {tv} » sur le sujet :\n\n\"{sujet}\""
                + brief_dimensions(dimensions)
                + f"\n\n"
                f"Format de sortie clair :\n"
                f"[HOOK] — l'accroche des 3 premières secondes\n"
                f"[CORPS] — les scènes / idées avec le texte exact à dire\n"
                f"[CTA] — l'appel à l'action final\n"
                f"Adapte la longueur au format. Donne uniquement le script."
            ),
        }],
    )
    return {"script": _texte(resp), "usage": _usage(resp)}


# ---------------------------------------------------------------------------
# Agent GABARIT : transforme un post en slots de visuel (feed cohérent)
# ---------------------------------------------------------------------------
ROLE_GABARIT = (
    "Tu transformes un post en VISUEL court et percutant pour un feed social. "
    "Tu écris dans la voix de la marque ci-dessous. "
    "IMPORTANT : le contenu (titre, accroche, citation, chiffres...) doit être condensé "
    "STRICTEMENT à partir du texte du post fourni par l'utilisateur, jamais inventé ni tiré "
    "d'un autre sujet — même si la voix de marque mentionne d'autres exemples ou thèmes. "
    "Réponds UNIQUEMENT en JSON valide, sans texte autour.\n\n"
)

# Pour chaque gabarit : (description du JSON à produire, liste des champs à appliquer sur les défauts)
_GAB_SPECS = {
    "statement": ('{"eyebrow":"1-2 mots","title_lines":[{"t":"LIGNE COURTE MAJUSCULES","c":"a (optionnel)"}],"subtitle":"phrase courte"} '
                  '— title_lines = 3 à 4 lignes de max 3 mots, marque 1-2 lignes avec "c":"a".',
                  ["eyebrow", "title_lines", "subtitle"]),
    "split": ('{"eyebrow":"1-2 mots","title_lines":[{"t":"LIGNE COURTE MAJUSCULES","c":"a (optionnel)"}],"subtitle":"phrase courte"} '
              '— title_lines = 3 lignes courtes, marque 1 ligne avec "c":"a".',
              ["eyebrow", "title_lines", "subtitle"]),
    "acquisition": ('{"eyebrow":"1-2 mots","title_lines":[{"t":"MAJUSCULES","c":"v (optionnel)"}],"stats":[{"k":"libellé","n":"valeur","v":true}]} '
                    '— title_lines = 2-3 lignes ; stats = 4 (chiffres du post, sinon "n":"—", jamais de faux chiffres).',
                    ["eyebrow", "title_lines", "stats"]),
    "citation": ('{"label":"Témoignage","quote_lines":[{"t":"ligne courte","c":"v sur la dernière"}]} '
                 '— quote_lines = 2-3 lignes, une citation percutante tirée du post.',
                 ["label", "quote_lines"]),
    "dashboard": ('{"eyebrow":"1-2 mots","title_lines":[{"t":"MAJUSCULES","c":"v (optionnel)"}]} — title_lines = 3 lignes.',
                  ["eyebrow", "title_lines"]),
    "features": ('{"eyebrow":"1-2 mots","title_lines":[{"t":"MAJUSCULES","c":"a (optionnel)"}],"features":[{"t":"titre court","d":"phrase"}]} '
                 '— title_lines = 2-3 lignes ; features = EXACTEMENT 3.',
                 ["eyebrow", "title_lines", "features"]),
    "phone": ('{"eyebrow":"1-2 mots","title_lines":[{"t":"COURT","c":"v (optionnel)"}],"subtitle":"phrase courte","bubbles":[{"side":"in|out","t":"message court"}]} '
              '— bubbles = 3 à 4 messages d\'une conversation client réaliste.',
              ["eyebrow", "title_lines", "subtitle", "bubbles"]),
    "services": ('{"eyebrow":"1-2 mots","title_lines":[{"t":"MAJUSCULES","c":"a (optionnel)"}],"services":["mot","mot"],"flow":["Étape début","Étape fin"]} '
                 '— title_lines = 2 lignes ; services = 4 mots ; flow = 2 étapes.',
                 ["eyebrow", "title_lines", "services", "flow"]),
    "mission": ('{"label":"Notre mission","title_lines":[{"t":"MAJUSCULES","c":"v (optionnel)"}],"subtitle":"phrase","statrow":[{"n":"valeur","k":"libellé"}]} '
                '— title_lines = 2 lignes ; statrow = 4 (chiffres du post sinon "n":"—").',
                ["label", "title_lines", "subtitle", "statrow"]),
    "integrations": ('{"eyebrow":"1-2 mots","title_lines":[{"t":"MAJUSCULES","c":"v (optionnel)"}],"subtitle":"phrase courte"} — title_lines = 2 lignes.',
                     ["eyebrow", "title_lines", "subtitle"]),
    "testimonial": ('{"label":"Nos clients","quote_lines":[{"t":"phrase de l\'avis"}],"author":{"name":"Prénom N.","role":"métier · ville"}} '
                    '— une citation client en 1-2 lignes ; author = client (pas la marque).',
                    ["label", "quote_lines", "author"]),
    "people": ('{"eyebrow":"1-2 mots","title_lines":[{"t":"MAJUSCULES","c":"a (optionnel)"}],"subtitle":"phrase courte"} — title_lines = 3 lignes.',
               ["eyebrow", "title_lines", "subtitle"]),
    "closing": ('{"title_lines":[{"t":"MAJUSCULES","c":"v (optionnel)"}],"subtitle":"phrase courte"} — title_lines = 2 lignes.',
                ["title_lines", "subtitle"]),
}


def _gab_lines(v):
    out = []
    for ln in (v or []):
        if isinstance(ln, str) and ln.strip():
            out.append({"t": ln.strip()})
        elif isinstance(ln, dict) and (ln.get("t") or "").strip():
            item = {"t": str(ln["t"]).strip()}
            if ln.get("c") in ("a", "v"):
                item["c"] = ln["c"]
            out.append(item)
    return out[:4]


def composer_gabarit(telegram_id: str, gabarit: str, texte: str) -> dict:
    """À partir du texte d'un post, écrit les champs texte du gabarit (titre/eyebrow/citation/etc.)
    et les pose sur les défauts structurels du gabarit (stats/services/bulles… restent cohérents)."""
    if not _client:
        return {"error": "no_api_key"}
    import copy
    from services import gabarit_service  # import tardif (évite le cycle)
    if gabarit not in _GAB_SPECS:
        gabarit = "statement"
    u = _charger_marque(telegram_id)
    contexte = _contexte_marque(u, inclure_hooks=False)
    nom = u.get("nom") or u.get("user_name") or ""
    spec, fields = _GAB_SPECS[gabarit]
    resp = _messages_create(
        model=CLAUDE_MODEL,
        max_tokens=700,
        system=_system(ROLE_GABARIT, contexte),
        messages=[{
            "role": "user",
            "content": f'Post :\n"""{(texte or "")[:1500]}"""\n\nProduis le visuel "{gabarit}" au format JSON : {spec}',
        }],
    )
    txt = _texte(resp)
    if "{" in txt and "}" in txt:
        txt = txt[txt.find("{"):txt.rfind("}") + 1]
    try:
        data = json.loads(txt)
    except Exception as e:
        logger.error(f"gabarit compose parse: {e} | {txt[:200]}")
        return {"error": "parse"}

    # Base = exemple du gabarit (structure complète, toujours rendable) ; on pose les champs IA dessus.
    slots = copy.deepcopy(gabarit_service._SAMPLES.get(gabarit, {}))
    for f in fields:
        if f not in data or data[f] in (None, "", [], {}):
            continue
        v = data[f]
        if f in ("title_lines", "quote_lines"):
            lines = _gab_lines(v)
            if lines:
                slots[f] = lines
        elif f == "stats":
            slots["stats"] = [{"k": str(x.get("k", "")), "n": str(x.get("n", "—")), **({"v": True} if x.get("v") else {})}
                              for x in v if isinstance(x, dict)][:4]
        elif f == "statrow":
            slots["statrow"] = [{"n": str(x.get("n", "—")), "k": str(x.get("k", ""))} for x in v if isinstance(x, dict)][:4]
        elif f == "features":
            slots["features"] = [{"t": str(x.get("t", "")), "d": str(x.get("d", ""))} for x in v if isinstance(x, dict)][:3]
        elif f == "bubbles":
            slots["bubbles"] = [{"side": ("out" if x.get("side") == "out" else "in"), "t": str(x.get("t", ""))}
                                for x in v if isinstance(x, dict)][:5]
        elif f in ("services", "flow"):
            slots[f] = [str(x) for x in v if str(x).strip()][:(4 if f == "services" else 2)]
        elif f == "author":
            slots["author"] = {"name": str((v or {}).get("name", "")), "role": str((v or {}).get("role", ""))}
        else:  # eyebrow, label, subtitle
            slots[f] = str(v)

    # Auteur de la citation = la marque (sauf témoignage client)
    if gabarit == "citation":
        slots["author"] = {"name": nom, "role": ""}
    return {"slots": slots, "usage": _usage(resp)}
