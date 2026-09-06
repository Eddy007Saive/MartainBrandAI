-- 2026-09-06 : connexion « Continuer avec Google ». Appliquée via MCP.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS google_sub text;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_key ON public.users (google_sub) WHERE google_sub IS NOT NULL;
