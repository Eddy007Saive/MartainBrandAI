# -*- coding: utf-8 -*-
"""
Images d'exemple des gabarits et des styles de miniature (ce que le client voit dans
le dialogue avant de générer). Une fois pour toutes : Rico joue la personne, textes de
démonstration, dépôt sur Cloudinary sous `miniatures/_gabarits/<id>` et
`miniatures/_styles/<id>` (écrasés à chaque relance, adresses stables).

Usage (depuis backend/, venv actif) :
    python scripts/apercus_miniatures.py                # tout (8 gabarits + 6 styles)
    python scripts/apercus_miniatures.py gabarits       # ou styles
    python scripts/apercus_miniatures.py gabarits affiche mot-geant
"""
import asyncio
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import cloudinary
import cloudinary.uploader

from config import supabase
from services import miniature_service as M
from services.agent_service import _charger_marque

# Le compte dont la photo de profil est Rico : c'est lui qui pose.
COMPTE_EMAIL = "laplumenoire001%"
SUJET = ("Vidéo d'un dirigeant de PME qui partage ses conseils pour se faire connaître "
         "sur les réseaux sociaux sans y passer ses soirées.")
TEXTES = {"kicker": "NOUVEAU", "titre": "Le secret des pros", "sous": "Ce que personne ne te dit", "objet": "a giant glowing golden key"}
MODELE = "nano3"    # ces images sont vues par tous les clients : la version pro
# Un rendu à la fois : trois Playwright synchrones en parallèle dans des threads ont fait
# tomber le pilote (« Connection closed while reading from the driver ») au 6e rendu.
SEMAPHORE = asyncio.Semaphore(1)


def _detruire(url: str):
    m = re.search(r"/upload/(?:v\d+/)?(.+)\.[a-z0-9]+$", url, re.I)
    if m:
        try:
            cloudinary.uploader.destroy(m.group(1), resource_type="image", invalidate=True)
        except Exception:
            pass


async def _un(tid, contenu, brand, gabarit, style, police, public_id, textes):
    async with SEMAPHORE:
        for essai in (1, 2):
            try:
                fond = await M.generer_fond(tid, contenu, gabarit, textes, "9:16", modele=MODELE, style=style)
                break
            except Exception as e:
                print(f"  {public_id} : fond KO (essai {essai}) : {e}")
                if essai == 2:
                    return None
        png = await asyncio.to_thread(M.composer, fond, M._PAR_ID[gabarit]["layout"], textes, brand, "9:16", police)
        up = cloudinary.uploader.upload(png, resource_type="image", public_id=public_id, overwrite=True, invalidate=True)
        _detruire(fond)   # le fond seul ne sert plus
        print(f"  ok  {public_id}  {up['width']}x{up['height']}  {up['bytes'] // 1024} Ko")
        return up["secure_url"]


async def main():
    args = [a for a in sys.argv[1:]]
    quoi = args[0] if args and args[0] in ("gabarits", "styles") else "tout"
    filtre = args[1:] if quoi != "tout" else []
    u = supabase.table("users").select("telegram_id").ilike("email", COMPTE_EMAIL).execute().data[0]
    tid = u["telegram_id"]
    brand = M._brand(_charger_marque(tid))
    contenu = {"id": "_apercu", "contenu": SUJET, "titre": SUJET}
    taches = []
    if quoi in ("tout", "gabarits"):
        for g in M.GABARITS:
            if filtre and g["id"] not in filtre:
                continue
            taches.append(_un(tid, contenu, brand, g["id"], "photo", M.POLICE_DEFAUT.get(g["id"], "impact"),
                              f"miniatures/_gabarits/{g['id']}", TEXTES))
    if quoi in ("tout", "styles"):
        for st in M.STYLES:
            if filtre and st not in filtre:
                continue
            taches.append(_un(tid, contenu, brand, "affiche", st, "cinema", f"miniatures/_styles/{st}", TEXTES))
    print(f"{len(taches)} image(s) à produire ({MODELE})")
    res = await asyncio.gather(*taches)
    print("produites :", sum(1 for r in res if r), "/", len(res))


if __name__ == "__main__":
    asyncio.run(main())
