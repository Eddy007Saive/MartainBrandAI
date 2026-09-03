from zernio import Zernio, ZernioError
from config import LATE_API_KEY, BACKEND_URL, supabase, logger


def _norm_platform(p) -> str:
    # p peut être une string ("Platform12.FACEBOOK") ou un enum -> on coerce en str
    return str(p or "").lower().split(".")[-1]

VALID_PLATFORMS = {"instagram", "facebook", "linkedin", "tiktok", "youtube", "googlebusiness", "twitter"}

FIELD_MAP = {
    "instagram": "late_account_instagram",
    "facebook": "late_account_facebook",
    "linkedin": "late_account_linkedin",
    "youtube": "late_account_youtube",
    "tiktok": "late_account_tiktok",
    "googlebusiness": "late_account_googlebusiness",
    "twitter": "late_account_twitter",
}


# ----------------------------------------------- Comptes connectés (comptes_sociaux)
# La table `comptes_sociaux` est la source de vérité depuis la normalisation du
# 14/08/2026 : une ligne par compte connecté, au lieu de 7 colonnes dans `users`.
# Les colonnes late_account_<réseau> sont encore tenues à jour (filet de sécurité
# le temps de valider la bascule en production) mais ne sont plus lues.

def comptes(telegram_id: str) -> dict:
    """{plateforme: late_account_id} des comptes connectés de ce compte."""
    try:
        r = (supabase.table("comptes_sociaux").select("plateforme, late_account_id")
             .eq("telegram_id", telegram_id).execute())
        return {x["plateforme"]: x["late_account_id"] for x in (r.data or []) if x.get("late_account_id")}
    except Exception as e:
        logger.error(f"lecture comptes_sociaux {telegram_id}: {e}")
        return {}


def compte(telegram_id: str, plateforme: str) -> str | None:
    """L'identifiant Late d'un réseau, ou None s'il n'est pas connecté."""
    return comptes(telegram_id).get(_norm_platform(plateforme))


def champs_late(telegram_id: str) -> dict:
    """Les clés late_account_<réseau> attendues par le frontend, recomposées depuis
    comptes_sociaux : la normalisation ne change pas le contrat de l'API."""
    c = comptes(telegram_id)
    return {champ: c.get(p) for p, champ in FIELD_MAP.items()}


def enregistrer_compte(telegram_id: str, plateforme: str, account_id: str) -> bool:
    """Connecte un réseau (une ligne par compte, remplacée si elle existe déjà)."""
    plateforme = _norm_platform(plateforme)
    if plateforme not in VALID_PLATFORMS or not account_id:
        return False
    try:
        supabase.table("comptes_sociaux").upsert(
            {"telegram_id": telegram_id, "plateforme": plateforme, "late_account_id": account_id},
            on_conflict="telegram_id,plateforme").execute()
        return True
    except Exception as e:
        logger.error(f"enregistrer_compte {telegram_id}/{plateforme}: {e}")
        return False


def supprimer_compte(telegram_id: str, plateforme: str) -> bool:
    plateforme = _norm_platform(plateforme)
    if plateforme not in VALID_PLATFORMS:
        return False
    try:
        supabase.table("comptes_sociaux").delete().eq("telegram_id", telegram_id).eq("plateforme", plateforme).execute()
        return True
    except Exception as e:
        logger.error(f"supprimer_compte {telegram_id}/{plateforme}: {e}")
        return False


