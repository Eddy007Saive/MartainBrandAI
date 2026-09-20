"""
Éditeur vidéo manuel (façon CapCut) : projets de montage.

Un projet est un JSON (schéma : backend/remotion/src/montage/schema.js) que le
navigateur prévisualise avec @remotion/player et que le worker de rendu passe tel
quel à la composition Remotion « Montage ». Ce service ne connaît que la table
`montages`, les médias mobilisables (banque, vidéos du compte, musiques) et le
départ d'un rendu ; le rendu lui-même est fait par render_service.
"""
import copy
import re
from datetime import datetime, timezone
from config import supabase, logger
from services import banque_service, music_library, quota_service, render_service

TYPES_PISTE = ("texte", "soustitres", "image", "video", "audio")
TYPES_ELEMENT = ("texte", "soustitre", "image", "video", "audio")
MAX_ELEMENTS = 300
MAX_DUREE_S = 600.0
_URL_OK = re.compile(r"^https://", re.I)

STATUTS = ("brouillon", "rendu_en_cours", "rendu", "echec")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def projet_vide() -> dict:
    """Même forme que schema.projetVide() côté navigateur (source de vérité : le JS)."""
    return {
        "version": 1, "largeur": 1080, "hauteur": 1920, "fps": 30, "fond": "#020617",
        "pistes": [
            {"id": "p-texte", "type": "texte", "nom": "Textes", "muet": False, "verrou": False},
            {"id": "p-soustitres", "type": "soustitres", "nom": "Sous-titres", "muet": False, "verrou": False},
            {"id": "p-image", "type": "image", "nom": "Images", "muet": False, "verrou": False},
            {"id": "p-video", "type": "video", "nom": "Vidéo", "muet": False, "verrou": False},
            {"id": "p-audio", "type": "audio", "nom": "Audio", "muet": False, "verrou": False},
        ],
        "elements": [],
        "soustitres": {"style": {}},
    }


def _nombre(v, defaut=0.0, mini=None, maxi=None) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        x = defaut
    if mini is not None:
        x = max(mini, x)
    if maxi is not None:
        x = min(maxi, x)
    return x


