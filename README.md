# Admin Dashboard Pro

Application fullstack de gestion d'utilisateurs avec authentification JWT.

## Configuration Supabase

Exécutez ce SQL dans l'éditeur SQL de Supabase pour créer la table `users`:

```sql
-- Créer la table users
CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT PRIMARY KEY,
  nom TEXT NOT NULL,
  username TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  actif BOOLEAN DEFAULT FALSE,
  photo_url TEXT,
  use_photo BOOLEAN DEFAULT FALSE,
  user_name TEXT,
  style_vestimentaire TEXT,
  sexe TEXT CHECK (sexe IN ('homme', 'femme', 'autre')),
  couleur_principale TEXT DEFAULT '#003D2E',
  couleur_secondaire TEXT DEFAULT '#0077FF',
  couleur_accent TEXT DEFAULT '#3AFFA3',
  api_key_openrouter TEXT,
  api_key_gemini TEXT,
  api_key_openai TEXT,
  late_profile_id TEXT,
  late_account_linkedin TEXT,
  late_account_instagram TEXT,
  late_account_facebook TEXT,
  late_account_tiktok TEXT,
  gpt_url_linkedin TEXT,
  gpt_url_instagram TEXT,
  gpt_url_sujets TEXT,
  gpt_url_default TEXT,
  telegram_bot_token TEXT,
  telegram_bot_username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activer RLS (Row Level Security) pour la sécurité
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre les opérations depuis le backend
CREATE POLICY "Enable all operations for service role" ON users
  FOR ALL USING (true);

-- Index sur email pour les requêtes de login
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_actif ON users(actif);
```

## Accès Admin

- Mot de passe admin par défaut: `admin123`
- Modifiez `ADMIN_PASSWORD` dans `/app/backend/.env` pour la production

## Routes API

- `POST /api/auth/register` - Inscription utilisateur
- `POST /api/auth/login` - Connexion utilisateur
- `POST /api/auth/admin-login` - Connexion admin
- `GET /api/users/me` - Profil utilisateur
- `PATCH /api/users/me` - Mise à jour profil
- `GET /api/admin/users` - Liste utilisateurs (admin)
- `PATCH /api/admin/users/:id/activate` - Activer utilisateur (admin)
- `PATCH /api/admin/users/:id/deactivate` - Désactiver utilisateur (admin)
- `DELETE /api/admin/users/:id` - Supprimer utilisateur (admin)
