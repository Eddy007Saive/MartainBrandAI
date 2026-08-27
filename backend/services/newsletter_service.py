# -*- coding: utf-8 -*-
"""
Newsletter hebdomadaire « La lettre de Rico ».

Cycle complet, sans intervention :
  1. VEILLE   — Claude cherche sur le web (outil de recherche natif de l'API)
                ce qui a bougé cette semaine sur les réseaux sociaux.
  2. REDACTION— Claude écrit la lettre, toujours à la voix de Rico (JSON structuré).
  3. VALIDATION — Martin reçoit la lettre par email avec deux boutons :
                « Envoyer aux abonnes » / « Ne pas envoyer ». Rien ne part sans ce clic.
  4. ENVOI    — a la validation, envoi a tous les abonnes actifs (Resend), en tache
                de fond, avec un lien de desinscription personnel dans chaque email.

Les abonnes sont synchronises depuis les clients (users) et les leads de l'audit
de marque (brand_audits) ; une desinscription est definitive (jamais re-ajoutee).
"""
import asyncio
import html as _html
import json
import re
from datetime import datetime, timezone, timedelta

from config import supabase, logger, BACKEND_URL, FRONTEND_URL, ADMIN_NOTIF_EMAIL
from services.agent_service import _messages_create
from services import mail_service

# Recherche web : le modele lit le web au moment de la veille (pas de cle tierce).
# `web_search_20260209` (filtrage dynamique) exige Opus/Sonnet recents — d'ou Opus 5,
# appele une fois par semaine : la qualite prime sur le cout a cette frequence.
_MODEL = "claude-opus-5"
_WEB_SEARCH = {"type": "web_search_20260209", "name": "web_search"}

_MOIS = ("janvier", "février", "mars", "avril", "mai", "juin", "juillet",
         "août", "septembre", "octobre", "novembre", "décembre")


def _date_fr(d: datetime) -> str:
    return f"{d.day} {_MOIS[d.month - 1]} {d.year}"


# ----------------------------------------------------------------- 1. Veille
_ROLE_VEILLE = (
    "Tu es le veilleur de Postorico, un logiciel qui pilote la présence sociale des "
    "entrepreneurs et des PME. Ta mission : repérer ce qui a RÉELLEMENT bougé ces 7 derniers "
    "jours sur les réseaux sociaux (LinkedIn, Instagram, TikTok, YouTube, Facebook, X).\n"
    "Fais plusieurs recherches web ciblées et ne retiens que :\n"
    "- les nouveautés produit et changements d'algorithme annoncés par les plateformes\n"
    "- les évolutions de formats (durées, ratios, fonctionnalités) et ce qui performe\n"
    "- les bonnes pratiques et stratégies documentées par des sources sérieuses\n"
    "- les chiffres et études récents, avec leur source\n"
    "Ignore les rumeurs, le sensationnalisme et tout ce qui date de plus d'un mois.\n"
    "Rends un compte rendu factuel et dense, en français, organisé par réseau, chaque "
    "information suivie de sa source entre parenthèses. Pas d'introduction, pas de "
    "conclusion : uniquement la matière brute.\n"
    "Écris un français typographiquement irréprochable : tous les accents (é, è, ê, à, ç, ô, ù), "
    "les majuscules accentuées et les apostrophes. Un texte sans accents est un texte fautif."
)


def _veille() -> dict:
    """Recherche web via l'outil natif de l'API. Retourne {texte, sources}."""
    aujourdhui = datetime.now(timezone.utc)
    debut = aujourdhui - timedelta(days=7)
    question = (
        f"Nous sommes le {_date_fr(aujourdhui)}. Fais la veille des reseaux sociaux "
        f"pour la semaine du {_date_fr(debut)} au {_date_fr(aujourdhui)}. "
        "Cible : entrepreneurs, artisans, PME et independants qui publient eux-memes."
    )
    messages = [{"role": "user", "content": question}]
    textes, sources, vus = [], [], set()
    for _ in range(4):                      # au plus 4 relances (pause_turn)
        resp = _messages_create(
            model=_MODEL, max_tokens=16000,
            output_config={"effort": "medium"},
            system=_ROLE_VEILLE,
            tools=[_WEB_SEARCH],
            messages=messages,
        )
        if resp.stop_reason == "refusal":
            raise RuntimeError("veille refusee par le modele")
        for b in resp.content:
            if b.type == "text" and (b.text or "").strip():
                textes.append(b.text)
            elif b.type == "web_search_tool_result":
                res = getattr(b, "content", None)
                # succes = liste de resultats ; erreur = objet unique -> ignore
                for r in (res if isinstance(res, list) else []):
                    url = getattr(r, "url", None)
                    if url and url not in vus:
                        vus.add(url)
                        sources.append({"url": url, "titre": (getattr(r, "title", "") or "")[:160]})
        if resp.stop_reason != "pause_turn":
            break
        messages = messages + [{"role": "assistant", "content": resp.content}]
    return {"texte": "\n\n".join(textes).strip(), "sources": sources[:14]}


