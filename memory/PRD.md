# Admin Dashboard Pro - PRD

## Original Problem Statement
Application fullstack de gestion utilisateurs avec authentification JWT:
- Backend: FastAPI + Supabase (adapté de la demande NestJS)
- Frontend: React avec design dark theme
- Pages: Login, Register, Pending, Dashboard (5 sections), Admin

## Architecture
- **Backend**: FastAPI avec Supabase client
- **Frontend**: React + React Router + Tailwind CSS + Shadcn UI
- **Auth**: JWT tokens (7 jours user, 8h admin)
- **Design**: Dark theme avec gradient primaire #5B6CFF → #8A6CFF

## What's Been Implemented (Jan 2026)

### Backend Routes
- ✅ POST /api/auth/register - Inscription (nécessite colonne password_hash)
- ✅ POST /api/auth/login - Connexion utilisateur
- ✅ POST /api/auth/admin-login - Connexion admin
- ✅ GET /api/users/me - Profil utilisateur
- ✅ PATCH /api/users/me - Mise à jour profil
- ✅ GET /api/admin/users - Liste utilisateurs
- ✅ PATCH /api/admin/users/:id/activate - Activer
- ✅ PATCH /api/admin/users/:id/deactivate - Désactiver
- ✅ DELETE /api/admin/users/:id - Supprimer

### Frontend Pages
- ✅ Login (/) - Formulaire email/password + accès admin
- ✅ Register (/register) - Inscription avec validation
- ✅ Pending (/pending) - Message d'attente
- ✅ Dashboard (/dashboard) - 5 sections avec sidebar
- ✅ Admin (/admin) - Gestion utilisateurs avec filtres

### Components
- ✅ Sidebar, Field, ColorField, SectionBlock
- ✅ ProtectedRoute, AdminRoute

## Blockers (P0)
⚠️ **Colonne `password_hash` manquante dans Supabase**
L'inscription échoue car la table users n'a pas cette colonne.

## Next Tasks (P1)
1. Ajouter colonnes manquantes à Supabase (voir README.md)
2. Tester flux complet d'inscription
3. Ajouter fonctionnalité notifications Telegram (optionnel)

## Backlog (P2)
- Ajout photo de profil avec upload
- Export des utilisateurs en CSV
- Logs d'activité admin