def normaliser(projet: dict) -> dict:
    """Rend le projet sûr pour le rendu : types connus, nombres bornés, URLs https,
    éléments orphelins rattachés à la piste de leur type. Ne lève pas : ce qui est
    inconnu est retiré, jamais inventé."""
    base = projet_vide()
    p = copy.deepcopy(projet) if isinstance(projet, dict) else {}
    out = {
        "version": 1,
        "largeur": int(_nombre(p.get("largeur"), 1080, 360, 2160)),
        "hauteur": int(_nombre(p.get("hauteur"), 1920, 360, 3840)),
        "fps": int(_nombre(p.get("fps"), 30, 24, 60)),
        "fond": str(p.get("fond") or "#020617")[:32],
        "pistes": [], "elements": [],
        "soustitres": {"style": dict((p.get("soustitres") or {}).get("style") or {})},
    }
    cv = p.get("couverture")
    if isinstance(cv, (int, float)) and not isinstance(cv, bool) and cv >= 0:
        out["couverture"] = round(min(float(cv), MAX_DUREE_S), 2)      # instant choisi pour la miniature
    pistes = [x for x in (p.get("pistes") or []) if isinstance(x, dict) and x.get("type") in TYPES_PISTE and x.get("id")]
    out["pistes"] = [{"id": str(x["id"])[:40], "type": x["type"], "nom": str(x.get("nom") or x["type"])[:40],
                      "muet": bool(x.get("muet")), "verrou": bool(x.get("verrou"))} for x in pistes] or base["pistes"]
    ids_pistes = {x["id"]: x["type"] for x in out["pistes"]}
    piste_par_type = {}
    for x in out["pistes"]:
        piste_par_type.setdefault(x["type"], x["id"])
    for e in (p.get("elements") or [])[:MAX_ELEMENTS]:
        if not isinstance(e, dict) or e.get("type") not in TYPES_ELEMENT:
            continue
        t = e["type"]
        tp = "soustitres" if t == "soustitre" else t
        piste = e.get("piste") if ids_pistes.get(e.get("piste")) == tp else piste_par_type.get(tp)
        if not piste:
            continue
        src = e.get("src")
        if t in ("video", "image", "audio"):
            if not (isinstance(src, str) and _URL_OK.match(src)):
                continue
        el = {
            "id": str(e.get("id") or f"e{len(out['elements'])}")[:40], "piste": piste, "type": t,
            "debut": round(_nombre(e.get("debut"), 0, 0, MAX_DUREE_S), 3),
            "duree": round(_nombre(e.get("duree"), 1, 0.05, MAX_DUREE_S), 3),
            "opacite": _nombre(e.get("opacite"), 1, 0, 1),
        }
        if t in ("video", "image", "audio"):
            el["src"] = src
        if t in ("video", "audio"):
            el["decalage"] = round(_nombre(e.get("decalage"), 0, 0, MAX_DUREE_S), 3)
            el["volume"] = _nombre(e.get("volume"), 1, 0, 1)
        if t in ("video", "audio"):
            el["vitesse"] = _nombre(e.get("vitesse"), 1, 0.25, 4)
        if t == "audio":
            el["fonduSortie"] = _nombre(e.get("fonduSortie"), 0, 0, 10)
        if t in ("video", "image", "texte"):
            c = e.get("cadre") or {}
            el["cadre"] = {"x": _nombre(c.get("x"), 0, -100, 200), "y": _nombre(c.get("y"), 0, -100, 200),
                           "w": _nombre(c.get("w"), 100, 1, 300), "h": _nombre(c.get("h"), 100, 1, 300)}
            el["rotation"] = _nombre(e.get("rotation"), 0, -360, 360)
            if t != "texte":
                el["ajustement"] = e.get("ajustement") if e.get("ajustement") in ("cover", "contain") else "cover"
                el["rayon"] = _nombre(e.get("rayon"), 0, 0, 400)
        if t == "image":
            el["animation"] = str(e.get("animation") or "aucune")[:16]
        if t in ("video", "image") and isinstance(e.get("recadre"), dict):
            rc = e["recadre"]
            zoom, rx, ry = _nombre(rc.get("zoom"), 1, 1, 5), _nombre(rc.get("x"), 50, 0, 100), _nombre(rc.get("y"), 50, 0, 100)
            if zoom != 1 or rx != 50 or ry != 50:
                el["recadre"] = {"zoom": round(zoom, 3), "x": round(rx, 1), "y": round(ry, 1)}
        if t in ("video", "image") and isinstance(e.get("transition"), dict):
            tr = e["transition"]
            if tr.get("type") in ("fondu", "glisser", "zoom", "volet", "noir"):
                el["transition"] = {"type": tr["type"], "duree": _nombre(tr.get("duree"), 0.5, 0.1, 2)}
        if t in ("texte", "soustitre"):
            el["texte"] = str(e.get("texte") or "")[:600]
        if t == "soustitre" and isinstance(e.get("mots"), list):
            mots = []
            for m in e["mots"][:40]:
                if isinstance(m, dict) and str(m.get("texte") or "").strip():
                    mots.append({"t": round(_nombre(m.get("t"), 0, 0, MAX_DUREE_S), 3),
                                 "d": round(_nombre(m.get("d"), 0.3, 0.05, 30), 3),
                                 "texte": str(m["texte"]).strip()[:60]})
            if mots:
                el["mots"] = mots
        if t == "texte":
            el["style"] = {k: (v if isinstance(v, (str, int, float, bool)) else str(v))
                           for k, v in dict(e.get("style") or {}).items() if isinstance(k, str)}
        out["elements"].append(el)
    return out