async def create_late_profile(telegram_id: str, nom: str) -> dict:
    """Crée le profil Late directement via le SDK (plus de dépendance n8n) et enregistre
    late_profile_id en base. Retourne {created: bool, late_profile_id?, error?}."""
    if not LATE_API_KEY:
        return {"created": False, "error": "Service de publication non configuré (contacte le support)."}
    name = (nom or "").strip() or f"Profil {str(telegram_id)[:8]}"

    def _link(pid: str, reused: bool):
        supabase.table("users").update({"late_profile_id": pid}).eq("telegram_id", telegram_id).execute()
        logger.info(f"Profil Late {'réutilisé' if reused else 'créé'} pour {telegram_id}: {pid} ({name})")
        return {"created": True, "late_profile_id": pid, "reused": reused}

    try:
        async with Zernio(api_key=LATE_API_KEY) as client:
            # 1) Réutiliser un profil existant du même nom (évite doublons + limite de profils)
            try:
                lst = await client.profiles.alist()
                ld = lst.model_dump() if hasattr(lst, "model_dump") else (lst or {})
                for p in (ld.get("profiles") or ld.get("data") or []):
                    pid = p.get("_id") or p.get("field_id")
                    if pid and (p.get("name") or "").strip().lower() == name.lower():
                        return _link(pid, reused=True)
            except Exception as e:
                logger.warning(f"create_late_profile: liste profils impossible ({e}) — on tente la création")

            # 2) Sinon, créer un nouveau profil
            r = await client.profiles.acreate(name=name)
            pid = getattr(getattr(r, "profile", None), "field_id", None)
            if not pid:
                d = r.model_dump() if hasattr(r, "model_dump") else {}
                prof = d.get("profile") or {}
                pid = prof.get("_id") or prof.get("field_id")
            if not pid:
                logger.error(f"create_late_profile: id absent dans la réponse pour {telegram_id}: {str(r)[:300]}")
                return {"created": False, "error": "Le profil de publication n'a pas pu être créé (réponse invalide)."}
            return _link(pid, reused=False)
    except ZernioError as e:
        msg = str(getattr(e, "message", "") or e)
        logger.error(f"create_late_profile ZernioError pour {telegram_id}: {msg}")
        if getattr(e, "status_code", None) == 403 or "limit" in msg.lower():
            return {"created": False, "error": "Limite de profils atteinte sur le compte de publication (le plan gratuit n'autorise que 2 profils). Libère un profil inutilisé ou passe à un plan supérieur."}
        return {"created": False, "error": "Impossible de créer le profil de publication. Réessaie dans un instant."}
    except Exception as e:
        logger.error(f"create_late_profile error pour {telegram_id}: {e}")
        return {"created": False, "error": "Impossible de créer le profil de publication. Réessaie dans un instant."}


async def _ensure_late_profile(telegram_id: str) -> tuple:
    """Filet de sécurité : crée le profil Late s'il manque, puis attend qu'il soit enregistré.
    Retourne (ok: bool, error: str | None)."""
    try:
        res = supabase.table("users").select("late_profile_id, nom").eq("telegram_id", telegram_id).execute()
    except Exception as e:
        logger.error(f"_ensure_late_profile lecture user {telegram_id}: {e}")
        return False, "Impossible de lire ton compte pour le moment. Réessaie."
    row = res.data[0] if res.data else {}
    if not row:
        return False, "Compte introuvable."
    if row.get("late_profile_id"):
        return True, None

    logger.info(f"connect: profil Late manquant pour {telegram_id} -> création automatique (backend/SDK)")
    cr = await create_late_profile(telegram_id, row.get("nom") or "")
    if cr.get("created") and cr.get("late_profile_id"):
        return True, None
    return False, cr.get("error") or "Impossible de créer le profil de publication."


