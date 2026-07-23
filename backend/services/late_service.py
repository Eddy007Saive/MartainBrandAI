"""
Publication sociale via Late / Zernio (backend-direct, sans n8n).

Flux : on pousse le contenu validé dans Late avec sa date (`scheduledFor`).
Late le met en file et publie tout seul à l'heure, puis envoie un webhook
(post.published / post.failed) -> on met à jour le statut + le lien.
"""
import hmac
import hashlib
from datetime import datetime, timezone
from zernio import Zernio, ZernioError
from config import supabase, logger, LATE_API_KEY, LATE_WEBHOOK_SECRET

PLATFORMS = {"instagram", "facebook", "linkedin", "tiktok", "youtube", "googlebusiness"}
ACCOUNT_COL = {p: f"late_account_{p}" for p in PLATFORMS}
DEFAULT_TZ = "Europe/Paris"


def _ig_fit(url: str) -> str:
    """Conforme une image Cloudinary au ratio accepté par Instagram [0.8 ; 1.91] via un
    PADDING conditionnel : ne touche pas les images déjà dans la plage, ne rogne jamais.
    (trop haute < 0.8 → padée en 4:5 ; trop large > 1.91 → padée en 1.91.)"""
    if not url or "res.cloudinary.com" not in url or "/image/upload/" not in url:
        return url
    t = "if_ar_lt_0.8/ar_4:5,c_pad,b_auto/if_end/if_ar_gt_1.91/ar_191:100,c_pad,b_auto/if_end"
    return url.replace("/image/upload/", f"/image/upload/{t}/", 1)


def _media_items(contenu: dict, reseau: str) -> list:
    """Construit les médias Late selon le type de contenu et le réseau."""
    # Vidéo / Reel : le montage final est une vidéo → média unique de type "video".
    if contenu.get("video_url"):
        return [{"url": contenu["video_url"], "type": "video"}]
    ig = reseau == "instagram"  # Instagram impose un ratio 0.8–1.91 → on conforme l'image
    is_carrousel = contenu.get("type") == "Carrousel" or (contenu.get("slides_images") or [])
    if is_carrousel:
        if reseau == "linkedin" and contenu.get("carrousel_pdf"):
            return [{"url": contenu["carrousel_pdf"], "type": "document"}]
        slides = contenu.get("slides_images") or []
        if slides:
            return [{"url": (_ig_fit(u) if ig else u), "type": "image"} for u in slides[:10]]
    if contenu.get("lien_visuel"):
        u = contenu["lien_visuel"]
        return [{"url": (_ig_fit(u) if ig else u), "type": "image"}]
    return []


def _to_tz_iso(value: str, tz: str) -> str:
    """Convertit une date (UTC ou naïve) en ISO 8601 avec le décalage du fuseau `tz` explicite,
    pour que Late publie à l'heure murale du client sans ambiguïté (ex. 10:42+02:00)."""
    try:
        import re
        from zoneinfo import ZoneInfo
        s = str(value).strip().replace("Z", "+00:00").replace(" ", "T")
        s = re.sub(r"([+-]\d{2})$", r"\1:00", s)  # +00 -> +00:00
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(ZoneInfo(tz or DEFAULT_TZ)).isoformat()
    except Exception as e:
        logger.warning(f"_to_tz_iso fallback ({e}) pour {value!r} tz={tz!r}")
        return str(value)


def _client() -> Zernio:
    return Zernio(api_key=LATE_API_KEY)


