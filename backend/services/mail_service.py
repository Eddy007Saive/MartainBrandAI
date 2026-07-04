"""
Envoi d'emails via Resend (API REST, pas de SDK -> httpx).
Utilisé pour le « mot de passe oublié ».
"""
import html as _html
import re
import httpx
from config import RESEND_API_KEY, RESEND_FROM, logger

# Domaine expéditeur extrait de RESEND_FROM ("PresenceOS <noreply@blackcore-ai.com>")
_m = re.search(r"@([^\s>]+)", RESEND_FROM or "")
_DOMAIN = _m.group(1) if _m else "blackcore-ai.com"
# Adresse de réponse réelle (meilleur signal de délivrabilité que noreply seul).
REPLY_TO = f"contact@{_DOMAIN}"
_UNSUB = f"mailto:unsubscribe@{_DOMAIN}?subject=unsubscribe"
# Logo hébergé (URL absolue https obligatoire dans les emails ; un chemin relatif ne s'affiche pas).
_LOGO_URL = "https://res.cloudinary.com/dy9gp5pim/image/upload/brand/presenceos-logo.png"


def _nl2br(text: str) -> str:
    """Échappe le HTML puis convertit les sauts de ligne en <br>."""
    return _html.escape(text or "").replace("\n", "<br>")


def _html_to_text(html: str) -> str:
    """Version texte brut d'un email HTML (évite le pénalité 'HTML sans texte')."""
    t = re.sub(r"(?is)<(script|style).*?</\1>", "", html or "")
    t = re.sub(r"(?i)<br\s*/?>", "\n", t)
    t = re.sub(r"(?i)</(p|div|tr|li|h[1-6]|table)>", "\n", t)
    t = re.sub(r"<[^>]+>", "", t)               # supprime les balises restantes
    t = _html.unescape(t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n\s*\n\s*\n+", "\n\n", t)     # au plus une ligne vide
    return t.strip()


# ---------------------------------------------------------------- Gabarit commun
def _header() -> str:
    """En-tête de marque : logo (sur pastille blanche pour rester visible sur fond sombre) + wordmark."""
    return f"""<tr><td style="padding:28px 32px 10px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="background:#ffffff;border-radius:12px;padding:6px;line-height:0;">
          <img src="{_LOGO_URL}" width="38" height="38" alt="PresenceOS" style="display:block;width:38px;height:38px;border:0;">
        </td>
        <td style="padding-left:12px;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:-.01em;">PresenceOS</td>
      </tr></table>
    </td></tr>"""


def _footer(internal: bool = False) -> str:
    """Pied de page. `internal=True` -> notification admin (footer sobre, pas de désinscription)."""
    if internal:
        return """<tr><td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.06);color:#475569;font-size:11px;">
          © 2026 PresenceOS — notification interne automatique
        </td></tr>"""
    return f"""<tr><td style="padding:22px 32px;border-top:1px solid rgba(255,255,255,0.06);">
      <p style="margin:0 0 6px;color:#64748b;font-size:11px;line-height:1.6;">
        PresenceOS — votre présence sociale, pilotée par l'IA.<br>
        Une question&nbsp;? Répondez à cet email ou écrivez-nous à
        <a href="mailto:{REPLY_TO}" style="color:#8A6CFF;text-decoration:none;">{REPLY_TO}</a>.
      </p>
      <p style="margin:0;color:#475569;font-size:11px;">
        © 2026 PresenceOS · <a href="{_UNSUB}" style="color:#475569;text-decoration:underline;">Se désinscrire</a>
      </p>
    </td></tr>"""


def _shell(inner: str, width: int = 520, internal: bool = False) -> str:
    """Enveloppe complète (fond sombre + carte + header logo + footer). `inner` = un ou plusieurs <tr>."""
    return f"""\
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#020617;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#020617;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:{width}px;background:#0f172a;border:1px solid rgba(255,255,255,0.06);border-radius:16px;overflow:hidden;">
        {_header()}
        {inner}
        {_footer(internal)}
      </table>
    </td></tr>
  </table>
</body>
</html>"""


async def send_email(to: str, subject: str, html: str, text: str | None = None) -> dict:
    if not RESEND_API_KEY:
        logger.error("RESEND_API_KEY manquante — email non envoyé")
        return {"error": "no_resend_key"}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": RESEND_FROM,
                    "to": [to],
                    "reply_to": REPLY_TO,
                    "subject": subject,
                    "html": html,
                    "text": text or _html_to_text(html),
                    # mailto uniquement -> pas de One-Click (qui exigerait une URL https)
                    "headers": {"List-Unsubscribe": f"<{_UNSUB}>"},
                },
            )
    except Exception as e:
        logger.error(f"Resend request error: {e}")
        return {"error": "resend_request_failed"}
    if r.status_code >= 300:
        logger.error(f"Resend error {r.status_code}: {r.text[:300]}")
        return {"error": f"resend_{r.status_code}"}
    return {"id": r.json().get("id")}


