# -*- coding: utf-8 -*-
"""
Fiche de marque (table `marques`).

Depuis la normalisation du 14/08/2026, tout ce qui décrit la MARQUE — voix,
piliers, exemples par réseau, palette, réglages carrousel — vit ici et non plus
dans `users`, qui ne garde que le compte (identifiants, facturation, préférences).

La contrainte UNIQUE(telegram_id) fige le 1-1 actuel ; la retirer suffira pour
ouvrir le multi-marques par compte.

Transition : les colonnes d'origine de `users` sont encore tenues à jour en
miroir (rollback immédiat possible) mais ne sont plus lues.
"""
from config import supabase, logger

# Les 24 champs déplacés. Sert à la fois à lire, à écrire et à router les
# mises à jour envoyées par la page Paramètres.
CHAMPS = (
    "secteur", "voix_marque", "audience", "piliers", "a_eviter", "hooks", "ctas", "regles",
    "exemples_linkedin", "exemples_instagram", "exemples_facebook", "exemples_tiktok",
    "exemples_googlebusiness", "exemples_twitter",
    "couleur_principale", "couleur_secondaire", "couleur_accent", "logo_url",
    "carrousel_couleur_principale", "carrousel_couleur_secondaire", "carrousel_couleur_accent",
    "carrousel_font", "carrousel_font_corps", "carrousel_templates_exclusifs",
    "use_inspirations",
)

_DEFAUTS = {
    "couleur_principale": "#003D2E",
    "couleur_secondaire": "#0077FF",
    "couleur_accent": "#3AFFA3",
    "use_inspirations": True,
}


def fiche(telegram_id: str) -> dict:
    """La fiche de marque, ou les valeurs par défaut si elle n'existe pas encore.

    ATTENTION : une ERREUR de lecture (connexion, timeout) ne doit JAMAIS renvoyer
    une fiche vide. Sinon l'écran affiche une marque « effacée » alors que la base
    est intacte — et si l'utilisateur sauvegarde par-dessus, il écrase ses vraies
    données par du vide (incident du 26/08). On distingue donc :
      - lecture réussie SANS ligne  -> valeurs par défaut (fiche jamais créée),
      - lecture réussie AVEC ligne  -> la fiche,
      - erreur de lecture           -> on la laisse remonter (l'appelant garde
                                       l'état précédent plutôt que d'effacer).
    """
    r = (supabase.table("marques").select(",".join(CHAMPS))
         .eq("telegram_id", telegram_id).limit(1).execute())
    if r.data:
        return {k: r.data[0].get(k) for k in CHAMPS}
    return {k: _DEFAUTS.get(k) for k in CHAMPS}


def creer(telegram_id: str, valeurs: dict = None) -> bool:
    """Crée la fiche à l'inscription (idempotent)."""
    row = {"telegram_id": telegram_id, **_DEFAUTS}
    row.update({k: v for k, v in (valeurs or {}).items() if k in CHAMPS})
    try:
        supabase.table("marques").upsert(row, on_conflict="telegram_id").execute()
        return True
    except Exception as e:
        logger.error(f"création marque {telegram_id}: {e}")
        return False


def enregistrer(telegram_id: str, valeurs: dict) -> dict:
    """Écrit les champs de marque présents dans `valeurs`. Retourne ce qui a été écrit."""
    a_ecrire = {k: v for k, v in (valeurs or {}).items() if k in CHAMPS}
    if not a_ecrire:
        return {}
    try:
        supabase.table("marques").upsert(
            {"telegram_id": telegram_id, **a_ecrire}, on_conflict="telegram_id").execute()
    except Exception as e:
        logger.error(f"écriture marque {telegram_id}: {e}")
        return {}
    return a_ecrire


def separer(donnees: dict) -> tuple:
    """Découpe une mise à jour de profil en (champs du compte, champs de marque)."""
    marque = {k: v for k, v in (donnees or {}).items() if k in CHAMPS}
    compte = {k: v for k, v in (donnees or {}).items() if k not in CHAMPS}
    return compte, marque
