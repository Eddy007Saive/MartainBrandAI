"""
Envoi d'emails via Resend (API REST, pas de SDK -> httpx).

--- Le gabarit ---

Un email n'est pas une page web. Le moteur de rendu d'Outlook est celui de
Word : ni flexbox, ni grille, ni variables CSS, ni feuille de style externe,
et les dégradés y sont ignorés. Tout est donc en tableaux, avec le style écrit
sur chaque balise. Ce n'est pas de la négligence, c'est la seule chose qui
s'affiche partout.

Trois décisions qui structurent le reste :

  1. `bgcolor` ET `background-image` sur les boutons. Le raccourci
     `background: linear-gradient(...)` seul remet la couleur de fond à
     « transparent » : sous Outlook, le bouton perdait sa pastille et se
     réduisait à du texte gras. La couleur pleine sert de socle, le dégradé
     se pose dessus quand le client sait le faire.

  2. Un texte d'aperçu (`_preheader`) sur chaque email. Sans lui, la boîte de
     réception affiche le premier texte trouvé — « Postorico », déjà écrit
     dans l'expéditeur. Une ligne perdue à l'endroit qui décide de l'ouverture.

  3. Fond CLAIR, et `color-scheme: light` déclaré. Un email sombre se lit
     comme une newsletter, pas comme un message d'un fournisseur — et il
     pose trois problèmes concrets : le mode nuit l'inverse, il s'imprime
     mal, et une facture transférée à un comptable arrive illisible.

     Le passage au clair n'est pas qu'une inversion : le vert d'accent
     (#3AFFA3) tombe à 1,4:1 de contraste sur blanc. Les montants et les
     accents de texte utilisent un vert soutenu (#0b7a53).

--- Le tutoiement ---

Le site vouvoie ses visiteurs, l'application tutoie ses clients. Les emails
suivent la même frontière : on tutoie qui a un compte (mot de passe, facture,
déconnexion, relevé), on vouvoie un prospect (réponse à un audit). Les
notifications internes ne s'adressent à personne, elles restent neutres.
"""
import html as _html
import re
import httpx
from config import RESEND_API_KEY, RESEND_FROM, logger

# Domaine expéditeur extrait de RESEND_FROM ("Postorico <noreply@blackcore-ai.com>")
_m = re.search(r"@([^\s>]+)", RESEND_FROM or "")
_DOMAIN = _m.group(1) if _m else "blackcore-ai.com"
# Adresse de réponse réelle (meilleur signal de délivrabilité que noreply seul).
REPLY_TO = f"contact@{_DOMAIN}"
_UNSUB = f"mailto:unsubscribe@{_DOMAIN}?subject=unsubscribe"
# Images hébergées : une URL absolue https est obligatoire dans un email,
# un chemin relatif ne s'affiche jamais.
_LOGO_URL = "https://res.cloudinary.com/dy9gp5pim/image/upload/brand/postorico-logo.png"
_RICO_URL = ("https://res.cloudinary.com/dy9gp5pim/image/upload/"
             "w_180,q_auto,f_png/brand/rico-v4/pouce-leve.png")

# La police : Sora et Inter ne se chargent pas dans un client de messagerie,
# et prétendre le contraire donne un rendu au petit bonheur. On assume une
# pile système, qui est nette partout.
_POLICE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif"

# La barre de couleur en tête de carte remplace l'emoji dans le titre : elle
# dit le registre du message sans encombrer la ligne d'objet.
_TEINTES = {
    "marque": ("#6A5CFF", "linear-gradient(90deg,#5B6CFF,#8A6CFF)"),
    "succes": ("#3AFFA3", "linear-gradient(90deg,#3AFFA3,#7fd7d0)"),
    "alerte": ("#f59e0b", "linear-gradient(90deg,#f59e0b,#fbbf24)"),
    "erreur": ("#ef4444", "linear-gradient(90deg,#ef4444,#f87171)"),
}


def _nl2br(text: str) -> str:
    """Échappe le HTML puis convertit les sauts de ligne en <br>."""
    return _html.escape(text or "").replace("\n", "<br>")


