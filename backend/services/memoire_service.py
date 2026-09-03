"""
Mémoire de voix (RAG phase 1).

Décrire la voix d'un client (« ton direct, sans jargon ») ne suffit pas à Claude
pour l'imiter ; la MONTRER, oui. On garde donc un vecteur par contenu validé /
planifié / publié (table contenu_embeddings, pgvector) et, au moment de rédiger
un post, un carrousel ou un script, on retrouve les 3-4 contenus validés du
compte les plus proches du sujet pour les donner en exemples.

Ce qui reste dans le system prompt et n'est PAS ici : le profil de marque et
les règles (anti-IA, « à éviter », offres) — elles doivent s'appliquer à 100 %
des générations, une recherche par similarité n'a pas ce rôle.

Embeddings : OpenAI text-embedding-3-small (1536 dims, ~0,02 $/M tokens),
journalisés dans usage_log avec leur coût réel. Toute erreur ici est avalée et
journalisée : la mémoire améliore la rédaction, elle ne doit jamais bloquer une
validation ni une génération.
"""
from config import supabase, logger, OPENAI_API_KEY, EMBEDDING_MODEL

STATUTS_INDEXES = ("Valider", "Planifie", "Publie")
MAX_TEXTE = 2000        # caractères indexés par contenu
MAX_EXEMPLE = 1200      # caractères d'un exemple injecté dans le prompt
PRIX_PAR_M_TOKENS = 0.02
_GENRE_LABEL = {"post": "POSTS", "carrousel": "CAROUSELS", "script": "VIDEO SCRIPTS"}
_client = None
_sans_cle_signale = False


def _openai():
    global _client, _sans_cle_signale
    if not OPENAI_API_KEY:
        if not _sans_cle_signale:
            logger.info("mémoire de voix : OPENAI_API_KEY absente, embeddings désactivés")
            _sans_cle_signale = True
        return None
    if _client is None:
        from openai import OpenAI
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


# ----------------------------------------------------------------------------
# Quel texte représente un contenu ?
# ----------------------------------------------------------------------------
def genre_de(row: dict):
    """'post' | 'carrousel' | 'script' | None (non indexé, ex. Story)."""
    t = (row.get("type") or "").strip()
    if not t or t.lower().startswith("post"):
        return "post"
    if t == "Carrousel":
        return "carrousel"
    if t in ("Reel", "Video", "Short") and (row.get("script") or "").strip():
        return "script"
    return None


def texte_de(row: dict) -> str:
    g = genre_de(row)
    if g == "carrousel":
        cd = row.get("carrousel_data")
        if isinstance(cd, dict) and (cd.get("hook") or cd.get("slides")):
            parts = []
            if cd.get("hook"):
                parts.append(str(cd["hook"]))
            for s in cd.get("slides") or []:
                for k in ("titre", "texte", "pro_tip"):
                    if s.get(k):
                        parts.append(str(s[k]))
            cta = cd.get("cta")
            if isinstance(cta, dict):
                for k in ("titre", "texte"):
                    if cta.get(k):
                        parts.append(str(cta[k]))
            elif cta:
                parts.append(str(cta))
            return "\n".join(parts)[:MAX_TEXTE]
        return (row.get("contenu") or "")[:MAX_TEXTE]
    if g == "script":
        return (row.get("script") or row.get("contenu") or "")[:MAX_TEXTE]
    return (row.get("contenu") or "")[:MAX_TEXTE]


# ----------------------------------------------------------------------------
# Embeddings
# ----------------------------------------------------------------------------
def embed(textes: list, telegram_id: str = None) -> list:
    """Vecteurs des textes (même ordre). [] si pas de clé ou erreur — jamais d'exception."""
    textes = [t if (t or "").strip() else " " for t in textes]
    if not textes:
        return []
    client = _openai()
    if client is None:
        return []
    out = []
    try:
        for i in range(0, len(textes), 100):
            lot = textes[i:i + 100]
            resp = client.embeddings.create(model=EMBEDDING_MODEL, input=lot)
            out.extend([d.embedding for d in sorted(resp.data, key=lambda d: d.index)])
            tokens = getattr(getattr(resp, "usage", None), "total_tokens", 0) or 0
            if tokens:
                try:
                    from services import usage_service
                    usage_service.log(telegram_id, "embedding", EMBEDDING_MODEL, {"input": tokens}, 0,
                                      cost_override=round(tokens / 1e6 * PRIX_PAR_M_TOKENS, 8))
                except Exception as e:
                    logger.warning(f"journal embedding: {e}")
        return out
    except Exception as e:
        logger.warning(f"embeddings OpenAI: {e}")
        return []


# ----------------------------------------------------------------------------
# Indexation
# ----------------------------------------------------------------------------
def _retirer(contenu_id: str) -> None:
    try:
        supabase.table("contenu_embeddings").delete().eq("contenu_id", contenu_id).execute()
    except Exception as e:
        logger.warning(f"mémoire retrait {contenu_id}: {e}")