# -------------------------------------------------------------- 2. Redaction
_ROLE_RICO = (
    "Tu es RICO, la voix de Postorico. Tu écris chaque semaine à des entrepreneurs, "
    "artisans, commerçants et indépendants francophones qui gèrent eux-mêmes leur "
    "présence sur les réseaux — ils n'ont ni agence ni temps à perdre.\n"
    "Ta voix : directe, chaleureuse, concrète. Tu tutoies. Tu parles comme un ami qui "
    "connaît le sujet, jamais comme un consultant. Zéro jargon marketing, zéro "
    "superlatif creux, aucun emoji. Des phrases courtes.\n"
    "Ta règle d'or : chaque paragraphe doit apprendre quelque chose d'utilisable cette "
    "semaine. Si une information ne change rien pour le lecteur, tu la coupes.\n"
    "Tu ne vends jamais Postorico frontalement : tu aides, et l'outil se devine.\n"
    "TYPOGRAPHIE — non négociable : français impeccable, tous les accents (é, è, ê, à, ç, ô, û), "
    "majuscules accentuées comprises, apostrophes courbes ’, espaces insécables avant : ; ! ?, "
    "guillemets français « ». Un texte sans accents est un texte fautif : relis-toi avant de rendre."
)

_SCHEMA_LETTRE = {
    "type": "object",
    "properties": {
        "sujet": {"type": "string", "description": "Objet de l'email, 5 à 9 mots, donne envie d'ouvrir, sans point final, accents inclus"},
        "preheader": {"type": "string", "description": "Texte de prévisualisation, 8 à 14 mots, complète l'objet sans le répéter"},
        "titre": {"type": "string", "description": "Titre de la lettre, 4 à 8 mots"},
        "edito": {"type": "string", "description": "L'accroche de Rico, 2 à 3 phrases, pose le sujet de la semaine"},
        "sections": {
            "type": "array",
            "description": "2 à 3 sujets de fond : bonnes pratiques, stratégie, format par réseau",
            "items": {
                "type": "object",
                "properties": {
                    "titre": {"type": "string", "description": "3 à 7 mots"},
                    "corps": {"type": "string", "description": "2 à 4 phrases, concret et applicable"},
                    "astuce": {"type": "string", "description": "Le geste précis à faire, une phrase"},
                },
                "required": ["titre", "corps", "astuce"],
                "additionalProperties": False,
            },
        },
        "actus": {
            "type": "array",
            "description": "2 à 4 nouveautés de la semaine, tirées de la veille, avec leur source",
            "items": {
                "type": "object",
                "properties": {
                    "reseau": {"type": "string", "description": "LinkedIn, Instagram, TikTok, YouTube, Facebook ou X"},
                    "titre": {"type": "string", "description": "4 à 8 mots"},
                    "resume": {"type": "string", "description": "1 à 2 phrases : ce que ça change concrètement"},
                    "source": {"type": "string", "description": "URL exacte issue de la veille, ou chaîne vide"},
                },
                "required": ["reseau", "titre", "resume", "source"],
                "additionalProperties": False,
            },
        },
        "action": {"type": "string", "description": "L'unique action à faire cette semaine, une phrase impérative"},
        "signature": {"type": "string", "description": "Une phrase de fin, chaleureuse, signée Rico (sans répéter « Rico »)"},
    },
    "required": ["sujet", "preheader", "titre", "edito", "sections", "actus", "action", "signature"],
    "additionalProperties": False,
}


