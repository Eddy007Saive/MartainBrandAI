from datetime import datetime, timezone
import cloudinary
import cloudinary.uploader
import cloudinary.api
from config import (
    supabase, logger,
    CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
)
from services.auth_service import sanitize_user

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)


def _public_id_from_cloudinary_url(url: str) -> str | None:
    """Extrait le public_id (avec dossier, sans extension/version) d'une URL Cloudinary."""
    if not url or "cloudinary.com" not in url or "/upload/" not in url:
        return None
    after = url.split("/upload/", 1)[1]
    parts = after.split("/")
    if parts and parts[0].startswith("v") and parts[0][1:].isdigit():
        parts = parts[1:]  # enlève le préfixe de version vNNNN
    path = "/".join(parts).rsplit(".", 1)[0]  # enlève l'extension
    return path or None


def _delete_old_photo(old_url: str | None, keep_public_id: str) -> None:
    """Supprime l'ancien asset Cloudinary (sauf si c'est le même public_id qu'on vient d'écrire)."""
    pid = _public_id_from_cloudinary_url(old_url or "")
    if not pid or pid == keep_public_id:
        return  # rien à supprimer, ou déjà écrasé par l'upload (overwrite)
    try:
        cloudinary.uploader.destroy(pid, resource_type="image", invalidate=True)
        logger.info(f"Ancienne photo Cloudinary supprimée: {pid}")
    except Exception as e:
        logger.warning(f"Échec suppression ancienne photo Cloudinary ({pid}): {e}")


def upload_photo(telegram_id: str, file_bytes: bytes) -> str:
    """Upload la photo de profil sur Cloudinary et met à jour users.photo_url. Retourne l'URL.

    Remplace l'ancienne photo : même public_id + overwrite (pas d'accumulation), et si
    l'ancienne URL pointait ailleurs sur Cloudinary, on supprime cet asset orphelin.
    """
    prev = supabase.table("users").select("photo_url").eq("telegram_id", telegram_id).execute()
    old_url = prev.data[0].get("photo_url") if prev.data else None

    public_id = f"avatars/{telegram_id}/profil"
    up = cloudinary.uploader.upload(
        file_bytes,
        resource_type="image",
        public_id=public_id,
        overwrite=True,
        invalidate=True,  # purge le cache CDN pour voir la nouvelle image tout de suite
    )
    url = up["secure_url"]
    supabase.table("users").update({"photo_url": url}).eq("telegram_id", telegram_id).execute()

    _delete_old_photo(old_url, keep_public_id=public_id)
    return url


def upload_logo(telegram_id: str, file_bytes: bytes) -> str:
    """Upload le logo de marque sur Cloudinary et met à jour marques.logo_url. Retourne l'URL.
    Remplace l'ancien logo (même public_id + overwrite ; supprime l'orphelin éventuel)."""
    from services import marque_service
    old_url = marque_service.fiche(telegram_id).get("logo_url")

    public_id = f"logos/{telegram_id}/logo"
    up = cloudinary.uploader.upload(
        file_bytes, resource_type="image", public_id=public_id, overwrite=True, invalidate=True,
    )
    url = up["secure_url"]
    marque_service.enregistrer(telegram_id, {"logo_url": url})
    _delete_old_photo(old_url, keep_public_id=public_id)
    return url


def upload_avatar(telegram_id: str, file_bytes: bytes) -> str:
    """Upload l'avatar (photo de profil) sur Cloudinary et met à jour users.avatar_url. Retourne l'URL."""
    prev = supabase.table("users").select("avatar_url").eq("telegram_id", telegram_id).execute()
    old_url = prev.data[0].get("avatar_url") if prev.data else None
    public_id = f"avatars/{telegram_id}/avatar"
    up = cloudinary.uploader.upload(
        file_bytes, resource_type="image", public_id=public_id, overwrite=True, invalidate=True,
    )
    url = up["secure_url"]
    supabase.table("users").update({"avatar_url": url}).eq("telegram_id", telegram_id).execute()
    _delete_old_photo(old_url, keep_public_id=public_id)
    return url


def delete_logo(telegram_id: str) -> None:
    """Supprime le logo (Cloudinary + marques.logo_url)."""
    from services import marque_service
    old_url = marque_service.fiche(telegram_id).get("logo_url")
    marque_service.enregistrer(telegram_id, {"logo_url": None})
    _delete_old_photo(old_url, keep_public_id="")


# ---- Inspirations visuelles (stockées dans Cloudinary : inspirations/{telegram_id}/) ----

def list_inspirations(telegram_id: str) -> list:
    try:
        res = cloudinary.api.resources(
            type="upload", prefix=f"inspirations/{telegram_id}/", max_results=30,
        )
        return [r["secure_url"] for r in res.get("resources", []) if r.get("secure_url")]
    except Exception as e:
        logger.warning(f"list_inspirations error: {e}")
        return []


def add_inspiration(telegram_id: str, file_bytes: bytes) -> list:
    cloudinary.uploader.upload(
        file_bytes, resource_type="image", folder=f"inspirations/{telegram_id}",
    )
    return list_inspirations(telegram_id)


def remove_inspiration(telegram_id: str, url: str) -> list:
    pid = _public_id_from_cloudinary_url(url or "")
    if pid:
        try:
            cloudinary.uploader.destroy(pid, resource_type="image", invalidate=True)
        except Exception as e:
            logger.warning(f"remove_inspiration destroy error ({pid}): {e}")
    return list_inspirations(telegram_id)


