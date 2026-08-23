from fastapi import APIRouter, HTTPException, Depends, Request
from dependencies import verify_token, verify_admin_token
from services import billing_service, mail_service
from config import logger, ADMIN_NOTIF_EMAIL, supabase

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
    # essai=true : parcours d'inscription. La carte est saisie, rien n'est
    # preleve, et Stripe declenche lui-meme le premier paiement au 14e jour.
    # On ne l'accorde qu'une fois : un compte qui a deja eu un abonnement
    # repasse en paiement immediat, sinon l'essai se renouvelle a volonte en
    # resiliant puis en se reabonnant.
    essai = billing_service.ESSAI_JOURS if (
        body.get("essai") and not billing_service.a_deja_eu_un_abonnement(telegram_id)) else 0
    r = billing_service.create_checkout(telegram_id, plan, essai_jours=essai)
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


@router.post("/resilier")
async def resilier(body: dict, payload: dict = Depends(verify_token)):
    """Arrete le renouvellement. L'acces reste ouvert jusqu'au terme deja paye.

    La resiliation se fait ICI et non plus dans le portail Stripe : le portail
    emmene le client hors de chez nous, ou l'on ne peut ni lui demander
    pourquoi il part, ni lui proposer autre chose. La raison de son depart est
    la seule donnee que ce moment produit, et elle etait perdue.
    """
    telegram_id = payload.get("telegram_id")
    res = billing_service.resilier(telegram_id, (body or {}).get("raison"),
                                   (body or {}).get("commentaire"))
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    # Confirmation ecrite, avec la date de fin d'acces : sans elle, la question
    # « jusqu'a quand ? » revient au support dans les heures qui suivent.
    try:
        from config import FRONTEND_URL
        u = supabase.table("users").select("email, nom").eq("telegram_id", telegram_id).execute()
        if u.data and u.data[0].get("email"):
            sujet, html = mail_service.resiliation_html(
                u.data[0].get("nom"), res.get("fin_acces_le"),
                f"{FRONTEND_URL}/dashboard/parametres?s=abonnement")
            await mail_service.send_email(u.data[0]["email"], sujet, html)
    except Exception as e:
        logger.error(f"email de resiliation: {e}")
    return res


@router.post("/pause")
async def pause(body: dict, payload: dict = Depends(verify_token)):
    """Suspend la facturation ET l'acces, un a trois mois, config conservee."""
    res = billing_service.mettre_en_pause(
        payload.get("telegram_id"), (body or {}).get("mois"),
        (body or {}).get("raison"), (body or {}).get("commentaire"))
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res


@router.post("/reprendre")
async def reprendre(payload: dict = Depends(verify_token)):
    """Sort de pause, ou annule une resiliation programmee. Un seul geste."""
    res = billing_service.reprendre(payload.get("telegram_id"))
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res


@router.post("/webhook")
async def stripe_webhook(request: Request):
    raw = await request.body()
    sig = request.headers.get("stripe-signature")
    try:
        result = billing_service.handle_webhook(raw, sig)
        # Un evenement REFUSE doit repondre en erreur, jamais 200.
        #
        # On renvoyait 200 meme sur signature invalide : Stripe croyait donc
        # l'evenement traite, ne le rejouait jamais, et n'affichait aucun taux
        # d'erreur. Un secret mal configure — ou le mauvais endpoint conserve
        # apres un menage — devenait totalement invisible : les abonnements
        # cessaient de s'activer sans que rien ne le signale.
        #
        # 400 sur une signature invalide, 500 quand c'est notre configuration
        # qui manque. Dans les deux cas Stripe reessaie et le probleme se voit.
        if isinstance(result, dict) and not result.get("ok"):
            motif = result.get("error") or "webhook refusé"
            code = 500 if "configur" in str(motif) else 400
            logger.error(f"stripe webhook refusé ({code}) : {motif}")
            raise HTTPException(status_code=code, detail=motif)
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
        # Rappel au CLIENT, trois jours avant le premier prélèvement.
        rappel = result.get("rappel") if isinstance(result, dict) else None
        if rappel:
            try:
                from config import FRONTEND_URL
                sujet, html = mail_service.rappel_prelevement_html(
                    rappel.get("nom"), rappel["montant"], rappel["devise"], rappel["date"],
                    f"{FRONTEND_URL}/dashboard/parametres?s=abonnement", rappel["apres_pack"])
                await mail_service.send_email(rappel["email"], sujet, html)
            except Exception as e:
                logger.error(f"webhook rappel client: {e}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        # Une panne de NOTRE cote : on le dit a Stripe, qui rejouera. Les
        # traitements sensibles sont deja proteges contre le doublon (commission
        # unique par facture, abonnement non recree s'il existe deja).
        logger.error(f"stripe webhook error: {e}")
        raise HTTPException(status_code=500, detail="traitement impossible")
