"""
File de rendu Remotion en arriere-plan.

Un rendu Remotion prend 50-90 s par ecran et sature les coeurs du conteneur :
impossible de rendre une serie de 4-6 stories animees dans une requete HTTP.
Ici la ligne `contenu` EST le job (meme choix que le montage Submagic avec
`video_status`) :

  video_status      = "en_traitement" tant que le rendu n'est pas fait
  render_job        = {composition, props, prefix, tentatives, erreur}
  render_started_at = pose au claim par le worker ; NULL = libre. Un claim
                      perime (> STALE_MIN) est repris : un redemarrage Railway
                      pendant un rendu ne perd pas le job, juste le MP4 temporaire.

Le worker (`server._render_worker`) appelle `traiter_suivant()` en boucle ; un
seul rendu a la fois. Le semaphore de remotion_service reste en garde-fou pour
les reels encore synchrones.
"""
import asyncio
from datetime import datetime, timedelta, timezone

from config import supabase, logger

MAX_TENTATIVES = 2
STALE_MIN = 15
_ETIQUETTES = {"StoryAnime": "story_anime"}


def enqueue_story_animee(row_id: str, telegram_id: str, accroche: str, sous: str, cta: str,
                         colors: dict = None, mot_accent: str = None) -> None:
    """Met une story animee en file : la ligne existe deja (statut A valider), on
    lui accroche les props Remotion et le statut en_traitement. Retour immediat."""
    from services import story_service
    props = story_service.props_story_animee(telegram_id, accroche, sous, cta,
                                             colors=colors, mot_accent=mot_accent)
    supabase.table("contenu").update({
        "render_job": {"composition": "StoryAnime", "props": props,
                       "prefix": "story_anime", "tentatives": 0},
        "video_status": "en_traitement",
        "render_started_at": None,
    }).eq("id", row_id).execute()


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


def _serie_terminee(row: dict) -> bool:
    """Vrai quand plus aucun ecran de la meme serie (ou la ligne seule) n'attend."""
    if not row.get("serie_id"):
        return True
    r = (supabase.table("contenu").select("id").eq("serie_id", row["serie_id"])
         .eq("video_status", "en_traitement").limit(1).execute())
    return not r.data


def _notifier_fin(row: dict) -> None:
    from services import notification_service
    tid, cid = row.get("telegram_id"), row.get("id")
    if row.get("serie_id"):
        r = (supabase.table("contenu").select("video_status").eq("serie_id", row["serie_id"]).execute())
        statuts = [x.get("video_status") for x in (r.data or [])]
        echecs = statuts.count("echec")
        if echecs == len(statuts):
            notification_service.notifier(tid, cid, row.get("reseau_cible"), "story.anime.echec",
                                          "Série animée : rendu échoué ❌",
                                          "Aucun écran n'a pu être rendu. Supprime la série et réessaie.")
        elif echecs:
            notification_service.notifier(tid, cid, row.get("reseau_cible"), "story.anime.ready",
                                          "Série animée prête (partiellement) ⚠️",
                                          f"{len(statuts) - echecs}/{len(statuts)} écrans rendus, {echecs} en échec. À valider dans Contenus.")
        else:
            notification_service.notifier(tid, cid, row.get("reseau_cible"), "story.anime.ready",
                                          "Ta série animée est prête 🎬",
                                          f"{len(statuts)} écrans rendus, à valider dans Contenus.")
        return
    if row.get("_echec"):
        notification_service.notifier(tid, cid, row.get("reseau_cible"), "story.anime.echec",
                                      "Story animée : rendu échoué ❌",
                                      "Le rendu n'a pas abouti. Supprime la story et réessaie.")
    else:
        notification_service.notifier(tid, cid, row.get("reseau_cible"), "story.anime.ready",
                                      "Ta story animée est prête 🎬", "À valider dans Contenus.")


async def traiter_suivant() -> bool:
    """Rend UN job. Retourne True s'il en a traite un (le worker enchaine), False si
    la file est vide. Ne leve jamais : les erreurs finissent sur la ligne."""
    from services import remotion_service, story_service, quota_service
    _rearmer_perimes()
    row = _claim()
    if not row:
        return False
    job = row.get("render_job") or {}
    composition = job.get("composition") or "StoryAnime"
    tentatives = int(job.get("tentatives") or 0)
    rid, tid = row["id"], row.get("telegram_id")
    try:
        mp4 = await asyncio.to_thread(
            remotion_service.render_mp4, job.get("props") or {}, composition,
            telegram_id=tid, etiquette=_ETIQUETTES.get(composition, composition),
            prefix=job.get("prefix") or "remotion")
        res = story_service.upload_story_video(mp4, tid, rid)
        if not res.get("video_url"):
            raise RuntimeError("upload Cloudinary sans URL")
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
        supabase.table("contenu").update({
            "video_status": "echec",
            "render_job": {**job, "tentatives": tentatives, "erreur": err},
            "render_started_at": None,
        }).eq("id", rid).execute()
        # L'ecran ne sera jamais publie : on rend son unite de quota.
        try:
            quota_service.refund_by_user(tid, "story")
        except Exception as e2:
            logger.warning(f"render worker refund {rid}: {e2}")
        row["_echec"] = True
    try:
        if _serie_terminee(row):
            _notifier_fin(row)
    except Exception as e:
        logger.warning(f"render worker notification {rid}: {e}")
    return True
