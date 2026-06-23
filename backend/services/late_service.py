"""
Publication sociale via Late / Zernio (backend-direct, sans n8n).

Flux : on pousse le contenu validé dans Late avec sa date (`scheduledFor`).
Late le met en file et publie tout seul à l'heure, puis envoie un webhook
(post.published / post.failed) -> on met à jour le statut + le lien.
"""
import hmac
import hashlib
from datetime import datetime, timezone
from zernio import Zernio, ZernioError
from config import supabase, logger, LATE_API_KEY, LATE_WEBHOOK_SECRET

PLATFORMS = {"instagram", "facebook", "linkedin", "tiktok", "youtube"}
ACCOUNT_COL = {p: f"late_account_{p}" for p in PLATFORMS}
DEFAULT_TZ = "Europe/Paris"


def _media_items(contenu: dict, reseau: str) -> list:
    """Construit les médias Late selon le type de contenu et le réseau."""
    is_carrousel = contenu.get("type") == "Carrousel" or (contenu.get("slides_images") or [])
    if is_carrousel:
        if reseau == "linkedin" and contenu.get("carrousel_pdf"):
            return [{"url": contenu["carrousel_pdf"], "type": "document"}]
        slides = contenu.get("slides_images") or []
        if slides:
            return [{"url": u, "type": "image"} for u in slides[:10]]
    if contenu.get("lien_visuel"):
        return [{"url": contenu["lien_visuel"], "type": "image"}]
    return []


def _to_tz_iso(value: str, tz: str) -> str:
    """Convertit une date (UTC ou naïve) en ISO 8601 avec le décalage du fuseau `tz` explicite,
    pour que Late publie à l'heure murale du client sans ambiguïté (ex. 10:42+02:00)."""
    try:
        import re
        from zoneinfo import ZoneInfo
        s = str(value).strip().replace("Z", "+00:00").replace(" ", "T")
        s = re.sub(r"([+-]\d{2})$", r"\1:00", s)  # +00 -> +00:00
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(ZoneInfo(tz or DEFAULT_TZ)).isoformat()
    except Exception as e:
        logger.warning(f"_to_tz_iso fallback ({e}) pour {value!r} tz={tz!r}")
        return str(value)


def _client() -> Zernio:
    return Zernio(api_key=LATE_API_KEY)


async def publish_contenu(telegram_id: int, contenu: dict) -> dict:
    """Pousse un contenu dans Late via le SDK Zernio. Retourne {ok, late_post_id, status} ou {ok:False, error}."""
    if not LATE_API_KEY:
        return {"ok": False, "error": "Publication indisponible : clé Late non configurée (contacte le support)."}
    reseau = (contenu.get("reseau_cible") or "").lower()
    if reseau not in PLATFORMS:
        return {"ok": False, "error": "Aucun réseau cible défini sur ce contenu."}

    res = supabase.table("users").select(f"{ACCOUNT_COL[reseau]}, timezone").eq("telegram_id", telegram_id).execute()
    row = res.data[0] if res.data else {}
    account_id = row.get(ACCOUNT_COL[reseau])
    user_tz = row.get("timezone") or DEFAULT_TZ
    if not account_id:
        return {"ok": False, "error": f"Compte {reseau.capitalize()} non connecté. Connecte-le dans Paramètres."}

    content = contenu.get("contenu") or ""
    media = _media_items(contenu, reseau)
    if not content and not media:
        return {"ok": False, "error": "Le contenu est vide (ni texte ni visuel)."}

    kwargs = {
        "content": content,
        "platforms": [{"platform": reseau, "accountId": account_id}],
        "timezone": user_tz,
    }
    if media:
        kwargs["media_items"] = media
    if contenu.get("date_publication"):
        kwargs["scheduled_for"] = _to_tz_iso(contenu["date_publication"], user_tz)

    try:
        async with _client() as c:
            r = await c.posts.acreate(**kwargs)
    except ZernioError as e:
        msg = getattr(e, "message", None) or str(e)
        logger.error(f"Late publish error: {msg}")
        return {"ok": False, "error": msg}
    except Exception as e:
        logger.error(f"Late publish exception: {e}")
        return {"ok": False, "error": "Late injoignable, réessaie."}

    post = getattr(r, "post", None)
    late_id = getattr(post, "field_id", None) if post else None
    status = getattr(post, "status", None) if post else None
    status = getattr(status, "value", None) or str(status) if status else "scheduled"
    if not late_id:
        logger.error(f"Late publish: id introuvable dans la réponse SDK: {r}")
    return {"ok": True, "late_post_id": late_id, "status": status}


def verify_signature(raw_body: bytes, signature: str) -> bool:
    """Best-effort : la spec de signature Late n'est pas documentée et le 'test' du dashboard
    n'est pas signé. On accepte toujours (l'URL du webhook fait office de secret), mais si une
    signature est présente et ne correspond pas (hex ou base64), on log un avertissement."""
    if not LATE_WEBHOOK_SECRET or not signature:
        return True
    try:
        import base64
        mac = hmac.new(LATE_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256)
        hexd = mac.hexdigest()
        b64 = base64.b64encode(hmac.new(LATE_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).digest()).decode()
        sig = signature.split("=", 1)[-1].strip()
        if not (hmac.compare_digest(hexd, sig) or hmac.compare_digest(b64, sig)):
            # Diagnostic du format (tronqué, sans exposer le secret) pour pouvoir implémenter le bon schéma
            logger.info(
                "Late webhook signature non matchée — format reçu=%r (len=%d) | attendu_hex_prefix=%s | attendu_b64_prefix=%s",
                signature[:24], len(signature), hexd[:8], b64[:8],
            )
    except Exception as e:
        logger.warning(f"Late webhook signature check error: {e}")
    return True


