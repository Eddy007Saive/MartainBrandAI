"""
Publication sociale via Late / Zernio (backend-direct, sans n8n).

Flux : on pousse le contenu validé dans Late avec sa date (`scheduledFor`).
Late le met en file et publie tout seul à l'heure, puis envoie un webhook
(post.published / post.failed) -> on met à jour le statut + le lien.
"""
import hmac
import hashlib
import httpx
from datetime import datetime, timezone
from config import supabase, logger, LATE_API_KEY, LATE_API_BASE, LATE_WEBHOOK_SECRET

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


def _err_message(r: httpx.Response) -> str:
    try:
        d = r.json()
        return (d.get("error", {}).get("message") if isinstance(d.get("error"), dict)
                else d.get("error") or d.get("message")) or f"Erreur Late {r.status_code}"
    except Exception:
        return f"Erreur Late {r.status_code}"


async def publish_contenu(telegram_id: int, contenu: dict) -> dict:
    """Pousse un contenu dans Late. Retourne {ok, late_post_id, status} ou {ok:False, error}."""
    if not LATE_API_KEY:
        return {"ok": False, "error": "Publication indisponible : clé Late non configurée (contacte le support)."}
    reseau = (contenu.get("reseau_cible") or "").lower()
    if reseau not in PLATFORMS:
        return {"ok": False, "error": "Aucun réseau cible défini sur ce contenu."}

    res = supabase.table("users").select(ACCOUNT_COL[reseau]).eq("telegram_id", telegram_id).execute()
    account_id = res.data[0].get(ACCOUNT_COL[reseau]) if res.data else None
    if not account_id:
        return {"ok": False, "error": f"Compte {reseau.capitalize()} non connecté. Connecte-le dans Paramètres."}

    body = {
        "content": contenu.get("contenu") or "",
        "platforms": [{"platform": reseau, "accountId": account_id}],
        "timezone": DEFAULT_TZ,
    }
    if contenu.get("date_publication"):
        body["scheduledFor"] = contenu["date_publication"]
    media = _media_items(contenu, reseau)
    if media:
        body["mediaItems"] = media
    if not body["content"] and not media:
        return {"ok": False, "error": "Le contenu est vide (ni texte ni visuel)."}

    try:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(f"{LATE_API_BASE}/posts",
                             headers={"Authorization": f"Bearer {LATE_API_KEY}", "Content-Type": "application/json"},
                             json=body)
    except Exception as e:
        logger.error(f"Late publish exception: {e}")
        return {"ok": False, "error": "Late injoignable, réessaie."}

    if r.status_code in (200, 201):
        d = r.json()
        return {"ok": True, "late_post_id": d.get("_id") or d.get("id"), "status": d.get("status") or "scheduled"}
    logger.error(f"Late publish error {r.status_code}: {r.text[:300]}")
    return {"ok": False, "error": _err_message(r)}


def verify_signature(raw_body: bytes, signature: str) -> bool:
    """Vérifie la signature HMAC-SHA256 du webhook Late (header X-Late-Signature)."""
    if not LATE_WEBHOOK_SECRET:
        return True  # pas de secret configuré -> on accepte (à durcir en prod)
    if not signature:
        return False
    expected = hmac.new(LATE_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()
    sig = signature.split("=", 1)[-1].strip()  # supporte "sha256=..."
    return hmac.compare_digest(expected, sig)


def _notify(telegram_id, contenu_id, reseau, event, titre, message):
    try:
        supabase.table("notifications").insert({
            "telegram_id": telegram_id, "type": "publication", "event": event,
            "titre": titre, "message": message, "contenu_id": contenu_id, "reseau": reseau,
        }).execute()
    except Exception as e:
        logger.warning(f"notif insert error: {e}")


async def cancel_post(late_post_id: str) -> dict:
    """Annule un post programmé dans Late."""
    if not LATE_API_KEY:
        return {"ok": False, "error": "Clé Late non configurée"}
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.delete(f"{LATE_API_BASE}/posts/{late_post_id}",
                               headers={"Authorization": f"Bearer {LATE_API_KEY}"})
        if r.status_code in (200, 204):
            return {"ok": True}
        return {"ok": False, "error": _err_message(r)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def handle_webhook(payload: dict) -> dict:
    """Traite TOUS les événements Late : met à jour le statut du contenu + crée une notification."""
    event = (payload.get("event") or payload.get("type") or "").lower()
    data = payload.get("data") or payload
    post_id = data.get("postId") or data.get("_id") or data.get("id") or (data.get("post") or {}).get("_id")
    if not post_id:
        return {"ok": False, "error": "no post id"}

    q = supabase.table("contenu").select("id, telegram_id, titre, reseau_cible").eq("late_post_id", post_id).execute()
    if not q.data:
        return {"ok": False, "error": "contenu introuvable"}
    c = q.data[0]
    cid, tg, reseau = c["id"], c["telegram_id"], c.get("reseau_cible") or ""
    titre_c = (c.get("titre") or "Ton post")[:60]

    upd, notif = {}, None
    if "published" in event:                       # post.published / post.platform.published
        url = data.get("platformPostUrl") or data.get("url") or (data.get("post") or {}).get("platformPostUrl")
        upd = {"publish_status": "publié", "statut": "Publie", "publish_error": None}
        if url:
            upd["lien_publication"] = url
        notif = ("Post publié ✅", f"« {titre_c} » a été publié sur {reseau}.")
    elif "partial" in event:                       # post.partial
        upd = {"publish_status": "partiel"}
        notif = ("Publication partielle ⚠️", f"« {titre_c} » a été publié partiellement sur {reseau}.")
    elif "failed" in event:                        # post.failed / post.platform.failed
        reason = data.get("error") or data.get("message") or "raison inconnue"
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
    return {"ok": True, "contenu_id": cid, "event": event}