async def publish_contenu(telegram_id: str, contenu: dict) -> dict:
    """Pousse un contenu dans Late via le SDK Zernio. Retourne {ok, late_post_id, status} ou {ok:False, error}."""
    if not LATE_API_KEY:
        return {"ok": False, "error": "Publication indisponible : clé Late non configurée (contacte le support)."}
    reseau = (contenu.get("reseau_cible") or "").lower()
    if reseau not in PLATFORMS:
        return {"ok": False, "error": "Aucun réseau cible défini sur ce contenu."}

    res = supabase.table("users").select(f"{ACCOUNT_COL[reseau]}, timezone").eq("telegram_id", telegram_id).execute()
    row = res.data[0] if res.data else {}
    account_id = row.get(ACCOUNT_COL[reseau])
    user_tz = row.get("timezone") or DEFAULT_TZ
    if not account_id:
        return {"ok": False, "error": f"Compte {reseau.capitalize()} non connecté. Connecte-le dans Paramètres."}

    content = contenu.get("contenu") or ""
    media = _media_items(contenu, reseau)
    if not content and not media:
        return {"ok": False, "error": "Le contenu est vide (ni texte ni visuel)."}

    plat_entry = {"platform": reseau, "accountId": account_id}
    # Story (Instagram/Facebook) : éphémère 24h, 1 média requis, pas de légende côté plateforme.
    if (contenu.get("type") == "Story") and reseau in ("instagram", "facebook"):
        if not media:
            return {"ok": False, "error": "Une story nécessite un visuel — génère ou importe une image d'abord."}
        plat_entry["platformSpecificData"] = {"contentType": "story"}

    kwargs = {
        "content": content,
        "platforms": [plat_entry],
        "timezone": user_tz,
    }
    if media:
        kwargs["media_items"] = media
    if contenu.get("date_publication"):
        kwargs["scheduled_for"] = _to_tz_iso(contenu["date_publication"], user_tz)

    try:
        async with _client() as c:
            r = await c.posts.acreate(**kwargs)
    except ZernioError as e:
        msg = getattr(e, "message", None) or str(e)
        logger.error(f"Late publish error: {msg}")
        low = msg.lower()
        # Doublon anti-spam de la plateforme (Instagram/LinkedIn) : message clair + actionnable.
        if "already" in low and ("24 hours" in low or "posted to this account" in low or "scheduled" in low):
            return {"ok": False, "duplicate": True,
                    "error": "Doublon : ce contenu (texte identique) a déjà été publié ou programmé sur ce compte il y a moins de 24 h. Modifie légèrement le texte pour pouvoir republier."}
        return {"ok": False, "error": msg}
    except Exception as e:
        logger.error(f"Late publish exception: {e}")
        return {"ok": False, "error": "Late injoignable, réessaie."}

    post = getattr(r, "post", None)
    late_id = getattr(post, "field_id", None) if post else None
    status = getattr(post, "status", None) if post else None
    status = getattr(status, "value", None) or str(status) if status else "scheduled"
    if not late_id:
        logger.error(f"Late publish: id introuvable dans la réponse SDK: {r}")
    return {"ok": True, "late_post_id": late_id, "status": status}


def verify_signature(raw_body: bytes, signature: str) -> bool:
    """Best-effort : la spec de signature Late n'est pas documentée et le 'test' du dashboard
    n'est pas signé. On accepte toujours (l'URL du webhook fait office de secret), mais si une
    signature est présente et ne correspond pas (hex ou base64), on log un avertissement."""
    if not LATE_WEBHOOK_SECRET or not signature:
        return True
    try:
        import base64
        mac = hmac.new(LATE_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256)
        hexd = mac.hexdigest()
        b64 = base64.b64encode(hmac.new(LATE_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).digest()).decode()
        sig = signature.split("=", 1)[-1].strip()
        if not (hmac.compare_digest(hexd, sig) or hmac.compare_digest(b64, sig)):
            # Diagnostic du format (tronqué, sans exposer le secret) pour pouvoir implémenter le bon schéma
            logger.info(
                "Late webhook signature non matchée — format reçu=%r (len=%d) | attendu_hex_prefix=%s | attendu_b64_prefix=%s",
                signature[:24], len(signature), hexd[:8], b64[:8],
            )
    except Exception as e:
        logger.warning(f"Late webhook signature check error: {e}")
    return True


def _notify(telegram_id, contenu_id, reseau, event, titre, message):
    try:
        supabase.table("notifications").insert({
            "telegram_id": telegram_id, "type": "publication", "event": event,
            "titre": titre, "message": message, "contenu_id": contenu_id, "reseau": reseau,
        }).execute()
    except Exception as e:
        logger.warning(f"notif insert error: {e}")


