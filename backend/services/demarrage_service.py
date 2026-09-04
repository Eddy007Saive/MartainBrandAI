"""
Démarrage guidé : où en est un compte dans ses premiers pas, calculé depuis les
données (jamais une case cochée) — un client qui revient trois semaines plus
tard retrouve la visite à la bonne étape, un compte complet ne voit rien.

  profil      : secteur, voix_marque, audience, piliers renseignés (table marques)   BLOQUANT
  reseau      : au moins un réseau connecté (comptes_sociaux)                      BLOQUANT
  carte       : un abonnement (essai / actif / past_due)                             BLOQUANT
  sujets      : au moins un sujet généré (brouillons)
  post        : au moins un contenu rédigé (contenu)
  validation  : au moins un contenu validé / planifié / publié

Les trois premières étapes bloquent la génération côté serveur (`exiger_profil`
pour la 1re ; la carte est déjà tenue par le mur de paiement, le réseau par la
publication). Une panne de lecture sur une étape la rend « inconnue » (fait: None)
et ne bloque pas : on ne punit pas un client pour un incident.
"""
import time
from fastapi import HTTPException
from config import supabase, logger

CHAMPS_MINIMUM = ("secteur", "voix_marque", "audience", "piliers")
ORDRE = ("profil", "reseau", "carte", "sujets", "post", "validation")
BLOQUANTES = {"profil", "reseau", "carte"}
TTL_S = 20
_CACHE: dict = {}   # telegram_id -> (timestamp, etat)


def _rempli(v) -> bool:
    if isinstance(v, (list, tuple)):
        return any(str(x or "").strip() for x in v)
    return bool(str(v or "").strip())


def _profil(tid: str) -> dict:
    from services import marque_service
    fiche = marque_service.fiche(tid)  # lève en cas d'erreur de lecture (voulu)
    manquants = [c for c in CHAMPS_MINIMUM if not _rempli(fiche.get(c))]
    return {"id": "profil", "fait": not manquants, "manquants": manquants}


def _reseau(tid: str) -> dict:
    from services import social_service
    return {"id": "reseau", "fait": bool(social_service.comptes(tid))}


def _carte(tid: str) -> dict:
    from services import quota_service
    fait = quota_service.statut_abonnement(tid) is not None
    out = {"id": "carte", "fait": fait}
    if not fait:
        # Un ex-abonné (résilié, impayé) n'a plus droit à l'essai : la visite doit
        # ouvrir le mur « retour » (reprendre l'abonnement), pas « 14 jours gratuits ».
        try:
            from services import billing_service
            out["ancien_abonne"] = bool(billing_service.a_deja_eu_un_abonnement(tid))
        except Exception:
            out["ancien_abonne"] = False
    return out


def _compter(table: str, tid: str, statuts=None) -> int:
    q = supabase.table(table).select("id", count="exact").eq("telegram_id", tid)
    if statuts:
        q = q.in_("statut", list(statuts))
    r = q.limit(1).execute()
    return r.count or 0


def _sujets(tid: str) -> dict:
    n = _compter("brouillons", tid)
    return {"id": "sujets", "fait": n > 0, "n": n}


def _post(tid: str) -> dict:
    n = _compter("contenu", tid)
    return {"id": "post", "fait": n > 0, "n": n}


def _validation(tid: str) -> dict:
    from services.memoire_service import STATUTS_INDEXES
    n = _compter("contenu", tid, STATUTS_INDEXES)
    e = {"id": "validation", "fait": n > 0, "n": n}
    if n:
        try:
            r = (supabase.table("contenu").select("date_publication").eq("telegram_id", tid)
                 .in_("statut", list(STATUTS_INDEXES)).not_.is_("date_publication", "null")
                 .order("date_publication").limit(1).execute())
            if r.data:
                e["date_premiere_publication"] = r.data[0]["date_publication"]
        except Exception:
            pass
    return e


_ETAPES = {"profil": _profil, "reseau": _reseau, "carte": _carte,
           "sujets": _sujets, "post": _post, "validation": _validation}


def etat(telegram_id: str, force: bool = False) -> dict:
    """L'état des six étapes + l'étape courante. Mis en cache TTL_S secondes :
    le front l'appelle souvent (changement de page, focus, poll)."""
    now = time.time()
    if not force:
        c = _CACHE.get(telegram_id)
        if c and now - c[0] < TTL_S:
            return c[1]
    etapes = []
    for nom in ORDRE:
        try:
            etapes.append(_ETAPES[nom](telegram_id))
        except Exception as e:
            logger.warning(f"démarrage {nom} {telegram_id}: {e}")
            etapes.append({"id": nom, "fait": None})
    courante = next((e["id"] for e in etapes if e["fait"] is False), None)
    out = {
        "etapes": etapes,
        "courante": courante,
        "bloquant": courante in BLOQUANTES,
        "termine": all(e["fait"] is True for e in etapes),
    }
    _CACHE[telegram_id] = (now, out)
    return out


def oublier(telegram_id: str) -> None:
    """À appeler quand une étape peut avoir changé (profil enregistré, réseau
    connecté, abonnement) : le prochain `etat` relit la base."""
    _CACHE.pop(telegram_id, None)


def exiger_profil(telegram_id: str) -> None:
    """Garde des routes de génération : profil de marque minimum, sinon 400
    {raison: profil_incomplet, message, manquants} — même forme d'objet que le
    mur de paiement pour que l'intercepteur front sache quoi en faire. Une
    erreur de lecture laisse passer (le filet `profil_incomplet` de agent_service
    reste derrière)."""
    # Après une suspension pour impayé régularisée : au moins un réseau reconnecté
    # avant de générer (lève 400 reconnexion_requise, même forme d'objet).
    from services import impaye_service
    impaye_service.exiger_reconnexion(telegram_id)
    try:
        p = _profil(telegram_id)
    except Exception as e:
        logger.warning(f"exiger_profil {telegram_id}: {e}")
        return
    if not p["fait"]:
        raise HTTPException(status_code=400, detail={
            "raison": "profil_incomplet",
            "message": "Complète ton profil de marque (secteur, voix, audience, piliers) avant de générer.",
            "manquants": p["manquants"],
        })