def duree_s(projet: dict) -> float:
    fin = max([(_nombre(e.get("debut")) + _nombre(e.get("duree"))) for e in (projet or {}).get("elements", [])] or [0])
    return round(max(1.0, fin), 2)


# ------------------------------------------------------------------ CRUD
def _vignette(projet: dict) -> str | None:
    """Petite image de reconnaissance d'un montage : le premier plan image ou vidéo (Cloudinary)."""
    els = sorted([e for e in (projet or {}).get("elements", []) if e.get("type") in ("image", "video") and e.get("src")],
                 key=lambda e: e.get("debut") or 0)
    if not els:
        return None
    src = els[0]["src"]
    if "/video/upload/" in src:
        return src.replace("/upload/", "/upload/so_1,w_240,h_426,c_fill,q_auto/", 1).rsplit(".", 1)[0] + ".jpg"
    if "/image/upload/" in src:
        return src.replace("/upload/", "/upload/w_240,h_426,c_fill,q_auto/", 1)
    return None


def _resume(row: dict) -> dict:
    return {"id": row["id"], "apercu": _vignette(row.get("projet")), "titre": row.get("titre") or "Montage", "statut": row.get("statut") or "brouillon",
            "duree_s": duree_s(row.get("projet") or {}), "video_url": row.get("video_url"),
            "contenu_id": row.get("contenu_id"), "source_contenu_id": row.get("source_contenu_id"),
            "updated_at": row.get("updated_at"), "created_at": row.get("created_at")}


def lister(telegram_id: str) -> list:
    r = (supabase.table("montages").select("id, titre, statut, video_url, contenu_id, source_contenu_id, projet, updated_at, created_at")
         .eq("telegram_id", telegram_id).order("updated_at", desc=True).limit(100).execute())
    return [_resume(x) for x in (r.data or [])]


def creer(telegram_id: str, titre: str = None, projet: dict = None, source_contenu_id: str = None) -> dict:
    row = {"telegram_id": telegram_id, "titre": (titre or "Montage").strip()[:120],
           "projet": normaliser(projet) if projet else projet_vide(),
           "source_contenu_id": source_contenu_id, "statut": "brouillon"}
    r = supabase.table("montages").insert(row).execute()
    return r.data[0]


def lire(telegram_id: str, montage_id: str) -> dict | None:
    r = supabase.table("montages").select("*").eq("id", montage_id).eq("telegram_id", telegram_id).limit(1).execute()
    if not r.data:
        return None
    m = r.data[0]
    # Statut du rendu : la ligne Contenus fait foi (le worker n'écrit que là).
    if m.get("contenu_id") and m.get("statut") == "rendu_en_cours":
        try:
            c = (supabase.table("contenu").select("video_status, video_url, render_job")
                 .eq("id", m["contenu_id"]).limit(1).execute().data or [None])[0]
            if c and c.get("video_status") == "ready" and c.get("video_url") and not c.get("render_job"):
                m = _maj(montage_id, {"statut": "rendu", "video_url": c["video_url"]})
            elif c and c.get("video_status") in ("ready", "echec") and not (c.get("render_job") or {}).get("tentatives") is None                     and (c.get("video_status") == "echec" or not c.get("video_url") or (c.get("render_job") or {}).get("erreur")):
                # Le worker a abandonné (échec franc, ou restauration de la version précédente).
                m = _maj(montage_id, {"statut": "echec"})
            elif c is None:
                m = _maj(montage_id, {"statut": "brouillon", "contenu_id": None})
        except Exception as e:
            logger.warning(f"editeur statut rendu {montage_id}: {e}")
    return m


def _maj(montage_id: str, champs: dict) -> dict:
    champs = {**champs, "updated_at": _now()}
    r = supabase.table("montages").update(champs).eq("id", montage_id).execute()
    return r.data[0] if r.data else champs