async def programmer_contenu(telegram_id: str, contenu_id: str) -> dict:
    """Pousse un contenu PLANIFIÉ vers Zernio (programmé à sa date) et met à jour la ligne.
    Utilisé par l'auto-push (visuel prêt -> statut Planifie) et par le balayage cron de
    rattrapage — garantit que « Planifié » dans l'app = réellement programmé sur Zernio.
    Best-effort : ne lève jamais, retourne {ok, ...} ou {ok: False, skipped?/error?}."""
    try:
        r = supabase.table("contenu").select("*").eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
        contenu = r.data[0] if r.data else None
        if not contenu:
            return {"ok": False, "skipped": "introuvable"}
        if contenu.get("publish_status") == "publié":
            return {"ok": False, "skipped": "déjà publié"}
        # Déjà programmé sur Zernio -> rien à faire (la re-programmation explicite passe par /late/publier)
        if contenu.get("late_post_id") and contenu.get("publish_status") in ("programmé", "envoi"):
            return {"ok": True, "late_post_id": contenu["late_post_id"], "already": True}
        # Vidéo pas encore montée -> on attend (le montage repassera par ici)
        is_video = contenu.get("type") in ("Reel", "Video", "Short") or contenu.get("video_status")
        if is_video and not contenu.get("video_url"):
            return {"ok": False, "skipped": "vidéo non montée"}

        res = await publish_contenu(telegram_id, contenu)
        if res.get("ok"):
            supabase.table("contenu").update({
                "late_post_id": res.get("late_post_id"),
                "publish_status": "envoi", "publish_error": None,
            }).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
            logger.info(f"Auto-programmation Zernio ok: contenu {contenu_id} -> {res.get('late_post_id')}")
        else:
            supabase.table("contenu").update({
                "publish_status": "échec", "publish_error": res.get("error"),
            }).eq("id", contenu_id).eq("telegram_id", telegram_id).execute()
            logger.warning(f"Auto-programmation Zernio échec: contenu {contenu_id}: {res.get('error')}")
        return res
    except Exception as e:
        logger.error(f"programmer_contenu {contenu_id}: {e}")
        return {"ok": False, "error": str(e)}


async def sweep_planifies() -> int:
    """Filet de sécurité en 2 passes :
    1) RATTRAPAGE — contenus 'Planifie' à date FUTURE jamais poussés (late_post_id absent) :
       lignes héritées de l'ancien flux optimiste -> on les programme sur Zernio.
    2) RÉCONCILIATION — contenus poussés mais restés en publish_status='envoi' (webhook
       post.scheduled raté) : on lit l'état réel du post chez Zernio et on aligne la base."""
    n = 0
    # --- Passe 1 : rattrapage des jamais-poussés ---
    try:
        now = datetime.now(timezone.utc).isoformat()
        r = (supabase.table("contenu")
             .select("id, telegram_id")
             .eq("statut", "Planifie")
             .is_("late_post_id", "null")
             .is_("publish_status", "null")
             .gt("date_publication", now)
             .limit(20).execute())
        rows = r.data or []
        for c in rows:
            res = await programmer_contenu(c["telegram_id"], c["id"])
            if res.get("ok"):
                n += 1
        if rows:
            logger.info(f"sweep_planifies: {n}/{len(rows)} contenu(s) rattrapé(s) -> Zernio")
    except Exception as e:
        logger.error(f"sweep_planifies (rattrapage): {e}")

    # --- Passe 2 : réconciliation des 'envoi' avec l'état réel Zernio ---
    try:
        r2 = (supabase.table("contenu")
              .select("id, late_post_id")
              .eq("publish_status", "envoi")
              .not_.is_("late_post_id", "null")
              .limit(10).execute())
        for c in (r2.data or []):
            try:
                async with _client() as cl:
                    p = await cl.posts.aget(post_id=c["late_post_id"])
                post = getattr(p, "post", None) or p
                status = getattr(post, "status", None)
                status = (getattr(status, "value", None) or str(status) or "").lower()
                if "publish" in status:
                    upd = {"publish_status": "publié", "statut": "Publie"}
                elif "schedul" in status or "pending" in status or "queue" in status:
                    upd = {"publish_status": "programmé", "statut": "Planifie"}
                elif "fail" in status:
                    upd = {"publish_status": "échec", "publish_error": "Échec côté Zernio (réconciliation)"}
                else:
                    continue
                supabase.table("contenu").update(upd).eq("id", c["id"]).execute()
                logger.info(f"sweep réconciliation: contenu {c['id']} -> {upd['publish_status']}")
            except ZernioError as e:
                msg = (getattr(e, "message", None) or str(e)).lower()
                if "not found" in msg or "404" in msg:
                    # Le post n'existe plus côté Zernio -> on libère la ligne pour re-programmation
                    supabase.table("contenu").update({"late_post_id": None, "publish_status": None}).eq("id", c["id"]).execute()
                    logger.warning(f"sweep réconciliation: post Zernio disparu, contenu {c['id']} libéré")
            except Exception as e:
                logger.warning(f"sweep réconciliation {c['id']}: {e}")
    except Exception as e:
        logger.error(f"sweep_planifies (réconciliation): {e}")
    return n