def _html_to_text(html: str) -> str:
    """Version texte brut d'un email HTML (évite la pénalité 'HTML sans texte')."""
    t = re.sub(r"(?is)<(script|style).*?</\1>", "", html or "")
    # Le texte d'aperçu est déjà le début du message : le reprendre le
    # dupliquerait en tête de la version texte.
    t = re.sub(r'(?is)<div[^>]+class="apercu".*?</div>', "", t)
    t = re.sub(r"(?i)<br\s*/?>", "\n", t)
    t = re.sub(r"(?i)</(p|div|tr|li|h[1-6]|table)>", "\n", t)
    t = re.sub(r"<[^>]+>", "", t)               # supprime les balises restantes
    t = _html.unescape(t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n\s*\n\s*\n+", "\n\n", t)     # au plus une ligne vide
    return t.strip()


# ---------------------------------------------------------------- Briques
def _preheader(texte: str) -> str:
    """Le texte d'aperçu affiché à côté de l'objet dans la boîte de réception.

    Les entités qui suivent le poussent : sans elles, le client complète
    l'aperçu avec le début du corps, et on lit deux fois la même phrase.
    """
    bourrage = "&#847;&zwnj;&nbsp;" * 60
    return (f'<div class="apercu" style="display:none;max-height:0;overflow:hidden;'
            f'mso-hide:all;font-size:1px;line-height:1px;color:#f4f6fb;opacity:0;">'
            f'{_html.escape(texte)}{bourrage}</div>')


def _bouton(url: str, libelle: str) -> str:
    """Le bouton d'action.

    `bgcolor` en attribut plutôt qu'en style : c'est ce que lit Outlook. Et la
    couleur pleine est séparée du dégradé, sinon le raccourci CSS efface l'une
    en posant l'autre et la pastille disparaît.
    """
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;"><tr>
        <td align="center" bgcolor="#6A5CFF" style="border-radius:10px;background-color:#6A5CFF;background-image:linear-gradient(135deg,#5B6CFF,#8A6CFF);mso-padding-alt:14px 30px;">
          <a href="{url}" target="_blank" style="display:inline-block;padding:14px 30px;border-radius:10px;color:#ffffff;font-family:{_POLICE};font-size:14.5px;font-weight:bold;text-decoration:none;">{libelle}</a>
        </td>
      </tr></table>"""


def _lien_secours(url: str) -> str:
    """Le lien en toutes lettres, pour le client qui n'affiche pas les boutons."""
    return f"""<p style="color:#6b7688;font-size:12px;line-height:1.6;margin:0 0 4px;">Si le bouton ne fonctionne pas, copie ce lien :</p>
      <p style="margin:0 0 22px;"><a href="{url}" target="_blank" style="color:#6d4fe0;font-size:12px;word-break:break-all;">{url}</a></p>"""


# Le vert de marque (#3AFFA3) tombe a 1,4:1 de contraste sur blanc : sur un
# montant, c'est illisible. Ce vert-la reste celui de la barre de registre,
# ou il n'a rien a dire ; le texte prend un vert soutenu.
VERT_TEXTE = "#0b7a53"


def _encadre(surtitre: str, titre: str, valeur: str = "", couleur: str = VERT_TEXTE) -> str:
    """Le bloc chiffré : montant d'une facture, total d'un relevé."""
    val = (f'<p style="color:{couleur};font-size:24px;font-weight:bold;margin:0;'
           f'font-family:{_POLICE};">{valeur}</p>') if valeur else ""
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f7f8fc;border:1px solid #e6e9f2;border-radius:12px;margin:0 0 24px;">
        <tr><td style="padding:18px 22px;">
          <p style="color:#5b6a82;font-size:11px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.09em;">{surtitre}</p>
          <p style="color:#0f172a;font-size:15px;font-weight:bold;margin:0 0 {'8px' if valeur else '0'};">{titre}</p>
          {val}
        </td></tr>
      </table>"""


def _signature() -> str:
    """La signature de fin, avec la mascotte.

    Une image seule ne porte jamais d'information : la moitié des clients les
    bloquent par défaut. Rico est ici décoratif, le texte se suffit.
    """
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;border-top:1px solid #e9ecf4;width:100%;">
        <tr>
          <td width="64" style="padding:16px 13px 0 0;vertical-align:middle;">
            <img src="{_RICO_URL}" width="64" alt="" style="display:block;width:64px;height:auto;border:0;">
          </td>
          <td style="padding:18px 0 0;vertical-align:middle;color:#6b7688;font-size:12.5px;line-height:1.6;">
            L'équipe Postorico<br>
            <span style="color:#6b7688;">Une question&nbsp;? Réponds simplement à cet email.</span>
          </td>
        </tr>
      </table>"""


def _header(teinte: str = "marque") -> str:
    """Barre de registre + logo + nom. La barre dit le ton avant la lecture.

    Sur fond clair, la pastille blanche sous le logo n'a plus de raison
    d'etre : elle servait a le detacher du sombre.
    """
    plein, degrade = _TEINTES.get(teinte, _TEINTES["marque"])
    return f"""<tr><td bgcolor="{plein}" height="4" style="height:4px;line-height:4px;font-size:0;background-color:{plein};background-image:{degrade};">&nbsp;</td></tr>
    <tr><td style="padding:26px 32px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="line-height:0;">
          <img src="{_LOGO_URL}" width="34" height="34" alt="Postorico" style="display:block;width:34px;height:34px;border:0;">
        </td>
        <td style="padding-left:11px;font-family:{_POLICE};">
          <span style="display:block;color:#0f172a;font-size:17px;font-weight:bold;letter-spacing:-.01em;line-height:1.2;">Postorico</span>
          <span style="display:block;color:#6b7688;font-size:11.5px;line-height:1.4;">Votre présence, amplifiée</span>
        </td>
      </tr></table>
    </td></tr>"""


def _footer(internal: bool = False) -> str:
    """Pied de page. `internal=True` -> notification admin, pas de désinscription."""
    if internal:
        return """<tr><td style="padding:18px 32px;border-top:1px solid #e9ecf4;color:#6b7688;font-size:11px;">
          © 2026 Postorico — notification interne automatique
        </td></tr>"""
    return f"""<tr><td style="padding:20px 32px;border-top:1px solid #e9ecf4;">
      <p style="margin:0;color:#6b7688;font-size:11px;line-height:1.7;">
        © 2026 Postorico ·
        <a href="mailto:{REPLY_TO}" style="color:#6b7688;text-decoration:none;">{REPLY_TO}</a> ·
        <a href="{_UNSUB}" style="color:#6b7688;text-decoration:underline;">Se désinscrire</a>
      </p>
    </td></tr>"""


def _shell(inner: str, width: int = 520, internal: bool = False,
           apercu: str = "", teinte: str = "marque") -> str:
    """L'enveloppe complète. `inner` = un ou plusieurs <tr>."""
    return f"""\
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- Sans ces deux lignes, le mode nuit de Gmail et d'Apple Mail ré-inverse
     nos couleurs : le texte clair repasse en sombre sur un fond redevenu
     clair, et l'email devient illisible. -->
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<style>
  :root {{ color-scheme: light; supported-color-schemes: light; }}
  @media only screen and (max-width:600px) {{
    .carte {{ width:100% !important; border-radius:0 !important; }}
    .marge {{ padding-left:22px !important; padding-right:22px !important; }}
    .titre {{ font-size:19px !important; }}
  }}
</style>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:{_POLICE};-webkit-font-smoothing:antialiased;">
  {_preheader(apercu) if apercu else ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6fb;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" class="carte" width="{width}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:{width}px;background:#ffffff;border:1px solid #e6e9f2;border-radius:16px;overflow:hidden;">
        {_header(teinte)}
        {inner}
        {_footer(internal)}
      </table>
    </td></tr>
  </table>
</body>
</html>"""


async def send_email(to: str, subject: str, html: str, text: str | None = None,
                     unsubscribe_url: str | None = None) -> dict:
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
                    # Avec une URL https (newsletter) -> désinscription One-Click, très
                    # bon signal de délivrabilité. Sinon mailto seul (pas de One-Click).
                    "headers": ({
                        "List-Unsubscribe": f"<{unsubscribe_url}>, <{_UNSUB}>",
                        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                    } if unsubscribe_url else {"List-Unsubscribe": f"<{_UNSUB}>"}),
                },
            )
    except Exception as e:
        logger.error(f"Resend request error: {e}")
        return {"error": "resend_request_failed"}
    if r.status_code >= 300:
        logger.error(f"Resend error {r.status_code}: {r.text[:300]}")
        return {"error": f"resend_{r.status_code}"}
    return {"id": r.json().get("id")}


