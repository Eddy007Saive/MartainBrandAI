# Postorico

**Studio de contenu IA pour dirigeants** — un produit [GoodTime BNB](https://gt-bnb.com).

Nos experts calibrent un studio de contenu sur la voix de chaque client ; ensuite le client génère,
valide et publie ses posts, visuels, carrousels, stories et reels sur 6 réseaux (LinkedIn, Instagram,
Facebook, TikTok, YouTube, Google Business) — en ~2 h par mois.

## Stack

| Couche | Techno |
|---|---|
| Frontend | React 19 (CRA + CRACO), shadcn/ui, Tailwind — déployé sur Vercel |
| Backend | FastAPI (Python), déployé sur Railway (Docker, image Playwright) |
| Base de données | Supabase PostgreSQL (client Python direct, pas Supabase Auth) |
| Paiements | Stripe (abonnements + webhook `/api/billing/webhook`) |
| Publication sociale | Zernio/Late (API directe + webhooks d'événements) |
| Médias | Cloudinary (images, carrousels, vidéos) |
| IA | Claude (génération de contenu/scripts), OpenRouter nano-banana (images) |
| Vidéo | Submagic (sous-titrage Studio Vidéo) · Remotion (reels animés à la charte, `backend/remotion/`) |
| Emails | Resend (mot de passe oublié, notifications admin, réponses leads) |

## Démarrage local

```bash
# Backend (port 8000) — activer le venv d'abord
cd backend
.\venv\Scripts\Activate.ps1
uvicorn server:app          # SANS --reload (le rendu carrousels/reels lance des sous-processus)

# Frontend (port 3000)
cd frontend
yarn start
```

Variables d'environnement : `backend/.env` (Supabase, JWT, Stripe, Zernio, Cloudinary, Resend,
Claude/OpenRouter, Turnstile…) et `REACT_APP_BACKEND_URL` côté frontend. Aucune valeur n'est
committée — voir les noms attendus dans `backend/config.py`.

## Fonctionnalités principales

- **Studio IA** : réserve de sujets calibrés sur la marque → posts rédigés dans le ton du client →
  validation en un clic (rien ne part sans validation).
- **Visuels & carrousels** : images IA à la charte (couleurs, logo, templates), carrousels rendus
  pixel-perfect (Playwright) avec retouche live avant validation.
- **Reels animés** (Remotion) : un post devient un reel MP4 vertical à la charte — hook mot à mot,
  preuves animées, outro CTA (`POST /api/reels/generer`).
- **Planification** : jours/heure par réseau, créneaux automatiques ; le statut « Planifié » est
  posé par l'événement webhook `post.scheduled` de Zernio (source de vérité), avec crons de
  rattrapage et retry officiel des échecs du jour.
- **Recyclage** : republier un contenu sur d'autres réseaux (copies jumelles « À valider »).
- **Commentaires** : inbox unifiée multi-réseaux avec réponse directe.
- **Performance** : impressions, portée, engagement par réseau (analytics Zernio).
- **Stories** image/vidéo (Instagram, Facebook), **HeyGen** (avatar vidéo IA, validation admin),
  **multilingue** (contenus FR/EN/ES + interface détectée depuis le navigateur).
- **Abonnements & quotas** : essai 14 j, plan Pro (Stripe), quotas par type d'action avec report
  du non-consommé d'une période à l'autre.
- **Admin** : validation des inscriptions, fiche client (plan, quotas, bonus), Mode Vision
  (impersonation), emails de notification.

## Base de données

Le schéma vit dans Supabase ; le SQL de référence des tables est dans `sql.md` et les migrations
ponctuelles dans `migrations/`.

> **Note héritage** : la clé primaire des utilisateurs s'appelle encore `telegram_id` pour des
> raisons historiques (v1 avec invitation Telegram), mais elle contient aujourd'hui un **UUID
> interne** — plus aucun lien avec Telegram. L'inscription se fait par le formulaire public
> (`/register`, audit de marque `/audit-marque`) avec approbation admin.

## Déploiement

- **Backend** : Railway, build Docker (`backend/Dockerfile`) — image Playwright + ffmpeg + Node 20
  (rendu Remotion, Chromium de l'image réutilisé). Démarrage : `python server.py`.
- **Frontend** : Vercel (branche `main`). Le flux : travail sur `dev` → merge fast-forward sur
  `main` = mise en production.
- **Stripe** : webhook Live → `https://<backend>/api/billing/webhook` (5 événements abonnement).

## Conventions

Voir `CLAUDE.md` pour l'architecture détaillée (routes → services → Supabase), les conventions de
code et le protocole de test. Interdits notables : ne jamais committer `backend/.env`, ni
`stripe-site/`, ni les fichiers personnels ; textes UI en français.
