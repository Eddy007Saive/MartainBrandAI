"""
Envoi d'emails via Resend (API REST, pas de SDK -> httpx).
Utilisé pour le « mot de passe oublié ».
"""
import httpx
from config import RESEND_API_KEY, RESEND_FROM, logger


async def send_email(to: str, subject: str, html: str) -> dict:
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
                json={"from": RESEND_FROM, "to": [to], "subject": subject, "html": html},
            )
    except Exception as e:
        logger.error(f"Resend request error: {e}")
        return {"error": "resend_request_failed"}
    if r.status_code >= 300:
        logger.error(f"Resend error {r.status_code}: {r.text[:300]}")
        return {"error": f"resend_{r.status_code}"}
    return {"id": r.json().get("id")}


def reset_email_html(nom: str, link: str) -> str:
    """Email de réinitialisation, design sobre cohérent avec PresenceOS."""
    salutation = f"Bonjour {nom}," if nom else "Bonjour,"
    return f"""\
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#020617;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#020617;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0f172a;border:1px solid rgba(255,255,255,0.06);border-radius:16px;overflow:hidden;">
        <tr><td style="padding:32px 32px 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:40px;height:40px;background:linear-gradient(135deg,#5B6CFF,#8A6CFF);border-radius:10px;text-align:center;vertical-align:middle;">
              <span style="color:#fff;font-size:20px;font-weight:bold;">P</span>
            </td>
            <td style="padding-left:12px;color:#ffffff;font-size:18px;font-weight:bold;">PresenceOS</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:16px 32px 0;">
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
        </td></tr>
        <tr><td style="padding:24px 32px;color:#475569;font-size:11px;">© 2026 PresenceOS</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