async def connect_platform(telegram_id: str, platform: str) -> dict:
    """Génère l'URL OAuth via le SDK Late (plus de n8n). Late héberge l'OAuth puis redirige
    vers notre callback backend qui enregistre le compte."""
    # Connexion de réseau : abonnement actif OU essai en cours.
    #
    # C'était réservé aux comptes payants — un compte connecté coûte chez Late.
    # Mais quelqu'un en essai a déjà donné sa carte : lui interdire de
    # connecter, c'est lui faire essayer une moitié de produit, générer
    # quatorze jours de contenu qu'il ne peut pas publier, et le perdre au
    # moment du prélèvement.
    from services import quota_service
    if not quota_service.peut_publier(telegram_id):
        return {"success": False,
                "error": "Ajoute ta carte pour connecter tes réseaux — "
                         "14 jours d'essai, rien n'est prélevé aujourd'hui."}

    # Pendant l'essai : un seul réseau. Il suffit à voir le produit de bout en
    # bout, et il borne ce que coûte un compte qui ne restera peut-être pas.
    # La règle est posée ICI et non seulement dans l'interface : griser un
    # bouton n'empêche personne d'appeler l'API directement.
    limite = quota_service.reseaux_autorises(telegram_id)
    if limite is not None:
        deja = list(comptes(telegram_id))
        if platform not in deja and len(deja) >= limite:
            return {"success": False, "error": (
                "Pendant l'essai, tu peux connecter un réseau à la fois. "
                "Les autres se débloquent dès le premier prélèvement — "
                "ou déconnecte celui-ci pour en essayer un autre.")}
    # Filet de sécurité : garantir l'existence du profil Late avant toute connexion
    ok, err = await _ensure_late_profile(telegram_id)
    if not ok:
        return {"success": False, "error": err}

    res = supabase.table("users").select("late_profile_id").eq("telegram_id", telegram_id).execute()
    profile_id = res.data[0].get("late_profile_id") if res.data else None
    if not profile_id:
        return {"success": False, "error": "Profil de publication introuvable. Réessaie."}

    redirect_url = f"{BACKEND_URL}/api/late/oauth-callback?telegram_id={telegram_id}&platform={platform}"
    try:
        async with Zernio(api_key=LATE_API_KEY) as client:
            r = await client.connect.aget_connect_url(platform, profile_id, redirect_url=redirect_url)
        url = (r or {}).get("authUrl") or (r or {}).get("url") or (r or {}).get("connectUrl")
        if not url:
            logger.error(f"connect: pas d'authUrl dans la réponse pour {telegram_id}/{platform}: {str(r)[:300]}")
            return {"success": False, "error": "URL de connexion indisponible. Réessaie."}
        return {"success": True, "authUrl": url}
    except ZernioError as e:
        msg = str(getattr(e, "message", "") or e)
        code = getattr(e, "status_code", None)
        logger.error(f"connect ZernioError {telegram_id}/{platform}: [{code}] {msg}")
        if code == 402 or "payment" in msg.lower() or "more than 2" in msg.lower():
            return {"success": False, "error": "Limite de comptes connectés atteinte (2 gratuits sur le compte de publication). Ajoute un moyen de paiement sur Late pour en connecter plus."}
        return {"success": False, "error": msg or "Impossible de démarrer la connexion. Réessaie."}
    except Exception as e:
        logger.error(f"connect error for {telegram_id}/{platform}: {e}")
        return {"success": False, "error": "Impossible de démarrer la connexion. Réessaie."}


async def list_connected_accounts(telegram_id: str) -> dict:
    """Métadonnées des comptes connectés (via Zernio), pour afficher QUEL compte est lié à chaque réseau.
    Retour : {platform: {username, name, avatar, url, followers, is_active}}. Scopé au profil de l'utilisateur.
    is_active=False -> le compte est déconnecté côté plateforme et doit être reconnecté."""
    if not LATE_API_KEY:
        return {}
    res = supabase.table("users").select("late_profile_id").eq("telegram_id", telegram_id).execute()
    pid = res.data[0].get("late_profile_id") if res.data else None
    if not pid:
        return {}
    out = {}
    try:
        async with Zernio(api_key=LATE_API_KEY) as client:
            try:
                r = await client.accounts.alist(profile_id=pid)
            except TypeError:
                r = await client.accounts.alist()
            d = r.model_dump() if hasattr(r, "model_dump") else (r or {})
            for a in (d.get("accounts") or d.get("data") or []):
                # Sécurité : ne garder que les comptes de CE profil
                prof = a.get("profileId") or {}
                if isinstance(prof, dict) and prof.get("field_id") and prof.get("field_id") != pid:
                    continue
                plat = _norm_platform(a.get("platform"))
                if not plat:
                    continue
                out[plat] = {
                    "username": a.get("username"),
                    "name": a.get("displayName"),
                    "avatar": a.get("profilePicture"),
                    "url": a.get("profileUrl"),
                    "followers": a.get("followersCount"),
                    # Zernio signale l'état de connexion via isActive : False = token expiré/révoqué
                    # -> le compte doit être RECONNECTÉ (même flow OAuth que la connexion initiale).
                    # None/absent = considéré actif (pas de fausse alerte).
                    "is_active": a.get("isActive") is not False,
                }
    except Exception as e:
        logger.warning(f"list_connected_accounts {telegram_id}: {e}")
    return out


