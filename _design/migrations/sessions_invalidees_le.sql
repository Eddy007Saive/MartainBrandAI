-- Révocation des jetons à la déconnexion : tout JWT dont l'iat est antérieur à cette
-- date est refusé (backend/dependencies.py::verify_token, postorico JwtAuthGuard).
-- Appliquée sur Supabase le 2026-10-05.
ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_invalidees_le timestamptz;
COMMENT ON COLUMN users.sessions_invalidees_le IS 'Tout jeton émis (iat) avant cette date est refusé : posé à la déconnexion.';