def _rediger(veille: dict, numero: int) -> dict:
    """Claude ecrit la lettre a la voix de Rico. Sortie JSON validee par schema."""
    consigne = (
        f"Voici la veille des réseaux sociaux de la semaine (numéro {numero} de la lettre, "
        f"nous sommes le {_date_fr(datetime.now(timezone.utc))}) :\n\n"
        f"{veille['texte'][:14000]}\n\n"
        "Écris la lettre de cette semaine. Contraintes :\n"
        "- 2 à 3 sections de fond (bonnes pratiques, stratégie, formats par réseau)\n"
        "- 2 à 4 actus tirées STRICTEMENT de la veille ci-dessus (n'invente aucune information, "
        "aucune date, aucun chiffre) ; recopie l'URL source exacte quand elle existe\n"
        "- une seule action à faire cette semaine, réalisable en moins de 30 minutes\n"
        "- si la veille est pauvre sur un réseau, ne parle pas de ce réseau\n"
        "- accentuation parfaite : aucun mot français ne doit perdre ses accents."
    )
    resp = _messages_create(
        model=_MODEL, max_tokens=8000,
        output_config={"effort": "medium",
                       "format": {"type": "json_schema", "schema": _SCHEMA_LETTRE}},
        system=_ROLE_RICO,
        messages=[{"role": "user", "content": consigne}],
    )
    if resp.stop_reason == "refusal":
        raise RuntimeError("redaction refusee par le modele")
    brut = next((b.text for b in resp.content if b.type == "text"), "")
    data = json.loads(brut)
    data["numero"] = numero
    data["date"] = _date_fr(datetime.now(timezone.utc))
    return data


# ------------------------------------------------------------------ 3. Rendu
_ACCENT = "#3AFFA3"
_G1, _G2 = "#5B6CFF", "#8A6CFF"
_LOGO = "https://res.cloudinary.com/dy9gp5pim/image/upload/brand/postorico-logo.png"
_HERO = "https://res.cloudinary.com/dy9gp5pim/image/upload/brand/newsletter-hero.jpg"
_COULEUR_RESEAU = {
    "linkedin": "#0A66C2", "instagram": "#E1306C", "tiktok": "#00F2EA",
    "youtube": "#FF0000", "facebook": "#1877F2", "x": "#e2e8f0", "twitter": "#e2e8f0",
}


def _e(t) -> str:
    return _html.escape(str(t or "")).replace("\n", "<br>")


def _lien_desinscription(token: str) -> str:
    return f"{BACKEND_URL}/api/newsletter/desinscription?token={token}"


def rendu_html(data: dict, unsub_url: str = "#", apercu_url: str = "") -> str:
    """La lettre en HTML email (tables + styles inline : compatible tous clients)."""
    sections = "".join(f"""
      <tr><td style="padding:0 34px 26px;">
        <h2 style="margin:0 0 10px;color:#ffffff;font-size:18px;font-weight:bold;line-height:1.35;">{_e(s.get('titre'))}</h2>
        <p style="margin:0 0 14px;color:#c3ccdb;font-size:15px;line-height:1.65;">{_e(s.get('corps'))}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background:rgba(58,255,163,0.07);border-left:3px solid {_ACCENT};padding:12px 16px;">
            <span style="color:{_ACCENT};font-size:11px;font-weight:bold;letter-spacing:.12em;text-transform:uppercase;">Le geste</span><br>
            <span style="color:#e2e8f0;font-size:14px;line-height:1.6;">{_e(s.get('astuce'))}</span>
          </td>
        </tr></table>
      </td></tr>""" for s in (data.get("sections") or []))

    actus = ""
    for a in (data.get("actus") or []):
        reseau = str(a.get("reseau") or "")
        couleur = _COULEUR_RESEAU.get(reseau.lower().strip(), "#94a3b8")
        src = str(a.get("source") or "").strip()
        lien = (f'<a href="{_html.escape(src, quote=True)}" target="_blank" '
                f'style="color:#8A6CFF;font-size:12px;text-decoration:underline;">Lire la source</a>') if src.startswith("http") else ""
        actus += f"""
          <tr><td style="padding:0 0 18px;">
            <span style="display:inline-block;background:{couleur}1f;color:{couleur};font-size:11px;font-weight:bold;
                         padding:3px 10px;border-radius:99px;letter-spacing:.04em;">{_e(reseau)}</span>
            <div style="color:#ffffff;font-size:15px;font-weight:bold;margin:8px 0 4px;">{_e(a.get('titre'))}</div>
            <div style="color:#a8b3c5;font-size:14px;line-height:1.6;">{_e(a.get('resume'))}</div>
            <div style="margin-top:6px;">{lien}</div>
          </td></tr>"""
    bloc_actus = f"""
      <tr><td style="padding:6px 34px 8px;">
        <div style="height:1px;background:rgba(255,255,255,0.08);margin-bottom:24px;"></div>
        <h2 style="margin:0 0 18px;color:#ffffff;font-size:18px;font-weight:bold;">Ce qui a bougé cette semaine</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">{actus}</table>
      </td></tr>""" if actus else ""

    voir_en_ligne = (f'<a href="{_html.escape(apercu_url, quote=True)}" target="_blank" '
                     f'style="color:#64748b;text-decoration:underline;">Lire dans le navigateur</a> · ') if apercu_url else ""

    return f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{_e(data.get('sujet'))}</title></head>
