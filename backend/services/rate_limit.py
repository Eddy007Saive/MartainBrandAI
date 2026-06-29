"""
Anti-bruteforce minimaliste (en mémoire) pour les connexions.
Verrouille une clé (ip+email ou ip seul) après trop d'échecs sur une fenêtre.

Note : en mémoire = par process (réinitialisé au redémarrage). Suffisant pour ralentir
le bruteforce ; pour du multi-instance fort, basculer sur Redis plus tard.
"""
import time

_buckets = {}  # key -> {"fails": int, "first": ts, "locked_until": ts}


def locked_for(key: str) -> int:
    """Secondes restantes de verrouillage (0 si non verrouillé)."""
    b = _buckets.get(key)
    if b and b.get("locked_until", 0) > time.time():
        return int(b["locked_until"] - time.time())
    return 0


def fail(key: str, max_fails: int, window: int, lock: int) -> None:
    """Enregistre un échec ; verrouille pour `lock` s. après `max_fails` échecs dans `window` s."""
    now = time.time()
    b = _buckets.get(key)
    if not b or (now - b.get("first", now)) > window:
        b = {"fails": 0, "first": now, "locked_until": 0}
    b["fails"] += 1
    if b["fails"] >= max_fails:
        b["locked_until"] = now + lock
    _buckets[key] = b


def clear(key: str) -> None:
    """Réinitialise le compteur (connexion réussie)."""
    _buckets.pop(key, None)
