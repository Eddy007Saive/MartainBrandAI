# Studio Montage — serveur local : uvicorn app:app --port 8765 (ou python app.py)
import os

# DOIT être fait avant tout import numpy/cv2/ctranslate2 : opencv et
# ctranslate2 (faster-whisper) embarquent chacun leur propre runtime
# MKL/OpenMP. Chargés dans le même process Windows, leurs pools de threads
# entrent en collision et corrompent l'allocateur -> "mkl_malloc: failed
# to allocate memory". KMP_DUPLICATE_LIB_OK autorise la coexistence des
# deux runtimes ; les *_NUM_THREADS bornent la RAM que chacun réserve
# (cette machine n'a que 4 coeurs et ~4 Go de libre).
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")
os.environ.setdefault("KMP_NUM_THREADS", "2")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "2")

import json
import shutil
import threading
import uuid

from fastapi import FastAPI, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

import hooks
import jobs_store
import music
import pipeline
import storage

HERE = os.path.dirname(os.path.abspath(__file__))
JOBS_DIR = os.path.join(HERE, "jobs")
os.makedirs(JOBS_DIR, exist_ok=True)

app = FastAPI()
JOBS = {}


def _sync(job_id):
    """Reflete l'etat courant de JOBS[job_id] dans Supabase (survit a un
    redemarrage Railway, contrairement au dict en memoire)."""
    jobs_store.upsert(job_id, **JOBS.get(job_id, {}))

DEFAULTS = {
    "preset": "classic",
    "hook": "",
    "hook_auto": False,
    "hook_preset": None,   # None = même style que les sous-titres
    "hook_position": "top",
    "hook_fontscale": 1.0,
    "music_id": "none",
    "music_volume": 30,
    "emojis": False,
    "brolls": False,
    "font": "Arial Black",
    "hl_color": "#3AFFA3",
    "fontscale": 1.0,
    "position": 0.30,
    "uppercase": True,
    "cuts": True,
    "zoom": True,
    "zoom_max": 0.10,
    "vertical": True,
    "face_track": True,
    "audio_clean": True,
}


@app.get("/")
def index():
    # no-store : sinon le navigateur sert une version en cache de l'UI
    # pendant qu'on itère dessus, et les changements semblent "manquants"
    return FileResponse(os.path.join(HERE, "index.html"),
                        headers={"Cache-Control": "no-store"})


@app.get("/music")
def music_list():
    return {"categories": music.MUSIC_CATEGORIES, "tracks": music.MUSIC_LIBRARY}


@app.post("/process")
async def process(video: UploadFile, options: str = Form("{}")):
    job_id = uuid.uuid4().hex[:10]
    job_dir = os.path.join(JOBS_DIR, job_id)
    os.makedirs(job_dir)
    src = os.path.join(job_dir, "in.mp4")
    with open(src, "wb") as f:
        while chunk := await video.read(1 << 20):
            f.write(chunk)
    opts = {**DEFAULTS, **json.loads(options)}
    JOBS[job_id] = {"status": "processing", "step": "file d'attente"}
    _sync(job_id)

    def on_progress(s):
        JOBS[job_id].update(step=s)
        _sync(job_id)

    def run():
        try:
            out_mp4 = os.path.join(job_dir, "out.mp4")
            res = pipeline.process(src, out_mp4, opts, progress=on_progress)
            has_thumb = res.get("thumbnail", False)
            warnings = list(res.get("warnings", []))
            # stockage local éphémère sur un déploiement séparé (Railway efface
            # tout à chaque redémarrage) -> Cloudinary devient la source
            # persistante ; repli silencieux sur le fichier local si l'upload
            # échoue (clés absentes en dev local, réseau...) — mais signalé
            # quand même à l'utilisateur, la vidéo ne survivra pas alors à un
            # redéploiement du serveur
            JOBS[job_id].update(step="stockage")
            video_url = storage.upload_video(out_mp4, job_id)
            if not video_url:
                warnings.append("Stockage : sauvegarde permanente de la vidéo "
                               "impossible (elle restera accessible seulement "
                               "tant que le serveur ne redémarre pas).")
            thumb_url = None
            if has_thumb:
                thumb_url = storage.upload_image(os.path.join(job_dir, "out.thumb.jpg"), job_id)
                if not thumb_url:
                    warnings.append("Stockage : sauvegarde permanente de la miniature "
                                   "impossible (même limite que la vidéo).")
            JOBS[job_id].update(status="done", hook=res.get("hook"),
                                thumbnail=has_thumb, video_url=video_url, thumb_url=thumb_url,
                                warnings=warnings,
                                # gardés pour /regenerate_thumbnail (relancer
                                # seulement la miniature, sans re-rendre la vidéo)
                                video_path=src, options=opts)
        except Exception as e:
            JOBS[job_id].update(status="error", error=str(e)[:500])
        finally:
            _sync(job_id)

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


