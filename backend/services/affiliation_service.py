"""Programme d'affiliation.

Deux commissions, toutes deux declenchees par un paiement Stripe reel :
  - « setup »     : 25 % une seule fois, sur le Pack Fondations ;
  - « recurrent » : 10 % sur chaque facture d'abonnement, tant que le client reste.

On ne stocke que des TAUX. Le montant se calcule sur ce que Stripe a encaisse et
herite de la devise de la facture : un marche vendu en dollars produit des
commissions en dollars sans une ligne de code en plus.
"""
import base64
import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet, InvalidToken

from config import supabase, logger, JWT_SECRET

# Delai pendant lequel un clic reste attribuable. Passe ce delai sans paiement,
# l'attribution expire ; au premier paiement elle se verrouille pour toujours.
FENETRE_JOURS = 30

TAUX_SETUP_DEFAUT = 25.0
TAUX_RECURRENT_DEFAUT = 10.0


def _now():
    return datetime.now(timezone.utc)


def _iso(d):
    return d.isoformat()


# --- IBAN chiffre ------------------------------------------------------------
# Cle derivee de JWT_SECRET : pas de variable d'environnement supplementaire a
# deployer. Rotation de JWT_SECRET = IBAN illisibles, a resaisir.
def _fernet():
    cle = base64.urlsafe_b64encode(hashlib.sha256((JWT_SECRET or "postorico").encode()).digest())
    return Fernet(cle)


def chiffrer_iban(iban: str) -> str | None:
    iban = re.sub(r"\s+", "", iban or "").upper()
    if not iban:
        return None
    return "enc:v1:" + _fernet().encrypt(iban.encode()).decode()


def dechiffrer_iban(valeur: str) -> str | None:
    if not valeur or not valeur.startswith("enc:v1:"):
        return None
    try:
        return _fernet().decrypt(valeur[7:].encode()).decode()
    except InvalidToken:
        return None


def masquer_iban(valeur: str) -> str | None:
    """Ce que voit l'affilie : FR76 **** **** 1234."""
    clair = dechiffrer_iban(valeur)
    if not clair:
        return None
    return f"{clair[:4]} **** **** {clair[-4:]}" if len(clair) > 8 else "****"


# --- Code d'affiliation ------------------------------------------------------
def _code_unique(nom: str) -> str:
    base = re.sub(r"[^A-Z]", "", (nom or "").upper())[:4] or "PSTO"
    for _ in range(12):
        code = base + str(secrets.randbelow(9000) + 1000)
        if not (supabase.table("affiliates").select("id").eq("code", code)
                .limit(1).execute().data or []):
            return code
    return base + secrets.token_hex(3).upper()


# --- Demandes ----------------------------------------------------------------
def demander(nom: str, email: str, iban: str = None, telegram_id=None,
             audience: str = None) -> dict:
    """Depose une demande d'affiliation. Elle attend la validation d'un admin.

    telegram_id absent = affilie externe (influenceur, blogueur) : il n'a pas de
    compte client, seulement un lien et un tableau de bord de suivi.
    """
    email = (email or "").strip().lower()
    if not nom or not email:
        raise ValueError("nom et email requis")

    q = supabase.table("affiliates").select("id, code, statut")
    q = q.eq("telegram_id", telegram_id) if telegram_id else q.eq("email", email)
    existant = q.limit(1).execute().data or []
    if existant:
        return existant[0]

    row = {
        "telegram_id": telegram_id, "code": _code_unique(nom), "nom": nom.strip(),
        "email": email, "statut": "en_attente",
        "taux_setup": TAUX_SETUP_DEFAUT, "taux_recurrent": TAUX_RECURRENT_DEFAUT,
        "iban_chiffre": chiffrer_iban(iban), "audience": (audience or None),
    }
    return (supabase.table("affiliates").insert(row).execute().data or [{}])[0]


def par_telegram(telegram_id) -> dict | None:
    r = (supabase.table("affiliates").select("*").eq("telegram_id", telegram_id)
         .limit(1).execute().data or [])
    return r[0] if r else None


def par_code(code: str, actif_seulement: bool = True) -> dict | None:
    """Silencieux en cas de panne : un lien d'affiliation cassé doit rediriger
    vers le site, pas renvoyer une erreur au visiteur."""
    if not code:
        return None
    try:
        q = supabase.table("affiliates").select("*").eq("code", code.strip().upper())
        if actif_seulement:
            q = q.eq("statut", "actif")
        r = q.limit(1).execute().data or []
    except Exception as e:
        logger.warning(f"lecture affilié {code} impossible: {e}")
        return None
    return r[0] if r else None


