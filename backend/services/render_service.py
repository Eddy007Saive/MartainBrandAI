"""
File de rendu Remotion en arriere-plan (stories animees, reels).

Un rendu Remotion prend 50-90 s et sature les coeurs du conteneur : impossible
de rendre dans une requete HTTP (timeout, onglet ferme = resultat perdu). Ici la
ligne `contenu` EST le job (meme choix que le montage Submagic avec
`video_status`) :

  video_status      = "en_traitement" tant que le rendu n'est pas fait
  render_job        = {composition, props, prefix, etiquette,
                       upload: {public_id, folder?},
                       action_type: "story"|"reel"   (quota a rembourser si echec final),
                       notif: "story"|"reel"         (libelles de la notification),
                       restaurer?: {video_url, video_preview_url, reel_data}
                                    (regeneration : etat a remettre si echec),
                       tentatives, erreur}
  render_started_at = pose au claim par le worker ; NULL = libre. Un claim
                      perime (> STALE_MIN) est repris : un redemarrage Railway
                      pendant un rendu ne perd pas le job, juste le MP4 temporaire.

Le worker (`server._render_worker`) appelle `traiter_suivant()` en boucle ; un
seul rendu a la fois. Le semaphore de remotion_service reste en garde-fou.
"""
import asyncio
import os
from datetime import datetime, timedelta, timezone

import cloudinary
import cloudinary.uploader

from config import supabase, logger

MAX_TENTATIVES = 2
STALE_MIN = 15


# ----------------------------------------------------------------------------
# Mise en file
# ----------------------------------------------------------------------------
def enqueue(row_id: str, telegram_id: str, *, composition: str, props: dict, prefix: str,
            etiquette: str, upload: dict, action_type: str, notif: str,
            restaurer: dict = None, extra: dict = None) -> None:
    """Accroche un job de rendu a une ligne contenu existante et la passe en
    en_traitement. `upload` = {public_id, folder?} (Cloudinary, resource_type video).
    `extra` = colonnes a poser en meme temps (ex. reel_data, video_url=None pour une
    regeneration). Retour immediat, le worker fait le reste."""
    job = {"composition": composition, "props": props, "prefix": prefix, "etiquette": etiquette,
           "upload": upload, "action_type": action_type, "notif": notif, "tentatives": 0}
    if restaurer:
        job["restaurer"] = restaurer
    maj = {"render_job": job, "video_status": "en_traitement", "render_started_at": None}
    if extra:
        maj.update(extra)
    supabase.table("contenu").update(maj).eq("id", row_id).execute()


def enqueue_story_animee(row_id: str, telegram_id: str, accroche: str, sous: str, cta: str,
                         colors: dict = None, mot_accent: str = None) -> None:
    """Story animee (gabarit StoryAnime) : meme schema d'upload que le rendu synchrone
    (story_service.upload_story_video) pour rester compatible."""
    from services import story_service
    props = story_service.props_story_animee(telegram_id, accroche, sous, cta,
                                             colors=colors, mot_accent=mot_accent)
    base = (row_id or "tmp").replace("-", "")[:16]
    enqueue(row_id, telegram_id, composition="StoryAnime", props=props, prefix="story_anime",
            etiquette="story_anime", upload={"folder": f"stories/{telegram_id}", "public_id": f"{base}_anime"},
            action_type="story", notif="story")


# ----------------------------------------------------------------------------
# Worker
# ----------------------------------------------------------------------------
def _upload_video(mp4: str, upload: dict) -> dict:
    """Envoie le MP4 sur Cloudinary (video) et supprime le fichier local.
    Renvoie {'video_url', 'video_preview_url'} — le poster est la 1re frame via
    transformation Cloudinary (URL en .jpg), comme partout ailleurs."""
    params = {"resource_type": "video", "public_id": upload["public_id"],
              "overwrite": True, "invalidate": True}
    if upload.get("folder"):
        params["folder"] = upload["folder"]
    try:
        up = cloudinary.uploader.upload(mp4, **params)
        url = up["secure_url"]
        return {"video_url": url, "video_preview_url": url.rsplit(".", 1)[0] + ".jpg"}
    finally:
        try:
            os.unlink(mp4)
        except OSError:
            pass


def _rearmer_perimes() -> None:
    limite = (datetime.now(timezone.utc) - timedelta(minutes=STALE_MIN)).isoformat()
    try:
        r = (supabase.table("contenu").update({"render_started_at": None})
             .eq("video_status", "en_traitement").lt("render_started_at", limite).execute())
        if r.data:
            logger.warning(f"render worker: {len(r.data)} job(s) perime(s) rearme(s)")
    except Exception as e:
        logger.warning(f"render worker rearmer: {e}")


def _claim():
    """Prend le plus ancien job libre. L'update conditionnel (render_started_at IS NULL)
    garantit qu'un seul worker l'obtient, meme avec plusieurs instances."""
    r = (supabase.table("contenu")
         .select("id, telegram_id, reseau_cible, serie_id, render_job, titre")
         .eq("video_status", "en_traitement").not_.is_("render_job", "null")
         .is_("render_started_at", "null")
         .order("created_at").limit(1).execute())
    if not r.data:
        return None
    row = r.data[0]
    c = (supabase.table("contenu").update({"render_started_at": datetime.now(timezone.utc).isoformat()})
         .eq("id", row["id"]).is_("render_started_at", "null").execute())
    return row if c.data else None


def _existe(row_id: str) -> bool:
    try:
        r = supabase.table("contenu").select("id").eq("id", row_id).limit(1).execute()
        return bool(r.data)
    except Exception:
        return True  # doute -> on tente l'upload plutot que de perdre le rendu