<body style="margin:0;padding:0;background:#020617;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{_e(data.get('preheader'))}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#020617;padding:28px 14px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:600px;background:#0f172a;border:1px solid rgba(255,255,255,0.07);border-radius:18px;overflow:hidden;">

        <!-- En-tete -->
        <tr><td style="padding:30px 34px 6px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
            <td>
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="background:#ffffff;border-radius:11px;padding:6px;line-height:0;">
                  <img src="{_LOGO}" width="34" height="34" alt="Postorico" style="display:block;width:34px;height:34px;border:0;">
                </td>
                <td style="padding-left:11px;color:#ffffff;font-size:17px;font-weight:bold;letter-spacing:-.01em;">Postorico</td>
              </tr></table>
            </td>
            <td align="right" style="color:#64748b;font-size:11.5px;">
              N°{_e(data.get('numero'))} · {_e(data.get('date'))}
            </td>
          </tr></table>
        </td></tr>

        <!-- Bandeau Rico -->
        <tr><td style="padding:16px 0 0;line-height:0;">
          <img src="{_HERO}" width="600" alt="Postorico" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
        </td></tr>

        <!-- Titre + edito -->
        <tr><td style="padding:22px 34px 4px;">
          <span style="display:inline-block;color:{_ACCENT};font-size:11px;font-weight:bold;letter-spacing:.18em;text-transform:uppercase;">La lettre de Rico</span>
          <h1 style="margin:10px 0 14px;color:#ffffff;font-size:27px;line-height:1.25;font-weight:bold;letter-spacing:-.02em;">{_e(data.get('titre'))}</h1>
          <p style="margin:0 0 26px;color:#c3ccdb;font-size:15.5px;line-height:1.7;">{_e(data.get('edito'))}</p>
        </td></tr>

        {sections}
        {bloc_actus}

        <!-- Action de la semaine -->
        <tr><td style="padding:10px 34px 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="background:linear-gradient(135deg,{_G1},{_G2});border-radius:14px;">
            <tr><td style="padding:22px 24px;">
              <span style="color:rgba(255,255,255,0.72);font-size:11px;font-weight:bold;letter-spacing:.16em;text-transform:uppercase;">Ton action de la semaine</span>
              <div style="color:#ffffff;font-size:16.5px;line-height:1.55;font-weight:bold;margin-top:9px;">{_e(data.get('action'))}</div>
            </td></tr>
          </table>
        </td></tr>

        <!-- Signature -->
        <tr><td style="padding:0 34px 30px;">
          <p style="margin:0 0 6px;color:#c3ccdb;font-size:15px;line-height:1.65;">{_e(data.get('signature'))}</p>
          <p style="margin:0;color:#ffffff;font-size:15px;font-weight:bold;">Rico</p>
          <p style="margin:2px 0 0;color:#64748b;font-size:12.5px;">Postorico — ta présence sociale, pilotée par l'IA</p>
        </td></tr>

        <!-- Pied -->
        <tr><td style="padding:20px 34px 26px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0 0 8px;color:#64748b;font-size:11.5px;line-height:1.6;">
            Une question, un sujet à traiter&nbsp;? Réponds simplement à cet email, Rico lit tout.
          </p>
          <p style="margin:0;color:#475569;font-size:11px;">
            {voir_en_ligne}<a href="{_html.escape(unsub_url, quote=True)}" target="_blank" style="color:#475569;text-decoration:underline;">Se désinscrire</a>
            · © {datetime.now(timezone.utc).year} Postorico
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