# ---------------------------------------------------------------- Gabarits
def admin_payment_html(kind: str, nom: str, email: str, detail: str = "") -> tuple:
    """(subject, html) pour prévenir l'admin d'un événement de facturation Stripe."""
    cfg = {
        "new_sub": ("💳 Nouvel abonnement", "succes", "Nouvel abonnement Pro"),
        "canceling": ("⏳ Résiliation programmée", "alerte", "Résiliation programmée"),
        "pack": ("🧩 Pack acheté", "marque", "Achat de pack"),
        "canceled": ("❌ Résiliation", "erreur", "Abonnement terminé"),
        "payment_failed": ("⚠️ Paiement échoué", "alerte", "Échec de paiement"),
    }
    notes = {
        "new_sub": "Un nouvel abonnement Pro vient d'être activé. Le compte a accès à toutes les fonctionnalités et sera renouvelé automatiquement chaque mois.",
        "canceling": "L'abonné a demandé la résiliation. Il conserve l'accès Pro jusqu'à la date d'échéance ci-dessous, puis son compte repassera automatiquement en offre gratuite.",
        "pack": "Un pack de résultats supplémentaires vient d'être acheté. Le quota correspondant a été crédité automatiquement sur le compte.",
        "canceled": "L'abonnement est arrivé à échéance et a pris fin. Le compte est repassé en offre gratuite ; l'abonné peut se réabonner à tout moment.",
        "payment_failed": "Le dernier prélèvement a échoué. Stripe va effectuer de nouvelles tentatives ; sans succès, l'abonnement finira par être suspendu.",
    }
    # L'emoji reste dans l'objet des notifications INTERNES : c'est une boîte
    # qu'on balaie du regard, la pastille de couleur y fait gagner une seconde.
    # Il n'apparaît pas dans les emails clients.
    emoji_subj, teinte, titre = cfg.get(kind, ("💳 Paiement", "marque", "Événement de facturation"))
    note = notes.get(kind, "Un événement de facturation vient d'être enregistré sur ce compte.")
    plein, _ = _TEINTES[teinte]
    who = _html.escape(nom or "Client")
    mail = _html.escape(email or "—")
    extra = f'<p style="margin:10px 0 0;color:#1f2937;font-size:14px;line-height:1.6;">{_html.escape(detail)}</p>' if detail else ""
    subject = f"{emoji_subj} — {who}"
    inner = f"""<tr><td class="marge" style="padding:14px 32px 26px;">
      <div style="border-left:3px solid {plein};padding:2px 0 2px 16px;">
        <h1 class="titre" style="margin:0 0 8px;font-size:19px;color:#0f172a;font-weight:bold;">{titre}</h1>
        <p style="margin:0;color:#334155;font-size:15px;"><b style="color:#0f172a;">{who}</b> &lt;{mail}&gt;</p>
        {extra}
      </div>
      <p style="margin:18px 0 0;color:#5b6a82;font-size:13.5px;line-height:1.7;">{note}</p>
      <p style="margin:14px 0 0;color:#6b7688;font-size:12.5px;line-height:1.6;">
        Le détail complet — montant, dates, historique des paiements — est dans le tableau de bord administrateur, section Facturation.
      </p>
    </td></tr>"""
    return subject, _shell(inner, width=520, internal=True,
                           apercu=f"{titre} · {who}", teinte=teinte)


