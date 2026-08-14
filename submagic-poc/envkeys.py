# Clés API : variable d'environnement en priorité (déploiement Railway
# séparé, indépendant du backend principal) — repli sur backend/.env
# uniquement utile en dev local, sur cette même machine que MartainBrandAI.
# Centralise ce que hooks.py / nanobanana.py / gemini_pick.py faisaient
# chacun de leur côté (3 copies du même petit parseur .env).
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
# dossier à la racine de MartainBrandAI (déplacé hors de _design/ le 14/08) ->
# un seul ".." pour rejoindre backend/.env, pas deux
_BACKEND_ENV = os.path.normpath(os.path.join(HERE, "..", "backend", ".env"))
_cache = {}


def get(env_name, dotenv_name=None):
    """Valeur de la variable d'environnement `env_name` ; si absente, tente
    de la lire dans backend/.env (clé `dotenv_name`, ou `env_name` si non
    précisé) — ce repli disparaît une fois déployé séparément du backend,
    c'est voulu (l'env var devient alors la seule source)."""
    if env_name in _cache:
        return _cache[env_name]
    val = os.environ.get(env_name)
    if not val and os.path.exists(_BACKEND_ENV):
        key = dotenv_name or env_name
        with open(_BACKEND_ENV, encoding="utf-8") as f:
            for line in f:
                m = re.match(rf'\s*{re.escape(key)}\s*=\s*"?([^"\s]+)"?', line)
                if m:
                    val = m.group(1)
                    break
    if not val:
        raise RuntimeError(
            f"Clé '{env_name}' introuvable (ni variable d'environnement, "
            f"ni backend/.env en dev local)")
    _cache[env_name] = val
    return val