def _notify(telegram_id, contenu_id, reseau, event, titre, message):
    try:
        supabase.table("notifications").insert({
            "telegram_id": telegram_id, "type": "publication", "event": event,
            "titre": titre, "message": message, "contenu_id": contenu_id, "reseau": reseau,
        }).execute()
    except Exception as e:
        logger.warning(f"notif insert error: {e}")


async def cancel_post(late_post_id: str) -> dict:
    """Supprime un post dans Late (Zernio deletePost) — annulation d'envoi ou suppression."""
    if not LATE_API_KEY:
        return {"ok": False, "error": "Clé Late non configurée"}
    try:
        async with _client() as c:
            await c.posts.adelete(post_id=late_post_id)
        return {"ok": True}
    except ZernioError as e:
        return {"ok": False, "error": getattr(e, "message", None) or str(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def handle_webhook(payload: dict) -> dict:
    """Traite TOUS les événements Late : met à jour le statut du contenu + crée une notification."""
    event = (payload.get("event") or payload.get("type") or "").lower()
    post = payload.get("post") or payload.get("data") or payload
    platforms = post.get("platforms") if isinstance(post.get("platforms"), list) else []
    plat0 = platforms[0] if platforms else {}
    post_id = post.get("id") or post.get("_id") or payload.get("postId") or post.get("postId")
    if not post_id:
        return {"ok": False, "error": "no post id"}

    q = supabase.table("contenu").select("id, telegram_id, titre, reseau_cible").eq("late_post_id", post_id).execute()
    if q.data:
        c = q.data[0]
    else:
        # Filet de sécurité : retrouver par le TEXTE du post (cas où late_post_id n'a pas pu être stocké),
        # puis réattacher l'id pour les prochains événements.
        content = post.get("content") or ""
        reseau_w = (plat0.get("platform") or post.get("platform") or "").lower()
        cand = []
        if content:
            r = supabase.table("contenu").select("id, telegram_id, titre, reseau_cible, late_post_id").eq("contenu", content).execute()
            cand = [x for x in (r.data or []) if not x.get("late_post_id")]
            if reseau_w:
                cand = [x for x in cand if (x.get("reseau_cible") or "").lower() == reseau_w] or cand
        if not cand:
            return {"ok": False, "error": "contenu introuvable"}
        c = cand[0]
        supabase.table("contenu").update({"late_post_id": post_id}).eq("id", c["id"]).execute()
        logger.info(f"Webhook: contenu {c['id']} ré-attaché à late_post_id={post_id} (via texte)")
    cid, tg, reseau = c["id"], c["telegram_id"], c.get("reseau_cible") or ""
    titre_c = (c.get("titre") or "Ton post")[:60]

    # Late expose l'URL du post publié dans "publishedUrl" (objet platform top-level ou post.platforms[])
    plat_obj = payload.get("platform") if isinstance(payload.get("platform"), dict) else {}
    pub_url = (plat_obj.get("publishedUrl") or plat_obj.get("url") or plat_obj.get("platformPostUrl")
               or plat0.get("publishedUrl") or plat0.get("platformPostUrl") or plat0.get("url")
               or post.get("publishedUrl") or post.get("platformPostUrl") or post.get("url"))

    upd, notif = {}, None
    if "published" in event:                       # post.published / post.platform.published
        url = pub_url
        upd = {"publish_status": "publié", "statut": "Publie", "publish_error": None}
        if url:
            upd["lien_publication"] = url
        notif = ("Post publié ✅", f"« {titre_c} » a été publié sur {reseau}.")
    elif "partial" in event:                       # post.partial
        upd = {"publish_status": "partiel"}
        notif = ("Publication partielle ⚠️", f"« {titre_c} » a été publié partiellement sur {reseau}.")
    elif "failed" in event:                        # post.failed / post.platform.failed
        reason = plat0.get("error") or post.get("error") or payload.get("error") or "raison inconnue"
        upd = {"publish_status": "échec", "publish_error": str(reason)[:400]}
        notif = ("Échec de publication ❌", f"« {titre_c} » n'a pas pu être publié sur {reseau} : {reason}")
    elif "scheduled" in event:                     # post.scheduled (confirme la mise en file)
        upd = {"publish_status": "programmé"}
        notif = ("Publication programmée ⏱", f"« {titre_c} » est programmé sur {reseau}.")
    elif "cancelled" in event:                     # post.cancelled
        upd = {"publish_status": "annulé"}
        notif = ("Publication annulée", f"La publication de « {titre_c} » sur {reseau} a été annulée.")
    elif "recycled" in event:                      # post.recycled
        upd = {"publish_status": "programmé"}
        notif = ("Post recyclé ♻️", f"« {titre_c} » a été reprogrammé sur {reseau}.")
    else:
        return {"ok": True, "ignored": event}

    if upd:
        supabase.table("contenu").update(upd).eq("id", cid).execute()
    if notif:
        _notify(tg, cid, reseau, event, notif[0], notif[1])
        try:
            from services import push_service
            push_service.send_to_user(tg, notif[0], notif[1], {"contenu_id": str(cid), "event": event})
        except Exception as e:
            logger.warning(f"push send error: {e}")
    return {"ok": True, "contenu_id": cid, "event": event}