def modifier(telegram_id: str, montage_id: str, projet: dict = None, titre: str = None) -> dict | None:
    m = lire(telegram_id, montage_id)
    if not m:
        return None
    champs = {}
    if projet is not None:
        champs["projet"] = normaliser(projet)
        # Une modification après un rendu : le montage redevient un brouillon (la vidéo
        # précédente reste dans Contenus jusqu'au prochain export).
        if m.get("statut") in ("rendu", "echec"):
            champs["statut"] = "brouillon"
    if titre is not None:
        champs["titre"] = titre.strip()[:120] or "Montage"
    if not champs:
        return m
    return _maj(montage_id, champs)


def supprimer(telegram_id: str, montage_id: str) -> bool:
    r = supabase.table("montages").delete().eq("id", montage_id).eq("telegram_id", telegram_id).execute()
    return bool(r.data)


# ------------------------------------------------------------------ médias
def medias(telegram_id: str) -> dict:
    """Tout ce que le client peut poser sur la timeline : sa banque (photos, clips),
    ses vidéos déjà produites (reels, montages, vidéos), la bibliothèque musicale."""
    banque = []
    try:
        banque = banque_service.lister(telegram_id)
    except Exception as e:
        logger.warning(f"editeur medias banque: {e}")
    videos = []
    try:
        r = (supabase.table("contenu").select("id, titre, type, video_url, video_preview_url, lien_visuel, created_at")
             .eq("telegram_id", telegram_id).not_.is_("video_url", "null").order("created_at", desc=True).limit(40).execute())
        videos = [{"id": c["id"], "titre": c.get("titre") or "", "type": c.get("type"), "url": c["video_url"],
                   "apercu_url": c.get("video_preview_url") or c.get("lien_visuel"), "created_at": c.get("created_at")}
                  for c in (r.data or []) if c.get("video_url")]
    except Exception as e:
        logger.warning(f"editeur medias videos: {e}")
    cats, pistes = [], []
    try:
        cats, pistes = music_library.bibliotheque(telegram_id)
    except Exception as e:
        logger.warning(f"editeur medias musiques: {e}")
    return {"banque": banque, "videos": videos,
            "musiques": [{"id": m["id"], "label": m["label"], "category": m.get("category"), "url": m.get("url")} for m in pistes],
            "categories": cats}


# ------------------------------------------------------------------ rendu
def rendre(telegram_id: str, montage_id: str, reseau: str = "Instagram", titre: str = None) -> dict:
    """Exporte le montage : une ligne Contenus (Reel, À valider, rendu en cours) reçoit le
    job Remotion « Montage » ; le worker rend, envoie sur Cloudinary et notifie. Un second
    export remplace la vidéo de la même ligne (la précédente est restaurée si le rendu échoue).
    Consomme 1 reel de quota (même moteur, même temps de calcul qu'un reel)."""
    m = lire(telegram_id, montage_id)
    if not m:
        return {"error": "Montage introuvable."}
    projet = normaliser(m.get("projet") or {})
    if not projet["elements"]:
        return {"error": "Le montage est vide : pose au moins une vidéo, une image ou un texte."}
    if m.get("statut") == "rendu_en_cours":
        return {"error": "Un rendu est déjà en cours pour ce montage."}
    q = quota_service.consume(telegram_id, "reel")
    if not q.get("ok"):
        return {"error_quota": q}
    titre_c = (titre or m.get("titre") or "Montage").strip()[:120]
    # Miniature : l'instant choisi par le client, sinon ~1 s (la toute première image est souvent
    # noire ou vide quand un texte ou une transition entre en fondu).
    d_projet = duree_s(projet)
    cv = projet.get("couverture")
    couv = round(min(cv, max(0.0, d_projet - 0.2)), 2) if cv is not None else round(min(1.0, d_projet * 0.3), 2)
    restaurer, extra = None, {}
    contenu_id = m.get("contenu_id")
    cur = None
    if contenu_id:
        cur = (supabase.table("contenu").select("id, video_url, video_preview_url").eq("id", contenu_id)
               .eq("telegram_id", telegram_id).limit(1).execute().data or [None])[0]
    try:
        if cur:
            restaurer = {"video_url": cur.get("video_url"), "video_preview_url": cur.get("video_preview_url")}
            extra = {"titre": titre_c, "reseau_cible": reseau or "Instagram", "video_url": None, "video_preview_url": None}
        else:
            row = {"telegram_id": telegram_id, "titre": titre_c, "contenu": "", "type": "Reel",
                   "reseau_cible": reseau or "Instagram", "statut": "A valider", "video_status": "en_traitement",
                   "lien_visuel": None}
            ins = supabase.table("contenu").insert(row).execute()
            contenu_id = ins.data[0]["id"]
        render_service.enqueue(contenu_id, telegram_id, composition="Montage", props=projet, prefix="montage",
                               etiquette="montage", upload={"public_id": f"montages/{telegram_id}/{montage_id}", "couverture_s": couv},
                               action_type="reel", notif="reel", restaurer=restaurer, extra=extra or None)
    except Exception as e:
        quota_service.refund(q)
        logger.error(f"editeur rendre {montage_id}: {e!r}")
        return {"error": "Impossible de lancer le rendu, réessaie."}
    quota_service.confirm(q)
    m = _maj(montage_id, {"statut": "rendu_en_cours", "contenu_id": contenu_id, "projet": projet})
    return {"montage": _resume(m), "contenu_id": contenu_id,
            "quota": {"action": "reel", "used": q.get("used"), "limit": q.get("limit")}}


