import httpx
import cloudinary
import cloudinary.uploader
from datetime import datetime, timezone
from config import supabase, logger, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
from services import planning_service
from services.user_service import _public_id_from_cloudinary_url

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)


def upload_visuel(telegram_id: str, contenu_id: str, file_bytes: bytes) -> dict | None:
    """Importe une image fournie par l'utilisateur comme visuel du contenu.
    Upload Cloudinary, met à jour lien_visuel, confirme la planification, remplace l'ancien asset."""
    cur = get_contenu(contenu_id, telegram_id)
    if not cur:
        return None
    old = cur.get("lien_visuel")
    # public_id déterministe par contenu -> un ré-import ÉCRASE le même asset (pas d'accumulation)
    public_id = f"contenus/{telegram_id}/{contenu_id}"
    up = cloudinary.uploader.upload(file_bytes, resource_type="image", public_id=public_id, overwrite=True, invalidate=True)
    url = up["secure_url"]

    upd = {"lien_visuel": url}
    # Pas de statut "Planifie" optimiste : la route appelante pousse vers Zernio et c'est
    # l'event webhook post.scheduled qui confirmera le statut (source de vérité = Zernio).
    if not cur.get("date_publication"):
        creneau = planning_service.prochain_creneau(telegram_id, cur.get("reseau_cible"))
        if creneau:
            upd["date_publication"] = creneau
    supabase.table("contenu").update(upd).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()

    # Supprime l'ancien asset SEULEMENT s'il a un public_id différent (sinon on vient de l'écraser)
    if old:
        pid = _public_id_from_cloudinary_url(old)
        if pid and pid != public_id:
            try:
                cloudinary.uploader.destroy(pid, invalidate=True)
            except Exception as e:
                logger.warning(f"destroy old visuel: {e}")

    return {"lien_visuel": url,
            "statut": upd.get("statut", cur.get("statut")),
            "date_publication": upd.get("date_publication") or cur.get("date_publication")}


def get_contenus(telegram_id: str, statut: str = None) -> list:
    query = supabase.table("contenu").select("*").eq("telegram_id", telegram_id)
    if statut:
        query = query.eq("statut", statut)
    result = query.order("created_at", desc=True).execute()
    return result.data


def get_contenu(contenu_id: str, telegram_id: str) -> dict | None:
    result = supabase.table("contenu").select("*").eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    return result.data[0] if result.data else None


async def update_contenu(contenu_id: str, telegram_id: str, update_data: dict) -> dict:
    # Get current content to check callback_url
    current = supabase.table("contenu").select("*").eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    if not current.data:
        return {"error": "not_found"}

    contenu_data = current.data[0]
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    # Auto-planification : à la validation, (re)pose une date si absente OU déjà passée
    # (on ne planifie jamais une publication dans le passé).
    if update_data.get("statut") == "Valider":
        eff_date = update_data.get("date_publication") or contenu_data.get("date_publication")
        today = datetime.now(timezone.utc).date()
        past = False
        if eff_date:
            try:
                past = datetime.fromisoformat(str(eff_date).replace("Z", "+00:00")).date() < today
            except Exception:
                past = False
        if not eff_date or past:
            creneau = planning_service.prochain_creneau(telegram_id, contenu_data.get("reseau_cible"))
            if creneau:
                update_data["date_publication"] = creneau
                logger.info(f"Auto-planif contenu {contenu_id} -> {creneau} ({'date passée' if past else 'date absente'})")

    # If validating content and callback_url exists, call the webhook
    webhook_result = None
    if update_data.get("statut") == "Valider" and contenu_data.get("callback_url"):
        callback_url = contenu_data["callback_url"]
        try:
            logger.info(f"Calling validation webhook: {callback_url}")
            async with httpx.AsyncClient(timeout=30) as client:
                webhook_response = await client.post(
                    callback_url,
                    json={
                        "contenu_id": contenu_id,
                        "telegram_id": telegram_id,
                        "action": "validate",
                        "statut": "Valider"
                    }
                )
                logger.info(f"Webhook response: {webhook_response.status_code}")
                webhook_result = {
                    "success": webhook_response.status_code == 200,
                    "status_code": webhook_response.status_code
                }
        except Exception as webhook_error:
            logger.error(f"Webhook error: {webhook_error}")
            webhook_result = {"success": False, "error": str(webhook_error)}

    result = supabase.table("contenu").update(update_data).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    response = result.data[0] if result.data else contenu_data

    # Validation = programmation : un contenu validé avec une date part sur Zernio tout de suite
    # (l'event post.scheduled confirmera le statut Planifie). Best-effort : un échec est stocké
    # dans publish_status/publish_error sans bloquer la validation.
    if update_data.get("statut") == "Valider" and (response.get("date_publication") or update_data.get("date_publication")):
        try:
            from services import late_service
            pub = await late_service.programmer_contenu(telegram_id, contenu_id)
            response["publish_status"] = "envoi" if pub.get("ok") else response.get("publish_status")
        except Exception as e:
            logger.warning(f"programmation après validation {contenu_id}: {e}")

    if webhook_result:
        response["webhook_result"] = webhook_result
    return response