# --------------------------------------------------------------- 4. Abonnes
def sync_abonnes() -> int:
    """Ajoute les nouveaux emails (clients + leads d'audit). Ne ressuscite JAMAIS
    une desinscription : l'index unique sur lower(email) protege des doublons."""
    try:
        connus = {(a["email"] or "").lower()
                  for a in (supabase.table("newsletter_abonnes").select("email").execute().data or [])}
        candidats: dict[str, dict] = {}
        for row in (supabase.table("users").select("email, nom").execute().data or []):
            e = (row.get("email") or "").strip()
            if e and "@" in e and e.lower() not in connus:
                candidats[e.lower()] = {"email": e, "nom": row.get("nom"), "source": "app"}
        for row in (supabase.table("brand_audits").select("email, marque").execute().data or []):
            e = (row.get("email") or "").strip()
            if e and "@" in e and e.lower() not in connus and e.lower() not in candidats:
                candidats[e.lower()] = {"email": e, "nom": row.get("marque"), "source": "audit"}
        if candidats:
            supabase.table("newsletter_abonnes").insert(list(candidats.values())).execute()
        return len(candidats)
    except Exception as e:
        logger.error(f"newsletter sync abonnes: {e}")
        return 0


def abonner(email: str, nom: str = None, source: str = "site") -> dict:
    """Inscription publique. Une desinscription passee est respectee (pas de reactivation
    silencieuse) : on renvoie simplement 'ok' sans rien changer."""
    email = (email or "").strip()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$", email):
        return {"error": "Email invalide."}
    try:
        ex = (supabase.table("newsletter_abonnes").select("id, statut")
              .ilike("email", email).limit(1).execute())
        if ex.data:
            return {"ok": True, "deja": True}
        supabase.table("newsletter_abonnes").insert(
            {"email": email, "nom": (nom or None), "source": source}).execute()
        return {"ok": True}
    except Exception as e:
        logger.error(f"newsletter abonner: {e}")
        return {"error": "Inscription impossible."}


def desabonner(token: str) -> dict:
    try:
        r = (supabase.table("newsletter_abonnes")
             .update({"statut": "desinscrit", "unsubscribed_at": datetime.now(timezone.utc).isoformat()})
             .eq("token", token).execute())
        if not r.data:
            return {"error": "Lien de désinscription inconnu."}
        return {"ok": True, "email": r.data[0].get("email")}
    except Exception as e:
        logger.error(f"newsletter desabonner: {e}")
        return {"error": "Désinscription impossible."}


def abonnes_actifs() -> list:
    try:
        r = (supabase.table("newsletter_abonnes").select("email, nom, token")
             .eq("statut", "actif").execute())
        return r.data or []
    except Exception as e:
        logger.error(f"newsletter abonnes actifs: {e}")
        return []


# ------------------------------------------------- 5. Preparation + validation
def _numero_suivant() -> int:
    try:
        r = (supabase.table("newsletters").select("numero")
             .not_.is_("numero", "null").order("numero", desc=True).limit(1).execute())
        return int((r.data[0]["numero"] if r.data else 0) or 0) + 1
    except Exception:
        return 1


def derniere_du_cycle(jours: int = 5) -> dict | None:
    """Une edition preparee dans les N derniers jours ? (anti-doublon du cron)."""
    depuis = (datetime.now(timezone.utc) - timedelta(days=jours)).isoformat()
    try:
        r = (supabase.table("newsletters").select("id, statut, created_at")
             .gte("created_at", depuis).order("created_at", desc=True).limit(1).execute())
        return r.data[0] if r.data else None
    except Exception as e:
        logger.error(f"newsletter derniere: {e}")
        return None