# ------------------------------------------------------------------ passerelles
def depuis_contenu(telegram_id: str, contenu_id: str) -> dict:
    """Ouvre un contenu vidéo dans l'éditeur : un reel Remotion (reel_data) devient une
    suite d'éléments éditables ; une vidéo montée ou importée devient un plan vidéo, avec
    ses sous-titres si Studio Montage a gardé la transcription. Réutilise le montage déjà
    ouvert pour ce contenu s'il existe."""
    r = supabase.table("contenu").select("*").eq("id", contenu_id).eq("telegram_id", telegram_id).limit(1).execute()
    if not r.data:
        return {"error": "Contenu introuvable."}
    c = r.data[0]
    deja = (supabase.table("montages").select("id").eq("telegram_id", telegram_id)
            .eq("source_contenu_id", contenu_id).order("updated_at", desc=True).limit(1).execute().data or [])
    if deja:
        return {"id": deja[0]["id"], "existant": True}
    projet = projet_vide()
    sc = c.get("reel_data") or {}
    if sc.get("segments"):
        projet = _projet_depuis_reel(c, sc)
    elif c.get("video_url"):
        projet = _projet_depuis_video(telegram_id, c)
    else:
        return {"error": "Ce contenu n'a pas de vidéo à ouvrir."}
    m = creer(telegram_id, titre=(c.get("titre") or "Montage")[:120], projet=projet, source_contenu_id=contenu_id)
    return {"id": m["id"], "existant": False}


