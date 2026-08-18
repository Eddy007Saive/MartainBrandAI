from fastapi import APIRouter, HTTPException, Depends, Request
from dependencies import verify_token, verify_admin_token
from services import billing_service, mail_service
from config import logger, ADMIN_NOTIF_EMAIL

router = APIRouter(prefix="/billing", tags=["billing"])


@router.post("/admin/lien-pack")
async def lien_pack(body: dict, payload: dict = Depends(verify_admin_token)):
    """Génère le lien de paiement du Pack Fondations pour un client précis.

    C'est le lien qu'on envoie après le rendez-vous. Le code de l'apporteur
    d'affaires y est déposé en metadata : sans lui, la commission de 25 %
    retombe sur le parrain déjà connu du client, et sinon il n'y en a pas.
    La devise suit le marché — dollar pour l'hispanophone, euro sinon.
    """
    res = billing_service.lien_pack(
        email=body.get("email"), telegram_id=body.get("telegram_id"),
        affilie=body.get("affilie"), devise=body.get("devise"),
        langue=body.get("langue"))
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res


@router.post("/checkout")
async def checkout(body: dict, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    plan = (body.get("plan") or "pro").lower()  # offre unique pour l'instant
    if plan != "pro":
        raise HTTPException(status_code=400, detail="Offre invalide")
    r = billing_service.create_checkout(telegram_id, plan)
    if not r.get("ok"):
        raise HTTPException(status_code=400, detail=r.get("error"))
    return {"url": r["url"]}


@router.get("/packs")
async def packs(action_type: str = None, payload: dict = Depends(verify_token)):
    """Packs de rachat disponibles (en résultats), optionnellement filtrés par type."""
    return {"packs": billing_service.list_packs(action_type)}


@router.post("/pack-checkout")
async def pack_checkout(body: dict, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    pack_id = body.get("pack_id")
    if not pack_id:
        raise HTTPException(status_code=400, detail="pack_id requis")
    r = billing_service.create_pack_checkout(telegram_id, pack_id)
    if not r.get("ok"):
        raise HTTPException(status_code=400, detail=r.get("error"))
    return {"url": r["url"]}


@router.post("/sync")
async def sync(payload: dict = Depends(verify_token)):
    """Resynchronise l'abonnement Stripe -> table subscriptions (au retour du paiement / webhook manqué)."""
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    return billing_service.sync_subscription(telegram_id)


@router.get("/invoices")
async def invoices(payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    return {"invoices": billing_service.list_invoices(telegram_id)}


@router.post("/portal")
async def portal(payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    r = billing_service.create_portal(telegram_id)
    if not r.get("ok"):
        raise HTTPException(status_code=400, detail=r.get("error"))
    return {"url": r["url"]}


@router.post("/webhook")
async def stripe_webhook(request: Request):
    raw = await request.body()
    sig = request.headers.get("stripe-signature")
    try:
        result = billing_service.handle_webhook(raw, sig)
        # Abonnement terminé (fin de cycle) -> on déconnecte ses réseaux (stoppe le coût Late)
        uid = result.get("canceled_uid") if isinstance(result, dict) else None
        if uid:
            from services import social_service
            try:
                await social_service.disconnect_all(uid)
            except Exception as e:
                logger.error(f"webhook disconnect_all {uid}: {e}")
        # Notification admin (email) sur les événements de facturation
        notify = result.get("notify") if isinstance(result, dict) else None
        if notify:
            try:
                detail = {
                    "new_sub": "Plan Pro — 279 €/mois",
                    "canceling": notify.get("extra") or "Se termine en fin de période.",
                    "pack": f"Pack : {notify.get('extra') or 'crédits'}",
                    "canceled": "Abonnement terminé — réseaux libérés.",
                    "payment_failed": "Le prélèvement a échoué (carte ?).",
                }.get(notify.get("kind"), "")
                subject, html = mail_service.admin_payment_html(
                    notify["kind"], notify.get("nom"), notify.get("email"), detail)
                await mail_service.send_email(ADMIN_NOTIF_EMAIL, subject, html)
            except Exception as e:
                logger.error(f"webhook admin notif: {e}")
        # Facture au CLIENT (paiement d'abonnement réussi ou achat de pack)
        facture = result.get("facture") if isinstance(result, dict) else None
        if facture:
            try:
                sujet, html = mail_service.facture_html(
                    facture.get("nom"), facture["montant"], facture["devise"], facture["libelle"],
                    numero=facture.get("numero"), url=facture.get("url"), pdf=facture.get("pdf"))
                await mail_service.send_email(facture["email"], sujet, html)
            except Exception as e:
                logger.error(f"webhook facture client: {e}")
        return result
    except Exception as e:
        logger.error(f"stripe webhook error: {e}")
        return {"ok": False}