def reset_email_html(nom: str, link: str) -> str:
    """Email de réinitialisation du mot de passe."""
    salutation = f"Bonjour {_html.escape(nom)}," if nom else "Bonjour,"
    inner = f"""<tr><td class="marge" style="padding:14px 32px 26px;">
      <h1 class="titre" style="color:#0f172a;font-size:21px;font-weight:bold;margin:0 0 14px;line-height:1.25;">Réinitialise ton mot de passe</h1>
      <p style="color:#334155;font-size:14.5px;line-height:1.65;margin:0 0 10px;">{salutation}</p>
      <p style="color:#5b6a82;font-size:14.5px;line-height:1.65;margin:0 0 24px;">
        Tu as demandé à changer ton mot de passe. Le bouton ci-dessous t'emmène sur la page où en définir un nouveau.
        Ce lien expire dans <strong style="color:#334155;">une heure</strong>.
      </p>
      {_bouton(link, "Choisir un nouveau mot de passe")}
      {_lien_secours(link)}
      <p style="color:#6b7688;font-size:12.5px;line-height:1.65;margin:0;border-top:1px solid #e9ecf4;padding-top:16px;">
        Tu n'es pas à l'origine de cette demande&nbsp;? Ignore cet email : ton mot de passe reste inchangé, et personne d'autre ne peut utiliser ce lien.
      </p>
    </td></tr>"""
    return _shell(inner, width=480,
                  apercu="Ton lien de réinitialisation est valable une heure.")