def indexer_contenu(row: dict) -> bool:
    """(Ré)indexe un contenu s'il est validé/planifié/publié et d'un genre couvert ;
    sinon retire son vecteur (contenu repassé « À valider »). Jamais d'exception."""
    try:
        cid = row.get("id")
        if not cid:
            return False
        genre = genre_de(row)
        texte = texte_de(row).strip()
        if row.get("statut") not in STATUTS_INDEXES or not genre or len(texte) < 40:
            _retirer(cid)
            return False
        vec = embed([texte], row.get("telegram_id"))
        if not vec:
            return False
        supabase.table("contenu_embeddings").upsert({
            "contenu_id": cid, "telegram_id": row.get("telegram_id"), "genre": genre,
            "reseau_cible": row.get("reseau_cible"), "texte": texte, "embedding": vec[0],
        }, on_conflict="contenu_id").execute()
        return True
    except Exception as e:
        logger.warning(f"mémoire indexation {row.get('id')}: {e}")
        return False


def reindexer_compte(telegram_id: str = None, lot: int = 50) -> dict:
    """Rattrapage : tous les contenus éligibles (d'un compte, ou de tous si None),
    embeddings par lots. Retourne {indexes, ignores, par_genre}."""
    rows, start, page = [], 0, 1000
    while True:
        q = (supabase.table("contenu")
             .select("id, telegram_id, type, statut, reseau_cible, contenu, script, carrousel_data")
             .in_("statut", list(STATUTS_INDEXES)))
        if telegram_id:
            q = q.eq("telegram_id", telegram_id)
        r = q.range(start, start + page - 1).execute()
        rows += r.data or []
        if len(r.data or []) < page:
            break
        start += page
    eligibles = [(row, texte_de(row).strip()) for row in rows if genre_de(row)]
    eligibles = [(row, t) for row, t in eligibles if len(t) >= 40]
    indexes, par_genre = 0, {}
    for i in range(0, len(eligibles), lot):
        tranche = eligibles[i:i + lot]
        vecs = embed([t for _, t in tranche], tranche[0][0].get("telegram_id") if telegram_id else None)
        if len(vecs) != len(tranche):
            logger.warning("mémoire rattrapage : lot d'embeddings incomplet, lot ignoré")
            continue
        lignes = []
        for (row, t), v in zip(tranche, vecs):
            g = genre_de(row)
            par_genre[g] = par_genre.get(g, 0) + 1
            lignes.append({"contenu_id": row["id"], "telegram_id": row["telegram_id"], "genre": g,
                           "reseau_cible": row.get("reseau_cible"), "texte": t, "embedding": v})
        supabase.table("contenu_embeddings").upsert(lignes, on_conflict="contenu_id").execute()
        indexes += len(lignes)
    return {"indexes": indexes, "ignores": len(rows) - len(eligibles), "par_genre": par_genre}


# ----------------------------------------------------------------------------
# Récupération à la rédaction
# ----------------------------------------------------------------------------
def exemples_voix(telegram_id: str, requete: str, genre: str, reseau: str = None,
                  n: int = 4, seuil: float = 0.30) -> list:
    """Les contenus validés du compte les plus proches de `requete` (sujet + angle).
    [] si moins de 2 résultats au-dessus du seuil : démarrage à froid = pas d'exemples,
    la rédaction se comporte exactement comme avant."""
    if not (requete or "").strip():
        return []
    vec = embed([requete[:2000]], telegram_id)
    if not vec:
        return []
    try:
        r = supabase.rpc("match_contenu_embeddings", {
            "p_user": telegram_id, "p_embedding": vec[0], "p_genre": genre,
            "p_reseau": reseau, "p_limit": n,
        }).execute()
    except Exception as e:
        logger.warning(f"mémoire recherche ({genre}): {e}")
        return []
    res = [x for x in (r.data or []) if (x.get("similarite") or 0) >= seuil]
    logger.info("mémoire de voix %s/%s : %s", telegram_id[:8], genre,
                ", ".join(f"{x['similarite']:.2f}" for x in (r.data or [])) or "aucun")
    return res if len(res) >= 2 else []


def bloc_exemples(exemples: list, genre: str, reseau_label: str = "") -> str:
    """Bloc à ajouter au system prompt (partie `extra`). "" si rien à montrer."""
    if not exemples:
        return ""
    vus, uniques = set(), []
    for e in exemples:
        t = (e.get("texte") or "").strip()
        cle = t[:200]
        if not t or cle in vus:
            continue  # même texte recyclé sur plusieurs réseaux
        vus.add(cle)
        uniques.append(t[:MAX_EXEMPLE])
    if not uniques:
        return ""
    label = _GENRE_LABEL.get(genre, "POSTS")
    ou = f" {reseau_label}" if reseau_label else ""
    tete = (f"\n\n## THE CLIENT'S OWN VALIDATED{ou} {label} CLOSEST TO THIS TOPIC\n"
            "These were approved and published by the client: this is their real voice. "
            "Mimic the voice, rhythm, sentence length, structure and level of detail. "
            "Never copy a sentence, never reuse the same hook, never repeat their facts as if new.\n")
    corps = "".join(f"\n### Example {i + 1}\n{t}\n" for i, t in enumerate(uniques))
    return tete + corps