def _projet_depuis_reel(c: dict, sc: dict) -> dict:
    """Chaque plan du scénario : son visuel (photo ou clip, durée du plan) + son texte à l'écran
    en élément texte ; la musique du reel en piste audio. La voix off n'est pas reprise (elle est
    synthétisée au rendu du reel, pas stockée par plan)."""
    p = projet_vide()
    t = 0.0
    for i, sg in enumerate(sc.get("segments") or []):
        dur = float(sg.get("dur") or 3.0)
        if sg.get("video") and str(sg["video"]).startswith("https://"):
            p["elements"].append({"id": f"v{i}", "piste": "p-video", "type": "video", "debut": t, "duree": dur,
                                  "src": sg["video"], "decalage": 0, "volume": 0, "vitesse": 1,
                                  "cadre": {"x": 0, "y": 0, "w": 100, "h": 100}, "ajustement": "cover", "rotation": 0})
        elif sg.get("image") and str(sg["image"]).startswith("https://"):
            p["elements"].append({"id": f"i{i}", "piste": "p-image", "type": "image", "debut": t, "duree": dur,
                                  "src": sg["image"], "cadre": {"x": 0, "y": 0, "w": 100, "h": 100},
                                  "ajustement": "cover", "rotation": 0, "animation": "zoom"})
        if sg.get("texte"):
            p["elements"].append({"id": f"t{i}", "piste": "p-texte", "type": "texte", "debut": t, "duree": dur,
                                  "texte": sg["texte"], "cadre": {"x": 8, "y": 38, "w": 84, "h": 24}, "rotation": 0,
                                  "style": {"police": "Sora", "taille": 84, "couleur": "#FFFFFF", "fond": "transparent",
                                            "gras": True, "italique": False, "align": "center", "ombre": True,
                                            "contour": False, "rayon": 0, "marge": 0, "animation": "monter"}})
        t += dur
    musique = music_library.url_de(sc.get("musique"), c.get("telegram_id")) if sc.get("musique") else None
    if musique and t > 0:
        p["elements"].append({"id": "m0", "piste": "p-audio", "type": "audio", "debut": 0, "duree": t, "src": musique,
                              "decalage": 0, "volume": 0.35, "fonduSortie": 1.5})
    return p


def _projet_depuis_video(telegram_id: str, c: dict) -> dict:
    """La vidéo entière en plan vidéo ; si Studio Montage a la transcription, une phrase de
    sous-titre par groupe de mots (≈ 6 mots)."""
    p = projet_vide()
    duree = float(c.get("video_duree_s") or c.get("duree_s") or 0) or 30.0
    p["elements"].append({"id": "v0", "piste": "p-video", "type": "video", "debut": 0, "duree": duree,
                          "src": c["video_url"], "decalage": 0, "volume": 1, "vitesse": 1,
                          "cadre": {"x": 0, "y": 0, "w": 100, "h": 100}, "ajustement": "cover", "rotation": 0})
    if c.get("submagic_project_id"):
        try:
            import asyncio
            from services import montage_poc_service
            tr = asyncio.run(montage_poc_service.get_transcript(c["submagic_project_id"])) or {}
            mots = tr.get("words") or []
            groupe, i = [], 0
            for w in mots:
                groupe.append(w)
                if len(groupe) >= 6 or str(w.get("text") or w.get("word") or "").rstrip().endswith((".", "!", "?")):
                    p["elements"].append(_soustitre(groupe, i)); groupe, i = [], i + 1
            if groupe:
                p["elements"].append(_soustitre(groupe, i))
            fin = max((float(w.get("end") or 0) for w in mots), default=0)
            if fin > 0:
                p["elements"][0]["duree"] = round(fin + 0.3, 2)
        except Exception as e:
            logger.warning(f"editeur transcription {c.get('id')}: {e}")
    return p


def _soustitre(groupe: list, i) -> dict:
    debut = float(groupe[0].get("start") or 0)
    fin = float(groupe[-1].get("end") or debut + 1)
    mots = [{"t": round(max(0.0, float(w.get("start") or 0) - debut), 3),
             "d": round(max(0.08, float(w.get("end") or 0) - float(w.get("start") or 0)), 3),
             "texte": str(w.get("text") or w.get("word") or "").strip()} for w in groupe]
    return {"id": f"s{i}" if isinstance(i, int) else str(i), "piste": "p-soustitres", "type": "soustitre", "debut": round(debut, 3),
            "duree": round(max(0.4, fin - debut), 3),
            "texte": " ".join(m["texte"] for m in mots if m["texte"]).strip(),
            "mots": [m for m in mots if m["texte"]]}


