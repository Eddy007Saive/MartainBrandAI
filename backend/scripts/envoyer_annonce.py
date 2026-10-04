"""Envoi de l'annonce « éditeur de carrousel + 8 nouveaux styles » aux clients.

    python scripts/envoyer_annonce.py --apercu                 # écrit l'aperçu HTML, n'envoie rien
    python scripts/envoyer_annonce.py --test moi@exemple.fr    # un seul envoi, objet préfixé [TEST]
    python scripts/envoyer_annonce.py --envoyer a@x.fr b@y.fr  # envoi réel, adresses listées une à une

Pas d'option « tout le monde » : la liste des destinataires est écrite explicitement, après
validation. Le lien pointe toujours vers la production (le .env local vise localhost).
"""
import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import supabase  # noqa: E402
from services import mail_service  # noqa: E402

LIEN = "https://postorico.com/dashboard/carrousels"


def _nom(email: str) -> str:
    r = supabase.table("users").select("nom").eq("email", email).limit(1).execute()
    return (r.data[0].get("nom") or "") if r.data else ""


async def main():
    a = argparse.ArgumentParser()
    g = a.add_mutually_exclusive_group(required=True)
    g.add_argument("--apercu", action="store_true")
    g.add_argument("--test")
    g.add_argument("--envoyer", nargs="+")
    o = a.parse_args()
    if o.apercu:
        sujet, html = mail_service.annonce_editeur_html("Cledici", LIEN)
        chemin = os.path.join(os.path.dirname(__file__), "..", "..", "_design", "emails", "annonce-editeur-carrousel.html")
        os.makedirs(os.path.dirname(chemin), exist_ok=True)
        open(chemin, "w", encoding="utf-8").write(html)
        print(f"Objet : {sujet}\nAperçu : {os.path.abspath(chemin)}")
        return
    cibles = [o.test] if o.test else o.envoyer
    for email in cibles:
        sujet, html = mail_service.annonce_editeur_html(_nom(email), LIEN)
        r = await mail_service.send_email(email, ("[TEST] " if o.test else "") + sujet, html)
        print(email, "->", r)
        await asyncio.sleep(0.6)  # sous la limite de débit de Resend


if __name__ == "__main__":
    asyncio.run(main())