def admin_payment_html(kind: str, nom: str, email: str, detail: str = "") -> tuple:
    """(subject, html) pour prévenir l'admin d'un événement de facturation Stripe."""
    cfg = {
        "new_sub": ("💳 Nouvel abonnement", "#5B6CFF", "Nouvel abonnement Pro"),
        "canceling": ("⏳ Résiliation programmée", "#f59e0b", "Résiliation programmée (actif jusqu'à l'échéance)"),
        "pack": ("🧩 Pack acheté", "#5B6CFF", "Achat de pack"),
        "canceled": ("❌ Résiliation", "#ef4444", "Abonnement terminé"),
        "payment_failed": ("⚠️ Paiement échoué", "#f59e0b", "Échec de paiement"),
    }
    emoji_subj, color, titre = cfg.get(kind, ("💳 Paiement", "#5B6CFF", "Événement de facturation"))
    who = _html.escape(nom or "Client")
    mail = _html.escape(email or "—")
    extra = f'<p style="margin:10px 0 0;color:#94a3b8;font-size:14px;line-height:1.6;">{_html.escape(detail)}</p>' if detail else ""
    subject = f"{emoji_subj} — {who}"
    inner = f"""<tr><td style="padding:16px 32px 26px;">
      <div style="border-left:4px solid {color};padding:4px 0 4px 16px;">
        <h1 style="margin:0 0 8px;font-size:19px;color:#ffffff;">{titre}</h1>
        <p style="margin:0;color:#cbd5e1;font-size:15px;"><b style="color:#ffffff;">{who}</b> &lt;{mail}&gt;</p>
        {extra}
      </div>
    </td></tr>"""
    return subject, _shell(inner, width=520, internal=True)


def reset_email_html(nom: str, link: str) -> str:
    """Email de réinitialisation, design sobre cohérent avec PresenceOS."""
    salutation = f"Bonjour {_html.escape(nom)}," if nom else "Bonjour,"
    inner = f"""<tr><td style="padding:16px 32px 24px;">
      <h1 style="color:#ffffff;font-size:20px;margin:0 0 12px;">Réinitialisation du mot de passe</h1>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin:0 0 8px;">{salutation}</p>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour en définir un nouveau.
        Ce lien expire dans <strong style="color:#cbd5e1;">1 heure</strong>.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
        <td style="border-radius:10px;background:linear-gradient(135deg,#5B6CFF,#8A6CFF);">
          <a href="{link}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">
            Réinitialiser mon mot de passe
          </a>
        </td>
      </tr></table>
      <p style="color:#64748b;font-size:12px;line-height:1.6;margin:0 0 4px;">Si le bouton ne fonctionne pas, copiez ce lien :</p>
      <p style="margin:0 0 24px;"><a href="{link}" target="_blank" style="color:#8A6CFF;font-size:12px;word-break:break-all;">{link}</a></p>
      <p style="color:#64748b;font-size:12px;line-height:1.6;margin:0;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">
        Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre mot de passe reste inchangé.
      </p>
    </td></tr>"""
    return _shell(inner, width=480)


def audit_notification_html(marque: str, email: str, recap: str, admin_url: str) -> str:
    """Notification interne : un nouvel audit de marque vient d'arriver."""
    marque_txt = _html.escape(marque or "Sans nom")
    email_txt = _html.escape(email or "—")
    recap_html = _nl2br(recap)
    inner = f"""<tr><td style="padding:12px 32px 26px;">
      <span style="display:inline-block;background:rgba(58,255,163,0.12);color:#3AFFA3;font-size:11px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;padding:5px 10px;border-radius:99px;">Nouveau lead</span>
      <h1 style="color:#ffffff;font-size:20px;margin:14px 0 4px;">Nouvel audit de marque reçu</h1>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 20px;">
        <strong style="color:#e2e8f0;">Marque :</strong> {marque_txt}<br>
        <strong style="color:#e2e8f0;">Email :</strong> <a href="mailto:{email_txt}" style="color:#8A6CFF;">{email_txt}</a>
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr>
        <td style="border-radius:10px;background:linear-gradient(135deg,#5B6CFF,#8A6CFF);">
          <a href="{admin_url}" target="_blank" style="display:inline-block;padding:12px 26px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">
            Ouvrir dans l'admin
          </a>
        </td>
      </tr></table>
      <div style="background:#0b1120;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 18px;color:#cbd5e1;font-size:12.5px;line-height:1.7;font-family:ui-monospace,Menlo,Consolas,monospace;white-space:normal;">
        {recap_html}
      </div>
    </td></tr>"""
    return _shell(inner, width=600, internal=True)


def audit_reply_html(marque: str, message: str) -> str:
    """Réponse envoyée au prospect depuis l'admin."""
    salutation = f"Bonjour {_html.escape(marque)}," if marque else "Bonjour,"
    body_html = _nl2br(message)
    inner = f"""<tr><td style="padding:16px 32px 24px;">
      <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin:0 0 14px;">{salutation}</p>
      <div style="color:#e2e8f0;font-size:14.5px;line-height:1.7;">{body_html}</div>
      <p style="color:#64748b;font-size:12px;line-height:1.6;margin:24px 0 0;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">
        L'équipe PresenceOS
      </p>
    </td></tr>"""
    return _shell(inner, width=520)