# --- Clics -------------------------------------------------------------------
def enregistrer_clic(code: str, ip: str = None, user_agent: str = None,
                     referer: str = None) -> dict | None:
    """Trace le clic et renvoie l'affilie si le code est valide et actif."""
    aff = par_code(code)
    if not aff:
        return None
    try:
        supabase.table("affiliate_clicks").insert({
            "affiliate_id": aff["id"], "ip": ip,
            "user_agent": (user_agent or "")[:400], "referer": (referer or "")[:400],
        }).execute()
    except Exception as e:
        logger.warning(f"clic affiliation non enregistre: {e}")
    return aff


# --- Attribution -------------------------------------------------------------
def _ip_partagee(affiliate_id: str, ip: str) -> bool:
    """Signal de fraude : la meme IP a deja parraine plusieurs filleuls du meme
    affilie. Un parrain honnete recrute des gens sur des connexions differentes."""
    if not ip:
        return False
    autres = (supabase.table("affiliate_referrals").select("id")
              .eq("affiliate_id", affiliate_id).eq("ip", ip).execute().data or [])
    return len(autres) >= 2


def attribuer(code: str, telegram_id=None, email: str = None, ip: str = None) -> dict | None:
    """Rattache un nouveau client a un affilie. Appele a l'inscription.

    Renvoie None si le code est inconnu/inactif, s'il s'agit d'un auto-parrainage,
    ou si le client a deja un parrain (la premiere attribution gagne).
    """
    aff = par_code(code)
    if not aff:
        return None

    email = (email or "").strip().lower() or None
    if email and email == (aff.get("email") or "").lower():
        logger.info(f"affiliation: auto-parrainage refuse pour {aff['code']}")
        return None
    if telegram_id and str(telegram_id) == str(aff.get("telegram_id") or ""):
        return None

    if telegram_id and (supabase.table("affiliate_referrals").select("id")
                        .eq("telegram_id", telegram_id).limit(1).execute().data or []):
        return None

    row = {
        "affiliate_id": aff["id"], "telegram_id": telegram_id, "email": email,
        "statut": "active", "ip": ip,
        "expire_le": _iso(_now() + timedelta(days=FENETRE_JOURS)),
    }
    try:
        return (supabase.table("affiliate_referrals").insert(row).execute().data or [{}])[0]
    except Exception as e:
        logger.warning(f"attribution affiliation echouee: {e}")
        return None


def _parrain_de(telegram_id=None, email: str = None) -> dict | None:
    """Retrouve l'attribution encore valable d'un client.

    On tente d'abord par compte, puis par email : un Pack Fondations peut etre
    paye avant meme que le client ait cree son compte.
    """
    lignes = []
    if telegram_id:
        lignes = (supabase.table("affiliate_referrals").select("*")
                  .eq("telegram_id", telegram_id).limit(1).execute().data or [])
    if not lignes and email:
        lignes = (supabase.table("affiliate_referrals").select("*")
                  .eq("email", email.strip().lower()).limit(1).execute().data or [])
    if not lignes:
        return None

    ref = lignes[0]
    if ref["statut"] == "expiree":
        return None
    if ref["statut"] == "active" and ref.get("expire_le"):
        try:
            if datetime.fromisoformat(ref["expire_le"].replace("Z", "+00:00")) < _now():
                supabase.table("affiliate_referrals").update({"statut": "expiree"}) \
                    .eq("id", ref["id"]).execute()
                return None
        except ValueError:
            pass

    aff = (supabase.table("affiliates").select("*").eq("id", ref["affiliate_id"])
           .limit(1).execute().data or [])
    if not aff or aff[0]["statut"] != "actif":
        return None
    return {"referral": ref, "affiliate": aff[0]}


def _verrouiller(referral: dict):
    """Premier paiement : l'attribution ne peut plus expirer ni changer."""
    if referral.get("statut") != "verrouillee":
        supabase.table("affiliate_referrals").update(
            {"statut": "verrouillee", "verrouille_le": _iso(_now())}
        ).eq("id", referral["id"]).execute()


