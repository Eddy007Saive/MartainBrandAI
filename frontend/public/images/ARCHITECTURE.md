# Fonctionnement des sites (LeCongeloThermique + Punaises-de-Lit 92 / 44 / 77)

> « Avant de modifier quoi que ce soit, je souhaite commencer par comprendre précisément comment les sites sont construits, comment les demandes sont générées et surtout comment les conversions sont actuellement suivies. »

Ce document répond aux trois points, pour les **4 sites**. Il y a **deux architectures distinctes** :

- **LeCongeloThermique.fr** : WordPress + Elementor (site principal, national)
- **Punaises-de-Lit-92 / 44 / 77.fr** : Next.js + FastAPI (structure identique entre les 3, seul change le contenu et les identifiants de suivi)

Tous les sites sont hébergés sur **Hostinger**.

---

## A. LeCongeloThermique.fr (WordPress)

### 1. Comment le site est construit

| Couche | Technologie |
|--------|-------------|
| CMS | WordPress |
| Thème | Hello Elementor personnalisé |
| Builder | Elementor + templates PHP custom (`full-page.php` pour les pages villes) |
| Base de données | MySQL (managée par Hostinger) |
| Cache | LiteSpeed (Hostinger) |
| SEO on-page | Yoast SEO + sitemap Yoast |
| Hébergement | Hostinger |

Structure éditoriale actuelle :

- environ **122 pages villes** réparties sur **30 départements**, générées à partir d'un template v5 unifié (hero photo 280px, bouton WhatsApp sticky mobile, bloc franchisé référent, avis clients géolocalisés, FAQ locale)
- **blog de 29 articles** thématiques (traitement thermique, HUGETRI400, prix, urgences par département)
- **pages hub** : accueil, tarifs, technologie HUGETRI400, FAQ, mentions légales, page franchise
- **règle absolue** : jamais changer un slug. Un projet de recovery SEO est en cours depuis plusieurs mois pour recréer les URLs cassées par un ancien redesign. Toute la stratégie repose sur la préservation des URLs historiques.

### 2. Comment les demandes sont générées

Deux canaux de conversion :

1. **Formulaires Elementor natifs** (devis, contact, rappel) présents sur toutes les pages. Ils envoient un email direct vers la boîte du franchisé référent du département concerné.
2. **Bouton WhatsApp cliquable** présent sur toutes les pages villes en position sticky mobile (numéro 07 85 71 62 07). Le clic ouvre WhatsApp avec un message pré-rempli mentionnant la ville de la page.

Routage des leads par département vers le franchisé référent :

| Départements | Franchisé |
|--------------|-----------|
| 54, 57 | Konrad |
| 67, 68 | Frédéric |
| 25, 70, 90 | Alexandre |
| Autres départements couverts | François Pulicari |

Les demandes **ne sont pas centralisées dans un CRM**. Elles arrivent directement dans la boîte email du franchisé et dans les conversations WhatsApp.

### 3. Comment les conversions sont suivies