# ------------------------------------------------------------------ sous-titres
async def transcrire(telegram_id: str, montage_id: str, element_id: str) -> dict:
    """« Générer les sous-titres » sur un plan vidéo : Studio Montage transcrit la source
    (Whisper), les mots sont recalés sur la timeline (début du plan, départ dans la source,
    vitesse) et remplacent les sous-titres qui couvraient déjà ce plan. Retourne le projet."""
    from services import montage_poc_service
    m = lire(telegram_id, montage_id)
    if not m:
        return {"error": "Montage introuvable."}
    projet = normaliser(m.get("projet") or {})
    el = next((e for e in projet["elements"] if e["id"] == element_id), None)
    if not el or el["type"] != "video":
        return {"error": "Choisis un plan vidéo à sous-titrer."}
    res = await montage_poc_service.transcrire_url(el["src"])
    if not res.get("ok"):
        return {"error": res.get("error") or "Transcription impossible."}
    mots = res.get("words") or []
    if not mots:
        return {"error": "Aucune parole détectée dans ce plan."}
    debut, duree = el["debut"], el["duree"]
    dec, vit = el.get("decalage", 0.0), el.get("vitesse", 1.0) or 1.0
    # Temps source -> temps timeline, en ne gardant que ce que le plan montre.
    places = []
    for w in mots:
        t0 = debut + (float(w.get("start") or 0) - dec) / vit
        t1 = debut + (float(w.get("end") or 0) - dec) / vit
        if t1 <= debut or t0 >= debut + duree:
            continue
        places.append({**w, "start": max(debut, t0), "end": min(debut + duree, t1)})
    if not places:
        return {"error": "Aucune parole dans la partie du clip utilisée."}
    fin_plan = debut + duree
    reste = [e for e in projet["elements"]
             if not (e["type"] == "soustitre" and e["debut"] < fin_plan and e["debut"] + e["duree"] > debut)]
    nouveaux, groupe, i = [], [], 0
    for w in places:
        groupe.append(w)
        texte = str(w.get("text") or w.get("word") or "").rstrip()
        if len(groupe) >= 6 or texte.endswith((".", "!", "?")):
            nouveaux.append(_soustitre(groupe, f"st{element_id[:4]}{i}")); groupe, i = [], i + 1
    if groupe:
        nouveaux.append(_soustitre(groupe, f"st{element_id[:4]}{i}"))
    projet["elements"] = reste + nouveaux
    m2 = _maj(montage_id, {"projet": projet})
    return {"projet": m2.get("projet") or projet, "nb": len(nouveaux), "langue": res.get("language")}


# ------------------------------------------------------------------ voix off
async def generer_voix_off(telegram_id: str, texte: str, voix: str) -> dict:
    """Fait dire UNE phrase par une voix du catalogue (ou le clone du client) et rend un
    clip audio prêt à poser sur la piste Audio. 1 « voix » de quota, comme la voix off d'un
    reel. La synthèse elle-même est rapide (une phrase) : on peut la faire dans la requête,
    contrairement au rendu vidéo qui passe toujours par le worker."""
    import asyncio
    import uuid
    import cloudinary.uploader
    from services import voix_service, quota_service

    texte = (texte or "").strip()[:500]
    if not texte:
        return {"error": "Écris d'abord la phrase à faire dire."}
    try:
        voix_service.valider_choix(telegram_id, voix)
    except ValueError as e:
        return {"error": str(e)}
    q = quota_service.consume(telegram_id, "voix")
    if not q.get("ok"):
        return {"error_quota": q}
    try:
        voice_id = voix_service.resoudre(telegram_id, voix)
        langue = voix_service.langue_du_compte(telegram_id)
        data = await asyncio.to_thread(voix_service.synthese, texte, voice_id, voix_service.MODELE, langue)
        duree = await asyncio.to_thread(voix_service.duree_audio, data)
        up = await asyncio.to_thread(
            cloudinary.uploader.upload, data, resource_type="video",
            folder=f"voix/{telegram_id}", public_id=uuid.uuid4().hex[:12])
    except Exception as e:
        quota_service.refund(q)
        logger.error(f"editeur voix off: {e!r}")
        return {"error": "Échec de la génération de la voix."}
    quota_service.confirm(q)
    return {"url": up["secure_url"], "duree": round(max(0.3, duree), 2)}


