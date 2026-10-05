"""
Sentry : alertes sur les erreurs du serveur. Inactif tant que SENTRY_DSN n'est pas posé.

Ce qui part chez Sentry : la pile de l'erreur, la route, l'id interne du compte (jamais son
email). Ce qui n'y part pas : les corps de requête (images d'éditeur, designs, contenus des
clients), les en-têtes d'authentification, les adresses IP. Les erreurs HTTP 4xx (refus
attendus : quota, droits, saisie) ne sont pas remontées, seulement les 5xx et les
`logger.error` (crons, appels de prestataires qui échouent).
"""
from config import SENTRY_DSN, SENTRY_ENV, logger

ACTIF = False


def demarrer() -> None:
    global ACTIF
    if not SENTRY_DSN:
        return
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=SENTRY_DSN,
            environment=SENTRY_ENV,
            send_default_pii=False,          # ni IP, ni cookies, ni en-têtes sensibles
            max_request_body_size="never",   # jamais les corps (designs, images, contenus)
            traces_sample_rate=0.0,          # erreurs seulement, pas de suivi de performance
        )
        ACTIF = True
        logger.info(f"Sentry actif ({SENTRY_ENV})")
    except Exception as e:  # le suivi des erreurs ne doit jamais empêcher le serveur de démarrer
        logger.warning(f"Sentry non démarré : {e}")


def identifier(telegram_id: str | None) -> None:
    """Rattache les erreurs de la requête au compte (id interne seulement)."""
    if ACTIF and telegram_id:
        import sentry_sdk
        sentry_sdk.set_user({"id": telegram_id})
