# -*- coding: utf-8 -*-
"""
Programme d'affiliation.

Trois familles de routes :
  - PUBLIQUE  : le lien de tracking /affiliation/r/{code}, cliqué depuis n'importe où ;
  - AFFILIÉ   : demande d'accès, tableau de bord, commissions, relevés ;
  - ADMIN     : demandes à valider, commissions mois par mois, traitement mensuel, IBAN.
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse

from dependencies import verify_token, verify_admin_token
from services import affiliation_service as aff
from services import mail_service
from config import FRONTEND_URL, logger

router = APIRouter(prefix="/affiliation", tags=["affiliation"])


def _ip(request: Request) -> str:
    """IP réelle derrière le proxy de l'hébergeur."""
    fwd = request.headers.get("x-forwarded-for") or ""
    return (fwd.split(",")[0].strip() or (request.client.host if request.client else "")) or None


# ------------------------------------------------------------------ publique
@router.get("/r/{code}")
async def rediriger(code: str, request: Request, vers: str = "/"):
    """Lien d'affiliation. Loge le clic puis renvoie sur le site avec ?ref=CODE,
    que le front stocke pour la durée de la fenêtre d'attribution."""
    a = aff.enregistrer_clic(code, ip=_ip(request),
                             user_agent=request.headers.get("user-agent"),
                             referer=request.headers.get("referer"))
    cible = vers if vers.startswith("/") else "/"
    if not a:
        return RedirectResponse(f"{FRONTEND_URL}{cible}", status_code=302)
    sep = "&" if "?" in cible else "?"
    return RedirectResponse(f"{FRONTEND_URL}{cible}{sep}ref={a['code']}", status_code=302)


@router.get("/verifier/{code}")
async def verifier(code: str):
    """Le front s'en sert pour n'afficher « parrainé par X » que si le code est bon."""
    a = aff.par_code(code)
    return {"valide": bool(a), "nom": a.get("nom") if a else None}


# ------------------------------------------------------------------- affilié
@router.post("/demande")
async def demande(body: dict, payload: dict = Depends(verify_token)):
    """Un client demande à devenir apporteur d'affaires. Statut « en_attente »
    jusqu'à validation d'un admin : le lien ne convertit pas avant."""
    tid = payload.get("telegram_id")
    try:
        a = aff.demander(nom=body.get("nom"), email=body.get("email"),
                         iban=body.get("iban"), telegram_id=tid,
                         audience=body.get("audience"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"code": a.get("code"), "statut": a.get("statut")}


@router.post("/demande-externe")
async def demande_externe(body: dict):
    """Influenceur ou blogueur sans compte client : même formulaire, sans jeton."""
    try:
        a = aff.demander(nom=body.get("nom"), email=body.get("email"),
                         iban=body.get("iban"), audience=body.get("audience"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"statut": a.get("statut")}


@router.get("/moi")
async def moi(payload: dict = Depends(verify_token)):
    a = aff.par_telegram(payload.get("telegram_id"))
    if not a:
        return {"affilie": None}
    tb = aff.tableau_de_bord(a["id"]) if a["statut"] == "actif" else {}
    return {
        "affilie": {
            "code": a["code"], "statut": a["statut"], "nom": a["nom"], "email": a["email"],
            "taux_setup": a["taux_setup"], "taux_recurrent": a["taux_recurrent"],
            "iban": aff.masquer_iban(a.get("iban_chiffre")), "motif": a.get("motif"),
            "lien": f"{FRONTEND_URL}/?ref={a['code']}",
        },
        **tb,
    }


@router.get("/mes-releves")
async def mes_releves(payload: dict = Depends(verify_token)):
    a = aff.par_telegram(payload.get("telegram_id"))
    return aff.releves(a["id"]) if a else []


@router.put("/mon-iban")
async def mon_iban(body: dict, payload: dict = Depends(verify_token)):
    from config import supabase
    a = aff.par_telegram(payload.get("telegram_id"))
    if not a:
        raise HTTPException(status_code=404, detail="Pas de compte affilié")
    supabase.table("affiliates").update(
        {"iban_chiffre": aff.chiffrer_iban(body.get("iban"))}).eq("id", a["id"]).execute()
    return {"ok": True}


# --------------------------------------------------------------------- admin
@router.get("/admin/affilies")
async def admin_affilies(statut: str = None, payload: dict = Depends(verify_admin_token)):
    return aff.liste_affilies(statut)


@router.put("/admin/affilies/{affiliate_id}")
async def admin_decider(affiliate_id: str, body: dict,
                        payload: dict = Depends(verify_admin_token)):
    """Valide, refuse ou suspend une demande ; ajuste aussi les taux négociés."""
    if body.get("statut"):
        aff.decider(affiliate_id, body["statut"], admin_id=payload.get("telegram_id"),
                    motif=body.get("motif"))
    if body.get("taux_setup") is not None or body.get("taux_recurrent") is not None:
        aff.maj_taux(affiliate_id, body.get("taux_setup"), body.get("taux_recurrent"))
    return {"ok": True}


@router.get("/admin/affilies/{affiliate_id}/iban")
async def admin_iban(affiliate_id: str, payload: dict = Depends(verify_admin_token)):
    """RIB en clair, pour le virement. Chaque lecture est tracée dans les logs."""
    logger.warning(f"AUDIT iban affilié {affiliate_id} lu par admin {payload.get('telegram_id')}")
    return {"iban": aff.iban_clair(affiliate_id)}


@router.get("/admin/commissions")
async def admin_commissions(periode: str = None, statut: str = None,
                            affiliate_id: str = None,
                            payload: dict = Depends(verify_admin_token)):
    """periode au format AAAA-MM : c'est le filtre mois par mois."""
    return aff.commissions(periode, statut, affiliate_id)


@router.get("/admin/resume/{periode}")
async def admin_resume(periode: str, payload: dict = Depends(verify_admin_token)):
    """Qui a vendu ce mois-là, combien de ventes, quel chiffre, quelle commission."""
    return aff.resume_mois(periode)


@router.post("/admin/commissions/{commission_id}/valider")
async def admin_valider(commission_id: str, payload: dict = Depends(verify_admin_token)):
    return aff.valider(commission_id)


@router.post("/admin/commissions/{commission_id}/annuler")
async def admin_annuler(commission_id: str, payload: dict = Depends(verify_admin_token)):
    return aff.annuler(commission_id)


@router.post("/admin/traitement-mensuel/{periode}")
async def admin_traitement(periode: str, payload: dict = Depends(verify_admin_token)):
    """Clôture le mois : regroupe les commissions validées par affilié et par
    devise, crée les relevés, et prévient chaque affilié qu'il peut facturer."""
    envois = aff.traitement_mensuel(periode)
    for e in envois:
        if not e.get("email"):
            continue
        try:
            sujet, html = mail_service.releve_affilie_html(
                e["nom"], e["periode"], e["montant"], e["devise"], e["nb"])
            await mail_service.send_email(e["email"], sujet, html)
        except Exception as ex:
            logger.error(f"relevé affilié non envoyé à {e['email']}: {ex}")
    return {"releves": len(envois), "detail": envois}


@router.get("/admin/releves")
async def admin_releves(periode: str = None, payload: dict = Depends(verify_admin_token)):
    return aff.tous_releves(periode)


@router.post("/admin/releves/{releve_id}/payer")
async def admin_payer(releve_id: str, payload: dict = Depends(verify_admin_token)):
    """Le virement est parti : le relevé et ses commissions passent à « payée »."""
    return aff.marquer_paye(releve_id)
