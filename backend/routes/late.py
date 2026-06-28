import json
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import HTMLResponse
from dependencies import verify_token
from services import late_service, contenu_service, social_service
from config import supabase, logger, FRONTEND_URL

router = APIRouter(prefix="/late", tags=["late"])


@router.get("/oauth-callback")
async def oauth_callback(telegram_id: str, platform: str, accountId: str = None):
    """Callback OAuth réseaux (public) : Late a connecté le compte au profil, on enregistre
    l'accountId puis on ferme le popup. Le front (à la fermeture) rafraîchit l'utilisateur."""
    ok = False
    try:
        res = await social_service.finalize_connection(telegram_id, platform, account_id=accountId)
        ok = res.get("ok", False)
    except Exception as e:
        logger.error(f"oauth-callback error {telegram_id}/{platform}: {e}")
    titre = "Compte connecté ✅" if ok else "Connexion échouée"
    detail = "Tu peux fermer cette fenêtre." if ok else "Réessaie depuis l'application."
    html = f"""<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>{titre}</title><style>
body{{font-family:-apple-system,Segoe UI,sans-serif;background:#020617;color:#e8edf6;display:grid;place-items:center;height:100vh;margin:0;text-align:center}}
.c{{max-width:360px;padding:24px}}h1{{font-size:20px;margin:0 0 8px}}p{{color:#93a1b8;font-size:14px}}
</style></head><body><div class="c"><h1>{titre}</h1><p>{detail}</p></div>
<script>try{{window.close();}}catch(e){{}} setTimeout(function(){{try{{window.close();}}catch(e){{}} location.replace('{FRONTEND_URL}/dashboard/parametres');}}, 1200);</script>
</body></html>"""
    return HTMLResponse(content=html)


@router.post("/publier/{contenu_id}")
async def publier(contenu_id: str, payload: dict = Depends(verify_token)):
    """Pousse un contenu validé dans Late (programmé à sa date). Anti-doublon via late_post_id."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    contenu = contenu_service.get_contenu(contenu_id, telegram_id)
    if not contenu:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    statut_pub = contenu.get("publish_status")
    if statut_pub == "publié":
        raise HTTPException(status_code=409, detail="Ce contenu est déjà publié.")
    # Re-programmation (ex. changement de date) : on annule l'ancien post Late puis on recrée
    if contenu.get("late_post_id") and statut_pub in ("programmé", "envoi"):
        try:
            await late_service.cancel_post(contenu["late_post_id"])
            logger.info(f"Re-programmation {contenu_id} : ancien post Late annulé")
        except Exception as e:
            logger.warning(f"Re-programmation {contenu_id} : annulation ancien post échouée: {e}")

    res = await late_service.publish_contenu(telegram_id, contenu)
    if res.get("ok"):
        # 'envoi' : confirmé 'programmé' quand Late renverra l'event post.scheduled
        supabase.table("contenu").update({
            "late_post_id": res.get("late_post_id"),
            "publish_status": "envoi",
            "publish_error": None,
        }).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
        return {"publish_status": "envoi", "late_post_id": res.get("late_post_id")}

    # échec -> on stocke la raison (visible dans l'app) et on remonte un message clair
    supabase.table("contenu").update({
        "publish_status": "échec", "publish_error": res.get("error"),
    }).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    raise HTTPException(status_code=502, detail=res.get("error") or "Échec de la publication")


@router.post("/annuler/{contenu_id}")
async def annuler(contenu_id: str, payload: dict = Depends(verify_token)):
    """Annule l'envoi d'un contenu programmé dans Late."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    contenu = contenu_service.get_contenu(contenu_id, telegram_id)
    if not contenu:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    if contenu.get("publish_status") == "publié":
        raise HTTPException(status_code=409, detail="Déjà publié — impossible d'annuler.")
    if not contenu.get("late_post_id"):
        raise HTTPException(status_code=400, detail="Ce contenu n'a pas été programmé.")
    res = await late_service.cancel_post(contenu["late_post_id"])
    if not res.get("ok"):
        raise HTTPException(status_code=502, detail=res.get("error") or "Échec de l'annulation")
    supabase.table("contenu").update(
        {"publish_status": "annulé", "late_post_id": None}
    ).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
    return {"publish_status": "annulé"}


@router.post("/webhook")
async def webhook(request: Request):
    """Webhook Late (public, vérifié par signature HMAC) : met à jour le statut de publication."""
    raw = await request.body()
    sig = request.headers.get("X-Late-Signature", "") or request.headers.get("x-late-signature", "")
    if not late_service.verify_signature(raw, sig):
        raise HTTPException(status_code=401, detail="Signature invalide")
    try:
        payload = json.loads(raw.decode() or "{}")
    except Exception:
        payload = {}
    try:
        res = late_service.handle_webhook(payload)
    except Exception as e:
        logger.error(f"Late webhook error: {e}")
        res = {"ok": False, "error": str(e)}
    return {"received": True, **res}
