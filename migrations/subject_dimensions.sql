-- Dimensions d'un sujet (brief actionnable) : objectif / angle / cible / format
-- Chaque sujet généré porte ces 4 dimensions => le générateur de contenu s'en sert
-- comme brief (voir agent_service.brief_dimensions / DIMENSIONS).
-- Appliqué manuellement (pas de migration runner) — colonne déjà présente en prod.

ALTER TABLE brouillons ADD COLUMN IF NOT EXISTS dimensions jsonb;
