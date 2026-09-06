-- 2026-09-06 : double vérification à la connexion. Appliquée via MCP.
-- Code à 6 chiffres par email sur un appareil inconnu (toujours pour un administrateur),
-- appareils de confiance 30 jours. Voir backend/services/mfa_service.py.
CREATE TABLE IF NOT EXISTS public.codes_connexion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id uuid NOT NULL REFERENCES public.users(telegram_id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expire_le timestamptz NOT NULL,
  tentatives integer NOT NULL DEFAULT 0,
  utilise_le timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS codes_connexion_user_idx ON public.codes_connexion (telegram_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.appareils_confiance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id uuid NOT NULL REFERENCES public.users(telegram_id) ON DELETE CASCADE,
  jeton_hash text NOT NULL UNIQUE,
  libelle text,
  ip text,
  cree_le timestamptz NOT NULL DEFAULT now(),
  vu_le timestamptz,
  expire_le timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS appareils_confiance_user_idx ON public.appareils_confiance (telegram_id);
