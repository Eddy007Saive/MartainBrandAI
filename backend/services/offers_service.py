"""Couche « offres » : ce que le client vend (produit / service / offre).

Sert à ancrer la génération de contenu sur des faits RÉELS (prix, bénéfices,
caractéristiques) pour que Claude ne les invente jamais. Générique multi-secteurs :
une offre peut être un produit physique, un service (ex. Gestion Airbnb), une
formation, etc.
"""
import cloudinary
import cloudinary.uploader
from config import (supabase, logger,
                    CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)

cloudinary.config(cloud_name=CLOUDINARY_CLOUD_NAME, api_key=CLOUDINARY_API_KEY, api_secret=CLOUDINARY_API_SECRET)

TYPES = ("product", "service", "offer")
CHAMPS = ("name", "type", "description", "price", "benefits", "url", "facts", "actif")
ROLES = ("face", "back", "worn", "detail", "lifestyle", "other")


def _clean(body: dict) -> dict:
    """Ne garde que les champs connus ; normalise le type et actif."""
    row = {k: body[k] for k in CHAMPS if k in body}
    if "type" in row and row["type"] not in TYPES:
        row["type"] = "service"
    if "name" in row:
        row["name"] = (row["name"] or "").strip()[:200]
    return row


def lister(telegram_id: str, actives_seulement: bool = False) -> list:
    q = (supabase.table("offers").select("*")
         .eq("telegram_id", telegram_id).order("created_at", desc=False))
    if actives_seulement:
        q = q.eq("actif", True)
    return q.execute().data or []


def creer(telegram_id: str, body: dict) -> dict:
    row = _clean(body)
    if not row.get("name"):
        raise ValueError("name requis")
    row["telegram_id"] = telegram_id
    row.setdefault("type", "service")
    ins = supabase.table("offers").insert(row).execute()
    return ins.data[0] if ins.data else {}


def modifier(telegram_id: str, offer_id: str, body: dict) -> dict:
    row = _clean(body)
    if not row:
        return {}
    upd = (supabase.table("offers").update(row)
           .eq("id", offer_id).eq("telegram_id", telegram_id).execute())
    return upd.data[0] if upd.data else {}


def supprimer(telegram_id: str, offer_id: str) -> None:
    supabase.table("offers").delete().eq("id", offer_id).eq("telegram_id", telegram_id).execute()


def noms_offres(telegram_id: str, limite: int = 20) -> str:
    """Liste COURTE des offres actives (nom + type), pour la génération de sujets.
    Léger en tokens : juste de quoi proposer des sujets commerciaux pertinents."""
    try:
        offres = lister(telegram_id, actives_seulement=True)[:limite]
    except Exception:
        return ""
    if not offres:
        return ""
    return "\n".join(f"- {o.get('name')} ({o.get('type') or 'offre'})" for o in offres)


def _fmt_offre(o: dict) -> str:
    """Formate UNE offre en bloc de faits (nom, prix, desc, bénéfices, url)."""
    parts = [f"- {o.get('name')}"]
    if o.get("type"):
        parts.append(f"({o['type']})")
    if o.get("price"):
        parts.append(f"— prix : {o['price']}")
    tete = " ".join(parts)
    details = []
    if o.get("description"):
        details.append(f"  desc : {o['description']}")
    if o.get("benefits"):
        b = " / ".join(x.strip() for x in str(o["benefits"]).splitlines() if x.strip())
        if b:
            details.append(f"  bénéfices : {b}")
    if isinstance(o.get("facts"), dict) and o["facts"]:
        f = ", ".join(f"{k}: {v}" for k, v in o["facts"].items() if v)
        if f:
            details.append(f"  faits : {f}")
    if o.get("url"):
        details.append(f"  url : {o['url']}")
    return tete + ("\n" + "\n".join(details) if details else "")


def noms(telegram_id: str) -> list:
    """Noms des offres actives (pour valider une dimension « offre »)."""
    try:
        return [o.get("name") for o in lister(telegram_id, actives_seulement=True) if o.get("name")]
    except Exception:
        return []


def faits_offre(telegram_id: str, nom: str) -> str:
    """Bloc de faits d'UNE offre nommée (envoi ciblé, pas toutes les offres)."""
    nom = (nom or "").strip()
    if not nom:
        return ""
    try:
        offres = lister(telegram_id, actives_seulement=True)
    except Exception:
        return ""
    o = next((x for x in offres if (x.get("name") or "").strip() == nom), None)
    if not o:
        return ""
    return (
        "\n\n## OFFRE CONCERNÉE PAR CE CONTENU (source de vérité)\n"
        "Mets cette offre en avant. N'invente JAMAIS un prix ou une caractéristique "
        "qui n'est pas listé ici.\n" + _fmt_offre(o)
    )