def get_user(telegram_id: str) -> dict | None:
    result = supabase.table("users").select("*").eq("telegram_id", telegram_id).execute()
    if not result.data:
        return None
    user = sanitize_user(result.data[0])
    # Les comptes sociaux vivent dans `comptes_sociaux` depuis la normalisation, mais
    # le frontend lit toujours user.late_account_<réseau> : on recompose ces clés ici,
    # une seule fois, plutôt que de propager la nouvelle forme dans toute l'interface.
    from services import social_service, marque_service
    user.update(social_service.champs_late(telegram_id))
    # Idem pour la fiche de marque (table `marques`) : le frontend continue de lire
    # user.voix_marque, user.couleur_accent, etc.
    user.update(marque_service.fiche(telegram_id))
    # Facturation PAR COMPTE : chaque compte a ses propres crédits + forfait.
    # On expose seulement le flag sous-compte (pour l'UI), sans écraser crédits/plan.
    if user.get("master_id"):
        user["is_subaccount"] = True
    return user


# Clés que `get_user` RECOMPOSE à la lecture depuis d'autres tables : elles
# n'existent plus comme colonnes de `users`. Le frontend renvoyant l'objet
# utilisateur entier à l'enregistrement, elles reviendraient en écriture et
# feraient échouer toute la sauvegarde.
DERIVEES = {"is_subaccount"} | {f"late_account_{p}" for p in
            ("instagram", "facebook", "linkedin", "youtube", "tiktok",
             "googlebusiness", "twitter")}


def update_user(telegram_id: str, update_data: dict) -> dict | None:
    # La page Paramètres envoie compte et marque dans la même requête : chaque champ
    # part dans sa table, `users` ne reçoit plus que ce qui décrit le compte.
    from services import marque_service
    update_data = {k: v for k, v in (update_data or {}).items() if k not in DERIVEES}
    champs_compte, champs_marque = marque_service.separer(update_data)
    if champs_marque:
        marque_service.enregistrer(telegram_id, champs_marque)
    if not champs_compte:                       # mise à jour purement marque
        return get_user(telegram_id)
    update_data = champs_compte

    try:
        result = supabase.table("users").update(update_data).eq("telegram_id", telegram_id).execute()
    except Exception as e:
        # Colonne pas encore créée en base (migration en attente) : on réessaie sans
        # les champs inconnus plutôt que de faire échouer toute la sauvegarde.
        msg = str(e)
        if not any(m in msg for m in ("42703", "PGRST204", "does not exist", "schema cache")):
            raise
        connus = {k: v for k, v in update_data.items() if f"'{k}'" not in msg and f"users.{k}" not in msg}
        if not connus or connus == update_data:
            raise
        logger.warning(f"update_user: colonne(s) manquante(s) ignorée(s) — {set(update_data) - set(connus)}")
        result = supabase.table("users").update(connus).eq("telegram_id", telegram_id).execute()
    if not result.data:
        return None
    user = sanitize_user(result.data[0])
    from services import marque_service as _ms
    user.update(_ms.fiche(telegram_id))   # la réponse reflète la marque enregistrée
    return user


# --- Suppression / RGPD ---------------------------------------------------
# Tables « enfants » à EFFACER quand un compte est supprimé (données personnelles,
# de marque et de contenu — aucune obligation de conservation). Clé : telegram_id.
_PURGE_DELETE_TABLES = [
    "analytics_cache", "analytics_performance", "affiliate_referrals",
    "brand_assets", "brand_musiques", "brand_templates", "brouillons",
    "commentaires", "comptes_sociaux", "contenu", "device_tokens", "heygen_avatars",
    "marques", "notifications", "offers", "publication_schedules",
    "studio", "studio_drafts", "usage_log",
]


def purge_user_data(telegram_id: str) -> None:
    """Efface toutes les données rattachées à un utilisateur, SAUF la ligne `users`
    (l'appelant la supprime après, avec ses propres contrôles d'accès).

    Deux régimes :
    - EFFACEMENT pur des données perso/marque/contenu (droit à l'oubli RGPD).
    - ANONYMISATION des pièces à valeur comptable/financière (abonnements,
      commissions d'affiliation, résiliations) : on garde montants/dates/factures
      pour l'obligation légale de conservation, mais on retire toute donnée
      personnelle (email, nom, IBAN, verbatims).
    """
    for t in _PURGE_DELETE_TABLES:
        try:
            supabase.table(t).delete().eq("telegram_id", telegram_id).execute()
        except Exception as e:
            logger.warning(f"purge_user_data: delete {t} échoué ({telegram_id}): {e}")

    # Anonymisation — pièces conservées pour la compta, PII retirée.
    _anonymisations = [
        # (table, colonne_filtre, patch)
        ("affiliate_commissions", "telegram_id", {"telegram_id": None, "filleul_email": None}),
        ("resiliations",          "telegram_id", {"commentaire": None, "detail": None}),
        ("affiliates",            "telegram_id", {"telegram_id": None, "nom": "anonymisé",
                                                   "email": "", "iban_chiffre": None}),
    ]
    for table, col, patch in _anonymisations:
        try:
            supabase.table(table).update(patch).eq(col, telegram_id).execute()
        except Exception as e:
            logger.warning(f"purge_user_data: anonymisation {table} échouée ({telegram_id}): {e}")
    # `subscriptions` (clé user_id) : conservée telle quelle — aucune PII directe
    # (uniquement statut/dates/plan/stripe_id), et requise pour la compta.


def delete_user(telegram_id: str) -> bool:
    """Purge les données rattachées puis supprime la ligne `users`."""
    purge_user_data(telegram_id)
    result = supabase.table("users").delete().eq("telegram_id", telegram_id).execute()
    return bool(result.data)