def facture_html(nom: str, montant: float, devise: str, libelle: str,
                 numero: str = None, url: str = None, pdf: str = None) -> tuple:
    """Email FACTURE au client après un paiement réussi (abonnement ou pack).
    Retourne (sujet, html). Liens Stripe : facture en ligne + PDF téléchargeable."""
    salutation = f"Bonjour {_html.escape(nom)}," if nom else "Bonjour,"
    devise_sym = "€" if devise == "EUR" else devise
    montant_txt = f"{montant:.2f}".replace(".", ",").removesuffix(",00")
    num = f" n°{_html.escape(numero)}" if numero else ""
    sujet = f"Ta facture Postorico{num} — {montant_txt} {devise_sym}"
    bouton = _bouton(url, "Voir ma facture") if url else ""
    lien_pdf = (f"""<p style="margin:0 0 22px;"><a href="{pdf}" target="_blank" style="color:#6d4fe0;font-size:13px;">Télécharger le PDF</a></p>"""
                if pdf else "")
    inner = f"""<tr><td class="marge" style="padding:14px 32px 26px;">
      <h1 class="titre" style="color:#0f172a;font-size:21px;font-weight:bold;margin:0 0 14px;line-height:1.25;">Paiement bien reçu</h1>
      <p style="color:#334155;font-size:14.5px;line-height:1.65;margin:0 0 22px;">{salutation}</p>
      {_encadre(f"Facture{num}", _html.escape(libelle), f"{montant_txt} {devise_sym}")}
      {bouton}
      {lien_pdf}
      <p style="color:#6b7688;font-size:12.5px;line-height:1.65;margin:0;border-top:1px solid #e9ecf4;padding-top:16px;">
        Toutes tes factures sont dans Paramètres → Abonnement.
      </p>
      {_signature()}
    </td></tr>"""
    return sujet, _shell(inner, width=480, teinte="succes",
                         apercu=f"{libelle} · {montant_txt} {devise_sym}")


