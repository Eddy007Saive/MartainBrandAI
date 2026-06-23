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


def handle_webhook(payload: dict) -> dict:
    """Traite un événement Late et met à jour le contenu correspondant (par late_post_id)."""
    event = payload.get("event") or payload.get("type") or ""
    data = payload.get("data") or payload
    post_id = data.get("postId") or data.get("_id") or data.get("id") or (data.get("post") or {}).get("_id")
    if not post_id:
        return {"ok": False, "error": "no post id"}

    q = supabase.table("contenu").select("id, telegram_id").eq("late_post_id", post_id).execute()
    if not q.data:
        return {"ok": False, "error": "contenu introuvable"}
    cid = q.data[0]["id"]

    if event.endswith("published"):
        url = (data.get("platformPostUrl") or data.get("url")
               or (data.get("post") or {}).get("platformPostUrl"))
        upd = {"publish_status": "publié", "statut": "Publie", "publish_error": None}
        if url:
            upd["lien_publication"] = url
        supabase.table("contenu").update(upd).eq("id", cid).execute()
    elif event.endswith("failed"):
        reason = data.get("error") or data.get("message") or "Échec de publication"
        supabase.table("contenu").update(
            {"publish_status": "échec", "publish_error": str(reason)[:400]}
        ).eq("id", cid).execute()
    return {"ok": True, "contenu_id": cid, "event": event}
