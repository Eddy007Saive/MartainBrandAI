-- Multilingue (contenu) : langue de rédaction du contenu généré par l'IA, par client.
-- 'fr' (défaut) | 'en' | 'es' — pilotée depuis Paramètres → Identité.
alter table public.users add column if not exists langue text not null default 'fr';
