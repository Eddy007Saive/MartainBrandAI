-- Montage par l'agent IA : nouveau statut « preparation » (2026-10-11).
-- Avant l'envoi au VPS, Postorico transcrit (POC), coupe les silences et cherche les plans
-- d'illustration ; le travail est « preparation » pendant ce temps. Élargit seulement la règle :
-- aucune ligne existante n'est modifiée.
ALTER TABLE public.travaux_agent_video DROP CONSTRAINT IF EXISTS travaux_agent_video_statut_check;
ALTER TABLE public.travaux_agent_video ADD CONSTRAINT travaux_agent_video_statut_check
  CHECK (statut = ANY (ARRAY['preparation'::text, 'en_attente'::text, 'en_cours'::text, 'termine'::text, 'echec'::text]));
