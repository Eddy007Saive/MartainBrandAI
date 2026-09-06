"""
Montage à partir des VIDÉOS du client : un modèle qui regarde les rushes.

Le scénariste habituel des reels (reel_service._script_sequence, Claude Haiku) ne
voit pas les vidéos : il lit une description faite sur une vignette et coupe
chaque clip depuis la seconde 0. Dès qu'un plan repose sur un clip, on passe
ici : Gemini (via OpenRouter) REGARDE chaque clip en entier et choisit le
meilleur moment (début/fin) pour chaque plan, comme un monteur.

Ce que ça change pour le reste du système : rien. La sortie a exactement la
forme d'un scénario Séquence (segments typo/image/cta, voix_texte…) ; le clip
d'un plan devient une URL Cloudinary découpée (so_/du_) que Remotion lit telle
quelle. Toute erreur ici fait retomber le scénariste sur Haiku (repli).

Leçons du test grandeur nature (pub Villa Horizon, 2026-09-05) :
- une phrase parlée de 7 à 12 mots, sinon le plan s'étire au-delà du clip ;
- le plan CTA garde une vidéo (un fond noir à la fin casse la pub) ;
- les rushes sont envoyés en proxy 360p sans son : coût ~1 c par minute de clip.
"""
import base64
import json
import os
import re
import subprocess
import tempfile
import time

import httpx

from config import logger, OPENROUTER_API_KEY, OPENROUTER_VIDEO_MODEL

_MAX_CLIP_S = 90          # au-delà, on ne montre au modèle que les 90 premières secondes
_MAX_PROXY_MO = 18        # garde-fou : un proxy trop lourd fait exploser la requête
_LANGUES = {"fr": "French", "en": "English", "es": "Spanish"}
_EFFETS = ("zoomIn", "zoomOut", "panLeft", "panRight")
_REVEALS = ("carte", "lamelles", "portes", "stores", "iris")


# ----------------------------------------------------------------------------
# Proxies : une version légère de chaque clip pour l'analyse
# ----------------------------------------------------------------------------
def url_brute(url: str) -> str:
    """Le clip sans transformation : un plan déjà découpé (so_/du_, c_fill…) que le
    client réutilise doit être regardé et recoupé depuis l'original."""
    base, sep, fin = url.partition("/upload/")
    if not sep:
        return url
    premier = fin.split("/")[0]
    if "_" in premier and not re.fullmatch(r"v\d+", premier):
        fin = fin.split("/", 1)[1]
    return f"{base}/upload/{fin}"


def _url_proxy(url: str) -> str:
    """Version 360p, sans son, limitée à _MAX_CLIP_S, dérivée par Cloudinary."""
    base, _, fin = url_brute(url).partition("/upload/")
    return f"{base}/upload/w_360,ac_none,q_auto:low,du_{_MAX_CLIP_S}/{fin}"


def _telecharger(url: str, tentatives: int = 8) -> bytes | None:
    """Une dérivée Cloudinary répond 423 tant qu'elle se fabrique : on patiente."""
    for i in range(tentatives):
        try:
            r = httpx.get(url, timeout=120, follow_redirects=True)
            if r.status_code == 200 and r.content:
                return r.content
            if r.status_code not in (423, 425, 429):
                logger.warning(f"montage proxy {r.status_code} : {url[:120]}")
                return None
        except Exception as e:
            logger.warning(f"montage proxy essai {i + 1} : {e}")
        time.sleep(min(2 + 2 * i, 10))
    return None


def _proxy_local(url: str) -> bytes | None:
    """Repli : on télécharge l'original et ffmpeg fait le proxy."""
    data = _telecharger(url, tentatives=3)
    if not data:
        return None
    fd, src = tempfile.mkstemp(suffix=".mp4")
    out = src + ".proxy.mp4"
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-t", str(_MAX_CLIP_S), "-i", src, "-vf", "scale=360:-2",
                        "-c:v", "libx264", "-crf", "32", "-preset", "veryfast", "-an", out],
                       check=True, timeout=180)
        with open(out, "rb") as f:
            return f.read()
    except Exception as e:
        logger.warning(f"montage proxy ffmpeg : {e}")
        return None
    finally:
        for p in (src, out):
            try:
                os.unlink(p)
            except OSError:
                pass


