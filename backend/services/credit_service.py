"""
Barème des coûts : ce que « pèse » chaque action, en unités de crédit.

Ce barème ne facture plus rien depuis le passage aux quotas par type d'action
(voir quota_service) : il sert d'unité de mesure pour l'historique de
consommation (usage_log) et le calcul des marges affiché côté admin.
"""

# Coûts en crédits. Pour post/script, le coût dépend du niveau de qualité choisi.
COUTS = {
    "sujets": 5,  # lot d'idées (Haiku) — couvre le coût réel avec marge ~3x
    "post": {"rapide": 8, "equilibre": 20, "premium": 40},
    "script": {"rapide": 12, "equilibre": 30, "premium": 60},
    "carrousel": {"rapide": 40, "equilibre": 80, "premium": 140},  # texte des slides + rendu N images
    "image": {"nano2": 50, "nano3": 150},
}


def cout(action: str, qualite: str = "equilibre") -> int:
    c = COUTS.get(action, 0)
    if isinstance(c, dict):
        if qualite in c:
            return c[qualite]
        return c.get("equilibre") or next(iter(c.values()))  # fallback
    return c


def billing_id(telegram_id: str) -> str:
    """Facturation PAR COMPTE : chaque compte (master comme sous-compte) a son propre abonnement."""
    return telegram_id


# get_credits / deduct / refund ont ete retires le 14/08/2026 : plus aucun appel
# depuis le passage aux quotas par type d'action (voir quota_service). La colonne
# users.credits et les fonctions SQL deduct_credits/refund_credits sont supprimees.
# Ce module ne sert plus qu'au bareme des couts (COUTS), affiche cote admin.
