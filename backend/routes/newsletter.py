# -*- coding: utf-8 -*-
"""
Newsletter hebdomadaire « La lettre de Rico ».

Routes PUBLIQUES (cliquées depuis un email, donc sans jeton d'auth : c'est le
token de la ligne en base qui fait foi) : aperçu, valider, refuser, désinscription,
inscription. Routes ADMIN : liste des éditions, abonnés, préparation forcée.
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import HTMLResponse, PlainTextResponse
from pydantic import BaseModel

from dependencies import verify_admin_token
from services import newsletter_service
from config import supabase, logger

router = APIRouter(prefix="/newsletter", tags=["newsletter"])


# ----------------------------------------------------------------- publiques
@router.get("/apercu/{nid}", response_class=HTMLResponse)
def apercu(nid: str, token: str):
    """La lettre telle qu'elle sera reçue (lien « Lire dans le navigateur »)."""
    nl = newsletter_service._charger(nid, token)
    if not nl:
        return HTMLResponse(newsletter_service._page(
            "Lien invalide", "Cette lettre n'existe pas ou le lien a expiré.", ok=False), status_code=404)
    if nl.get("html"):
        return HTMLResponse(nl["html"])
    return HTMLResponse(newsletter_service.rendu_html(nl.get("data") or {}))


@router.get("/valider/{nid}", response_class=HTMLResponse)
async def valider(nid: str, token: str):
    """Bouton « Envoyer aux abonnés » de l'email de validation."""
    return HTMLResponse(await newsletter_service.valider(nid, token))


@router.get("/refuser/{nid}", response_class=HTMLResponse)
def refuser(nid: str, token: str):
    return HTMLResponse(newsletter_service.refuser(nid, token))


@router.get("/desinscription", response_class=HTMLResponse)
def desinscription(token: str):
    if token == "apercu":   # lien neutre des aperçus internes
        return HTMLResponse(newsletter_service._page(
            "Aperçu", "Ceci est un aperçu : aucun abonné n'est concerné par ce lien."))
    res = newsletter_service.desabonner(token)
    if res.get("error"):
        return HTMLResponse(newsletter_service._page("Lien inconnu", res["error"], ok=False), status_code=404)
    return HTMLResponse(newsletter_service._page(
        "C'est fait", "Tu ne recevras plus la lettre de Rico. Tu peux te réinscrire quand tu veux."))


@router.post("/desinscription", response_class=PlainTextResponse)
def desinscription_one_click(token: str):
    """Désinscription One-Click (en-tête List-Unsubscribe-Post) : Gmail/Outlook
    appellent cette URL en POST sans ouvrir de page."""
    newsletter_service.desabonner(token)
    return PlainTextResponse("OK")


class AbonnementRequest(BaseModel):
    email: str
    nom: str | None = None


@router.post("/abonner")
def abonner(body: AbonnementRequest, request: Request):
    """Inscription depuis le site public (formulaire newsletter)."""
    res = newsletter_service.abonner(body.email, body.nom, source="site")
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
    return {"ok": True}


# --------------------------------------------------------------------- admin
@router.get("/editions")
def editions(payload: dict = Depends(verify_admin_token)):
    """Historique des éditions (sans le HTML, trop lourd)."""
    r = (supabase.table("newsletters")
         .select("id, numero, sujet, statut, nb_envoyes, nb_erreurs, created_at, sent_at, token")
         .order("created_at", desc=True).limit(30).execute())
    return {"editions": r.data or []}


@router.get("/abonnes")
def abonnes(payload: dict = Depends(verify_admin_token)):
    r = supabase.table("newsletter_abonnes").select("email, nom, source, statut, created_at").execute()
    rows = r.data or []
    return {
        "total": len(rows),
        "actifs": sum(1 for a in rows if a.get("statut") == "actif"),
        "desinscrits": sum(1 for a in rows if a.get("statut") == "desinscrit"),
        "abonnes": rows,
    }


@router.post("/preparer")
async def preparer(payload: dict = Depends(verify_admin_token)):
    """Force la préparation d'une édition (le cron le fait chaque semaine)."""
    try:
        res = await newsletter_service.preparer()
    except Exception as e:
        logger.error(f"newsletter preparer: {e}")
        raise HTTPException(status_code=500, detail="Préparation impossible.")
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
    return res


@router.post("/sync-abonnes")
def sync(payload: dict = Depends(verify_admin_token)):
    return {"ajoutes": newsletter_service.sync_abonnes()}