def account_disconnected_html(nom: str, reseau: str, link: str) -> str:
    """Alerte : un réseau social s'est déconnecté — CTA de reconnexion en un clic.
    Envoyé dès réception du webhook account.disconnected (sinon les publications
    échouent en silence jusqu'à ce que le client ouvre l'app)."""
    salutation = f"Bonjour {_html.escape(nom)}," if nom else "Bonjour,"
    reseau_cap = _html.escape((reseau or "").capitalize())
    inner = f"""<tr><td class="marge" style="padding:14px 32px 26px;">
      <h1 class="titre" style="color:#0f172a;font-size:21px;font-weight:bold;margin:0 0 14px;line-height:1.25;">Ton compte {reseau_cap} s'est déconnecté</h1>
      <p style="color:#334155;font-size:14.5px;line-height:1.65;margin:0 0 10px;">{salutation}</p>
      <p style="color:#5b6a82;font-size:14.5px;line-height:1.65;margin:0 0 18px;">
        La connexion entre Postorico et ton compte <strong style="color:#334155;">{reseau_cap}</strong> a expiré.
        Les réseaux invalident cet accès de temps en temps, ce n'est pas un problème de ton côté.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fff8ec;border:1px solid #f6d9a6;border-radius:10px;margin:0 0 24px;">
        <tr><td style="padding:14px 18px;color:#8a5a00;font-size:13.5px;line-height:1.6;">
          Tes publications prévues sur {reseau_cap} sont <strong>en pause</strong> tant que le compte n'est pas reconnecté.
        </td></tr>
      </table>
      {_bouton(link, "Reconnecter mon compte")}
      {_lien_secours(link)}
      <p style="color:#6b7688;font-size:12.5px;line-height:1.65;margin:0;border-top:1px solid #e9ecf4;padding-top:16px;">
        La reconnexion prend trente secondes : tu cliques, tu autorises, et les publications en attente repartent toutes seules.
      </p>
    </td></tr>"""
    return _shell(inner, width=480, teinte="alerte",
                  apercu=f"Tes publications {reseau_cap} sont en pause le temps de reconnecter.")


def audit_notification_html(marque: str, email: str, recap: str, admin_url: str) -> str:
    """Notification interne : un nouvel audit de marque vient d'arriver."""
    marque_txt = _html.escape(marque or "Sans nom")
    email_txt = _html.escape(email or "—")
    recap_html = _nl2br(recap)
    inner = f"""<tr><td class="marge" style="padding:12px 32px 26px;">
      <span style="display:inline-block;background:#e7faf1;color:#0b7a53;font-size:11px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;padding:5px 10px;border-radius:99px;">Nouveau lead</span>
      <h1 class="titre" style="color:#0f172a;font-size:20px;font-weight:bold;margin:14px 0 6px;">Nouvel audit de marque reçu</h1>
      <p style="color:#5b6a82;font-size:14px;line-height:1.7;margin:0 0 20px;">
        <strong style="color:#1f2937;">Marque :</strong> {marque_txt}<br>
        <strong style="color:#1f2937;">Email :</strong> <a href="mailto:{email_txt}" style="color:#6d4fe0;">{email_txt}</a>
      </p>
      {_bouton(admin_url, "Ouvrir dans l'admin")}
      <div style="background:#f7f8fc;border:1px solid #e6e9f2;border-radius:12px;padding:16px 18px;color:#334155;font-size:12.5px;line-height:1.75;font-family:ui-monospace,Menlo,Consolas,monospace;">
        {recap_html}
      </div>
    </td></tr>"""
    return _shell(inner, width=600, internal=True, teinte="succes",
                  apercu=f"{marque_txt} — {email_txt}")


def audit_reply_html(marque: str, message: str) -> str:
    """Réponse envoyée au prospect depuis l'admin.

    Un prospect n'a pas de compte : on le vouvoie, comme sur le site. Et le
    gabarit s'efface — pas de titre, pas de bouton, pas d'encadré. Ce message
    doit se lire comme un email écrit à la main, parce qu'il l'est.
    """
    salutation = f"Bonjour {_html.escape(marque)}," if marque else "Bonjour,"
    body_html = _nl2br(message)
    # Les premiers mots du message servent d'aperçu : c'est ce qu'on lirait
    # d'un vrai email, et c'est plus juste que n'importe quelle phrase posée.
    debut = re.sub(r"\s+", " ", (message or "")).strip()[:110]
    inner = f"""<tr><td class="marge" style="padding:14px 32px 26px;">
      <p style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 16px;">{salutation}</p>
      <div style="color:#1f2937;font-size:15px;line-height:1.75;">{body_html}</div>
      {_signature()}
    </td></tr>"""
    return _shell(inner, width=520, apercu=debut)


