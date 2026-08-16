# Persistance des jobs de rendu (table Supabase `studio_montage_jobs`) : le
# dict JOBS en memoire d'app.py est perdu a chaque redemarrage/redeploiement
# Railway (stockage ephemere) -> cette table survit, pour que /jobs/{id}
# (et /result, /thumbnail) puissent repondre meme apres un redemarrage
# survenu pendant ou apres un rendu.
from supabase import create_client

import envkeys

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = create_client(
            envkeys.get("SUPABASE_URL"), envkeys.get("SUPABASE_ANON_KEY"))
    return _client


def upsert(job_id, **fields):
    """Repli silencieux si Supabase indisponible (cles absentes, reseau) :
    le dict JOBS en memoire reste la source de verite pendant le process
    courant, seule la persistance entre redemarrages est perdue."""
    try:
        _get_client().table("studio_montage_jobs") \
            .upsert({"job_id": job_id, **fields}).execute()
    except Exception as e:
        msg = str(e).encode("ascii", "backslashreplace").decode("ascii")
        print(f"[jobs_store] echec sauvegarde job {job_id} ({msg})")


def get(job_id):
    """None si absent ou si Supabase indisponible."""
    try:
        res = (_get_client().table("studio_montage_jobs")
               .select("*").eq("job_id", job_id).limit(1).execute())
        return res.data[0] if res.data else None
    except Exception as e:
        msg = str(e).encode("ascii", "backslashreplace").decode("ascii")
        print(f"[jobs_store] echec lecture job {job_id} ({msg})")
        return None


def delete(job_id):
    """Repli silencieux si Supabase indisponible."""
    try:
        _get_client().table("studio_montage_jobs").delete().eq("job_id", job_id).execute()
    except Exception as e:
        msg = str(e).encode("ascii", "backslashreplace").decode("ascii")
        print(f"[jobs_store] echec suppression job {job_id} ({msg})")


def list_recent(limit=24):
    """Montages termines les plus recents (avec vidéo uploadée), pour la
    galerie d'accueil. Liste vide si Supabase indisponible — pas d'erreur
    remontée au front, l'accueil reste utilisable sans galerie."""
    try:
        res = (_get_client().table("studio_montage_jobs")
               .select("job_id,hook,thumb_url,video_url,created_at")
               .eq("status", "done").not_.is_("video_url", "null")
               .order("created_at", desc=True).limit(limit).execute())
        return res.data or []
    except Exception as e:
        msg = str(e).encode("ascii", "backslashreplace").decode("ascii")
        print(f"[jobs_store] echec liste des jobs ({msg})")
        return []