def _duree(data: bytes) -> float | None:
    fd, chemin = tempfile.mkstemp(suffix=".mp4")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", chemin],
                           capture_output=True, text=True, timeout=30)
        return float(json.loads(r.stdout)["format"]["duration"]) if r.returncode == 0 else None
    except Exception:
        return None
    finally:
        try:
            os.unlink(chemin)
        except OSError:
            pass


def _proxy(url: str) -> tuple[bytes | None, float | None]:
    data = _telecharger(_url_proxy(url)) or _proxy_local(url)
    if not data or len(data) > _MAX_PROXY_MO * 1024 * 1024:
        return None, None
    return data, _duree(data)


# ----------------------------------------------------------------------------
# Découpe finale : le clip du plan, tel que Remotion le lira
# ----------------------------------------------------------------------------
def clip_rendu(url: str, debut: float, dur: float, dur_clip: float | None = None) -> str:
    """URL Cloudinary recadrée 9:16, 720p, qui DÉMARRE au moment choisi. On sert
    plus long que le plan (+4 s) : si la voix off étire le plan, la vidéo continue."""
    base, _, fin = url_brute(url).partition("/upload/")
    if not fin:
        return url
    debut = max(0.0, float(debut or 0))
    marge = float(dur) + 4.0
    if dur_clip:
        debut = min(debut, max(0.0, dur_clip - float(dur)))     # jamais au-delà du clip
        marge = min(marge, max(1.0, dur_clip - debut))
    return f"{base}/upload/so_{debut:.1f},du_{marge:.1f},c_fill,ar_9:16,w_720,q_auto/{fin}"


# ----------------------------------------------------------------------------
# Le prompt monteur
# ----------------------------------------------------------------------------
_ROLE = (
    "You are the editor and copywriter of short vertical social videos (15-25 s). The client gives "
    "you his own FOOTAGE (numbered clips you can watch in full) and sometimes photos, plus the text "
    "of a post or a brief. You write the SCENARIO of the reel AND choose the exact moments to keep.\n"
    "\n"
    "OUTPUT LANGUAGE — ABSOLUTE RULE. These instructions are in English; every word you WRITE for "
    "the audience (texte, accents, bar, label, voix) must be in the client's language, given below. "
    "Flawless spelling and accents.\n"
    "\n"
    "EDITING RULES:\n"
    "- 5 to 7 shots, the last one is ALWAYS type cta and MUST also carry a clip (never a plain background).\n"
    "- Pick the BEST moment of each clip: good light, a clear subject, a smooth camera move, a gesture, "
    "a detail. Skip shaky starts, black frames, people looking for the camera.\n"
    "- Shots last 2.5 to 4.5 s. debut/fin are seconds INSIDE the chosen clip (fin - debut = dur).\n"
    "- Use every clip at least once when it is usable; a clip can be used twice at different moments. "
    "Photos (image ids) can fill a shot when no footage fits.\n"
    "- Order the shots for the story, not the order of the clips.\n"
    "- Shot types: 'image' (a clip or a photo + short on-screen text), 'typo' (full-screen text, use "
    "sparingly, at most one), 'cta' (last shot, clip + call to action).\n"
    "\n"
    "WRITING RULES:\n"
    "- texte: 2 to 6 words on screen per shot, punchy, concrete, sensory. No jargon, no tutorial tone.\n"
    "- accents: 1 or 2 words of that text to highlight (copied exactly as written).\n"
    "- bar (cta shot): 2 to 5 words (brand, website or action).\n"
    "- vary effet: zoomIn, zoomOut, panLeft, panRight ; reveal: carte, lamelles, portes, stores, iris.\n"
    "- THE CLIENT'S OWN INSTRUCTIONS OUTRANK EVERYTHING: if he dictates a sentence, copy it as-is on the "
    "shot he asks for.\n"
    "\n"
    "Answer with STRICT JSON only:\n"
    '{"angle": "the idea in one sentence", "segments": [{"type": "image|typo|cta", "clip": 1, '
    '"image_id": "...or null", "debut": 0.0, "fin": 3.5, "texte": "...", "accents": ["..."], '
    '"effet": "zoomIn", "reveal": "carte", "bar": "...if cta", "voix": "...if asked"}]}'
)