# ------------------------------------------------------------------ silences
# Mêmes seuils que le Studio Vidéo (submagic-poc/pipeline.py CUTS_PACE) : un silence de
# plus de `gap_min` est coupé, en gardant `gap_keep` de respiration de part et d'autre.
INTENSITES_SILENCE = {"naturel": (0.40, 0.22), "rythme": (0.25, 0.15), "serre": (0.12, 0.08)}


async def couper_silences(telegram_id: str, montage_id: str, element_id: str, intensite: str = "naturel") -> dict:
    """Retire les silences d'un plan vidéo : transcrit (Whisper), calcule les passages
    parlés, remplace le plan par la suite de ses sous-plans collés bout à bout — comme une
    série de « Couper » automatiques. Les autres éléments ne bougent pas (comme un Couper
    normal) : un trou peut rester sur la piste, à refermer en glissant si besoin."""
    from services import montage_poc_service
    m = lire(telegram_id, montage_id)
    if not m:
        return {"error": "Montage introuvable."}
    projet = normaliser(m.get("projet") or {})
    el = next((e for e in projet["elements"] if e["id"] == element_id), None)
    if not el or el["type"] != "video":
        return {"error": "Choisis un plan vidéo à nettoyer."}
    res = await montage_poc_service.transcrire_url(el["src"])
    if not res.get("ok"):
        return {"error": res.get("error") or "Transcription impossible."}
    mots = res.get("words") or []
    if not mots:
        return {"error": "Aucune parole détectée dans ce plan."}
    debut, duree = el["debut"], el["duree"]
    dec, vit = el.get("decalage", 0.0), el.get("vitesse", 1.0) or 1.0
    fin_source = dec + duree * vit
    fenetre = [w for w in mots if float(w.get("end") or 0) > dec and float(w.get("start") or 0) < fin_source]
    if not fenetre:
        return {"error": "Aucune parole dans la partie du clip utilisée."}
    gap_min, gap_keep = INTENSITES_SILENCE.get(intensite, INTENSITES_SILENCE["naturel"])
    segs = []
    cur = max(dec, float(fenetre[0]["start"]) - 0.30)
    for a, b in zip(fenetre, fenetre[1:]):
        gap = float(b.get("start") or 0) - float(a.get("end") or 0)
        if gap > gap_min:
            segs.append((cur, min(fin_source, float(a["end"]) + gap_keep / 2)))
            cur = max(dec, float(b["start"]) - gap_keep / 2)
    segs.append((cur, min(fin_source, float(fenetre[-1]["end"]) + 0.6)))
    segs = [(a, b) for a, b in segs if b - a > 0.15]  # une miette de silence mal détectée n'y suffit pas
    if not segs:
        return {"error": "Rien à couper : ce plan est déjà sans silence notable."}
    nouveaux = []
    t = debut
    for i, (a, b) in enumerate(segs):
        dtl = (b - a) / vit
        piece = {**el, "id": (element_id if i == 0 else f"{element_id[:34]}s{i}")[:40],
                 "debut": round(t, 3), "duree": round(dtl, 3), "decalage": round(a, 3)}
        if i > 0:
            piece.pop("transition", None)   # la transition d'entrée ne vaut que pour le tout premier morceau
        nouveaux.append(piece)
        t += dtl
    gagne = round(duree - (t - debut), 2)
    if len(segs) == 1 and gagne < 0.3:
        return {"error": "Rien à couper : ce plan est déjà sans silence notable."}
    projet["elements"] = [x for x in projet["elements"] if x["id"] != element_id] + nouveaux
    m2 = _maj(montage_id, {"projet": projet})
    return {"projet": m2.get("projet") or projet, "nb": len(nouveaux), "gagne": gagne,
            "premier_id": nouveaux[0]["id"], "dernier_id": nouveaux[-1]["id"]}
