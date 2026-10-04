-- 2026-10-03 : design du carrousel dessine/retouche par le client dans l'editeur integre
-- (JSON de l'editeur : pages, elements, fonds), pour pouvoir le rouvrir et continuer.
ALTER TABLE contenu ADD COLUMN IF NOT EXISTS carrousel_design jsonb;