@app.post("/regenerate_thumbnail/{job_id}")
async def regenerate_thumbnail(job_id: str, options: str = Form("{}")):
    job = JOBS.get(job_id)
    if not job or not job.get("video_path"):
        return JSONResponse({"status": "error", "error": "job introuvable ou vidéo absente"},
                            status_code=404)
    overrides = json.loads(options) if options else {}
    opts = {**job.get("options", DEFAULTS), **overrides}
    video_path = job["video_path"]
    thumb_out = os.path.join(os.path.dirname(video_path), "out.thumb.jpg")
    JOBS[job_id] = {**job, "status": "processing", "step": "miniature"}
    _sync(job_id)

    def on_progress(s):
        JOBS[job_id].update(step=s)
        _sync(job_id)

    def run():
        try:
            res = pipeline.regenerate_thumbnail(video_path, thumb_out, opts,
                                                progress=on_progress)
            warnings = list(res.get("warnings", []))
            JOBS[job_id].update(step="stockage")
            thumb_url = storage.upload_image(thumb_out, job_id)
            if not thumb_url:
                warnings.append("Stockage : sauvegarde permanente de la miniature "
                               "impossible (elle restera accessible seulement tant "
                               "que le serveur ne redémarre pas).")
            JOBS[job_id].update(status="done", hook=res.get("hook"), thumbnail=True,
                                thumb_url=thumb_url, warnings=warnings,
                                video_path=video_path, options=opts)
        except Exception as e:
            JOBS[job_id].update(status="error", error=str(e)[:500])
        finally:
            _sync(job_id)

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


@app.post("/suggest_hooks")
async def suggest_hooks(video: UploadFile):
    job_id = uuid.uuid4().hex[:10]
    job_dir = os.path.join(JOBS_DIR, job_id)
    os.makedirs(job_dir)
    src = os.path.join(job_dir, "in.mp4")
    with open(src, "wb") as f:
        while chunk := await video.read(1 << 20):
            f.write(chunk)
    JOBS[job_id] = {"status": "processing", "step": "transcription"}

    def run():
        try:
            cache = pipeline.transcribe(src, progress=lambda s: JOBS[job_id].update(step=s))
            JOBS[job_id]["step"] = "génération"
            data = json.load(open(cache, encoding="utf-8"))
            transcript = " ".join(w["text"] for w in data["words"])
            if not transcript.strip():
                raise RuntimeError("Aucune parole détectée dans la vidéo")
            result = hooks.suggest_hooks(transcript, data.get("language", "fr"))
            JOBS[job_id].update(status="done", hooks=result)
        except Exception as e:
            JOBS[job_id].update(status="error", error=str(e)[:500])

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}


@app.get("/jobs")
def jobs_list():
    """Montages récents (pour la galerie d'accueil) — liste vide si
    Supabase indisponible, jamais d'erreur bloquante pour l'accueil."""
    return JSONResponse(jobs_store.list_recent())


@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    # repli Supabase : le dict JOBS en mémoire est vide après un redémarrage
    # du serveur (Railway), la table studio_montage_jobs survit
    job = JOBS.get(job_id) or jobs_store.get(job_id) or {"status": "unknown"}
    return JSONResponse(job)


@app.delete("/jobs/{job_id}")
def delete_job(job_id: str):
    """Supprime le montage partout : Cloudinary (vidéo + miniature), la
    ligne Supabase, le dict mémoire et le dossier local s'il est encore là
    (dev local, ou juste après un rendu avant redéploiement)."""
    storage.delete(job_id)
    jobs_store.delete(job_id)
    JOBS.pop(job_id, None)
    job_dir = os.path.join(JOBS_DIR, job_id)
    if os.path.isdir(job_dir):
        shutil.rmtree(job_dir, ignore_errors=True)
    return {"status": "deleted"}


@app.get("/result/{job_id}")
def result(job_id: str, download: bool = False):
    job = JOBS.get(job_id) or jobs_store.get(job_id) or {}
    url = job.get("video_url")
    if url:
        return RedirectResponse(storage.attachment_url(url) if download else url)
    # repli local : dev sans clés Cloudinary, upload qui a échoué, ou fichier
    # local encore présent (job pas encore uploadé quand le serveur a tourné)
    return FileResponse(os.path.join(JOBS_DIR, job_id, "out.mp4"),
                        media_type="video/mp4", filename="montage.mp4")


@app.get("/thumbnail/{job_id}")
def thumbnail(job_id: str, download: bool = False):
    job = JOBS.get(job_id) or jobs_store.get(job_id) or {}
    url = job.get("thumb_url")
    if url:
        return RedirectResponse(storage.attachment_url(url) if download else url)
    return FileResponse(os.path.join(JOBS_DIR, job_id, "out.thumb.jpg"),
                        media_type="image/jpeg", filename="miniature.jpg")


if __name__ == "__main__":
    import uvicorn
    # 0.0.0.0 + $PORT : nécessaire dès qu'on sort du dev local (Railway
    # assigne son propre port dynamiquement et route vers 0.0.0.0 — un
    # bind sur 127.0.0.1 serait injoignable de l'extérieur du conteneur)
    port = int(os.environ.get("PORT", 8765))
    host = os.environ.get("HOST", "127.0.0.1" if "PORT" not in os.environ else "0.0.0.0")
    uvicorn.run(app, host=host, port=port)
