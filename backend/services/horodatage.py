"""Lecture des horodatages ISO renvoyés par la base.

Python 3.10 (image Docker de production) n'accepte que 3 ou 6 chiffres après la seconde ;
PostgreSQL en renvoie parfois 5 (il supprime les zéros de fin). On complète ou on tronque à 6.
"""
import re
from datetime import datetime

_FRACTION = re.compile(r"\.(\d+)")


def lire_iso(ts) -> datetime:
    texte = str(ts).strip().replace("Z", "+00:00")
    texte = _FRACTION.sub(lambda m: "." + (m.group(1) + "000000")[:6], texte, count=1)
    return datetime.fromisoformat(texte)
