# -*- coding: utf-8 -*-
"""Offres / produits du client : CRUD.

Sert à modéliser ce que le client vend (produit, service, offre) et ses faits
fiables (prix, bénéfices, caractéristiques). Ces données sont injectées dans le
contexte de génération pour ancrer le contenu (voir offers_service.contexte_offres).
"""
from fastapi import APIRouter, HTTPException, Depends

from dependencies import verify_token
from services import offers_service
from config import logger

router = APIRouter(prefix="/offers", tags=["offers"])


def _uid(payload: dict) -> str:
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    return telegram_id


@router.get("")
def list_offers(payload: dict = Depends(verify_token)):
    try:
        return offers_service.lister(_uid(payload))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list offers error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
def create_offer(body: dict, payload: dict = Depends(verify_token)):
    try:
        return offers_service.creer(_uid(payload), body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create offer error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{offer_id}")
def update_offer(offer_id: str, body: dict, payload: dict = Depends(verify_token)):
    try:
        return offers_service.modifier(_uid(payload), offer_id, body)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update offer error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{offer_id}")
def delete_offer(offer_id: str, payload: dict = Depends(verify_token)):
    try:
        offers_service.supprimer(_uid(payload), offer_id)
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete offer error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