async def preparer() -> dict:
    """Veille -> redaction -> brouillon en base -> email de validation a l'admin."""
    numero = _numero_suivant()
    logger.info(f"newsletter n°{numero} : veille en cours…")
    # Les appels LLM sont bloquants (client sync) et durent des minutes : hors boucle
    # d'événements, sinon toute l'API se fige pendant la préparation.
    veille = await asyncio.to_thread(_veille)
    if len(veille["texte"]) < 200:
        return {"error": "Veille trop pauvre cette semaine — rien à publier."}
    logger.info(f"newsletter n°{numero} : rédaction ({len(veille['sources'])} sources)")
    data = await asyncio.to_thread(_rediger, veille, numero)

    ins = supabase.table("newsletters").insert({
        "numero": numero, "sujet": data.get("sujet"), "preheader": data.get("preheader"),
        "data": data, "sources": veille["sources"], "statut": "brouillon",
    }).execute()
    nl = ins.data[0]
    nid, token = nl["id"], nl["token"]

    nb = sync_abonnes()
    total = len(abonnes_actifs())
    base = f"{BACKEND_URL}/api/newsletter"
    apercu = f"{base}/apercu/{nid}?token={token}"
    corps = rendu_html(data, unsub_url=f"{base}/desinscription?token=apercu", apercu_url=apercu)

    try:
        await mail_service.send_email(
            ADMIN_NOTIF_EMAIL,
            f"À valider — {data.get('sujet')}",
            _html_validation(data, nid, token, total, nb, len(veille["sources"]), corps),
        )
    except Exception as e:
        logger.error(f"newsletter email validation: {e}")
    logger.info(f"newsletter n°{numero} prête (id {nid}) — en attente de validation")
    return {"id": nid, "numero": numero, "sujet": data.get("sujet"), "abonnes": total}


def _html_validation(data: dict, nid: str, token: str, total: int, nouveaux: int,
                     nb_sources: int, corps: str) -> str:
    """Email interne : la lettre complete + les deux boutons de decision."""
    base = f"{BACKEND_URL}/api/newsletter"
    valider = f"{base}/valider/{nid}?token={token}"
    refuser = f"{base}/refuser/{nid}?token={token}"
    entete = f"""
<div style="max-width:600px;margin:0 auto 18px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#0b1322;border:1px solid rgba(255,255,255,0.09);border-radius:14px;">
    <tr><td style="padding:22px 24px;">
      <div style="color:#fbbf24;font-size:11px;font-weight:bold;letter-spacing:.16em;text-transform:uppercase;">En attente de ta validation</div>
      <div style="color:#ffffff;font-size:19px;font-weight:bold;margin:8px 0 4px;">Lettre n°{_e(data.get('numero'))} — {_e(data.get('sujet'))}</div>
      <div style="color:#94a3b8;font-size:13px;line-height:1.6;">
        {total} abonné(s) actifs{f' · {nouveaux} nouveau(x) cette semaine' if nouveaux else ''} · {nb_sources} sources de veille<br>
        Rien ne part tant que tu n'as pas cliqué. Aperçu complet ci-dessous.
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px;"><tr>
        <td style="background:#3AFFA3;border-radius:10px;">
          <a href="{valider}" target="_blank" style="display:inline-block;padding:13px 26px;color:#05261a;font-size:14.5px;font-weight:bold;text-decoration:none;">
            Envoyer aux {total} abonnés
          </a>
        </td>
        <td style="width:10px;"></td>
        <td style="border:1px solid rgba(255,255,255,0.16);border-radius:10px;">
          <a href="{refuser}" target="_blank" style="display:inline-block;padding:12px 22px;color:#94a3b8;font-size:14px;text-decoration:none;">
            Ne pas envoyer
          </a>
        </td>
      </tr></table>
    </td></tr>
  </table>
</div>"""
    # On injecte le bandeau juste apres <body …> de la lettre rendue.
    return re.sub(r"(<body[^>]*>)", r"\1" + entete, corps, count=1)


def _page(titre: str, message: str, ok: bool = True) -> str:
    """Petite page de confirmation (retour navigateur apres un clic dans l'email)."""
    couleur = "#3AFFA3" if ok else "#f87171"
    return f"""<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>{_e(titre)}</title></head>
<body style="margin:0;background:#020617;font-family:system-ui,-apple-system,Arial,sans-serif;">
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
    <div style="max-width:460px;text-align:center;">
      <img src="{_LOGO}" width="46" height="46" alt="Postorico" style="border-radius:12px;background:#fff;padding:7px;">
      <h1 style="color:{couleur};font-size:22px;margin:22px 0 10px;">{_e(titre)}</h1>
      <p style="color:#94a3b8;font-size:15px;line-height:1.7;margin:0 0 26px;">{_e(message)}</p>
      <a href="{FRONTEND_URL}" style="color:#8A6CFF;font-size:14px;text-decoration:none;">Retour sur Postorico</a>
    </div>
  </div>
</body></html>"""