# --- Commissions -------------------------------------------------------------
def creer_commission(type_: str, stripe_invoice_id: str, base_cents: int, devise: str,
                     telegram_id=None, email: str = None, libelle: str = None,
                     code_force: str = None) -> dict | None:
    """Cree la commission d'une facture payee. Idempotent : rejouer le webhook ne
    duplique rien (stripe_invoice_id est unique en base).

    code_force sert au lien de paiement du Pack Fondations, ou l'admin depose le
    code de l'affilie dans la metadata de la session.
    """
    if not stripe_invoice_id or not base_cents or base_cents <= 0:
        return None

    if (supabase.table("affiliate_commissions").select("id")
            .eq("stripe_invoice_id", stripe_invoice_id).limit(1).execute().data or []):
        return None

    trouve = None
    if code_force:
        aff = par_code(code_force)
        if aff:
            trouve = {"affiliate": aff, "referral": None}
    if not trouve:
        trouve = _parrain_de(telegram_id, email)
    if not trouve:
        return None

    aff, ref = trouve["affiliate"], trouve["referral"]
    taux = float(aff.get("taux_setup" if type_ == "setup" else "taux_recurrent")
                 or (TAUX_SETUP_DEFAUT if type_ == "setup" else TAUX_RECURRENT_DEFAUT))
    montant = int(round(base_cents * taux / 100))

    fraude = bool(ref and _ip_partagee(aff["id"], ref.get("ip")))
    aujourdhui = _now().date()
    row = {
        "affiliate_id": aff["id"], "telegram_id": telegram_id,
        "filleul_email": (email or "").strip().lower() or None,
        "type": type_, "stripe_invoice_id": stripe_invoice_id, "libelle": libelle,
        "base_cents": int(base_cents), "devise": (devise or "eur").upper(),
        "taux": taux, "montant_cents": montant, "statut": "en_attente",
        "fraude": fraude, "periode": aujourdhui.replace(day=1).isoformat(),
    }
    try:
        cree = (supabase.table("affiliate_commissions").insert(row).execute().data or [{}])[0]
    except Exception as e:
        logger.warning(f"commission affiliation non creee ({stripe_invoice_id}): {e}")
        return None

    if ref:
        _verrouiller(ref)
    logger.info(f"commission {type_} {montant / 100:.2f} {row['devise']} -> {aff['code']}")
    return cree


# --- Vue affilie -------------------------------------------------------------
def _somme_par_devise(lignes, filtre=None):
    total = {}
    for c in lignes:
        if filtre and not filtre(c):
            continue
        total[c["devise"]] = total.get(c["devise"], 0) + (c["montant_cents"] or 0)
    return {d: m / 100 for d, m in total.items()}


def tableau_de_bord(affiliate_id: str) -> dict:
    coms = (supabase.table("affiliate_commissions").select("*")
            .eq("affiliate_id", affiliate_id).order("created_at", desc=True)
            .execute().data or [])
    clics = (supabase.table("affiliate_clicks").select("id", count="exact")
             .eq("affiliate_id", affiliate_id).execute())
    filleuls = (supabase.table("affiliate_referrals").select("id", count="exact")
                .eq("affiliate_id", affiliate_id).execute())
    return {
        "clics": clics.count or 0,
        "filleuls": filleuls.count or 0,
        "gains_payes": _somme_par_devise(coms, lambda c: c["statut"] == "payee"),
        "gains_en_attente": _somme_par_devise(
            coms, lambda c: c["statut"] in ("en_attente", "validee", "a_facturer")),
        "commissions": coms[:200],
    }


def releves(affiliate_id: str) -> list:
    return (supabase.table("affiliate_statements").select("*")
            .eq("affiliate_id", affiliate_id).order("periode", desc=True)
            .execute().data or [])


# --- Vue admin ---------------------------------------------------------------
def liste_affilies(statut: str = None) -> list:
    q = supabase.table("affiliates").select("*")
    if statut:
        q = q.eq("statut", statut)
    lignes = q.order("created_at", desc=True).execute().data or []
    for a in lignes:
        a["iban"] = masquer_iban(a.pop("iban_chiffre", None))
    return lignes


def decider(affiliate_id: str, statut: str, admin_id=None, motif: str = None) -> dict:
    if statut not in ("actif", "refuse", "suspendu"):
        raise ValueError("statut invalide")
    upd = {"statut": statut, "motif": motif}
    if statut == "actif":
        upd["approuve_le"] = _iso(_now())
        upd["approuve_par"] = admin_id
    return (supabase.table("affiliates").update(upd).eq("id", affiliate_id)
            .execute().data or [{}])[0]


def maj_taux(affiliate_id: str, taux_setup=None, taux_recurrent=None) -> dict:
    """Un taux negocie ne reecrit jamais l'historique : chaque commission garde
    le taux applique le jour ou elle a ete creee."""
    upd = {}
    if taux_setup is not None:
        upd["taux_setup"] = float(taux_setup)
    if taux_recurrent is not None:
        upd["taux_recurrent"] = float(taux_recurrent)
    if not upd:
        return {}
    return (supabase.table("affiliates").update(upd).eq("id", affiliate_id)
            .execute().data or [{}])[0]


def iban_clair(affiliate_id: str) -> str | None:
    """Lecture du RIB complet, pour le virement. A tracer cote route."""
    r = (supabase.table("affiliates").select("iban_chiffre").eq("id", affiliate_id)
         .limit(1).execute().data or [])
    return dechiffrer_iban(r[0].get("iban_chiffre")) if r else None