def _serie_terminee(row: dict) -> bool:
    """Vrai quand plus aucun ecran de la meme serie (ou la ligne seule) n'attend."""
    if not row.get("serie_id"):
        return True
    r = (supabase.table("contenu").select("id").eq("serie_id", row["serie_id"])
         .eq("video_status", "en_traitement").limit(1).execute())
    return not r.data


def _notifier_fin(row: dict, job: dict) -> None:
    from services import notification_service
    tid, cid, reseau = row.get("telegram_id"), row.get("id"), row.get("reseau_cible")
    echec = bool(row.get("_echec"))
    if (job.get("notif") or "story") == "reel":
        if echec:
            suite = " La version précédente est conservée." if job.get("restaurer") else " Supprime le reel et réessaie."
            notification_service.notifier(tid, cid, reseau, "reel.echec",
                                          "Reel : rendu échoué ❌", "Le rendu n'a pas abouti." + suite)
        else:
            notification_service.notifier(tid, cid, reseau, "reel.ready",
                                          "Ton reel est prêt 🎬", "À valider dans Contenus.")
        return
    # Stories (serie ou unique)
    if row.get("serie_id"):
        r = (supabase.table("contenu").select("video_status").eq("serie_id", row["serie_id"]).execute())
        statuts = [x.get("video_status") for x in (r.data or [])]
        echecs = statuts.count("echec")
        if echecs == len(statuts):
            notification_service.notifier(tid, cid, reseau, "story.anime.echec",
                                          "Série animée : rendu échoué ❌",
                                          "Aucun écran n'a pu être rendu. Supprime la série et réessaie.")
        elif echecs:
            notification_service.notifier(tid, cid, reseau, "story.anime.ready",
                                          "Série animée prête (partiellement) ⚠️",
                                          f"{len(statuts) - echecs}/{len(statuts)} écrans rendus, {echecs} en échec. À valider dans Contenus.")
        else:
            notification_service.notifier(tid, cid, reseau, "story.anime.ready",
                                          "Ta série animée est prête 🎬",
                                          f"{len(statuts)} écrans rendus, à valider dans Contenus.")
        return
    if echec:
        notification_service.notifier(tid, cid, reseau, "story.anime.echec",
                                      "Story animée : rendu échoué ❌",
                                      "Le rendu n'a pas abouti. Supprime la story et réessaie.")
    else:
        notification_service.notifier(tid, cid, reseau, "story.anime.ready",
                                      "Ta story animée est prête 🎬", "À valider dans Contenus.")


async def traiter_suivant() -> bool:
    """Rend UN job. Retourne True s'il en a traite un (le worker enchaine), False si
    la file est vide. Ne leve jamais : les erreurs finissent sur la ligne."""
    from services import remotion_service, quota_service
    _rearmer_perimes()
    row = _claim()
    if not row:
        return False
    job = row.get("render_job") or {}
    composition = job.get("composition") or "StoryAnime"
    tentatives = int(job.get("tentatives") or 0)
    rid, tid = row["id"], row.get("telegram_id")
    upload = job.get("upload") or {"folder": f"stories/{tid}",
                                   "public_id": f"{(rid or 'tmp').replace('-', '')[:16]}_anime"}
    try:
        mp4 = await asyncio.to_thread(
            remotion_service.render_mp4, job.get("props") or {}, composition,
            telegram_id=tid, etiquette=job.get("etiquette") or composition,
            prefix=job.get("prefix") or "remotion")
        if not _existe(rid):
            # Supprime pendant le rendu : rien a uploader, pas de ligne fantome.
            try:
                os.unlink(mp4)
            except OSError:
                pass
            logger.info(f"render worker: {rid} supprime pendant le rendu, upload ignore")
            return True
        res = _upload_video(mp4, upload)
        supabase.table("contenu").update({
            "video_url": res["video_url"], "video_preview_url": res["video_preview_url"],
            "lien_visuel": res["video_preview_url"], "video_status": "ready",
            "render_job": None, "render_started_at": None,
        }).eq("id", rid).execute()
        logger.info(f"render worker: {composition} {rid} rendu")
    except Exception as e:
        tentatives += 1
        err = str(e)[:400]
        if tentatives < MAX_TENTATIVES:
            logger.warning(f"render worker: {rid} echec {tentatives}/{MAX_TENTATIVES}, retentera : {err}")
            supabase.table("contenu").update({
                "render_job": {**job, "tentatives": tentatives, "erreur": err},
                "render_started_at": None,
            }).eq("id", rid).execute()
            return True
        logger.error(f"render worker: {rid} abandonne apres {tentatives} tentatives : {err}")
        maj = {"render_job": {**job, "tentatives": tentatives, "erreur": err}, "render_started_at": None}
        restaurer = job.get("restaurer")
        if restaurer:
            # Regeneration : la precedente video n'a pas ete touchee (l'upload
            # overwrite n'a lieu qu'en cas de succes) -> on la remet en place.
            maj.update({"video_url": restaurer.get("video_url"),
                        "video_preview_url": restaurer.get("video_preview_url"),
                        "lien_visuel": restaurer.get("video_preview_url"),
                        "reel_data": restaurer.get("reel_data"),
                        "video_status": "ready"})
        else:
            maj["video_status"] = "echec"
        supabase.table("contenu").update(maj).eq("id", rid).execute()
        # Le rendu ne sera jamais publie : on rend son unite de quota.
        try:
            quota_service.refund_by_user(tid, job.get("action_type") or "story")
        except Exception as e2:
            logger.warning(f"render worker refund {rid}: {e2}")
        row["_echec"] = True
    try:
        if _serie_terminee(row):
            _notifier_fin(row, job)
    except Exception as e:
        logger.warning(f"render worker notification {rid}: {e}")
    return True
