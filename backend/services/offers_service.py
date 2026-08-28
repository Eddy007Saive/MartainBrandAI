"""Couche « offres » : ce que le client vend (produit / service / offre).

Sert à ancrer la génération de contenu sur des faits RÉELS (prix, bénéfices,
caractéristiques) pour que Claude ne les invente jamais. Générique multi-secteurs :
une offre peut être un produit physique, un service (ex. Gestion Airbnb), une
formation, etc.
"""
from config import supabase
import logging

logger = logging.getLogger("offers")

TYPES = ("product", "service", "offer")
CHAMPS = ("name", "type", "description", "price", "benefits", "url", "facts", "actif")


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
