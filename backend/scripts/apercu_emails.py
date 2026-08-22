# -*- coding: utf-8 -*-
"""Une page unique qui montre les huit emails, sans dependance a cote.

Usage (depuis backend/, venv actif) : python scripts/apercu_emails.py
Puis ouvrir _design/emails/index.html.

Chaque email est injecte dans son iframe via `srcdoc` plutot que par un
`src` vers un fichier voisin : le fichier s'ouvre alors d'un double-clic
depuis n'importe ou, et se transmet par email ou par messagerie sans casser.

Au-dessus de chaque rendu : le destinataire, l'objet et le texte d'apercu.
C'est ce que voit quelqu'un AVANT d'ouvrir — et donc ce qui decide s'il ouvre.
"""
import html as H
import io
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from services import mail_service as M

RACINE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SORTIE = os.path.join(RACINE, "_design", "emails")
os.makedirs(SORTIE, exist_ok=True)

LIEN = "https://postorico.com/reset-password?token=8f2c9a1e-4b7d-11f0-9cd2"
ADMIN = "https://postorico.com/admin?s=audits&id=42"

CAS = []


def cas(nom, titre, dest, sujet, html, hauteur=560):
    CAS.append(dict(nom=nom, titre=titre, dest=dest, sujet=sujet,
                    html=html, hauteur=hauteur))
    io.open(os.path.join(SORTIE, nom + ".html"), "w", encoding="utf-8").write(html)


cas("mot-de-passe", "Mot de passe oublié", "client",
    "Réinitialisation de ton mot de passe Postorico",
    M.reset_email_html("Martin", LIEN))

s, h = M.facture_html("Martin", 279.0, "EUR", "Abonnement Pro — septembre 2026",
                      numero="F-2026-0184",
                      url="https://invoice.stripe.com/i/acct_1/test",
                      pdf="https://invoice.stripe.com/i/acct_1/test.pdf")
cas("facture", "Facture après paiement", "client", s, h, 700)

cas("deconnexion", "Réseau déconnecté", "client",
    "Ton compte LinkedIn s'est déconnecté",
    M.account_disconnected_html("Martin", "linkedin",
                                "https://postorico.com/dashboard/parametres?s=connections"),
    690)

s, h = M.releve_affilie_html("Camille", "août 2026", 167.4, "EUR", 3)
cas("releve-affiliation", "Relevé d'affiliation", "partenaire", s, h, 700)

cas("reponse-audit", "Réponse à un lead", "prospect",
    "Votre audit de marque — Menuiserie Delorme",
    M.audit_reply_html(
        "Menuiserie Delorme",
        "Merci pour votre demande, j'ai regardé vos comptes hier soir.\n\n"
        "Deux choses ressortent tout de suite. Votre page Instagram montre de "
        "très beaux chantiers, mais rien depuis le 14 mai : c'est le point le "
        "plus coûteux, parce que quelqu'un qui tombe dessus aujourd'hui vous "
        "croit à l'arrêt. Et votre fiche Google n'a aucune photo, alors que "
        "c'est le premier endroit où vos clients vous cherchent.\n\n"
        "Je vous propose vingt minutes cette semaine pour vous montrer à quoi "
        "ressemblerait votre feed dans un mois. Jeudi 14h vous irait ?"),
    720)

cas("audit-recu", "Audit reçu (interne)", "admin",
    "Nouvel audit — Menuiserie Delorme",
    M.audit_notification_html(
        "Menuiserie Delorme", "contact@menuiserie-delorme.fr",
        "Secteur : artisanat / menuiserie sur mesure\n"
        "Réseaux : Instagram (340 abonnés), Facebook (1 200), fiche Google\n"
        "Dernière publication : 14 mai 2026\n"
        "Objectif déclaré : « trouver des chantiers de rénovation haut de gamme »\n"
        "Budget indiqué : 200 à 400 € / mois",
        ADMIN),
    700)

s, h = M.admin_payment_html("new_sub", "Martin Dumoulin", "martin@exemple.fr",
                            "Abonnement Pro — 279 € / mois")
cas("paiement-nouvel-abo", "Nouvel abonnement (interne)", "admin", s, h, 520)

s, h = M.admin_payment_html("payment_failed", "Sofia Marchetti", "sofia@exemple.fr",
                            "Échec du prélèvement du 22 août — 279 €")