def _charger(nid: str, token: str) -> dict | None:
    try:
        r = (supabase.table("newsletters").select("*")
             .eq("id", nid).eq("token", token).limit(1).execute())
        return r.data[0] if r.data else None
    except Exception as e:
        logger.error(f"newsletter charger: {e}")
        return None


async def valider(nid: str, token: str) -> str:
    """Clic sur « Envoyer » : fige le rendu et lance l'envoi en tache de fond."""
    nl = _charger(nid, token)
    if not nl:
        return _page("Lien invalide", "Cette lettre n'existe pas ou le lien a expiré.", ok=False)
    if nl["statut"] == "envoyee":
        return _page("Déjà envoyée", f"La lettre n°{nl.get('numero')} est partie à {nl.get('nb_envoyes')} abonnés.")
    if nl["statut"] == "refusee":
        return _page("Lettre refusée", "Tu avais choisi de ne pas l'envoyer.", ok=False)

    supabase.table("newsletters").update({"statut": "validee"}).eq("id", nid).execute()
    total = len(abonnes_actifs())
    asyncio.create_task(_envoyer(nid))
    return _page("C'est parti ✓",
                 f"La lettre n°{nl.get('numero')} part vers {total} abonnés. "
                 "Tu recevras un récapitulatif dès que l'envoi est terminé.")


def refuser(nid: str, token: str) -> str:
    nl = _charger(nid, token)
    if not nl:
        return _page("Lien invalide", "Cette lettre n'existe pas ou le lien a expiré.", ok=False)
    if nl["statut"] == "envoyee":
        return _page("Trop tard", "Cette lettre a déjà été envoyée.", ok=False)
    supabase.table("newsletters").update({"statut": "refusee"}).eq("id", nid).execute()
    return _page("Lettre annulée",
                 "Elle ne sera pas envoyée. La prochaine sera préparée au prochain cycle.")


async def _envoyer(nid: str):
    """Envoi effectif, un email par abonne (lien de desinscription personnel).
    Cadence volontairement lente : Resend limite le debit."""
    try:
        r = supabase.table("newsletters").select("*").eq("id", nid).limit(1).execute()
        nl = r.data[0] if r.data else None
        if not nl or nl["statut"] not in ("validee", "echec"):
            return
        data = nl.get("data") or {}
        sujet = nl.get("sujet") or data.get("sujet") or "La lettre de Rico"
        apercu = f"{BACKEND_URL}/api/newsletter/apercu/{nid}?token={nl['token']}"
        abonnes = abonnes_actifs()
        ok, ko = 0, 0
        for ab in abonnes:
            unsub = _lien_desinscription(ab["token"])
            html = rendu_html(data, unsub_url=unsub, apercu_url=apercu)
            try:
                res = await mail_service.send_email(ab["email"], sujet, html, unsubscribe_url=unsub)
                if res.get("error"):
                    ko += 1
                else:
                    ok += 1
            except Exception as e:
                ko += 1
                logger.warning(f"newsletter envoi {ab['email']}: {e}")
            await asyncio.sleep(0.6)      # ~1,6 envoi/s : sous la limite Resend
        supabase.table("newsletters").update({
            "statut": "envoyee", "nb_envoyes": ok, "nb_erreurs": ko,
            "html": rendu_html(data, unsub_url="#", apercu_url=apercu),
            "sent_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", nid).execute()
        logger.info(f"newsletter {nid} envoyée : {ok} ok / {ko} erreurs")
        try:
            await mail_service.send_email(
                ADMIN_NOTIF_EMAIL, f"Envoyée — {sujet}",
                mail_service._shell(f"""<tr><td style="padding:8px 32px 26px;">
                  <h1 style="margin:0 0 10px;color:#fff;font-size:20px;">Lettre n°{nl.get('numero')} envoyée</h1>
                  <p style="margin:0;color:#94a3b8;font-size:14px;line-height:1.7;">
                    {ok} email(s) délivrés{f' · {ko} échec(s)' if ko else ''}.<br>
                    <a href="{apercu}" style="color:#8A6CFF;">Revoir la lettre</a>
                  </p></td></tr>""", internal=True))
        except Exception as e:
            logger.warning(f"newsletter recap admin: {e}")
    except Exception as e:
        logger.error(f"newsletter envoi {nid}: {e}")
        try:
            supabase.table("newsletters").update({"statut": "echec", "erreur": str(e)[:300]}).eq("id", nid).execute()
        except Exception:
            pass