async def cancel_post(late_post_id: str) -> dict:
    """Supprime un post dans Late (Zernio deletePost) — annulation d'envoi ou suppression."""
    if not LATE_API_KEY:
        return {"ok": False, "error": "Clé Late non configurée"}
    try:
        async with _client() as c:
            await c.posts.adelete(post_id=late_post_id)
        return {"ok": True}
    except ZernioError as e:
        return {"ok": False, "error": getattr(e, "message", None) or str(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _notify_account(telegram_id, platform, event, titre, message):
    """Notification + push pour un événement de compte (déconnexion réseau)."""
    try:
        supabase.table("notifications").insert({
            "telegram_id": telegram_id, "type": "reseau", "event": event,
            "titre": titre, "message": message, "reseau": platform,
        }).execute()
    except Exception as e:
        logger.warning(f"notif account insert error: {e}")
    try:
        from services import push_service
        push_service.send_to_user(telegram_id, titre, message, {"event": event, "reseau": platform})
    except Exception as e:
        logger.warning(f"push account error: {e}")


def _handle_account_event(event: str, payload: dict) -> dict:
    """account.disconnected : vide la colonne late_account_<réseau> + prévient l'utilisateur de reconnecter.
    (account.connected et autres : gérés par le flux de connexion de l'app, ignorés ici.)"""
    logger.info(f"Late account event: {event} | payload keys={list(payload.keys())}")
    if "disconnect" not in event:
        return {"ok": True, "ignored": event}
    acc = payload.get("account") or payload.get("data") or {}
    if not isinstance(acc, dict):
        acc = {}
    # L'id du compte peut arriver sous plusieurs formes selon Late (on stocke le field_id).
    ids = [str(i) for i in (acc.get("field_id"), acc.get("_id"), acc.get("id"),
                            payload.get("accountId"), payload.get("account_id")) if i]
    platform = (acc.get("platform") or payload.get("platform") or "")
    platform = str(platform).lower().split(".")[-1]  # "Platform12.INSTAGRAM" -> "instagram"
    cols = [platform] if platform in PLATFORMS else list(PLATFORMS)
    for p in cols:
        col = f"late_account_{p}"
        for aid in ids:
            r = supabase.table("users").select("telegram_id").eq(col, aid).limit(1).execute()
            if r.data:
                tg = r.data[0]["telegram_id"]
                supabase.table("users").update({col: None}).eq("telegram_id", tg).execute()
                _notify_account(
                    tg, p, event, "Réseau déconnecté ⚠️",
                    f"Ton compte {p.capitalize()} a été déconnecté. Reconnecte-le dans "
                    f"Paramètres → Réseaux pour continuer à publier.",
                )
                # Email d'alerte avec lien de reconnexion : la notification in-app ne suffit pas,
                # l'utilisateur ne vit pas dans l'app et ses publications échoueraient en silence.
                try:
                    u = supabase.table("users").select("email, nom").eq("telegram_id", tg).limit(1).execute()
                    email = (u.data[0].get("email") if u.data else None)
                    if email:
                        import asyncio
                        from config import FRONTEND_URL
                        from services import mail_service
                        html = mail_service.account_disconnected_html(
                            (u.data[0].get("nom") or ""), p,
                            f"{FRONTEND_URL}/dashboard/parametres?s=connections")
                        asyncio.get_running_loop().create_task(mail_service.send_email(
                            email, f"⚠️ Ton compte {p.capitalize()} est déconnecté — reconnecte-le", html))
                except Exception as e:
                    logger.warning(f"email compte déconnecté {tg}/{p}: {e}")
                logger.info(f"account.disconnected: {tg} / {p} -> colonne vidée")
                return {"ok": True, "telegram_id": tg, "platform": p, "action": "disconnected"}
    logger.info(f"account.disconnected: compte introuvable (ids={ids} platform={platform})")
    return {"ok": True, "ignored": event, "reason": "account_not_found"}


def handle_webhook(payload: dict) -> dict:
    """Traite TOUS les événements Late : met à jour le statut du contenu + crée une notification."""
    event = (payload.get("event") or payload.get("type") or "").lower()

    # Événements de COMPTE (un réseau se connecte/déconnecte côté Late)
    if event.startswith("account."):
        return _handle_account_event(event, payload)

    post = payload.get("post") or payload.get("data") or payload
    platforms = post.get("platforms") if isinstance(post.get("platforms"), list) else []
    plat0 = platforms[0] if platforms else {}
    post_id = post.get("id") or post.get("_id") or payload.get("postId") or post.get("postId")
    if not post_id:
        return {"ok": False, "error": "no post id"}

    q = supabase.table("contenu").select("id, telegram_id, titre, reseau_cible").eq("late_post_id", post_id).execute()
    if q.data:
        c = q.data[0]
    else:
        # Filet de sécurité : retrouver par le TEXTE du post (cas où late_post_id n'a pas pu être stocké),
        # puis réattacher l'id pour les prochains événements.
        content = post.get("content") or ""
        reseau_w = (plat0.get("platform") or post.get("platform") or "").lower()
        cand = []
        if content:
            r = supabase.table("contenu").select("id, telegram_id, titre, reseau_cible, late_post_id").eq("contenu", content).execute()
            cand = [x for x in (r.data or []) if not x.get("late_post_id")]
            if reseau_w:
                cand = [x for x in cand if (x.get("reseau_cible") or "").lower() == reseau_w] or cand
        if not cand:
            return {"ok": False, "error": "contenu introuvable"}
        c = cand[0]
        supabase.table("contenu").update({"late_post_id": post_id}).eq("id", c["id"]).execute()
        logger.info(f"Webhook: contenu {c['id']} ré-attaché à late_post_id={post_id} (via texte)")
    cid, tg, reseau = c["id"], c["telegram_id"], c.get("reseau_cible") or ""
    titre_c = (c.get("titre") or "Ton post")[:60]

    # Late expose l'URL du post publié dans "publishedUrl" (objet platform top-level ou post.platforms[])
    plat_obj = payload.get("platform") if isinstance(payload.get("platform"), dict) else {}
    pub_url = (plat_obj.get("publishedUrl") or plat_obj.get("url") or plat_obj.get("platformPostUrl")
               or plat0.get("publishedUrl") or plat0.get("platformPostUrl") or plat0.get("url")
               or post.get("publishedUrl") or post.get("platformPostUrl") or post.get("url"))

    upd, notif = {}, None
    if "published" in event:                       # post.published / post.platform.published
        url = pub_url
        upd = {"publish_status": "publié", "statut": "Publie", "publish_error": None}
        if url:
            upd["lien_publication"] = url
        notif = ("Post publié ✅", f"« {titre_c} » a été publié sur {reseau}.")
    elif "partial" in event:                       # post.partial
        upd = {"publish_status": "partiel"}
        notif = ("Publication partielle ⚠️", f"« {titre_c} » a été publié partiellement sur {reseau}.")
    elif "failed" in event:                        # post.failed / post.platform.failed
        reason = plat0.get("error") or post.get("error") or payload.get("error") or "raison inconnue"
        upd = {"publish_status": "échec", "publish_error": str(reason)[:400]}
        notif = ("Échec de publication ❌", f"« {titre_c} » n'a pas pu être publié sur {reseau} : {reason}")
    elif "scheduled" in event:                     # post.scheduled (confirme la mise en file)
        # SEUL endroit qui pose statut=Planifie : la planification est confirmée PAR Zernio
        # (fini les contenus "Planifié" côté app qui n'existent pas côté Zernio).
        upd = {"publish_status": "programmé", "statut": "Planifie"}
        notif = ("Publication programmée ⏱", f"« {titre_c} » est programmé sur {reseau}.")
    elif "cancelled" in event:                     # post.cancelled
        upd = {"publish_status": "annulé"}
        notif = ("Publication annulée", f"La publication de « {titre_c} » sur {reseau} a été annulée.")
    elif "recycled" in event:                      # post.recycled
        upd = {"publish_status": "programmé"}
        notif = ("Post recyclé ♻️", f"« {titre_c} » a été reprogrammé sur {reseau}.")
    else:
        return {"ok": True, "ignored": event}

    if upd:
        supabase.table("contenu").update(upd).eq("id", cid).execute()
    if notif:
        _notify(tg, cid, reseau, event, notif[0], notif[1])
        try:
            from services import push_service
            push_service.send_to_user(tg, notif[0], notif[1], {"contenu_id": str(cid), "event": event})
        except Exception as e:
            logger.warning(f"push send error: {e}")
    return {"ok": True, "contenu_id": cid, "event": event}