def commissions(periode: str = None, statut: str = None, affiliate_id: str = None) -> list:
    """periode = 'AAAA-MM' : c'est le filtre mois par mois du back-office."""
    q = supabase.table("affiliate_commissions").select("*")
    if statut:
        q = q.eq("statut", statut)
    if affiliate_id:
        q = q.eq("affiliate_id", affiliate_id)
    if periode:
        q = q.eq("periode", f"{periode}-01")
    lignes = q.order("created_at", desc=True).execute().data or []

    noms = {a["id"]: a for a in (supabase.table("affiliates").select("id, code, nom, email")
                                 .execute().data or [])}
    for c in lignes:
        a = noms.get(c["affiliate_id"], {})
        c["affilie_code"], c["affilie_nom"] = a.get("code"), a.get("nom")
    return lignes


def resume_mois(periode: str) -> list:
    """Qui a vendu ce mois-la, et pour combien. Une ligne par affilie et devise."""
    lignes = commissions(periode=periode)
    par = {}
    for c in lignes:
        if c["statut"] == "annulee":
            continue
        cle = (c["affiliate_id"], c["devise"])
        e = par.setdefault(cle, {"affilie_code": c.get("affilie_code"),
                                 "affilie_nom": c.get("affilie_nom"),
                                 "devise": c["devise"], "nb": 0,
                                 "montant": 0.0, "ca": 0.0, "setup": 0, "recurrent": 0})
        e["nb"] += 1
        e["montant"] += (c["montant_cents"] or 0) / 100
        e["ca"] += (c["base_cents"] or 0) / 100
        e[c["type"]] = e.get(c["type"], 0) + 1
    return sorted(par.values(), key=lambda x: -x["montant"])


def valider(commission_id: str) -> dict:
    return (supabase.table("affiliate_commissions")
            .update({"statut": "validee", "validee_le": _iso(_now())})
            .eq("id", commission_id).eq("statut", "en_attente").execute().data or [{}])[0]


def annuler(commission_id: str) -> dict:
    return (supabase.table("affiliate_commissions").update({"statut": "annulee"})
            .eq("id", commission_id).execute().data or [{}])[0]


def traitement_mensuel(periode: str) -> list:
    """Regroupe les commissions validees du mois par affilie ET par devise, cree
    un releve, et renvoie de quoi envoyer les emails (la route s'en charge).

    L'affilie envoie ensuite sa facture ; le virement se fait hors plateforme.
    """
    lignes = commissions(periode=periode, statut="validee")
    if not lignes:
        return []

    affilies = {a["id"]: a for a in (supabase.table("affiliates").select("*")
                                     .execute().data or [])}
    envois, groupes = [], {}
    for c in lignes:
        groupes.setdefault((c["affiliate_id"], c["devise"]), []).append(c)

    for (aid, devise), coms in groupes.items():
        total = sum(c["montant_cents"] or 0 for c in coms)
        releve = (supabase.table("affiliate_statements").upsert({
            "affiliate_id": aid, "periode": f"{periode}-01", "devise": devise,
            "montant_cents": total, "nb": len(coms), "statut": "a_facturer",
        }, on_conflict="affiliate_id,periode,devise").execute().data or [{}])[0]

        for c in coms:
            supabase.table("affiliate_commissions").update(
                {"statut": "a_facturer", "releve_id": releve.get("id")}
            ).eq("id", c["id"]).execute()

        a = affilies.get(aid, {})
        envois.append({"email": a.get("email"), "nom": a.get("nom"), "periode": periode,
                       "montant": total / 100, "devise": devise, "nb": len(coms)})
    return envois


def marquer_paye(releve_id: str) -> dict:
    """Virement effectue : le releve et toutes ses commissions passent a payee."""
    maintenant = _iso(_now())
    supabase.table("affiliate_commissions").update({"statut": "payee", "payee_le": maintenant}) \
        .eq("releve_id", releve_id).execute()
    return (supabase.table("affiliate_statements")
            .update({"statut": "payee", "payee_le": maintenant})
            .eq("id", releve_id).execute().data or [{}])[0]


def tous_releves(periode: str = None) -> list:
    q = supabase.table("affiliate_statements").select("*")
    if periode:
        q = q.eq("periode", f"{periode}-01")
    lignes = q.order("periode", desc=True).execute().data or []
    noms = {a["id"]: a for a in (supabase.table("affiliates").select("id, code, nom, email")
                                 .execute().data or [])}
    for r in lignes:
        a = noms.get(r["affiliate_id"], {})
        r["affilie_code"] = a.get("code")
        r["affilie_nom"] = a.get("nom")
        r["affilie_email"] = a.get("email")
    return lignes