def contexte_offres(telegram_id: str, limite: int = 12) -> str:
    """Bloc « OFFRES » injecté dans le contexte de marque : la liste des offres
    actives + leurs faits fiables. Claude s'en sert pour ancrer le contenu et ne
    doit citer AUCUN prix/caractéristique hors de ces faits.

    Vide si le client n'a renseigné aucune offre (comportement inchangé)."""
    try:
        offres = lister(telegram_id, actives_seulement=True)[:limite]
    except Exception as e:
        logger.warning(f"contexte_offres {telegram_id}: {e}")
        return ""
    if not offres:
        return ""
    lignes = []
    for o in offres:
        parts = [f"- {o.get('name')}"]
        if o.get("type"):
            parts.append(f"({o['type']})")
        if o.get("price"):
            parts.append(f"— prix : {o['price']}")
        tete = " ".join(parts)
        details = []
        if o.get("description"):
            details.append(f"  desc : {o['description']}")
        if o.get("benefits"):
            b = " / ".join(x.strip() for x in str(o["benefits"]).splitlines() if x.strip())
            if b:
                details.append(f"  bénéfices : {b}")
        if isinstance(o.get("facts"), dict) and o["facts"]:
            f = ", ".join(f"{k}: {v}" for k, v in o["facts"].items() if v)
            if f:
                details.append(f"  faits : {f}")
        if o.get("url"):
            details.append(f"  url : {o['url']}")
        lignes.append(tete + ("\n" + "\n".join(details) if details else ""))
    return (
        "\n\n## OFFRES / PRODUITS DU CLIENT (source de vérité)\n"
        "Voici ce que le client vend. Sers-t'en pour ancrer le contenu. "
        "N'invente JAMAIS un prix, une caractéristique ou un chiffre qui n'est pas listé ici ; "
        "si une info manque, reste qualitatif ou laisse un placeholder.\n"
        + "\n".join(lignes)
    )


# ---------------------------------------------------------------------------
# Product Vision Agent : photos d'une offre + leur analyse (offer_assets / offer_analysis)
# ---------------------------------------------------------------------------

def _offre(telegram_id: str, offer_id: str) -> dict | None:
    r = (supabase.table("offers").select("id, name, type, description")
         .eq("id", offer_id).eq("telegram_id", telegram_id).limit(1).execute())
    return r.data[0] if r.data else None


def _contexte_offre(o: dict) -> str:
    """Petit brief textuel de l'offre pour cadrer l'analyse vision."""
    parts = [f"Offer: {o.get('name')}"]
    if o.get("type"):
        parts.append(f"(type: {o['type']})")
    if o.get("description"):
        parts.append(f"— {o['description']}")
    return " ".join(parts)


def ajouter_asset(telegram_id: str, offer_id: str, file_bytes: bytes, role: str = "other") -> dict:
    """Upload une photo d'offre (Cloudinary), l'analyse UNE fois (vision), stocke les deux."""
    offre = _offre(telegram_id, offer_id)
    if not offre:
        raise ValueError("offre introuvable")
    if role not in ROLES:
        role = "other"
    up = cloudinary.uploader.upload(
        file_bytes, resource_type="image",
        folder=f"offers/{telegram_id}/{offer_id}", invalidate=True,
    )
    row = {
        "offer_id": offer_id, "telegram_id": telegram_id,
        "url": up["secure_url"], "public_id": up.get("public_id"),
        "role": role, "width": up.get("width"), "height": up.get("height"),
    }
    ins = supabase.table("offer_assets").insert(row).execute()
    asset = ins.data[0] if ins.data else row

    # Analyse vision immédiate (une seule fois) — soft-fail : l'asset reste utilisable sans.
    analysis = None
    try:
        from services import vision_service
        res = vision_service.analyser(asset["url"], telegram_id, contexte=_contexte_offre(offre))
        if res.get("analysis") and asset.get("id"):
            a = (supabase.table("offer_analysis").insert({
                "offer_id": offer_id, "asset_id": asset["id"], "telegram_id": telegram_id,
                "analysis": res["analysis"], "model": res.get("model"),
            }).execute())
            analysis = a.data[0]["analysis"] if a.data else res["analysis"]
    except Exception as e:
        logger.warning(f"ajouter_asset analyse échouée: {e}")

    return {"asset": asset, "analysis": analysis}


def lister_assets(telegram_id: str, offer_id: str) -> list:
    """Photos d'une offre avec, pour chacune, son analyse (si disponible)."""
    assets = (supabase.table("offer_assets").select("*")
              .eq("telegram_id", telegram_id).eq("offer_id", offer_id)
              .order("created_at", desc=False).execute()).data or []
    if not assets:
        return []
    ana = (supabase.table("offer_analysis").select("asset_id, analysis")
           .eq("telegram_id", telegram_id).eq("offer_id", offer_id).execute()).data or []
    par_asset = {a["asset_id"]: a["analysis"] for a in ana}
    for a in assets:
        a["analysis"] = par_asset.get(a["id"])
    return assets


def supprimer_asset(telegram_id: str, asset_id: str) -> None:
    """Supprime une photo (Cloudinary + lignes ; l'analyse tombe en cascade)."""
    r = (supabase.table("offer_assets").select("public_id")
         .eq("id", asset_id).eq("telegram_id", telegram_id).limit(1).execute())
    if not r.data:
        return
    pid = r.data[0].get("public_id")
    if pid:
        try:
            cloudinary.uploader.destroy(pid, resource_type="image", invalidate=True)
        except Exception as e:
            logger.warning(f"supprimer_asset Cloudinary ({pid}): {e}")
    supabase.table("offer_assets").delete().eq("id", asset_id).eq("telegram_id", telegram_id).execute()