- **Google Search Console** : propriété validée, données de position et clics disponibles.
- **Google Analytics 4** : à confirmer, propriété historique.
- **Google Tag Manager** : à confirmer selon les campagnes actives.
- **Pas de call tracking actif** sur le numéro 07 85 71 62 07.
- **Pas de tracking des clics WhatsApp** (à mettre en place via GTM si besoin).
- **Pas de tracking custom des soumissions Elementor** (les envois d'email arrivent, mais l'événement de conversion n'est pas remonté à GA4). Point à consolider.

---

## B. Punaises-de-Lit-92.fr / 44.fr / 77.fr (Next.js + FastAPI)

Les 3 sites sont bâtis sur exactement la **même structure technique**. Seuls changent le contenu, le domaine et les comptes de suivi (voir [Différences par site](#différences-par-site-92--44--77)).

### 1. Comment les sites sont construits

| Couche | Technologie |
|--------|-------------|
| Frontend | Next.js (App Router, React 19), TypeScript, Tailwind CSS |
| Backend / API | FastAPI (Python) + MongoDB |
| Email transactionnel | Resend |
| Hébergement frontend | Hostinger |
| Suivi / Analytics | Google Tag Manager + Google Analytics 4 |

**Frontend** : application **Next.js (App Router)** en rendu SSR/SSG (nécessite un environnement Node côté hébergement). Les routes sont organisées en deux univers visuels : `(main)` pour les pages claires (accueil, tarifs, technologie, urgence, devis, FAQ...) et `(dark)` pour les guides et interventions. S'ajoutent des **pages villes générées dynamiquement par slug** (`ville/[slug]`), c'est le SEO local programmatique.

**Contenu** : le contenu éditorial et local n'est pas codé en dur. Il vit dans des fichiers de données centralisés, rendus par des gabarits dynamiques (`CityTemplate`, `ArticleTemplate`, `InterventionTemplate`). C'est ce qui permet de produire une page par ville, par article et par intervention.

**Backend** : API FastAPI (`backend/server.py`) qui reçoit les formulaires, stocke les demandes en MongoDB et expose aussi les fichiers SEO dynamiques (`/api/sitemap.xml`, `/api/robots.txt`).

**Sécurité** : en-têtes de sécurité appliqués sur toutes les pages via `next.config.ts` (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).

### 2. Comment les demandes sont générées

1. L'internaute remplit un formulaire :
   - **Devis** (`QuickQuoteForm`) en 3 étapes : type de logement puis niveau d'infestation puis coordonnées.
   - **Rappel** (`CallbackForm`).
2. Le formulaire envoie les données à l'API backend (`POST /api/quote-request` ou `/api/callback-request`).
3. Le backend **enregistre la demande en base MongoDB** et **envoie un email de notification via Resend** vers l'adresse de contact du site.

Les demandes restent donc consultables à deux endroits : la base MongoDB et la boîte email de contact.

### 3. Comment les conversions sont suivies

- **Google Tag Manager** et **Google Analytics 4** sont chargés sur **toutes les pages** (injectés dans `frontend_next/app/layout.tsx`).
- Identifiants du **92** : **GTM `GTM-P7BFJRDV`**, **GA4 `G-RCKR7SXRX5`**.
- Les identifiants du 44 et du 77 sont propres à chaque site.
- Les événements de soumission de formulaires peuvent être branchés directement dans GTM (les endpoints API et les composants formulaire sont uniformes, ce qui facilite un dataLayer.push standardisé).

### Différences par site (92 / 44 / 77)

Tout le reste étant identique, seuls ces éléments changent entre 92, 44 et 77 :

| Élément | Varie selon le site |
|---------|---------------------|
| Domaine | `punaises-de-lit-92.fr` / `-44.fr` / `-77.fr` |
| Contenu (villes, articles) | Oui |
| Adresse email de contact (destinataire Resend) | Oui |
| Identifiants GTM / GA4 / Search Console | Oui |
| Base MongoDB | Oui |

---

## Récapitulatif : où trouver quoi

| Question | LeCongeloThermique | Punaises-de-Lit 92 / 44 / 77 |
|----------|--------------------|-----------------------------|
| Stack | WordPress + Elementor + Hello Elementor | Next.js + FastAPI + MongoDB |
| Hébergement | Hostinger | Hostinger (front) |
| Où sont les demandes | Boîte email franchisé + WhatsApp | MongoDB + boîte email contact (via Resend) |
| Analytics | GSC + GA4 (à confirmer) + pas de call tracking | GTM + GA4 sur toutes les pages |
| Formulaires | Elementor natif | `QuickQuoteForm` + `CallbackForm` (Next.js) |
| Routage leads | Par département vers franchisé | Adresse email unique par site |
| CRM | Aucun | Aucun |

---