def rappel_prelevement_html(nom: str, montant: float, devise: str, date: str,
                            lien: str, apres_pack: bool = False) -> tuple:
    """Le rappel envoye trois jours avant le premier prelevement.

    Deux situations, un seul gabarit. Le client du Parcours 2 termine son essai
    gratuit ; celui du Parcours 1 a paye son Pack et voit son abonnement
    demarrer apres le parametrage. Leur dire la meme phrase serait faux dans un
    cas sur deux — on ne parle pas d'« essai qui se termine » a quelqu'un qui a
    deja regle 1 499 EUR.

    Ce que les deux ont en commun : de l'argent va partir dans trois jours. Le
    montant, la date et le moyen de resilier sont donc au meme endroit, en
    clair. Un rappel qui enterre ces trois informations est une mauvaise
    surprise deguisee en courtoisie.
    """
    salutation = f"Bonjour {_html.escape(nom)}," if nom else "Bonjour,"
    devise_sym = "€" if (devise or "EUR").upper() == "EUR" else devise.upper()
    montant_txt = f"{montant:.2f}".replace(".", ",").removesuffix(",00")
    jour = _html.escape(date)

    if apres_pack:
        sujet = f"Ton abonnement Postorico démarre le {date}"
        titre = "Ton abonnement démarre bientôt"
        contexte = ("Ton paramétrage touche à sa fin. Comme prévu, ton abonnement prend le relais "
                    "et le premier prélèvement aura lieu dans trois jours.")
    else:
        sujet = f"Tes 14 jours se terminent le {date}"
        titre = "Tes 14 jours se terminent"
        contexte = ("Ton essai arrive à son terme. Si tu continues, rien à faire : "
                    "l'abonnement prend le relais automatiquement.")

    inner = f"""<tr><td class="marge" style="padding:14px 32px 26px;">
      <h1 class="titre" style="color:#0f172a;font-size:21px;font-weight:bold;margin:0 0 14px;line-height:1.25;">{titre}</h1>
      <p style="color:#334155;font-size:14.5px;line-height:1.65;margin:0 0 10px;">{salutation}</p>
      <p style="color:#5b6a82;font-size:14.5px;line-height:1.65;margin:0 0 22px;">{contexte}</p>
      {_encadre("Premier prélèvement", f"Le {jour}", f"{montant_txt} {devise_sym}")}
      <p style="color:#334155;font-size:14.5px;line-height:1.65;margin:0 0 20px;">
        Puis {montant_txt}&nbsp;{devise_sym} chaque mois, tant que tu restes. Tu peux arrêter
        quand tu veux&nbsp;: la résiliation prend effet à la fin de la période déjà payée,
        et tu gardes l'accès jusque-là.
      </p>
      {_bouton(lien, "Gérer mon abonnement")}
      <p style="color:#6b7688;font-size:12.5px;line-height:1.65;margin:0;border-top:1px solid #e9ecf4;padding-top:16px;">
        Si tu ne veux pas être prélevé, c'est le moment&nbsp;: résilie avant le {jour} et rien ne partira.
      </p>
      {_signature()}
    </td></tr>"""
    return sujet, _shell(inner, width=480, teinte="alerte",
                         apercu=f"{montant_txt} {devise_sym} le {date} · résiliable avant")