cas("paiement-echoue", "Paiement échoué (interne)", "admin", s, h, 520)

TEINTE = {"client": "#3AFFA3", "prospect": "#8A6CFF",
          "admin": "#f59e0b", "partenaire": "#7fd7d0"}

cartes = []
for c in CAS:
    texte = M._html_to_text(c["html"])
    ligne = next((l for l in texte.split("\n") if len(l.strip()) > 25), "")[:95]
    cartes.append(
        '<figure class="cas">'
        '<figcaption>'
        '<span class="tag" style="--t:{t}">{dest}</span>'
        '<b>{titre}</b>'
        '<span class="objet">{sujet}</span>'
        '<span class="apercu">{apercu}…</span>'
        '</figcaption>'
        '<iframe title="{titre}" style="height:{h}px" srcdoc="{doc}"></iframe>'
        '</figure>'.format(
            t=TEINTE[c["dest"]], dest=c["dest"], titre=H.escape(c["titre"]),
            sujet=H.escape(c["sujet"]), apercu=H.escape(ligne),
            h=c["hauteur"], doc=H.escape(c["html"], quote=True)))

PAGE = """<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Postorico — gabarits d'email</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{--bg:#020617;--ink:#e8edf6;--muted:#93a1b8;--dim:#5b6a82;--ligne:rgba(255,255,255,.08)}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
       font:400 15px/1.6 Inter,system-ui,sans-serif;padding:52px 32px 90px}
  header{max-width:1240px;margin:0 auto 16px}
  h1{font:700 34px/1.15 Sora,sans-serif;letter-spacing:-.02em;margin:0 0 12px}
  header p{color:var(--muted);max-width:66ch;margin:0 0 14px;text-wrap:pretty}
  .legende{display:flex;gap:18px;flex-wrap:wrap;max-width:1240px;margin:0 auto 40px;
           padding-top:18px;border-top:1px solid var(--ligne);font-size:12.5px;color:var(--dim)}
  .legende span{display:inline-flex;align-items:center;gap:7px}
  .puce{width:9px;height:3px;border-radius:2px;display:inline-block}
  .grille{max-width:1240px;margin:0 auto;display:grid;gap:26px;
          grid-template-columns:repeat(auto-fill,minmax(330px,1fr))}
  .cas{margin:0;border:1px solid var(--ligne);border-radius:16px;overflow:hidden;background:#0b1120}
  figcaption{padding:15px 18px;border-bottom:1px solid var(--ligne);display:grid;gap:3px}
  .tag{justify-self:start;font:600 10px/1 Inter,sans-serif;letter-spacing:.12em;
       text-transform:uppercase;color:var(--t);border:1px solid var(--t);
       padding:4px 9px;border-radius:99px;margin-bottom:5px;opacity:.9}
  figcaption b{font:600 15px/1.35 Sora,sans-serif}
  .objet{font-size:12.5px;color:var(--ink)}
  .apercu{font-size:11.5px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  iframe{display:block;width:100%;border:0;background:#020617}
</style></head>
<body>
  <header>
    <h1>Gabarits d'email</h1>
    <p>Les huit emails que Postorico envoie, rendus avec des données d'exemple.
       Au-dessus de chacun : le destinataire, l'objet et le texte d'aperçu —
       c'est-à-dire tout ce que voit quelqu'un avant d'ouvrir, et donc ce qui
       décide s'il ouvre.</p>
    <p>La barre de couleur en tête de carte donne le registre du message.
       Elle remplace l'emoji qu'on mettait dans les titres.</p>
  </header>
  <div class="legende">
    <span><i class="puce" style="background:#6A5CFF"></i> neutre — information, action à faire</span>
    <span><i class="puce" style="background:#3AFFA3"></i> succès — paiement reçu, lead entrant</span>
    <span><i class="puce" style="background:#f59e0b"></i> alerte — quelque chose est en pause</span>
    <span><i class="puce" style="background:#ef4444"></i> fin — résiliation, échec définitif</span>
  </div>
  <div class="grille">__CARTES__</div>
</body></html>""".replace("__CARTES__", "".join(cartes))

chemin = os.path.join(SORTIE, "index.html")
io.open(chemin, "w", encoding="utf-8").write(PAGE)
print("galerie : %s  (%d Ko)" % (chemin, len(PAGE) // 1024))
for c in CAS:
    print("  %-22s %-11s" % (c["nom"], c["dest"]))
