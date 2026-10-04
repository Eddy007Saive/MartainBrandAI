"""
Photos libres de droits (Pexels) pour les styles de carrousel avec photos (Duo, Organique,
Poudré, Maison, Café).

Recherche d'après le secteur de la marque (repli : une requête générique), photos au format
portrait. Le choix dépend d'une « graine » (l'id du contenu) : un même carrousel retrouve les
mêmes photos d'un rendu à l'autre et dans l'aperçu, deux carrousels n'ont pas forcément les
mêmes. Jamais bloquant : sans clé ou en cas d'erreur, la liste est vide et le style dessine
des aplats à la place des photos.
"""
import hashlib
import time

import httpx

from config import PEXELS_API_KEY, logger

API = "https://api.pexels.com/v1/search"
REPLI = "bureau travail"
_CACHE: dict = {}          # requête -> (horodatage, urls)
_DUREE_CACHE = 6 * 3600     # les résultats Pexels bougent peu : 6 h


def _rechercher(requete: str) -> list:
    """URLs (format portrait 800×1200) des photos trouvées pour cette requête."""
    vu = _CACHE.get(requete)
    if vu and time.time() - vu[0] < _DUREE_CACHE:
        return vu[1]
    if not PEXELS_API_KEY:
        return []
    try:
        r = httpx.get(API, params={"query": requete, "orientation": "portrait", "per_page": 30, "locale": "fr-FR"},
                      headers={"Authorization": PEXELS_API_KEY}, timeout=8)
        r.raise_for_status()
        urls = [p["src"]["portrait"] for p in r.json().get("photos", []) if p.get("src", {}).get("portrait")]
    except Exception as e:
        logger.warning(f"Pexels « {requete} » : {e}")
        return []
    _CACHE[requete] = (time.time(), urls)
    return urls


# Mots vides retirés de la requête (le secteur est parfois saisi comme une phrase)
_VIDES = {"est", "un", "une", "de", "des", "du", "le", "la", "les", "et", "pour", "en", "à", "au", "aux", "il",
          "elle", "qui", "que", "sur", "avec", "son", "sa", "ses", "nous", "vous", "dans", "par", "ou", "l", "d"}


def requete_marque(secteur: str | None) -> str:
    """Requête de recherche : 3 mots utiles du secteur de la marque, sinon la requête générique."""
    mots = [m for m in (secteur or "").lower().replace(",", " ").replace("'", " ").replace(":", " ").split()
            if m not in _VIDES and len(m) > 2][:3]
    return " ".join(mots) or REPLI


def photos(secteur: str | None, graine: str, nombre: int = 5) -> list:
    """`nombre` photos distinctes pour ce carrousel (même graine = mêmes photos)."""
    urls = _rechercher(requete_marque(secteur)) or _rechercher(REPLI)
    if not urls:
        return []
    debut = int(hashlib.sha1((graine or "x").encode()).hexdigest(), 16) % len(urls)
    return [urls[(debut + i) % len(urls)] for i in range(min(nombre, len(urls)))]