async def finalize_connection(telegram_id: str, platform: str, account_id: str = None) -> dict:
    """Après l'OAuth (Late a connecté le compte au profil), on enregistre l'accountId dans
    comptes_sociaux. account_id : fourni par Late dans le callback (le plus fiable)."""
    platform = _norm_platform(platform)
    if platform not in VALID_PLATFORMS:
        return {"ok": False, "error": "Plateforme inconnue."}

    # Cas idéal : Late nous a donné l'accountId directement dans le callback
    if account_id:
        if enregistrer_compte(telegram_id, platform, account_id):
            logger.info(f"Compte {platform} connecté pour {telegram_id}: {account_id} (via callback)")
            return {"ok": True, "account_id": account_id}
        return {"ok": False, "error": "Erreur lors de l'enregistrement du compte."}

    res = supabase.table("users").select("late_profile_id").eq("telegram_id", telegram_id).execute()
    profile_id = res.data[0].get("late_profile_id") if res.data else None
    if not profile_id:
        return {"ok": False, "error": "Profil introuvable."}
    try:
        async with Zernio(api_key=LATE_API_KEY) as client:
            acc = await client.accounts.alist(profile_id=profile_id)
        d = acc.model_dump() if hasattr(acc, "model_dump") else (acc or {})
        accounts = d.get("accounts") or d.get("data") or []
        matches = [a for a in accounts if _norm_platform(a.get("platform")) == platform]
        if not matches:
            logger.warning(f"finalize_connection: aucun compte {platform} trouvé pour profil {profile_id}")
            return {"ok": False, "error": "Compte non trouvé après connexion."}
        chosen = matches[-1]  # le plus récent (modèle 1 compte/réseau)
        account_id = chosen.get("field_id") or chosen.get("_id")
        enregistrer_compte(telegram_id, platform, account_id)
        logger.info(f"Compte {platform} connecté pour {telegram_id}: {account_id}")
        return {"ok": True, "account_id": account_id}
    except Exception as e:
        logger.error(f"finalize_connection error {telegram_id}/{platform}: {e}")
        return {"ok": False, "error": "Erreur lors de l'enregistrement du compte."}


async def disconnect_platform(telegram_id: str, platform: str) -> dict:
    """Déconnecte un réseau via le SDK Late (supprime le compte côté Late -> libère un slot),
    puis nettoie la colonne en base."""
    platform_n = _norm_platform(platform)
    if platform_n not in VALID_PLATFORMS:
        return {"success": False, "error": "Plateforme inconnue."}

    account_id = compte(telegram_id, platform_n)

    # Suppression côté Late (libère un slot). Best-effort : on nettoie la base même si ça échoue.
    if account_id and LATE_API_KEY:
        try:
            async with Zernio(api_key=LATE_API_KEY) as client:
                await client.accounts.adelete_account(account_id)
            logger.info(f"Compte {platform_n} déconnecté côté Late pour {telegram_id} ({account_id})")
        except Exception as e:
            logger.warning(f"disconnect Late {telegram_id}/{platform_n} ({account_id}): {e}")

    if not supprimer_compte(telegram_id, platform_n):
        return {"success": False, "error": "Erreur lors de la déconnexion."}

    return {"success": True}


