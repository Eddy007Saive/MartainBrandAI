"""
Gestion des crédits (débit atomique côté Postgres).
Barème : ce que coûte chaque action en crédits.
"""
from config import supabase, logger

# Coûts en crédits. Pour post/script, le coût dépend du niveau de qualité choisi.
COUTS = {
    "sujets": 5,  # lot d'idées (Haiku) — couvre le coût réel avec marge ~3x
    "post": {"rapide": 8, "equilibre": 20, "premium": 40},
    "script": {"rapide": 12, "equilibre": 30, "premium": 60},
    "image": {"nano2": 50, "nano3": 150},
}


def cout(action: str, qualite: str = "equilibre") -> int:
    c = COUTS.get(action, 0)
    if isinstance(c, dict):
        if qualite in c:
            return c[qualite]
        return c.get("equilibre") or next(iter(c.values()))  # fallback
    return c


def get_credits(telegram_id: int) -> int:
    r = supabase.table("users").select("credits").eq("telegram_id", telegram_id).execute()
    if not r.data:
        return 0
    return r.data[0].get("credits") or 0


def deduct(telegram_id: int, amount: int) -> int:
    """Débit atomique. Retourne le nouveau solde, ou -1 si insuffisant."""
    try:
        res = supabase.rpc("deduct_credits", {"p_telegram_id": telegram_id, "p_amount": amount}).execute()
        val = res.data
        return val if isinstance(val, int) else -1
    except Exception as e:
        logger.error(f"deduct_credits error: {e}")
        return -1


def refund(telegram_id: int, amount: int) -> None:
    try:
        supabase.rpc("refund_credits", {"p_telegram_id": telegram_id, "p_amount": amount}).execute()
    except Exception as e:
        logger.error(f"refund_credits error: {e}")
