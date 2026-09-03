# -*- coding: utf-8 -*-
"""Rattrapage de la mémoire de voix : indexe tous les contenus validés/planifiés/
publiés existants (migrations/memoire_voix.sql doit être appliquée avant).

    cd backend && ./venv/Scripts/python.exe scripts/backfill_embeddings.py [telegram_id]

Sans argument : tous les comptes. Coût : ~0,02 $ par million de tokens (la base
entière tient sous le centime)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import supabase  # noqa: E402  (charge .env)
from services import memoire_service  # noqa: E402


def main():
    tid = sys.argv[1] if len(sys.argv) > 1 else None
    res = memoire_service.reindexer_compte(tid)
    print(f"indexés : {res['indexes']}  |  ignorés (genre non couvert / texte trop court) : {res['ignores']}")
    print("par genre :", res["par_genre"])
    # Répartition par compte pour vérifier d'un coup d'œil
    r = supabase.table("contenu_embeddings").select("telegram_id, genre").execute()
    par = {}
    for x in r.data or []:
        par.setdefault(x["telegram_id"], {}).setdefault(x["genre"], 0)
        par[x["telegram_id"]][x["genre"]] += 1
    for k, v in sorted(par.items(), key=lambda kv: -sum(kv[1].values())):
        print(f"  {k[:8]}…  {v}")


if __name__ == "__main__":
    main()