RESEAUX_RECYCLAGE = {"linkedin": "LinkedIn", "instagram": "Instagram", "facebook": "Facebook",
                     "tiktok": "TikTok", "youtube": "YouTube", "googlebusiness": "GoogleBusiness"}


async def recycler_contenu(telegram_id: str, contenu_id: str, reseaux: list) -> dict:
    """Recycle un contenu vers d'autres réseaux : une COPIE par réseau (cartes jumelles),
    chacune avec son propre créneau de publication et ses propres assets.
    - image simple : fichier Cloudinary dupliqué (public_id propre -> suppression sans effet de bord)
    - carrousel : slides re-rendues pour la copie depuis carrousel_data (pas de re-génération LLM)
    - vidéo : URL partagée (même modèle que les jumelles du Studio Vidéo)
    Les copies arrivent en « A valider » : à la validation, le flux normal les programme sur Zernio."""
    cur = get_contenu(contenu_id, telegram_id)
    if not cur:
        return {"error": "Contenu introuvable."}
    src_net = (cur.get("reseau_cible") or "").lower()
    targets = []
    for r in (reseaux or []):
        cap = RESEAUX_RECYCLAGE.get(str(r).strip().lower())
        if cap and cap.lower() != src_net and cap not in targets:
            targets.append(cap)
    if not targets:
        return {"error": "Aucun réseau cible valide (choisis un réseau différent de celui du post)."}

    COPY = ("titre", "contenu", "type", "script", "prompt_image", "carrousel_data",
            "video_url", "video_status", "video_preview_url", "lien_visuel")
    is_carrousel = cur.get("type") == "Carrousel" or bool(cur.get("slides_images"))
    created = []
    for net in targets:
        row = {k: cur.get(k) for k in COPY if cur.get(k) is not None}
        if is_carrousel:
            row.pop("lien_visuel", None)  # re-rendu ci-dessous avec les assets de la copie
        row.update({"telegram_id": telegram_id, "reseau_cible": net, "statut": "A valider",
                    "created_at": datetime.now(timezone.utc).isoformat()})
        creneau = planning_service.prochain_creneau(telegram_id, net)
        if creneau:
            row["date_publication"] = creneau
        ins = supabase.table("contenu").insert(row).execute()
        new_id = ins.data[0]["id"] if ins.data else None
        if not new_id:
            continue

        # Assets propres à la copie
        if is_carrousel and cur.get("carrousel_data"):
            try:
                from services import carrousel_service
                res = await carrousel_service.generer_carrousel(telegram_id, cur["carrousel_data"], new_id, "creme")
                imgs = res.get("images", [])
                if imgs:
                    supabase.table("contenu").update(
                        {"slides_images": imgs, "lien_visuel": imgs[0], "carrousel_pdf": res.get("pdf")}
                    ).eq("id", new_id).execute()
            except Exception as e:
                logger.warning(f"recyclage carrousel {new_id}: {e}")
        elif cur.get("lien_visuel") and not cur.get("video_url"):
            try:
                up = cloudinary.uploader.upload(cur["lien_visuel"], resource_type="image",
                                                public_id=f"contenus/{telegram_id}/{new_id}",
                                                overwrite=True, invalidate=True)
                supabase.table("contenu").update({"lien_visuel": up["secure_url"]}).eq("id", new_id).execute()
            except Exception as e:
                logger.warning(f"recyclage visuel {new_id}: {e}")

        created.append({"id": new_id, "reseau": net, "date_publication": row.get("date_publication")})
    return {"created": created}


def _raw_public_id(url: str) -> str | None:
    """public_id (avec extension) d'un asset Cloudinary raw, ex. carrousels/<tg>/<base>_doc.pdf"""
    import re
    m = re.search(r"/upload/(?:v\d+/)?(.+)$", url or "")
    return m.group(1) if m else None


def _cleanup_assets(c: dict) -> None:
    """Supprime les assets Cloudinary liés au contenu (best-effort, pas d'accumulation)."""
    imgs = []
    if c.get("lien_visuel"):
        imgs.append(c["lien_visuel"])
    if isinstance(c.get("slides_images"), list):
        imgs += c["slides_images"]
    for u in imgs:
        pid = _public_id_from_cloudinary_url(u)
        if pid:
            try:
                cloudinary.uploader.destroy(pid, resource_type="image", invalidate=True)
            except Exception as e:
                logger.warning(f"cleanup image {pid}: {e}")
    if c.get("carrousel_pdf"):
        pid = _raw_public_id(c["carrousel_pdf"])
        if pid:
            try:
                cloudinary.uploader.destroy(pid, resource_type="raw", invalidate=True)
            except Exception as e:
                logger.warning(f"cleanup pdf {pid}: {e}")


async def delete_contenu(contenu_id: str, telegram_id: str) -> bool:
    """Suppression complète : retire le post de Late, nettoie Cloudinary, supprime la ligne."""
    cur = get_contenu(contenu_id, telegram_id)
    if not cur:
        return False
    if cur.get("late_post_id"):
        try:
            from services import late_service
            await late_service.cancel_post(cur["late_post_id"])  # Zernio deletePost
        except Exception as e:
            logger.warning(f"delete: suppression post Late échouée: {e}")
    _cleanup_assets(cur)
    result = supabase.table("contenu").delete().eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    return bool(result.data)
