# -*- coding: utf-8 -*-
"""Product Vision Agent — analyse d'une photo produit.

Envoie l'image à un modèle vision (Gemini 2.5 Flash via OpenRouter) et en
extrait un JSON structuré : attributs produit, qualité photo, et zones de
composition (où poser titre / prix / CTA, quoi éviter). Cette analyse est
faite UNE fois à l'upload puis stockée (offer_analysis) et réutilisée pour :
  - ancrer le texte sur le réel (couleur/matière vraies, pas inventées),
  - placer les textes hors du produit dans les carrousels / reels,
  - décider s'il faut générer une image IA ou réutiliser la photo.

Coût mesuré : ~0,1 cent / image. Négligeable, et amorti par la mise en cache.
"""
import json
import httpx

from config import OPENROUTER_API_KEY, OPENROUTER_VISION_MODEL, logger

_URL = "https://openrouter.ai/api/v1/chat/completions"

_PROMPT = (
    "You are a product vision analyst for a content studio. Analyze this product "
    "photo and return ONLY a JSON object (no prose, no markdown) with this exact shape:\n"
    '{"product":{"type":"","colors":[],"materials":[],"shape":"","distinctive":[]},'
    '"photo":{"background":"","lighting":"","angle":"","quality":""},'
    '"composition":{"product_position":"","free_zones":[],"avoid_zones":[],'
    '"title_placement":"","price_placement":"","cta_placement":""}}\n'
    "Base every value ONLY on what is visible; if unknown, use an empty string. "
    "Write the text values in French."
)


def _parse_json(txt: str) -> dict:
    t = (txt or "").strip()
    if t.startswith("```"):
        t = t.split("```")[1]
        if t.lower().startswith("json"):
            t = t[4:]
        t = t.strip()
    return json.loads(t)


def analyser(image_url: str, telegram_id: str | None = None, contexte: str | None = None) -> dict:
    """Analyse une image (URL publique, ex. Cloudinary) → dict.

    `contexte` : infos de l'offre (nom, type, description) pour cadrer l'analyse.
    Sans lui, le modèle interprète à l'aveugle (ex. « logiciel » pour une capture) ;
    avec lui, il analyse la photo COMME une photo de cette offre précise.

    Retour : {"analysis": {...}, "model": str, "usage": {...}, "cost": float}
    ou {"error": "..."} en cas d'échec (jamais d'exception vers l'appelant)."""
    if not OPENROUTER_API_KEY:
        return {"error": "no_openrouter_key"}
    if not image_url:
        return {"error": "no_image"}

    prompt = _PROMPT
    if contexte:
        prompt = (
            "CONTEXT — this photo illustrates the following offer sold by the client. "
            "Interpret the image in THIS context (do not mislabel it generically):\n"
            f"{contexte}\n\n" + _PROMPT
        )

    payload = {
        "model": OPENROUTER_VISION_MODEL,
        "temperature": 0.2,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": image_url}},
        ]}],
    }
    try:
        with httpx.Client(timeout=120) as client:
            r = client.post(
                _URL,
                headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}",
                         "Content-Type": "application/json"},
                json=payload,
            )
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        logger.error(f"vision analyser error: {e}")
        return {"error": "vision_failed", "detail": str(e)}

    try:
        out = data["choices"][0]["message"]["content"]
        analysis = _parse_json(out)
    except Exception as e:
        logger.warning(f"vision JSON non parsable: {e}")
        return {"error": "bad_json", "raw": data.get("choices", [{}])[0]}

    usage = data.get("usage", {}) or {}
    cost = usage.get("cost", 0.0) or 0.0
    # Journalise le coût réel (cost_override : le prix vient d'OpenRouter, pas de notre grille)
    if telegram_id:
        try:
            from services import usage_service
            usage_service.log(
                telegram_id, "vision", OPENROUTER_VISION_MODEL,
                {"input": usage.get("prompt_tokens", 0), "output": usage.get("completion_tokens", 0)},
                0, cost_override=cost,
            )
        except Exception as e:
            logger.warning(f"vision usage log: {e}")

    return {"analysis": analysis, "model": OPENROUTER_VISION_MODEL, "usage": usage, "cost": cost}
