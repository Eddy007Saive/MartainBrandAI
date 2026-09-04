"""
Rendu Remotion partage (Reels + Story animee) : lance `npx remotion render` en
subprocess, journalise le cout/duree, nettoie les fichiers temporaires.

Extrait de reel_service.py (etait duplique a l'identique pour la Story animee) :
un seul endroit qui sait lancer Remotion, les appelants ne gerent que leurs
props et leur upload.

Env optionnels :
  REMOTION_DIR       chemin du projet Remotion (defaut: <repo>/remotion)
  REMOTION_BROWSER   chemin d'un Chrome/Chromium deja present (evite un telechargement)
  REMOTION_COUT_MINUTE_USD  cout estime d'une minute de rendu (voir commentaire ci-dessous)
"""
import json
import os
import subprocess
import tempfile
import threading
import time

from config import logger

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTION_DIR = os.environ.get("REMOTION_DIR") or os.path.join(_BACKEND_DIR, "remotion")
REMOTION_BROWSER = os.environ.get("REMOTION_BROWSER")
# Qualité H.264 du rendu. Remotion encode par défaut en CRF 18 (quasi sans perte) : 8 à
# 14 Mo pour vingt secondes. CRF 23 divise le poids par deux ou trois sans différence
# visible sur un téléphone, et les réseaux recompressent de toute façon.
REMOTION_CRF = int(os.environ.get("REMOTION_CRF", "23"))

# Cout d'une minute de rendu, en dollars. Un rendu Remotion sature les coeurs du
# conteneur : le seul cout reel est le TEMPS de calcul facture par l'hebergeur.
# Valeur par defaut prudente pour ~2 vCPU + 2 Go sur Railway ; a ajuster depuis la
# facture reelle via REMOTION_COUT_MINUTE_USD.
COUT_RENDU_MINUTE_USD = float(os.environ.get("REMOTION_COUT_MINUTE_USD", "0.0014"))

# Garde-fou de concurrence : un seul rendu Remotion sature deja les coeurs du
# conteneur (voir plus haut), donc contrairement au semaphore Playwright
# (RENDUS_SIMULTANES=3, screenshots rapides), on plafonne bas. `render_mp4` est
# appele aussi bien en synchrone (reel_service.py) qu'en thread via
# asyncio.to_thread (story_service.py) : threading.Semaphore fonctionne dans les
# deux cas, contrairement a asyncio.Semaphore qui suppose une boucle asyncio.
# Aucune collision observee a ce jour (9 rendus en 3 semaines, jamais simultanes,
# cf. usage_log) — ceci est une assurance a cout nul, pas une reponse a un
# incident reel.
REMOTION_RENDUS_SIMULTANES = 2
REMOTION_ATTENTE_MAX_S = 150  # un rendu prend 50-90s en general (usage_log) ; au-dela, on abandonne plutot que de laisser l'appelant HTTP pendre indefiniment
_atelier = threading.Semaphore(REMOTION_RENDUS_SIMULTANES)


class AtelierSature(Exception):
    """Trop de rendus Remotion en cours : l'appelant doit repondre 503, pas faire attendre indefiniment."""


