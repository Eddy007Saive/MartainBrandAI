"""
Log du coût RÉEL de chaque génération (tokens → $), pour calibrer les prix.
"""
from config import supabase, logger

# Prix API ($/1M tokens) par modèle
PRICES = {
    "haiku":  {"in": 1.0, "out": 5.0},
    "sonnet": {"in": 3.0, "out": 15.0},
    "opus":   {"in": 5.0, "out": 25.0},
}

# Prix réel par image générée ($) — par niveau choisi
IMAGE_PRICES = {"nano2": 0.04, "nano3": 0.14}


def _prix(model: str) -> dict:
    m = (model or "").lower()
    for key, p in PRICES.items():
        if key in m:
            return p
    return PRICES["sonnet"]


def cout_reel(model: str, usage: dict) -> float:
    """Coût réel en $ : entrée plein tarif + cache write (1.25×) + cache read (0.1×) + sortie."""
    p = _prix(model)
    u = usage or {}
    inp = u.get("input", 0) or 0
    cw = u.get("cache_write", 0) or 0
    cr = u.get("cache_read", 0) or 0
    out = u.get("output", 0) or 0
    return (inp / 1e6) * p["in"] + (cw / 1e6) * p["in"] * 1.25 + (cr / 1e6) * p["in"] * 0.1 + (out / 1e6) * p["out"]


def log(telegram_id: str, action: str, model: str, usage: dict, credits: int, qualite: str = None, cost_override: float = None) -> None:
    try:
        u = usage or {}
        cost = cost_override if cost_override is not None else round(cout_reel(model, u), 6)
        supabase.table("usage_log").insert({
            "telegram_id": telegram_id,
            "action": action,
            "model": model,
            "qualite": qualite,
            "input_tokens": u.get("input", 0) or 0,
            "cache_read": u.get("cache_read", 0) or 0,
            "cache_write": u.get("cache_write", 0) or 0,
            "output_tokens": u.get("output", 0) or 0,
            "cost_usd": round(cost, 6),
            "credits": credits,
        }).execute()
    except Exception as e:
        logger.error(f"usage log error: {e}")
