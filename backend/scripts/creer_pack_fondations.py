# -*- coding: utf-8 -*-
"""Cree le produit « Pack Fondations » et ses deux prix dans Stripe.

Deux marches, deux devises : l'euro pour le francophone, le dollar pour le
marche hispanophone (Colombie). Meme produit, meme metadata — c'est
`produit=fondations` que le webhook lit pour declencher la commission de 25 %.

Idempotent : relancer le script ne cree pas de doublon, il retrouve le produit
par sa metadata et les prix par leur montant.

    ./venv/Scripts/python.exe scripts/creer_pack_fondations.py          # compte de test
    ./venv/Scripts/python.exe scripts/creer_pack_fondations.py --live   # compte reel (SK_LIVE)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import stripe
from config import STRIPE_SECRET_KEY  # importe config -> le .env est charge

# --live bascule sur la cle du compte reel, gardee a part dans le .env.
if "--live" in sys.argv:
    stripe.api_key = os.environ.get("SK_LIVE", "")
    if not stripe.api_key.startswith("sk_live"):
        sys.exit("SK_LIVE absent du .env ou ce n'est pas une cle live.")
else:
    stripe.api_key = STRIPE_SECRET_KEY

NOM = "Pack Fondations"
TARIFS = [("eur", 149900), ("usd", 69900)]   # francophone, hispanophone


def produit():
    for p in stripe.Product.list(limit=100, active=True).data:
        if (p.metadata or {}).get("produit") == "fondations":
            return p
    return stripe.Product.create(
        name=NOM,
        description="Prestation de lancement Postorico : identite, voix de marque, "
                    "gabarits et mise en route des reseaux.",
        metadata={"produit": "fondations"},
    )


def prix(prod, devise, montant):
    for p in stripe.Price.list(product=prod.id, active=True, limit=100).data:
        if p.currency == devise and p.unit_amount == montant and not p.recurring:
            return p, False
    return stripe.Price.create(
        product=prod.id, currency=devise, unit_amount=montant,
        metadata={"produit": "fondations", "marche": "francophone" if devise == "eur" else "hispanophone"},
    ), True


if __name__ == "__main__":
    mode = "LIVE" if stripe.api_key.startswith("sk_live") else "TEST"
    prod = produit()
    print(f"[{mode}] produit : {prod.id} — {prod.name}")

    lignes = []
    for devise, montant in TARIFS:
        p, cree = prix(prod, devise, montant)
        print(f"  prix {devise.upper():4} {montant / 100:>8.2f}  {p.id}  {'cree' if cree else 'deja present'}")
        lignes.append((devise, p.id))

    print("\nA reporter dans le .env (et sur Railway pour la prod) :")
    for devise, pid in lignes:
        print(f"  STRIPE_PRICE_PACK_{devise.upper()}={pid}")