def resiliation_html(nom: str, fin: str, lien: str) -> tuple:
    """La confirmation de resiliation.

    Deux informations, et rien d'autre a chercher : jusqu'a quand l'acces
    reste ouvert, et comment revenir. Sans la date ecrite noir sur blanc, la
    question « jusqu'a quand ? » revient au support dans les heures qui
    suivent — et le doute fait douter de tout le reste.

    Aucune tentative de rattrapage ici. La personne vient de dire non ; lui
    remettre une offre dans l'email de confirmation, c'est ne pas l'ecouter.
    """
    salutation = f"Bonjour {_html.escape(nom)}," if nom else "Bonjour,"
    jour = ""
    if fin:
        try:
            from datetime import datetime as _dt
            jour = _dt.fromisoformat(str(fin).replace("Z", "+00:00")).strftime("%d/%m/%Y")
        except Exception:
            jour = str(fin)[:10]
    quand = f"jusqu'au <strong>{jour}</strong>" if jour else "jusqu'à la fin de ta période en cours"
    suffixe = f" — accès jusqu'au {jour}" if jour else ""
    sujet = f"Ta résiliation est enregistrée{suffixe}"
    inner = f"""<tr><td class="marge" style="padding:14px 32px 26px;">
      <h1 class="titre" style="color:#0f172a;font-size:21px;font-weight:bold;margin:0 0 14px;line-height:1.25;">C'est fait</h1>
      <p style="color:#334155;font-size:14.5px;line-height:1.65;margin:0 0 10px;">{salutation}</p>
      <p style="color:#5b6a82;font-size:14.5px;line-height:1.65;margin:0 0 22px;">
        Ton abonnement ne se renouvellera pas. Tu gardes l'accès complet {quand} —
        la période est déjà réglée, elle est à toi.
      </p>
      {_encadre("Fin de l'accès", jour or "fin de la période en cours")}
      <p style="color:#334155;font-size:14.5px;line-height:1.65;margin:0 0 20px;">
        Tes contenus, ton ton de marque et tes gabarits restent conservés.
        Si tu changes d'avis avant cette date, une seule action suffit : tout
        repart où tu l'avais laissé.
      </p>
      {_bouton(lien, "Réactiver mon abonnement")}
      <p style="color:#6b7688;font-size:12.5px;line-height:1.65;margin:0;border-top:1px solid #e9ecf4;padding-top:16px;">
        Merci d'avoir essayé Postorico. Si quelque chose n'a pas marché, réponds à
        cet email — on lit tout.
      </p>
      {_signature()}
    </td></tr>"""
    return sujet, _shell(inner, width=480,
                         apercu=f"Accès conservé{(' jusqu au ' + jour) if jour else ''} - réactivation en un clic")


def releve_affilie_html(nom: str, periode: str, montant: float, devise: str, nb: int) -> tuple:
    """Relevé mensuel envoyé à l'apporteur d'affaires : c'est son signal pour
    nous envoyer sa facture. Le virement se fait ensuite hors plateforme.
    Retourne (sujet, html)."""
    salutation = f"Bonjour {_html.escape(nom)}," if nom else "Bonjour,"
    devise_sym = "€" if (devise or "EUR").upper() == "EUR" else devise
    montant_txt = f"{montant:.2f}".replace(".", ",").removesuffix(",00")
    mois = _html.escape(periode)
    sujet = f"Ton relevé d'affiliation {mois} — {montant_txt} {devise_sym}"
    ventes = "1 vente commissionnée" if nb == 1 else f"{nb} ventes commissionnées"
    inner = f"""<tr><td class="marge" style="padding:14px 32px 26px;">
      <h1 class="titre" style="color:#0f172a;font-size:21px;font-weight:bold;margin:0 0 14px;line-height:1.25;">Ton relevé du mois</h1>
      <p style="color:#334155;font-size:14.5px;line-height:1.65;margin:0 0 22px;">{salutation}</p>
      {_encadre(f"Période {mois}", ventes, f"{montant_txt} {devise_sym}")}
      <p style="color:#334155;font-size:14.5px;line-height:1.65;margin:0 0 20px;">
        Envoie-nous ta facture de ce montant en réponse à cet email, et on lance le virement.
      </p>
      <p style="color:#6b7688;font-size:12.5px;line-height:1.65;margin:0;border-top:1px solid #e9ecf4;padding-top:16px;">
        Le détail de tes commissions est dans ton espace Affiliation. Merci de porter Postorico.
      </p>
      {_signature()}
    </td></tr>"""
    return sujet, _shell(inner, width=480, teinte="succes",
                         apercu=f"{ventes} · {montant_txt} {devise_sym} à facturer")