def _urls_video_cloudinary(obj, acc=None) -> list:
    """Toutes les URLs de vidéos Cloudinary TRANSFORMÉES (so_/du_/c_fill…) présentes
    dans les props, à n'importe quelle profondeur."""
    acc = [] if acc is None else acc
    if isinstance(obj, dict):
        for v in obj.values():
            _urls_video_cloudinary(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            _urls_video_cloudinary(v, acc)
    elif isinstance(obj, str) and "res.cloudinary.com" in obj and "/video/upload/" in obj:
        fin = obj.split("/video/upload/", 1)[1]
        if not fin.startswith("v1") and "," in fin.split("/", 1)[0]:   # segment de transformation
            acc.append(obj)
    return acc


def prechauffer_medias(props: dict, attente_max_s: int = 150) -> None:
    """Cloudinary fabrique un extrait vidéo transformé (coupe, recadrage) à la première
    demande et répond 423 tant qu'il n'est pas prêt ; Remotion prend ce 423 pour une
    erreur et abandonne le rendu. On demande donc chaque extrait AVANT de lancer le
    rendu, et on attend qu'il réponde 200. Sans effet sur les URLs déjà prêtes."""
    import httpx
    urls = list(dict.fromkeys(_urls_video_cloudinary(props)))
    if not urls:
        return
    depart = time.monotonic()
    en_attente = set(urls)
    with httpx.Client(timeout=30, follow_redirects=True) as client:
        while en_attente and time.monotonic() - depart < attente_max_s:
            for u in list(en_attente):
                try:
                    r = client.get(u, headers={"Range": "bytes=0-0"})
                    if r.status_code in (200, 206):
                        en_attente.discard(u)
                    elif r.status_code not in (423, 425, 429):
                        logger.warning(f"préchauffage média {r.status_code} : {u[:120]}")
                        en_attente.discard(u)      # erreur franche : Remotion la signalera
                except Exception as e:
                    logger.warning(f"préchauffage média : {e}")
            if en_attente:
                time.sleep(3)
    if en_attente:
        logger.warning(f"préchauffage média : {len(en_attente)} extrait(s) toujours en préparation après {attente_max_s}s")
    else:
        logger.info(f"préchauffage média : {len(urls)} extrait(s) prêt(s) en {time.monotonic() - depart:.0f}s")


def render_mp4(props: dict, composition: str, *, telegram_id: str = None,
               etiquette: str = None, prefix: str = "remotion") -> str:
    """Lance le rendu Remotion en subprocess. Retourne le chemin du MP4.

    Le temps de calcul est journalise dans usage_log (colonne duree_s) avec son
    cout estime : c'est la seule depense reelle d'un rendu, et la moyenne permet
    de savoir ce que coute un rendu. Les echecs sont journalises aussi — ils
    consomment du CPU sans rien produire.

    `prefix` distingue le fichier temporaire ET le libelle du journal
    (ex. "reel" -> reel_rendu/reel_rendu_echec, "story_anime" -> story_anime_rendu/
    story_anime_rendu_echec) selon l'appelant, sans dupliquer cette fonction."""
    if not os.path.isdir(os.path.join(REMOTION_DIR, "node_modules")):
        raise RuntimeError(f"Remotion non installe ({REMOTION_DIR}) : lancer `npm ci` dans ce dossier.")
    prechauffer_medias(props)      # avant de prendre l'atelier : c'est du réseau, pas du CPU
    if not _atelier.acquire(timeout=REMOTION_ATTENTE_MAX_S):
        raise AtelierSature()
    fd, props_path = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(props, f, ensure_ascii=False)
    out_path = os.path.join(tempfile.gettempdir(), f"{prefix}_{next(tempfile._get_candidate_names())}.mp4")
    npx = "npx.cmd" if os.name == "nt" else "npx"
    cmd = [npx, "remotion", "render", "src/index.ts", composition, out_path, f"--props={props_path}", "--timeout=120000",
           f"--crf={REMOTION_CRF}"]
    if REMOTION_BROWSER:
        cmd.append(f"--browser-executable={REMOTION_BROWSER}")
    depart = time.monotonic()
    ok = False
    try:
        r = subprocess.run(cmd, cwd=REMOTION_DIR, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=900)
        if r.returncode != 0 or not os.path.exists(out_path):
            tail = (r.stderr or r.stdout or "")[-800:]
            raise RuntimeError(f"rendu remotion (code {r.returncode}) : {tail}")
        ok = True
        return out_path
    finally:
        _atelier.release()
        duree = time.monotonic() - depart
        if telegram_id:
            try:
                from services import usage_service
                usage_service.log(
                    telegram_id,
                    f"{prefix}_rendu" if ok else f"{prefix}_rendu_echec",
                    etiquette or composition, {}, 0,
                    cost_override=round(duree / 60 * COUT_RENDU_MINUTE_USD, 6),
                    duree_s=duree,
                )
            except Exception as e:
                logger.warning(f"journal du rendu {composition}: {e}")
        try:
            os.unlink(props_path)
        except OSError:
            pass