_CONSIGNE_VOIX = (
    "\n\nVOICE-OVER. A narrator reads this reel. For EVERY shot add \"voix\": one SPOKEN sentence of "
    "7 to 12 words in the client's language, natural oral phrasing, a real verb, no hashtags, no emoji. "
    "It carries the same idea as the on-screen text without repeating it word for word. Never longer: "
    "a long sentence outlasts the footage. On the cta shot the voice says the call to action plainly."
)


def _guide_style(style: str | None) -> str:
    try:
        from services.reel_service import _GUIDES_STYLE
        return f"\n\n{_GUIDES_STYLE[style]}" if style in _GUIDES_STYLE else ""
    except Exception:
        return ""


# ----------------------------------------------------------------------------
# Point d'entrée
# ----------------------------------------------------------------------------
def scenariser(texte: str, marque: dict, pool: list, brief: str = None, style: str = None,
               avec_voix: bool = False, telegram_id: str = None) -> dict | None:
    """Scénario Séquence écrit en REGARDANT les clips du pool. Retourne None si le
    montage n'a pas pu se faire (le scénariste texte prend le relais)."""
    if not OPENROUTER_API_KEY:
        return None
    from services.reel_service import _est_clip, _img_rendu
    clips = [p for p in pool if _est_clip(p.get("url"))]
    photos = [p for p in pool if not _est_clip(p.get("url"))]
    if not clips:
        return None

    # 1. proxies (l'analyse ne lit jamais l'original)
    parts, rushes = [], []
    for p in clips:
        data, dur = _proxy(p["url"])
        if not data:
            logger.warning(f"montage : clip illisible, ignoré : {p['url'][:100]}")
            continue
        n = len(rushes) + 1
        rushes.append({"n": n, "url": p["url"], "dur": dur, "desc": p.get("desc")})
        parts.append({"type": "text", "text": f"CLIP {n}" + (f" ({dur:.0f} s)" if dur else "") + (f" : {p['desc']}" if p.get("desc") else "")})
        parts.append({"type": "video_url", "video_url": {"url": "data:video/mp4;base64," + base64.b64encode(data).decode()}})
    if not rushes:
        return None
    for p in photos:
        parts.append({"type": "text", "text": f"PHOTO image_id={p['id']}" + (f" : {p['desc']}" if p.get("desc") else "")})
        parts.append({"type": "image_url", "image_url": {"url": _img_rendu(p["url"])}})

    # 2. la demande
    langue = _LANGUES.get((marque.get("langue") or "fr").lower(), "French")
    role = _ROLE + f"\n\nCLIENT'S LANGUAGE — write every audience-facing word in {langue.upper()}." \
        + _guide_style(style) + (_CONSIGNE_VOIX if avec_voix else "")
    demande = ""
    if brief:
        demande += ("### CLIENT'S OWN INSTRUCTIONS — FOLLOW THEM TO THE LETTER\n"
                    f"{brief[:1500].strip()}\n### end of instructions\n\n")
    if texte and texte.strip() != (brief or "").strip():
        demande += f"Post / subject:\n\n{texte[:3000]}\n\n"
    demande += (f"Brand: {marque.get('nom') or ''}. Sector: {marque.get('secteur') or ''}. "
                f"Tone: {marque.get('voix_marque') or ''}.\n"
                f"There are {len(rushes)} clip(s). Watch them in full, then return the JSON.")
    body = {"model": OPENROUTER_VIDEO_MODEL, "temperature": 0.6, "usage": {"include": True},
            "messages": [{"role": "system", "content": role},
                         {"role": "user", "content": [{"type": "text", "text": demande}] + parts}]}
    t0 = time.time()
    try:
        r = httpx.post("https://openrouter.ai/api/v1/chat/completions",
                       headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json",
                                "HTTP-Referer": "https://postorico.com", "X-Title": "Postorico montage"},
                       json=body, timeout=300)
        j = r.json()
        if r.status_code != 200 or "error" in j:
            logger.error(f"montage OpenRouter {r.status_code} : {str(j)[:300]}")
            return None
        raw = j["choices"][0]["message"]["content"]
        data = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
    except Exception as e:
        logger.error(f"montage Gemini : {e}")
        return None
    _journal(telegram_id, j, time.time() - t0)

    # 3. vers un scénario Séquence
    ids_photo = {p["id"]: p["url"] for p in photos}
    segs = []
    for s in (data.get("segments") or [])[:7]:
        t = s.get("type") if s.get("type") in ("typo", "image", "cta") else "image"
        texte_s = str(s.get("texte") or "")[:80].strip()
        if not texte_s:
            continue
        seg = {"type": t, "dur": 3.0, "texte": texte_s,
               "accents": [str(a)[:30] for a in (s.get("accents") or [])[:2]]}
        try:
            debut, fin = float(s.get("debut") or 0), float(s.get("fin") or 0)
        except (TypeError, ValueError):
            debut, fin = 0.0, 0.0
        seg["dur"] = round(max(2.5, min(4.5, fin - debut)), 1) if fin > debut else 3.0
        n = s.get("clip")
        rush = next((x for x in rushes if x["n"] == n), None) if isinstance(n, (int, float)) else None
        if t != "typo":
            if rush:
                seg["video"] = clip_rendu(rush["url"], debut, seg["dur"], rush["dur"])
                seg["image_id"] = f"clip_{rush['n']}"
            elif s.get("image_id") in ids_photo:
                seg["image"] = _img_rendu(ids_photo[s["image_id"]])
                seg["image_id"] = s["image_id"]
            elif t == "image":
                seg["type"] = "typo"    # ni clip ni photo connue : jamais d'URL inventée
            if seg.get("video") or seg.get("image"):
                seg["effet"] = s.get("effet") if s.get("effet") in _EFFETS else _EFFETS[len(segs) % 4]
                if s.get("reveal") in _REVEALS:
                    seg["reveal"] = s["reveal"]
                seg["tilt"] = [-3, 2, -2, 3][len(segs) % 4]
        if t == "cta":
            seg["bar"] = str(s.get("bar") or marque.get("nom") or "")[:40]
        if s.get("label"):
            seg["label"] = str(s["label"])[:40]
        if avec_voix:
            seg["voix_texte"] = str(s.get("voix") or texte_s)[:200].strip()
        segs.append(seg)
    if len(segs) < 4:
        logger.warning(f"montage : scénario trop court ({len(segs)} plans), repli texte")
        return None
    if segs[-1]["type"] != "cta":
        segs[-1]["type"] = "cta"
        segs[-1].setdefault("bar", str(marque.get("nom") or "")[:40])
    if not segs[-1].get("video"):
        # Le CTA garde une vidéo : la fin du premier clip, en écho au début.
        r0 = rushes[0]
        segs[-1]["video"] = clip_rendu(r0["url"], max(0.0, (r0["dur"] or 8) - segs[-1]["dur"] - 1), segs[-1]["dur"], r0["dur"])
        segs[-1]["image_id"] = f"clip_{r0['n']}"
        segs[-1].setdefault("effet", "zoomOut")
    return {"recette": "montage", "angle": str(data.get("angle") or "")[:200], "brief": brief, "segments": segs}


def _journal(telegram_id: str | None, reponse: dict, duree_s: float) -> None:
    """Coût réel renvoyé par OpenRouter (usage.cost, en $) dans usage_log."""
    if not telegram_id:
        return
    try:
        from services import usage_service
        u = reponse.get("usage") or {}
        usage_service.log(telegram_id, "reel_montage", OPENROUTER_VIDEO_MODEL,
                          {"input": u.get("prompt_tokens", 0), "output": u.get("completion_tokens", 0)},
                          0, cost_override=float(u.get("cost") or 0), duree_s=duree_s)
    except Exception as e:
        logger.warning(f"montage journal : {e}")