async def _annuler_programmations(telegram_id: str) -> int:
    """Fin d'abonnement : les publications déjà programmées ne partiront jamais (les comptes
    Late vont être supprimés). Sans ça, elles resteraient affichées « Planifié » indéfiniment.

    Pour chaque contenu programmé ou en cours d'envoi : annulation côté Zernio (best-effort,
    AVANT la suppression des comptes, sinon l'appel n'a plus de sens), puis en base
    statut « Validé » + publish_status « échec » avec la raison — c'est exactement l'état
    que l'interface sait déjà afficher (badge rouge, raison dans le détail, bouton
    « Réessayer ») : après réabonnement et reconnexion des réseaux, un clic reprogramme."""
    from services import late_service
    try:
        r = (supabase.table("contenu").select("id, late_post_id, titre, reseau_cible")
             .eq("telegram_id", telegram_id)
             .or_("statut.eq.Planifie,publish_status.in.(envoi,programmé)")
             .neq("statut", "Publie").execute())
    except Exception as e:
        logger.warning(f"annuler_programmations {telegram_id}: lecture impossible: {e}")
        return 0
    rows = r.data or []
    if not rows:
        return 0
    for c in rows:
        if c.get("late_post_id"):
            try:
                await late_service.cancel_post(c["late_post_id"])
            except Exception as e:
                logger.warning(f"annuler_programmations: cancel Late {c['late_post_id']}: {e}")
    raison = ("Abonnement résilié : tes réseaux ont été déconnectés, la publication a été annulée. "
              "Reconnecte tes réseaux puis clique « Réessayer » pour la reprogrammer.")
    try:
        (supabase.table("contenu")
         .update({"statut": "Valider", "publish_status": "échec", "publish_error": raison, "late_post_id": None})
         .in_("id", [c["id"] for c in rows]).execute())
    except Exception as e:
        logger.error(f"annuler_programmations {telegram_id}: update impossible: {e}")
        return 0
    try:
        from services import notification_service
        n = len(rows)
        notification_service.notifier(
            telegram_id, rows[0]["id"], rows[0].get("reseau_cible"), "post.cancelled",
            f"{n} publication{'s' if n > 1 else ''} annulée{'s' if n > 1 else ''}",
            "Ton abonnement est terminé : les publications programmées ne partiront pas. "
            "Elles restent dans Contenus, prêtes à être reprogrammées si tu reviens.")
    except Exception as e:
        logger.warning(f"annuler_programmations notification: {e}")
    logger.info(f"annuler_programmations : {len(rows)} publication(s) annulée(s) pour {telegram_id}")
    return len(rows)


async def disconnect_all(telegram_id: str) -> int:
    """Déconnecte TOUS les réseaux du compte (libère les slots Late -> stoppe le coût récurrent).
    Appelé quand un abonnement se termine définitivement (canceled/unpaid). Retourne le nb déconnectés."""
    # D'abord les publications programmées (elles ne partiront jamais sans réseau), tant
    # que les comptes Late existent encore pour pouvoir les annuler côté Zernio.
    try:
        await _annuler_programmations(telegram_id)
    except Exception as e:
        logger.error(f"disconnect_all annuler_programmations {telegram_id}: {e}")
    n = 0
    for plateforme, account_id in comptes(telegram_id).items():
        if LATE_API_KEY:
            try:
                async with Zernio(api_key=LATE_API_KEY) as client:
                    await client.accounts.adelete_account(account_id)
            except Exception as e:
                # Late n'a pas pu supprimer (ex. clé d'un AUTRE workspace) -> on GARDE le compte
                # pour rester cohérent avec Late (jamais de faux "déconnecté" en base).
                logger.warning(f"disconnect_all Late {telegram_id}/{plateforme} ({account_id}) -> compte conservé: {e}")
                continue
        if supprimer_compte(telegram_id, plateforme):
            n += 1
    if n:
        logger.info(f"disconnect_all : {n} réseau(x) déconnecté(s) pour {telegram_id} (abonnement terminé)")
    return n
